import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { mutation } = vi.hoisted(() => ({ mutation: () => ({ mutate: vi.fn(), isPending: false }) }));

vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/pages/Console", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PageFrame: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  SecondaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  WorkspacePending: () => <div>Loading workspace</div>,
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  agentfence: { vault: { status: { useQuery: () => ({ data: { connected: false } }) } } },
  enterprise: {
    connections: { list: { useQuery: () => ({ data: [] }) }, save: { useMutation: mutation }, test: { useMutation: mutation } },
    teams: { list: { useQuery: () => ({ data: [{ id: 4, name: "Security Operations" }] }) }, create: { useMutation: mutation }, members: { useQuery: () => ({ data: [] }) }, setRole: { useMutation: mutation }, invitations: { list: { useQuery: () => ({ data: [] }) }, create: { useMutation: mutation }, revoke: { useMutation: mutation } } },
    billing: { get: { useQuery: () => ({ data: { plan: "pilot", hasStripeCustomer: false, plans: [
      { key: "pilot", name: "Pilot", monthlyPriceCents: 9900, summary: "First workflow", features: ["Three agents"] },
      { key: "growth", name: "Growth", monthlyPriceCents: 29900, summary: "Scale", features: ["Twenty agents"] },
      { key: "enterprise", name: "Enterprise", monthlyPriceCents: null, summary: "Custom", features: ["Custom capacity"] },
    ] } }) }, checkout: { useMutation: mutation }, portal: { useMutation: mutation } },
  },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { EnterprisePilotPage } from "./Enterprise";

describe("enterprise pilot pages", () => {
  it("renders connector profiles and a disconnected-safe Vault boundary", () => {
    const markup = renderToStaticMarkup(<EnterprisePilotPage />);
    expect(markup).toContain("Connections, teams, and billing");
    expect(markup).toContain("Splunk HEC");
    expect(markup).toContain("Microsoft Sentinel");
    expect(markup).toContain("PagerDuty Events v2");
    expect(markup).toContain("OIDC federation");
    expect(markup).toContain("Credentials required");
    expect(markup).toContain("No raw secrets");
  });

  it("renders the three-tier billing model without ROI promises", () => {
    const markup = renderToStaticMarkup(<EnterprisePilotPage initialTab="billing" />);
    expect(markup).toContain("Pilot");
    expect(markup).toContain("$99");
    expect(markup).toContain("Growth");
    expect(markup).toContain("$299");
    expect(markup).toContain("Enterprise");
    expect(markup).toContain("Pricing describes platform access");
  });

  it("renders team invitation lifecycle controls with no token prefilled", () => {
    const markup = renderToStaticMarkup(<EnterprisePilotPage initialTab="team" />);
    expect(markup).toContain("Team management");
    expect(markup).toContain("Create one-time invitation");
    expect(markup).toContain("Invitation status");
    expect(markup).not.toContain("agentfence/tenants/7/integrations");
  });
});
