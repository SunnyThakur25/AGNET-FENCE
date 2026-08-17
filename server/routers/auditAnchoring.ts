import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditAnchors, auditEvents } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const retentionProvider = z.enum(["s3_object_lock", "azure_immutable_blob", "gcs_bucket_lock", "other_worm"]);
const retentionMode = z.enum(["governance", "compliance", "time_based", "legal_hold", "locked_retention"]);

function anchorHash(input: Record<string, unknown>) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }

export function normalizeRetentionReference(input: string) {
  const value = input.trim();
  if (!value || value.length > 500 || /(?:token|secret|password|apikey|signature|sig=|x-amz-credential)/i.test(value)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a non-secret immutable-retention location reference only." });
  }
  if (value.startsWith("s3://") || value.startsWith("gs://")) return value.replace(/\/+$/, "");
  let url: URL;
  try { url = new URL(value); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Use an HTTPS location, s3://, or gs:// reference without credentials." }); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Retention references must be credential-free HTTPS locations." });
  return url.toString().replace(/\/$/, "");
}

function safeAnchor(row: typeof auditAnchors.$inferSelect) {
  return {
    id: row.id, ledgerSequence: row.ledgerSequence, ledgerEventHash: row.ledgerEventHash, anchorHash: row.anchorHash,
    storageUrl: row.storageUrl, status: row.status, externalProvider: row.externalProvider, externalReference: row.externalReference,
    retentionMode: row.retentionMode, receiptRecordedAt: row.receiptRecordedAt, createdAt: row.createdAt,
  };
}

export const auditAnchoringRouter = router({
  list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireOrganizationMembership(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const rows = await db.select().from(auditAnchors).where(eq(auditAnchors.organizationId, input.organizationId)).orderBy(desc(auditAnchors.createdAt));
    return rows.map(safeAnchor);
  }),
  prepare: protectedProcedure.input(organizationInput).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "audit.anchor_preparation_requested", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { retentionState: "export_ready_only" } });
    const [head] = await db.select().from(auditEvents).where(eq(auditEvents.organizationId, input.organizationId)).orderBy(desc(auditEvents.sequence)).limit(1);
    if (!head) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A ledger head is required before an audit anchor can be prepared." });
    const [existing] = await db.select().from(auditAnchors).where(and(eq(auditAnchors.organizationId, input.organizationId), eq(auditAnchors.ledgerSequence, head.sequence))).limit(1);
    if (existing) return safeAnchor(existing);
    const proof = {
      schema: "agentfence.audit-anchor.v1", organizationId: input.organizationId,
      ledgerHead: { sequence: head.sequence, eventHash: head.eventHash, previousHash: head.previousHash, createdAt: head.createdAt.toISOString() },
      preparedAt: new Date().toISOString(),
      boundary: "This export-ready proof bundle is not independently immutable until retained under a customer-controlled WORM policy.",
    };
    const hash = anchorHash(proof);
    const stored = await storagePut(`audit-anchors/org-${input.organizationId}/ledger-${head.sequence}-${hash}.json`, JSON.stringify({ ...proof, anchorHash: hash }, null, 2), "application/json");
    const result = await db.insert(auditAnchors).values({ organizationId: input.organizationId, ledgerSequence: head.sequence, ledgerEventHash: head.eventHash, anchorHash: hash, storageKey: stored.key, storageUrl: stored.url, createdBy: ctx.user.id });
    const id = Number((Array.isArray(result) ? result[0] : result).insertId);
    const [created] = await db.select().from(auditAnchors).where(eq(auditAnchors.id, id)).limit(1);
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The prepared audit anchor could not be loaded." });
    return safeAnchor(created);
  }),
  recordExternalReceipt: protectedProcedure.input(organizationInput.extend({
    anchorId: z.number().int().positive(), provider: retentionProvider, externalReference: z.string().trim().min(4).max(500), retentionMode,
  })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [anchor] = await db.select().from(auditAnchors).where(and(eq(auditAnchors.id, input.anchorId), eq(auditAnchors.organizationId, input.organizationId))).limit(1);
    if (!anchor) throw new TRPCError({ code: "NOT_FOUND", message: "Audit anchor was not found in this organization." });
    const externalReference = normalizeRetentionReference(input.externalReference);
    await db.update(auditAnchors).set({ status: "external_receipt_recorded", externalProvider: input.provider, externalReference, retentionMode: input.retentionMode, receiptRecordedBy: ctx.user.id, receiptRecordedAt: new Date() }).where(eq(auditAnchors.id, anchor.id));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "audit.anchor_external_receipt_recorded", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { anchorId: anchor.id, ledgerSequence: anchor.ledgerSequence, provider: input.provider, retentionMode: input.retentionMode } });
    const [updated] = await db.select().from(auditAnchors).where(eq(auditAnchors.id, anchor.id)).limit(1);
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The audit anchor receipt could not be loaded." });
    return safeAnchor(updated);
  }),
});
