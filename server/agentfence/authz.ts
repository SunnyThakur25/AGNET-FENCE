import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { teamMemberships } from "../../drizzle/schema";

export type OrganizationRole = "admin" | "operator";

export function isOrganizationRoleAllowed(role: OrganizationRole, allowed: OrganizationRole[]) {
  return allowed.includes(role);
}

export async function requireOrganizationMembership(organizationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const membership = await db
    .select()
    .from(teamMemberships)
    .where(and(eq(teamMemberships.organizationId, organizationId), eq(teamMemberships.userId, userId)))
    .limit(1);

  if (!membership[0]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this organization." });
  }

  return membership[0];
}

export async function requireOrganizationRole(organizationId: number, userId: number, allowed: OrganizationRole[]) {
  const membership = await requireOrganizationMembership(organizationId, userId);
  if (!isOrganizationRoleAllowed(membership.role, allowed)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your organization role cannot perform this action." });
  }
  return membership;
}
