import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claims: { tokenId: "runtime-token", organizationId: 5, agentId: 9, vaultCredentialId: 3, allowedScopes: ["crm.read"] },
  credential: { id: 77, tokenId: "runtime-token", organizationId: 5, agentId: 9, vaultCredentialId: 3, allowedScopes: ["crm.read"], tokenTtlSeconds: 300, externalReference: "agentfence/tenants/5/agents/9/credentials/crm", status: "active", expiresAt: new Date("2030-01-01T00:00:00.000Z") },
  gatewayError: null as string | null,
  auditEvents: [] as Array<Record<string, unknown>>,
  policyDecision: "blocked" as "blocked" | "approval_required" | "allowed",
  capturedSensitivity: null as string | null,
  quotaAllowed: true,
}));

const db = {
  select: () => ({ from: () => ({ where: () => {
    const rows = [state.credential] as unknown as Array<typeof state.credential> & { limit: () => Promise<Array<typeof state.credential>>; orderBy: () => Array<typeof state.credential> };
    rows.limit = async () => [state.credential];
    rows.orderBy = () => rows;
    return rows;
  } }) }),
  insert: () => ({ values: async () => [{ insertId: 101 }] }),
};

vi.mock("../db", () => ({ getDb: vi.fn(async () => db) }));
vi.mock("../agentfence/authz", () => ({
  requireAgentInOrganization: vi.fn(async () => ({ id: 9 })),
  requireOrganizationMembership: vi.fn(async (organizationId: number) => {
    if (organizationId !== 5) throw new Error("organization membership required");
  }),
  requireOrganizationRole: vi.fn(async () => undefined),
}));
vi.mock("../agentfence/audit", () => ({ appendAuditEvent: vi.fn(async (event: Record<string, unknown>) => { state.auditEvents.push(event); }) }));
vi.mock("../agentfence/runtimeAuth", () => ({ verifyRuntimeToken: vi.fn(async () => state.claims), issueRuntimeToken: vi.fn(), scopeAllows: vi.fn(() => true), isRuntimeCredentialUsable: vi.fn(() => true) }));
vi.mock("../agentfence/runtimeGatewayGuard", () => ({
  authorizeRuntimeGatewayRequest: vi.fn(async (input: { credential: typeof state.credential; claims: typeof state.claims }) => {
    if (state.gatewayError) throw new Error(state.gatewayError);
    if (input.credential.organizationId !== input.claims.organizationId || input.credential.agentId !== input.claims.agentId) throw new Error("runtime_credential_inactive");
    return true;
  }),
}));
vi.mock("../agentfence/policyEngine", () => ({ evaluatePolicies: vi.fn((_policies, request: { dataSensitivity: string }) => { state.capturedSensitivity = request.dataSensitivity; return { decision: state.policyDecision, reason: `Synthetic ${state.policyDecision} decision from the controlled assessment policy boundary.` }; }) }));
vi.mock("../agentfence/tenantQuotas", () => ({ consumeTenantQuota: vi.fn(async () => ({ allowed: state.quotaAllowed, used: state.quotaAllowed ? 1 : 601, limit: 600, remaining: state.quotaAllowed ? 599 : 0, windowStartedAt: new Date("2030-01-01T00:00:00.000Z") })) }));
vi.mock("../agentfence/vaultClient", () => ({
  createVaultAppRoleClient: vi.fn(() => ({
    issueLease: vi.fn(async () => ({ leaseId: "internal-lease", leaseDurationSeconds: 300, renewable: true })),
    revokeLease: vi.fn(async () => ({ revoked: true })),
    rotateLease: vi.fn(async () => ({ leaseId: "replacement-lease", leaseDurationSeconds: 300, renewable: true })),
  })),
}));

import { agentfenceRouter } from "./agentfence";

function caller() {
  return agentfenceRouter.createCaller({ user: { id: 1, openId: "admin", role: "admin", email: "admin@example.test", name: "Admin" } } as never);
}

const runtimeInput = {
  token: "x".repeat(40),
  nonce: "a123456789012345",
  toolName: "crm",
  action: "read",
  parameters: {},
  dataSensitivity: "internal" as const,
  destination: "crm.production",
  riskLevel: "low" as const,
};

