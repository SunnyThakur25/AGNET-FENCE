import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { auditEvents, enterpriseConnections, notifications, siemDeliveryOutbox, siemDeliverySettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { createVaultAppRoleClient } from "./vaultClient";
import { isVaultPathForOrganization } from "./vaultContract";

const RETRYABLE = ["queued", "retrying"] as const;

type AuditEventRecord = typeof auditEvents.$inferSelect;

export function safeSiemEnvelope(event: AuditEventRecord) {
  const payloadHash = createHash("sha256").update(JSON.stringify(event.payload)).digest("hex");
  return {
    schema: "agentfence.siem-audit-envelope.v1",
    eventId: event.id,
    organizationId: event.organizationId,
    sequence: event.sequence,
    eventType: event.eventType,
    actorType: event.actorType,
    outcome: event.outcome,
    agentId: event.agentId,
    toolCallId: event.toolCallId,
    policyId: event.policyId,
    approvalId: event.approvalId,
    previousHash: event.previousHash,
    eventHash: event.eventHash,
    payloadHash,
    occurredAt: event.createdAt.toISOString(),
  };
}

export function nextSiemRetryAt(attempts: number, now = new Date()) {
  const minutes = Math.min(15, 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + minutes * 60_000);
}

export function splunkHecToken(secret: Record<string, unknown>) {
  const raw = secret.hec_token ?? secret.token;
  if (typeof raw !== "string" || raw.trim().length < 12) throw new Error("HEC_TOKEN_UNAVAILABLE");
  return raw.trim();
}

function isTenantSplunkVaultPath(path: string | null, organizationId: number) {
  return Boolean(path && isVaultPathForOrganization(path, organizationId) && path.startsWith(`agentfence/tenants/${organizationId}/integrations/splunk_hec/`));
}

function safeMetadata(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowed = new Set(["index", "source", "sourcetype", "host"]);
  return Object.fromEntries(Object.entries(source).filter(([key, item]) => allowed.has(key) && typeof item === "string" && item.trim().length > 0));
}

export async function enqueueSiemAuditEvents(settingId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [setting] = await db.select().from(siemDeliverySettings).where(eq(siemDeliverySettings.id, settingId)).limit(1);
  if (!setting || !setting.enabled) return { queued: 0, skipped: "disabled" as const };
  const events = await db.select().from(auditEvents).where(and(eq(auditEvents.organizationId, setting.organizationId), gt(auditEvents.sequence, setting.lastEnqueuedSequence))).orderBy(asc(auditEvents.sequence)).limit(250);
  let queued = 0;
  let lastSequence = setting.lastEnqueuedSequence;
  for (const event of events) {
    try {
      await db.insert(siemDeliveryOutbox).values({ organizationId: setting.organizationId, connectionId: setting.connectionId, auditEventId: event.id, safeEnvelope: safeSiemEnvelope(event) });
      queued += 1;
    } catch {
      // The per-connection/audit-event unique index makes repeated enqueue runs idempotent.
    }
    lastSequence = Math.max(lastSequence, event.sequence);
  }
  if (lastSequence > setting.lastEnqueuedSequence) await db.update(siemDeliverySettings).set({ lastEnqueuedSequence: lastSequence }).where(eq(siemDeliverySettings.id, setting.id));
  return { queued, skipped: null, lastSequence };
}

export async function flushSiemDelivery(settingId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [setting] = await db.select().from(siemDeliverySettings).where(eq(siemDeliverySettings.id, settingId)).limit(1);
  if (!setting || !setting.enabled) return { delivered: 0, retrying: 0, failed: 0, skipped: "disabled" as const };
  const [connection] = await db.select().from(enterpriseConnections).where(and(eq(enterpriseConnections.id, setting.connectionId), eq(enterpriseConnections.organizationId, setting.organizationId), eq(enterpriseConnections.kind, "splunk_hec"))).limit(1);
  if (!connection?.endpoint || connection.status !== "ready" || !isTenantSplunkVaultPath(connection.vaultSecretPath, setting.organizationId)) {
    await db.update(siemDeliverySettings).set({ lastDeliveryAt: new Date(), lastDeliveryCode: "SPLUNK_NOT_CERTIFIED_OR_VAULT_REFERENCE_INVALID" }).where(eq(siemDeliverySettings.id, setting.id));
    return { delivered: 0, retrying: 0, failed: 0, skipped: "activation_required" as const };
  }
  const vault = createVaultAppRoleClient();
  if (!vault.status.connected) {
    await db.update(siemDeliverySettings).set({ lastDeliveryAt: new Date(), lastDeliveryCode: "VAULT_APPROLE_NOT_ACTIVE" }).where(eq(siemDeliverySettings.id, setting.id));
    return { delivered: 0, retrying: 0, failed: 0, skipped: "activation_required" as const };
  }
  let token: string;
  try { token = splunkHecToken(await vault.readSecret(connection.vaultSecretPath!) as Record<string, unknown>); }
  catch {
    await db.update(siemDeliverySettings).set({ lastDeliveryAt: new Date(), lastDeliveryCode: "HEC_TOKEN_UNAVAILABLE" }).where(eq(siemDeliverySettings.id, setting.id));
    return { delivered: 0, retrying: 0, failed: 0, skipped: "activation_required" as const };
  }
  const now = new Date();
  const rows = await db.select().from(siemDeliveryOutbox).where(and(eq(siemDeliveryOutbox.connectionId, setting.connectionId), inArray(siemDeliveryOutbox.status, [...RETRYABLE]), lte(siemDeliveryOutbox.nextAttemptAt, now))).orderBy(asc(siemDeliveryOutbox.id)).limit(Math.min(100, setting.batchSize));
  let delivered = 0; let retrying = 0; let failed = 0; let lastCode = "NO_DUE_EVENTS";
  for (const row of rows) {
    const attempts = row.attempts + 1;
    let code = "HEC_UNREACHABLE";
    let accepted = false;
    try {
      const response = await fetch(connection.endpoint, { method: "POST", headers: { authorization: `Splunk ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ...safeMetadata(connection.safeConfig), source: "agentfence", sourcetype: "agentfence:audit", event: row.safeEnvelope }), signal: AbortSignal.timeout(8_000) });
      let payload: { code?: unknown } | null = null;
      try { payload = await response.json() as { code?: unknown }; } catch { payload = null; }
      accepted = response.ok && payload?.code === 0;
      code = accepted ? "HEC_EVENT_ACCEPTED" : `HEC_HTTP_${response.status}`;
    } catch { /* External endpoint errors are converted into bounded retry state. */ }
    lastCode = code;
    if (accepted) {
      delivered += 1;
      await db.update(siemDeliveryOutbox).set({ status: "delivered", attempts, deliveredAt: now, lastAttemptAt: now, lastDeliveryCode: code }).where(eq(siemDeliveryOutbox.id, row.id));
    } else if (attempts >= setting.maxAttempts) {
      failed += 1;
      await db.update(siemDeliveryOutbox).set({ status: "failed", attempts, lastAttemptAt: now, lastDeliveryCode: code }).where(eq(siemDeliveryOutbox.id, row.id));
    } else {
      retrying += 1;
      await db.update(siemDeliveryOutbox).set({ status: "retrying", attempts, nextAttemptAt: nextSiemRetryAt(attempts, now), lastAttemptAt: now, lastDeliveryCode: code }).where(eq(siemDeliveryOutbox.id, row.id));
    }
  }
  if (failed > 0) {
    const existing = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.organizationId, setting.organizationId), eq(notifications.relatedType, "siem_delivery"), eq(notifications.relatedId, setting.id), isNull(notifications.readAt))).limit(1);
    if (!existing[0]) await db.insert(notifications).values({ organizationId: setting.organizationId, severity: "high", title: "Continuous SIEM delivery requires attention", content: `${failed} audit envelope(s) reached the configured retry limit. Review delivery evidence and the certified Splunk HEC profile.`, relatedType: "siem_delivery", relatedId: setting.id });
  }
  await db.update(siemDeliverySettings).set({ lastDeliveryAt: now, lastDeliveryCode: lastCode }).where(eq(siemDeliverySettings.id, setting.id));
  return { delivered, retrying, failed, skipped: null, due: rows.length };
}

export async function runSiemDelivery(settingId: number) {
  const queued = await enqueueSiemAuditEvents(settingId);
  const delivery = await flushSiemDelivery(settingId);
  return { queued, delivery };
}
