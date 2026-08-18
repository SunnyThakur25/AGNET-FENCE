# AgentFence Product Maturity Audit

**Assessment date:** August 2026  
**Assessment scope:** Repository implementation, automated regression coverage, build posture, current claim boundaries, and the enterprise console usability surface.

## Executive status

> **Current stage: enterprise-pilot-ready governance control plane; not yet a production-proven managed security service.**

AgentFence has a complete multi-tenant application control plane for **integrated** AI-agent actions. It can register agents by department, evaluate explicit tool actions through identity, policy, Data Guard, quota, approval, and audit controls, and present evidence to administrators. The project is suitable for a controlled design-partner or enterprise-pilot deployment when its integration boundary, target-side IAM, and customer-owned activation prerequisites are accepted in writing.

It should not yet be represented as a universally deployed, independently certified, or network-enforcing product. Live customer Vault/Splunk, OIDC/SCIM, customer retention, recovery execution, and service-level operating evidence remain customer-owned activation work.

| Area | Current maturity | Evidence and boundary |
|---|---|---|
| **Tenant and agent governance** | **Pilot-ready** | Tenant-scoped teams, roles, agents, policy evaluation, approvals, audit records, quotas, and isolation regression coverage are implemented. |
| **Action enforcement** | **Pilot-ready on integrated paths** | The signed SDK, browser wrapper, and native MCP gateway invoke a deterministic decision path before their controlled callback. Direct target-system calls remain unobservable and outside enforcement. |
| **Policy governance** | **Pilot-ready** | Immutable revisions, field-level review, independent approval, promotion, rollback, and audit events are implemented. |
| **Data protection** | **Pilot-ready with defined limits** | Data Guard performs data-classification input, regex detection, and recursive secret-bearing structured-field redaction. It is not a semantic DLP or an adversarial-obfuscation-proof classifier. |
| **Enterprise integrations** | **Activation-ready** | Vault AppRole, Splunk HEC, OIDC, and SCIM surfaces intentionally remain inactive until the customer supplies approved endpoints, credentials, and lifecycle decisions. |
| **Evidence and operations** | **Pilot-ready / activation-gated** | Audit ledger, exports, anchoring receipts, controlled continuous Splunk delivery, and managed export scheduling exist. Independent WORM verification and customer storage delivery require customer activation. |
| **Resilience** | **Foundation complete; operational proof pending** | RTO/RPO/SLO declarations and recovery-exercise records exist. Provider backup/restore, real RTO/RPO measurements, and customer-led DR proof are not complete. |
| **UX and onboarding** | **Pilot-ready** | The enterprise Operations Center now includes a guided five-step tour. The MCP Gateway layout has been adjusted to avoid code fragmentation and dense instruction columns. |

## Focused usability audit

The captured Native MCP Gateway page had two material usability issues. The invocation card was narrow enough that a scoped credential string could fragment visually, making a critical control hard to read. It also combined implementation limitations, registration inputs, and the runtime trust model into dense copy without a quick semantic scan path.

The corrected page gives the registration form more working width, moves its transport boundaries into compact labels, and presents the runtime contract as three discrete actions. The scoped credential is now on a separate, non-fragmented line. The Operations Center adds an interactive five-stage tour that routes a pilot through ownership, first-agent registration, policy review, secure connectors, and coverage evidence. Closing or advancing the tour stores only the step index and completion state in the local browser; it does not store tenant data, credentials, or policy content.

Desktop visual validation confirmed that the corrected MCP layout keeps the registration form and invocation contract aligned without the prior letter-by-letter scoped-credential fragmentation. The Operations Center visibly exposes the **Guide me through setup** entry point in the Pilot Readiness Checklist while keeping the connector, quota, evidence, and action-boundary cards readable at a 1440-pixel desktop viewport. The empty-workspace state correctly communicates zero registered departments and agents rather than fabricating operational metrics.

An authenticated browser-session check confirmed that the current tenant has one registered department team but zero active agents, zero active policy bindings, and no configured Vault or OIDC connection. The checklist correctly reports those conditions as setup work rather than as successful integration. This is consistent with the application’s current **pilot configuration** stage for this tenant.

The interactive overlay was also opened in the authenticated browser. It presents **Step 1 of 5 — Assign accountable owners**, the full route through team management, agent registration, policy governance, secure connectors, and coverage posture, and a clear statement that the guide cannot mark tasks complete or bypass administrator review. The tour is therefore instructional navigation rather than a privileged configuration path.

## Improvement priorities

| Priority | Improvement | Why it matters | Owner or dependency |
|---|---|---|---|
| **P0** | Complete live Vault AppRole authentication and controlled Splunk HEC certification. | Converts activation-ready code into customer-specific integration evidence. | Customer supplies protected Vault values and reachable HEC endpoint. |
| **P0** | Run a customer-owned recovery exercise with provider logs, restore output, access-control verification, and observed RTO/RPO. | Needed before resilience claims can move beyond declared objectives and reported exercises. | Customer hosting, database, and incident owners. |
| **P0** | Deploy OIDC and SCIM with an actual customer IdP tenant and controlled lifecycle tests. | Identity federation must be proven against the customer’s directory and deprovisioning behavior. | Customer IdP administrator. |
| **P1** | Add authenticated browser end-to-end coverage for the Operations Center, guided tour navigation, and MCP registration/trust flow. | Rendered tests validate components; a pilot should also validate the real protected-session journey. | Product and QA team. |
| **P1** | Add target-system integration packs with least-privilege IAM and egress templates. | AgentFence decides only at an integrated boundary; target-side controls are necessary to restrict direct paths. | Customer platform team and integration owners. |
| **P1** | Split large client bundles and establish operational latency/error budgets. | The production build warns about a large client chunk; explicit performance and error-budget targets improve operability at scale. | Product engineering and SRE owners. |
| **P2** | Add certified customer-owned archive connectors for S3/WORM retention. | Managed archive exports are available, but external retention guarantees must be verified in the customer account. | Customer storage owner. |
| **P2** | Expand native MCP support for private-network endpoints, OAuth flows, and streaming after threat modeling. | These protocols need explicit SSRF, credential, identity, and streaming-result controls before support is claimed. | Product security and protocol engineering. |

## Recommended pilot gate

A new enterprise pilot should begin with one department, one named agent, a small allowlist of tools, a narrow destination set, and a target-side least-privilege role. The organization should capture one allowed action, one blocked action, and one approval-required action through the integrated path. The policy revision, coverage posture, redacted action trace, and exported evidence packet should then be reviewed jointly by the agent owner and security owner.

Only after this evidence is accepted should additional departments and agents be onboarded. This sequence keeps the product’s strongest controls—deterministic action governance and attributable evidence—aligned with what the organization can actually verify.
