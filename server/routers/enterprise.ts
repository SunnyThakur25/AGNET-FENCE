import { createHash, randomBytes } from "crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { enterpriseConnections, organizationBilling, organizations, teamInvitations, teamMemberships, teams, users } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { isVaultPathForOrganization } from "../agentfence/vaultContract";
import { createVaultAppRoleClient } from "../agentfence/vaultClient";
import { BILLING_PLANS, createBillingPortal, createSubscriptionCheckout, isBillingPlanKey } from "../agentfence/billing";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const connectionKind = z.enum(["splunk_hec", "microsoft_sentinel", "pagerduty_events", "oidc", "scim", "vault_approle"]);
const connectionStatus = z.enum(["not_configured", "pending_activation", "ready", "unhealthy"]);
const membershipRole = z.enum(["admin", "operator", "viewer", "billing_admin"]);

function insertId(result: unknown) {
  const header = Array.isArray(result) ? result[0] as { insertId?: number } : result as { insertId?: number };
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id < 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The requested record could not be created." });
  return id;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEnterpriseHttpsEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new TRPCError({ code: "BAD_REQUEST", message: "Enterprise endpoints must use HTTPS." });
  return url.toString().replace(/\/$/, "");
}

function requiredVaultPrefix(organizationId: number, kind: string) {
  return `agentfence/tenants/${organizationId}/integrations/${kind}/`;
}

export function isEnterpriseSecretReferenceAllowed(path: string, organizationId: number, kind: string) {
  return isVaultPathForOrganization(path, organizationId) && path.startsWith(requiredVaultPrefix(organizationId, kind));
}

function toSafeConnection(row: typeof enterpriseConnections.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.displayName,
    endpoint: row.endpoint,
    safeConfig: row.safeConfig as Record<string, string> | null,
    status: row.status,
    hasVaultReference: Boolean(row.vaultSecretPath),
    lastTestedAt: row.lastTestedAt,
    lastErrorCode: row.lastErrorCode,
    updatedAt: row.updatedAt,
  };
}

async function organizationAdmin(organizationId: number, userId: number) {
  await requireOrganizationRole(organizationId, userId, ["admin"]);
}

