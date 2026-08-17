import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { mutation } = vi.hoisted(() => ({ mutation: () => ({ mutate: vi.fn(), isPending: false }) }));

vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/pages/Console", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  SecondaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  WorkspacePending: () => <div>Loading</div>,
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({
    enterprise: { connections: { list: { invalidate: vi.fn() }, identityReadiness: { invalidate: vi.fn() } } },
    agentfence: { vault: { status: { invalidate: vi.fn() } } },
  }),
  agentfence: {
    vault: {
      status: { useQuery: () => ({ data: { connected: false, endpointConfigured: false, roleIdConfigured: false, secretIdConfigured: false } }) },
    },
  },
  enterprise: {
    connections: {
      list: { useQuery: () => ({ data: [{ id: 19, kind: "splunk_hec", endpoint: "https://splunk.example.test/services/collector/event", hasVaultReference: true, status: "pending_activation", lastErrorCode: null, lastTestedAt: null }] }) },
      identityReadiness: { useQuery: () => ({ data: { oidc: { issuerConfigured: false, clientIdConfigured: false, clientSecretConfigured: false, ready: false }, scim: { baseUrlConfigured: false, bearerTokenConfigured: false, ready: false } } }) },
      save: { useMutation: mutation },
      test: { useMutation: mutation },
      certifySplunkHec: { useMutation: mutation },
    },
  },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import SecureConnectorSettingsPage from "./SecureConnectorSettings";

describe("SecureConnectorSettingsPage", () => {
  it("renders the Vault-reference-only SIEM flow and Boolean-only deployment credential readiness", () => {
    const markup = renderToStaticMarkup(<SecureConnectorSettingsPage />);
    expect(markup).toContain("Activate integrations without browser-held secrets");
    expect(markup).toContain("Tenant Vault secret reference");
    expect(markup).toContain("Certify Splunk HEC");
    expect(markup).toContain("OIDC federation");
    expect(markup).toContain("SCIM 2.0");
    expect(markup).toContain("VAULT_SECRET_ID");
    expect(markup).not.toContain("a-tenant-hec-token");
  });
});
