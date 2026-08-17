# Project TODO

- [x] Define the multi-tenant data model for organizations, teams, memberships, roles, API access, and tenant-scoped resources.
- [x] Implement protected admin and operator authorization procedures with strict tenant isolation.
- [x] Build the Agent Registry to create, manage, and assign identities to AI agents, tracking environment, owner, risk level, and operational status.
- [x] Build the Policy Engine to define and enforce least-privilege allow/deny rules per agent covering tools, actions, parameters, data sensitivity, and destinations.
- [x] Build the Tool Gateway decision workflow that intercepts and evaluates agent tool calls before execution.
- [x] Build the Credential Vault metadata and scoped short-lived token issuance model without exposing raw secrets to agents.
- [x] Build the Human Approval Workflow for payments, deletions, exports, and record changes with approve/reject capability and full audit capture.
- [x] Build the Tamper-Evident Audit Ledger for agent decisions, tool calls, policy matches, approvals, outcomes, timestamps, and actor identities.
- [x] Build the Data Guard to classify and redact PII, secrets, PHI, and payment data for approved models and destinations.
- [x] Build the Runtime Monitoring Dashboard for current agent posture, recent enforcement decisions, risk signals, and operational activity.
- [x] Build safe pre-deployment Attack Simulation workflows for prompt-injection, privilege-escalation, and data-exfiltration scenarios against registered agents.
- [x] Implement Role-Based Access Control for admin and operator roles, scoped API access, multi-team use, and tenant isolation.
- [x] Add LLM-Powered Explanations and Suggestions for policy outcomes, remediation, and audit-log patterns.
- [x] Add Instant Notifications for high-risk blocks, pending approvals, and policy-violation thresholds.
- [x] Add Compliance Evidence Export with durable evidence packets explicitly supporting SOC 2, ISO 27001, and insurance review use cases.
- [x] Create refined, polished, responsive governance-console interfaces that preserve all requested feature naming and wording.
- [x] Write and run Vitest coverage for core authorization, policy, approval, audit-integrity, and tenant-isolation rules.
- [ ] Integrate an external KMS or secret manager for live credential material, signed credential leases, rotation, and revocation without exposing raw secrets in AgentFence.
- [x] Ship a signed gateway SDK or sidecar for intercepting live tool calls from customer agent runtimes outside the AgentFence console.
- [x] Verify the rendered console, validate error states, review the TODO, and create an initial project checkpoint.
- [x] Extend Data Guard scanning and redaction to outbound/model-output paths before external destinations.
- [x] Add audit-log pattern analysis and policy-improvement suggestions to the LLM explanations workflow.
- [x] Add operator-facing polling alerts and threshold-based policy-violation notifications.
- [x] Add Vitest coverage for organization-role enforcement, approval expiration rules, and audit-integrity utilities.
- [x] Wire outbound/model-output Data Guard enforcement into the signed gateway SDK or sidecar so external sends are automatically scanned and redacted before delivery.

## Dedicated Vault deployment

- [x] Define the dedicated Vault tenancy, namespace/path layout, authentication method, and lease TTL contract for AgentFence.
- [x] Implement Vault-backed credential metadata, dynamic lease issuance, rotation, revocation, and tenant-scoped audit events without storing raw secret values in AgentFence.
- [x] Implement signed runtime gateway requests with nonce/replay protection and automatic outbound Data Guard enforcement before delivery.
- [x] Add tests for Vault lease scope, expiry, revocation, tenant isolation, replay rejection, and outbound redaction.
- [x] Document the Vault deployment prerequisites, required secrets, and production hardening checklist.
- [x] Save a Vault-backed AgentFence checkpoint after validation.

## Delivery notes

- [ ] External Vault credentials and deployment endpoints must be supplied securely before live integration is enabled.
- [x] The current AgentFence console remains usable with the control-plane lease contract while the dedicated Vault deployment is provisioned.

**Decision:** Dedicated Vault deployment selected by the user.

