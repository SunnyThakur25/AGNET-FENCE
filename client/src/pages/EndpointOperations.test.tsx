import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/pages/Console", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  WorkspacePending: () => <div>Loading</div>,
}));

const state = vi.hoisted(() => ({ query: (data: unknown) => ({ data, refetch: vi.fn() }), mutation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  endpointOperations: {
    overview: { useQuery: () => state.query({ currentRole: "admin", summary: { endpoints: 1, healthy: 0, readinessOnly: 1, isolated: 0, bindings: 1 }, endpoints: [{ id: 11, displayName: "Finance host", deviceIdentity: "finance-host-01", operatingSystem: "windows", sensorStatus: "registered", teamName: "Security Operations", ownerName: "Incident Commander", ownerEmail: "commander@example.test", lastSeenAt: null, containmentActive: false }], bindings: [{ id: 21, agentName: "Finance agent", agentIdentity: "finance.agent", kind: "sdk", enabled: true }], agents: [{ id: 31, name: "Finance agent", identity: "finance.agent", status: "active", riskLevel: "high", environment: "production" }], members: [{ membershipId: 41, teamId: 5, userId: 42, role: "admin", teamName: "Security Operations", name: "Incident Commander", email: "commander@example.test" }], activeContainments: [], deploymentBoundary: "No prompts or device secrets are retained.", containmentBoundary: "Isolation applies only to explicitly bound AgentFence integrations." }) },
    create: { useMutation: state.mutation }, bindAgent: { useMutation: state.mutation }, isolate: { useMutation: state.mutation }, release: { useMutation: state.mutation },
  },
} }));

import EndpointOperationsPage from "./EndpointOperations";

describe("EndpointOperationsPage", () => {
  it("renders tenant endpoint readiness, explicit agent bindings, privacy boundaries, and scoped isolation controls", () => {
    const markup = renderToStaticMarkup(<EndpointOperationsPage />);
    expect(markup).toContain("Register approved endpoints. Govern their integrated agent paths.");
    expect(markup).toContain("Endpoint Sensor readiness, not host surveillance");
    expect(markup).toContain("Finance host");
    expect(markup).toContain("finance.agent");
    expect(markup).toContain("Bind governed agent path");
    expect(markup).toContain("Start endpoint isolation");
    expect(markup).toContain("No prompts or device secrets are retained.");
    expect(markup).toContain("Isolation applies only to explicitly bound AgentFence integrations.");
  });
});
