# AgentFence Release Readiness

**Status:** The application is ready for controlled production activation after the organization confirms its identity, database, runtime-agent, and Vault operating prerequisites. The release is not a substitute for an organization's change-control process, incident response plan, or target-system authorization model.

## Audit outcome

The active AgentFence route tree contains product routes only. The generic component showcase, demonstration chat, Google Map wrapper, chart component, and their unused dependencies were removed because they were not registered in the application and introduced unnecessary demo behavior or supply-chain surface. The OWASP Agentic Top 10 feature remains intentionally available as a **controlled assessment**: it evaluates a fixed policy request, records the result, and does not execute payloads, browse, call tools, or contact external systems.

| Area | Release result | Operational requirement |
|---|---|---|
| Authentication and tenant authorization | Manus OAuth session handling and organization membership checks are active. | Keep the platform OAuth configuration and `JWT_SECRET` managed by the deployment environment. |
| Agent enforcement | The signed runtime gateway, replay protection, policy evaluation, Data Guard, approvals, and audit chain are implemented. | Route every consequential cloud or browser-agent action through the signed wrapper; do not permit a direct bypass path. |
| Credentials | Vault AppRole lease, revoke, and rotation paths are implemented without returning raw secret values. | Configure a dedicated Vault deployment before enabling live enterprise credentials. |
| Observability | Action Capture and Action Trace retain governed metadata and target outcomes without raw secrets, prompts, page content, or response bodies. | Forward relevant audit and alert events to the organization's SIEM/SOAR process. |
| Controlled assessments | OWASP scenarios are synthetic policy-control tests, not attack execution. | Run them against a staging policy set before changing production boundaries. |
| HTTP perimeter | Security headers, HSTS on HTTPS requests, a `/healthz` endpoint, proxy awareness, and 1 MB API body limits are enabled. | Terminate TLS at the trusted edge and retain platform WAF, DDoS, and rate-limit controls. |

## Required activation inputs

The hosted runtime supplies the platform configuration required by AgentFence: `DATABASE_URL`, `JWT_SECRET`, Manus OAuth settings, and Forge storage/notification/LLM credentials. No hardcoded API keys, passwords, or secret material are present in product source.

Live Vault-backed credentials are the only deliberately deferred integration. Supply these through the deployment secret manager, never through source control or the browser:

| Secret | Purpose |
|---|---|
| `VAULT_ADDR` | HTTPS address of the dedicated Vault control plane. |
| `VAULT_ROLE_ID` | AppRole identifier for the AgentFence server workload. |
| `VAULT_SECRET_ID` | AppRole secret identifier, delivered through a secure secret channel. |

Each enterprise system that an agent can affect must also be onboarded through a dedicated integration, least-privilege policy, scoped Vault credential reference, and a monitored action wrapper. AgentFence cannot secure an unmanaged browser or agent runtime that is allowed to call a target system directly.

## Release commands

Run the following from the project root before every production release:

```bash
pnpm audit --prod
pnpm test
pnpm check
pnpm build
```

The current release audit reports no production dependency vulnerabilities after pruning unused packages and upgrading the direct production dependency set. The automated suite includes HTTP security middleware, tenant authorization, policy, Data Guard, audit, Vault, runtime, Action Capture, Action Trace, dashboard, and theme behavior.

## Deployment and rollback

Create a project checkpoint after validation, then use the platform **Publish** control to deploy. Do not publish directly from a local shell. Before activating a new enterprise integration, verify the health endpoint, OAuth redirect behavior, a protected agent action, a denied action, an approval-required action, outbound Data Guard redaction, an audit event, and a Vault lease lifecycle in a non-production tenant.

If a release regresses, use the project version history to roll back to the latest verified checkpoint. Revoke affected Vault leases and runtime credentials, disable the affected policy or agent, and preserve audit evidence for investigation before restoring the integration.
