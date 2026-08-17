# AgentFence integration quickstart

AgentFence is designed to protect **action-taking agents**, regardless of whether they run in a cloud service, a backend workflow, an API-driven copilot, an RPA worker, or a managed browser on a laptop or VDI. The integration point is always the same: place AgentFence immediately before the code that performs the consequential action.

> AgentFence evaluates and records the intended action. It does not function as a screen recorder, keystroke recorder, or raw network packet collector.

## Four-step organization rollout

| Step | Operator action | Result |
|---|---|---|
| 1 | Register one unique Agent Registry identity for each runtime. | Agent activity is tenant-bound, attributable, and revocable. |
| 2 | Create narrow allow, deny, and approval policies for tools, actions, data types, and destinations. | The default decision is deny unless an active policy permits the action. |
| 3 | Register a scoped credential reference and issue a short-lived runtime credential. | Runtime access is limited by both credential scope and policy. |
| 4 | Wrap each consequential cloud or browser action with the AgentFence SDK or browser-action adapter. | The action is captured, evaluated, and either released, blocked, or queued for approval. |

## Cloud, API, and backend-agent pattern

Use `createAgentFenceRuntimeClient()` in the server-side tool wrapper. Keep the actual business-system call inside the delivery callback. Do not place a long-lived credential in the prompt, client browser, or source repository.

```ts
import { createAgentFenceRuntimeClient } from "@agentfence/runtime";

const fence = createAgentFenceRuntimeClient({
  endpoint: process.env.AGENTFENCE_ENDPOINT!,
  credential: process.env.AGENTFENCE_RUNTIME_CREDENTIAL!,
});

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

The helper returns only when AgentFence has made an **allow** decision. A blocked or approval-required result stops the delivery callback, and the governance event is written to Action Capture and the Tamper-Evident Audit Ledger.

## Managed browser-agent, RPA, and VDI pattern

Use `createAgentFenceBrowserActionAdapter()` directly before any browser automation that can navigate, submit a form, upload/download a file, perform a privileged click, or use a browser-backed API. The integration may live in a browser extension, Playwright/Selenium wrapper, RPA connector, local proxy, or managed VDI helper.

```ts
import { createAgentFenceBrowserActionAdapter } from "@agentfence/runtime";

const browserFence = createAgentFenceBrowserActionAdapter({
  endpoint: process.env.AGENTFENCE_ENDPOINT!,
  credential: process.env.AGENTFENCE_RUNTIME_CREDENTIAL!,
});

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

The browser wrapper must be deployed where the organization controls browser automation. AgentFence cannot retroactively govern an unmanaged browser, a direct user click, or an agent that bypasses the wrapper and calls a target system directly.

## AI Action Capture and AI Action Trace

**AI Action Capture** provides a tenant-scoped action stream similar in operating model to packet inspection, but for governed AI actions rather than network traffic. It retains redacted parameters, requested tool/action, destination, sensitivity classification, policy outcome, approval status, Data Guard findings, and timestamps.

**AI Action Trace** turns a selected capture record into a graphical path. A trace shows the action intent, Data Guard boundary, policy decision, optional human-approval hop, and final release or containment boundary. An allowed decision means the governed request was released to the wrapped target integration; it does not independently prove that the external business system completed its transaction.

## Production safety checks

| Control | Required practice |
|---|---|
| Credential handling | Use short-lived runtime credentials. Configure Vault AppRole for live secret-manager leases; never inject raw long-lived secrets into the agent. |
| Network access | Prevent agents from directly reaching sensitive systems except through the controlled tool wrapper, service account, or browser adapter. |
| Browser coverage | Enforce managed browser, VDI, RPA, extension, proxy, or automation-adapter deployment for browser agents. |
| Data capture | Store only redacted action metadata and classifications. Do not collect full prompts, passwords, session cookies, raw page content, or personal data unless a separate, lawful retention design is approved. |
| High-risk actions | Require identity-bound human approval for payments, privilege changes, large exports, destructive operations, and other defined controls. |
| Evidence | Forward audit events and alerts to the organization’s SIEM/SOAR and use compliance evidence export for SOC 2, ISO 27001, or insurance-review packages. |

## Enterprise pilot connection sequence

After the first runtime path is governed, an administrator can use **Enterprise pilot** to establish controlled integration readiness without placing any token or secret in the browser.

| Control | Operator workflow | Safety boundary |
|---|---|---|
| SIEM/SOAR profile | Configure Splunk HEC, Microsoft Sentinel, or PagerDuty endpoint metadata and an approved tenant-scoped Vault reference. | AgentFence stores endpoint metadata and a path reference only; routing keys and provider tokens remain customer-controlled. |
| Identity readiness | Configure an OIDC issuer profile and validate discovery metadata; use SCIM readiness to plan team lifecycle synchronization. | Existing secure authentication remains active until the customer completes an IdP federation and provisioning project. |
| Vault readiness | Open the Vault controls and perform the server-side status or health probe. | Live AppRole activation requires `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID` supplied through secure deployment settings. Disconnected-safe mode is intentional. |
| Team operation | Create accountable teams and issue expiring one-time invitations with administrator, operator, viewer, or billing-administrator roles. | Invitation tokens are returned once and stored as hashes; do not send them through an unapproved channel. |
| Billing | Select Pilot or Growth in the Billing & plans tab, or request an Enterprise design review. | Checkout is server-created and Stripe is the source of truth for payment data; the browser never receives the secret key. |

For service prerequisites, activation steps, and official protocol references, see [`ENTERPRISE_PILOT_DEPLOYMENT_GUIDE.md`](./ENTERPRISE_PILOT_DEPLOYMENT_GUIDE.md).
