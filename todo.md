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
- [x] Integrate an external KMS or secret manager for live credential material, signed credential leases, rotation, and revocation without exposing raw secrets in AgentFence; live activation remains disconnected-safe until deployment credentials are supplied.
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

**Delivery note:** External Vault credentials and deployment endpoints must be supplied securely before live integration is enabled. The user approved continuing in disconnected-safe mode for now.
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
- [x] Add interactive hover/focus tooltips to graphical AI Action Trace steps with policy, intent, Data Guard, approval, and target-outcome detail.
- [x] Add Action Capture search, decision/outcome filters, and sortable log columns for intent, policy, agent, destination, and time.
- [x] Add real-time trace status indicators and smooth reduced-motion-safe transitions for active execution states.
- [x] Add automated coverage for Action Capture filtering/sorting and accessible Action Trace tooltip/status behavior.

**Delivery note:** These UI refinements are scoped to the existing tenant-scoped observability model and do not collect raw secrets, prompts, page content, or response bodies.

- [x] Add UI-level Vitest coverage for Action Capture search, decision/outcome filtering, and each sort mode against rendered log data.
- [x] Add accessibility-focused tests proving Action Trace hop cards expose tooltip details on focus/hover and that live-status indicators render correctly for pending target outcomes.
- [x] Add rendered UI tests for Action Capture controls and visible action rows covering search, decision/outcome filtering, and each sort mode.
- [x] Add rendered accessibility tests for Action Trace hop cards proving aria-describedby tooltip linkage and live pending-target indicators.
- [x] Add rendered-component Vitest coverage for Action Capture with sample action rows and assertions that visible rows change for search, decision/outcome filters, and every sort mode.
- [x] Add rendered Action Capture tests proving visible rows change for decision and downstream outcome filters.
- [x] Add rendered Action Capture tests proving visible row order for newest, oldest, agent, intent, policy, and outcome sort modes.
- [x] Add a tenant-scoped dashboard widget summarizing the most frequent AI agent actions and success rates over the last 24 hours.
- [x] Make the action-summary widget customizable without changing the underlying tenant-scoped metrics.
- [x] Add an accessible persistent dark-mode toggle for the AgentFence dashboard with reduced-motion-safe visual transitions.
- [x] Add automated coverage and responsive visual validation for dashboard metrics, widget customization, and dark-mode preference behavior.
- [x] Add Vitest coverage for dashboard dark-mode toggle and ThemeProvider persistence, including stored preference and aria-pressed behavior.
- [x] Capture and verify dashboard screenshots in both dark and light modes so the theme toggle’s visual state is explicitly validated responsively.
- [x] Capture and verify a mobile/light-mode dashboard screenshot in addition to the existing dark-mode screenshots.
- [x] Validate the dashboard theme toggle by switching between dark and light modes through the UI and re-checking the visual state.
- [x] Capture and verify an authenticated dashboard screenshot at a mobile viewport in light mode, explicitly showing the action-summary widget and theme toggle.
- [x] Use the live dashboard theme toggle in the browser to switch between dark and light modes, then re-check screenshots and visual state for both modes.
- [x] Perform a repository-wide enterprise release-readiness audit for mock/demo code, synthetic assessments, placeholder behavior, secrets, dependencies, configuration, and deployment artifacts.
- [x] Classify and remove, isolate, or explicitly govern any active non-production behavior found during the release audit.
- [x] Implement prioritized enterprise hardening fixes and release documentation for production activation, monitoring, rollback, and incident response.
- [x] Validate the hardened release with automated tests, TypeScript, production build, and an updated deployment readiness checklist.
- [x] Build an interactive onboarding wizard that guides an organization through connecting its first real cloud or managed browser agent.
- [x] Enhance the public landing page with a clear operational “how AgentFence works” journey and the supplied enterprise architecture visual.
- [x] Create research-grounded Markdown documentation for product development, enterprise production deployment, and investor evaluation of AgentFence.
- [x] Create an investor narrative explaining the problem, market context, differentiated USP, operating model, and realistic value thesis without unsupported market-cap claims.
- [x] Demo video intentionally waived by user; retain the approved 60-second script and production prompt in `AGENTFENCE_DEMO_VIDEO_SCRIPT.md` as optional future material.
- [x] Add automated coverage and visual validation for the onboarding and landing-page changes, then validate the research-grounded documentation deliverables.
- [x] Final media validation intentionally waived because the user requested presentation-only delivery; no video artifact is part of this release.

