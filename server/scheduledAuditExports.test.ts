import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isCron: false, taskUid: "task-evidence-7", runs: 0 }));
const db = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 12, organizationId: 7, status: "active", scheduleCronTaskUid: state.taskUid }] }) }) }),
};

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn(async () => ({ isCron: state.isCron, taskUid: state.taskUid })) } }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => db) }));
vi.mock("./agentfence/evidenceExportService", () => ({ runScheduledEvidenceExport: vi.fn(async () => { state.runs += 1; return { exportId: 91, skipped: null }; }) }));

import { registerScheduledAuditExports } from "./scheduledAuditExports";

function handler() {
  let captured: ((req: never, res: never) => Promise<unknown>) | undefined;
  registerScheduledAuditExports({ post: (_path: string, callback: typeof captured) => { captured = callback; } } as never);
  if (!captured) throw new Error("callback not registered");
  return captured;
}

function response() {
  const value = { status: vi.fn(), json: vi.fn() };
  value.status.mockReturnValue(value);
  return value;
}

describe("scheduled audit exports", () => {
  it("rejects non-cron callers before a schedule or export is resolved", async () => {
    state.isCron = false;
    state.runs = 0;
    const res = response();
    await handler()({ originalUrl: "/api/scheduled/audit-export" } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "cron-only" });
    expect(state.runs).toBe(0);
  });

  it("runs only the schedule resolved from the trusted cron task UID", async () => {
    state.isCron = true;
    state.runs = 0;
    const res = response();
    await handler()({ originalUrl: "/api/scheduled/audit-export" } as never, res as never);
    expect(state.runs).toBe(1);
    expect(res.json).toHaveBeenCalledWith({ ok: true, result: { exportId: 91, skipped: null } });
  });
});
