import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { mutation } = vi.hoisted(() => ({ mutation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/pages/Console", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  WorkspacePending: () => <div>Loading</div>,
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ auditAnchoring: { list: { invalidate: vi.fn() } } }),
  auditAnchoring: {
    list: { useQuery: () => ({ isLoading: false, data: [] }) },
    prepare: { useMutation: mutation },
    recordExternalReceipt: { useMutation: mutation },
  },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AuditAnchoringPage from "./AuditAnchoring";

describe("AuditAnchoringPage", () => {
  it("prepares evidence without representing platform storage as independently immutable", () => {
    const markup = renderToStaticMarkup(<AuditAnchoringPage />);
    expect(markup).toContain("Prepare a ledger head. Retain it outside AgentFence.");
    expect(markup).toContain("Independent immutability begins only after");
    expect(markup).toContain("No automatic WORM claim");
    expect(markup).toContain("s3://customer-worm-bucket/agentfence/audit");
  });
});
