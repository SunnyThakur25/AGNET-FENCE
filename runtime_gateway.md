# AgentFence Runtime Gateway

The AgentFence Runtime Gateway is the enforcement boundary for a customer agent runtime. An administrator issues a short-lived, agent-bound credential from **Settings**. The credential is a signed token, appears only at issuance, can be revoked, and must never be written to source control, a prompt, browser storage, or application logs.

Every runtime request passes a one-time nonce, agent tool metadata, inbound parameters, and any proposed outbound payload to AgentFence. The gateway validates the credential, rejects credential replays, evaluates tenant-scoped policies, creates an immutable audit event, and scans both inbound and outbound content with Data Guard. A delivery callback receives only the redacted outbound payload after an action is allowed.

```ts
import { createAgentFenceRuntimeClient } from "@/shared/agentfence-runtime-client";

const fence = createAgentFenceRuntimeClient({
  endpoint: "https://your-agentfence.example",
  credential: process.env.AGENTFENCE_RUNTIME_CREDENTIAL!,
});

await fence.guardAndDeliver(
  {
    toolName: "crm",
    action: "update_record",
    parameters: { recordId: "123" },
    outboundPayload: { email: "customer@example.com" },
    dataSensitivity: "pii",
    destination: "crm.production",
    riskLevel: "high",
  },
  async safePayload => crmClient.update(safePayload),
);
```

The dedicated Vault deployment remains optional until `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID` are configured. Once configured, the AgentFence control plane can authenticate to Vault using AppRole, while the runtime gateway continues to restrict agent access through signed, revocable credentials and policy checks.

## Vault design references

Vault documents AppRole as an authentication method for machines and automated services. The standard login endpoint is `POST /v1/auth/approle/login`; when a SecretID is used, it should remain confidential, and response wrapping can help avoid direct SecretID distribution.[1] Vault’s AppRole API supports short token TTLs, SecretID TTLs and usage limits, and CIDR constraints.[2]

## References

1. [HashiCorp Vault: Use AppRole authentication](https://developer.hashicorp.com/vault/docs/auth/approle)
2. [HashiCorp Vault: AppRole API](https://developer.hashicorp.com/vault/api-docs/auth/approle)
