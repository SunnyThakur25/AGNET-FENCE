import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const state = vi.hoisted(() => ({
  role: vi.fn(),
  audit: vi.fn(),
  db: null as any,
}));

vi.mock("../agentfence/authz", () => ({ requireOrganizationMembership: vi.fn(), requireOrganizationRole: state.role }));
vi.mock("../agentfence/audit", () => ({ appendAuditEvent: state.audit }));
vi.mock("../agentfence/incidentContainment", () => ({ containAgent: vi.fn(), safeContainmentReason: (value: string) => value }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));

import { incidentResponseRouter } from "./incidentResponse";

function context(): TrpcContext {
  return { user: { id: 42, openId: "admin-42", email: "admin@example.test", name: "Admin", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function selectRows(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => rows }) }) };
}

describe("incident operations authorization", () => {
  beforeEach(() => {
    state.role.mockReset();
    state.audit.mockReset();
  });

  it("assigns an in-tenant incident commander, promotes the selected operator to administrator, and creates audit evidence", async () => {
    const updateSets: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    state.db = {
      select: vi.fn(() => selectRows([{ id: 55, organizationId: 7, teamId: 4, userId: 66, role: "operator" }])),
      update: vi.fn(() => ({ set: vi.fn((values: Record<string, unknown>) => { updateSets.push(values); return { where: async () => ({ affectedRows: 1 }) }; }) })),
      insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { inserts.push(values); return { onDuplicateKeyUpdate: async () => ({ affectedRows: 1 }) }; }) })),
    };

    const result = await incidentResponseRouter.createCaller(context()).settings.assignCommander({ organizationId: 7, membershipId: 55 });

    expect(state.role).toHaveBeenCalledWith(7, 42, ["admin"]);
    expect(updateSets).toContainEqual({ role: "admin" });
    expect(inserts[0]).toMatchObject({ organizationId: 7, incidentCommanderMembershipId: 55, updatedBy: 42 });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "incident.commander_assigned", outcome: "allowed", payload: expect.objectContaining({ membershipId: 55, promotedToAdmin: true }) }));
    expect(result).toEqual({ success: true, promotedToAdmin: true });
  });

  it("rejects routing ownership outside the tenant before saving any Slack or PagerDuty profile", async () => {
    const insert = vi.fn();
    state.db = { select: vi.fn(() => selectRows([])), insert };

    await expect(incidentResponseRouter.createCaller(context()).settings.saveRoutingProfile({ organizationId: 7, provider: "slack", status: "activation_required", ownerMembershipId: 999, destinationReference: "soc-alerts", vaultSecretPath: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(insert).not.toHaveBeenCalled();
  });
});
