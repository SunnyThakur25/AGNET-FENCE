export const VAULT_LEASE_CONTRACT = {
  defaultCredentialLeaseSeconds: 300,
  maximumCredentialLeaseSeconds: 900,
  runtimeGatewayCredentialSeconds: 3600,
  responseWrappingTtlSeconds: 300,
} as const;

export function vaultCredentialPath(organizationId: number, agentId: number, credentialName: string) {
  const normalized = credentialName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/(^-|-$)/g, "");
  if (!Number.isInteger(organizationId) || organizationId < 1 || !Number.isInteger(agentId) || agentId < 1 || !normalized) {
    throw new Error("A valid organization, agent, and credential name are required for a Vault path.");
  }
  return `agentfence/tenants/${organizationId}/agents/${agentId}/credentials/${normalized}`;
}

export function isLeaseDurationAllowed(ttlSeconds: number) {
  return Number.isInteger(ttlSeconds) && ttlSeconds >= 60 && ttlSeconds <= VAULT_LEASE_CONTRACT.maximumCredentialLeaseSeconds;
}

export function isVaultPathForOrganization(path: string, organizationId: number) {
  return path.startsWith(`agentfence/tenants/${organizationId}/`);
}
