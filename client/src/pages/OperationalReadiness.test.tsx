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
  useUtils: () => ({ operationalReadiness: { get: { invalidate: vi.fn() } } }),
  operationalReadiness: {
    get: { useQuery: () => ({ data: { profile: null, identity: { oidc: { issuerConfigured: false, clientIdConfigured: false, clientSecretConfigured: false }, scim: { baseUrlConfigured: false, bearerTokenConfigured: false }, boundary: "Customer integration required." }, boundary: "Evidence is not recovery proof." } }) },
    declare: { useMutation: mutation },
    recordExercise: { useMutation: mutation },
  },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import OperationalReadinessPage from "./OperationalReadiness";

describe("OperationalReadinessPage", () => {
  it("renders declared targets, customer-led exercise evidence, and the live-identity boundary", () => {
    const markup = renderToStaticMarkup(<OperationalReadinessPage />);
    expect(markup).toContain("Declare recovery objectives. Prove them with customer-led exercises.");
    expect(markup).toContain("Evidence is not execution");
    expect(markup).toContain("Record declared objectives");
    expect(markup).toContain("Record exercise evidence");
    expect(markup).toContain("Readiness is not live identity");
    expect(markup).not.toContain("backup completed automatically");
  });
});
