# AgentFence Enterprise Pilot Deployment Guide

**Status:** Implementation-ready pilot guide. The product supports configuration and controlled preflight; activation of customer-controlled services requires customer endpoints, restricted service identities, and secure deployment secrets.

## Purpose and operating boundary

AgentFence governs actions that travel through its signed cloud SDK or managed browser wrapper. It is not a substitute for enterprise IAM, endpoint hardening, network segmentation, or target-system authorization. A secure pilot combines those controls with AgentFence’s pre-execution identity, policy, data, approval, and audit decision path.

> **Security principle:** Integration endpoints and safe metadata may be configured in the console. Provider tokens, OAuth client secrets, AppRole secret IDs, SCIM bearer tokens, and SIEM/SOAR routing keys must remain in customer-controlled deployment secrets or tenant-scoped Vault paths. AgentFence neither displays nor persists raw secret material.

## Pilot sequence

| Stage | Owner | AgentFence action | Exit evidence |
|---|---|---|---|
| **1. Select a bounded workflow** | Business owner and security owner | Register a cloud or managed-browser agent, then write a narrow first policy. | Agent identity, policy, and baseline Action Trace. |
| **2. Establish accountable access** | Workspace administrator | Create a team; assign administrators, operators, viewers, and billing administrators; use expiring, one-time invitation tokens. | Team membership review and invitation audit events. |
| **3. Configure observability** | SOC or security engineering | Save a tenant-scoped SIEM/SOAR profile with an HTTPS endpoint and Vault reference. | Connection profile and controlled test result. |
| **4. Configure identity readiness** | IAM team | Save an OIDC issuer profile and validate discovery metadata; prepare SCIM lifecycle requirements. | OIDC discovery preflight; team/provisioning design review. |
| **5. Activate Vault when approved** | Vault administrator | Supply secure deployment values for `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID`; run a server-side health probe. | Ready Vault state and scoped lease test. |
| **6. Select commercial access** | Billing administrator | Use Stripe Checkout for Pilot or Growth, or request an Enterprise design review. | Server-recorded Stripe identifiers and Stripe-side subscription confirmation. |

## SIEM and SOAR profiles

AgentFence stores one connection profile per tenant and connector type. A profile includes safe endpoint metadata, a status, a preflight result, and an optional tenant-scoped Vault reference. It does **not** store tokens or raw event payloads.

| Profile | Purpose | Customer prerequisites | Activation boundary |
|---|---|---|---|
| **Splunk HEC** | Delivers privacy-safe governance alerts and audit references to a Splunk HTTP Event Collector. | HTTPS HEC endpoint, approved index/source policy, and a scoped HEC token held outside the browser. Splunk documents HEC as an HTTP/HTTPS ingestion mechanism.[1] | Save endpoint and metadata; provide a Vault reference before live outbound delivery. |
| **Microsoft Sentinel** | Prepares an Azure Monitor Logs Ingestion path suitable for Sentinel investigation. | Data Collection Endpoint/Rule, app registration with narrowly scoped permissions, and customer-controlled credentials. Microsoft documents Logs Ingestion as HTTPS JSON delivery to a Log Analytics workspace.[2] | Save DCE/DCR metadata and a Vault reference; activate after Azure credentials and data schema are approved. |
| **PagerDuty Events v2** | Prepares incident routing for selected high-severity governance events. | A dedicated service integration and a routing key held in Vault or secure deployment configuration. PagerDuty describes the Events API as asynchronous and recommends retry behavior for transient errors.[3] | Save endpoint/reference; configure routing policy and retry review before live use. |

> A successful endpoint-level acknowledgement is a **delivery attempt**, not proof that a downstream SOC or on-call responder completed remediation.

## Identity and provisioning readiness

The current product retains its existing secure sign-in provider and adds standards-aligned configuration readiness. It does not claim to replace a customer identity provider before a federation project has been completed.

