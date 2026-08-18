import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const state = vi.hoisted(() => ({ role: vi.fn(), audit: vi.fn(), db: null as any, reason: vi.fn((value: string) => `safe:${value}`) }));
vi.mock("../agentfence/authz", () => ({ requireOrganizationMembership: vi.fn(async () => ({ role: "admin" })), requireOrganizationRole: state.role }));
vi.mock("../agentfence/audit", () => ({ appendAuditEvent: state.audit }));
vi.mock("../agentfence/incidentContainment", () => ({ safeContainmentReason: state.reason }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));

import { endpointOperationsRouter } from "./endpointOperations";

function context(): TrpcContext { return { user: { id: 42, openId: "admin-42", email: "admin@example.test", name: "Admin", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] }; }
function rows(values: unknown[]) { return { from: () => ({ where: () => ({ limit: async () => values }) }) }; }

describe("endpoint operations containment authorization", () => {
  beforeEach(() => { state.role.mockReset(); state.audit.mockReset(); state.reason.mockClear(); });

  it("isolates only an in-tenant endpoint, disables its explicit bindings, revokes bound runtime credentials, and records safe audit evidence", async () => {
    const updates: Array<Record<string, unknown>> = [];
    state.db = {
      select: vi.fn().mockImplementationOnce(() => rows([{ id: 11, organizationId: 7, displayName: "Finance host" }])).mockImplementationOnce(() => rows([])).mockImplementationOnce(() => ({ from: () => ({ where: async () => [{ id: 31, agentId: 91, enabled: true }, { id: 32, agentId: 92, enabled: true }] }) })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ then: undefined, onDuplicateKeyUpdate: undefined })) })),
      update: vi.fn(() => ({ set: vi.fn((values: Record<string, unknown>) => { updates.push(values); return { where: async () => ({ affectedRows: 2 }) }; }) })),
    };
    state.db.insert = vi.fn(() => ({ values: vi.fn(() => ({ insertId: 77 })) }));
    const result = await endpointOperationsRouter.createCaller(context()).isolate({ organizationId: 7, endpointId: 11, reason: "Pause approved endpoint after reviewed incident." });
    expect(state.role).toHaveBeenCalledWith(7, 42, ["admin"]);
    expect(state.reason).toHaveBeenCalledWith("Pause approved endpoint after reviewed incident.");
    expect(updates).toContainEqual({ sensorStatus: "isolated" });
    expect(updates).toContainEqual({ enabled: false });
    expect(updates).toContainEqual({ status: "revoked", revokedAt: expect.any(Date) });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "endpoint.isolated", outcome: "blocked", payload: expect.objectContaining({ endpointId: 11, disabledBindings: 2, boundAgents: 2, reason: "safe:Pause approved endpoint after reviewed incident." }) }));
    expect(result).toMatchObject({ containmentId: 77, created: true, disabledBindings: 2 });
  });

  it("rejects an endpoint identity outside the tenant before containment records or runtime changes are created", async () => {
    const insert = vi.fn();
    const update = vi.fn();
    state.db = { select: vi.fn(() => rows([])), insert, update };
    await expect(endpointOperationsRouter.createCaller(context()).isolate({ organizationId: 7, endpointId: 999, reason: "Contain an endpoint that is not in this tenant." })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
