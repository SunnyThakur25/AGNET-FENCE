# AgentFence enterprise integration architecture

The diagram in [`agentfence_claim_hardened_architecture.mmd`](./agentfence_claim_hardened_architecture.mmd) presents **AgentFence as the action-control boundary for explicitly integrated AI-agent actions**. The design supports cloud-hosted agents that use the signed runtime SDK and browser agents that use a managed wrapper, extension, local proxy, or automation adapter. Calls that bypass those integration paths are outside AgentFence enforcement and must be constrained through environment design, target permissions, and organizational controls.

## Trust boundaries and action flow

| Stage | Component | What happens | Security result |
|---|---|---|---|
| 1 | Integrated cloud agent or managed browser agent | The agent proposes an API call, browser navigation, form submission, file action, or data operation through the SDK or wrapper. | The integrated proposal is evaluated before its target callback or browser execution runs. |
| 2 | AgentFence Tool Gateway | It verifies the signed workload identity and resolves the registered agent, tenant, owner, environment, and risk level. | An unregistered, expired, revoked, cross-tenant, or replayed request is rejected. |
| 3 | Data Guard and Policy Engine | Data Guard inspects inbound parameters and outbound payloads, redacts sensitive values, and supplies the strongest declared or detected sensitivity to policy evaluation. Policy checks tool, action, parameters, data sensitivity, destination, and approval requirements. | The decision is **allow**, **block**, or **require approval** before delivery. |
| 4 | Human Approval Workflow | High-impact actions wait for an identity-bound approver. | No payment, deletion, export, role change, or similar action proceeds merely because an agent requests it. |
| 5 | Credential Broker and optional Vault AppRole | AgentFence enforces scoped, short-lived runtime credential lifecycle controls. When the customer activates Vault AppRole, server-side lease/read operations use a tenant-scoped Vault reference; no raw Vault secret is sent to the agent or browser. | The system does not claim a fresh Vault lease is minted automatically for every allowed action. |
| 6 | Approved enterprise system or browser portal | An allowed cloud callback receives a redacted outbound payload. An allowed browser wrapper action executes with the existing enterprise browser/VDI session, rather than a brokered target credential. | The SDK/wrapper path is controlled; direct target access outside it is a separate environment and permission boundary. |
| 7 | Audit and SOC operations | Each governed decision, policy revision, approval, credential-lifecycle action, and reported target outcome creates tenant-scoped evidence. Configured profiles support controlled connector certification and evidence export. | Security teams can investigate the governed path without treating the product as a universal event collector or a live-SIEM-delivery guarantee. |

## Local browser-agent pattern

For a local browser agent, AgentFence is not installed *inside every web application*. The organization deploys a managed **browser wrapper, extension, local proxy, or automation adapter**. Before the browser agent navigates, clicks, fills a sensitive form, uploads/downloads data, or invokes a browser-backed API, the adapter sends the intended action to the AgentFence Tool Gateway. The adapter uses the organization’s existing managed browser or VDI session to execute an allowed action; this path does not currently obtain a separate brokered target credential.

> The browser agent may be technically capable of many actions, but the wrapper executes only the action that AgentFence allows. An approval or denial stops the browser before the sensitive request is submitted.

## Cloud agent pattern

For cloud agents, developers use the signed runtime SDK around each tool connector. The agent calls a protected helper rather than calling the CRM, ERP, database, or browser service directly. The helper inspects inbound and outbound content, asks AgentFence for an enforcement decision using the strictest declared or detected sensitivity, and only runs the delivery callback after an **allow** decision. A customer-connected Vault AppRole is optional and remains server-side; raw secret values do not appear in the agent prompt, application logs, browser UI, or audit ledger.

## MCP boundary

The Native MCP Gateway now governs customer-approved public HTTPS MCP servers. It initializes the remote server, discovers `tools/list` metadata for review, requires explicit administrator trust and per-tool enablement, verifies a signed runtime credential and tool scope, applies Data Guard and policy evaluation, then proxies an allowed `tools/call`. It does not claim STDIO transport, private-network reachability, OAuth authorization-code handoff, dynamic client registration, or streaming transport; those remain roadmap capabilities.

## Deployment sequence

An organization normally starts with one low-risk agent and one or two narrowly scoped tools. It registers the agent, creates deny and approval policies, enables audit monitoring, and runs controlled OWASP Agentic Top 10 assessments. It then expands coverage to higher-risk workflows such as browser actions, data exports, payments, and privileged administration only after enforcement results and approval operations are satisfactory.

The architecture diagram deliberately separates **controlled assessment** from a live attack. AgentFence’s OWASP workflow uses synthetic policy requests and records expected guardrail outcomes. It does not execute exploit payloads, code, browser actions, or external network operations.
