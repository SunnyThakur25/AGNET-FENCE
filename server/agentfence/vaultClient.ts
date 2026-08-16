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

  return { status, login, probe };
}
