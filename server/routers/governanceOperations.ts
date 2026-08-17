import { and, desc, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { agents, auditAnchors, auditExportSchedules, enterpriseConnections, policies, teams, tenantQuotaPolicies, toolCalls } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { EVIDENCE_FRAMEWORKS, createEvidenceExport, runScheduledEvidenceExport } from "../agentfence/evidenceExportService";
import { getTenantUsageSnapshot } from "../agentfence/tenantQuotas";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { getDb } from "../db";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const framework = z.enum(EVIDENCE_FRAMEWORKS);

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
}

async function requireAdmin(organizationId: number, userId: number) {
  await requireOrganizationRole(organizationId, userId, ["admin"]);
}

export const governanceOperationsRouter = router({
  performance: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireOrganizationMembership(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db.select({ latency: toolCalls.policyDecisionLatencyMs, decision: toolCalls.decision, createdAt: toolCalls.createdAt }).from(toolCalls).where(and(eq(toolCalls.organizationId, input.organizationId), gte(toolCalls.createdAt, since))).orderBy(desc(toolCalls.createdAt)).limit(500);
    const values = rows.map(row => row.latency).filter((value): value is number => typeof value === "number" && value >= 0);
    return {
      windowStart: since,
      measuredDecisions: values.length,
      unmeasuredLegacyDecisions: rows.length - values.length,
      averageLatencyMs: values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null,
      p95LatencyMs: percentile(values, 0.95),
      maxLatencyMs: values.length ? Math.max(...values) : null,
      detail: "Latency is measured inside AgentFence from inbound guard inspection through policy evaluation. It excludes network, model, approval, and target-system execution time; it is evidence, not an SLA.",
    };
  }),
  pilotReadiness: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [departmentRows, agentRows, activePolicies, connectionRows, anchorRows, scheduleRows] = await Promise.all([
      db.select().from(teams).where(eq(teams.organizationId, input.organizationId)),
      db.select().from(agents).where(eq(agents.organizationId, input.organizationId)),
      db.select().from(policies).where(and(eq(policies.organizationId, input.organizationId), eq(policies.status, "active"))),
      db.select().from(enterpriseConnections).where(eq(enterpriseConnections.organizationId, input.organizationId)),
      db.select().from(auditAnchors).where(eq(auditAnchors.organizationId, input.organizationId)),
      db.select().from(auditExportSchedules).where(eq(auditExportSchedules.organizationId, input.organizationId)),
    ]);
    return {
      items: [
        { key: "departments", title: "Department ownership", complete: departmentRows.length > 0, detail: `${departmentRows.length} registered department team(s).` },
        { key: "agents", title: "Agent inventory", complete: agentRows.some(agent => agent.status === "active"), detail: `${agentRows.filter(agent => agent.status === "active").length} active registered agent(s).` },
        { key: "policies", title: "Approved policy coverage", complete: activePolicies.length > 0, detail: `${activePolicies.length} active policy binding(s).` },
        { key: "connectors", title: "Connector ownership", complete: connectionRows.length > 0, detail: `${connectionRows.length} connection profile(s); live status depends on customer activation.` },
        { key: "evidence", title: "Evidence ownership", complete: anchorRows.length > 0 || scheduleRows.some(schedule => schedule.status === "active"), detail: "Prepare an audit anchor or activate a managed export schedule." },
      ],
      boundary: "This checklist confirms AgentFence control-plane readiness. It does not prove that direct agent paths, customer IdP, customer Vault, or customer retention are live without their corresponding evidence.",
    };
  }),
  quotas: router({
    get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      try { return await getTenantUsageSnapshot(input.organizationId); }
      catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Usage evidence is unavailable." }); }
    }),
    update: protectedProcedure.input(organizationInput.extend({ gatewayEvaluationsPerMinute: z.number().int().min(10).max(100_000), evidenceExportsPerDay: z.number().int().min(1).max(1_000) })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.insert(tenantQuotaPolicies).values({ organizationId: input.organizationId, gatewayEvaluationsPerMinute: input.gatewayEvaluationsPerMinute, evidenceExportsPerDay: input.evidenceExportsPerDay, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { gatewayEvaluationsPerMinute: input.gatewayEvaluationsPerMinute, evidenceExportsPerDay: input.evidenceExportsPerDay, updatedBy: ctx.user.id } });
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "tenant.quota_updated", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { gatewayEvaluationsPerMinute: input.gatewayEvaluationsPerMinute, evidenceExportsPerDay: input.evidenceExportsPerDay } });
      return { success: true };
    }),
  }),
  evidenceSchedules: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(auditExportSchedules).where(eq(auditExportSchedules.organizationId, input.organizationId)).orderBy(desc(auditExportSchedules.updatedAt));
    }),
    activate: protectedProcedure.input(organizationInput.extend({ framework, deliveryMode: z.enum(["managed_archive", "customer_storage_activation_required"]).default("managed_archive") })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      if (input.deliveryMode !== "managed_archive") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Customer-owned storage requires a certified customer storage integration. Managed archive is available now; no customer credentials are accepted in this page." });
      if (process.env.NODE_ENV !== "production") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Publish the production site before activating a Heartbeat-based evidence export schedule." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      let [schedule] = await db.select().from(auditExportSchedules).where(and(eq(auditExportSchedules.organizationId, input.organizationId), eq(auditExportSchedules.framework, input.framework))).limit(1);
      if (!schedule) {
        const inserted = await db.insert(auditExportSchedules).values({ organizationId: input.organizationId, framework: input.framework, deliveryMode: input.deliveryMode, status: "draft", createdBy: ctx.user.id });
        const id = Number((Array.isArray(inserted) ? inserted[0] : inserted).insertId);
        [schedule] = await db.select().from(auditExportSchedules).where(eq(auditExportSchedules.id, id)).limit(1);
      }
      if (!schedule) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export schedule could not be initialized." });
      const token = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      let taskUid = schedule.scheduleCronTaskUid;
      if (taskUid) await updateHeartbeatJob(taskUid, { enable: true }, token);
      else {
        const job = await createHeartbeatJob({ name: `agentfence-evidence-export-${input.organizationId}-${input.framework.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, cron: "0 0 2 * * *", path: "/api/scheduled/audit-export", description: `Create the daily AgentFence ${input.framework} evidence packet in managed archive storage.` }, token);
        taskUid = job.taskUid;
      }
      await db.update(auditExportSchedules).set({ status: "active", deliveryMode: input.deliveryMode, scheduleCronTaskUid: taskUid, lastRunCode: "SCHEDULE_ACTIVE" }).where(eq(auditExportSchedules.id, schedule.id));
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "evidence.schedule_activated", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { scheduleId: schedule.id, framework: input.framework, deliveryMode: input.deliveryMode } });
      return { enabled: true, scheduled: true };
    }),
    deactivate: protectedProcedure.input(organizationInput.extend({ scheduleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [schedule] = await db.select().from(auditExportSchedules).where(and(eq(auditExportSchedules.id, input.scheduleId), eq(auditExportSchedules.organizationId, input.organizationId))).limit(1);
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled export not found in this organization." });
      if (schedule.scheduleCronTaskUid && process.env.NODE_ENV === "production") {
        const token = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        await updateHeartbeatJob(schedule.scheduleCronTaskUid, { enable: false }, token);
      }
      await db.update(auditExportSchedules).set({ status: "paused", lastRunCode: "SCHEDULE_PAUSED" }).where(eq(auditExportSchedules.id, schedule.id));
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "evidence.schedule_paused", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "blocked", payload: { scheduleId: schedule.id } });
      return { success: true };
    }),
    runNow: protectedProcedure.input(organizationInput.extend({ scheduleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [schedule] = await db.select().from(auditExportSchedules).where(and(eq(auditExportSchedules.id, input.scheduleId), eq(auditExportSchedules.organizationId, input.organizationId))).limit(1);
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled export not found in this organization." });
      if (schedule.deliveryMode !== "managed_archive") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Customer-owned storage is not activated." });
      if (schedule.status === "draft") await db.update(auditExportSchedules).set({ status: "active" }).where(eq(auditExportSchedules.id, schedule.id));
      try { return await runScheduledEvidenceExport(schedule.id); }
      catch (error) { throw new TRPCError({ code: "BAD_GATEWAY", message: error instanceof Error && error.message === "EVIDENCE_EXPORT_QUOTA_EXCEEDED" ? "Daily evidence-export quota has been reached." : "Evidence export could not be generated." }); }
    }),
    exportNow: protectedProcedure.input(organizationInput.extend({ framework })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      try { return await createEvidenceExport({ organizationId: input.organizationId, framework: input.framework, generatedBy: ctx.user.id, actorIdentity: ctx.user.email || ctx.user.openId }); }
      catch (error) { throw new TRPCError({ code: "BAD_GATEWAY", message: error instanceof Error && error.message === "EVIDENCE_EXPORT_QUOTA_EXCEEDED" ? "Daily evidence-export quota has been reached." : "Evidence export could not be generated." }); }
    }),
  }),
});
