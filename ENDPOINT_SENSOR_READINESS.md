# Endpoint Sensor Readiness

## Purpose

AgentFence Endpoint Operations is a **control-plane readiness capability** for approved customer-managed endpoints where registered AI agents execute through an AgentFence SDK/runtime client, managed browser wrapper, or Native MCP Gateway. It helps an organization inventory the endpoint, assign ownership, associate a registered agent workload with a known integration path, and preserve isolation evidence.

It is intentionally **not** a host-surveillance, EDR, or network-firewall claim. The current release does not ship an operating-system sensor binary, MDM package, device driver, host quarantine action, or arbitrary-process kill capability.

## Control model

| Control | Implemented behavior | Boundary |
|---|---|---|
| Endpoint identity | A tenant-unique device identity is recorded with an operating system, optional department, owner, and deployment reference. | The record does not prove a sensor is installed. |
| Agent correlation | Administrators explicitly bind an endpoint to a registered agent and one governed path: SDK, managed browser wrapper, or Native MCP Gateway. | AgentFence does not infer relationships from endpoint activity. |
| Privacy-minimized posture | The control plane stores readiness status, sensor version, and optional last-seen timestamp for an approved future sensor. | It stores no prompts, page content, raw process arguments, device secrets, or unrelated process telemetry. |
| Endpoint isolation | Administrators can disable explicit endpoint bindings, mark the endpoint isolated, and revoke active AgentFence runtime credentials for the bound workloads. | This does not quarantine the host, uninstall software, or stop unmanaged/direct calls. |
| Recovery | Releasing isolation restores the endpoint record to `registered` and re-enables its bindings. | Revoked credentials stay revoked; an operator must issue new scoped credentials after review. |

## Customer deployment prerequisites

Before a production endpoint-sensor rollout, the customer should define the supported Windows, macOS, and Linux scope; endpoint privacy notice; MDM deployment owner; code-signing/update process; device credential lifecycle; telemetry retention; SIEM routing; containment approval path; and recovery runbook.

A future sensor should use a signed package, tenant-scoped device identity, mutual authentication, encrypted transport, bounded health telemetry, replay protection, and a least-privilege API. Customer endpoint management remains the authority for software distribution and host-level response.

## What containment can and cannot do

> Endpoint isolation affects only AgentFence-supported integrations explicitly bound to the endpoint. It cannot provide universal endpoint control.

When an endpoint isolation is approved, AgentFence creates audit evidence, disables its explicit SDK/browser-wrapper/MCP bindings, and revokes active AgentFence runtime credentials for the workloads bound to the endpoint. This reduces the ability of those governed integrations to perform new authorized calls until review and fresh credential issuance.

An application that calls an external target directly, uses an unregistered endpoint, bypasses the AgentFence integration, or runs outside the customer’s approved deployment scope remains outside this control path. Customer EDR, MDM, network controls, identity policy, and secure credential design provide the complementary defenses for those cases.
