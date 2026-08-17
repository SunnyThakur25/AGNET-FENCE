import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/pages/Console", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  WorkspacePending: () => <div>Loading</div>,
}));
vi.mock("@/lib/trpc", () => ({ trpc: { coveragePosture: { get: { useQuery: () => ({ isLoading: false, data: {
  observation: { start: new Date("2026-08-01T00:00:00Z"), days: 30 },
  summary: { departments: 1, activeAgents: 2, registeredAgents: 2, observedActiveAgents: 1, policyGaps: 0, evidenceGaps: 1 },
  departments: [{ teamId: 3, departmentName: "Customer Support", registeredAgents: 2, activeAgents: 2, observedActiveAgents: 1, policyGaps: 0, evidenceGaps: 1, governedActions: 14 }],
  items: [{ id: 1, teamId: 3, departmentName: "Customer Support", name: "Support agent", identity: "support.agent", environment: "production", riskLevel: "high", status: "active", state: "observed", applicablePolicyCount: 2, governedActionCount: 14, allowedCount: 11, blockedOrHeldCount: 3, explanation: "This agent has governed action evidence." }],
  mcp: { registeredServers: 1, trustedServers: 1, enabledTools: 2 },
  limitations: ["This posture measures registered integrations and governed actions stored by AgentFence; it is not network telemetry."],
} }) } } } }));

import CoveragePosturePage from "./CoveragePosture";

describe("CoveragePosturePage", () => {
  it("renders registered evidence, explicit measurement limits, and avoids direct-bypass claims", () => {
    const markup = renderToStaticMarkup(<CoveragePosturePage />);
    expect(markup).toContain("Measure what AgentFence can prove—not what it cannot see");
    expect(markup).toContain("Support agent");
    expect(markup).toContain("Customer Support");
    expect(markup).toContain("Policy and evidence gaps");
    expect(markup).toContain("not network telemetry");
    expect(markup).toContain("Direct-call boundary remains visible");
  });
});
