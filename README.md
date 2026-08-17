# AgentFence

> **A zero-trust action-governance control plane for AI agents and action-taking chatbots.**

AgentFence inserts an explicit decision boundary between an AI agent’s intent and a real-world enterprise consequence. For each integrated action, it verifies the agent identity and tenant, evaluates policy and data context, checks credential scope and destination, optionally obtains human approval, and creates privacy-safe operational evidence.

AgentFence is designed for organizations that are moving from conversational AI to **action-taking agents** that query internal systems, call tools, navigate browsers, change records, move data, or use delegated credentials. It is not a packet firewall and does not claim to govern agent activity that bypasses its cloud SDK or managed browser integration paths.

## The problem

When an agent can take an action, the security question is no longer only whether its response is helpful or safe. It is whether a verified workload was authorized to make a specific request, against a specific destination, with a scoped credential, under the correct policy, and with sufficient oversight.

Traditional enterprise controls—identity, API gateways, data loss prevention, vaults, approval workflows, and SIEM—remain essential. They do not necessarily produce a unified **agent-specific, pre-execution decision path**. AgentFence provides that orchestration point for integrated agent actions.

NIST’s AI Agent Standards Initiative identifies secure agent identity, authorization, interoperability, and security evaluation as key foundations for trusted agent ecosystems.[1] OWASP’s Top 10 for Agentic Applications provides a practical framework for securing autonomous systems that plan, act, and decide across complex workflows.[2]

## What AgentFence does

| Control question | AgentFence response |
|---|---|
| **Who is acting?** | Binds the request to a tenant-scoped agent identity and role-based authorization context. |
| **What may it do?** | Evaluates a policy before the integrated action is released. |
| **What sensitive data is involved?** | Applies Data Guard detection and redaction in governed paths. |
| **Which credential may it use?** | Uses scoped, short-lived runtime references; raw secrets are not surfaced to agents. |
| **Does a human need to intervene?** | Routes consequential actions through the Human Approval Workflow. |
| **What happened after the decision?** | Records privacy-safe outcomes in Action Capture, Action Trace, and the Audit Ledger. |
| **Can the organization demonstrate control operation?** | Produces evidence for SOC 2, ISO 27001, insurance review, and internal oversight. |

## Product capabilities

The current product contains the following **13 core capabilities**.

| Capability | Operational purpose |
|---|---|
| **Agent Registry** | Registers tenant-scoped agent identities, ownership, environments, and risk context. |
| **Policy Engine** | Evaluates action policies to return allow, block, or approval-required outcomes. |
| **Tool Gateway** | Intercepts integrated tool requests and applies the runtime decision path. |
| **Credential Vault** | Supports optional HashiCorp Vault AppRole integration with scoped, short-lived credential references. |
| **Human Approval Workflow** | Escalates high-impact actions to named human approvers. |
| **Tamper-Evident Audit Ledger** | Records a hash-linked decision history for investigation and control evidence. |
| **Data Guard** | Detects and redacts configured sensitive-data categories on governed outbound paths. |
| **Runtime Monitoring Dashboard** | Surfaces action activity and decision outcomes for operators. |
| **Attack Simulation** | Runs controlled, non-destructive OWASP Agentic Top 10 assessment scenarios. |
| **Role-Based Access Control** | Limits user access to authorized console and operational functions. |
| **LLM Explanations** | Produces contextual explanations for policy decisions through the configured LLM boundary. |
| **Notifications** | Sends operational notifications for selected governance events. |
| **Compliance Evidence Export** | Packages action evidence for SOC 2, ISO 27001, insurance review, and internal assurance. |

## Architecture

```text
Cloud agent ─── signed runtime SDK ───┐
                                      │
Managed browser agent ─ action wrapper┼──> AgentFence decision path
                                      │       │
                                      │       ├─ verify identity + tenant
                                      │       ├─ evaluate policy + destination + data context
                                      │       ├─ use scoped credential reference
                                      │       ├─ allow / block / require approval
                                      │       └─ capture trace + audit evidence
                                      │
                                      └──> Approved enterprise target
                                               ├─ SaaS / internal API / database
                                               ├─ browser workflow
                                               └─ security and compliance evidence
```

The platform supports two explicit integration paths:

