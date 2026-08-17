# Resilience Readiness Research Notes

**Purpose:** Source register for AgentFence’s production-resilience evidence. The application can record declared targets and the results of a customer-led exercise; it cannot claim that a backup, restore, or disaster-recovery plan has been executed merely because an operator created a profile.

| Topic | Applicable finding | AgentFence design implication | Source |
|---|---|---|---|
| **Contingency planning** | NIST SP 800-34 provides practical guidance to evaluate systems and operations, determine contingency requirements and priorities, and connect planning with resilience and the system life cycle. | Require a named owner, recovery scope, test outcome, and remediation evidence. Treat the product record as evidence support, not an independently certified contingency plan. | [NIST SP 800-34 Rev. 1](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final) |
| **Service objectives** | An SLI is a quantitative measure; an SLO is a target based on that measure. Availability, latency, throughput, correctness, and durability are examples of relevant service properties. | Record concrete, customer-approved availability and delivery objectives. Do not invent numerical targets or imply an SLA without an approved business agreement. | [Google SRE: Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) |
| **RTO, RPO, and exercised recovery** | A DR business impact analysis defines RTO and RPO. DR planning should address end-to-end recovery and be regularly tested, including security and access controls in the recovery environment. | Record RTO/RPO as declared targets and exercise evidence separately. Require a customer-operated backup/restore test before marking recovery evidence as exercised. | [Google Cloud: Disaster recovery planning](https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide) |

## Boundary statement

> A declared RTO, RPO, SLO, provider, or runbook URL documents intent. An exercise record documents a customer-reported test outcome. Neither record proves that the selected provider created a usable backup or that recovery met the target without independent, customer-owned restoration evidence.
