import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as any,
  appendAudit: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("./audit", () => ({ appendAuditEvent: state.appendAudit }));
vi.mock("../_core/notification", () => ({ notifyOwner: state.notifyOwner }));

import { containAgent, safeContainmentReason } from "./incidentContainment";

function selectRows(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => rows }) }) };
}

describe("incident containment service", () => {
  beforeEach(() => {
    state.appendAudit.mockReset();
    state.notifyOwner.mockReset();
  });

  it("redacts credential-like containment text before it can enter incident evidence", () => {
    const redacted = safeContainmentReason("Operator observed token=Bearer sk_live_12345678901234567890 during triage.");
    expect(redacted).not.toContain("sk_live_12345678901234567890");
    expect(redacted).toContain("[REDACTED_SECRET]");
  });

  it("pauses the tenant-owned agent, revokes active runtime credentials, and records audit-safe containment evidence", async () => {
    const updates: Array<{ set: Record<string, unknown> }> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const db = {
      select: vi.fn()
        .mockImplementationOnce(() => selectRows([{ id: 8, organizationId: 3, name: "Finance agent", identity: "finance.agent", status: "active" }]))
        .mockImplementationOnce(() => selectRows([])),
      insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { inserts.push(values); return [{ insertId: inserts.length === 1 ? 51 : 0 }]; }) })),
      update: vi.fn(() => ({ set: vi.fn((values: Record<string, unknown>) => { updates.push({ set: values }); return { where: async () => [{ affectedRows: updates.length === 2 ? 2 : 1 }] }; }) })),
    };
    state.db = db;

    const result = await containAgent({ organizationId: 3, agentId: 8, trigger: "manual", reason: "Contain after a reviewed critical policy event.", relatedToolCallId: 99, initiatedBy: 42, actorIdentity: "admin@example.test" });

    expect(result).toEqual({ containmentId: 51, created: true, revokedCredentials: 2 });
    expect(updates.map(item => item.set)).toEqual(expect.arrayContaining([{ status: "paused" }, { status: "revoked", revokedAt: expect.any(Date) }]));
    expect(inserts[0]).toMatchObject({ organizationId: 3, agentId: 8, status: "active", trigger: "manual", relatedToolCallId: 99, initiatedBy: 42 });
    expect(inserts[1]).toMatchObject({ severity: "critical", relatedType: "agent_containment", relatedId: 51 });
    expect(state.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "incident.agent_contained", outcome: "blocked", agentId: 8, toolCallId: 99 }));
    expect(state.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("containment") }));
  });
});
