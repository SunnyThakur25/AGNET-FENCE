import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";

export type RuntimeGatewayInput = {
  toolName: string;
  action: string;
  parameters: Record<string, unknown>;
  outboundPayload?: unknown;
  dataSensitivity: "public" | "internal" | "pii" | "phi" | "payment" | "secret";
  destination: string;
  riskLevel: "low" | "medium" | "high" | "critical";
};

export function createGatewayNonce() {
  if (!globalThis.crypto?.randomUUID) throw new Error("A cryptographically secure UUID generator is required for AgentFence runtime requests.");
  return globalThis.crypto.randomUUID();
}

export function createAgentFenceRuntimeClient(input: { endpoint: string; credential: string }) {
  const endpoint = input.endpoint.replace(/\/$/, "");
  const client = createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({ url: `${endpoint}/api/trpc`, transformer: superjson })],
  });

  async function evaluate(request: RuntimeGatewayInput) {
    return client.agentfence.runtime.evaluate.mutate({
      token: input.credential,
      nonce: createGatewayNonce(),
      ...request,
    });
  }

  async function guardAndDeliver<T>(request: RuntimeGatewayInput, deliver: (safePayload: unknown) => Promise<T>) {
    const decision = await evaluate(request);
    if (!decision.allowed) {
      throw new Error(`AgentFence blocked ${request.toolName}.${request.action}: ${decision.reason}`);
    }
    return deliver(decision.redactedOutboundPayload);
  }

  return { evaluate, guardAndDeliver };
}
