# AgentFence Gateway Proxy Demo

**Purpose:** This guide demonstrates how an integrated agent action is captured, policy-evaluated, blocked or allowed, and retained as evidence before an external API receives a request.

> **Accurate boundary:** AgentFence is an action-governance gateway. In the SDK and browser-wrapper paths, it authorizes the action before the agent runtime executes its outbound callback; it is not a transparent packet-level proxy for arbitrary HTTP traffic. In the Native MCP path, AgentFence also provides a controlled upstream `tools/call` proxy for approved remote HTTPS MCP servers.

## Gateway-proxy architecture

The rendered diagram is produced from the deterministic Mermaid source at `../webdev-static-assets/agentfence_gateway_proxy_demo.mmd` and is included with this delivery as a PNG. The essential architecture has two enforcement patterns.

![AgentFence gateway-proxy architecture](/manus-storage/agentfence_gateway_proxy_demo_4a6ad694.png)

| Integration path | Where AgentFence sits | What is prevented when blocked | Evidence captured |
|---|---|---|---|
| **SDK / browser wrapper** | The AgentFence runtime decision call occurs before the agent’s outbound execution callback. | The callback is not invoked, so the integrated external API request is not sent. | Identity, action intent, policy decision, Data Guard findings, approval state, latency, and outcome or block evidence. |
| **Native MCP Gateway** | AgentFence sits in the `tools/call` path between the MCP-capable agent and an approved remote HTTPS MCP server. | The upstream MCP tool call is not sent. | The same decision evidence plus controlled MCP server/tool trust state. |
| **Direct bypass** | No AgentFence integration is present. | AgentFence cannot stop that request. | AgentFence cannot capture it as a governed action. Target IAM, egress control, and restricted credentials are required. |

## Safe guarded-call integration

The copyable template is [`examples/guarded-external-api-call.ts`](examples/guarded-external-api-call.ts). It uses the shipped `createAgentFenceRuntimeClient()` contract and `guardAndDeliver()` helper.

```ts
const agentFence = createAgentFenceRuntimeClient({ endpoint, credential: runtimeCredential });

await agentFence.guardAndDeliver(
  {
    toolName: "crm",
    action: "customer.export",
    parameters: { customerCount: 1, exportFormat: "csv" },
    outboundPayload: { customerIds: ["demo-customer-001"], exportFormat: "csv" },
    dataSensitivity: "internal",
    destination: "demo-crm-api.company.test",
    riskLevel: "high",
  },
  async safePayload => fetch(`${demoApiUrl}/exports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(safePayload),
  }),
);
```

The `fetch()` callback runs only after AgentFence returns `allowed`. A `blocked` or `approval_required` result raises an error before that callback, which is the mechanism that prevents the integrated outbound request.

## Demo prerequisites without live Vault, Splunk, OIDC, or SCIM

You can demonstrate policy, capture, trace, and block behavior without customer Vault, Splunk, OIDC, or SCIM activation. Use a non-production test endpoint with no customer data and a Vault **metadata reference** limited to the demo scope. A live Vault connection is required only when the customer wants AgentFence to validate or obtain actual target credentials from their Vault.

| Required for this demo | Why |
|---|---|
| A department team and registered demo agent | Associates the action with a tenant, owner, and agent identity. |
| A narrow active policy | Creates the deterministic allow, block, or approval decision. |
| An active credential reference and short-lived runtime credential | Binds the SDK request to the selected agent and permitted tool scope. The reference can be demo-safe metadata; no raw secret is displayed. |
| A safe test API or controlled MCP server | Shows that an allowed request arrives and a blocked one does not. |
| Action Capture / Action Trace access | Shows the decision evidence in the AgentFence console. |

### Built-in safe CRM target

For local development, AgentFence now exposes a bounded safe target at `http://localhost:3000/api/demo-crm-target`. Its `POST /cases/read` and `POST /exports` routes return synthetic results, and `GET /logs` exposes only a bounded, payload-redacted receipt. It is deliberately unavailable in production mode.

