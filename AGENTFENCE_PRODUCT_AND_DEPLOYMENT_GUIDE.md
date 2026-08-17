# AgentFence: Development and Production Deployment Guide

**Author:** Manus AI  
**Product:** AgentFence  
**Audience:** Platform engineers, security architects, application teams, and enterprise operators

> **Purpose.** AgentFence is an action-governance control plane for AI agents. It is designed to decide whether an identified agent may perform a specific action against a specific destination with specific data and scope. It is not a passive log collector, a network firewall replacement, or a guarantee that an external system will complete a permitted business transaction.

## 1. The Operating Model

An agentic application becomes consequential when it can invoke a tool, submit a browser form, download or upload a file, change a record, call a business API, or use a credential. AgentFence inserts a policy decision point before that action is released. This model aligns with the NIST AI RMF emphasis on governing, mapping, measuring, and managing AI risks throughout the lifecycle.[1]

| Layer | AgentFence responsibility | Enterprise responsibility |
|---|---|---|
| Identity | Registers a tenant-bound agent identity, owner, environment, and risk level. | Establishes trusted workforce and workload identity through the corporate IdP or an approved workload identity system. |
| Runtime enforcement | Evaluates signed cloud SDK and browser-wrapper requests before the action is released. | Routes consequential cloud and browser actions through the AgentFence wrapper; direct bypass paths must be removed or separately denied. |
| Policy | Applies allow, deny, and approval-required boundaries using tool, action, data, and destination context. | Defines an approved action inventory and assigns accountable policy owners. |
| Credentials | Keeps raw secrets out of agent context and supports scoped, short-lived runtime credentials and optional Vault lease operations. | Configures a live secret-manager integration and applies least-privilege permissions at each target system. |
| Evidence | Produces tenant-scoped, tamper-evident audit events, action capture, trace, and exportable evidence. | Forwards selected events to SIEM/SOAR and operates the incident-response process. |

## 2. Development Workflow

Development should start with a narrow, observable use case rather than an unrestricted autonomous agent. The first-agent wizard in **Integrations** creates a real tenant-scoped identity and a first policy. It guides the operator to choose either a cloud runtime or a managed browser runtime, register the workload, create a narrow initial boundary, and copy the wrapper call that must execute before the consequential action.

### 2.1 Cloud Agent Pattern

Cloud workloads—including copilots, API services, workflows, and serverless agents—use the signed runtime client. The application places the real API action in the delivery callback. AgentFence evaluates the request before the callback is allowed to run. A policy allow indicates that AgentFence released the action; the wrapper then reports a sanitized downstream success or failure outcome without recording raw response bodies.

```ts
await fence.guardAndDeliver(
  {
    toolName: "crm",
    action: "customer.read",
    parameters: { customerId },
    destination: "crm.company.internal",
    dataSensitivity: "pii",
    riskLevel: "medium",
  },
  safePayload => crm.getCustomer(safePayload),
);
```

### 2.2 Managed Browser Agent Pattern

Browser automation, RPA, managed laptops, VDI environments, and extensions use the browser-action adapter immediately before navigation, a form submission, upload, download, or browser-backed API request. This is a governance wrapper, not a packet sniffer and not a keystroke recorder. It captures privacy-safe action metadata, policy decisions, Data Guard findings, approval state, and sanitized target outcome.

```ts
await browserFence.authorizeAndExecute(
  {
    action: "form.submit",
    destination: "crm.company.internal",
    metadata: { form: "customer-note" },
    dataSensitivity: "internal",
    riskLevel: "medium",
  },
  () => page.click("[data-action=submit-note]"),
);
```

> **Critical control.** A browser agent that is allowed to call a target directly without the wrapper is outside the AgentFence control path. Enterprises should govern the runtime environment, restrict direct credentials, and use target-system permissions in addition to AgentFence policies.

## 3. Recommended First Production Use Case

Start with a read-oriented workflow that has a single target system, a small destination allow-list, and an accountable operator. A support agent that reads approved CRM records is generally a more suitable first production use case than an agent that changes bank details, exports customer data, or administers identities.

