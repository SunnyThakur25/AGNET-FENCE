# AgentFence Claim Boundaries

**Purpose:** This register defines the current, customer-activation-required, and roadmap boundaries for AgentFence product, investor, and deployment claims. It should be reviewed before customer demonstrations, security questionnaires, investor conversations, or procurement responses.

> **Core rule:** AgentFence governs explicit cloud-SDK and managed-browser-wrapper action paths. It does not claim to govern a direct target-system call that bypasses the integration boundary.

## Current implemented controls

| Claim | Verified implementation boundary | Language approved for use |
|---|---|---|
| **Per-action zero-trust decision** | Each signed runtime request is bound to a tenant and agent identity, checked for scope and nonce replay, inspected by Data Guard, evaluated against policy, and recorded. | “AgentFence continuously re-evaluates each integrated action rather than inheriting trust from a prior action.” |
| **Data Guard policy input** | Inbound parameters and outbound payloads are inspected before runtime policy evaluation. Regex detectors and recursive secret-bearing field-name detection redact structured values; the strongest declared or detected sensitivity is supplied to the Policy Engine. | “Sensitive outbound data can change the policy decision before delivery on the integrated path.” |
| **Policy matching and conflict handling** | Tool, action, and destination patterns use bounded case-insensitive `*`/`?` glob matching rather than arbitrary regular expressions. Higher priority wins; for equal priority, deny precedes approval, approval precedes allow, then the more specific policy wins. | “AgentFence uses deterministic policy conflict handling and bounded glob patterns on the integrated path.” |
| **Cloud and browser action governance** | Cloud SDK and managed browser wrapper both invoke the signed runtime decision path and report privacy-safe outcomes. | “One integrated policy and evidence model for cloud SDK and managed browser wrapper actions.” |
| **Browser boundary** | The browser adapter authorizes before its execution callback. An allowed action uses the existing enterprise browser or VDI session. | “Browser actions are governed before execution; target-session authorization remains an enterprise browser/VDI control.” |
| **Credential safety** | Runtime credential references are tenant- and agent-scoped, short-lived, scope-bounded, replay-protected, revocable, and never expose raw Vault values to the browser or agent. | “AgentFence keeps raw Vault material out of agent and browser context.” |
| **Evidence and assessment** | Governed decisions, approvals, policy governance actions, credential lifecycle events, controlled certification results, and reported outcomes create tenant-scoped audit evidence. OWASP assessments are synthetic and non-destructive. | “AgentFence records privacy-safe evidence for the governed path and tests controls without executing attack payloads.” |
| **Multi-department control plane** | Each registered agent is assigned to a tenant-scoped department team. Coverage posture rolls up policy and governed-action evidence per department while each action remains evaluated independently. | “AgentFence can govern parallel integrated actions from registered agents across multiple departments in one organization.” |
| **Connector health and pilot readiness** | The operations center aggregates safe connector status, last test evidence, Vault and IdP readiness, department coverage, and rollout ownership steps without returning secrets. | “AgentFence provides tenant-scoped connector and rollout-readiness evidence; a readiness state is not live-service certification.” |
| **Quotas and measured decision latency** | Gateway evaluation and evidence-export quotas are tenant-owned windows enforced before work begins. Policy-decision latency is stored for new governed actions from guard inspection through policy evaluation. | “AgentFence can bound tenant control-plane usage and report integrated decision-point latency evidence without claiming an SLA.” |
| **Policy field-level diff viewer** | Immutable policy revisions show field-by-field before/after values; independent approval is required before promotion. | “Administrators can review policy changes as field-level diffs before a separate administrator promotes them.” |

## Customer-activation-required controls

| Capability | Required customer prerequisite | Restriction |
|---|---|---|
| **Vault AppRole** | Reachable customer Vault, constrained AppRole policy, and securely configured `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID`. | The disconnected-safe product must not claim a live customer Vault lease until these are configured. |
| **Splunk HEC certification and continuous delivery** | HTTPS HEC endpoint, tenant-safe Vault reference, successful controlled certification, a published production site, and an administrator-enabled delivery schedule. | Certification stores a bounded result and evidence code. Continuous delivery queues privacy-safe envelopes, retries bounded failures, and records delivery state; it remains inactive until the customer activates the prerequisites. |
| **OIDC / SCIM** | Customer IdP and protected deployment settings; SCIM service principal, lifecycle design, and interoperability testing. | The console exposes readiness and preflight status only; it is not a completed federation or SCIM deployment. |
| **SIEM / SOAR operations** | Customer-selected connector, routing, alert ownership, retry behavior, and incident process. | Splunk HEC has a bounded durable delivery implementation. Microsoft Sentinel, PagerDuty, and SOAR delivery paths still require their own integration and operating model. |
| **Scheduled audit-evidence exports** | Published production deployment and an administrator-enabled schedule. | AgentFence can create daily managed-archive packets with task-UID-bound cron authorization. Customer-owned S3/WORM delivery requires a separately certified customer storage integration and least-privilege credentials. |

## Roadmap items

| Item | Accurate current statement |
|---|---|
| **Native MCP gateway/proxy** | The first release supports public HTTPS remote MCP registration, `initialize`/`tools/list` discovery, administrator trust, per-tool enablement, signed runtime scope, policy/Data Guard checks, and proxied `tools/call`. STDIO, private-network endpoints, OAuth authorization-code flows, dynamic client registration, and streaming remain future work. |
| **Continuous connector delivery** | Splunk HEC can queue privacy-safe audit envelopes, retry bounded failures, retain delivery-state evidence, and run on a production-only schedule after customer certification and Vault activation. Other SIEM/SOAR connectors remain future work. |
| **Coverage posture** | AgentFence inventories registered agents, active policy bindings, governed-action evidence, and trusted MCP controls. It labels direct or unregistered paths as unobservable rather than claiming network-level agent telemetry. |
| **Audit anchoring** | AgentFence prepares a deterministic ledger-head proof bundle and records a customer-reported immutable-retention receipt. Provider-side WORM state must be validated in the customer storage account. |
| **Operational resilience evidence** | Administrators can record declared RTO/RPO/SLO targets and customer-led recovery exercise evidence. These are not platform-verifiable backups, restores, or live OIDC/SCIM deployments. |
| **Data Guard semantic coverage** | Structured secret-bearing keys are recursively redacted in addition to existing detectors. This is not a semantic DLP, document-understanding, or adversarial obfuscation-proof classifier. |
| **Language-level safety** | AgentFence receives a structured action request at the integrated SDK, browser-wrapper, or MCP boundary. It does not determine whether arbitrary free-form language is benign, truthful, or unambiguous. Organizations should use model, prompt, retrieval, tool-schema, and human-review safeguards alongside action enforcement. |
| **Automatic per-allow Vault issuance** | AgentFence supports scoped runtime credentials and optional server-side Vault lifecycle procedures. It does not mint a new Vault lease automatically for every allow decision. |

## Evidence to retain for a customer pilot

An enterprise pilot should retain a staging trace showing an allowed action, a blocked action, an approval-required action, and a Data Guard-triggered outbound block or review. It should also retain the relevant policy revision, audit evidence export, target-system permission test, and—if activated—the Vault readiness or connector-certification result.
