import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}


import { createHash } from "crypto";
import { activeSessions } from "../drizzle/schema";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureActiveSession(input: {
  userId: number;
  token: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) return;
  const sessionTokenHash = hashSessionToken(input.token);
  await db.insert(activeSessions).values({
    userId: input.userId,
    sessionTokenHash,
    deviceInfo: input.deviceInfo,
    ipAddress: input.ipAddress,
    expiresAt: input.expiresAt,
    lastActiveAt: new Date(),
  }).onDuplicateKeyUpdate({
    set: { lastActiveAt: new Date(), deviceInfo: input.deviceInfo, ipAddress: input.ipAddress, expiresAt: input.expiresAt },
  });
}

export async function listActiveSessions(userId: number, currentToken?: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(activeSessions).where(and(eq(activeSessions.userId, userId), isNull(activeSessions.revokedAt), gt(activeSessions.expiresAt, new Date())));
  const currentHash = currentToken ? hashSessionToken(currentToken) : null;
  return rows.map(row => ({
    id: row.id,
    deviceInfo: row.deviceInfo,
    ipAddress: row.ipAddress ? `${row.ipAddress.split(".").slice(0, 2).join(".")}.•••` : null,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    current: currentHash === row.sessionTokenHash,
  }));
}

export async function revokeActiveSession(userId: number, sessionId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(activeSessions).set({ revokedAt: new Date() }).where(and(eq(activeSessions.id, sessionId), eq(activeSessions.userId, userId), isNull(activeSessions.revokedAt)));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function revokeOtherSessions(userId: number, currentToken: string) {
  const db = await getDb();
  if (!db) return 0;
  const currentHash = hashSessionToken(currentToken);
  const result = await db.update(activeSessions).set({ revokedAt: new Date() }).where(and(eq(activeSessions.userId, userId), ne(activeSessions.sessionTokenHash, currentHash), isNull(activeSessions.revokedAt)));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}


export async function isSessionRevoked(userId: number, token: string) {
  const database = await getDb();
  if (!database) return false;
  const rows = await database.select({ revokedAt: activeSessions.revokedAt }).from(activeSessions).where(and(eq(activeSessions.userId, userId), eq(activeSessions.sessionTokenHash, hashSessionToken(token)))).limit(1);
  return rows[0]?.revokedAt != null;
}


export async function revokeTokenSession(userId: number, token: string) {
  const database = await getDb();
  if (!database) return false;
  const result = await database.update(activeSessions).set({ revokedAt: new Date() }).where(and(eq(activeSessions.userId, userId), eq(activeSessions.sessionTokenHash, hashSessionToken(token)), isNull(activeSessions.revokedAt)));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
