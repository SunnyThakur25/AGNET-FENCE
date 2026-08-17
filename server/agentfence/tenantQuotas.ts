import { and, eq, sql } from "drizzle-orm";
import { tenantQuotaPolicies, tenantUsageWindows } from "../../drizzle/schema";
import { getDb } from "../db";

export type TenantUsageKind = "gateway_evaluations" | "evidence_exports";

export const DEFAULT_TENANT_QUOTAS = {
  gatewayEvaluationsPerMinute: 600,
  evidenceExportsPerDay: 24,
} as const;

export function usageWindowStart(kind: TenantUsageKind, now = new Date()) {
  const start = new Date(now);
  if (kind === "gateway_evaluations") start.setUTCSeconds(0, 0);
  else start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function quotaLimitForKind(quotas: { gatewayEvaluationsPerMinute: number; evidenceExportsPerDay: number }, kind: TenantUsageKind) {
  return kind === "gateway_evaluations" ? quotas.gatewayEvaluationsPerMinute : quotas.evidenceExportsPerDay;
}

export async function getTenantQuotaPolicy(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(tenantQuotaPolicies).where(eq(tenantQuotaPolicies.organizationId, organizationId)).limit(1);
  return row ?? { organizationId, ...DEFAULT_TENANT_QUOTAS, id: null, updatedBy: null, createdAt: null, updatedAt: null };
}

/**
 * Atomically increments a tenant-owned window before work begins. Excess
 * requests are counted but never execute the governed action or generate data.
 */
export async function consumeTenantQuota(input: { organizationId: number; kind: TenantUsageKind; now?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const quotas = await getTenantQuotaPolicy(input.organizationId);
  const limit = quotaLimitForKind(quotas, input.kind);
  const windowStartedAt = usageWindowStart(input.kind, input.now);
  await db.insert(tenantUsageWindows).values({ organizationId: input.organizationId, kind: input.kind, windowStartedAt, usedCount: 1 }).onDuplicateKeyUpdate({
    set: { usedCount: sql`${tenantUsageWindows.usedCount} + 1` },
  });
  const [usage] = await db.select().from(tenantUsageWindows).where(and(
    eq(tenantUsageWindows.organizationId, input.organizationId),
    eq(tenantUsageWindows.kind, input.kind),
    eq(tenantUsageWindows.windowStartedAt, windowStartedAt),
  )).limit(1);
  const used = usage?.usedCount ?? 1;
  return { allowed: used <= limit, used, limit, windowStartedAt, remaining: Math.max(0, limit - used) };
}

export async function getTenantUsageSnapshot(organizationId: number, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const quotas = await getTenantQuotaPolicy(organizationId);
  const [gateway, exports] = await Promise.all([
    db.select().from(tenantUsageWindows).where(and(eq(tenantUsageWindows.organizationId, organizationId), eq(tenantUsageWindows.kind, "gateway_evaluations"), eq(tenantUsageWindows.windowStartedAt, usageWindowStart("gateway_evaluations", now)))).limit(1),
    db.select().from(tenantUsageWindows).where(and(eq(tenantUsageWindows.organizationId, organizationId), eq(tenantUsageWindows.kind, "evidence_exports"), eq(tenantUsageWindows.windowStartedAt, usageWindowStart("evidence_exports", now)))).limit(1),
  ]);
  return {
    quotas,
    gatewayEvaluations: { used: gateway[0]?.usedCount ?? 0, limit: quotas.gatewayEvaluationsPerMinute, windowStartedAt: usageWindowStart("gateway_evaluations", now) },
    evidenceExports: { used: exports[0]?.usedCount ?? 0, limit: quotas.evidenceExportsPerDay, windowStartedAt: usageWindowStart("evidence_exports", now) },
  };
}
