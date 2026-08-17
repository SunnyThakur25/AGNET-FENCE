# AgentFence Claim Boundaries

**Purpose:** This register defines the current, customer-activation-required, and roadmap boundaries for AgentFence product, investor, and deployment claims. It should be reviewed before customer demonstrations, security questionnaires, investor conversations, or procurement responses.

> **Core rule:** AgentFence governs explicit cloud-SDK and managed-browser-wrapper action paths. It does not claim to govern a direct target-system call that bypasses the integration boundary.

## Current implemented controls

| Claim | Verified implementation boundary | Language approved for use |
|---|---|---|
| **Per-action zero-trust decision** | Each signed runtime request is bound to a tenant and agent identity, checked for scope and nonce replay, inspected by Data Guard, evaluated against policy, and recorded. | “AgentFence continuously re-evaluates each integrated action rather than inheriting trust from a prior action.” |
| **Data Guard policy input** | Inbound parameters and outbound payloads are inspected before runtime policy evaluation. The strongest declared or detected sensitivity is supplied to the Policy Engine; returned outbound data is redacted. | “Sensitive outbound data can change the policy decision before delivery on the integrated path.” |
| **Cloud and browser action governance** | Cloud SDK and managed browser wrapper both invoke the signed runtime decision path and report privacy-safe outcomes. | “One integrated policy and evidence model for cloud SDK and managed browser wrapper actions.” |
| **Browser boundary** | The browser adapter authorizes before its execution callback. An allowed action uses the existing enterprise browser or VDI session. | “Browser actions are governed before execution; target-session authorization remains an enterprise browser/VDI control.” |
| **Credential safety** | Runtime credential references are tenant- and agent-scoped, short-lived, scope-bounded, replay-protected, revocable, and never expose raw Vault values to the browser or agent. | “AgentFence keeps raw Vault material out of agent and browser context.” |
| **Evidence and assessment** | Governed decisions, approvals, policy governance actions, credential lifecycle events, controlled certification results, and reported outcomes create tenant-scoped audit evidence. OWASP assessments are synthetic and non-destructive. | “AgentFence records privacy-safe evidence for the governed path and tests controls without executing attack payloads.” |

## Customer-activation-required controls

| Capability | Required customer prerequisite | Restriction |
|---|---|---|
| **Vault AppRole** | Reachable customer Vault, constrained AppRole policy, and securely configured `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID`. | The disconnected-safe product must not claim a live customer Vault lease until these are configured. |
| **Splunk HEC certification** | HTTPS HEC endpoint and tenant-safe Vault reference with a scoped HEC token. | Certification stores only a result and evidence code; it is not continuous alert/event forwarding. |
| **OIDC / SCIM** | Customer IdP and protected deployment settings; SCIM service principal, lifecycle design, and interoperability testing. | The console exposes readiness and preflight status only; it is not a completed federation or SCIM deployment. |
| **SIEM / SOAR operations** | Customer-selected connector, routing, alert ownership, retry behavior, and incident process. | Connection profiles do not by themselves create a production event-delivery pipeline. |

## Roadmap items

| Item | Accurate current statement |
|---|---|
| **Native MCP gateway/proxy** | The first release supports public HTTPS remote MCP registration, `initialize`/`tools/list` discovery, administrator trust, per-tool enablement, signed runtime scope, policy/Data Guard checks, and proxied `tools/call`. STDIO, private-network endpoints, OAuth authorization-code flows, dynamic client registration, and streaming remain future work. |
| **Continuous connector delivery** | Controlled Splunk certification is implemented. Continuous production delivery for SIEM/SOAR connectors remains future integration work. |
| **Automatic per-allow Vault issuance** | AgentFence supports scoped runtime credentials and optional server-side Vault lifecycle procedures. It does not mint a new Vault lease automatically for every allow decision. |

## Evidence to retain for a customer pilot

An enterprise pilot should retain a staging trace showing an allowed action, a blocked action, an approval-required action, and a Data Guard-triggered outbound block or review. It should also retain the relevant policy revision, audit evidence export, target-system permission test, and—if activated—the Vault readiness or connector-certification result.
