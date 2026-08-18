import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { agentContainments, agents, incidentResponseSettings, notifications, toolCalls } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { containAgent, safeContainmentReason } from "../agentfence/incidentContainment";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });

async function requireAdmin(organizationId: number, userId: number) {
  await requireOrganizationRole(organizationId, userId, ["admin"]);
}

export const incidentResponseRouter = router({
  monitor: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireOrganizationMembership(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [agentRows, highRiskActions, alertRows, containmentRows] = await Promise.all([
      db.select().from(agents).where(eq(agents.organizationId, input.organizationId)),
      db.select({ id: toolCalls.id, agentId: toolCalls.agentId, toolName: toolCalls.toolName, action: toolCalls.action, destination: toolCalls.destination, dataSensitivity: toolCalls.dataSensitivity, riskLevel: toolCalls.riskLevel, decision: toolCalls.decision, createdAt: toolCalls.createdAt, agentName: agents.name, agentIdentity: agents.identity }).from(toolCalls).innerJoin(agents, eq(toolCalls.agentId, agents.id)).where(and(eq(toolCalls.organizationId, input.organizationId), gte(toolCalls.createdAt, since), or(inArray(toolCalls.riskLevel, ["high", "critical"]), eq(toolCalls.decision, "blocked")))).orderBy(desc(toolCalls.createdAt)).limit(80),
      db.select().from(notifications).where(and(eq(notifications.organizationId, input.organizationId), inArray(notifications.severity, ["high", "critical"]), gte(notifications.createdAt, since))).orderBy(desc(notifications.createdAt)).limit(50),
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
      boundary: "This workspace monitors actions that traverse an AgentFence-supported integration path. It cannot observe or contain direct calls that bypass the SDK, managed browser wrapper, or Native MCP Gateway.",
    };
  }),
  settings: router({
    get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [settings] = await db.select().from(incidentResponseSettings).where(eq(incidentResponseSettings.organizationId, input.organizationId)).limit(1);
      return { autoContainCriticalBlocks: settings?.autoContainCriticalBlocks ?? false, detail: "When enabled, only a critical-risk governed action that is already blocked triggers automatic agent containment. The agent is paused and active runtime credentials are revoked; new credentials are required after release." };
    }),
    update: protectedProcedure.input(organizationInput.extend({ autoContainCriticalBlocks: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.insert(incidentResponseSettings).values({ organizationId: input.organizationId, autoContainCriticalBlocks: input.autoContainCriticalBlocks, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { autoContainCriticalBlocks: input.autoContainCriticalBlocks, updatedBy: ctx.user.id } });
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "incident.auto_containment_setting_changed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { autoContainCriticalBlocks: input.autoContainCriticalBlocks } });
      return { success: true };
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
