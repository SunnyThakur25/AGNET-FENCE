# Enterprise Hardening Release Notes

**Author:** Manus AI  
**Scope:** Coverage posture, externally retained audit-evidence boundaries, continuous Splunk HEC delivery, and operational resilience evidence.

## Release posture

This release strengthens AgentFence’s ability to show what it governs, retain evidence safely, and operate an approved Splunk delivery path. It does **not** change the core boundary: AgentFence enforces integrated SDK, managed-browser-wrapper, and native public-HTTPS MCP paths. It does not observe direct target-system calls that bypass those paths.

| Control area | Implemented capability | Remaining boundary |
|---|---|---|
| **Coverage posture** | A tenant-scoped administrative view derives evidence from registered agents, active policy bindings, governed actions, and reviewed MCP controls. | It identifies missing evidence and labels unregistered/direct paths as unobservable; it is not network telemetry. |
| **Audit anchoring** | The application prepares a deterministic ledger-head proof bundle and records a non-secret customer retention receipt. | The customer’s Object Lock, immutable blob, Bucket Lock, or equivalent service must enforce and prove retention outside AgentFence. |
| **Continuous Splunk delivery** | A certified HEC profile can queue privacy-safe audit envelopes, retry transient failures with a bounded schedule, and retain delivered/retrying/failed evidence. | Activation requires a production deployment, certified HEC endpoint, customer Vault AppRole, token-scoped Vault reference, and customer-approved routing/on-call model. |
| **Resilience evidence** | Administrators can declare RTO, RPO, SLO, owner, provider, runbook reference, and record a customer-led exercise result. | A declaration or recorded result is not a provider-verified backup, successful restore, SLA, or tested DR environment. |
| **Identity lifecycle** | The console surfaces protected OIDC/SCIM configuration readiness without revealing values. | Federation and provisioning remain inactive until customer IdP registration, redirect URI, lifecycle mapping, service principal, and production test evidence are completed. |
| **Policy and Data Guard hardening** | Policy patterns use deterministic case-insensitive `*`/`?` glob matching; deny wins equal-priority conflicts. Data Guard recursively redacts values under secret-bearing field names in addition to existing detectors. | This does not create semantic document classification or make the guard resistant to all obfuscation and novel encodings. |

## Delivery safeguards

The continuous Splunk path never queues raw agent prompts, raw tool arguments, raw tool results, actor email addresses, Vault material, or HEC tokens. Each delivered envelope retains only event relationship identifiers, event hashes, a hash of the stored audit payload, outcome, type, timestamp, and safe connector metadata. The outbox uses a unique connection/event key, bounded retry attempts, exponential backoff capped at fifteen minutes, and persisted attempt state.

The delivery schedule is created only after production publication. The scheduled endpoint accepts only the platform-issued cron identity and resolves the delivery configuration by its task identifier; it does not accept an organization, connector, or credential from the request body. A successful HEC certification is therefore a prerequisite—not a substitute—for continuous delivery activation.

## Evidence and resilience operation

The release uses RTO and RPO as customer-owned recovery objectives, not supplied defaults. Google’s DR guidance defines RTO as the maximum acceptable outage duration and RPO as the maximum acceptable data-loss window; it also emphasizes end-to-end recovery and regular testing.[1] NIST SP 800-34 frames contingency planning as a process for evaluating systems and determining resilience requirements and priorities.[2]

> **Operational rule:** A resilience profile is a decision record. A recovery exercise is customer-reported evidence. Neither establishes that a backup exists or that a restore achieved the target without customer-owned provider logs, restoration output, and access-control evidence.

Service objectives should be specific and measurable. Google’s SRE guidance distinguishes an SLI, the quantitative measure, from an SLO, the objective based on that measure; it warns against treating availability as an absolute promise.[3] AgentFence stores the declared target so it can be audited and reviewed, but does not publish or imply an SLA.

## Customer activation checklist

| Sequence | Customer-controlled action | AgentFence evidence produced |
|---|---|---|
| 1 | Configure and authenticate the constrained Vault AppRole through protected deployment settings. | Safe AppRole activation result only. |
| 2 | Save a tenant-scoped HEC Vault reference and complete the controlled Splunk certification. | Certification result and evidence code. |
| 3 | Publish the production site, confirm the approved delivery ownership and on-call process, then activate continuous delivery. | Schedule state, queue state, attempt result codes, and tenant audit event. |
| 4 | Configure customer immutable retention and upload the prepared proof bundle. | Customer-reported external retention receipt. |
| 5 | Declare RTO/RPO/SLO, perform a customer-led recovery exercise, and retain provider-side proof. | Declared target record and customer-reported exercise evidence. |
| 6 | Complete IdP registration and SCIM lifecycle mapping, then run production identity tests. | Existing readiness status; live federation/provisioning must be separately validated before any claim. |

## References

[1]: https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide "Google Cloud: Disaster recovery planning guide"
[2]: https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final "NIST SP 800-34 Rev. 1: Contingency Planning Guide for Federal Information Systems"
[3]: https://sre.google/sre-book/service-level-objectives/ "Google SRE Book: Service Level Objectives"
