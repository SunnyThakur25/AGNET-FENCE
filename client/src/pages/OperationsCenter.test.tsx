import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/operations", vi.fn()] }));
vi.mock("@/pages/Console", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  WorkspacePending: () => <div>Loading</div>,
}));

const mock = vi.hoisted(() => ({
  query: (data: unknown) => ({ data, refetch: vi.fn() }),
  mutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({}),
  coveragePosture: { get: { useQuery: () => mock.query({ summary: { departments: 2, observedActiveAgents: 3, policyGaps: 1, evidenceGaps: 0 }, departments: [{ teamId: 1, departmentName: "Finance", registeredAgents: 2, activeAgents: 2, observedActiveAgents: 2, policyGaps: 0, evidenceGaps: 0, governedActions: 18 }] }) } },
  enterprise: {
    connections: {
      list: { useQuery: () => mock.query([{ id: 3, displayName: "Splunk HEC", kind: "splunk_hec", status: "pending_activation", lastTestedAt: null, lastErrorCode: "HEC_CERTIFICATION_REQUIRED" }]) },
      vaultActivation: { get: { useQuery: () => mock.query({ connected: false, endpointConfigured: false, profile: null }) } },
      identityReadiness: { useQuery: () => mock.query({ oidc: { ready: false, issuerConfigured: false } }) },
    },
  },
  governanceOperations: {
    performance: { useQuery: () => mock.query({ p95LatencyMs: 14, measuredDecisions: 6, averageLatencyMs: 8, maxLatencyMs: 18, unmeasuredLegacyDecisions: 2, detail: "Measured control-path latency." }) },
    pilotReadiness: { useQuery: () => mock.query({ items: [{ key: "agents", title: "Agent inventory", complete: true, detail: "2 active registered agent(s)." }], boundary: "Control-plane readiness only." }) },
    quotas: { get: { useQuery: () => mock.query({ quotas: { gatewayEvaluationsPerMinute: 600, evidenceExportsPerDay: 24, assistantGuidancePerDay: 200 }, gatewayEvaluations: { used: 3, limit: 600 }, evidenceExports: { used: 1, limit: 24 }, assistantGuidance: { used: 4, limit: 200, history: [], detail: "Counts tenant-wide guidance requests by UTC day." } }) }, update: { useMutation: mock.mutation } },
    evidenceSchedules: { list: { useQuery: () => mock.query([{ id: 5, framework: "SOC 2", status: "active", lastRunCode: "EXPORT_GENERATED" }]) }, activate: { useMutation: mock.mutation }, deactivate: { useMutation: mock.mutation }, runNow: { useMutation: mock.mutation }, exportNow: { useMutation: mock.mutation } },
  },
} }));

import OperationsCenterPage from "./OperationsCenter";

describe("OperationsCenterPage", () => {
  it("renders the department control plane, connector health, quotas, scheduled evidence, and action-enforcement boundary", () => {
    const markup = renderToStaticMarkup(<OperationsCenterPage />);
    expect(markup).toContain("One control plane for every department’s AI agents");
    expect(markup).toContain("Finance");
    expect(markup).toContain("Splunk HEC");
    expect(markup).toContain("Tenant-wide capacity and guidance quotas");
    expect(markup).toContain("AgentFence Guide");
    expect(markup).toContain("Managed archive exports");
    expect(markup).toContain("Action governance is deterministic; language safety is complementary.");
  });
});
