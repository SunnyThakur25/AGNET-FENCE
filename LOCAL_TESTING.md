# AgentFence local testing without Vault

AgentFence can be tested safely without deploying HashiCorp Vault. In this mode, the Vault AppRole Settings screen must show **disconnected**, no raw secret values are stored, and live Vault-lease controls remain unavailable. This does not disable the Agent Registry, Policy Engine, Tool Gateway, Data Guard, approvals, audit ledger, compliance evidence, signed runtime credentials, or controlled OWASP assessment workflows.

## Start and validate the application

```bash
cd /home/ubuntu/agentfence
pnpm check
pnpm test
pnpm build
```

Open the development preview, sign in, then use the Command Center to create a workspace. In **Settings**, confirm that `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID` are displayed only as configuration status—not values. Keep them unset during local testing.

## Recommended local control test

| Step | What to do | Expected evidence |
|---|---|---|
| 1 | Register a test agent and mark it active. | Agent Registry contains a scoped identity. |
| 2 | Add a deny policy for a synthetic sensitive export or high-impact action. | Policy Engine lists the rule. |
| 3 | Use Tool Gateway to evaluate the synthetic request. | The gateway blocks it or sends it for approval; no external tool is called. |
| 4 | Submit a high-impact synthetic action. | Human Approval Workflow records the review path. |
| 5 | Submit a synthetic secret/PII-like value to Data Guard. | The content is classified/redacted before any outbound delivery callback. |
| 6 | Run an OWASP assessment case under Attack Simulation. | The Audit Ledger records a `simulation.completed` event and the assessment explains control coverage. |

## What Attack Simulation does—and does not do

Attack Simulation is a **controlled assessment**, not an exploit engine. Each assessment creates a synthetic authorization request and runs it through AgentFence policy evaluation. It does not send payloads, call third-party APIs, browse the web, execute code, modify customer data, or contact external infrastructure. A `passed` result means the current AgentFence policy decision blocked or gated the synthetic request; it is not proof that an entire connected application is immune to the risk.

The assessment catalog mirrors the OWASP Agentic Top 10 2026 taxonomy and is intended to turn each category into a regression test for an agent’s configured controls. OWASP describes its framework as a practical starting point for reducing risks in systems where AI agents plan, act, and make decisions across complex workflows.[1]

## Before connecting a real Vault

Use a disposable development Vault, a dedicated AppRole, narrow tenant and agent path policies, response wrapping where appropriate, short TTLs, audit logging, and a revocation test. Never use customer production credentials or sensitive records in local assessment scenarios.

## Reference

[1] [OWASP Top 10 for Agentic Applications for 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

## UI validation findings

The OWASP assessment dashboard was reviewed at desktop and mobile widths. The desktop experience presents all ten controlled ASI cases in a two-column coverage map, while the mobile layout changes to a readable single-column sequence. Both views state that assessment requests are synthetic, do not execute payloads, and do not contact external infrastructure.

The final verification also confirmed that the detailed prevention, detection, approval, and audit matrix is visible below the assessment catalog on desktop and remains horizontally scrollable on narrow mobile screens without obscuring the case cards or safety limitations.
