# Architecture Asset Review Notes

## Tile 1 — verified

- Corporate trust services: corporate IdP / SSO with workforce and workload identity.
- Dedicated Vault / secret manager with AppRole, leases, rotation, and revocation.
- SIEM / SOAR / compliance evidence receives immutable events and server-side dynamic lease signals.
- Agent Registry and workload identity resolve agent tenant, owner, environment, and risk.

## Tile 2 — verified

- AgentFence Console represents administration and governance.
- Data Guard classifies PII, PHI, payment data, and secrets.
- Tamper-Evident Audit Ledger records decision, actor, tool, and outcome.
- Human Approval Workflow gates payments, deletes, exports, and record changes.
- Credential Broker issues scoped short-lived credentials to approved SaaS, internal APIs, and data systems.

## Tile 3 — verified

- The policy engine makes allow, block, and approval decisions, while runtime monitoring and notifications observe the allowed-action path.
- The controlled OWASP assessment is explicitly synthetic and does not execute payloads.
- Payment, banking, regulated workflow, data warehouse, and file-storage destinations appear only after scoped credential issuance and allowed action scope.

## Tile 4 — verified

- The AI agent execution plane supports both local browser agents on managed laptops or VDIs and cloud AI agents such as copilots, workflows, and serverless agents.
- Browser navigation, forms, uploads, and API intent are intercepted by a browser wrapper; cloud tool intent and browser intent converge at the Tool Gateway / signed runtime SDK single action-decision point.
- Approved browser actions are constrained to approved business websites and browser portals.

## Tile 5 — verified

- Employees and customers, plus security administrators, interact with the governed agent environment under enterprise operating controls.
- Authorized approvers can approve or reject gated actions; approved browser actions proceed only after that decision.
- SOC and compliance teams receive alerts for operations and evidence workflows.
