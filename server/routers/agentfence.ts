import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  agents,
  approvals,
  attackSimulations,
  auditEvents,
  dataGuardFindings,
  evidenceExports,
  notifications,
  organizations,
  policies,
  runtimeCredentials,
  runtimeNonces,
  teamMemberships,
  teams,
  toolCalls,
  vaultCredentials,
} from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { isApprovalExpired } from "../agentfence/approvals";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { inspectAndRedact, inspectOutboundAndRedact } from "../agentfence/dataGuard";
import { generatePolicyExplanation, generatePolicyPatternSuggestions } from "../agentfence/llm";
import { evaluatePolicies } from "../agentfence/policyEngine";
import { issueRuntimeToken, scopeAllows, verifyRuntimeToken } from "../agentfence/runtimeAuth";
import { authorizeRuntimeGatewayRequest } from "../agentfence/runtimeGatewayGuard";
import { deriveRuntimeCredentialScope } from "../agentfence/runtimeScope";
import { getOwaspAgenticScenario, OWASP_AGENTIC_TOP10 } from "../../shared/owaspAgentic";
import { isVaultPathForOrganization } from "../agentfence/vaultContract";
import { getVaultConfigurationStatus } from "../agentfence/vaultStatus";
import { createVaultAppRoleClient } from "../agentfence/vaultClient";
import { buildActionTrace } from "../agentfence/actionTrace";
import { aggregateActionSummary } from "../agentfence/actionMetrics";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const dataSensitivity = z.enum(["public", "internal", "pii", "phi", "payment", "secret"]);
const riskLevel = z.enum(["low", "medium", "high", "critical"]);

function insertId(result: unknown) {
  const header = Array.isArray(result) ? (result[0] as { insertId?: number }) : (result as { insertId?: number });
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id < 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A required record could not be created." });
  return id;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "agentfence";
}

