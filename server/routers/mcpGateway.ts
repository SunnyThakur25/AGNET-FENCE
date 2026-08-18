import { and, eq, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { agents, approvals, dataGuardFindings, mcpServers, mcpTools, policies, runtimeCredentials, runtimeNonces, toolCalls } from "../../drizzle/schema";
import { appendAuditEvent } from "../agentfence/audit";
import { requireOrganizationMembership, requireOrganizationRole } from "../agentfence/authz";
import { inspectAndRedact, inspectOutboundAndRedact, strongestDataClassification } from "../agentfence/dataGuard";
import { createMcpHttpClient, extractMcpBearerToken, isMcpVaultReferenceAllowed, normalizePublicMcpEndpoint } from "../agentfence/mcpProtocol";
import { evaluatePolicies } from "../agentfence/policyEngine";
import { authorizeRuntimeGatewayRequest } from "../agentfence/runtimeGatewayGuard";
import { isRuntimeCredentialUsable, scopeAllows, verifyRuntimeToken } from "../agentfence/runtimeAuth";
import { createVaultAppRoleClient } from "../agentfence/vaultClient";
import { maybeAutoContainCriticalBlock } from "../agentfence/incidentContainment";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const sensitivity = z.enum(["public", "internal", "pii", "phi", "payment", "secret"]);
const riskLevel = z.enum(["low", "medium", "high", "critical"]);
const serverStatus = z.enum(["pending_review", "trusted", "unhealthy", "disabled"]);
const toolStatus = z.enum(["discovered", "enabled", "disabled"]);

function insertId(result: unknown) {
  const header = Array.isArray(result) ? result[0] as { insertId?: number } : result as { insertId?: number };
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id < 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The requested record could not be created." });
  return id;
}

function safeServer(row: typeof mcpServers.$inferSelect) {
  return {
    id: row.id,
    displayName: row.displayName,
    endpoint: row.endpoint,
    transport: row.transport,
    status: row.status,
    hasVaultReference: Boolean(row.vaultSecretPath),
    protocolVersion: row.protocolVersion,
    toolsDigest: row.toolsDigest,
    lastDiscoveredAt: row.lastDiscoveredAt,
    lastErrorCode: row.lastErrorCode,
    updatedAt: row.updatedAt,
  };
}

async function requireAdmin(organizationId: number, userId: number) {
  await requireOrganizationRole(organizationId, userId, ["admin"]);
}

async function loadServer(organizationId: number, serverId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [server] = await db.select().from(mcpServers).where(and(eq(mcpServers.id, serverId), eq(mcpServers.organizationId, organizationId))).limit(1);
  if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "MCP server was not found in this organization." });
  return { db, server };
}

async function upstreamMcpClient(server: typeof mcpServers.$inferSelect) {
  let bearerToken: string | undefined;
  if (server.vaultSecretPath) {
    const vault = createVaultAppRoleClient();
    if (!vault.status.connected) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This MCP server requires a Vault-backed token, but Vault AppRole is not activated." });
    try {
      const secret = await vault.readSecret(server.vaultSecretPath) as Record<string, unknown>;
      bearerToken = extractMcpBearerToken(secret);
    } catch {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The MCP Vault reference could not be read with the active AppRole scope." });
    }
  }
  return createMcpHttpClient(server.endpoint, { bearerToken });
}

