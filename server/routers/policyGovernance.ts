import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { policies, policyRevisions } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { requireOrganizationRole } from "../agentfence/authz";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const policySnapshotInput = z.object({
  teamId: z.number().int().positive().nullable().optional(),
  agentId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().max(2000).nullable().optional(),
  effect: z.enum(["allow", "deny", "require_approval"]),
  toolPattern: z.string().min(1).max(120),
  actionPattern: z.string().min(1).max(120),
  parameterConstraints: z.array(z.object({ field: z.string().min(1), operator: z.enum(["equals", "exists", "gt", "includes"]), value: z.union([z.string(), z.number(), z.boolean()]).optional() })).max(10).default([]),
  dataSensitivity: z.enum(["any", "public", "internal", "pii", "phi", "payment", "secret"]),
  destinationPattern: z.string().min(1).max(180),
  priority: z.number().int().min(0).max(1000),
});
type PolicySnapshot = z.infer<typeof policySnapshotInput>;

function snapshotFromPolicy(policy: typeof policies.$inferSelect): PolicySnapshot {
  return {
    teamId: policy.teamId,
    agentId: policy.agentId,
    name: policy.name,
    description: policy.description,
    effect: policy.effect,
    toolPattern: policy.toolPattern,
    actionPattern: policy.actionPattern,
    parameterConstraints: (policy.parameterConstraints as PolicySnapshot["parameterConstraints"]) ?? [],
    dataSensitivity: policy.dataSensitivity as PolicySnapshot["dataSensitivity"],
    destinationPattern: policy.destinationPattern,
    priority: policy.priority,
  };
}

export function diffPolicySnapshot(current: PolicySnapshot, proposed: PolicySnapshot) {
  return (Object.keys(proposed) as Array<keyof PolicySnapshot>).flatMap(field => {
    const before = JSON.stringify(current[field] ?? null);
    const after = JSON.stringify(proposed[field] ?? null);
    return before === after ? [] : [{ field, before: current[field] ?? null, after: proposed[field] ?? null }];
  });
}

export function assertIndependentPolicyReview(proposedByUserId: number, reviewerUserId: number) {
  if (proposedByUserId === reviewerUserId) throw new TRPCError({ code: "FORBIDDEN", message: "A different administrator must review this policy change." });
}

export function assertPromotionBaseRevision(currentRevision: number, baseRevision: number) {
  if (currentRevision !== baseRevision) throw new TRPCError({ code: "CONFLICT", message: "The active policy changed after review. Create a new proposal." });
}

async function policyForOrganization(organizationId: number, policyId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [policy] = await db.select().from(policies).where(and(eq(policies.id, policyId), eq(policies.organizationId, organizationId))).limit(1);
  if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found in this organization." });
  return { db, policy };
}

