import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { operationalResilienceProfiles } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { requireOrganizationRole } from "../agentfence/authz";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const outcome = z.enum(["passed", "failed", "partial"]);

export function safeReference(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length < 4 || normalized.length > 500 || /(?:token|secret|password|api[_-]?key|signature|sig=)/i.test(normalized)) throw new TRPCError({ code: "BAD_REQUEST", message: "Evidence references must be non-secret locations or identifiers." });
  return normalized;
}

async function requireAdmin(organizationId: number, userId: number) { await requireOrganizationRole(organizationId, userId, ["admin"]); }

function safeProfile(row: typeof operationalResilienceProfiles.$inferSelect | undefined) {
  if (!row) return null;
  return { id: row.id, ownerName: row.ownerName, backupProvider: row.backupProvider, backupEvidenceReference: row.backupEvidenceReference, runbookReference: row.runbookReference, rtoMinutes: row.rtoMinutes, rpoMinutes: row.rpoMinutes, availabilitySloBasisPoints: row.availabilitySloBasisPoints, status: row.status, lastExerciseOutcome: row.lastExerciseOutcome, lastExerciseAt: row.lastExerciseAt, lastExerciseEvidenceReference: row.lastExerciseEvidenceReference, lastExerciseNotes: row.lastExerciseNotes, updatedAt: row.updatedAt };
}

export const operationalReadinessRouter = router({
  get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [profile] = await db.select().from(operationalResilienceProfiles).where(eq(operationalResilienceProfiles.organizationId, input.organizationId)).limit(1);
    const configured = (name: "OIDC_ISSUER" | "OIDC_CLIENT_ID" | "OIDC_CLIENT_SECRET" | "SCIM_BASE_URL" | "SCIM_BEARER_TOKEN") => Boolean(process.env[name]);
    return {
      profile: safeProfile(profile),
      identity: {
        oidc: { issuerConfigured: configured("OIDC_ISSUER"), clientIdConfigured: configured("OIDC_CLIENT_ID"), clientSecretConfigured: configured("OIDC_CLIENT_SECRET"), liveFederation: false },
        scim: { baseUrlConfigured: configured("SCIM_BASE_URL"), bearerTokenConfigured: configured("SCIM_BEARER_TOKEN"), liveProvisioning: false },
        boundary: "Configuration readiness does not mean live federation or provisioning. Customer IdP registration, redirect, lifecycle mapping, and production test evidence remain required.",
      },
      boundary: "Declared targets and operator-reported exercise evidence are not provider-verified backup, restore, or disaster-recovery guarantees.",
    };
  }),
  declare: protectedProcedure.input(organizationInput.extend({
    ownerName: z.string().trim().min(2).max(120), backupProvider: z.string().trim().min(2).max(120), backupEvidenceReference: z.string().trim().max(500).optional(), runbookReference: z.string().trim().max(500).optional(),
    rtoMinutes: z.number().int().min(1).max(525_600), rpoMinutes: z.number().int().min(1).max(525_600), availabilitySloBasisPoints: z.number().int().min(9_000).max(10_000),
  })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const values = { ownerName: input.ownerName, backupProvider: input.backupProvider, backupEvidenceReference: safeReference(input.backupEvidenceReference), runbookReference: safeReference(input.runbookReference), rtoMinutes: input.rtoMinutes, rpoMinutes: input.rpoMinutes, availabilitySloBasisPoints: input.availabilitySloBasisPoints, status: "declared" as const };
    await db.insert(operationalResilienceProfiles).values({ organizationId: input.organizationId, ...values, declaredBy: ctx.user.id }).onDuplicateKeyUpdate({ set: values });
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "resilience.targets_declared", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { rtoMinutes: input.rtoMinutes, rpoMinutes: input.rpoMinutes, availabilitySloBasisPoints: input.availabilitySloBasisPoints, backupProvider: input.backupProvider, hasBackupEvidenceReference: Boolean(values.backupEvidenceReference), hasRunbookReference: Boolean(values.runbookReference) } });
    return { success: true };
  }),
  recordExercise: protectedProcedure.input(organizationInput.extend({ outcome, evidenceReference: z.string().trim().min(4).max(500), notes: z.string().trim().min(10).max(2_000) })).mutation(async ({ ctx, input }) => {
    await requireAdmin(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [profile] = await db.select().from(operationalResilienceProfiles).where(eq(operationalResilienceProfiles.organizationId, input.organizationId)).limit(1);
    if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Declare resilience targets before recording a customer-led exercise." });
    const evidence = safeReference(input.evidenceReference);
    const status = input.outcome === "passed" ? "exercise_recorded" as const : "needs_remediation" as const;
    await db.update(operationalResilienceProfiles).set({ status, lastExerciseOutcome: input.outcome, lastExerciseAt: new Date(), lastExerciseEvidenceReference: evidence, lastExerciseNotes: input.notes }).where(and(eq(operationalResilienceProfiles.id, profile.id), eq(operationalResilienceProfiles.organizationId, input.organizationId)));
    await appendAuditEvent({ organizationId: input.organizationId, eventType: "resilience.exercise_recorded", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: input.outcome === "passed" ? "allowed" : "approval_required", payload: { outcome: input.outcome, hasEvidenceReference: Boolean(evidence), notesHash: input.notes.length } });
    return { success: true, status };
  }),
});
