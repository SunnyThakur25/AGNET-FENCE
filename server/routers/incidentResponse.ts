import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { agentContainments, agents, incidentResponseSettings, incidentRoutingProfiles, notifications, teamMemberships, teams, toolCalls, users } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { containAgent, safeContainmentReason } from "../agentfence/incidentContainment";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { inspectAndRedact } from "../agentfence/dataGuard";
import { isVaultPathForOrganization } from "../agentfence/vaultContract";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const incidentFilterInput = organizationInput.extend({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  severity: z.enum(["all", "high", "critical"]).default("all"),
  agentId: z.number().int().positive().optional(),
  decision: z.enum(["all", "blocked", "approval_required", "allowed"]).default("all"),
  sort: z.enum(["newest", "oldest", "agent", "severity"]).default("newest"),
});
const membershipRole = z.enum(["admin", "operator", "viewer", "billing_admin"]);

function safeReference(value: string | undefined) {
  if (!value?.trim()) return null;
  const inspected = inspectAndRedact({ reference: value.trim() });
  const result = inspected.redactedValue as { reference?: unknown };
  return typeof result.reference === "string" ? result.reference.slice(0, 500) : null;
}

function dateAtStart(value: string | undefined, fallback: Date) {
  return value ? new Date(`${value}T00:00:00.000Z`) : fallback;
}

function dateAtEnd(value: string | undefined, fallback: Date) {
  return value ? new Date(`${value}T23:59:59.999Z`) : fallback;
}

async function requireAdmin(organizationId: number, userId: number) {
  await requireOrganizationRole(organizationId, userId, ["admin"]);
}

