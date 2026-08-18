import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const state = vi.hoisted(() => ({
  role: vi.fn(),
  contain: vi.fn(async () => ({ containmentId: 6, created: true, revokedCredentials: 1 })),
  reason: vi.fn((value: string) => `safe:${value}`),
}));

vi.mock("../agentfence/authz", () => ({ requireOrganizationMembership: vi.fn(), requireOrganizationRole: state.role }));
vi.mock("../agentfence/incidentContainment", () => ({ containAgent: state.contain, safeContainmentReason: state.reason }));
vi.mock("../db", () => ({ getDb: vi.fn() }));

import { incidentResponseRouter } from "./incidentResponse";

function context(): TrpcContext {
  return { user: { id: 42, openId: "admin-42", email: "admin@example.test", name: "Admin", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("incident response authorization", () => {
  it("requires an organization administrator before emergency containment and passes only a redacted reason to the service", async () => {
    const result = await incidentResponseRouter.createCaller(context()).contain({ organizationId: 7, agentId: 9, reason: "Pause this agent after a reviewed incident." });
    expect(state.role).toHaveBeenCalledWith(7, 42, ["admin"]);
    expect(state.reason).toHaveBeenCalledWith("Pause this agent after a reviewed incident.");
    expect(state.contain).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, agentId: 9, trigger: "manual", initiatedBy: 42, reason: "safe:Pause this agent after a reviewed incident." }));
    expect(result).toMatchObject({ containmentId: 6, created: true });
  });
});