| Runtime | Integration boundary | Governed action examples |
|---|---|---|
| **Cloud agent** | Signed runtime SDK | Tool calls, API requests, delegated workflow actions, downstream target outcome reporting. |
| **Managed browser agent** | Browser-action wrapper | Navigation, form submission, upload, download, and browser-backed API behavior. |

> **Control boundary:** Direct calls that bypass these integration paths are outside AgentFence enforcement. Customers must constrain those paths with environment design, target-system permissions, network controls, and organizational policy.

## First-agent onboarding

The console includes a four-step onboarding wizard that creates a real tenant-scoped agent and a first policy.

1. Choose a cloud or managed-browser runtime.
2. Register the workload identity.
3. Set the first action boundary.
4. Wrap one real action through the integration path.

The recommended production adoption sequence starts with a low-blast-radius, read-oriented workflow. After the team validates allow/block/approval behavior and reviews the Action Trace, it can extend authority to additional tools, destinations, browser flows, and environments.

## Security model and deployment boundaries

### Multi-tenancy and authorization

AgentFence uses tenant-scoped data access and protected server procedures. Agent actions, policies, approvals, audit records, and runtime credentials are bound to the authorized tenant context. The console includes user-role controls and account security features including profile management, active-session revocation, avatar metadata storage, provider-managed password changes, and a safeguarded account-deletion flow.

### Credential Vault

HashiCorp Vault AppRole integration is optional and operates in **disconnected-safe mode** when live Vault environment configuration is absent. This permits development and controlled evaluation without copying raw secrets into an agent or the AgentFence UI.

To activate a customer Vault deployment, provide the following through the project’s secure environment configuration—not through source control or the UI:

| Variable | Purpose |
|---|---|
| `VAULT_ADDR` | Customer Vault endpoint. |
| `VAULT_ROLE_ID` | AppRole identity for the AgentFence server integration. |
| `VAULT_SECRET_ID` | AppRole authentication secret for the AgentFence server integration. |

See [`vault_deployment_guide.md`](./vault_deployment_guide.md) and [`LOCAL_TESTING.md`](./LOCAL_TESTING.md) for details.

### Enterprise pilot integrations, teams, and billing

The authenticated **Enterprise pilot** console adds server-side, tenant-scoped profiles for **Splunk HEC**, **Microsoft Sentinel**, **PagerDuty Events v2**, **OIDC federation**, **SCIM 2.0 provisioning**, and **HashiCorp Vault AppRole**. Profiles store safe endpoint metadata and optional Vault references only. Each endpoint must use HTTPS, and AgentFence validates OIDC discovery or Vault health through a controlled server-side test; live service delivery remains activation-dependent.

Team Management provides administrator, operator, viewer, and billing-administrator roles, expiring invitation lifecycle controls, and auditable role changes. The public landing page and authenticated billing page present three feature-based plans: **Pilot ($99/workspace/month)**, **Growth ($299/workspace/month)**, and **Enterprise (custom agreement)**. Stripe Checkout is created on the server and Stripe is the source of truth for payment data; AgentFence records only the required resource identifiers and the selected operational plan.

Read [`ENTERPRISE_PILOT_DEPLOYMENT_GUIDE.md`](./ENTERPRISE_PILOT_DEPLOYMENT_GUIDE.md) before configuring a customer connector, Vault AppRole, identity federation, SCIM lifecycle, or Stripe test activation.

### Controlled OWASP assessments

`Attack Simulation` implements controlled, non-destructive assessment scenarios aligned to the OWASP Agentic Top 10 catalog. It is not an exploitation engine, does not target external systems, and does not perform live attacks. The goal is to demonstrate prevention, detection, approval, and audit behavior in a safe product context.

## Local development

### Prerequisites

The repository uses React, TypeScript, tRPC, Express, Drizzle ORM, and MySQL/TiDB. A current Node.js and `pnpm` installation are required.

```bash
pnpm install
pnpm dev
```

The development server serves the application on the sandbox-managed port. Do not hardcode a production port.

### Database schema

Schema definitions are in [`drizzle/schema.ts`](./drizzle/schema.ts). Migrations live under [`drizzle/`](./drizzle/). Keep schema and database state synchronized:

```bash
pnpm drizzle-kit generate
```

Review every generated SQL migration before applying it through the configured database workflow. Additive migrations are preferred; destructive changes require a deliberate data-retention and rollback plan.

### Validation

