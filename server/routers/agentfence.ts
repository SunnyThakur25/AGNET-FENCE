import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
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
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

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
      const [agentRows, policyRows, pendingApprovals, recentEvents, guardRows] = await Promise.all([
        db.select().from(agents).where(eq(agents.organizationId, input.organizationId)),
        db.select().from(policies).where(and(eq(policies.organizationId, input.organizationId), eq(policies.status, "active"))),
        db.select().from(approvals).where(and(eq(approvals.organizationId, input.organizationId), eq(approvals.status, "pending"))),
        db.select().from(auditEvents).where(eq(auditEvents.organizationId, input.organizationId)).orderBy(desc(auditEvents.createdAt)).limit(8),
        db.select().from(dataGuardFindings).where(eq(dataGuardFindings.organizationId, input.organizationId)),
      ]);
      return {
        metrics: {
          activeAgents: agentRows.filter(agent => agent.status === "active").length,
          protectedPolicies: policyRows.length,
          pendingApprovals: pendingApprovals.length,
          dataGuardFindings: guardRows.length,
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
      .input(organizationInput.extend({ agentId: z.number().int().positive(), scenarioType: z.enum(["prompt_injection", "privilege_escalation", "data_exfiltration"]) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
        const agent = await requireAgentInOrganization(input.organizationId, input.agentId);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const [scenarioName, expectedControl] = input.scenarioType === "prompt_injection"
          ? ["Untrusted instruction containment", "Treat externally supplied instructions as untrusted data and prevent authority changes."]
          : input.scenarioType === "privilege_escalation"
            ? ["Least-privilege boundary test", "Block an action outside the agent’s configured tool and permission scope."]
            : ["Sensitive data egress control", "Block or redact sensitive data before it can reach an unapproved destination."];
        const activePolicies = await db.select().from(policies).where(and(eq(policies.organizationId, input.organizationId), eq(policies.status, "active"), or(isNull(policies.agentId), eq(policies.agentId, input.agentId))));
        const simulatedRequest = input.scenarioType === "data_exfiltration"
          ? { toolName: "browser", action: "send_external", parameters: { classification: "secret" }, dataSensitivity: "secret", destination: "external" }
          : { toolName: "admin", action: "modify_permissions", parameters: { scope: "elevated" }, dataSensitivity: "internal", destination: "internal" };
        const evaluation = evaluatePolicies(activePolicies, simulatedRequest);
        const status = evaluation.decision === "blocked" ? "passed" : evaluation.decision === "approval_required" ? "needs_review" : "failed";
        const simulationId = insertId(await db.insert(attackSimulations).values({
          organizationId: input.organizationId,
          agentId: input.agentId,
          scenarioName,
          scenarioType: input.scenarioType,
          status,
          expectedControl,
          actualOutcome: `Safe simulation produced ${evaluation.decision}: ${evaluation.reason}`,
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
