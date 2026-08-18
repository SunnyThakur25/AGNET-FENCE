import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { agents, endpointAgentBindings, endpointContainments, managedEndpoints, runtimeCredentials, teamMemberships, teams, users } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { safeContainmentReason } from "../agentfence/incidentContainment";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const endpointStatus = z.enum(["registered", "healthy", "degraded", "offline", "isolated"]);
const endpointOs = z.enum(["windows", "macos", "linux"]);
const bindingKind = z.enum(["sdk", "browser_wrapper", "native_mcp"]);

async function requireAdmin(organizationId: number, userId: number) {
  return requireOrganizationRole(organizationId, userId, ["admin"]);
}

function insertId(result: unknown, entity: string) {
  const header = Array.isArray(result) ? result[0] as { insertId?: number } : result as { insertId?: number };
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id < 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${entity} could not be created.` });
  return id;
}

export const endpointOperationsRouter = router({
  overview: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    const currentMembership = await requireOrganizationMembership(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

    const [endpoints, agentsInOrg, memberships, activeContainments] = await Promise.all([
      db.select({ endpoint: managedEndpoints, teamName: teams.name, ownerName: users.name, ownerEmail: users.email }).from(managedEndpoints).leftJoin(teams, eq(managedEndpoints.teamId, teams.id)).leftJoin(users, eq(managedEndpoints.ownerUserId, users.id)).where(eq(managedEndpoints.organizationId, input.organizationId)).orderBy(desc(managedEndpoints.updatedAt)),
      db.select({ id: agents.id, name: agents.name, identity: agents.identity, status: agents.status, riskLevel: agents.riskLevel, environment: agents.environment }).from(agents).where(eq(agents.organizationId, input.organizationId)).orderBy(agents.name),
      db.select({ membershipId: teamMemberships.id, teamId: teamMemberships.teamId, userId: teamMemberships.userId, role: teamMemberships.role, teamName: teams.name, name: users.name, email: users.email }).from(teamMemberships).innerJoin(teams, eq(teamMemberships.teamId, teams.id)).innerJoin(users, eq(teamMemberships.userId, users.id)).where(eq(teamMemberships.organizationId, input.organizationId)).orderBy(users.name),
      db.select({ containment: endpointContainments, endpointName: managedEndpoints.displayName, deviceIdentity: managedEndpoints.deviceIdentity }).from(endpointContainments).innerJoin(managedEndpoints, eq(endpointContainments.endpointId, managedEndpoints.id)).where(and(eq(endpointContainments.organizationId, input.organizationId), eq(endpointContainments.status, "active"))).orderBy(desc(endpointContainments.createdAt)),
    ]);
    const endpointIds = endpoints.map(row => row.endpoint.id);
    const bindings = endpointIds.length ? await db.select({ binding: endpointAgentBindings, agentName: agents.name, agentIdentity: agents.identity }).from(endpointAgentBindings).innerJoin(agents, eq(endpointAgentBindings.agentId, agents.id)).where(and(eq(endpointAgentBindings.organizationId, input.organizationId), inArray(endpointAgentBindings.endpointId, endpointIds))).orderBy(desc(endpointAgentBindings.createdAt)) : [];
    const isolatedIds = new Set(activeContainments.map(row => row.containment.endpointId));
    return {
      endpoints: endpoints.map(row => ({ ...row.endpoint, teamName: row.teamName, ownerName: row.ownerName, ownerEmail: row.ownerEmail, containmentActive: isolatedIds.has(row.endpoint.id) })),
      bindings: bindings.map(row => ({ ...row.binding, agentName: row.agentName, agentIdentity: row.agentIdentity })),
      agents: agentsInOrg,
      members: memberships,
      activeContainments: activeContainments.map(row => ({ ...row.containment, endpointName: row.endpointName, deviceIdentity: row.deviceIdentity })),
      summary: {
        endpoints: endpoints.length,
        healthy: endpoints.filter(row => row.endpoint.sensorStatus === "healthy").length,
        readinessOnly: endpoints.filter(row => row.endpoint.sensorStatus === "registered").length,
        isolated: activeContainments.length,
        bindings: bindings.filter(row => row.binding.enabled).length,
      },
      currentRole: currentMembership.role,
      deploymentBoundary: "Endpoint Sensor is a customer-managed deployment readiness control in this release. AgentFence records approved endpoint metadata, explicit SDK/browser-wrapper/Native MCP bindings, and isolation evidence. It does not collect prompts, page content, raw process arguments, device secrets, or unrelated process telemetry; no endpoint binary, MDM package, or host-wide control is delivered by this control-plane release.",
      containmentBoundary: "Endpoint isolation disables the endpoint’s explicitly bound AgentFence integrations and revokes active AgentFence runtime credentials for the bound workloads. It does not quarantine the host, uninstall software, control arbitrary unmanaged applications, or stop direct calls that bypass AgentFence.",
    };
  }),
  create: protectedProcedure.input(organizationInput.extend({ displayName: z.string().trim().min(2).max(120), deviceIdentity: z.string().trim().regex(/^[A-Za-z0-9._:-]{3,160}$/), operatingSystem: endpointOs, teamId: z.number().int().positive().nullable(), ownerMembershipId: z.number().int().positive().nullable(), deploymentReference: z.string().trim().max(255).nullable() })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    if (input.teamId) {
      const [team] = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.organizationId, input.organizationId))).limit(1);
      if (!team) throw new TRPCError({ code: "FORBIDDEN", message: "Endpoint team must belong to this organization." });
    }
    let ownerUserId: number | null = null;
    if (input.ownerMembershipId) {
      const [membership] = await db.select().from(teamMemberships).where(and(eq(teamMemberships.id, input.ownerMembershipId), eq(teamMemberships.organizationId, input.organizationId))).limit(1);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Endpoint owner must be a member of this organization." });
      ownerUserId = membership.userId;
    }
    try {
      const endpointId = insertId(await db.insert(managedEndpoints).values({ organizationId: input.organizationId, displayName: input.displayName, deviceIdentity: input.deviceIdentity, operatingSystem: input.operatingSystem, teamId: input.teamId, ownerUserId, deploymentReference: input.deploymentReference, createdBy: ctx.user.id }), "Endpoint record");
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "endpoint.registered", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { endpointId, operatingSystem: input.operatingSystem, hasTeam: Boolean(input.teamId), hasOwner: Boolean(ownerUserId), hasDeploymentReference: Boolean(input.deploymentReference) } });
      return { endpointId };
    } catch (error) {
      if (error instanceof Error && /duplicate|unique/i.test(error.message)) throw new TRPCError({ code: "CONFLICT", message: "This endpoint identity is already registered in this organization." });
      throw error;
    }
  }),
  bindAgent: protectedProcedure.input(organizationInput.extend({ endpointId: z.number().int().positive(), agentId: z.number().int().positive(), kind: bindingKind })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [[endpoint], [agent]] = await Promise.all([
      db.select().from(managedEndpoints).where(and(eq(managedEndpoints.id, input.endpointId), eq(managedEndpoints.organizationId, input.organizationId))).limit(1),
      db.select().from(agents).where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId))).limit(1),
    ]);
    if (!endpoint || !agent) throw new TRPCError({ code: "NOT_FOUND", message: "Endpoint and agent must both exist in this organization." });
    try {
      const bindingId = insertId(await db.insert(endpointAgentBindings).values({ organizationId: input.organizationId, endpointId: input.endpointId, agentId: input.agentId, kind: input.kind, createdBy: ctx.user.id }), "Endpoint binding");
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "endpoint.agent_bound", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, agentId: input.agentId, outcome: "allowed", payload: { endpointId: input.endpointId, bindingId, kind: input.kind } });
      return { bindingId };
    } catch (error) {
      if (error instanceof Error && /duplicate|unique/i.test(error.message)) throw new TRPCError({ code: "CONFLICT", message: "This endpoint is already bound to this agent through this integration path." });
      throw error;
    }
  }),
  isolate: protectedProcedure.input(organizationInput.extend({ endpointId: z.number().int().positive(), reason: z.string().trim().min(8).max(500) })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [endpoint] = await db.select().from(managedEndpoints).where(and(eq(managedEndpoints.id, input.endpointId), eq(managedEndpoints.organizationId, input.organizationId))).limit(1);
    if (!endpoint) throw new TRPCError({ code: "NOT_FOUND", message: "Endpoint was not found in this organization." });
    const [existing] = await db.select().from(endpointContainments).where(and(eq(endpointContainments.organizationId, input.organizationId), eq(endpointContainments.endpointId, input.endpointId), eq(endpointContainments.status, "active"))).limit(1);
    if (existing) return { containmentId: existing.id, created: false, revokedCredentials: 0 };
    const bindings = await db.select().from(endpointAgentBindings).where(and(eq(endpointAgentBindings.organizationId, input.organizationId), eq(endpointAgentBindings.endpointId, input.endpointId), eq(endpointAgentBindings.enabled, true)));
    const agentIds = Array.from(new Set(bindings.map(binding => binding.agentId)));
    const reason = safeContainmentReason(input.reason);
    const containmentId = insertId(await db.insert(endpointContainments).values({ organizationId: input.organizationId, endpointId: input.endpointId, status: "active", reason, initiatedBy: ctx.user.id }), "Endpoint containment");
    await db.update(managedEndpoints).set({ sensorStatus: "isolated" }).where(and(eq(managedEndpoints.id, input.endpointId), eq(managedEndpoints.organizationId, input.organizationId)));
    await db.update(endpointAgentBindings).set({ enabled: false }).where(and(eq(endpointAgentBindings.organizationId, input.organizationId), eq(endpointAgentBindings.endpointId, input.endpointId)));
    let revokedCredentials = 0;
    if (agentIds.length) {
      const result = await db.update(runtimeCredentials).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(runtimeCredentials.organizationId, input.organizationId), inArray(runtimeCredentials.agentId, agentIds), eq(runtimeCredentials.status, "active")));
      revokedCredentials = Number((Array.isArray(result) ? result[0] : result).affectedRows ?? 0);
    }
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "endpoint.isolated", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "blocked", payload: { endpointId: input.endpointId, containmentId, disabledBindings: bindings.length, boundAgents: agentIds.length, revokedCredentials, reason } });
    return { containmentId, created: true, disabledBindings: bindings.length, revokedCredentials };
  }),
  release: protectedProcedure.input(organizationInput.extend({ containmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [containment] = await db.select().from(endpointContainments).where(and(eq(endpointContainments.id, input.containmentId), eq(endpointContainments.organizationId, input.organizationId), eq(endpointContainments.status, "active"))).limit(1);
    if (!containment) throw new TRPCError({ code: "NOT_FOUND", message: "Active endpoint containment was not found in this organization." });
    await db.update(endpointContainments).set({ status: "released", releasedAt: new Date(), releasedBy: ctx.user.id }).where(eq(endpointContainments.id, containment.id));
    await db.update(managedEndpoints).set({ sensorStatus: "registered" }).where(and(eq(managedEndpoints.id, containment.endpointId), eq(managedEndpoints.organizationId, input.organizationId)));
    await db.update(endpointAgentBindings).set({ enabled: true }).where(and(eq(endpointAgentBindings.organizationId, input.organizationId), eq(endpointAgentBindings.endpointId, containment.endpointId)));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "endpoint.isolation_released", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { endpointId: containment.endpointId, containmentId: containment.id, credentialReissueRequired: true } });
    return { success: true, credentialReissueRequired: true };
  }),
});