## Profile and account security

- [x] Add Profile & account, Security & connections, and Sign out options to the authenticated profile bar.
- [x] Implement a secure password-management handoff in Security & connections; password changes remain provider-managed because AgentFence never stores local passwords.
- [x] Implement active-session management with tenant-safe session listing, current-session identification, and revoke controls.
- [x] Add avatar upload and profile-avatar persistence using the existing storage boundary, with MIME and 1 MB limits.
- [x] Add a secure Delete Account confirmation modal and tenant/user data deletion workflow with shared-workspace safeguards.
- [x] Add automated tests and responsive visual verification for profile and account security flows; authenticated route capture remains login-gated in the preview harness.
- [x] Save a checkpoint for the completed profile and account security milestone.

> Account-security implementation must never expose raw passwords, session tokens, or uploaded file bytes in the UI or audit logs.

<!-- end profile and account security -->

## Account-security validation follow-up

- [x] Add rendered UI tests for the profile-bar menu, security-page session controls, avatar-upload validation flow, and Delete Account confirmation modal.
- [x] Perform authenticated My Browser desktop visual verification of `/profile` and `/security`; verify mobile layout behavior through the responsive media rules and rendered component coverage because the connected browser exposes no viewport-resize control.
- [x] Mark account-security visual validation complete after rendered interaction coverage and authenticated route evidence became available.

## Investor presentation and GitHub publication

- [x] Research and cite current market framing, competitors, and value drivers for an AgentFence investor presentation without presenting unsupported market-cap claims.
- [x] Prepare a visual, detailed slide presentation explaining the product, problem, differentiated controls, benefits, competitive position, commercial value, and roadmap.
- [x] Update the repository README with an accurate AgentFence product overview, architecture, feature set, deployment guidance, and links to the investor materials.
- [x] Validate the presentation content, exported deck, documentation, and project build: 66 passing tests, clean TypeScript, and production build successful.
- [x] Push the completed AgentFence source and documentation changes to the selected GitHub repository: https://github.com/SunnyThakur25/AGNET-FENCE (main at `8055768`).
- [x] Save a checkpoint for the investor presentation and GitHub publication milestone.

## Enterprise pilot integrations, billing, and team management

- [x] Define configurable SIEM/SOAR delivery profiles and secure alert-forwarding controls for initial enterprise pilots.
- [x] Define identity-provider connection profiles and tenant-aware SSO/SCIM readiness boundaries without replacing the platform’s existing authentication provider prematurely.
- [x] Add an enterprise integration settings surface for SIEM/SOAR, identity-provider, and Vault connection health, configuration state, and test actions.
- [x] Prepare the customer Vault AppRole activation flow with secure environment-variable validation, connection health checks, and no raw-secret exposure.
- [x] Live customer Vault AppRole activation intentionally deferred by user for this release; the product remains disconnected-safe until `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID` are supplied through secure project settings.
- [x] Add Stripe billing integration with three feature-based product tiers, server-verified checkout, subscription status, and webhook-safe state handling.
- [x] Add feature-based pricing cards to the public landing page with a customer contact path for enterprise plans and no unsupported ROI claims.
- [x] Implement tenant-safe enterprise team management with member roles, invitation lifecycle, access revocation, and audit events.
- [x] Add automated tests and responsive visual validation for enterprise settings, billing, pricing, and team-management workflows.
- [x] Update all relevant Markdown documentation with pilot integration, Vault activation, pricing, billing, team-management, and operational security guidance.
- [x] Validate the enterprise-pilot release, checkpoint it, and push all completed changes to SunnyThakur25/AGNET-FENCE.

> Live service activation requires customer-controlled credentials, endpoints, authorization scopes, and billing configuration. AgentFence must not place raw Vault, IdP, SIEM/SOAR, or Stripe secrets in client code, the database, or audit logs.

## Enterprise audit-readiness assessment

