import { describe, expect, it } from "vitest";
import { nextSiemRetryAt, safeSiemEnvelope, splunkHecToken } from "./siemDelivery";

describe("SIEM delivery safeguards", () => {
  it("creates a privacy-safe audit envelope that preserves ledger integrity without exporting actor identity or raw payload", () => {
    const envelope = safeSiemEnvelope({ id: 9, organizationId: 3, sequence: 41, eventType: "gateway.evaluated", actorType: "agent", actorIdentity: "alice@example.com", agentId: 4, toolCallId: 5, policyId: 6, approvalId: null, outcome: "blocked", payload: { rawPrompt: "secret source text" }, previousHash: "a".repeat(64), eventHash: "b".repeat(64), createdAt: new Date("2026-08-17T00:00:00Z") } as never);
    expect(envelope).toMatchObject({ schema: "agentfence.siem-audit-envelope.v1", sequence: 41, eventHash: "b".repeat(64), payloadHash: expect.any(String) });
    expect(JSON.stringify(envelope)).not.toContain("alice@example.com");
    expect(JSON.stringify(envelope)).not.toContain("secret source text");
  });

  it("uses bounded exponential retry timing and accepts only server-side Vault HEC token fields", () => {
    const start = new Date("2026-08-17T00:00:00Z");
    expect(nextSiemRetryAt(1, start).toISOString()).toBe("2026-08-17T00:01:00.000Z");
    expect(nextSiemRetryAt(8, start).toISOString()).toBe("2026-08-17T00:15:00.000Z");
    expect(splunkHecToken({ hec_token: "long-enough-server-only-value" })).toBe("long-enough-server-only-value");
    expect(() => splunkHecToken({ token: "short" })).toThrow("HEC_TOKEN_UNAVAILABLE");
  });
});
