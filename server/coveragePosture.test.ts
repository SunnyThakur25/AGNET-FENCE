import { describe, expect, it } from "vitest";
import { deriveCoveragePosture } from "./routers/coveragePosture";

describe("coverage posture", () => {
  it("reports policy and evidence gaps without relabeling either as direct bypass telemetry", () => {
    const result = deriveCoveragePosture([
      { id: 1, name: "Observed agent", identity: "agent.observed", environment: "production", status: "active", riskLevel: "high" },
      { id: 2, name: "No policy", identity: "agent.no-policy", environment: "production", status: "active", riskLevel: "high" },
      { id: 3, name: "No evidence", identity: "agent.no-evidence", environment: "staging", status: "active", riskLevel: "medium" },
      { id: 4, name: "Paused", identity: "agent.paused", environment: "production", status: "paused", riskLevel: "low" },
    ], [{ agentId: 1 }, { agentId: 3 }], [{ agentId: 1, decision: "allowed" }]);

    expect(result.summary).toMatchObject({ activeAgents: 3, observedActiveAgents: 1, policyGaps: 1, evidenceGaps: 1, governedActions: 1 });
    expect(result.items.map(item => [item.id, item.state])).toEqual([[1, "observed"], [2, "policy_gap"], [3, "evidence_gap"], [4, "not_expected"]]);
    expect(result.items.find(item => item.id === 3)?.explanation).toContain("not proof of direct bypass activity");
  });
});
