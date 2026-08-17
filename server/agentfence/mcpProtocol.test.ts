import { describe, expect, it, vi } from "vitest";
import { createMcpHttpClient, extractMcpBearerToken, isMcpVaultReferenceAllowed, normalizePublicMcpEndpoint } from "./mcpProtocol";

describe("native MCP gateway protocol controls", () => {
  it("allows only public HTTPS endpoints and rejects local or private targets", () => {
    expect(normalizePublicMcpEndpoint("https://mcp.example.test/mcp/")).toBe("https://mcp.example.test/mcp");
    expect(() => normalizePublicMcpEndpoint("http://mcp.example.test/mcp")).toThrow("public HTTPS");
    expect(() => normalizePublicMcpEndpoint("https://localhost/mcp")).toThrow("public HTTPS");
    expect(() => normalizePublicMcpEndpoint("https://10.2.3.4/mcp")).toThrow("public HTTPS");
  });

  it("uses initialize and tools/list before returning a reviewable catalog", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }), { headers: { "mcp-protocol-version": "2025-06-18" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "records.read", title: "Read records", description: "Reads one record", inputSchema: { type: "object" } }] } }), { headers: { "mcp-protocol-version": "2025-06-18" } }));
    const result = await createMcpHttpClient("https://mcp.example.test/mcp", { fetchImpl: fetchImpl as typeof fetch }).discover();
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("records.read");
    expect(result.digest).toHaveLength(64);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).method).toBe("initialize");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).method).toBe("tools/list");
  });

  it("requires tenant-scoped Vault paths and approved token field names", () => {
    expect(isMcpVaultReferenceAllowed("agentfence/tenants/7/integrations/mcp/search-token", 7)).toBe(true);
    expect(isMcpVaultReferenceAllowed("agentfence/tenants/8/integrations/mcp/search-token", 7)).toBe(false);
    expect(extractMcpBearerToken({ mcp_token: "mcp-token-long-enough" })).toBe("mcp-token-long-enough");
    expect(() => extractMcpBearerToken({ password: "not-a-token" })).toThrow("MCP bearer token");
  });
});