export const incidentResponseRouter = router({
  monitor: protectedProcedure.input(incidentFilterInput).query(async ({ ctx, input }) => {
    await requireOrganizationMembership(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const defaultSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since = dateAtStart(input.dateFrom, defaultSince);
    const until = dateAtEnd(input.dateTo, new Date());
    if (since > until) throw new TRPCError({ code: "BAD_REQUEST", message: "The incident date range is invalid." });
    const actionConditions = [eq(toolCalls.organizationId, input.organizationId), gte(toolCalls.createdAt, since), lte(toolCalls.createdAt, until), or(inArray(toolCalls.riskLevel, ["high", "critical"]), eq(toolCalls.decision, "blocked"))];
    const alertConditions = [eq(notifications.organizationId, input.organizationId), inArray(notifications.severity, ["high", "critical"]), gte(notifications.createdAt, since), lte(notifications.createdAt, until)];
    if (input.agentId) {
      actionConditions.push(eq(toolCalls.agentId, input.agentId));
      alertConditions.push(eq(notifications.agentId, input.agentId));
    }
    if (input.decision !== "all") actionConditions.push(eq(toolCalls.decision, input.decision));
    if (input.severity !== "all") alertConditions.push(eq(notifications.severity, input.severity));
    const actionOrder = input.sort === "oldest" ? asc(toolCalls.createdAt) : input.sort === "agent" ? asc(agents.name) : input.sort === "severity" ? desc(toolCalls.riskLevel) : desc(toolCalls.createdAt);
    const alertOrder = input.sort === "oldest" ? asc(notifications.createdAt) : input.sort === "agent" ? asc(agents.name) : input.sort === "severity" ? desc(notifications.severity) : desc(notifications.createdAt);
    const [agentRows, highRiskActions, alertRows, containmentRows] = await Promise.all([
      db.select().from(agents).where(eq(agents.organizationId, input.organizationId)),
      db.select({ id: toolCalls.id, agentId: toolCalls.agentId, toolName: toolCalls.toolName, action: toolCalls.action, destination: toolCalls.destination, dataSensitivity: toolCalls.dataSensitivity, riskLevel: toolCalls.riskLevel, decision: toolCalls.decision, createdAt: toolCalls.createdAt, agentName: agents.name, agentIdentity: agents.identity }).from(toolCalls).innerJoin(agents, eq(toolCalls.agentId, agents.id)).where(and(...actionConditions)).orderBy(actionOrder).limit(80),
      db.select({ id: notifications.id, agentId: notifications.agentId, severity: notifications.severity, title: notifications.title, content: notifications.content, relatedType: notifications.relatedType, relatedId: notifications.relatedId, createdAt: notifications.createdAt, agentName: agents.name }).from(notifications).leftJoin(agents, eq(notifications.agentId, agents.id)).where(and(...alertConditions)).orderBy(alertOrder).limit(50),
      db.select({ id: agentContainments.id, agentId: agentContainments.agentId, status: agentContainments.status, trigger: agentContainments.trigger, reason: agentContainments.reason, relatedToolCallId: agentContainments.relatedToolCallId, createdAt: agentContainments.createdAt, releasedAt: agentContainments.releasedAt, agentName: agents.name, agentIdentity: agents.identity }).from(agentContainments).innerJoin(agents, eq(agentContainments.agentId, agents.id)).where(eq(agentContainments.organizationId, input.organizationId)).orderBy(desc(agentContainments.createdAt)).limit(50),
    ]);
    const activeContainments = containmentRows.filter(row => row.status === "active");
    return {
      windowStart: since,
      summary: {
        registeredAgents: agentRows.length,
        activeAgents: agentRows.filter(agent => agent.status === "active").length,
        pausedAgents: agentRows.filter(agent => agent.status === "paused").length,
        highRiskActions: highRiskActions.length,
        blockedActions: highRiskActions.filter(action => action.decision === "blocked").length,
        activeContainments: activeContainments.length,
        highSeverityAlerts: alertRows.length,
      },
      highRiskActions,
      alerts: alertRows,
      containments: containmentRows,
      agents: agentRows.map(agent => ({ id: agent.id, name: agent.name, identity: agent.identity, status: agent.status, riskLevel: agent.riskLevel, environment: agent.environment })),
      filters: { dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null, severity: input.severity, agentId: input.agentId ?? null, decision: input.decision, sort: input.sort },
      boundary: "This workspace monitors actions that traverse an AgentFence-supported integration path. It cannot observe or contain direct calls that bypass the SDK, managed browser wrapper, or Native MCP Gateway.",
    };
  }),
  settings: router({
    get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [[settings], memberRows, profiles] = await Promise.all([
        db.select().from(incidentResponseSettings).where(eq(incidentResponseSettings.organizationId, input.organizationId)).limit(1),
        db.select({ membershipId: teamMemberships.id, teamId: teams.id, teamName: teams.name, userId: users.id, name: users.name, email: users.email, role: teamMemberships.role }).from(teamMemberships).innerJoin(teams, eq(teamMemberships.teamId, teams.id)).innerJoin(users, eq(teamMemberships.userId, users.id)).where(eq(teamMemberships.organizationId, input.organizationId)),
        db.select().from(incidentRoutingProfiles).where(eq(incidentRoutingProfiles.organizationId, input.organizationId)),
      ]);
      return {
        autoContainCriticalBlocks: settings?.autoContainCriticalBlocks ?? false,
        incidentCommanderMembershipId: settings?.incidentCommanderMembershipId ?? null,
        containmentRunbookReference: settings?.containmentRunbookReference ?? null,
        approvalEscalationMinutes: settings?.approvalEscalationMinutes ?? 60,
        members: memberRows,
        routingProfiles: ["slack", "pagerduty"].map(provider => {
          const profile = profiles.find(item => item.provider === provider);
          return { provider, status: profile?.status ?? "disabled", ownerMembershipId: profile?.ownerMembershipId ?? null, destinationReference: profile?.destinationReference ?? null, hasVaultReference: Boolean(profile?.vaultSecretPath), updatedAt: profile?.updatedAt ?? null };
        }),
        detail: "When enabled, only a critical-risk governed action that is already blocked triggers automatic agent containment. The agent is paused and active runtime credentials are revoked; new credentials are required after release.",
        routingBoundary: "Slack and PagerDuty routing metadata identifies accountable owners and safe destination references only. Live delivery remains disabled until customer-controlled credentials are stored in the approved tenant Vault path and a production routing implementation is activated.",
      };
    }),
    update: protectedProcedure.input(organizationInput.extend({ autoContainCriticalBlocks: z.boolean(), containmentRunbookReference: z.string().trim().max(500).nullable().optional(), approvalEscalationMinutes: z.number().int().min(5).max(10_080) })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const safeRunbook = input.containmentRunbookReference === undefined ? undefined : safeReference(input.containmentRunbookReference ?? undefined);
      const [current] = await db.select().from(incidentResponseSettings).where(eq(incidentResponseSettings.organizationId, input.organizationId)).limit(1);
      const values = { autoContainCriticalBlocks: input.autoContainCriticalBlocks, containmentRunbookReference: safeRunbook === undefined ? current?.containmentRunbookReference ?? null : safeRunbook, approvalEscalationMinutes: input.approvalEscalationMinutes, updatedBy: ctx.user.id };
      await db.insert(incidentResponseSettings).values({ organizationId: input.organizationId, ...values }).onDuplicateKeyUpdate({ set: values });
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "incident.response_settings_changed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { autoContainCriticalBlocks: input.autoContainCriticalBlocks, hasRunbookReference: Boolean(values.containmentRunbookReference), approvalEscalationMinutes: input.approvalEscalationMinutes } });
      return { success: true };
    }),
    assignCommander: protectedProcedure.input(organizationInput.extend({ membershipId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [membership] = await db.select().from(teamMemberships).where(and(eq(teamMemberships.id, input.membershipId), eq(teamMemberships.organizationId, input.organizationId))).limit(1);
      if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "Incident commander membership was not found in this organization." });
      if (membership.role !== "admin") await db.update(teamMemberships).set({ role: "admin" }).where(eq(teamMemberships.id, membership.id));
      await db.insert(incidentResponseSettings).values({ organizationId: input.organizationId, incidentCommanderMembershipId: membership.id, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { incidentCommanderMembershipId: membership.id, updatedBy: ctx.user.id } });
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "incident.commander_assigned", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { membershipId: membership.id, teamId: membership.teamId, promotedToAdmin: membership.role !== "admin" } });
      return { success: true, promotedToAdmin: membership.role !== "admin" };
    }),
    saveRoutingProfile: protectedProcedure.input(organizationInput.extend({ provider: z.enum(["slack", "pagerduty"]), status: z.enum(["disabled", "activation_required", "configured"]), ownerMembershipId: z.number().int().positive().nullable(), destinationReference: z.string().trim().max(255).nullable(), vaultSecretPath: z.string().trim().max(255).nullable() })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      if (input.ownerMembershipId) {
        const [owner] = await db.select().from(teamMemberships).where(and(eq(teamMemberships.id, input.ownerMembershipId), eq(teamMemberships.organizationId, input.organizationId))).limit(1);
        if (!owner) throw new TRPCError({ code: "FORBIDDEN", message: "Routing owner must be a member of this organization." });
      }
      const destinationReference = safeReference(input.destinationReference ?? undefined);
      if (input.vaultSecretPath && (!isVaultPathForOrganization(input.vaultSecretPath, input.organizationId) || !input.vaultSecretPath.startsWith(`agentfence/tenants/${input.organizationId}/integrations/incidents/`))) throw new TRPCError({ code: "BAD_REQUEST", message: "Routing Vault references must remain in this organization’s integrations/incidents path." });
      if (input.status === "configured" && (!destinationReference || !input.vaultSecretPath)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A configured routing profile requires a safe destination reference and tenant Vault reference. This does not enable live delivery." });
      await db.insert(incidentRoutingProfiles).values({ organizationId: input.organizationId, provider: input.provider, status: input.status, ownerMembershipId: input.ownerMembershipId, destinationReference, vaultSecretPath: input.vaultSecretPath, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { status: input.status, ownerMembershipId: input.ownerMembershipId, destinationReference, vaultSecretPath: input.vaultSecretPath, updatedBy: ctx.user.id } });
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "incident.routing_profile_changed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { provider: input.provider, status: input.status, ownerMembershipId: input.ownerMembershipId, hasDestinationReference: Boolean(destinationReference), hasVaultReference: Boolean(input.vaultSecretPath), liveDeliveryEnabled: false } });
      return { success: true, detail: "Routing ownership and safe metadata recorded. Live Slack/PagerDuty delivery remains disabled until a customer-controlled integration is activated." };
    }),
  }),
  contain: protectedProcedure.input(organizationInput.extend({ agentId: z.number().int().positive(), reason: z.string().trim().min(8).max(500) })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const result = await containAgent({ organizationId: input.organizationId, agentId: input.agentId, trigger: "manual", reason: safeContainmentReason(input.reason), initiatedBy: ctx.user.id, actorIdentity: ctx.user.email || ctx.user.openId });
    return { ...result, detail: result.created ? "Agent paused and active runtime credentials revoked. This stops AgentFence-supported integrated paths; issue a new credential after an approved release." : "This agent already has an active containment record." };
  }),
  release: protectedProcedure.input(organizationInput.extend({ containmentId: z.number().int().positive(), reason: z.string().trim().min(8).max(500) })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [containment] = await db.select().from(agentContainments).where(and(eq(agentContainments.id, input.containmentId), eq(agentContainments.organizationId, input.organizationId), eq(agentContainments.status, "active"))).limit(1);
    if (!containment) throw new TRPCError({ code: "NOT_FOUND", message: "Active containment record not found in this organization." });
    const releasedAt = new Date();
    const reason = safeContainmentReason(input.reason);
    await db.update(agentContainments).set({ status: "released", releasedBy: ctx.user.id, releasedAt }).where(eq(agentContainments.id, containment.id));
    await db.update(agents).set({ status: "active" }).where(and(eq(agents.id, containment.agentId), eq(agents.organizationId, input.organizationId)));
    await db.insert(notifications).values({ organizationId: input.organizationId, severity: "info", title: "Agent containment released", content: `The agent was restored to active status after review. ${reason} New runtime credentials are required.`, relatedType: "agent_containment", relatedId: containment.id });
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "incident.agent_containment_released", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, agentId: containment.agentId, toolCallId: containment.relatedToolCallId ?? undefined, outcome: "allowed", payload: { containmentId: containment.id, releaseReason: reason, runtimeCredentialReissueRequired: true } });
    return { success: true, detail: "Agent restored to active status. Revoked runtime credentials remain revoked and must be re-issued explicitly." };
  }),
});
