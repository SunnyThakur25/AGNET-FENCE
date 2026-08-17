# AgentFence Multi-Department Governance Operating Model

**Author:** Manus AI  
**Scope:** How a single organization can govern many AI agents across departments, and how deterministic action enforcement complements—but does not replace—language safety controls.

## Operating model

AgentFence is designed as a **tenant-scoped control plane**, not as a single-agent proxy. Each organization can create department teams, register multiple cloud, managed-browser, or native-MCP agents under those teams, and apply organization-wide, department-scoped, or agent-specific policies. The Tool Gateway evaluates each integrated action independently, so parallel activity from Finance, Customer Support, Security Operations, and other departments does not share a decision or authorization state.

| Control level | Owner | Typical policy scope | Evidence produced |
|---|---|---|---|
| **Organization** | Security or platform administrators | Default deny, high-risk approval, sensitive-data destinations, global connector rules | Tenant audit ledger and usage windows |
| **Department team** | Department owner with organization oversight | Approved tools, destinations, data classes, and operational exceptions for that team | Coverage roll-up, policy bindings, governed actions |
| **Agent** | Named agent owner | Runtime identity, least-privilege scope, environment, risk level, and narrow tool permissions | Signed decision records, trace, outcome, and Data Guard findings |
| **Action** | Tool Gateway | A concrete tool, action, redacted parameters, sensitivity, and destination | Allow, block, approval-required, or rejection decision with latency evidence |

> **Parallelism boundary:** Multiple agents may submit integrated requests at the same time. AgentFence evaluates each request against the calling tenant and agent identity, then applies its own policy, Data Guard, quota, approval, and audit path. One department’s action state is not reused to authorize another department’s agent.

## What the operations center proves

The Enterprise Operations Center aggregates **registered integration evidence**, not network surveillance. It gives administrators a single view of department ownership, active registered agents, policy and evidence gaps, safe connector status, readiness milestones, policy-decision latency, and tenant quota consumption. It deliberately labels missing action evidence as an **evidence gap** rather than claiming that it has observed or disproved a direct bypass.

| Capability | Current behavior | Boundary that remains explicit |
|---|---|---|
| **Department coverage** | Rolls registered agents, applicable policies, and governed action records into department-level indicators. | It cannot observe direct target-system calls that bypass the SDK, browser wrapper, or native MCP gateway. |
| **Connector health** | Shows safe status, last test time, and evidence codes for SIEM, Vault, and identity readiness. | Readiness, pending activation, and preflight are not proof that a customer production service is live. |
| **Quota control** | Enforces tenant gateway evaluations per UTC minute and evidence exports per UTC day before the protected work proceeds. | Quotas protect the AgentFence control plane; they do not rate-limit an unintegrated target-system API. |
| **Performance evidence** | Records the elapsed time from Data Guard inspection through policy evaluation for new governed actions. | It excludes model inference, network transit, approval wait time, and target-system execution; it is not an SLA. |
| **Evidence automation** | Supports manual managed-archive exports now and daily task-UID-bound exports after production publication. | Customer-owned S3, WORM, or archive delivery requires a separately certified storage connector and customer credentials. |

## Does AgentFence stop language or actions?

**The decisive enforcement point is the action, not free-form language alone.** An AI agent may receive a vague, malicious, misleading, or simply ambiguous instruction in natural language. Language can be interpreted differently by different models and can change meaning when combined with retrieved content, agent memory, or tool descriptions. A product that claims to reliably understand every possible instruction would overstate what it can guarantee.

AgentFence instead requires an integrated runtime to translate the proposed behavior into a structured request: **which agent, which tool, which operation, which redacted parameters, which declared or detected data sensitivity, and which destination**. At that point the control plane can make a deterministic decision: allow, block, require human approval, or reject. If the decision is not allow, the integrated wrapper must not execute the target action.

| Layer | Primary question | AgentFence role | Complementary safeguards |
|---|---|---|---|
| **Language and model layer** | “What did the user or retrieved content mean?” | Does not claim universal natural-language truth or safety classification. | System prompts, model safety features, retrieval isolation, content filtering, user verification, and model evaluation. |
| **Planning layer** | “What sequence of tools does the agent intend to use?” | Can require each integrated tool invocation to be presented to the gateway. | Tool schemas, constrained planners, memory protections, and agent testing. |
| **Action layer** | “May this named agent perform this exact tool action on this destination now?” | Deterministically evaluates identity, scope, policy, Data Guard, quota, and approval controls before execution. | Target-side IAM, egress controls, application authorization, and least-privilege credentials. |
| **Evidence layer** | “What did the control plane decide and what outcome was reported?” | Records a tenant-scoped audit chain, redacted action capture, trace, and export evidence. | Customer retention, SIEM/SOAR operation, incident response, and provider-side logs. |

## Example: several departments, many agents

Consider one organization with a **Finance reconciliation agent**, a **Customer Support browser agent**, and a **Security Operations investigation agent**. All three register a distinct identity and department team. Finance may have a narrow allow policy for `ledger.read` and approval for `payment.export`; Customer Support may be allowed to search approved CRM records but blocked from bulk exports; Security Operations may call an approved investigation tool but be required to obtain approval before isolating a production endpoint.

The organization’s operations center can show that each agent is registered, whether applicable active policies exist, and whether governed actions were observed during the selected period. It cannot infer that the Finance agent’s direct API call, made outside the integrated action path, was blocked. That direct path must be constrained separately by the target system’s IAM and network egress design.

## Enterprise rollout sequence

An enterprise pilot should begin with a narrow department, a small number of named agents, and a limited tool surface. The policy-diff workflow ensures that a proposed change is visible field by field and independently approved before it becomes live. Once the integrated path has produced allow, block, and approval traces, the organization can add departments and agent identities without weakening the tenant boundary.

Daily managed-archive evidence exports should be activated only after the application is published and an owner accepts the operating responsibility. Customer-owned storage, Vault, SIEM, OIDC, and SCIM integrations remain deliberately separate activation steps because their credentials, service endpoints, and retention guarantees belong to the customer environment.