The current tenant has the following policy proposals. Both remain intentionally **disabled** until a separate authorized reviewer approves and promotes them through Policy Governance; the policy author cannot self-approve.

| Policy | Effect | Scope | Required state before an allowed callback |
|---|---|---|---|
| `Demo CRM — Allow case read` | Allow | `crm` / `case.read` / `demo-crm-api.company.test` | Independently approved and promoted |
| `Demo CRM — Block customer export` | Deny | `crm` / `customer.export` / `demo-crm-api.company.test` | Independently approved and promoted |

Once promoted, run `examples/guarded-external-api-call.ts` in a trusted server-side runtime with `AGENTFENCE_URL` and a scoped `AGENTFENCE_RUNTIME_CREDENTIAL`. The script defaults `DEMO_API_URL` to the safe local target. Expect exactly one `case.read` entry in `/api/demo-crm-target/logs` and **zero** `customer.export` entries.

### Recorded blocked-path demonstration

The configured **Demo CRM Agent** was used in the Tool Gateway with `tool: crm`, `action: customer.export`, `destination: demo-crm-api.company.test`, and a synthetic CSV export payload. AgentFence returned **Blocked** with the reason: *No active policy grants this agent permission for the requested tool action.* Data Guard classified the payload as internal and reported no secret pattern. The development-only safe target receipt endpoint then returned `{"entries":[]}`; no export callback reached it.

This is a genuine pre-execution decision and target non-delivery result. It is not yet an allowed-path demonstration because the allow policy is deliberately awaiting independent review. AgentFence will not bypass its separation-of-duties control merely to make a demo look complete.

## Step-by-step visual demo run

### 1. Create the safe demo boundary

Create a department named **Demo Operations** and register **Demo CRM Agent**. Use a test endpoint such as `https://demo-crm-api.company.test`; do not use a real customer CRM or production data.

### 2. Create two narrow policies

Create an **allow** policy for `crm.case.read` to `demo-crm-api.company.test`. Create a higher-priority **deny** policy for `crm.customer.export` to the same destination. This lets the audience compare a permitted low-risk read with a restricted export.

| Requested action | Expected decision | External test API receives request? | AgentFence evidence |
|---|---|---:|---|
| `crm.case.read` | Allowed | Yes, through the guarded callback | Allowed Action Capture row, trace, audit record, then reported target outcome. |
| `crm.customer.export` | Blocked | No | Blocked Action Capture row, policy reason, trace ending before execution, audit record, operator notification where applicable. |
| `crm.customer.export` with approval policy | Approval required | No, until a controlled approval execution path is used | Pending approval and trace evidence, no current direct upstream execution. |

### 3. Issue the short-lived demo runtime credential

Create a tenant-scoped demo credential reference limited to `crm.case.read` and `crm.customer.export`, then issue a short-lived runtime credential to **Demo CRM Agent**. Keep the credential in the demo agent’s server-side environment; never paste it into the browser or an audit record.

### 4. Run the allowed request

Run the integration example with `action: "case.read"` and an allow policy. Show the target test API log, then open **Action Capture** and **Action Trace**. The trace should show identity verification, Data Guard, policy allow, execution, and the reported target outcome.

### 5. Run the blocked request

Run the same helper with `action: "customer.export"`. The helper must throw before its `fetch()` callback. Show that the target test API log has **no new export request**, then open Action Capture and the Audit Ledger to show the denial reason and matching policy.

### 6. Explain the bypass boundary

Show the dotted bypass path in the diagram. If an agent uses a separate API key and calls the external API directly, AgentFence cannot see or stop it. The production countermeasure is to give the agent only restricted, integration-owned credentials and require target-side IAM plus egress/API-gateway controls that prevent direct calls.

## Current product status for the demo tenant

The currently inspected tenant has one registered department team, one active **Demo CRM Agent**, two disabled policy proposals awaiting independent review, and no configured Vault or OIDC connection. It is therefore at the **pilot configuration stage**. The diagram, template, and flow above provide the reproducible path to turn that tenant into a safe governed-action demonstration without needing live SIEM, IdP, or customer Vault activation.
