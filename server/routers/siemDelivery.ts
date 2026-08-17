import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { enterpriseConnections, siemDeliveryOutbox, siemDeliverySettings } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { requireOrganizationRole } from "../agentfence/authz";
import { runSiemDelivery } from "../agentfence/siemDelivery";
import { getDb } from "../db";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });

async function requireAdmin(organizationId: number, userId: number) { await requireOrganizationRole(organizationId, userId, ["admin"]); }

function safeSettings(row: typeof siemDeliverySettings.$inferSelect | undefined, rows: Array<typeof siemDeliveryOutbox.$inferSelect>) {
  const counts = { queued: 0, retrying: 0, delivered: 0, failed: 0, skipped: 0 };
  rows.forEach(row => { counts[row.status] += 1; });
  return row ? { id: row.id, connectionId: row.connectionId, enabled: row.enabled, scheduled: Boolean(row.scheduleCronTaskUid), batchSize: row.batchSize, maxAttempts: row.maxAttempts, lastEnqueuedSequence: row.lastEnqueuedSequence, lastDeliveryAt: row.lastDeliveryAt, lastDeliveryCode: row.lastDeliveryCode, counts } : null;
}

export const siemDeliveryRouter = router({
  get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [connection] = await db.select().from(enterpriseConnections).where(and(eq(enterpriseConnections.organizationId, input.organizationId), eq(enterpriseConnections.kind, "splunk_hec"))).limit(1);
    if (!connection) return { connection: null, settings: null, recent: [] as Array<{ id: number; status: string; attempts: number; lastDeliveryCode: string | null; createdAt: Date; deliveredAt: Date | null }> };
    const [settings] = await db.select().from(siemDeliverySettings).where(eq(siemDeliverySettings.connectionId, connection.id)).limit(1);
    const recent = await db.select({ id: siemDeliveryOutbox.id, status: siemDeliveryOutbox.status, attempts: siemDeliveryOutbox.attempts, lastDeliveryCode: siemDeliveryOutbox.lastDeliveryCode, createdAt: siemDeliveryOutbox.createdAt, deliveredAt: siemDeliveryOutbox.deliveredAt }).from(siemDeliveryOutbox).where(eq(siemDeliveryOutbox.connectionId, connection.id)).orderBy(desc(siemDeliveryOutbox.createdAt)).limit(30);
    const fullRows = await db.select().from(siemDeliveryOutbox).where(eq(siemDeliveryOutbox.connectionId, connection.id)).limit(500);
    return {
      connection: { id: connection.id, endpoint: connection.endpoint, status: connection.status, hasVaultReference: Boolean(connection.vaultSecretPath), lastTestedAt: connection.lastTestedAt, lastErrorCode: connection.lastErrorCode },
      settings: safeSettings(settings, fullRows), recent,
    };
  }),
  activate: protectedProcedure.input(organizationInput.extend({ connectionId: z.number().int().positive(), batchSize: z.number().int().min(1).max(100).default(25), maxAttempts: z.number().int().min(1).max(10).default(5) })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    if (process.env.NODE_ENV !== "production") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Publish the production site before activating Heartbeat-based continuous delivery." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [connection] = await db.select().from(enterpriseConnections).where(and(eq(enterpriseConnections.id, input.connectionId), eq(enterpriseConnections.organizationId, input.organizationId), eq(enterpriseConnections.kind, "splunk_hec"))).limit(1);
    if (!connection || connection.status !== "ready" || !connection.endpoint || !connection.vaultSecretPath) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Certify the Splunk HEC profile with a tenant Vault reference before enabling continuous delivery." });
    let [setting] = await db.select().from(siemDeliverySettings).where(eq(siemDeliverySettings.connectionId, connection.id)).limit(1);
    if (!setting) {
      const inserted = await db.insert(siemDeliverySettings).values({ organizationId: input.organizationId, connectionId: connection.id, batchSize: input.batchSize, maxAttempts: input.maxAttempts, createdBy: ctx.user.id });
      const id = Number((Array.isArray(inserted) ? inserted[0] : inserted).insertId);
      [setting] = await db.select().from(siemDeliverySettings).where(eq(siemDeliverySettings.id, id)).limit(1);
    }
    if (!setting) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Continuous-delivery settings could not be initialized." });
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    let taskUid = setting.scheduleCronTaskUid;
    if (taskUid) await updateHeartbeatJob(taskUid, { enable: true }, sessionToken);
    else {
      const job = await createHeartbeatJob({ name: `agentfence-siem-delivery-${input.organizationId}-${connection.id}`, cron: "0 * * * * *", path: "/api/scheduled/siem-delivery", description: "Deliver privacy-safe AgentFence audit envelopes to the certified Splunk HEC profile." }, sessionToken);
      taskUid = job.taskUid;
    }
    await db.update(siemDeliverySettings).set({ enabled: true, scheduleCronTaskUid: taskUid, batchSize: input.batchSize, maxAttempts: input.maxAttempts, lastDeliveryCode: "SCHEDULE_ACTIVE" }).where(eq(siemDeliverySettings.id, setting.id));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "siem.continuous_delivery_activated", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { connectionId: connection.id, batchSize: input.batchSize, maxAttempts: input.maxAttempts, scheduled: true } });
    return { enabled: true, scheduled: true };
  }),
  deactivate: protectedProcedure.input(organizationInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [setting] = await db.select().from(siemDeliverySettings).where(eq(siemDeliverySettings.organizationId, input.organizationId)).limit(1);
    if (!setting) return { success: true, alreadyInactive: true };
    if (setting.scheduleCronTaskUid && process.env.NODE_ENV === "production") {
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      await updateHeartbeatJob(setting.scheduleCronTaskUid, { enable: false }, sessionToken);
    }
    await db.update(siemDeliverySettings).set({ enabled: false, lastDeliveryCode: "SCHEDULE_PAUSED" }).where(eq(siemDeliverySettings.id, setting.id));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "siem.continuous_delivery_deactivated", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "blocked", payload: { connectionId: setting.connectionId } });
    return { success: true, alreadyInactive: false };
  }),
  flushNow: protectedProcedure.input(organizationInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [setting] = await db.select().from(siemDeliverySettings).where(and(eq(siemDeliverySettings.organizationId, input.organizationId), eq(siemDeliverySettings.enabled, true))).limit(1);
    if (!setting) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activate a certified continuous-delivery profile before requesting a flush." });
    return runSiemDelivery(setting.id);
  }),
});