export const policyGovernanceRouter = router({
  list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin", "operator", "viewer"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const revisions = await db.select().from(policyRevisions).where(eq(policyRevisions.organizationId, input.organizationId)).orderBy(desc(policyRevisions.createdAt));
    const policyRows = await db.select().from(policies).where(eq(policies.organizationId, input.organizationId));
    const byId = new Map(policyRows.map(policy => [policy.id, policy]));
    return revisions.map(revision => {
      const policy = byId.get(revision.policyId);
      const proposed = revision.snapshot as PolicySnapshot;
      const current = policy ? snapshotFromPolicy(policy) : proposed;
      return { ...revision, policyName: policy?.name ?? proposed.name, diff: diffPolicySnapshot(current, proposed), currentRevision: policy?.currentRevision ?? 0 };
    });
  }),

  propose: protectedProcedure.input(organizationInput.extend({
    policyId: z.number().int().positive(),
    baseRevision: z.number().int().min(0),
    changeSummary: z.string().trim().min(5).max(500),
    snapshot: policySnapshotInput,
  })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
    const { db, policy } = await policyForOrganization(input.organizationId, input.policyId);
    if (policy.currentRevision !== input.baseRevision) throw new TRPCError({ code: "CONFLICT", message: "The policy changed since this draft began. Refresh and create a new proposal." });
    const revisions = await db.select({ revision: policyRevisions.revision }).from(policyRevisions).where(eq(policyRevisions.policyId, policy.id)).orderBy(desc(policyRevisions.revision)).limit(1);
    const revision = (revisions[0]?.revision ?? policy.currentRevision) + 1;
    const current = snapshotFromPolicy(policy);
    if (!diffPolicySnapshot(current, input.snapshot).length) throw new TRPCError({ code: "BAD_REQUEST", message: "The proposed snapshot has no policy changes." });
    const result = await db.insert(policyRevisions).values({ organizationId: input.organizationId, policyId: policy.id, revision, baseRevision: policy.currentRevision, status: "pending_review", changeSummary: input.changeSummary, snapshot: input.snapshot, createdBy: ctx.user.id });
    const header = Array.isArray(result) ? result[0] : result;
    const revisionId = Number((header as { insertId?: number }).insertId);
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "policy.revision_proposed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, policyId: policy.id, outcome: "approval_required", payload: { revision, baseRevision: policy.currentRevision, changeSummary: input.changeSummary } });
    return { revisionId, revision };
  }),

  review: protectedProcedure.input(organizationInput.extend({ revisionId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), comment: z.string().trim().min(3).max(2000) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [revision] = await db.select().from(policyRevisions).where(and(eq(policyRevisions.id, input.revisionId), eq(policyRevisions.organizationId, input.organizationId))).limit(1);
    if (!revision) throw new TRPCError({ code: "NOT_FOUND", message: "Policy revision not found." });
    if (revision.status !== "pending_review") throw new TRPCError({ code: "CONFLICT", message: "Only pending revisions can be reviewed." });
    assertIndependentPolicyReview(revision.createdBy, ctx.user.id);
    await db.update(policyRevisions).set({ status: input.decision, reviewedBy: ctx.user.id, reviewComment: input.comment, reviewedAt: new Date() }).where(eq(policyRevisions.id, revision.id));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: `policy.revision_${input.decision}`, actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, policyId: revision.policyId, outcome: input.decision === "approved" ? "allowed" : "blocked", payload: { revision: revision.revision, comment: input.comment } });
    return { success: true };
  }),

  promote: protectedProcedure.input(organizationInput.extend({ revisionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [revision] = await db.select().from(policyRevisions).where(and(eq(policyRevisions.id, input.revisionId), eq(policyRevisions.organizationId, input.organizationId))).limit(1);
    if (!revision || revision.status !== "approved") throw new TRPCError({ code: "CONFLICT", message: "An approved policy revision is required for promotion." });
    const { policy } = await policyForOrganization(input.organizationId, revision.policyId);
    assertPromotionBaseRevision(policy.currentRevision, revision.baseRevision);
    const snapshot = revision.snapshot as PolicySnapshot;
    await db.update(policies).set({ ...snapshot, status: "active", currentRevision: revision.revision }).where(eq(policies.id, policy.id));
    await db.update(policyRevisions).set({ status: "promoted", promotedAt: new Date() }).where(eq(policyRevisions.id, revision.id));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "policy.revision_promoted", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, policyId: policy.id, outcome: "allowed", payload: { revision: revision.revision, reviewedBy: revision.reviewedBy } });
    return { success: true };
  }),

  rollbackProposal: protectedProcedure.input(organizationInput.extend({ policyId: z.number().int().positive(), sourceRevisionId: z.number().int().positive(), changeSummary: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin"]);
    const { db, policy } = await policyForOrganization(input.organizationId, input.policyId);
    const [source] = await db.select().from(policyRevisions).where(and(eq(policyRevisions.id, input.sourceRevisionId), eq(policyRevisions.policyId, policy.id), eq(policyRevisions.organizationId, input.organizationId))).limit(1);
    if (!source || source.status !== "promoted") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a previously promoted revision can be used as a rollback source." });
    const revisions = await db.select({ revision: policyRevisions.revision }).from(policyRevisions).where(eq(policyRevisions.policyId, policy.id)).orderBy(desc(policyRevisions.revision)).limit(1);
    const revision = (revisions[0]?.revision ?? policy.currentRevision) + 1;
    const result = await db.insert(policyRevisions).values({ organizationId: input.organizationId, policyId: policy.id, revision, baseRevision: policy.currentRevision, status: "pending_review", changeSummary: input.changeSummary, snapshot: source.snapshot, createdBy: ctx.user.id });
    const header = Array.isArray(result) ? result[0] : result;
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "policy.rollback_proposed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, policyId: policy.id, outcome: "approval_required", payload: { sourceRevision: source.revision, revision } });
    return { revisionId: Number((header as { insertId?: number }).insertId), revision };
  }),
});