export const mcpGatewayRouter = router({
  servers: router({
    list: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
      await requireOrganizationMembership(input.organizationId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const rows = await db.select().from(mcpServers).where(eq(mcpServers.organizationId, input.organizationId));
      const tools = rows.length ? await db.select().from(mcpTools).where(eq(mcpTools.organizationId, input.organizationId)) : [];
      return rows.map(server => ({ ...safeServer(server), tools: tools.filter(tool => tool.serverId === server.id).map(tool => ({ id: tool.id, name: tool.name, title: tool.title, description: tool.description, status: tool.status, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, updatedAt: tool.updatedAt })) }));
    }),
    register: protectedProcedure.input(organizationInput.extend({
      displayName: z.string().trim().min(2).max(120),
      endpoint: z.string().trim().url().max(500),
      vaultSecretPath: z.string().trim().min(10).max(255).optional(),
    })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const endpoint = normalizePublicMcpEndpoint(input.endpoint);
      if (input.vaultSecretPath && !isMcpVaultReferenceAllowed(input.vaultSecretPath, input.organizationId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MCP authentication references must stay in this organization’s integrations/mcp Vault path." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.insert(mcpServers).values({ organizationId: input.organizationId, displayName: input.displayName, endpoint, vaultSecretPath: input.vaultSecretPath ?? null, status: "pending_review", createdBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { displayName: input.displayName, vaultSecretPath: input.vaultSecretPath ?? null, status: "pending_review", lastErrorCode: null } });
      const [saved] = await db.select({ id: mcpServers.id }).from(mcpServers).where(and(eq(mcpServers.organizationId, input.organizationId), eq(mcpServers.endpoint, endpoint))).limit(1);
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The MCP server profile could not be resolved after registration." });
      const serverId = saved.id;
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "mcp.server_registered", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "approval_required", payload: { serverId, endpointHost: new URL(endpoint).hostname, hasVaultReference: Boolean(input.vaultSecretPath) } });
      return { serverId, status: "pending_review" as const };
    }),
    discover: protectedProcedure.input(organizationInput.extend({ serverId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const { db, server } = await loadServer(input.organizationId, input.serverId);
      try {
        const discovery = await (await upstreamMcpClient(server)).discover();
        for (const tool of discovery.tools) {
          await db.insert(mcpTools).values({ organizationId: input.organizationId, serverId: server.id, name: tool.name, title: tool.title ?? null, description: tool.description ?? null, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema ?? null, status: "discovered", lastDiscoveredAt: new Date() }).onDuplicateKeyUpdate({ set: { title: tool.title ?? null, description: tool.description ?? null, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema ?? null, lastDiscoveredAt: new Date() } });
        }
        await db.update(mcpServers).set({ protocolVersion: discovery.protocolVersion, toolsDigest: discovery.digest, lastDiscoveredAt: new Date(), lastErrorCode: null }).where(eq(mcpServers.id, server.id));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "mcp.tools_discovered", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "approval_required", payload: { serverId: server.id, toolCount: discovery.tools.length, protocolVersion: discovery.protocolVersion, toolsDigest: discovery.digest } });
        return { toolCount: discovery.tools.length, digest: discovery.digest, protocolVersion: discovery.protocolVersion };
      } catch (error) {
        await db.update(mcpServers).set({ status: "unhealthy", lastErrorCode: "DISCOVERY_FAILED" }).where(eq(mcpServers.id, server.id));
        await appendAuditEvent({ organizationId: input.organizationId, eventType: "mcp.discovery_failed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: "blocked", payload: { serverId: server.id, code: "DISCOVERY_FAILED" } });
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "MCP tool discovery failed." });
      }
    }),
    setStatus: protectedProcedure.input(organizationInput.extend({ serverId: z.number().int().positive(), status: serverStatus })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const { db, server } = await loadServer(input.organizationId, input.serverId);
      if (input.status === "trusted" && !server.toolsDigest) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Discover and review the MCP tool catalog before trusting a server." });
      await db.update(mcpServers).set({ status: input.status, lastErrorCode: input.status === "trusted" ? null : server.lastErrorCode }).where(eq(mcpServers.id, server.id));
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "mcp.server_trust_changed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: input.status === "trusted" ? "allowed" : "blocked", payload: { serverId: server.id, status: input.status } });
      return { success: true };
    }),
    setToolStatus: protectedProcedure.input(organizationInput.extend({ serverId: z.number().int().positive(), toolId: z.number().int().positive(), status: toolStatus })).mutation(async ({ ctx, input }) => {
      await requireAdmin(input.organizationId, ctx.user.id);
      const { db, server } = await loadServer(input.organizationId, input.serverId);
      const [tool] = await db.select().from(mcpTools).where(and(eq(mcpTools.id, input.toolId), eq(mcpTools.serverId, server.id), eq(mcpTools.organizationId, input.organizationId))).limit(1);
      if (!tool) throw new TRPCError({ code: "NOT_FOUND", message: "MCP tool was not found in this server catalog." });
      if (input.status === "enabled" && server.status !== "trusted") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Trust the discovered MCP server before enabling any of its tools." });
      await db.update(mcpTools).set({ status: input.status }).where(eq(mcpTools.id, tool.id));
      await appendAuditEvent({ organizationId: input.organizationId, eventType: "mcp.tool_status_changed", actorType: "user", actorIdentity: ctx.user.email || ctx.user.openId, outcome: input.status === "enabled" ? "allowed" : "blocked", payload: { serverId: server.id, toolId: tool.id, toolName: tool.name, status: input.status } });
      return { success: true };
    }),
  }),
  invoke: publicProcedure.input(z.object({
    token: z.string().min(30).max(8_192),
    nonce: z.string().min(16).max(96).regex(/^[a-zA-Z0-9._-]+$/, "Nonce must be URL-safe."),
    serverId: z.number().int().positive(),
    toolName: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_.:-]+$/),
    arguments: z.record(z.string(), z.unknown()).default({}),
    dataSensitivity: sensitivity.default("internal"),
    riskLevel: riskLevel.default("medium"),
  })).mutation(async ({ input }) => {
    let claims;
    try { claims = await verifyRuntimeToken(input.token); } catch { throw new TRPCError({ code: "UNAUTHORIZED", message: "Runtime gateway token is invalid or expired." }); }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [credential] = await db.select().from(runtimeCredentials).where(and(eq(runtimeCredentials.tokenId, claims.tokenId), eq(runtimeCredentials.organizationId, claims.organizationId), eq(runtimeCredentials.agentId, claims.agentId), eq(runtimeCredentials.vaultCredentialId, claims.vaultCredentialId))).limit(1);
    if (!credential || !isRuntimeCredentialUsable(credential, claims)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Runtime credential is inactive, expired, or scope-inconsistent." });
    try {
      await authorizeRuntimeGatewayRequest({ runtimeCredentialId: credential.id, credential, claims, nonce: input.nonce, reserveNonce: async (runtimeCredentialId, nonce, expiresAt) => {
        try { await db.insert(runtimeNonces).values({ runtimeCredentialId, nonce, expiresAt }); return true; } catch { return false; }
      } });
    } catch (error) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error && error.message === "runtime_request_replay" ? "Runtime request replay detected." : "Runtime credential is invalid or inactive." });
    }
    const [agent, server, tool] = await Promise.all([
      db.select().from(agents).where(and(eq(agents.id, claims.agentId), eq(agents.organizationId, claims.organizationId))).limit(1).then(rows => rows[0]),
      db.select().from(mcpServers).where(and(eq(mcpServers.id, input.serverId), eq(mcpServers.organizationId, claims.organizationId))).limit(1).then(rows => rows[0]),
      db.select().from(mcpTools).where(and(eq(mcpTools.serverId, input.serverId), eq(mcpTools.organizationId, claims.organizationId), eq(mcpTools.name, input.toolName))).limit(1).then(rows => rows[0]),
    ]);
    if (!agent || agent.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Paused or retired agents cannot invoke MCP tools." });
    if (!server || server.status !== "trusted") throw new TRPCError({ code: "FORBIDDEN", message: "This MCP server is not trusted for invocation." });
    if (!tool || tool.status !== "enabled") throw new TRPCError({ code: "FORBIDDEN", message: "This MCP tool is not enabled for invocation." });
    const gatewayToolName = `mcp:${server.id}`;
    if (!scopeAllows(claims.allowedScopes, gatewayToolName, tool.name)) throw new TRPCError({ code: "FORBIDDEN", message: "Runtime credential scope does not allow this MCP tool." });
    const inbound = inspectAndRedact(input.arguments);
    const effectiveSensitivity = strongestDataClassification(input.dataSensitivity, inbound.classification);
    const activePolicies = await db.select().from(policies).where(and(eq(policies.organizationId, claims.organizationId), eq(policies.status, "active"), or(isNull(policies.agentId), eq(policies.agentId, claims.agentId))));
    const evaluation = evaluatePolicies(activePolicies, { toolName: gatewayToolName, action: tool.name, parameters: input.arguments, dataSensitivity: effectiveSensitivity, destination: new URL(server.endpoint).hostname });
    const toolCallId = insertId(await db.insert(toolCalls).values({ organizationId: claims.organizationId, agentId: claims.agentId, toolName: gatewayToolName, action: tool.name, redactedParameters: inbound.redactedValue as Record<string, unknown>, dataSensitivity: effectiveSensitivity, destination: new URL(server.endpoint).hostname, riskLevel: input.riskLevel, decision: evaluation.decision, matchedPolicyId: evaluation.matchedPolicy?.id ?? null, initiatedBy: `runtime:${credential.id}` }));
    if (inbound.occurrences > 0) await db.insert(dataGuardFindings).values({ organizationId: claims.organizationId, toolCallId, classification: inbound.classification, detector: inbound.detectors.join(",") || "mcp-data-guard", actionTaken: "redacted", occurrences: inbound.occurrences, destinationApproved: evaluation.decision === "allowed" });
    let approvalId: number | null = null;
    if (evaluation.decision === "approval_required") approvalId = insertId(await db.insert(approvals).values({ organizationId: claims.organizationId, toolCallId, requestedBy: agent.identity, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }));
    await appendAuditEvent({ organizationId: claims.organizationId, eventType: "mcp.tool_evaluated", actorType: "agent", actorIdentity: agent.identity, agentId: agent.id, toolCallId, policyId: evaluation.matchedPolicy?.id ?? null, approvalId, outcome: evaluation.decision, payload: { serverId: server.id, toolName: tool.name, destination: new URL(server.endpoint).hostname, dataSensitivity: effectiveSensitivity, redactions: inbound.occurrences } });
    if (evaluation.decision === "blocked") await maybeAutoContainCriticalBlock({ organizationId: claims.organizationId, agentId: claims.agentId, toolCallId, riskLevel: input.riskLevel, actorIdentity: agent.identity });
    if (evaluation.decision !== "allowed") return { toolCallId, approvalId, decision: evaluation.decision, reason: evaluation.reason, result: null };
    try {
      const upstream = await (await upstreamMcpClient(server)).callTool(tool.name, inbound.redactedValue as Record<string, unknown>);
      const outbound = inspectOutboundAndRedact(upstream.result);
      if (outbound.occurrences > 0) await db.insert(dataGuardFindings).values({ organizationId: claims.organizationId, toolCallId, classification: outbound.classification, detector: outbound.detectors.join(",") || "mcp-result-data-guard", actionTaken: "redacted", occurrences: outbound.occurrences, destinationApproved: true });
      await db.update(toolCalls).set({ targetOutcome: "succeeded", targetStatusCode: 200, targetReference: `mcp:${server.id}:${tool.id}`, targetRecordedAt: new Date() }).where(eq(toolCalls.id, toolCallId));
      await appendAuditEvent({ organizationId: claims.organizationId, eventType: "mcp.tool_completed", actorType: "agent", actorIdentity: agent.identity, agentId: agent.id, toolCallId, outcome: "allowed", payload: { serverId: server.id, toolId: tool.id, protocolVersion: upstream.protocolVersion, resultRedactions: outbound.occurrences } });
      return { toolCallId, approvalId, decision: "allowed" as const, reason: evaluation.reason, result: outbound.redactedValue };
    } catch (error) {
      await db.update(toolCalls).set({ targetOutcome: "failed", targetRecordedAt: new Date() }).where(eq(toolCalls.id, toolCallId));
      await appendAuditEvent({ organizationId: claims.organizationId, eventType: "mcp.tool_failed", actorType: "agent", actorIdentity: agent.identity, agentId: agent.id, toolCallId, outcome: "blocked", payload: { serverId: server.id, toolId: tool.id, code: "UPSTREAM_CALL_FAILED" } });
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "MCP upstream tool invocation failed." });
    }
  }),
});