async function requireAgentInOrganization(organizationId: number, agentId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const agent = await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId))).limit(1);
  if (!agent[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found in this organization." });
  return agent[0];
}

async function createOperatorNotification(input: {
  organizationId: number;
  severity: "info" | "medium" | "high" | "critical";
  title: string;
  content: string;
  relatedType: string;
  relatedId: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values({
    organizationId: input.organizationId,
    severity: input.severity,
    title: input.title,
    content: input.content,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
  });
  if (input.severity === "high" || input.severity === "critical") {
    await notifyOwner({ title: `AgentFence — ${input.title}`, content: input.content });
  }
}

export const agentfenceRouter = router({
  bootstrap: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

    const currentMembership = await db
      .select({ organizationId: teamMemberships.organizationId })
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, ctx.user.id))
      .limit(1);

    if (currentMembership[0]) return { organizationId: currentMembership[0].organizationId, created: false };

    const workspaceName = `${ctx.user.name || "Security"} Workspace`;
    const uniqueSlug = `${slugify(ctx.user.name || "security")}-${ctx.user.id}-${Date.now().toString(36)}`;
    const organizationId = insertId(await db.insert(organizations).values({ name: workspaceName, slug: uniqueSlug, createdBy: ctx.user.id }));
    const teamId = insertId(await db.insert(teams).values({ organizationId, name: "Security Operations" }));
    await db.insert(teamMemberships).values({ organizationId, teamId, userId: ctx.user.id, role: "admin" });
    await appendAuditEvent({
      organizationId,
      eventType: "organization.created",
      actorType: "user",
      actorIdentity: ctx.user.email || ctx.user.openId,
      outcome: "allowed",
      payload: { workspaceName, team: "Security Operations" },
    });
    return { organizationId, created: true };
  }),

  workspace: router({
    get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [organization] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
      const memberships = await db
        .select({ id: teamMemberships.id, role: teamMemberships.role, teamId: teams.id, teamName: teams.name, userId: teamMemberships.userId })
        .from(teamMemberships)
        .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
        .where(eq(teamMemberships.organizationId, input.organizationId));
      return { organization, memberships };
    }),
  }),

  dashboard: router({
    overview: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const actionWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [agentRows, policyRows, pendingApprovals, recentEvents, guardRows, recentToolCalls] = await Promise.all([
        db.select().from(agents).where(eq(agents.organizationId, input.organizationId)),
        db.select().from(policies).where(and(eq(policies.organizationId, input.organizationId), eq(policies.status, "active"))),
        db.select().from(approvals).where(and(eq(approvals.organizationId, input.organizationId), eq(approvals.status, "pending"))),
        db.select().from(auditEvents).where(eq(auditEvents.organizationId, input.organizationId)).orderBy(desc(auditEvents.createdAt)).limit(8),
        db.select().from(dataGuardFindings).where(eq(dataGuardFindings.organizationId, input.organizationId)),
        db.select({ toolName: toolCalls.toolName, action: toolCalls.action, decision: toolCalls.decision, targetOutcome: toolCalls.targetOutcome }).from(toolCalls).where(and(eq(toolCalls.organizationId, input.organizationId), gte(toolCalls.createdAt, actionWindowStart))).orderBy(desc(toolCalls.createdAt)).limit(500),
      ]);
      return {
        metrics: {
          activeAgents: agentRows.filter(agent => agent.status === "active").length,
          protectedPolicies: policyRows.length,
          pendingApprovals: pendingApprovals.length,
          dataGuardFindings: guardRows.length,
        },
        actionSummary: {
          windowStart: actionWindowStart,
          totalActions: recentToolCalls.length,
          items: aggregateActionSummary(recentToolCalls),
        },
        recentEvents,
      };
    }),
  }),

  agents: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(agents).where(eq(agents.organizationId, input.organizationId)).orderBy(desc(agents.updatedAt));
    }),
    create: protectedProcedure
      .input(organizationInput.extend({
        teamId: z.number().int().positive(),
        name: z.string().min(2).max(120),
        identity: z.string().min(3).max(160).regex(/^[a-z0-9._:-]+$/i, "Use letters, numbers, dots, underscores, colons, or hyphens."),
        description: z.string().max(2000).optional(),
        environment: z.enum(["development", "staging", "production"]),
        riskLevel,
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const team = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.organizationId, input.organizationId))).limit(1);
        if (!team[0]) throw new TRPCError({ code: "FORBIDDEN", message: "The selected team is outside this organization." });
        const agentId = insertId(await db.insert(agents).values({
          organizationId: input.organizationId,
          teamId: input.teamId,
          name: input.name,
          identity: input.identity,
          description: input.description ?? null,
          environment: input.environment,
          ownerUserId: ctx.user.id,
          riskLevel: input.riskLevel,
          status: "active",
        }));
        await appendAuditEvent({
          organizationId: input.organizationId,
          eventType: "agent.registered",
          actorType: "user",
          actorIdentity: ctx.user.email || ctx.user.openId,
          agentId,
          outcome: "allowed",
          payload: { name: input.name, identity: input.identity, environment: input.environment, riskLevel: input.riskLevel },
        });
        return { agentId };
      }),
    setStatus: protectedProcedure
      .input(organizationInput.extend({ agentId: z.number().int().positive(), status: z.enum(["active", "paused", "retired"]) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        await requireAgentInOrganization(input.organizationId, input.agentId);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        await db.update(agents).set({ status: input.status }).where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId)));
        await appendAuditEvent({
          organizationId: input.organizationId,
          eventType: "agent.status_changed",
          actorType: "user",
          actorIdentity: ctx.user.email || ctx.user.openId,
          agentId: input.agentId,
          outcome: "allowed",
          payload: { status: input.status },
        });
        return { success: true };
      }),
  }),

  policies: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(policies).where(eq(policies.organizationId, input.organizationId)).orderBy(desc(policies.priority), desc(policies.updatedAt));
    }),
    create: protectedProcedure
      .input(organizationInput.extend({
        teamId: z.number().int().positive().nullable().optional(),
        agentId: z.number().int().positive().nullable().optional(),
        name: z.string().min(2).max(160),
        description: z.string().max(2000).optional(),
        effect: z.enum(["allow", "deny", "require_approval"]),
        toolPattern: z.string().min(1).max(120),
        actionPattern: z.string().min(1).max(120),
        parameterConstraints: z.array(z.object({ field: z.string().min(1), operator: z.enum(["equals", "exists", "gt", "includes"]), value: z.union([z.string(), z.number(), z.boolean()]).optional() })).max(10).optional(),
        dataSensitivity: z.enum(["any", "public", "internal", "pii", "phi", "payment", "secret"]),
        destinationPattern: z.string().min(1).max(180),
        priority: z.number().int().min(0).max(1000),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        if (input.agentId) await requireAgentInOrganization(input.organizationId, input.agentId);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const policyId = insertId(await db.insert(policies).values({
          organizationId: input.organizationId,
          teamId: input.teamId ?? null,
          agentId: input.agentId ?? null,
          name: input.name,
          description: input.description ?? null,
          effect: input.effect,
          toolPattern: input.toolPattern,
          actionPattern: input.actionPattern,
          parameterConstraints: input.parameterConstraints ?? [],
          dataSensitivity: input.dataSensitivity,
          destinationPattern: input.destinationPattern,
          priority: input.priority,
          status: "active",
          createdBy: ctx.user.id,
        }));
        await appendAuditEvent({
          organizationId: input.organizationId,
          eventType: "policy.created",
          actorType: "user",
          actorIdentity: ctx.user.email || ctx.user.openId,
          policyId,
          outcome: "allowed",
          payload: { name: input.name, effect: input.effect, toolPattern: input.toolPattern, actionPattern: input.actionPattern },
        });
        return { policyId };
      }),
    setStatus: protectedProcedure
      .input(organizationInput.extend({ policyId: z.number().int().positive(), status: z.enum(["active", "disabled"]) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const result = await db.update(policies).set({ status: input.status }).where(and(eq(policies.id, input.policyId), eq(policies.organizationId, input.organizationId)));
        if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found in this organization." });
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "policy.status_changed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, policyId: input.policyId, outcome: "allowed", payload: { status: input.status } });
        return { success: true };
      }),
  }),

  gateway: router({
    evaluate: protectedProcedure
      .input(organizationInput.extend({
        agentId: z.number().int().positive(),
        toolName: z.string().min(1).max(120),
        action: z.string().min(1).max(120),
        parameters: z.record(z.string(), z.unknown()).default({}),
        dataSensitivity,
        destination: z.string().min(1).max(180),
        riskLevel,
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationMembership(input.organizationId, ctx.user.id);
        const agent = await requireAgentInOrganization(input.organizationId, input.agentId);
        if (agent.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Paused or retired agents cannot invoke tools." });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const guardResult = inspectAndRedact(input.parameters);
        const effectiveSensitivity = guardResult.classification === "internal" ? input.dataSensitivity : guardResult.classification;
        const activePolicies = await db
          .select()
          .from(policies)
          .where(and(eq(policies.organizationId, input.organizationId), eq(policies.status, "active"), or(isNull(policies.agentId), eq(policies.agentId, input.agentId))));
        const evaluation = evaluatePolicies(activePolicies, {
          toolName: input.toolName,
          action: input.action,
          parameters: input.parameters,
          dataSensitivity: effectiveSensitivity,
          destination: input.destination,
        });
        const toolCallId = insertId(await db.insert(toolCalls).values({
          organizationId: input.organizationId,
          agentId: input.agentId,
          toolName: input.toolName,
          action: input.action,
          redactedParameters: guardResult.redactedValue as Record<string, unknown>,
          dataSensitivity: effectiveSensitivity,
          destination: input.destination,
          riskLevel: input.riskLevel,
          decision: evaluation.decision,
          matchedPolicyId: evaluation.matchedPolicy?.id ?? null,
          initiatedBy: ctx.user.email || ctx.user.openId,
        }));
        if (guardResult.occurrences > 0) {
          await db.insert(dataGuardFindings).values({
            organizationId: input.organizationId,
            toolCallId,
            classification: guardResult.classification,
            detector: guardResult.detectors.join(",") || "manual-classification",
            actionTaken: evaluation.decision === "blocked" ? "blocked" : "redacted",
            occurrences: guardResult.occurrences,
            destinationApproved: evaluation.decision === "allowed",
          });
        }
        let approvalId: number | null = null;
        if (evaluation.decision === "approval_required") {
          approvalId = insertId(await db.insert(approvals).values({
            organizationId: input.organizationId,
            toolCallId,
            requestedBy: ctx.user.email || ctx.user.openId,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }));
        }
        await appendAuditEvent({
          organizationId: input.organizationId,
          eventType: "gateway.tool_call_evaluated",
          actorType: "agent",
          actorIdentity: agent.identity,
          agentId: input.agentId,
          toolCallId,
          policyId: evaluation.matchedPolicy?.id ?? null,
          approvalId,
          outcome: evaluation.decision,
          payload: { toolName: input.toolName, action: input.action, dataSensitivity: effectiveSensitivity, destination: input.destination, reason: evaluation.reason },
        });
        if (evaluation.decision !== "allowed" || input.riskLevel === "critical") {
          await createOperatorNotification({
            organizationId: input.organizationId,
            severity: evaluation.decision === "blocked" || input.riskLevel === "critical" ? "high" : "medium",
            title: evaluation.decision === "blocked" ? "High-risk action blocked" : "Human approval required",
            content: `${agent.name} requested ${input.toolName}.${input.action}. ${evaluation.reason}`,
            relatedType: approvalId ? "approval" : "tool_call",
            relatedId: approvalId ?? toolCallId,
          });
        }
        if (evaluation.decision === "blocked") {
          const recentBlocks = await db
            .select({ id: toolCalls.id })
            .from(toolCalls)
            .where(and(eq(toolCalls.organizationId, input.organizationId), eq(toolCalls.decision, "blocked"), gte(toolCalls.createdAt, new Date(Date.now() - 10 * 60 * 1000))));
          if (recentBlocks.length === 3) {
            await createOperatorNotification({
              organizationId: input.organizationId,
              severity: "critical",
              title: "Policy-violation threshold reached",
              content: "Three actions were blocked in the last ten minutes. Review the Tool Gateway and audit ledger for a possible integration fault or malicious sequence.",
              relatedType: "tool_call",
              relatedId: toolCallId,
            });
          }
        }
        return { toolCallId, approvalId, decision: evaluation.decision, matchedPolicy: evaluation.matchedPolicy?.name ?? null, reason: evaluation.reason, dataGuard: guardResult };
      }),
  }),

  runtime: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db
        .select({ id: runtimeCredentials.id, agentId: runtimeCredentials.agentId, vaultCredentialId: runtimeCredentials.vaultCredentialId, allowedScopes: runtimeCredentials.allowedScopes, status: runtimeCredentials.status, expiresAt: runtimeCredentials.expiresAt, revokedAt: runtimeCredentials.revokedAt, createdAt: runtimeCredentials.createdAt, agentName: agents.name, agentIdentity: agents.identity })
        .from(runtimeCredentials)
        .innerJoin(agents, eq(runtimeCredentials.agentId, agents.id))
        .where(eq(runtimeCredentials.organizationId, input.organizationId))
        .orderBy(desc(runtimeCredentials.createdAt));
    }),
    issueCredential: protectedProcedure
      .input(organizationInput.extend({ agentId: z.number().int().positive(), vaultCredentialId: z.number().int().positive(), requestedScopes: z.array(z.string().min(1).max(120)).min(1).max(20).optional(), ttlSeconds: z.number().int().min(60).max(3_600).default(300) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        await requireAgentInOrganization(input.organizationId, input.agentId);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const vaultReference = await db.select().from(vaultCredentials).where(and(eq(vaultCredentials.id, input.vaultCredentialId), eq(vaultCredentials.organizationId, input.organizationId), eq(vaultCredentials.status, "active"))).limit(1);
        if (!vaultReference[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Active Vault credential reference not found in this organization." });
        let runtimeScope: { scopes: string[]; ttlSeconds: number };
        try {
          runtimeScope = deriveRuntimeCredentialScope({ referenceScopes: vaultReference[0].allowedScopes, referenceTtlSeconds: vaultReference[0].tokenTtlSeconds, requestedScopes: input.requestedScopes, requestedTtlSeconds: input.ttlSeconds });
        } catch (error) {
          throw new TRPCError({ code: "FORBIDDEN", message: error instanceof Error && error.message === "runtime_ttl_exceeds_reference" ? "Requested runtime TTL exceeds this Vault credential reference." : "Requested runtime scopes exceed this Vault credential reference." });
        }
        const tokenId = randomUUID();
        const expiresAt = new Date(Date.now() + runtimeScope.ttlSeconds * 1000);
        const credentialId = insertId(await db.insert(runtimeCredentials).values({ organizationId: input.organizationId, agentId: input.agentId, vaultCredentialId: input.vaultCredentialId, tokenId, allowedScopes: runtimeScope.scopes, expiresAt, issuedBy: ctx.user.id }));
        const token = await issueRuntimeToken({ tokenId, organizationId: input.organizationId, agentId: input.agentId, vaultCredentialId: input.vaultCredentialId, allowedScopes: runtimeScope.scopes }, runtimeScope.ttlSeconds);
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "runtime.credential_issued", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, agentId: input.agentId, outcome: "allowed", payload: { credentialId, vaultCredentialId: input.vaultCredentialId, scopes: runtimeScope.scopes, expiresAt: expiresAt.toISOString() } });
        return { credentialId, token, expiresAt };
      }),
    revokeCredential: protectedProcedure
      .input(organizationInput.extend({ credentialId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const credential = await db.select().from(runtimeCredentials).where(and(eq(runtimeCredentials.id, input.credentialId), eq(runtimeCredentials.organizationId, input.organizationId))).limit(1);
        if (!credential[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Runtime credential not found in this organization." });
        await db.update(runtimeCredentials).set({ status: "revoked", revokedAt: new Date() }).where(eq(runtimeCredentials.id, input.credentialId));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "runtime.credential_revoked", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, agentId: credential[0].agentId, outcome: "allowed", payload: { credentialId: input.credentialId } });
        return { success: true };
      }),
    evaluate: publicProcedure
      .input(z.object({
        token: z.string().min(30).max(8_192),
        nonce: z.string().min(16).max(96).regex(/^[a-zA-Z0-9._-]+$/, "Nonce must be URL-safe."),
        toolName: z.string().min(1).max(120),
        action: z.string().min(1).max(120),
        parameters: z.record(z.string(), z.unknown()).default({}),
        outboundPayload: z.unknown().optional(),
        dataSensitivity,
        destination: z.string().min(1).max(180),
        riskLevel,
      }))
      .mutation(async ({ input }) => {
        let claims;
        try {
          claims = await verifyRuntimeToken(input.token);
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Runtime gateway token is invalid or expired." });
        }
        if (!scopeAllows(claims.allowedScopes, input.toolName, input.action)) throw new TRPCError({ code: "FORBIDDEN", message: "Runtime credential does not include this tool scope." });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const credential = await db.select().from(runtimeCredentials).where(and(eq(runtimeCredentials.tokenId, claims.tokenId), eq(runtimeCredentials.organizationId, claims.organizationId), eq(runtimeCredentials.agentId, claims.agentId), eq(runtimeCredentials.vaultCredentialId, claims.vaultCredentialId))).limit(1);
        if (!credential[0]) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Runtime credential is not active." });
        }
        try {
          await authorizeRuntimeGatewayRequest({
            runtimeCredentialId: credential[0].id,
            credential: credential[0],
            claims,
            nonce: input.nonce,
            reserveNonce: async (runtimeCredentialId, nonce, expiresAt) => {
              try {
                await db.insert(runtimeNonces).values({ runtimeCredentialId, nonce, expiresAt });
                return true;
              } catch {
                return false;
              }
            },
          });
        } catch (error) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error && error.message === "runtime_request_replay" ? "Runtime request replay detected." : "Runtime credential is invalid or inactive." });
        }
        const agent = await requireAgentInOrganization(claims.organizationId, claims.agentId);
        if (agent.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Paused or retired agents cannot invoke tools." });
        const inboundGuard = inspectAndRedact(input.parameters);
        const outboundGuard = inspectOutboundAndRedact(input.outboundPayload ?? {});
        const effectiveSensitivity = inboundGuard.classification === "internal" ? input.dataSensitivity : inboundGuard.classification;
        const activePolicies = await db.select().from(policies).where(and(eq(policies.organizationId, claims.organizationId), eq(policies.status, "active"), or(isNull(policies.agentId), eq(policies.agentId, claims.agentId))));
        const evaluation = evaluatePolicies(activePolicies, { toolName: input.toolName, action: input.action, parameters: input.parameters, dataSensitivity: effectiveSensitivity, destination: input.destination });
        const toolCallId = insertId(await db.insert(toolCalls).values({ organizationId: claims.organizationId, agentId: claims.agentId, toolName: input.toolName, action: input.action, redactedParameters: inboundGuard.redactedValue as Record<string, unknown>, dataSensitivity: effectiveSensitivity, destination: input.destination, riskLevel: input.riskLevel, decision: evaluation.decision, matchedPolicyId: evaluation.matchedPolicy?.id ?? null, initiatedBy: `runtime:${credential[0].id}` }));
        const findings = [inboundGuard, outboundGuard];
        for (const finding of findings) {
          if (finding.occurrences > 0) await db.insert(dataGuardFindings).values({ organizationId: claims.organizationId, toolCallId, classification: finding.classification, detector: finding.detectors.join(",") || "runtime-data-guard", actionTaken: "redacted", occurrences: finding.occurrences, destinationApproved: evaluation.decision === "allowed" });
        }
        await appendAuditEvent({ organizationId: claims.organizationId, eventType: "runtime.gateway_evaluated", actorType: "agent", actorIdentity: agent.identity, agentId: claims.agentId, toolCallId, policyId: evaluation.matchedPolicy?.id ?? null, outcome: evaluation.decision, payload: { toolName: input.toolName, action: input.action, destination: input.destination, outboundRedactions: outboundGuard.occurrences } });
        return { toolCallId, decision: evaluation.decision, allowed: evaluation.decision === "allowed", reason: evaluation.reason, redactedParameters: inboundGuard.redactedValue, redactedOutboundPayload: outboundGuard.redactedValue, outboundFindings: outboundGuard.occurrences };
      }),
    reportOutcome: publicProcedure
      .input(z.object({
        token: z.string().min(30).max(8_192),
        nonce: z.string().min(16).max(96).regex(/^[a-zA-Z0-9._-]+$/, "Nonce must be URL-safe."),
        toolCallId: z.number().int().positive(),
        outcome: z.enum(["succeeded", "failed"]),
        targetStatusCode: z.number().int().min(100).max(599).optional(),
        targetReference: z.string().min(1).max(160).regex(/^[a-zA-Z0-9._:-]+$/, "Target reference must be an opaque, URL-safe identifier.").optional(),
      }))
      .mutation(async ({ input }) => {
        let claims;
        try {
          claims = await verifyRuntimeToken(input.token);
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Runtime gateway token is invalid or expired." });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const credential = await db.select().from(runtimeCredentials).where(and(eq(runtimeCredentials.tokenId, claims.tokenId), eq(runtimeCredentials.organizationId, claims.organizationId), eq(runtimeCredentials.agentId, claims.agentId), eq(runtimeCredentials.vaultCredentialId, claims.vaultCredentialId))).limit(1);
        if (!credential[0]) throw new TRPCError({ code: "UNAUTHORIZED", message: "Runtime credential is not active." });
        try {
          await authorizeRuntimeGatewayRequest({
            runtimeCredentialId: credential[0].id,
            credential: credential[0],
            claims,
            nonce: input.nonce,
            reserveNonce: async (runtimeCredentialId, nonce, expiresAt) => {
              try {
                await db.insert(runtimeNonces).values({ runtimeCredentialId, nonce, expiresAt });
                return true;
              } catch {
                return false;
              }
            },
          });
        } catch (error) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error && error.message === "runtime_request_replay" ? "Runtime request replay detected." : "Runtime credential is invalid or inactive." });
        }
        const [call] = await db.select().from(toolCalls).where(and(eq(toolCalls.id, input.toolCallId), eq(toolCalls.organizationId, claims.organizationId), eq(toolCalls.agentId, claims.agentId))).limit(1);
        if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Governed action not found for this runtime identity." });
        if (!["allowed", "approved"].includes(call.decision)) throw new TRPCError({ code: "FORBIDDEN", message: "A target outcome can only be reported for an allowed governed action." });
        const recordedAt = new Date();
        await db.update(toolCalls).set({ targetOutcome: input.outcome, targetStatusCode: input.targetStatusCode ?? null, targetReference: input.targetReference ?? null, targetRecordedAt: recordedAt }).where(eq(toolCalls.id, input.toolCallId));
        await appendAuditEvent({ organizationId: claims.organizationId, eventType: "runtime.target_outcome_recorded", actorType: "agent", actorIdentity: `runtime:${credential[0].id}`, agentId: claims.agentId, toolCallId: input.toolCallId, outcome: input.outcome === "succeeded" ? "allowed" : "blocked", payload: { targetOutcome: input.outcome, targetStatusCode: input.targetStatusCode ?? null, targetReference: input.targetReference ?? null } });
        return { success: true, recordedAt };
      }),
  }),

  observability: router({
    capture: protectedProcedure
      .input(organizationInput.extend({ limit: z.number().int().min(1).max(200).default(100) }))
      .query(async ({ ctx, input }) => {
        await requireOrganizationMembership(input.organizationId, ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const calls = await db
          .select({
            id: toolCalls.id,
            agentId: toolCalls.agentId,
            toolName: toolCalls.toolName,
            action: toolCalls.action,
            redactedParameters: toolCalls.redactedParameters,
            dataSensitivity: toolCalls.dataSensitivity,
            destination: toolCalls.destination,
            riskLevel: toolCalls.riskLevel,
            decision: toolCalls.decision,
            targetOutcome: toolCalls.targetOutcome,
            targetStatusCode: toolCalls.targetStatusCode,
            targetReference: toolCalls.targetReference,
            targetRecordedAt: toolCalls.targetRecordedAt,
            createdAt: toolCalls.createdAt,
            agentName: agents.name,
            agentIdentity: agents.identity,
            policyName: policies.name,
          })
          .from(toolCalls)
          .innerJoin(agents, eq(toolCalls.agentId, agents.id))
          .leftJoin(policies, eq(toolCalls.matchedPolicyId, policies.id))
          .where(eq(toolCalls.organizationId, input.organizationId))
          .orderBy(desc(toolCalls.createdAt))
          .limit(input.limit);
        const callIds = calls.map(call => call.id);
        const [findings, approvalRows] = callIds.length
          ? await Promise.all([
              db.select().from(dataGuardFindings).where(and(eq(dataGuardFindings.organizationId, input.organizationId), inArray(dataGuardFindings.toolCallId, callIds))),
              db.select().from(approvals).where(and(eq(approvals.organizationId, input.organizationId), inArray(approvals.toolCallId, callIds))),
            ])
          : [[], []];
        return calls.map(call => {
          const approval = approvalRows.find(row => row.toolCallId === call.id);
          return {
            ...call,
            dataGuardFindings: findings.filter(finding => finding.toolCallId === call.id).map(finding => ({ classification: finding.classification, actionTaken: finding.actionTaken, occurrences: finding.occurrences })),
            approval: approval ? { status: approval.status } : null,
          };
        });
      }),
    trace: protectedProcedure
      .input(organizationInput.extend({ toolCallId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await requireOrganizationMembership(input.organizationId, ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const rows = await db
          .select({
            call: toolCalls,
            agent: { id: agents.id, name: agents.name, identity: agents.identity },
            policy: { id: policies.id, name: policies.name },
          })
          .from(toolCalls)
          .innerJoin(agents, eq(toolCalls.agentId, agents.id))
          .leftJoin(policies, eq(toolCalls.matchedPolicyId, policies.id))
          .where(and(eq(toolCalls.id, input.toolCallId), eq(toolCalls.organizationId, input.organizationId)))
          .limit(1);
        const row = rows[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Captured action not found in this organization." });
        const [findings, approvalRows, relatedAuditEvents] = await Promise.all([
          db.select().from(dataGuardFindings).where(and(eq(dataGuardFindings.organizationId, input.organizationId), eq(dataGuardFindings.toolCallId, input.toolCallId))).orderBy(dataGuardFindings.createdAt),
          db.select().from(approvals).where(and(eq(approvals.organizationId, input.organizationId), eq(approvals.toolCallId, input.toolCallId))).limit(1),
          db.select({ id: auditEvents.id, eventType: auditEvents.eventType, outcome: auditEvents.outcome, createdAt: auditEvents.createdAt }).from(auditEvents).where(and(eq(auditEvents.organizationId, input.organizationId), eq(auditEvents.toolCallId, input.toolCallId))).orderBy(auditEvents.createdAt),
        ]);
        return buildActionTrace({
          call: row.call,
          agent: row.agent,
          policy: row.policy?.id ? row.policy : null,
          findings,
          approval: approvalRows[0] ?? null,
          auditEvents: relatedAuditEvents,
        });
      }),
  }),

  approvals: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin", "operator"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(approvals).where(eq(approvals.organizationId, input.organizationId)).orderBy(desc(approvals.createdAt));
    }),
    decide: protectedProcedure
      .input(organizationInput.extend({ approvalId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), decisionReason: z.string().min(3).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin", "operator"]);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const approval = await db.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.organizationId, input.organizationId))).limit(1);
        if (!approval[0] || approval[0].status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "This approval is no longer pending." });
        if (isApprovalExpired(approval[0].expiresAt)) {
          await db.update(approvals).set({ status: "expired" }).where(eq(approvals.id, input.approvalId));
          throw new TRPCError({ code: "BAD_REQUEST", message: "This approval has expired." });
        }
        await db.update(approvals).set({ status: input.decision, reviewerUserId: ctx.user.id, decisionReason: input.decisionReason, decidedAt: new Date() }).where(eq(approvals.id, input.approvalId));
        await db.update(toolCalls).set({ decision: input.decision }).where(eq(toolCalls.id, approval[0].toolCallId));
        await appendAuditEvent({
          organizationId: input.organizationId,
          eventType: "approval.decided",
          actorType: "user",
          actorIdentity: ctx.user.email || ctx.user.openId,
          toolCallId: approval[0].toolCallId,
          approvalId: input.approvalId,
          outcome: input.decision,
          payload: { reason: input.decisionReason },
        });
        return { success: true };
      }),
  }),

  audit: router({
    list: protectedProcedure.input(organizationInput.extend({ limit: z.number().int().min(1).max(100).default(50) })).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(auditEvents).where(eq(auditEvents.organizationId, input.organizationId)).orderBy(desc(auditEvents.sequence)).limit(input.limit);
    }),
  }),

  dataGuard: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(dataGuardFindings).where(eq(dataGuardFindings.organizationId, input.organizationId)).orderBy(desc(dataGuardFindings.createdAt));
    }),
    redactOutbound: protectedProcedure
      .input(organizationInput.extend({ toolCallId: z.number().int().positive(), content: z.unknown(), destination: z.string().min(1).max(180) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationMembership(input.organizationId, ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const call = await db.select().from(toolCalls).where(and(eq(toolCalls.id, input.toolCallId), eq(toolCalls.organizationId, input.organizationId))).limit(1);
        if (!call[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Tool call not found in this organization." });
        const guarded = inspectOutboundAndRedact(input.content);
        if (guarded.occurrences > 0) {
          await db.insert(dataGuardFindings).values({
            organizationId: input.organizationId,
            toolCallId: input.toolCallId,
            classification: guarded.classification,
            detector: guarded.detectors.join(",") || "outbound-classification",
            actionTaken: "redacted",
            occurrences: guarded.occurrences,
            destinationApproved: call[0].decision === "allowed",
          });
        }
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "data_guard.outbound_scanned", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, toolCallId: input.toolCallId, outcome: guarded.occurrences ? "blocked" : "allowed", payload: { classification: guarded.classification, occurrences: guarded.occurrences, destination: input.destination } });
        return guarded;
      }),
  }),

  vault: router({
    status: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      return getVaultConfigurationStatus();
    }),
    probe: protectedProcedure.input(organizationInput).mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      const result = await createVaultAppRoleClient().probe();
      return result;
    }),
    issueLease: protectedProcedure.input(organizationInput.extend({ agentId: z.number().int().positive(), vaultCredentialId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      await requireAgentInOrganization(input.organizationId, input.agentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const reference = await db.select().from(vaultCredentials).where(and(eq(vaultCredentials.id, input.vaultCredentialId), eq(vaultCredentials.organizationId, input.organizationId), eq(vaultCredentials.status, "active"))).limit(1);
      if (!reference[0] || !isVaultPathForOrganization(reference[0].externalReference, input.organizationId) || !reference[0].externalReference.startsWith(`agentfence/tenants/${input.organizationId}/agents/${input.agentId}/`)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This Vault credential reference is not scoped to the selected agent." });
      }
      try {
        const lease = await createVaultAppRoleClient().issueLease(reference[0].externalReference);
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "vault.lease_issued", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, agentId: input.agentId, outcome: "allowed", payload: { vaultCredentialId: input.vaultCredentialId, leaseDurationSeconds: lease.leaseDurationSeconds, renewable: lease.renewable } });
        return { leaseDurationSeconds: lease.leaseDurationSeconds, renewable: lease.renewable };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not configured")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Dedicated Vault is not configured yet." });
        throw new TRPCError({ code: "BAD_GATEWAY", message: "Vault lease issuance failed." });
      }
    }),
    revokeLease: protectedProcedure.input(organizationInput.extend({ leaseId: z.string().min(3).max(512) })).mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      try {
        await createVaultAppRoleClient().revokeLease(input.leaseId);
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "vault.lease_revoked", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { leaseReference: "supplied-by-control-plane" } });
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not configured")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Dedicated Vault is not configured yet." });
        throw new TRPCError({ code: "BAD_GATEWAY", message: "Vault lease revocation failed." });
      }
    }),
    rotateLease: protectedProcedure.input(organizationInput.extend({ agentId: z.number().int().positive(), vaultCredentialId: z.number().int().positive(), previousLeaseId: z.string().min(3).max(512) })).mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      await requireAgentInOrganization(input.organizationId, input.agentId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const reference = await db.select().from(vaultCredentials).where(and(eq(vaultCredentials.id, input.vaultCredentialId), eq(vaultCredentials.organizationId, input.organizationId), eq(vaultCredentials.status, "active"))).limit(1);
      if (!reference[0] || !isVaultPathForOrganization(reference[0].externalReference, input.organizationId) || !reference[0].externalReference.startsWith(`agentfence/tenants/${input.organizationId}/agents/${input.agentId}/`)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This Vault credential reference is not scoped to the selected agent." });
      }
      try {
        const lease = await createVaultAppRoleClient().rotateLease(input.previousLeaseId, reference[0].externalReference);
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "vault.lease_rotated", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, agentId: input.agentId, outcome: "allowed", payload: { vaultCredentialId: input.vaultCredentialId, leaseDurationSeconds: lease.leaseDurationSeconds, renewable: lease.renewable } });
        return { leaseDurationSeconds: lease.leaseDurationSeconds, renewable: lease.renewable };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not configured")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Dedicated Vault is not configured yet." });
        throw new TRPCError({ code: "BAD_GATEWAY", message: "Vault lease rotation failed." });
      }
    }),
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select({ id: vaultCredentials.id, name: vaultCredentials.name, provider: vaultCredentials.provider, allowedScopes: vaultCredentials.allowedScopes, tokenTtlSeconds: vaultCredentials.tokenTtlSeconds, status: vaultCredentials.status, lastRotatedAt: vaultCredentials.lastRotatedAt, createdAt: vaultCredentials.createdAt }).from(vaultCredentials).where(eq(vaultCredentials.organizationId, input.organizationId));
    }),
    createReference: protectedProcedure
      .input(organizationInput.extend({ teamId: z.number().int().positive().nullable().optional(), name: z.string().min(2).max(120), provider: z.string().min(2).max(100), externalReference: z.string().min(4).max(255), allowedScopes: z.array(z.string().min(1).max(120)).min(1).max(20), tokenTtlSeconds: z.number().int().min(60).max(3600) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        if (input.provider.toLowerCase().includes("vault") && !isVaultPathForOrganization(input.externalReference, input.organizationId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Vault credential references must stay inside this organization’s AgentFence tenant path." });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const credentialId = insertId(await db.insert(vaultCredentials).values({ organizationId: input.organizationId, teamId: input.teamId ?? null, name: input.name, provider: input.provider, externalReference: input.externalReference, allowedScopes: input.allowedScopes, tokenTtlSeconds: input.tokenTtlSeconds, createdBy: ctx.user.id }));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "vault.credential_reference_registered", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { credentialId, provider: input.provider, tokenTtlSeconds: input.tokenTtlSeconds, scopes: input.allowedScopes } });
        return { credentialId };
      }),
  }),

  simulations: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(attackSimulations).where(eq(attackSimulations.organizationId, input.organizationId)).orderBy(desc(attackSimulations.createdAt));
    }),
    runSafeScenario: protectedProcedure
      .input(organizationInput.extend({ agentId: z.number().int().positive(), scenarioType: z.enum(["agent_goal_hijack", "tool_misuse", "identity_privilege_abuse", "agentic_supply_chain", "unexpected_code_execution", "memory_context_poisoning", "insecure_interagent", "cascading_failures", "human_agent_trust", "rogue_agents"]) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        const agent = await requireAgentInOrganization(input.organizationId, input.agentId);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const scenario = getOwaspAgenticScenario(input.scenarioType);
        const activePolicies = await db.select().from(policies).where(and(eq(policies.organizationId, input.organizationId), eq(policies.status, "active"), or(isNull(policies.agentId), eq(policies.agentId, input.agentId))));
        const evaluation = evaluatePolicies(activePolicies, scenario.request);
        const status = evaluation.decision === "blocked" ? "passed" : evaluation.decision === "approval_required" ? "needs_review" : "failed";
        const simulationId = insertId(await db.insert(attackSimulations).values({
          organizationId: input.organizationId,
          agentId: input.agentId,
          scenarioName: `${scenario.asi} · ${scenario.title}`,
          scenarioType: input.scenarioType,
          status,
          expectedControl: scenario.expectedControl,
          actualOutcome: `Controlled assessment produced ${evaluation.decision}: ${evaluation.reason}. No payload was executed and no external system was contacted.`,
          remediation: status === "passed" ? "Maintain the active policy coverage and rerun this regression test on every relevant agent release." : "Add a deny or approval policy that covers this simulated action before deployment.",
          createdBy: ctx.user.id,
        }));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "simulation.completed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, agentId: agent.id, outcome: "simulated", payload: { simulationId, scenarioType: input.scenarioType, status } });
        return { simulationId, status, actualOutcome: evaluation.reason };
      }),
  }),

  notifications: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(notifications).where(eq(notifications.organizationId, input.organizationId)).orderBy(desc(notifications.createdAt)).limit(30);
    }),
    markRead: protectedProcedure.input(organizationInput.extend({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.organizationId, input.organizationId)));
      return { success: true };
    }),
  }),

  evidence: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(evidenceExports).where(eq(evidenceExports.organizationId, input.organizationId)).orderBy(desc(evidenceExports.createdAt));
    }),
    export: protectedProcedure
      .input(organizationInput.extend({ framework: z.enum(["SOC 2", "ISO 27001", "insurance review"]) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const [organization] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
        if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
        const [policyRows, auditRows, agentRows, approvalRows] = await Promise.all([
          db.select().from(policies).where(eq(policies.organizationId, input.organizationId)),
          db.select().from(auditEvents).where(eq(auditEvents.organizationId, input.organizationId)).orderBy(desc(auditEvents.sequence)).limit(500),
          db.select().from(agents).where(eq(agents.organizationId, input.organizationId)),
          db.select().from(approvals).where(eq(approvals.organizationId, input.organizationId)),
        ]);
        const payload = {
          product: "AgentFence",
          framework: input.framework,
          generatedAt: new Date().toISOString(),
          organization: { id: organization.id, name: organization.name, slug: organization.slug },
          summary: { agentCount: agentRows.length, policyCount: policyRows.length, approvalCount: approvalRows.length, auditEventCount: auditRows.length },
          agents: agentRows,
          policies: policyRows,
          approvals: approvalRows,
          auditLedger: auditRows,
          evidenceStatement: "This packet contains AgentFence policy snapshots and tamper-evident audit-ledger records. It supports evidence collection and review; it does not itself certify compliance.",
        };
        const serialized = JSON.stringify(payload, null, 2);
        const evidenceHash = createHash("sha256").update(serialized).digest("hex");
        const safeFramework = input.framework.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
        const fileName = `evidence/${input.organizationId}/${safeFramework}-${Date.now()}.json`;
        const stored = await storagePut(fileName, Buffer.from(serialized), "application/json");
        const exportId = insertId(await db.insert(evidenceExports).values({ organizationId: input.organizationId, framework: input.framework, storageKey: stored.key, storageUrl: stored.url, evidenceHash, generatedBy: ctx.user.id }));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "evidence.exported", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { exportId, framework: input.framework, evidenceHash } });
        return { exportId, url: stored.url, evidenceHash };
      }),
  }),

  explanations: router({
    explainToolCall: protectedProcedure.input(organizationInput.extend({ toolCallId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const call = await db.select().from(toolCalls).where(and(eq(toolCalls.id, input.toolCallId), eq(toolCalls.organizationId, input.organizationId))).limit(1);
      if (!call[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Tool call not found in this organization." });
      const matchedPolicy = call[0].matchedPolicyId ? await db.select().from(policies).where(eq(policies.id, call[0].matchedPolicyId)).limit(1) : [];
      return {
        explanation: await generatePolicyExplanation({
          decision: call[0].decision,
          reason: matchedPolicy[0] ? `Matched ${matchedPolicy[0].name}.` : "No active policy matched this action.",
          toolName: call[0].toolName,
          action: call[0].action,
          dataSensitivity: call[0].dataSensitivity,
          destination: call[0].destination,
        }),
      };
    }),
    suggestPolicyImprovements: protectedProcedure.input(organizationInput).mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin", "operator"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const events = await db
        .select({ toolName: toolCalls.toolName, action: toolCalls.action, dataSensitivity: toolCalls.dataSensitivity, destination: toolCalls.destination, decision: toolCalls.decision })
        .from(toolCalls)
        .where(and(eq(toolCalls.organizationId, input.organizationId), or(eq(toolCalls.decision, "blocked"), eq(toolCalls.decision, "approval_required"))))
        .orderBy(desc(toolCalls.createdAt))
        .limit(40);
      return { suggestion: await generatePolicyPatternSuggestions(events) };
    }),
  }),
});
