import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { auditEvents } from "../../drizzle/schema";
import { getDb } from "../db";

type AppendAuditEventInput = {
  organizationId: number;
  eventType: string;
  actorType: string;
  actorIdentity: string;
  agentId?: number | null;
  toolCallId?: number | null;
  policyId?: number | null;
  approvalId?: number | null;
  outcome: "allowed" | "blocked" | "approval_required" | "approved" | "rejected" | "simulated";
  payload: Record<string, unknown>;
};

const genesisHash = "0".repeat(64);

export function hashAuditEvent(previousHash: string, event: Record<string, unknown>) {
  return createHash("sha256").update(`${previousHash}:${JSON.stringify(event)}`).digest("hex");
}

export function isAuditHashValid(previousHash: string, event: Record<string, unknown>, eventHash: string) {
  return hashAuditEvent(previousHash, event) === eventHash;
}

export async function appendAuditEvent(input: AppendAuditEventInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");

  const prior = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, input.organizationId))
    .orderBy(desc(auditEvents.sequence))
    .limit(1);

  const previousHash = prior[0]?.eventHash ?? genesisHash;
  const sequence = (prior[0]?.sequence ?? 0) + 1;
  const stableEvent = {
    organizationId: input.organizationId,
    sequence,
    eventType: input.eventType,
    actorType: input.actorType,
    actorIdentity: input.actorIdentity,
    agentId: input.agentId ?? null,
    toolCallId: input.toolCallId ?? null,
    policyId: input.policyId ?? null,
    approvalId: input.approvalId ?? null,
    outcome: input.outcome,
    payload: input.payload,
  };
  const eventHash = hashAuditEvent(previousHash, stableEvent);

  await db.insert(auditEvents).values({
    ...stableEvent,
    previousHash,
    eventHash,
  });

  return { sequence, eventHash, previousHash };
}