- [x] Add a protected Vault AppRole settings surface that references securely managed secrets without displaying or persisting secret values.
- [x] Keep Vault AppRole settings optional and show a safe disconnected state when VAULT_ADDR, VAULT_ROLE_ID, or VAULT_SECRET_ID are not configured; do not use placeholder credentials.
- [x] Implement a server-side Vault configuration status check without exposing secret values, and drive the Settings UI from that status.
- [x] Add tests for configured and unconfigured Vault status behavior without placeholder credentials.
- [x] Define and document the Vault tenant namespace and path convention, lease TTL defaults and maxima, and AgentFence revocation model.
- [x] Create a dedicated Vault deployment guide with prerequisites, required environment variables, AppRole setup, response-wrapping guidance, rotation and revocation expectations, and a production hardening checklist.
- [x] Link runtime credential issuance to Vault credential references and enforce their allowed scopes and TTL limits.
- [x] Add backend tests proving runtime credential issuance cannot exceed a selected Vault reference’s scopes or TTL.
- [x] Add a router-level test rejecting out-of-scope runtime credential issuance from a selected Vault reference.
- [x] Add a router-level test rejecting runtime credential TTL above the selected Vault reference limit.
- [x] Add a procedure-level runtime gateway test proving duplicate nonces are rejected as replays.
- [x] Add a procedure-level test proving signed runtime credentials cannot cross organization or agent boundaries.
- [x] Add a procedure-level test proving the Vault path scope contract is enforced by the runtime credential workflow.
- [x] Add a protected Vault lease-rotation procedure with tenant-scoped audit events and secure failure handling.
- [x] Add router-level configured-Vault tests for lease issue, revoke, and rotate flows without exposing raw secret material.
- [x] Create a premium glassmorphic visual system with an intentional security color palette, depth, and accessible contrast.
- [x] Build a clear public landing experience that explains AgentFence as an AI-agent firewall through practical use cases and a visual request-flow story.
- [x] Build responsive sign-in and sign-up screens with a Google sign-in action that uses the existing secure OAuth login flow.
- [x] Add controlled, reduced-motion-aware micro-interactions and page transitions across public and authenticated AgentFence experiences.
- [x] Refine the governance console hierarchy and contextual education so first-time users understand policies, Tool Gateway decisions, Data Guard, approvals, and audit evidence.
- [x] Add and run focused UI/auth-flow Vitest coverage, then verify desktop and mobile screenshots for the redesign.
- [x] Add route-level reduced-motion-aware transitions between the public landing, sign-in, sign-up, and protected console experiences.
- [x] Add interactive Vitest coverage proving sign-in, sign-up, and Google sign-in controls invoke the secure OAuth entry handler.
- [x] Create a no-Vault local testing guide that explains safe disconnected-mode workflows and validation commands.
- [x] Map the OWASP Agentic Top 10 categories to AgentFence prevention, detection, approval, and audit controls with transparent limitations.
- [x] Upgrade Attack Simulation into a controlled, non-destructive assessment workflow that evaluates policy and guardrail outcomes instead of executing hostile payloads or real attacks.
- [x] Add a vibrant blue/cyan/red security visualization, sparking risk signals, smooth transitions, and animated AgentFence identity motion with reduced-motion support.
- [x] Add Vitest coverage for OWASP assessment scenarios and verify desktop/mobile visualization screenshots.
- [x] Add a documented and in-product OWASP Agentic Top 10 matrix showing prevention, detection, approval, audit, and simulation limitations for every ASI category.
- [x] Add router-level tests that exercise controlled OWASP scenario assessments, their audit events, and non-destructive policy-decision outcomes.
- [x] Add representative ASI01, ASI05, and ASI10 router-level controlled-assessment cases with audit-event assertions.
- [x] Add controlled policy-decision outcome coverage for passed, needs-review, and failed assessment statuses without external execution.
- [x] Establish a red-glassmorphic containment visual system with accessible contrast and a clear operational color hierarchy.
- [x] Redesign the public landing page to communicate AgentFence as an AI-agent firewall with a more memorable containment-led hero and conversion path.
- [x] Apply restrained red risk/boundary signals and subtle reduced-motion-aware animations across the authenticated console.
- [x] Add and run focused public landing render/content tests, then verify desktop and mobile screenshots for the red containment refresh.
- [x] Add a public landing preview route for authenticated-session visual verification without changing the standard unauthenticated home behavior.
- [x] Create an organization-ready architecture diagram covering cloud AI agents, local browser agents, AgentFence enforcement, enterprise systems, identity, Vault, approvals, audit, and SOC operations.
- [x] Document the trust boundaries, request paths, allow/block/approval decisions, and deployment patterns represented by the AgentFence architecture diagram.
- [x] Add a simple organization-wide onboarding flow for cloud agent SDK integrations and managed local browser-agent wrappers.
- [x] Build tenant-scoped AI Action Capture with privacy-safe request metadata, policy decisions, Data Guard findings, approval states, target context, and outcomes.
- [x] Build a graphical, traceroute-style AI Action Trace that shows every governed action hop from agent intent to target-system outcome.
- [x] Add automated tests and interface validation for Action Capture, Action Trace, tenant isolation, and sensitive-data redaction.
- [x] Extend AI Action Trace to capture and display downstream target-system outcome metadata for allowed cloud and browser actions without retaining raw response bodies.
- [x] Add tests proving Action Trace includes target-system outcome details for allowed flows while preserving tenant isolation and sensitive-data redaction.