describe("agentfence runtime procedures", () => {
  beforeEach(() => {
    state.claims = { tokenId: "runtime-token", organizationId: 5, agentId: 9, vaultCredentialId: 3, allowedScopes: ["crm.read"] };
    state.credential = { id: 77, tokenId: "runtime-token", organizationId: 5, agentId: 9, vaultCredentialId: 3, allowedScopes: ["crm.read"], tokenTtlSeconds: 300, externalReference: "agentfence/tenants/5/agents/9/credentials/crm", status: "active", expiresAt: new Date("2030-01-01T00:00:00.000Z") };
    state.gatewayError = null;
    state.auditEvents = [];
    state.policyDecision = "blocked";
    state.capturedSensitivity = null;
    state.quotaAllowed = true;
  });

  it("returns an unauthorized error when the gateway detects a duplicate nonce replay", async () => {
    state.gatewayError = "runtime_request_replay";
    await expect(caller().runtime.evaluate(runtimeInput)).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Runtime request replay detected." });
  });

  it("rejects a signed runtime credential whose stored organization does not match its token claim", async () => {
    state.credential = { ...state.credential, organizationId: 6 };
    await expect(caller().runtime.evaluate(runtimeInput)).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Runtime credential is invalid or inactive." });
  });

  it("supplies a secret outbound payload classification to policy evaluation before any delivery callback can run", async () => {
    state.policyDecision = "blocked";
    await expect(caller().runtime.evaluate({ ...runtimeInput, outboundPayload: { authorization: "Bearer a-tenant-secret-token-123456" } })).resolves.toMatchObject({ decision: "blocked", allowed: false });
    expect(state.capturedSensitivity).toBe("secret");
  });

  it("stops a signed runtime action when the tenant gateway quota is exhausted", async () => {
    state.quotaAllowed = false;
    await expect(caller().runtime.evaluate(runtimeInput)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "This organization has reached its Tool Gateway evaluation quota for the current minute." });
  });

  it("refuses Action Capture queries outside the caller's organization before records can be read", async () => {
    await expect(caller().observability.capture({ organizationId: 6, limit: 20 })).rejects.toThrow("organization membership required");
  });

  it("rejects an out-of-tenant Vault reference before any credential record is created", async () => {
    await expect(caller().vault.createReference({ organizationId: 5, teamId: null, name: "Payments", provider: "Vault KV", externalReference: "agentfence/tenants/6/agents/9/credentials/payments", allowedScopes: ["read"], tokenTtlSeconds: 300 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Vault credential references must stay inside this organization’s AgentFence tenant path." });
  });

  it("rejects requested runtime scopes outside the selected Vault credential reference", async () => {
    await expect(caller().runtime.issueCredential({ organizationId: 5, agentId: 9, vaultCredentialId: 77, requestedScopes: ["billing.pay"], ttlSeconds: 180 })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Requested runtime scopes exceed this Vault credential reference." });
  });

  it("rejects a runtime credential TTL above the selected Vault credential reference limit", async () => {
    await expect(caller().runtime.issueCredential({ organizationId: 5, agentId: 9, vaultCredentialId: 77, requestedScopes: ["crm.read"], ttlSeconds: 301 })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Requested runtime TTL exceeds this Vault credential reference." });
  });

  it("issues, revokes, and rotates Vault leases through protected tenant-scoped procedures without returning lease IDs", async () => {
    await expect(caller().vault.issueLease({ organizationId: 5, agentId: 9, vaultCredentialId: 77 })).resolves.toEqual({ leaseDurationSeconds: 300, renewable: true });
    await expect(caller().vault.revokeLease({ organizationId: 5, leaseId: "server-only-lease" })).resolves.toEqual({ success: true });
    await expect(caller().vault.rotateLease({ organizationId: 5, agentId: 9, vaultCredentialId: 77, previousLeaseId: "server-only-lease" })).resolves.toEqual({ leaseDurationSeconds: 300, renewable: true });
  });

  it.each([
    ["agent_goal_hijack", "blocked", "passed"],
    ["unexpected_code_execution", "approval_required", "needs_review"],
    ["rogue_agents", "allowed", "failed"],
  ] as const)("records the %s controlled OWASP assessment as %s without external execution", async (scenarioType, decision, expectedStatus) => {
    state.policyDecision = decision;
    const result = await caller().simulations.runSafeScenario({ organizationId: 5, agentId: 9, scenarioType });
    expect(result.status).toBe(expectedStatus);
    expect(result.actualOutcome).toContain(`Synthetic ${decision} decision`);
    expect(state.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "simulation.completed", outcome: "simulated", payload: expect.objectContaining({ scenarioType, status: expectedStatus }) })]));
  });
});
