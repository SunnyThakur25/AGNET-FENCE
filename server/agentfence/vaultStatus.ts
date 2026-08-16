export type VaultEnvironment = Record<string, string | undefined>;

export function getVaultConfigurationStatus(env: VaultEnvironment = process.env) {
  const endpointConfigured = Boolean(env.VAULT_ADDR?.trim());
  const roleIdConfigured = Boolean(env.VAULT_ROLE_ID?.trim());
  const secretIdConfigured = Boolean(env.VAULT_SECRET_ID?.trim());

  return {
    connected: endpointConfigured && roleIdConfigured && secretIdConfigured,
    endpointConfigured,
    roleIdConfigured,
    secretIdConfigured,
    authenticationMethod: "AppRole" as const,
  };
}
