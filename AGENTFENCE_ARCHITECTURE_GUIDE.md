# AgentFence enterprise integration architecture

The diagram in `agentfence_enterprise_architecture.mmd` presents **AgentFence as the action-control boundary between an AI agent and the real systems it can affect**. The design supports both cloud-hosted agents and browser agents running on a managed laptop, virtual desktop, or controlled browser-automation environment.

## Trust boundaries and action flow

| Stage | Component | What happens | Security result |
|---|---|---|---|
| 1 | Cloud agent or local browser agent | The agent proposes an API call, browser navigation, form submission, file action, or data operation. | The proposal is intercepted before the enterprise action occurs. |
| 2 | AgentFence Tool Gateway | It verifies the signed workload identity and resolves the registered agent, tenant, owner, environment, and risk level. | An unregistered, expired, revoked, cross-tenant, or replayed request is rejected. |
| 3 | Policy Engine and Data Guard | Policy checks tool, action, parameters, data sensitivity, destination, and approval requirements. Data Guard classifies/redacts sensitive content. | The decision is **allow**, **block**, or **require approval**. |
| 4 | Human Approval Workflow | High-impact actions wait for an identity-bound approver. | No payment, deletion, export, role change, or similar action proceeds merely because an agent requests it. |
| 5 | Credential Broker and Vault | After an allowed decision, the broker obtains a short-lived, scoped lease from Vault or a supported secret manager. | Agents do not receive permanent raw API keys or broad administrative credentials. |
| 6 | Approved enterprise system | Only the action and scope that passed enforcement reach the target CRM, API, database, payment system, SaaS platform, or browser portal. | The agent cannot use direct access outside the approved control path. |
| 7 | Audit and SOC operations | Every decision, approval, credential lifecycle event, and outcome is added to the audit ledger and can flow to a SIEM/SOAR and compliance evidence packet. | Security teams can investigate and demonstrate what happened. |

## Local browser-agent pattern

For a local browser agent, AgentFence is not installed *inside every web application*. The organization deploys a managed **browser wrapper, extension, local proxy, or automation adapter**. Before the browser agent navigates, clicks, fills a sensitive form, uploads/downloads data, or invokes a browser-backed API, the adapter sends the intended action to the AgentFence Tool Gateway.

> The browser agent may be technically capable of many actions, but the wrapper executes only the action that AgentFence allows. An approval or denial stops the browser before the sensitive request is submitted.

## Cloud agent pattern

For cloud agents, developers use the signed runtime SDK around each tool connector. The agent calls a protected helper rather than calling the CRM, ERP, database, or browser service directly. The helper asks AgentFence for an enforcement decision and only runs the delivery callback after an **allow** decision. A dynamic Vault lease is kept server-side where practical; raw secret values should not appear in the agent prompt, application logs, browser UI, or audit ledger.

## Deployment sequence

An organization normally starts with one low-risk agent and one or two narrowly scoped tools. It registers the agent, creates deny and approval policies, enables audit monitoring, and runs controlled OWASP Agentic Top 10 assessments. It then expands coverage to higher-risk workflows such as browser actions, data exports, payments, and privileged administration only after enforcement results and approval operations are satisfactory.

The architecture diagram deliberately separates **controlled assessment** from a live attack. AgentFence’s OWASP workflow uses synthetic policy requests and records expected guardrail outcomes. It does not execute exploit payloads, code, browser actions, or external network operations.