- [x] Map AgentFence’s current AI-agent policy decision and enforcement capabilities to enterprise architecture, security, audit, and procurement expectations.
- [x] Identify implementation gaps across control-plane resilience, identity, data protection, operational security, compliance evidence, and ecosystem integrations.
- [x] Produce a prioritized enterprise-readiness roadmap that distinguishes pilot-ready controls from production-scale and audit-certification work.
- [x] Update product documentation with the enterprise positioning and recommended assurance roadmap.

## Enterprise policy governance and certified integrations

- [x] Implement immutable policy draft versions with a visual field-level diff before production promotion.
- [x] Add administrator review, approve, reject, promotion, rollback, and audit events for policy changes.
- [x] Create a dedicated secure connector settings page that manages safe SIEM/SOAR metadata and Vault reference paths without raw-secret browser entry or persistence.
- [x] Add secure deployment-credential readiness controls for Vault, OIDC, and SCIM, including explicit activation prerequisites and server-side validation only.
- [x] Implement a SIEM certification workflow that verifies a configured profile uses an approved tenant Vault reference and records a controlled certification result.
- [x] Add automated tests and authenticated responsive visual verification for policy change governance and secure connector settings.
- [x] Update enterprise deployment documentation with policy approval, IdP/SCIM activation, and SIEM certification procedures.
- [x] Validate, checkpoint, and push the completed enterprise control-governance milestone to GitHub.

> Customer raw secrets must only be supplied through secure project secret settings or customer Vault. The app may display safe readiness state and a Vault path reference, but must never collect, return, store, log, or render raw Vault, SIEM, OIDC, or SCIM credential values.

**Delivery note:** The workflow now records a real controlled certification result once a customer provides a reachable Splunk HEC endpoint and Vault AppRole deployment credentials. No customer credential or live endpoint was supplied for this release, so the visible `activation_required` state is intentional and no live SIEM certification is claimed.

## Architecture claim verification follow-up

- [x] Compare each pasted architecture capability claim with current AgentFence implementation and document the verified, partial, and customer-activation-required boundaries.
- [x] Tighten any product or deployment documentation language that could overstate runtime enforcement, integrations, or live service activation.
- [x] Validate, checkpoint, and push any approved claim-correction updates to GitHub.

## Claim-hardening implementation

- [x] Feed the highest detected inbound or outbound Data Guard sensitivity into runtime policy evaluation before delivery, while retaining redaction and tenant-safe audit evidence.
- [x] Add regression coverage proving sensitive outbound content cannot bypass a matching block or approval-required policy.
- [x] Revise the architecture diagram to show Data Guard policy input, all decision outcomes feeding runtime monitoring, optional Vault-to-broker activation, and browser-session execution boundaries.
- [x] Tighten investor, product, architecture, and deployment documentation to distinguish implemented controls, integration boundaries, optional activation, and roadmap items such as native MCP governance.
- [x] Update the investor presentation wording to use the same audit-defensible claims.
- [x] Validate, checkpoint, and push the completed claim-hardening implementation to GitHub.

## Native MCP gateway and live integration activation

- [x] Define native MCP gateway registration, server-trust, tool-discovery, and per-tool policy-enforcement contracts without retaining raw upstream credentials.
- [x] Implement tenant-scoped MCP server registration and native policy-gated tool invocation through the AgentFence control path.
- [x] Add a secure customer Vault AppRole activation procedure that validates deployment-only configuration, health, tenant scope, and server-side authentication without accepting secrets in the browser.
- [x] Build a complete Splunk HEC connection and certification workflow using HTTPS endpoint metadata plus a tenant-safe Vault reference, with controlled evidence results and no raw token exposure.
- [x] Add governed configuration interfaces for MCP servers, Vault activation, and Splunk HEC connection/certification.
- [x] Add automated security, tenant-isolation, and rendered-interface tests; validate full build and responsive user experience.
- [x] Update the activation guide and product claim register, checkpoint the completed release, and push it to GitHub.
- [ ] Complete a live customer Vault AppRole authentication and Splunk HEC event certification after the customer supplies a reachable HEC endpoint plus protected `VAULT_ADDR`, `VAULT_ROLE_ID`, and `VAULT_SECRET_ID` values.
