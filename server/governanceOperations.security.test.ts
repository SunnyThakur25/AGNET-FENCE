import { describe, expect, it, vi } from "vitest";

vi.mock("./agentfence/authz", () => ({
  requireOrganizationMembership: vi.fn(async (organizationId: number) => {
    if (organizationId !== 5) throw new Error("organization membership required");
  }),
  requireOrganizationRole: vi.fn(async (organizationId: number) => {
    if (organizationId !== 5) throw new Error("organization role required");
  }),
}));
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));

import { coveragePostureRouter } from "./routers/coveragePosture";
import { enterpriseRouter } from "./routers/enterprise";
import { governanceOperationsRouter } from "./routers/governanceOperations";

function caller<T extends { createCaller: (ctx: never) => unknown }>(router: T) {
  return router.createCaller({ user: { id: 1, openId: "tenant-five-admin", role: "admin", email: "admin@example.test", name: "Admin" } } as never) as ReturnType<T["createCaller"]>;
}

describe("governance operations tenant isolation", () => {
  it("refuses performance and department-coverage queries before another tenant's data can be selected", async () => {
    await expect((caller(governanceOperationsRouter) as never).performance({ organizationId: 6 })).rejects.toThrow("organization membership required");
    await expect((caller(coveragePostureRouter) as never).get({ organizationId: 6 })).rejects.toThrow("organization membership required");
  });

  it("refuses quota, pilot-readiness, and scheduled-export controls outside the caller's tenant", async () => {
    const operations = caller(governanceOperationsRouter) as never;
    await expect(operations.quotas.get({ organizationId: 6 })).rejects.toThrow("organization role required");
    await expect(operations.pilotReadiness({ organizationId: 6 })).rejects.toThrow("organization role required");
    await expect(operations.evidenceSchedules.list({ organizationId: 6 })).rejects.toThrow("organization role required");
  });

  it("refuses connector-health inventory outside the caller's tenant before returning safe metadata", async () => {
    await expect((caller(enterpriseRouter) as never).connections.list({ organizationId: 6 })).rejects.toThrow("organization role required");
  });
});
