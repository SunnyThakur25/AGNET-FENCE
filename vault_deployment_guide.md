# AgentFence Dedicated Vault Deployment Guide

This guide defines the dedicated Vault deployment that AgentFence uses as its credential control plane. AgentFence remains operational before Vault is configured; in that disconnected state, it retains credential references and signed runtime gateway controls but cannot obtain live provider credentials.

## Tenant namespace and lease contract

AgentFence scopes every credential to its organization and agent. Credential locations must follow the path convention below, where the credential name is normalized to lowercase letters, digits, periods, underscores, and hyphens.

| Control | AgentFence contract |
|---|---|
| Vault path | `agentfence/tenants/{organizationId}/agents/{agentId}/credentials/{credentialName}` |
| Default live credential lease | 300 seconds |
| Maximum live credential lease | 900 seconds |
| AgentFence runtime gateway credential | 3,600 seconds, signed and revocable in AgentFence |
| Response-wrapping TTL | 300 seconds |
| Revocation | Revoke the AgentFence runtime credential immediately; revoke the corresponding Vault lease or provider credential if issued |
| Tenant isolation | One Vault policy path prefix per organization; an AppRole must not be granted wildcard access across tenant prefixes |

The AppRole control-plane token must be limited to the tenant prefixes that the AgentFence deployment serves. Use a separate deployment or namespace for stronger customer-level isolation where required by the customer’s risk model.

## Prerequisites

The Vault deployment must be reachable over TLS and have the AppRole auth method enabled. Vault audit devices should be enabled before placing live credentials behind AgentFence. Do not use development-mode Vault, HTTP endpoints, static root tokens, or an AppRole with broad `sudo` or wildcard secret access.

| Required item | Purpose |
|---|---|
| `VAULT_ADDR` | HTTPS base URL for the dedicated Vault deployment |
| `VAULT_ROLE_ID` | AppRole identifier for the AgentFence server-side control plane |
| `VAULT_SECRET_ID` | Short-lived AppRole SecretID; secure deployment secret only |
| AppRole policy | Read or generate only the allowed organization and agent credential paths |
| Vault audit device | Independent record of AppRole logins, reads, lease renewals, and revocations |

## AppRole setup

Create an AppRole for the **AgentFence control plane**, not for individual browser sessions or agents. HashiCorp documents AppRole for automated machines and services; its login endpoint is `POST /v1/auth/approle/login`, with `role_id` always required and `secret_id` required by default.[1] [2]

The following is an illustrative Vault policy. Adapt the mount and exact capabilities to the secrets engine in use. The policy must not grant access to another organization’s prefix.

```hcl
path "agentfence/tenants/42/*" {
  capabilities = ["read", "list"]
}

path "sys/leases/revoke" {
  capabilities = ["update"]
}
```

Configure short limits on the AppRole itself. HashiCorp’s API supports a batch token type, token TTL and maximum TTL, SecretID TTL and use limits, CIDR binding, and explicit policies.[2] Start with a SecretID TTL of ten minutes or less, limited uses, and a token TTL no longer than the current operational need. Bind SecretIDs and tokens to approved CIDRs where the deployment has stable egress networking.

## Response wrapping, rotation, and revocation

Do not distribute a raw SecretID to an AgentFence browser or to an AI agent. Vault describes response wrapping as a way for a trusted orchestrator to provide a short-lived wrapping token rather than expose the SecretID directly.[1] Deliver the wrapping token only to the server-side deployment mechanism, unwrap it once, and rotate the SecretID on the schedule enforced by the AppRole policy.

If suspicious activity is detected, revoke the affected AgentFence runtime credential in **Settings**, revoke the corresponding Vault lease, rotate the Vault SecretID, and review both Vault audit records and the AgentFence tamper-evident ledger. Do not put customer data, API keys, or SecretIDs in Vault AppRole metadata because Vault documents that SecretID metadata is written to audit logs in plaintext.[2]

## Production hardening checklist

- [ ] Vault endpoint uses TLS with a trusted certificate and no insecure HTTP fallback.
- [ ] Vault audit logging is enabled, protected, and retained according to the customer’s evidence policy.
- [ ] AppRole has a narrow tenant path policy, short SecretID and token limits, and no root or wildcard cross-tenant access.
- [ ] `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID` exist only in protected deployment settings; they are not browser variables, database fields, logs, prompts, or source files.
- [ ] Each provider credential path follows the AgentFence organization and agent path convention.
- [ ] AgentFence runtime credentials are short-lived, issued once, stored outside source control, and revoked on agent retirement, incident response, or workforce offboarding.
- [ ] The runtime gateway is placed before every sensitive tool or outbound delivery path and receives only the Data Guard-redacted payload for final delivery.
- [ ] A restore and incident exercise verifies Vault lease revocation, AgentFence credential revocation, tenant isolation, and evidence export at least quarterly.

## References

1. [HashiCorp Vault: Use AppRole authentication](https://developer.hashicorp.com/vault/docs/auth/approle)
2. [HashiCorp Vault: AppRole API](https://developer.hashicorp.com/vault/api-docs/auth/approle)