| Profile | Validation performed by AgentFence | Customer activation work |
|---|---|---|
| **OIDC federation** | Server-side OIDC discovery preflight validates an HTTPS issuer and required discovery endpoints. OpenID Connect Discovery defines retrieval of provider metadata such as authorization, token, and JWKS endpoints.[4] | Configure client registration, redirect URIs, user/role mapping, claims policy, key rotation, and tenant access review. |
| **SCIM 2.0** | AgentFence provides a tenant-safe team, membership, role, and invitation model as the lifecycle target. | Complete authenticated SCIM endpoint design, stable identifiers, user/group semantics, deprovisioning behavior, and interoperability testing. RFC 7644 defines SCIM as an HTTP-based provisioning protocol and calls out security and multi-tenancy requirements.[5] |

## Vault AppRole activation

AgentFence is deliberately usable in **disconnected-safe mode**. The Enterprise Pilot Connections page indicates the current state and presents no raw secret fields. When the customer approves activation, a Vault administrator supplies the three variables using the project’s secure secret configuration:

| Variable | Required value | Handling requirement |
|---|---|---|
| `VAULT_ADDR` | HTTPS base address for the dedicated customer Vault. | Do not store it as an application tenant secret. |
| `VAULT_ROLE_ID` | Least-privilege AppRole identity for the server integration. | Restrict policy to `agentfence/tenants/<organizationId>/...`. |
| `VAULT_SECRET_ID` | AppRole authentication secret. | Distribute through a controlled, short-lived or response-wrapped process where supported. |

The server probes Vault health and issues or revokes leases only from server code. The browser receives status and lease metadata, never raw secrets. See [`vault_deployment_guide.md`](./vault_deployment_guide.md) for the complete AppRole policy, lease, rotation, and rollback guidance.

## Billing and feature plans

| Plan | Published access scope | Billing flow |
|---|---|---|
| **Pilot — $99/workspace/month** | Up to three governed agents, policy, approvals, Action Capture, and evidence export. | Server creates a Stripe Checkout session; customer completes payment in Stripe. |
| **Growth — $299/workspace/month** | Up to twenty governed agents, teams, advanced observability, connection profiles, and priority pilot support. | Server creates a Stripe Checkout session; subscription identifiers are recorded only after a verified webhook. |
| **Enterprise — custom agreement** | Custom capacity, Vault/SIEM/SOAR/IdP/SCIM activation assistance, and procurement support. | Sales and security architecture review; no client-side payment secret or unsupported price claim. |

Stripe remains the system of record for cards, invoices, payment status, tax, and subscription lifecycle details. AgentFence stores only required Stripe identifiers and its business-specific plan entitlement. Before payment testing, the project owner must claim and configure the existing Stripe test sandbox in the product payment settings. Webhook validation occurs at `/api/stripe/webhook` before JSON parsing and must verify the Stripe signature.

## Team-management operating model

The Team Management surface supports **administrator**, **operator**, **viewer**, and **billing administrator** roles. An administrator can create teams, change roles, issue expiring invitations, revoke unused invitations, and cannot remove the final administrator from a team. Invitations return a one-time token only to the creating administrator; AgentFence retains its hash rather than the plaintext token.

## Validation checklist

| Check | Expected result |
|---|---|
| `pnpm test` | All tests pass, including enterprise connection, billing-plan, team, and rendered UI coverage. |
| `pnpm check` | TypeScript has no errors. |
| `pnpm build` | Production client and server bundles compile successfully. |
| Enterprise Connections | Profile data is tenant-scoped; any endpoint is HTTPS; no token can be entered or rendered. |
| Vault | Disconnected-safe status is explicit until secure configuration is supplied. |
| Stripe | Checkout is server-created; webhook signatures are checked; the browser never reads the secret key. |
| Teams | Invitation token is copied only through an approved channel; role and revocation changes are audited. |

## References

[1]: https://help.splunk.com/en/splunk-enterprise/get-started/get-data-in/9.4/get-data-with-http-event-collector/set-up-and-use-http-event-collector-in-splunk-web "Splunk: Set up and use HTTP Event Collector"
[2]: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/logs-ingestion-api-overview "Microsoft Learn: Logs Ingestion API"
[3]: https://developer.pagerduty.com/docs/events-api-v2-overview "PagerDuty: Events API v2 overview"
[4]: https://openid.net/specs/openid-connect-discovery-1_0.html "OpenID Connect Discovery 1.0"
[5]: https://datatracker.ietf.org/doc/html/rfc7644 "RFC 7644: System for Cross-domain Identity Management Protocol"
