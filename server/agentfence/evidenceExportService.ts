import { and, desc, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { agents, approvals, auditEvents, auditExportSchedules, evidenceExports, organizations, policies } from "../../drizzle/schema";
import { appendAuditEvent } from "./audit";
import { consumeTenantQuota } from "./tenantQuotas";
import { getDb } from "../db";
import { storagePut } from "../storage";

export const EVIDENCE_FRAMEWORKS = ["SOC 2", "ISO 27001", "insurance review"] as const;
export type EvidenceFramework = (typeof EVIDENCE_FRAMEWORKS)[number];

function insertId(result: unknown) {
  const header = Array.isArray(result) ? result[0] as { insertId?: number } : result as { insertId?: number };
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id < 1) throw new Error("EVIDENCE_EXPORT_INSERT_FAILED");
  return id;
}

export function scheduledExportRunKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function createEvidenceExport(input: { organizationId: number; framework: EvidenceFramework; generatedBy: number; actorIdentity: string; scheduleId?: number; runKey?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  if (input.scheduleId && input.runKey) {
    const [existing] = await db.select().from(evidenceExports).where(and(eq(evidenceExports.scheduleId, input.scheduleId), eq(evidenceExports.scheduleRunKey, input.runKey))).limit(1);
    if (existing) return { exportId: existing.id, url: existing.storageUrl, evidenceHash: existing.evidenceHash, reused: true };
  }
  const quota = await consumeTenantQuota({ organizationId: input.organizationId, kind: "evidence_exports" });
  if (!quota.allowed) {
    const error = new Error("EVIDENCE_EXPORT_QUOTA_EXCEEDED");
    error.cause = quota;
    throw error;
  }
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
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
  const fileName = input.scheduleId && input.runKey
    ? `evidence/${input.organizationId}/${safeFramework}/scheduled/${input.scheduleId}/${input.runKey}.json`
    : `evidence/${input.organizationId}/${safeFramework}/manual/${Date.now()}.json`;
  const stored = await storagePut(fileName, Buffer.from(serialized), "application/json");
  try {
    const exportId = insertId(await db.insert(evidenceExports).values({ organizationId: input.organizationId, framework: input.framework, storageKey: stored.key, storageUrl: stored.url, evidenceHash, generatedBy: input.generatedBy, scheduleId: input.scheduleId ?? null, scheduleRunKey: input.runKey ?? null }));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "evidence.exported", actorType: input.scheduleId ? "system" : "user", actorIdentity: input.actorIdentity, outcome: "allowed", payload: { exportId, framework: input.framework, evidenceHash, scheduled: Boolean(input.scheduleId) } });
    return { exportId, url: stored.url, evidenceHash, reused: false };
  } catch (error) {
    if (input.scheduleId && input.runKey) {
      const [existing] = await db.select().from(evidenceExports).where(and(eq(evidenceExports.scheduleId, input.scheduleId), eq(evidenceExports.scheduleRunKey, input.runKey))).limit(1);
      if (existing) return { exportId: existing.id, url: existing.storageUrl, evidenceHash: existing.evidenceHash, reused: true };
    }
    throw error;
  }
}

export async function runScheduledEvidenceExport(scheduleId: number, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [schedule] = await db.select().from(auditExportSchedules).where(eq(auditExportSchedules.id, scheduleId)).limit(1);
  if (!schedule || schedule.status !== "active") return { skipped: "orphan_or_inactive" as const };
  if (schedule.deliveryMode !== "managed_archive") return { skipped: "customer_storage_activation_required" as const };
  try {
    const result = await createEvidenceExport({ organizationId: schedule.organizationId, framework: schedule.framework as EvidenceFramework, generatedBy: schedule.createdBy, actorIdentity: `schedule:${schedule.id}`, scheduleId: schedule.id, runKey: scheduledExportRunKey(now) });
    await db.update(auditExportSchedules).set({ lastRunAt: now, lastRunCode: result.reused ? "EXPORT_ALREADY_GENERATED" : "EXPORT_GENERATED", status: "active" }).where(eq(auditExportSchedules.id, schedule.id));
    return { ...result, skipped: null };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN_EXPORT_ERROR";
    await db.update(auditExportSchedules).set({ lastRunAt: now, lastRunCode: code, status: code === "EVIDENCE_EXPORT_QUOTA_EXCEEDED" ? "unhealthy" : "active" }).where(eq(auditExportSchedules.id, schedule.id));
    throw error;
  }
}
