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
    monitor: { useQuery: () => state.query({ summary: { registeredAgents: 2, activeAgents: 1, pausedAgents: 1, highRiskActions: 3, blockedActions: 2, activeContainments: 1, highSeverityAlerts: 2 }, agents: [{ id: 11, name: "Finance agent", identity: "finance.agent", status: "active", riskLevel: "critical", environment: "production" }], highRiskActions: [{ id: 21, agentName: "Finance agent", toolName: "crm", action: "customer.export", destination: "customer-data.internal", dataSensitivity: "pii", riskLevel: "critical", decision: "blocked", createdAt: new Date("2030-01-01T00:00:00.000Z") }], alerts: [{ id: 31, agentId: 11, agentName: "Finance agent", severity: "critical", title: "Agent emergency containment active", content: "Finance agent is paused on AgentFence-supported integrated paths.", createdAt: new Date("2030-01-01T00:00:00.000Z") }], containments: [{ id: 41, agentId: 11, status: "active", trigger: "critical_block", reason: "Automatic containment after a critical-risk governed action was blocked.", relatedToolCallId: 21, createdAt: new Date("2030-01-01T00:00:00.000Z"), releasedAt: null, agentName: "Finance agent", agentIdentity: "finance.agent" }], boundary: "Direct bypasses remain outside AgentFence enforcement." }) },
    settings: { get: { useQuery: () => state.query({ autoContainCriticalBlocks: false, incidentCommanderMembershipId: 61, containmentRunbookReference: "SOC-IR-01", approvalEscalationMinutes: 60, detail: "Automatic containment is opt-in.", members: [{ membershipId: 61, userId: 42, name: "Incident Commander", email: "commander@example.test", role: "admin", teamId: 8, teamName: "Security Operations" }], routingProfiles: [{ provider: "slack", status: "activation_required", ownerMembershipId: 61, destinationReference: "soc-escalation", hasVaultReference: false, updatedAt: null }, { provider: "pagerduty", status: "disabled", ownerMembershipId: null, destinationReference: null, hasVaultReference: false, updatedAt: null }], routingBoundary: "Live delivery remains disabled until customer-controlled credentials are stored in the approved tenant Vault path." }) }, update: { useMutation: state.mutation }, assignCommander: { useMutation: state.mutation }, saveRoutingProfile: { useMutation: state.mutation } },
    contain: { useMutation: state.mutation },
    release: { useMutation: state.mutation },
  },
} }));

import IncidentResponsePage from "./IncidentResponse";

describe("IncidentResponsePage", () => {
  it("renders governed monitoring, tenant-safe filters, containment administration, routing ownership, and the bypass boundary", () => {
    const markup = renderToStaticMarkup(<IncidentResponsePage />);
    expect(markup).toContain("Monitor governed actions. Contain risk on integrated paths.");
    expect(markup).toContain("Automatic containment after a critical block");
    expect(markup).toContain("Finance agent");
    expect(markup).toContain("crm.customer.export");
    expect(markup).toContain("Agent emergency containment active");
    expect(markup).toContain("Search the incident record");
    expect(markup).toContain("Registered agent filter");
    expect(markup).toContain("Assign the commander, runbook, and escalation target");
    expect(markup).toContain("Containment runbook reference");
    expect(markup).toContain("Slack and PagerDuty readiness");
    expect(markup).toContain("Live delivery remains disabled");
    expect(markup).toContain("Direct bypasses remain outside AgentFence enforcement.");
  });
});
