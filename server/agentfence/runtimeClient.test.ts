import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  decision: { allowed: false, reason: "Blocked by policy", toolCallId: 81, redactedOutboundPayload: { customerIds: ["customer-001"] } },
  outcomes: [] as Array<Record<string, unknown>>,
}));

vi.mock("@trpc/client", () => ({
  httpBatchLink: vi.fn(() => ({})),
  createTRPCProxyClient: vi.fn(() => ({
    agentfence: {
      runtime: {
        evaluate: { mutate: vi.fn(async () => state.decision) },
        reportOutcome: { mutate: vi.fn(async (outcome: Record<string, unknown>) => { state.outcomes.push(outcome); return { success: true }; }) },
      },
    },
  })),
}));
vi.mock("superjson", () => ({ default: {} }));

import { createAgentFenceRuntimeClient } from "../../shared/agentfence-runtime-client";

const request = {
  toolName: "crm",
  action: "customer.export",
  parameters: { customerCount: 1 },
  outboundPayload: { customerIds: ["customer-001"] },
  dataSensitivity: "internal" as const,
  destination: "crm-api.tenant.test",
  riskLevel: "high" as const,
};

describe("AgentFence runtime client guarded delivery", () => {
  it("does not call the external delivery callback when AgentFence returns a block", async () => {
    state.decision = { allowed: false, reason: "Blocked by policy", toolCallId: 81, redactedOutboundPayload: { customerIds: ["customer-001"] } };
    state.outcomes = [];
    const deliver = vi.fn(async () => ({ accepted: true }));
    const runtime = createAgentFenceRuntimeClient({ endpoint: "https://agentfence.example.test", credential: "x".repeat(40) });
    await expect(runtime.guardAndDeliver(request, deliver)).rejects.toThrow("AgentFence blocked crm.customer.export: Blocked by policy");
    expect(deliver).not.toHaveBeenCalled();
    expect(state.outcomes).toEqual([]);
  });

  it("calls the external delivery callback only after an allow and reports the target outcome", async () => {
    state.decision = { allowed: true, reason: "Allowed by least-privilege policy", toolCallId: 82, redactedOutboundPayload: { customerIds: ["customer-001"] } };
    state.outcomes = [];
    const deliver = vi.fn(async (payload: unknown) => ({ accepted: true, payload }));
    const runtime = createAgentFenceRuntimeClient({ endpoint: "https://agentfence.example.test/", credential: "x".repeat(40) });
    await expect(runtime.guardAndDeliver(request, deliver)).resolves.toEqual({ accepted: true, payload: { customerIds: ["customer-001"] } });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(state.outcomes).toEqual([expect.objectContaining({ toolCallId: 82, outcome: "succeeded" })]);
  });
});
