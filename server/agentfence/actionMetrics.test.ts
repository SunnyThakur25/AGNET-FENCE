import { describe, expect, it } from "vitest";
import { aggregateActionSummary } from "./actionMetrics";

describe("aggregateActionSummary", () => {
  it("counts frequency, explicit target outcomes, and success rates by action", () => {
    const result = aggregateActionSummary([
      { toolName: "crm", action: "case.update", decision: "allowed", targetOutcome: "succeeded" },
      { toolName: "crm", action: "case.update", decision: "allowed", targetOutcome: "failed" },
      { toolName: "crm", action: "case.update", decision: "allowed", targetOutcome: null },
      { toolName: "billing", action: "refund.create", decision: "approval_required", targetOutcome: null },
    ]);
    expect(result[0]).toMatchObject({ key: "crm.case.update", count: 3, completed: 2, succeeded: 1, failed: 1, pending: 1, successRate: 50 });
    expect(result[1]).toMatchObject({ key: "billing.refund.create", count: 1, completed: 0, pending: 1, successRate: null });
  });

  it("limits results and ranks by frequency before success-rate tie breakers", () => {
    const result = aggregateActionSummary([
      ...Array.from({ length: 3 }, () => ({ toolName: "crm", action: "case.update", decision: "allowed", targetOutcome: "succeeded" })),
      ...Array.from({ length: 2 }, () => ({ toolName: "crm", action: "case.read", decision: "allowed", targetOutcome: "succeeded" })),
      { toolName: "billing", action: "refund.create", decision: "approval_required", targetOutcome: "failed" },
    ], 2);
    expect(result.map(item => item.key)).toEqual(["crm.case.update", "crm.case.read"]);
  });
});
