import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { mutation } = vi.hoisted(() => ({ mutation: () => ({ mutate: vi.fn(), isPending: false }) }));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 8 } }) }));
vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/pages/Console", () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>, PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>, SecondaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>, WorkspacePending: () => <div>Loading</div> }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ policyGovernance: { list: { invalidate: vi.fn() } }, agentfence: { policies: { list: { invalidate: vi.fn() } } } }),
  agentfence: { policies: { list: { useQuery: () => ({ data: [{ id: 11, teamId: null, agentId: 3, name: "Refund approvals", description: "Escalate refunds", effect: "require_approval", toolPattern: "payments", actionPattern: "refund", parameterConstraints: [], dataSensitivity: "payment", destinationPattern: "internal", priority: 100, status: "active", currentRevision: 2 }] }) } } },
  policyGovernance: { list: { useQuery: () => ({ isLoading: false, data: [{ id: 31, policyId: 11, revision: 3, baseRevision: 2, status: "pending_review", changeSummary: "Expand high-value refund approval coverage", createdBy: 17, createdAt: new Date("2026-08-17T10:00:00Z"), reviewComment: null, promotedAt: null, policyName: "Refund approvals", currentRevision: 2, diff: [{ field: "priority", before: 100, after: 80 }, { field: "actionPattern", before: "refund", after: "refund|void" }] }] }) }, propose: { useMutation: mutation }, review: { useMutation: mutation }, promote: { useMutation: mutation }, rollbackProposal: { useMutation: mutation } },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PolicyGovernancePage from "./PolicyGovernance";

describe("PolicyGovernancePage", () => {
  it("renders the immutable revision flow and precise field-level visual diff", () => {
    const markup = renderToStaticMarkup(<PolicyGovernancePage />);
    expect(markup).toContain("Controlled policy change management");
    expect(markup).toContain("Independent review comment");
    expect(markup).toContain("Approve");
    expect(markup).toContain("priority");
    expect(markup).toContain("refund|void");
    expect(markup).toContain("Submit immutable revision");
  });
});
