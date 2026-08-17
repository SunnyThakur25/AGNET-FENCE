import { describe, expect, it } from "vitest";
import { assertIndependentPolicyReview, assertPromotionBaseRevision, diffPolicySnapshot } from "./routers/policyGovernance";

const policy = {
  teamId: null,
  agentId: 7,
  name: "Controlled refund approvals",
  description: "Escalate refund execution for approval.",
  effect: "require_approval" as const,
  toolPattern: "payments",
  actionPattern: "issue_refund",
  parameterConstraints: [],
  dataSensitivity: "payment" as const,
  destinationPattern: "internal",
  priority: 100,
};

describe("policy governance security contracts", () => {
  it("returns precise field-level diffs for an immutable revision snapshot", () => {
    const proposal = { ...policy, actionPattern: "issue_refund|void_refund", priority: 80 };
    expect(diffPolicySnapshot(policy, proposal)).toEqual([
      { field: "actionPattern", before: "issue_refund", after: "issue_refund|void_refund" },
      { field: "priority", before: 100, after: 80 },
    ]);
  });

  it("requires a reviewer other than the policy proposal author", () => {
    expect(() => assertIndependentPolicyReview(42, 42)).toThrow("different administrator");
    expect(() => assertIndependentPolicyReview(42, 43)).not.toThrow();
  });

  it("rejects promotion of a revision whose production base is stale", () => {
    expect(() => assertPromotionBaseRevision(4, 3)).toThrow("active policy changed");
    expect(() => assertPromotionBaseRevision(4, 4)).not.toThrow();
  });
});
