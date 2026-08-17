# AgentFence Enterprise Production-Hardening Register

**Status:** Engineering planning register, updated August 17, 2026. It records current implementation evidence, customer-controlled activation dependencies, and open production-scale work. It is **not** a compliance certification, service-level commitment, or assertion that AgentFence has independently proven operating effectiveness.

## Executive position

AgentFence is a **bounded action-governance control plane**. It can make an allow, block, or approval decision before an action carried through its signed SDK, managed-browser wrapper, or bounded public-HTTPS MCP gateway reaches the configured delivery path. It cannot see or stop direct calls that bypass those integrated paths. That boundary is the most important product truth: the system is an action PEP/PDP for deployed integrations, not a network sensor, EDR, API gateway, or universal agent-monitoring layer.

The product is suitable for controlled design-partner and enterprise-pilot work with explicit implementation boundaries. It is not yet a production-proven security service for a regulated environment because independent evidence retention, coverage assurance, live identity lifecycle, continuous SIEM delivery, and resilience operations still require customer infrastructure and sustained operational testing.

## Reconciled gap register

| Gap or statement | Current implementation evidence | Remaining production requirement | Priority | Accountable owner | Acceptance evidence |
|---|---|---|---|---|---|
| **No telemetry for ungoverned actions** | AgentFence records governed decisions, Action Capture, Action Trace, and configured downstream outcomes. It does not observe direct target calls outside its wrappers. | Add a coverage posture that inventories registered integrations, reports wrapper/SDK/MCP heartbeats and expected-vs-governed action coverage, and documents target-side egress/API-gateway evidence needed to detect bypass. | P0 | Product engineering + customer platform security | Coverage report, gap exceptions, and a deployment design showing target-side controls. |
| **Ledger is not independently immutable** | The ledger is hash-linked and exportable, but its primary persistence is the product database. | Anchor signed checkpoints to customer-controlled immutable/WORM storage or a trusted external retention system; define retention ownership and run chain verification. | P0 | Customer security architecture + product engineering | Independent retention configuration, immutable retention policy, checkpoint verification record, and restore evidence. |
| **OIDC/SCIM is readiness-only** | Safe readiness state and server-side OIDC discovery preflight exist. | Implement customer IdP federation, authorization mapping, SCIM lifecycle semantics, deprovisioning, and interoperability testing using customer-controlled credentials. | P0 | Customer IAM + product engineering | IdP test plan, joiner/mover/leaver test evidence, and access-review procedure. |
| **SIEM profiles lack continuous delivery** | Strict Splunk HEC endpoint configuration and bounded Vault-backed certification are implemented. | Build a durable event-delivery service with retries, delivery state, dead-letter handling, schema versioning, health signals, and SOC operating procedures. | P0 | Product engineering + SOC | End-to-end delivery, retry/DLQ tests, alert routing evidence, and an owner-approved runbook. |
| **Policy governance is missing** | **Resolved:** immutable revisions, field diffs, independent review, approve/reject, promotion conflict checks, rollback proposals, and audit events are implemented. | Add scheduled policy recertification and emergency-change governance if enterprise policy mandates them. | P1 | Security governance | Separation-of-duties test, policy lifecycle trail, and periodic review record. |
| **SLO, backup, and DR evidence is not defined in product operations** | Health endpoint and release checklist exist; no published SLO/RTO/RPO or tested recovery program is claimed. | Define availability and recovery objectives aligned to the selected hosting/database services; execute backup, restore, incident, and DR exercises. | P0 | Product operations + customer platform team | Approved SLO/SLI, RTO/RPO, backup evidence, restore test, and DR/tabletop record. |
| **Policy matching is simple wildcard equality** | Current policy evaluation is deterministic and test-covered, but it is not a full policy language with composition, conflict analysis, or contextual predicates. | Design a versioned policy-language evolution with explicit compatibility, policy simulation, conflict detection, and migration controls. | P1 | Product security engineering | Design review, test corpus, policy simulation evidence, and negative authorization tests. |
| **Data Guard is regex-based** | Inbound/outbound sensitivity classification and redaction prevent basic PII/secret/PHI/payment patterns from reaching configured delivery callbacks. | Add layered classifiers, policy-configurable detection packs, bypass evaluation, false-positive review, and a privacy/security test corpus. | P1 | Product security engineering + privacy | Measured test corpus, tuning decisions, exception process, and regression results. |

## Non-negotiable claim boundaries

> **AgentFence governs integrated action paths; it does not create network-level enforcement or retrospective telemetry for arbitrary, unmanaged agent activity.**

The following phrases must not be used until the corresponding acceptance evidence exists: “all agent actions are monitored,” “immutable audit logs,” “live SCIM,” “continuous SIEM delivery,” “Vault is activated,” “production-proven,” “SOC 2 compliant,” or “guarantees breach prevention.” A successful Splunk HEC certification confirms only a bounded, authenticated delivery attempt; it is not continuous forwarding or SOC remediation.

## Recommended execution sequence

The first engineering release should add **coverage posture** because it makes enforcement gaps visible without pretending to detect all direct calls. In parallel, the customer should choose immutable evidence retention and production resilience ownership, because both are deployment architecture decisions rather than UI-only features.

The second release should implement continuous SIEM delivery as an explicitly operated service, including durable event state and retry semantics. Live OIDC/SCIM follows only after the customer supplies IdP registration, test identities, and lifecycle requirements. Policy-language and Data Guard evolution should be phased behind compatibility tests rather than replacing deterministic controls abruptly.

## Standards context

NIST SP 800-53 treats audit retention, contingency planning, incident response, access lifecycle, and assessment/monitoring as organizational control concerns in addition to application functionality.[1] NIST AI RMF frames trustworthy AI risk management around Govern, Map, Measure, and Manage rather than a single product feature.[2] Accordingly, AgentFence can contribute technical action-governance evidence, but customer deployment, operations, and independent assurance evidence remain necessary for audit confidence.

## References

[1]: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final "NIST SP 800-53 Rev. 5: Security and Privacy Controls"
[2]: https://www.nist.gov/itl/ai-risk-management-framework "NIST AI Risk Management Framework"
