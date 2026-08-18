import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/pages/Console", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  WorkspacePending: () => <div>Loading</div>,
}));

const state = vi.hoisted(() => ({
  query: (data: unknown) => ({ data, refetch: vi.fn() }),
  mutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({}),
  incidentResponse: {
    monitor: { useQuery: () => state.query({ summary: { registeredAgents: 2, activeAgents: 1, pausedAgents: 1, highRiskActions: 3, blockedActions: 2, activeContainments: 1, highSeverityAlerts: 2 }, agents: [{ id: 11, name: "Finance agent", identity: "finance.agent", status: "active", riskLevel: "critical", environment: "production" }], highRiskActions: [{ id: 21, agentName: "Finance agent", toolName: "crm", action: "customer.export", destination: "customer-data.internal", dataSensitivity: "pii", riskLevel: "critical", decision: "blocked", createdAt: new Date("2030-01-01T00:00:00.000Z") }], alerts: [{ id: 31, severity: "critical", title: "Agent emergency containment active", content: "Finance agent is paused on AgentFence-supported integrated paths.", createdAt: new Date("2030-01-01T00:00:00.000Z") }], containments: [{ id: 41, agentId: 11, status: "active", trigger: "critical_block", reason: "Automatic containment after a critical-risk governed action was blocked.", relatedToolCallId: 21, createdAt: new Date("2030-01-01T00:00:00.000Z"), releasedAt: null, agentName: "Finance agent", agentIdentity: "finance.agent" }], boundary: "Direct bypasses remain outside AgentFence enforcement." }) },
    settings: { get: { useQuery: () => state.query({ autoContainCriticalBlocks: false, detail: "Automatic containment is opt-in." }) }, update: { useMutation: state.mutation } },
    contain: { useMutation: state.mutation },
    release: { useMutation: state.mutation },
  },
} }));

import IncidentResponsePage from "./IncidentResponse";

describe("IncidentResponsePage", () => {
  it("renders governed monitoring, emergency containment, privacy-safe high-risk evidence, and the bypass boundary", () => {
    const markup = renderToStaticMarkup(<IncidentResponsePage />);
    expect(markup).toContain("Monitor governed actions. Contain risk on integrated paths.");
    expect(markup).toContain("Automatic containment after a critical block");
    expect(markup).toContain("Finance agent");
    expect(markup).toContain("crm.customer.export");
    expect(markup).toContain("Agent emergency containment active");
    expect(markup).toContain("Direct bypasses remain outside AgentFence enforcement.");
  });
});