export const enterpriseRouter = router({
  plans: protectedProcedure.query(() => ({ plans: Object.values(BILLING_PLANS) })),

  connections: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await organizationAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const rows = await db.select().from(enterpriseConnections).where(eq(enterpriseConnections.organizationId, input.organizationId));
      return rows.map(toSafeConnection);
    }),
    save: protectedProcedure.input(organizationInput.extend({
      kind: connectionKind,
      displayName: z.string().trim().min(2).max(120),
      endpoint: z.string().trim().url().max(500).optional(),
      safeConfig: z.record(z.string(), z.string().max(240)).optional(),
      vaultSecretPath: z.string().trim().min(10).max(255).optional(),
    })).mutation(async ({ ctx, input }) => {
      await organizationAdmin(input.organizationId, ctx.user.id);
      const endpoint = input.endpoint ? normalizeEnterpriseHttpsEndpoint(input.endpoint) : null;
      if (input.vaultSecretPath && !isEnterpriseSecretReferenceAllowed(input.vaultSecretPath, input.organizationId, input.kind)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Integration secret references must stay in this organization’s integration Vault path." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.insert(enterpriseConnections).values({
        organizationId: input.organizationId,
        kind: input.kind,
        displayName: input.displayName,
        endpoint,
        safeConfig: input.safeConfig ?? null,
        vaultSecretPath: input.vaultSecretPath ?? null,
        status: endpoint || input.vaultSecretPath ? "pending_activation" : "not_configured",
        createdBy: ctx.user.id,
      }).onDuplicateKeyUpdate({ set: {
        displayName: input.displayName,
        endpoint,
        safeConfig: input.safeConfig ?? null,
        vaultSecretPath: input.vaultSecretPath ?? null,
        status: endpoint || input.vaultSecretPath ? "pending_activation" : "not_configured",
        lastErrorCode: null,
      } });
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "enterprise_connection.configured", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { kind: input.kind, hasEndpoint: Boolean(endpoint), hasVaultReference: Boolean(input.vaultSecretPath) } });
      return { success: true };
    }),
    test: protectedProcedure.input(organizationInput.extend({ kind: connectionKind })).mutation(async ({ ctx, input }) => {
      await organizationAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const rows = await db.select().from(enterpriseConnections).where(and(eq(enterpriseConnections.organizationId, input.organizationId), eq(enterpriseConnections.kind, input.kind))).limit(1);
      const connection = rows[0];
      if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Save this connection profile before testing it." });
      let status: "pending_activation" | "ready" | "unhealthy" = "pending_activation";
      let code: string | null = "CREDENTIAL_ACTIVATION_REQUIRED";
      if (input.kind === "vault_approle") {
        const probe = await createVaultAppRoleClient().probe();
        status = probe.reachable ? "ready" : "unhealthy";
        code = probe.reachable ? null : probe.detail;
      } else if (input.kind === "oidc" && connection.endpoint) {
        try {
          const response = await fetch(`${connection.endpoint}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5_000) });
          const metadata = await response.json() as { issuer?: string; authorization_endpoint?: string; token_endpoint?: string; jwks_uri?: string };
          const valid = response.ok && metadata.issuer === connection.endpoint && Boolean(metadata.authorization_endpoint && metadata.token_endpoint && metadata.jwks_uri);
          status = valid ? "ready" : "unhealthy";
          code = valid ? null : "OIDC_DISCOVERY_INVALID";
        } catch {
          status = "unhealthy";
          code = "OIDC_DISCOVERY_UNREACHABLE";
        }
      }
      await db.update(enterpriseConnections).set({ status, lastTestedAt: new Date(), lastErrorCode: code }).where(eq(enterpriseConnections.id, connection.id));
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "enterprise_connection.tested", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: status === "ready" ? "allowed" : "approval_required", payload: { kind: input.kind, status, code } });
      return { status, code, detail: status === "ready" ? "Connection preflight completed." : "Endpoint profile is saved; customer-controlled credentials or service activation is still required." };
    }),
  }),

  teams: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select().from(teams).where(eq(teams.organizationId, input.organizationId));
    }),
    create: protectedProcedure.input(organizationInput.extend({ name: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
      await organizationAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const teamId = insertId(await db.insert(teams).values({ organizationId: input.organizationId, name: input.name }));
      await db.insert(teamMemberships).values({ organizationId: input.organizationId, teamId, userId: ctx.user.id, role: "admin" });
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "team.created", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { teamId, name: input.name } });
      return { teamId };
    }),
    members: protectedProcedure.input(organizationInput.extend({ teamId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      return db.select({ membershipId: teamMemberships.id, userId: users.id, name: users.name, email: users.email, role: teamMemberships.role, createdAt: teamMemberships.createdAt }).from(teamMemberships).innerJoin(users, eq(teamMemberships.userId, users.id)).where(and(eq(teamMemberships.organizationId, input.organizationId), eq(teamMemberships.teamId, input.teamId)));
    }),
    setRole: protectedProcedure.input(organizationInput.extend({ teamId: z.number().int().positive(), membershipId: z.number().int().positive(), role: membershipRole })).mutation(async ({ ctx, input }) => {
      await organizationAdmin(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const rows = await db.select().from(teamMemberships).where(and(eq(teamMemberships.id, input.membershipId), eq(teamMemberships.organizationId, input.organizationId), eq(teamMemberships.teamId, input.teamId))).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Team membership not found." });
      if (rows[0].role === "admin" && input.role !== "admin") {
        const admins = await db.select().from(teamMemberships).where(and(eq(teamMemberships.organizationId, input.organizationId), eq(teamMemberships.teamId, input.teamId), eq(teamMemberships.role, "admin")));
        if (admins.length < 2) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A team must retain at least one administrator." });
      }
      await db.update(teamMemberships).set({ role: input.role }).where(eq(teamMemberships.id, input.membershipId));
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "team.member_role_changed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { teamId: input.teamId, membershipId: input.membershipId, role: input.role } });
      return { success: true };
    }),
    invitations: router({
      list: protectedProcedure.input(organizationInput.extend({ teamId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        await organizationAdmin(input.organizationId, ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        return db.select({ id: teamInvitations.id, email: teamInvitations.email, role: teamInvitations.role, expiresAt: teamInvitations.expiresAt, acceptedAt: teamInvitations.acceptedAt, revokedAt: teamInvitations.revokedAt, createdAt: teamInvitations.createdAt }).from(teamInvitations).where(and(eq(teamInvitations.organizationId, input.organizationId), eq(teamInvitations.teamId, input.teamId))).orderBy(desc(teamInvitations.createdAt));
      }),
      create: protectedProcedure.input(organizationInput.extend({ teamId: z.number().int().positive(), email: z.string().trim().email().max(320), role: membershipRole })).mutation(async ({ ctx, input }) => {
        await organizationAdmin(input.organizationId, ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const team = await db.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.organizationId, input.organizationId))).limit(1);
        if (!team[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found in this organization." });
        const plaintextToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const inviteId = insertId(await db.insert(teamInvitations).values({ organizationId: input.organizationId, teamId: input.teamId, email: input.email.toLowerCase(), role: input.role, tokenHash: tokenHash(plaintextToken), expiresAt, createdBy: ctx.user.id }));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "team.invited", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { inviteId, teamId: input.teamId, role: input.role, emailDomain: input.email.split("@")[1] ?? "unknown" } });
        return { inviteId, expiresAt, token: plaintextToken };
      }),
      revoke: protectedProcedure.input(organizationInput.extend({ invitationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await organizationAdmin(input.organizationId, ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        await db.update(teamInvitations).set({ revokedAt: new Date() }).where(and(eq(teamInvitations.id, input.invitationId), eq(teamInvitations.organizationId, input.organizationId), isNull(teamInvitations.acceptedAt)));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "team.invitation_revoked", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "allowed", payload: { invitationId: input.invitationId } });
        return { success: true };
      }),
      accept: protectedProcedure.input(z.object({ token: z.string().min(20).max(128) })).mutation(async ({ ctx, input }) => {
        if (!ctx.user.email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An email address is required to accept a team invitation." });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const rows = await db.select().from(teamInvitations).where(eq(teamInvitations.tokenHash, tokenHash(input.token))).limit(1);
        const invitation = rows[0];
        if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date() || invitation.email.toLowerCase() !== ctx.user.email.toLowerCase()) throw new TRPCError({ code: "FORBIDDEN", message: "This invitation is not valid for the signed-in account." });
        await db.insert(teamMemberships).values({ organizationId: invitation.organizationId, teamId: invitation.teamId, userId: ctx.user.id, role: invitation.role }).onDuplicateKeyUpdate({ set: { role: invitation.role } });
        await db.update(teamInvitations).set({ acceptedAt: new Date() }).where(eq(teamInvitations.id, invitation.id));
        await appendAuditEvent({ organizationId: invitation.organizationId, eventType: "team.invitation_accepted", actorType: "user", actorIdentity: ctx.user.email, outcome: "allowed", payload: { inviteId: invitation.id, teamId: invitation.teamId, role: invitation.role } });
        return { organizationId: invitation.organizationId, teamId: invitation.teamId };
      }),
    }),
  }),

  billing: router({
    get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin", "billing_admin"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const rows = await db.select().from(organizationBilling).where(eq(organizationBilling.organizationId, input.organizationId)).limit(1);
      return { plan: rows[0]?.plan ?? "pilot", hasStripeCustomer: Boolean(rows[0]?.stripeCustomerId), plans: Object.values(BILLING_PLANS) };
    }),
    checkout: protectedProcedure.input(organizationInput.extend({ plan: z.enum(["pilot", "growth"]) })).mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin", "billing_admin"]);
      try {
        const url = await createSubscriptionCheckout({ organizationId: input.organizationId, userId: ctx.user.id, customerEmail: ctx.user.email, customerName: ctx.user.name, plan: input.plan, origin: ctx.req.headers.origin });
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "billing.checkout_started", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "approval_required", payload: { plan: input.plan } });
        return { url };
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Stripe Checkout could not be started." });
      }
    }),
    portal: protectedProcedure.input(organizationInput).mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(input.organizationId, ctx.user.id, ["admin", "billing_admin"]);
      try {
        return { url: await createBillingPortal({ organizationId: input.organizationId, origin: ctx.req.headers.origin }) };
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Billing portal could not be opened." });
      }
    }),
  }),
});
