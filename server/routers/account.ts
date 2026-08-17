import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { activeSessions, organizations, teamMemberships, users } from "../../drizzle/schema";
import * as dbHelpers from "../db";
import { storagePut } from "../storage";
import { COOKIE_NAME } from "@shared/const";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_AVATAR_BYTES = 1_000_000;
const avatarInput = z.object({
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Avatar must be a PNG, JPEG, or WebP image."),
});

function getCurrentToken(req: { headers: { cookie?: string } }) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return cookies[COOKIE_NAME] ?? null;
}

function deviceLabel(req: { headers: { [key: string]: string | string[] | undefined } }) {
  const userAgent = req.headers["user-agent"];
  if (typeof userAgent !== "string" || !userAgent.trim()) return "Authenticated browser";
  return userAgent.slice(0, 220);
}

function requestIp(req: { ip?: string; headers: { [key: string]: string | string[] | undefined } }) {
  const forwarded = req.headers["x-forwarded-for"];
  const value = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : req.ip;
  return value?.slice(0, 45) || null;
}

export const accountRouter = router({
  profile: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    avatarUrl: ctx.user.avatarUrl,
    loginMethod: ctx.user.loginMethod,
  })),

  updateProfile: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
    const database = await dbHelpers.getDb();
    if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await database.update(users).set({ name: input.name }).where(eq(users.id, ctx.user.id));
    return { success: true, name: input.name } as const;
  }),

  uploadAvatar: protectedProcedure.input(avatarInput).mutation(async ({ ctx, input }) => {
    const [, mime, encoded] = input.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/) ?? [];
    if (!mime || !encoded) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid avatar format." });
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > MAX_AVATAR_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Avatar must be smaller than 1 MB." });
    const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    const stored = await storagePut(`avatars/${ctx.user.id}/${randomUUID()}.${extension}`, bytes, mime);
    const database = await dbHelpers.getDb();
    if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await database.update(users).set({ avatarUrl: stored.url, avatarStorageKey: stored.key }).where(eq(users.id, ctx.user.id));
    return { success: true, avatarUrl: stored.url } as const;
  }),

  passwordProvider: protectedProcedure.query(({ ctx }) => ({
    loginMethod: ctx.user.loginMethod ?? "OAuth / SSO",
    managedExternally: true,
    managementUrl: process.env.VITE_OAUTH_PORTAL_URL || "/signin",
  })),

  startPasswordChange: protectedProcedure.mutation(({ ctx }) => ({
    success: true,
    managedExternally: true,
    managementUrl: process.env.VITE_OAUTH_PORTAL_URL || "/signin",
    message: `Password changes are handled by your ${ctx.user.loginMethod ?? "identity"} provider. AgentFence never stores a local password.`,
  })),

  sessions: router({
    list: protectedProcedure.query(async ({ ctx }) => dbHelpers.listActiveSessions(ctx.user.id, getCurrentToken(ctx.req) ?? undefined)),
    revoke: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const revoked = await dbHelpers.revokeActiveSession(ctx.user.id, input.sessionId);
      if (!revoked) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found or already revoked." });
      return { success: true } as const;
    }),
    revokeOthers: protectedProcedure.mutation(async ({ ctx }) => {
      const token = getCurrentToken(ctx.req);
      if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current session could not be identified." });
      const count = await dbHelpers.revokeOtherSessions(ctx.user.id, token);
      return { success: true, revokedCount: count } as const;
    }),
  }),

  deleteAccount: protectedProcedure.input(z.object({ confirmation: z.literal("DELETE MY ACCOUNT") })).mutation(async ({ ctx }) => {
    const database = await dbHelpers.getDb();
    if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const memberships = await database.select({ organizationId: teamMemberships.organizationId }).from(teamMemberships).where(eq(teamMemberships.userId, ctx.user.id));
    const owned = await database.select({ id: organizations.id }).from(organizations).where(eq(organizations.createdBy, ctx.user.id));
    const organizationIds = Array.from(new Set([...memberships.map(row => row.organizationId), ...owned.map(row => row.id)]));
    if (organizationIds.length) {
      const shared = await database.select({ organizationId: teamMemberships.organizationId, memberCount: sql<number>`count(*)` }).from(teamMemberships).where(inArray(teamMemberships.organizationId, organizationIds)).groupBy(teamMemberships.organizationId);
      if (shared.some(row => Number(row.memberCount) > 1)) throw new TRPCError({ code: "CONFLICT", message: "Transfer or remove shared workspace members before deleting this account." });
      const nonOwned = await database.select({ id: organizations.id }).from(organizations).where(and(inArray(organizations.id, organizationIds), sql`${organizations.createdBy} <> ${ctx.user.id}`));
      if (nonOwned.length) throw new TRPCError({ code: "CONFLICT", message: "This account still belongs to a workspace owned by another user." });
    }
    await database.transaction(async tx => {
      if (organizationIds.length) await tx.delete(organizations).where(inArray(organizations.id, organizationIds));
      await tx.delete(activeSessions).where(eq(activeSessions.userId, ctx.user.id));
      await tx.delete(users).where(eq(users.id, ctx.user.id));
    });
    return { success: true } as const;
  }),
});
