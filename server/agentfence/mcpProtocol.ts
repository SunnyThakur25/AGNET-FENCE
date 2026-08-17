import { createHash } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

type FetchLike = typeof fetch;

const PRIVATE_IPV4 = /^(?:10\.|127\.|0\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/;
const LOOPBACK_OR_LOCAL = /(?:^|\.)localhost$/i;

export type McpToolDefinition = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

export type McpDiscoveryResult = {
  protocolVersion: string | null;
  tools: McpToolDefinition[];
  digest: string;
};

export type McpCallResult = {
  result: Record<string, unknown>;
  protocolVersion: string | null;
};

const jsonRpcResponse = z.object({
  jsonrpc: z.literal("2.0"),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});

const toolDefinition = z.object({
  name: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_.:-]+$/, "MCP tool names must be URL-safe identifiers."),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().max(8_000).optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});

const MAX_RESPONSE_BYTES = 256_000;

export function normalizePublicMcpEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MCP server endpoints must be valid HTTPS URLs." });
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || LOOPBACK_OR_LOCAL.test(hostname) || PRIVATE_IPV4.test(hostname) || hostname.includes(":")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MCP server endpoints must use public HTTPS and cannot target local or private network addresses." });
  }
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function isMcpVaultReferenceAllowed(path: string, organizationId: number) {
  return path.startsWith(`agentfence/tenants/${organizationId}/integrations/mcp/`);
}

export function extractMcpBearerToken(secret: Record<string, unknown>) {
  const value = secret.mcp_token ?? secret.access_token ?? secret.token;
  if (typeof value !== "string" || value.trim().length < 12) throw new Error("Vault record does not contain an approved MCP bearer token field.");
  return value.trim();
}

function boundedJson(value: unknown) {
  const rendered = JSON.stringify(value ?? {});
  if (rendered.length > MAX_RESPONSE_BYTES) throw new Error("MCP response exceeded the proxy safety limit.");
  return value;
}

function requireRpcResult(value: unknown, operation: string) {
  const parsed = jsonRpcResponse.safeParse(value);
  if (!parsed.success || parsed.data.error || parsed.data.result === undefined) {
    throw new Error(`${operation} did not return a valid MCP JSON-RPC result.`);
  }
  return parsed.data.result;
}

function digestTools(tools: McpToolDefinition[]) {
  return createHash("sha256").update(JSON.stringify(tools.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema ?? null })))).digest("hex");
}

async function readJsonResponse(response: Response, operation: string) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}.`);
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("MCP response exceeded the proxy safety limit.");
  try {
    return boundedJson(JSON.parse(text));
  } catch {
    throw new Error(`${operation} returned an unsupported response payload.`);
  }
}

export function createMcpHttpClient(endpoint: string, options: { bearerToken?: string; fetchImpl?: FetchLike } = {}) {
  const normalizedEndpoint = normalizePublicMcpEndpoint(endpoint);
  const fetchImpl = options.fetchImpl ?? fetch;
  let sequence = 0;

  async function request(method: string, params: Record<string, unknown>, protocolVersion?: string | null) {
    sequence += 1;
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
    if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
    const response = await fetchImpl(normalizedEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: sequence, method, params }),
      signal: AbortSignal.timeout(8_000),
    });
    return { payload: await readJsonResponse(response, method), protocolVersion: response.headers.get("mcp-protocol-version") };
  }

  async function initialize() {
    const response = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { roots: { listChanged: false }, sampling: {} },
      clientInfo: { name: "AgentFence MCP Gateway", version: "1.0.0" },
    });
    const result = requireRpcResult(response.payload, "initialize") as { protocolVersion?: unknown };
    return typeof result.protocolVersion === "string" ? result.protocolVersion : response.protocolVersion;
  }

  return {
    endpoint: normalizedEndpoint,
    async discover(): Promise<McpDiscoveryResult> {
      const protocolVersion = await initialize();
      const response = await request("tools/list", {}, protocolVersion);
      const result = requireRpcResult(response.payload, "tools/list") as { tools?: unknown };
      const parsed = z.array(toolDefinition).safeParse(result.tools);
      if (!parsed.success) throw new Error("tools/list returned an invalid tool catalog.");
      const tools = parsed.data;
      return { tools, protocolVersion: response.protocolVersion ?? protocolVersion ?? null, digest: digestTools(tools) };
    },
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
      const protocolVersion = await initialize();
      const response = await request("tools/call", { name, arguments: args }, protocolVersion);
      const result = requireRpcResult(response.payload, "tools/call");
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("tools/call returned an invalid tool result.");
      return { result: boundedJson(result) as Record<string, unknown>, protocolVersion: response.protocolVersion ?? protocolVersion ?? null };
    },
  };
}
