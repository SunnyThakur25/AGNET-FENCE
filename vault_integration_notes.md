# Vault AppRole Integration Notes

AgentFence will use Vault AppRole only from the server-side control plane. The standard AppRole login endpoint is `POST /v1/auth/approle/login`, supplying a `role_id` and `secret_id`; the Vault response returns the authenticated client token in `auth.client_token`. AppRole roles should be scoped narrowly with short token and SecretID lifetimes, bound CIDRs where appropriate, and explicit policies.

The integration must not place raw Vault tokens, SecretIDs, or provider credentials in the browser, AgentFence database, audit payloads, policy fields, or agent prompts. AgentFence stores only tenant-scoped credential-reference metadata, issues signed runtime gateway credentials, and records only lease metadata or revocation events in its audit ledger.

Vault recommends AppRole for automated workloads and describes response wrapping as a way to provide a short-lived wrapping token rather than expose a SecretID directly. The initial AgentFence deployment supports an intentionally disconnected-safe state until `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID` are securely configured.

## References

1. [HashiCorp Vault: Use AppRole authentication](https://developer.hashicorp.com/vault/docs/auth/approle)
2. [HashiCorp Vault: AppRole API](https://developer.hashicorp.com/vault/api-docs/auth/approle)
