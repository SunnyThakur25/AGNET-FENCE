import { and, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { agents, mcpServers, mcpTools, policies, toolCalls } from "../../drizzle/schema";
import { requireOrganizationMembership } from "../agentfence/authz";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const OBSERVATION_DAYS = 30;

type CoverageAgent = { id: number; name: string; identity: string; environment: string; status: string; riskLevel: string };
type CoveragePolicy = { agentId: number | null };
type CoverageCall = { agentId: number; decision: string };

export function deriveCoveragePosture(agentRows: CoverageAgent[], policyRows: CoveragePolicy[], callRows: CoverageCall[]) {
  const callsByAgent = new Map<number, CoverageCall[]>();
  for (const call of callRows) callsByAgent.set(call.agentId, [...(callsByAgent.get(call.agentId) ?? []), call]);
  const items = agentRows.map(agent => {
    const actions = callsByAgent.get(agent.id) ?? [];
    const applicablePolicyCount = policyRows.filter(policy => policy.agentId === null || policy.agentId === agent.id).length;
    const active = agent.status === "active";
    const state = !active ? "not_expected" : applicablePolicyCount === 0 ? "policy_gap" : actions.length === 0 ? "evidence_gap" : "observed";
    return {
      ...agent,
      applicablePolicyCount,
      governedActionCount: actions.length,
      allowedCount: actions.filter(action => action.decision === "allowed" || action.decision === "approved").length,
      blockedOrHeldCount: actions.filter(action => action.decision === "blocked" || action.decision === "approval_required" || action.decision === "rejected").length,
      state,
      explanation: state === "policy_gap"
        ? "This active registered agent has no active organization or agent-specific policy in the current control inventory."
        : state === "evidence_gap"
          ? "This active registered agent has no governed action evidence in the observation window. This is an evidence gap, not proof of direct bypass activity."
          : state === "observed"
            ? "This agent has governed action evidence in the observation window. Direct calls outside AgentFence remain outside this measurement."
            : "Paused and retired agents are excluded from the active integration coverage expectation.",
    };
  });
  const activeItems = items.filter(item => item.status === "active");
  return {
    items,
    summary: {
      registeredAgents: items.length,
      activeAgents: activeItems.length,
      observedActiveAgents: activeItems.filter(item => item.state === "observed").length,
      policyGaps: activeItems.filter(item => item.state === "policy_gap").length,
      evidenceGaps: activeItems.filter(item => item.state === "evidence_gap").length,
      governedActions: callRows.length,
    },
  };
}

export const coveragePostureRouter = router({
  get: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireOrganizationMembership(input.organizationId, ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const observationStart = new Date(Date.now() - OBSERVATION_DAYS * 24 * 60 * 60 * 1000);
    const [agentRows, policyRows, callRows, mcpServerRows, mcpToolRows] = await Promise.all([
      db.select({ id: agents.id, name: agents.name, identity: agents.identity, environment: agents.environment, status: agents.status, riskLevel: agents.riskLevel }).from(agents).where(eq(agents.organizationId, input.organizationId)),
      db.select({ agentId: policies.agentId }).from(policies).where(and(eq(policies.organizationId, input.organizationId), eq(policies.status, "active"))),
      db.select({ agentId: toolCalls.agentId, decision: toolCalls.decision }).from(toolCalls).where(and(eq(toolCalls.organizationId, input.organizationId), gte(toolCalls.createdAt, observationStart))),
      db.select({ id: mcpServers.id, status: mcpServers.status }).from(mcpServers).where(eq(mcpServers.organizationId, input.organizationId)),
      db.select({ id: mcpTools.id, status: mcpTools.status }).from(mcpTools).where(eq(mcpTools.organizationId, input.organizationId)),
    ]);
    const agentCoverage = deriveCoveragePosture(agentRows, policyRows, callRows);
    return {
      ...agentCoverage,
      observation: { start: observationStart, days: OBSERVATION_DAYS, source: "registered AgentFence integrations and governed action records only" },
      mcp: {
        registeredServers: mcpServerRows.length,
        trustedServers: mcpServerRows.filter(server => server.status === "trusted").length,
        enabledTools: mcpToolRows.filter(tool => tool.status === "enabled").length,
      },
      limitations: [
        "This posture measures registered integrations and governed actions stored by AgentFence; it is not network telemetry.",
        "A missing action record is an evidence gap, not proof that an agent bypassed AgentFence.",
        "Direct target calls outside the SDK, browser wrapper, or Native MCP Gateway remain outside this control and must be addressed through target permissions and egress controls.",
      ],
    };
  }),
});