Run the following checks before creating a checkpoint or publishing the application:

```bash
pnpm test
pnpm check
pnpm build
```

The test suite covers core policy decisions, tenant safety, runtime credential behavior, observability metrics, HTTP security middleware, onboarding logic, public landing content, theme persistence, and account-security controls.

## Production activation checklist

| Area | Required production action |
|---|---|
| **Identity** | Connect the customer’s IdP and authorize user roles. |
| **Agent runtime** | Integrate the signed cloud SDK or managed browser wrapper into each governed path. |
| **Target systems** | Use least-privilege service identities and permit only approved destinations. |
| **Policy** | Begin with narrow allow rules and approval checkpoints for consequential changes. |
| **Vault** | Configure Vault AppRole only through secure deployment secrets when dynamic credential leasing is required. |
| **Monitoring** | Route security-relevant events to the organization’s operational monitoring and incident processes. |
| **Evidence** | Validate SOC 2, ISO 27001, insurance, and internal-review export requirements with control owners. |
| **Recovery** | Review [`RELEASE_READINESS.md`](./RELEASE_READINESS.md) for activation and rollback guidance. |

## Documentation

| Document | Purpose |
|---|---|
| [`AGENTFENCE_PRODUCT_AND_DEPLOYMENT_GUIDE.md`](./AGENTFENCE_PRODUCT_AND_DEPLOYMENT_GUIDE.md) | Product operating model, deployment stages, activation checklist, and security boundaries. |
| [`AGENTFENCE_INVESTOR_BRIEF.md`](./AGENTFENCE_INVESTOR_BRIEF.md) | Research-grounded problem statement, product thesis, market framing, commercial model, and diligence questions. |
| [`AGENTFENCE_INVESTOR_PRESENTATION_CONTENT.md`](./AGENTFENCE_INVESTOR_PRESENTATION_CONTENT.md) | The cited content outline for the investor presentation. |
| [`AGENTFENCE_DEMO_VIDEO_SCRIPT.md`](./AGENTFENCE_DEMO_VIDEO_SCRIPT.md) | Approved 60-second product demo script and production prompt. |
| [`AGENTFENCE_RESEARCH_SOURCES.md`](./AGENTFENCE_RESEARCH_SOURCES.md) | Source register for product, standards, and market narrative. |
| [`INTEGRATION_QUICKSTART.md`](./INTEGRATION_QUICKSTART.md) | Cloud and browser integration quickstart. |
| [`LOCAL_TESTING.md`](./LOCAL_TESTING.md) | No-Vault local testing workflow. |
| [`vault_deployment_guide.md`](./vault_deployment_guide.md) | Vault AppRole setup guidance. |
| [`RELEASE_READINESS.md`](./RELEASE_READINESS.md) | Release activation, monitoring, remediation, and rollback guide. |
| [`ENTERPRISE_PILOT_DEPLOYMENT_GUIDE.md`](./ENTERPRISE_PILOT_DEPLOYMENT_GUIDE.md) | Secure SIEM/SOAR, IdP/SCIM, Vault, billing, and team-management pilot activation guide. |
| [`ENTERPRISE_PILOT_INTEGRATIONS_RESEARCH.md`](./ENTERPRISE_PILOT_INTEGRATIONS_RESEARCH.md) | Primary-source research register for the pilot connector design. |

## Investor and design-partner narrative

McKinsey estimated that generative-AI use cases could contribute $2.6 trillion to $4.4 trillion in annual economic value across the use cases analyzed; this is an economic-potential estimate, **not** an AgentFence market-size, revenue, or valuation forecast.[3] Its 2025 survey also found that organizations are increasingly experimenting with and scaling AI agents.[4]

AgentFence is designed to help organizations capture that potential without allowing action authority to become opaque. The commercial thesis is straightforward: land with one real governed action, prove safety and accountability through the decision trail, and expand to more agents, environments, target systems, policy owners, and evidence programs. Pricing, ROI, and customer savings remain design-partner validation items until measured in customer deployments.

## References

[1]: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative "NIST: AI Agent Standards Initiative"
[2]: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/ "OWASP: Top 10 for Agentic Applications for 2026"
[3]: https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/the-economic-potential-of-generative-ai-the-next-productivity-frontier "McKinsey: The Economic Potential of Generative AI"
[4]: https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai "McKinsey: The State of AI in 2025"