| Rollout stage | Example boundary | Required evidence | Promotion criterion |
|---|---|---|---|
| Development | `crm.customer.read` against a non-production CRM destination | Action Capture and trace for test requests | Policy behavior matches expected allow/block outcomes. |
| Staging | `crm.case.update` with approval required | Approval event, audit chain, Data Guard finding review, target outcome | Target API and wrapper outcome reporting are observed end-to-end. |
| Production pilot | Read-only or approval-gated updates for a small operator group | SIEM-forwarded events, named escalation owner, rollback exercise | Security owner accepts the action inventory and exception process. |
| Broader production | Additional tools and agents | Monthly policy review and evidence export | Each expanded scope has an accountable business and security owner. |

## 4. Production Activation Checklist

The core application ships with managed identity, database, storage, notification, and Forge service environment configuration. A customer deployment still requires organization-specific connections and operational decisions.

| Area | Required before a real production agent | Evidence of completion |
|---|---|---|
| Authentication | Corporate SSO/OAuth access and administrator role assignment. | Test sign-in with an intended administrator and non-administrator. |
| Agent runtime | A cloud service or managed browser environment that invokes the signed AgentFence wrapper. | A traced staging action with the correct tenant and agent identity. |
| Policy | Approved tool/action/destination/data rules, including default-deny expectations. | Policy review and a controlled allow, block, and approval test. |
| Target system | A least-privilege service account or target-specific authorization boundary. | Target permissions prove that unapproved actions are rejected independently. |
| Credentials | Optional but recommended HashiCorp Vault AppRole configuration using `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID`. | Server-side Vault readiness reports configured; no raw secret appears in the console or agent prompt. |
| Monitoring | SIEM/SOAR export strategy, on-call owner, alert routing, and incident playbook. | Test alert and incident triage record. |
| Recovery | Backup, rollback, credential revocation, and agent pause procedures. | Tabletop exercise covering a compromised agent or destination. |

AgentFence remains safe in disconnected-Vault mode. In that mode, teams can develop, test policies, inspect action capture and trace records, and use the existing tenant-scoped control plane. Live dynamic secret issuance, rotation, and revocation require a securely configured Vault deployment; the platform does not fabricate or expose credential values while that connection is absent.

## 5. Governance, Testing, and Evidence

The NIST Generative AI Profile identifies risks involving data privacy, information security, human-AI configuration and over-reliance, information integrity, and non-transparent component integration.[2] AgentFence maps these concerns to operational controls: Data Guard for sensitive data classification and redaction, identity and policy enforcement for action authorization, approval gates for high-impact operations, evidence for investigation, and controlled assessment scenarios for policy testing.

The OWASP Agentic Top 10 assessment capability in AgentFence is intentionally **controlled and non-destructive**. It sends synthetic inputs into the policy decision path, executes no exploit payload, and does not contact external target infrastructure. It should be used to test control design, not to claim that a production environment has been penetration-tested.

## 6. Security Boundaries and Known Limits

AgentFence is strongest when it is combined with network segmentation, target-system least privilege, corporate identity controls, secure software delivery, and operational monitoring. A policy allow is not an attestation of business correctness. An approval decision is not a substitute for a reviewer’s judgement. Action Capture stores privacy-safe metadata; it is not designed to retain raw prompts, keystrokes, page contents, secret values, or response bodies.

The European Commission’s AI Act guidance emphasizes information sharing across the AI value chain and, for relevant systemic-risk models, risk mitigation, serious-incident reporting, and cybersecurity practices.[3] AgentFence can provide system-level evidence and control records that support an organization’s broader governance program, but it does not by itself certify compliance with the EU AI Act, SOC 2, ISO 27001, HIPAA, PCI DSS, or any other framework.

## 7. Operational Runbook

When an agent action is suspected to be unsafe, the responder should pause the agent in Agent Registry, inspect the AI Action Trace, identify the agent identity and target destination, revoke the associated scoped credential or Vault lease when configured, and preserve the audit-evidence export. The team should then review the policy boundary, target-system logs, and human approval record before restoring the agent.

The platform’s `/healthz` endpoint supports basic deployment health probing. The release-readiness guide in the repository documents supported package controls, rollback preparation, dependency checks, and production validation. Publishing is intentionally a user-controlled action: after reviewing the latest checkpoint, use the project interface’s **Publish** button to deploy.

## References

[1]: https://www.nist.gov/itl/ai-risk-management-framework "NIST AI Risk Management Framework"
[2]: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf "NIST AI 600-1: Generative AI Profile"
[3]: https://digital-strategy.ec.europa.eu/en/faqs/general-purpose-ai-models-ai-act-questions-answers "European Commission: General-Purpose AI Models in the AI Act"
