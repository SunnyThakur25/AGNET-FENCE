import { describe, expect, it } from "vitest";
import { inspectAndRedact, inspectOutboundAndRedact } from "./dataGuard";
import { evaluatePolicies } from "./policyEngine";
import { hashAuditEvent, isAuditHashValid } from "./audit";
import { isApprovalExpired } from "./approvals";
import { isOrganizationRoleAllowed } from "./authz";

describe("AgentFence enforcement core", () => {
  it("blocks by default when no policy grants access", () => {
    const result = evaluatePolicies([], {
      toolName: "payments",
      action: "issue_refund",
      parameters: { amount: 25 },
      dataSensitivity: "internal",
      destination: "internal",
    });
    expect(result.decision).toBe("blocked");
  });

  it("requires approval for a matching high-impact action", () => {
    const result = evaluatePolicies(
      [{
        id: 1,
        name: "Refunds require review",
        effect: "require_approval",
        toolPattern: "payments",
        actionPattern: "issue_refund",
        parameterConstraints: [{ field: "amount", operator: "gt", value: 100 }],
        dataSensitivity: "any",
        destinationPattern: "*",
        priority: 100,
      }],
      {
        toolName: "payments",
        action: "issue_refund",
        parameters: { amount: 150 },
        dataSensitivity: "internal",
        destination: "internal",
      },
    );
    expect(result.decision).toBe("approval_required");
  });

  it("redacts secrets before they can be recorded in an audit event", () => {
    const guarded = inspectAndRedact({ token: "sk-live-1234567890abcdefghijkl" });
    expect(JSON.stringify(guarded.redactedValue)).not.toContain("1234567890abcdefghijkl");
    expect(guarded.classification).toBe("secret");
  });

  it("creates different hashes when the immutable event content changes", () => {
    const first = hashAuditEvent("0".repeat(64), { sequence: 1, outcome: "allowed" });
    const changed = hashAuditEvent("0".repeat(64), { sequence: 1, outcome: "blocked" });
    expect(first).not.toBe(changed);
    expect(isAuditHashValid("0".repeat(64), { sequence: 1, outcome: "allowed" }, first)).toBe(true);
    expect(isAuditHashValid("0".repeat(64), { sequence: 1, outcome: "blocked" }, first)).toBe(false);
  });

  it("applies the same redaction boundary to outbound content", () => {
    const guarded = inspectOutboundAndRedact("Send to destination: sk-live-1234567890abcdefghijkl");
    expect(guarded.classification).toBe("secret");
    expect(String(guarded.redactedValue)).toContain("[REDACTED_SECRET]");
  });

  it("evaluates authorization roles and approval expiry deterministically", () => {
    expect(isOrganizationRoleAllowed("operator", ["admin"])).toBe(false);
    expect(isOrganizationRoleAllowed("admin", ["admin"])).toBe(true);
    expect(isApprovalExpired(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:01.000Z").getTime())).toBe(true);
    expect(isApprovalExpired(new Date("2026-01-01T00:00:01.000Z"), new Date("2026-01-01T00:00:00.000Z").getTime())).toBe(false);
  });
});
