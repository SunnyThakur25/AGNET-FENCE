import { getVaultConfigurationStatus, type VaultEnvironment } from "./vaultStatus";

type FetchLike = typeof fetch;

type VaultLoginResponse = {
  auth?: {
    client_token?: string;
    accessor?: string;
    lease_duration?: number;
    renewable?: boolean;
  };
};

type VaultLeaseResponse = {
  lease_id?: string;
  lease_duration?: number;
  renewable?: boolean;
};

type VaultSecretResponse = {
  data?: { data?: Record<string, unknown> } | Record<string, unknown>;
};

export class VaultNotConfiguredError extends Error {
  constructor() {
    super("Dedicated Vault is not configured. Add VAULT_ADDR, VAULT_ROLE_ID, and VAULT_SECRET_ID before connecting.");
  }
}

export function vaultBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Vault must use HTTPS outside a local development environment.");
  }
  return url.toString().replace(/\/$/, "");
}

export function createVaultAppRoleClient(env: VaultEnvironment = process.env, fetchImpl: FetchLike = fetch) {
  const status = getVaultConfigurationStatus(env);

  async function login() {
    if (!status.connected) throw new VaultNotConfiguredError();
    const endpoint = `${vaultBaseUrl(env.VAULT_ADDR!)}/v1/auth/approle/login`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role_id: env.VAULT_ROLE_ID, secret_id: env.VAULT_SECRET_ID }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Vault AppRole login failed with HTTP ${response.status}.`);
    const payload = await response.json() as VaultLoginResponse;
    const token = payload.auth?.client_token;
    if (!token) throw new Error("Vault AppRole login did not return an authenticated client token.");
    return {
      clientToken: token,
      accessor: payload.auth?.accessor ?? null,
      leaseDurationSeconds: payload.auth?.lease_duration ?? 0,
      renewable: Boolean(payload.auth?.renewable),
    };
  }

  async function probe() {
    if (!status.connected) return { ...status, reachable: false, detail: "not_configured" as const };
    const response = await fetchImpl(`${vaultBaseUrl(env.VAULT_ADDR!)}/v1/sys/health?standbyok=true&sealedcode=204&uninitcode=204`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    return { ...status, reachable: response.ok || response.status === 204, detail: response.ok || response.status === 204 ? "ready" as const : "unhealthy" as const };
  }

  async function issueLease(secretPath: string) {
    const session = await login();
    const response = await fetchImpl(`${vaultBaseUrl(env.VAULT_ADDR!)}/v1/${secretPath.replace(/^\/+/, "")}`, {
      method: "GET",
      headers: { "X-Vault-Token": session.clientToken },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Vault credential lease request failed with HTTP ${response.status}.`);
    const payload = await response.json() as VaultLeaseResponse;
    if (!payload.lease_id) throw new Error("Vault did not return a renewable lease for this credential reference.");
    return { leaseId: payload.lease_id, leaseDurationSeconds: payload.lease_duration ?? 0, renewable: Boolean(payload.renewable) };
  }

  async function readSecret(secretPath: string) {
    const session = await login();
    const response = await fetchImpl(`${vaultBaseUrl(env.VAULT_ADDR!)}/v1/${secretPath.replace(/^\/+/, "")}`, {
      method: "GET",
      headers: { "X-Vault-Token": session.clientToken },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Vault connector secret read failed with HTTP ${response.status}.`);
    const payload = await response.json() as VaultSecretResponse;
    const data = payload.data && "data" in payload.data ? payload.data.data : payload.data;
    if (!data || typeof data !== "object") throw new Error("Vault connector secret record was empty or invalid.");
    return data;
  }

  async function revokeLease(leaseId: string) {
    const session = await login();
    const response = await fetchImpl(`${vaultBaseUrl(env.VAULT_ADDR!)}/v1/sys/leases/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Vault-Token": session.clientToken },
      body: JSON.stringify({ lease_id: leaseId }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Vault lease revocation failed with HTTP ${response.status}.`);
    return { revoked: true as const };
  }

  async function rotateLease(previousLeaseId: string, secretPath: string) {
    await revokeLease(previousLeaseId);
    return issueLease(secretPath);
  }

  return { status, login, probe, issueLease, readSecret, revokeLease, rotateLease };
}
