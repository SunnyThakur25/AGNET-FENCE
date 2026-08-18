import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { agentContainments, agents, incidentResponseSettings, notifications, runtimeCredentials } from "../../drizzle/schema";
import { appendAuditEvent } from "./audit";
import { inspectAndRedact } from "./dataGuard";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";

function insertId(result: unknown) {
  const header = Array.isArray(result) ? result[0] as { insertId?: number } : result as { insertId?: number };
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id < 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The containment record could not be created." });
  return id;
}

export function safeContainmentReason(reason: string) {
  const inspected = inspectAndRedact({ reason: reason.trim() });
  const value = inspected.redactedValue as { reason?: unknown };
  return typeof value.reason === "string" && value.reason.trim() ? value.reason.trim().slice(0, 500) : "Containment initiated for a governed security incident.";
}

export async function containAgent(input: {
  organizationId: number;
  agentId: number;
  trigger: "manual" | "critical_block";
  reason: string;
  relatedToolCallId?: number | null;
  initiatedBy?: number | null;
  actorIdentity: string;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [agent] = await db.select().from(agents).where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId))).limit(1);
  if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found in this organization." });
  const [existing] = await db.select().from(agentContainments).where(and(eq(agentContainments.organizationId, input.organizationId), eq(agentContainments.agentId, input.agentId), eq(agentContainments.status, "active"))).limit(1);
  if (existing) return { containmentId: existing.id, created: false, revokedCredentials: 0 };

  const reason = safeContainmentReason(input.reason);
  const containmentId = insertId(await db.insert(agentContainments).values({
    organizationId: input.organizationId,
    agentId: input.agentId,
    status: "active",
    trigger: input.trigger,
    reason,
    relatedToolCallId: input.relatedToolCallId ?? null,
    initiatedBy: input.initiatedBy ?? null,
  }));
  await db.update(agents).set({ status: "paused" }).where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId)));
  const revoked = await db.update(runtimeCredentials).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(runtimeCredentials.organizationId, input.organizationId), eq(runtimeCredentials.agentId, input.agentId), eq(runtimeCredentials.status, "active")));
  const revokedCredentials = Number((Array.isArray(revoked) ? revoked[0] : revoked).affectedRows ?? 0);
  await db.insert(notifications).values({ organizationId: input.organizationId, severity: "critical", title: "Agent emergency containment active", content: `${agent.name} is paused on AgentFence-supported integrated paths. ${reason}`, relatedType: "agent_containment", relatedId: containmentId });
  await notifyOwner({ title: "AgentFence — Agent emergency containment active", content: `${agent.name} was contained. ${reason}` });
  await appendAuditEvent({ organizationId: input.organizationId, eventType: "incident.agent_contained", actorType: input.trigger === "manual" ? "user" : "system", actorIdentity: input.actorIdentity, agentId: input.agentId, toolCallId: input.relatedToolCallId ?? undefined, outcome: "blocked", payload: { containmentId, trigger: input.trigger, revokedCredentials, reason } });
  return { containmentId, created: true, revokedCredentials };
}

export async function maybeAutoContainCriticalBlock(input: { organizationId: number; agentId: number; toolCallId: number; riskLevel: string; actorIdentity: string }) {
  if (input.riskLevel !== "critical") return { contained: false as const, reason: "not_critical" as const };
  const db = await getDb();
  if (!db) return { contained: false as const, reason: "database_unavailable" as const };
  const [settings] = await db.select().from(incidentResponseSettings).where(eq(incidentResponseSettings.organizationId, input.organizationId)).limit(1);
  if (!settings?.autoContainCriticalBlocks) return { contained: false as const, reason: "auto_containment_disabled" as const };
  const result = await containAgent({ organizationId: input.organizationId, agentId: input.agentId, trigger: "critical_block", reason: "Automatic containment after a critical-risk governed action was blocked.", relatedToolCallId: input.toolCallId, actorIdentity: input.actorIdentity });
  return { contained: result.created, reason: result.created ? "contained" as const : "already_contained" as const, containmentId: result.containmentId };
}
