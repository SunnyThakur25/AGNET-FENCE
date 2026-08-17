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
  useUtils: () => ({ mcpGateway: { servers: { list: { invalidate: vi.fn() } } } }),
  mcpGateway: { servers: {
    list: { useQuery: () => ({ data: [], isLoading: false }) },
    register: { useMutation: mutation },
    discover: { useMutation: mutation },
    setStatus: { useMutation: mutation },
    setToolStatus: { useMutation: mutation },
  } },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import McpGatewayPage from "./McpGateway";

describe("McpGatewayPage", () => {
  it("renders the review-before-trust workflow and prevents browser-held upstream tokens", () => {
    const markup = renderToStaticMarkup(<McpGatewayPage />);
    expect(markup).toContain("Trust, inspect, and govern MCP tools before invocation");
    expect(markup).toContain("Register → discover → review → trust server");
    expect(markup).toContain("Optional Vault token reference");
    expect(markup).toContain("mcp:&lt;serverId&gt;.&lt;toolName&gt;");
    expect(markup).toContain("No MCP servers are registered");
    expect(markup).not.toContain("mcp-token-long-enough");
  });
});
