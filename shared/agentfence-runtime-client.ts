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

export type BrowserActionIntent = {
  action: string;
  destination: string;
  metadata?: Record<string, unknown>;
  outboundPayload?: unknown;
  dataSensitivity?: RuntimeGatewayInput["dataSensitivity"];
  riskLevel?: RuntimeGatewayInput["riskLevel"];
};

export type TargetOutcome = {
  toolCallId: number;
  outcome: "succeeded" | "failed";
  targetStatusCode?: number;
  targetReference?: string;
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

  async function reportOutcome(outcome: TargetOutcome) {
    return client.agentfence.runtime.reportOutcome.mutate({ token: input.credential, nonce: createGatewayNonce(), ...outcome });
  }

  async function guardAndDeliver<T>(request: RuntimeGatewayInput, deliver: (safePayload: unknown) => Promise<T>) {
    const decision = await evaluate(request);
    if (!decision.allowed) {
      throw new Error(`AgentFence blocked ${request.toolName}.${request.action}: ${decision.reason}`);
    }
    try {
      const delivered = await deliver(decision.redactedOutboundPayload);
      await reportOutcome({ toolCallId: decision.toolCallId, outcome: "succeeded" }).catch(() => undefined);
      return delivered;
    } catch (error) {
      await reportOutcome({ toolCallId: decision.toolCallId, outcome: "failed" }).catch(() => undefined);
      throw error;
    }
  }

  return { evaluate, guardAndDeliver, reportOutcome };
}

/**
 * Adapter contract for managed browser agents, browser extensions, RPA workers, or VDI wrappers.
 * It authorizes an intent before an integration performs navigation, form submission, upload, or download.
 */
export function createAgentFenceBrowserActionAdapter(input: { endpoint: string; credential: string }) {
  const runtime = createAgentFenceRuntimeClient(input);

  async function authorize(intent: BrowserActionIntent) {
    return runtime.evaluate({
      toolName: "browser",
      action: intent.action,
      parameters: intent.metadata ?? {},
      outboundPayload: intent.outboundPayload,
      dataSensitivity: intent.dataSensitivity ?? "internal",
      destination: intent.destination,
      riskLevel: intent.riskLevel ?? "medium",
    });
  }

  async function authorizeAndExecute<T>(intent: BrowserActionIntent, execute: (safePayload: unknown) => Promise<T>) {
    const decision = await authorize(intent);
    if (!decision.allowed) throw new Error(`AgentFence blocked browser.${intent.action}: ${decision.reason}`);
    try {
      const result = await execute(decision.redactedOutboundPayload);
      await runtime.reportOutcome({ toolCallId: decision.toolCallId, outcome: "succeeded" }).catch(() => undefined);
      return result;
    } catch (error) {
      await runtime.reportOutcome({ toolCallId: decision.toolCallId, outcome: "failed" }).catch(() => undefined);
      throw error;
    }
  }

  return { authorize, authorizeAndExecute };
}
