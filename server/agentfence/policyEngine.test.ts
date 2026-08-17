import { describe, expect, it } from "vitest";
import { inspectAndRedact, inspectOutboundAndRedact, strongestDataClassification } from "./dataGuard";
import { evaluatePolicies } from "./policyEngine";
import { hashAuditEvent, isAuditHashValid } from "./audit";
import { isApprovalExpired } from "./approvals";
import { isOrganizationRoleAllowed } from "./authz";
import { getVaultConfigurationStatus } from "./vaultStatus";
import { isRuntimeCredentialUsable, isRuntimeNonceSafe, issueRuntimeToken, verifyRuntimeToken } from "./runtimeAuth";
import { createVaultAppRoleClient, VaultNotConfiguredError, vaultBaseUrl } from "./vaultClient";
import { createGatewayNonce } from "../../shared/agentfence-runtime-client";
import { isLeaseDurationAllowed, VAULT_LEASE_CONTRACT, vaultCredentialPath } from "./vaultContract";
import { isVaultPathForOrganization } from "./vaultContract";
import { authorizeRuntimeGatewayRequest } from "./runtimeGatewayGuard";
import { deriveRuntimeCredentialScope } from "./runtimeScope";
import { getOwaspAgenticScenario, OWASP_AGENTIC_TOP10 } from "../../shared/owaspAgentic";
import { buildActionTrace } from "./actionTrace";

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

  it("uses the strongest outbound Data Guard classification for policy evaluation before delivery", () => {
    const outbound = inspectOutboundAndRedact({ authorization: "Bearer a-tenant-secret-token-123456" });
    const sensitivity = strongestDataClassification("internal", "internal", outbound.classification);
    const result = evaluatePolicies([{
      id: 42,
      name: "Block secret-bearing CRM updates",
      effect: "deny",
      toolPattern: "crm",
      actionPattern: "case.update",
      parameterConstraints: [],
      dataSensitivity: "secret",
      destinationPattern: "crm.production",
      priority: 100,
    }], { toolName: "crm", action: "case.update", parameters: {}, dataSensitivity: sensitivity, destination: "crm.production" });
    expect(sensitivity).toBe("secret");
    expect(result.decision).toBe("blocked");
  });

  it("evaluates authorization roles and approval expiry deterministically", () => {
    expect(isOrganizationRoleAllowed("operator", ["admin"])).toBe(false);
    expect(isOrganizationRoleAllowed("admin", ["admin"])).toBe(true);
    expect(isApprovalExpired(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:01.000Z").getTime())).toBe(true);
    expect(isApprovalExpired(new Date("2026-01-01T00:00:01.000Z"), new Date("2026-01-01T00:00:00.000Z").getTime())).toBe(false);
  });

  it("reports Vault configuration without returning secret values", () => {
    expect(getVaultConfigurationStatus({})).toEqual({
      connected: false,
      endpointConfigured: false,
      roleIdConfigured: false,
      secretIdConfigured: false,
      authenticationMethod: "AppRole",
    });
    expect(getVaultConfigurationStatus({ VAULT_ADDR: "https://vault.example.test", VAULT_ROLE_ID: "role", VAULT_SECRET_ID: "secret" })).toEqual({
      connected: true,
      endpointConfigured: true,
      roleIdConfigured: true,
      secretIdConfigured: true,
      authenticationMethod: "AppRole",
    });
  });

  it("issues and verifies a short-lived signed runtime credential", async () => {
    const prior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "a".repeat(48);
    try {
      const token = await issueRuntimeToken({ tokenId: "runtime-token-id", organizationId: 11, agentId: 7, vaultCredentialId: 4, allowedScopes: ["crm.read"] }, 300);
      await expect(verifyRuntimeToken(token)).resolves.toEqual({ tokenId: "runtime-token-id", organizationId: 11, agentId: 7, vaultCredentialId: 4, allowedScopes: ["crm.read"] });
    } finally {
      if (prior === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prior;
    }
  });

  it("keeps the Vault client disconnected and refuses authentication without configuration", async () => {
    const client = createVaultAppRoleClient({});
    await expect(client.probe()).resolves.toMatchObject({ connected: false, reachable: false, detail: "not_configured" });
    await expect(client.login()).rejects.toBeInstanceOf(VaultNotConfiguredError);
    expect(vaultBaseUrl("https://vault.example.test/")).toBe("https://vault.example.test");
    expect(() => vaultBaseUrl("http://vault.example.test")).toThrow("Vault must use HTTPS");
  });

  it("uses the dedicated AppRole login endpoint only when Vault is configured", async () => {
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const fetchMock = (async (url: string | URL | Request, options?: RequestInit) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ auth: { client_token: "server-only-token", accessor: "accessor", lease_duration: 600, renewable: false } }), { status: 200 });
    }) as typeof fetch;
    const client = createVaultAppRoleClient({ VAULT_ADDR: "https://vault.example.test", VAULT_ROLE_ID: "role", VAULT_SECRET_ID: "secret" }, fetchMock);
    await expect(client.login()).resolves.toEqual({ clientToken: "server-only-token", accessor: "accessor", leaseDurationSeconds: 600, renewable: false });
    expect(calls[0]?.url).toBe("https://vault.example.test/v1/auth/approle/login");
    expect(calls[0]?.options?.method).toBe("POST");
  });

  it("returns Vault lease metadata without returning raw credential values", async () => {
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const fetchMock = (async (url: string | URL | Request, options?: RequestInit) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1) return new Response(JSON.stringify({ auth: { client_token: "server-only-token" } }), { status: 200 });
      return new Response(JSON.stringify({ lease_id: "lease-id", lease_duration: 300, renewable: true, data: { password: "never-returned" } }), { status: 200 });
    }) as typeof fetch;
    const client = createVaultAppRoleClient({ VAULT_ADDR: "https://vault.example.test", VAULT_ROLE_ID: "role", VAULT_SECRET_ID: "secret" }, fetchMock);
    await expect(client.issueLease("agentfence/tenants/5/agents/9/credentials/crm")).resolves.toEqual({ leaseId: "lease-id", leaseDurationSeconds: 300, renewable: true });
    expect(calls[1]?.options?.headers).toMatchObject({ "X-Vault-Token": "server-only-token" });
  });

  it("rotates a Vault lease by revoking it before requesting a replacement", async () => {
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const fetchMock = (async (url: string | URL | Request, options?: RequestInit) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1 || calls.length === 3) return new Response(JSON.stringify({ auth: { client_token: "server-only-token" } }), { status: 200 });
      if (calls.length === 2) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ lease_id: "new-lease-id", lease_duration: 180, renewable: true }), { status: 200 });
    }) as typeof fetch;
    const client = createVaultAppRoleClient({ VAULT_ADDR: "https://vault.example.test", VAULT_ROLE_ID: "role", VAULT_SECRET_ID: "secret" }, fetchMock);
    await expect(client.rotateLease("old-lease-id", "agentfence/tenants/5/agents/9/credentials/crm")).resolves.toEqual({ leaseId: "new-lease-id", leaseDurationSeconds: 180, renewable: true });
    expect(calls[1]?.url).toBe("https://vault.example.test/v1/sys/leases/revoke");
    expect(calls[3]?.url).toBe("https://vault.example.test/v1/agentfence/tenants/5/agents/9/credentials/crm");
  });

  it("uses distinct URL-safe nonces for each runtime gateway request", () => {
    const first = createGatewayNonce();
    const second = createGatewayNonce();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-f0-9-]{36}$/i);
  });

  it("uses tenant- and agent-scoped Vault paths with bounded lease durations", () => {
    expect(vaultCredentialPath(12, 7, "Payments API / Production")).toBe("agentfence/tenants/12/agents/7/credentials/payments-api-production");
    expect(isLeaseDurationAllowed(VAULT_LEASE_CONTRACT.defaultCredentialLeaseSeconds)).toBe(true);
    expect(isLeaseDurationAllowed(VAULT_LEASE_CONTRACT.maximumCredentialLeaseSeconds + 1)).toBe(false);
  });

  it("enforces runtime credential revocation, expiry, tenant binding, and nonce requirements", () => {
    const claims = { tokenId: "runtime-token", organizationId: 5, agentId: 9, vaultCredentialId: 3, allowedScopes: ["crm.read"] };
    const active = { ...claims, status: "active" as const, expiresAt: new Date("2026-01-01T00:10:00.000Z") };
    expect(isRuntimeCredentialUsable(active, claims, new Date("2026-01-01T00:00:00.000Z").getTime())).toBe(true);
    expect(isRuntimeCredentialUsable({ ...active, status: "revoked" }, claims, new Date("2026-01-01T00:00:00.000Z").getTime())).toBe(false);
    expect(isRuntimeCredentialUsable(active, { ...claims, organizationId: 6 }, new Date("2026-01-01T00:00:00.000Z").getTime())).toBe(false);
    expect(isRuntimeCredentialUsable(active, claims, new Date("2026-01-01T00:20:00.000Z").getTime())).toBe(false);
    expect(isRuntimeNonceSafe("a123456789012345")).toBe(true);
    expect(isRuntimeNonceSafe("reused nonce with spaces")).toBe(false);
  });

  it("rejects a replayed nonce in the gateway authorization path", async () => {
    const used = new Set<string>();
    const reserveNonce = async (_credentialId: number, nonce: string) => {
      if (used.has(nonce)) return false;
      used.add(nonce);
      return true;
    };
    const claims = { tokenId: "runtime-token", organizationId: 5, agentId: 9, vaultCredentialId: 3, allowedScopes: ["crm.read"] };
    const credential = { ...claims, status: "active" as const, expiresAt: new Date("2026-01-01T00:10:00.000Z") };
    await expect(authorizeRuntimeGatewayRequest({ runtimeCredentialId: 1, credential, claims, nonce: "a123456789012345", reserveNonce, now: new Date("2026-01-01T00:00:00.000Z").getTime() })).resolves.toBe(true);
    await expect(authorizeRuntimeGatewayRequest({ runtimeCredentialId: 1, credential, claims, nonce: "a123456789012345", reserveNonce, now: new Date("2026-01-01T00:00:00.000Z").getTime() })).rejects.toThrow("runtime_request_replay");
  });

  it("keeps Vault references inside their organization tenant prefix", () => {
    const path = vaultCredentialPath(12, 7, "Payments API");
    expect(isVaultPathForOrganization(path, 12)).toBe(true);
    expect(isVaultPathForOrganization(path, 13)).toBe(false);
  });

  it("limits issued runtime credentials to the selected Vault reference scopes and TTL", () => {
    expect(deriveRuntimeCredentialScope({ referenceScopes: ["crm.read", "crm.write"], referenceTtlSeconds: 300, requestedScopes: ["crm.read"], requestedTtlSeconds: 180 })).toEqual({ scopes: ["crm.read"], ttlSeconds: 180 });
    expect(() => deriveRuntimeCredentialScope({ referenceScopes: ["crm.read"], referenceTtlSeconds: 300, requestedScopes: ["billing.pay"], requestedTtlSeconds: 180 })).toThrow("runtime_scope_exceeds_reference");
    expect(() => deriveRuntimeCredentialScope({ referenceScopes: ["crm.read"], referenceTtlSeconds: 300, requestedScopes: ["crm.read"], requestedTtlSeconds: 301 })).toThrow("runtime_ttl_exceeds_reference");
  });

  it("maps each OWASP Agentic Top 10 category to a synthetic policy request without executable payload content", () => {
    expect(OWASP_AGENTIC_TOP10).toHaveLength(10);
    expect(OWASP_AGENTIC_TOP10.map(scenario => scenario.asi)).toEqual(["ASI01", "ASI02", "ASI03", "ASI04", "ASI05", "ASI06", "ASI07", "ASI08", "ASI09", "ASI10"]);
    for (const scenario of OWASP_AGENTIC_TOP10) {
      expect(getOwaspAgenticScenario(scenario.id)).toEqual(scenario);
      expect(scenario.request).toMatchObject({ toolName: expect.any(String), action: expect.any(String), destination: expect.any(String) });
      expect(JSON.stringify(scenario.request)).not.toMatch(/curl|wget|powershell|rm -rf|<script/i);
    }
  });

  it("builds a privacy-safe action trace that contains a blocked action before the target boundary", () => {
    const trace = buildActionTrace({
      call: { id: 9, toolName: "browser", action: "form.submit", destination: "payments.internal", decision: "blocked", dataSensitivity: "secret", redactedParameters: { apiKey: "[REDACTED_SECRET]" }, targetOutcome: null, targetStatusCode: null, targetReference: null, targetRecordedAt: null, createdAt: new Date("2026-01-01T00:00:00.000Z") },
      agent: { id: 3, name: "Finance browser agent", identity: "finance.browser.prod" },
      policy: { id: 5, name: "Block payment secret submission" },
      findings: [{ classification: "secret", actionTaken: "blocked", occurrences: 1, createdAt: new Date("2026-01-01T00:00:01.000Z") }],
      approval: null,
      auditEvents: [{ id: 2, eventType: "runtime.gateway_evaluated", outcome: "blocked", createdAt: new Date("2026-01-01T00:00:02.000Z") }],
    });
    expect(trace.hops.map(hop => hop.label)).toContain("Target boundary contained");
    expect(trace.hops.at(-1)).toMatchObject({ status: "blocked" });
    expect(JSON.stringify(trace)).not.toContain("plain-secret-value");
    expect(JSON.stringify(trace)).toContain("[REDACTED_SECRET]");
  });

  it("includes an opaque target-system success outcome after an allowed action is released", () => {
    const trace = buildActionTrace({
      call: { id: 12, toolName: "crm", action: "case.update", destination: "crm.internal", decision: "allowed", dataSensitivity: "internal", redactedParameters: { status: "resolved" }, targetOutcome: "succeeded", targetStatusCode: 200, targetReference: "case-981", targetRecordedAt: new Date("2026-01-01T00:01:00.000Z"), createdAt: new Date("2026-01-01T00:00:00.000Z") },
      agent: { id: 3, name: "Support agent", identity: "support.prod" },
      policy: { id: 5, name: "Allow scoped case update" },
      findings: [],
      approval: null,
      auditEvents: [{ id: 2, eventType: "runtime.gateway_evaluated", outcome: "allowed", createdAt: new Date("2026-01-01T00:00:02.000Z") }],
    });
    expect(trace.hops.at(-1)).toMatchObject({ label: "Target-system outcome recorded", status: "allowed" });
    expect(trace.hops.at(-1)?.detail).toContain("status 200");
    expect(trace.action).toMatchObject({ targetOutcome: "succeeded", targetReference: "case-981" });
    expect(JSON.stringify(trace)).not.toContain("raw-target-response");
  });
});
