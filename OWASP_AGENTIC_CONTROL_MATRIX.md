# OWASP Agentic Top 10 to AgentFence control matrix

AgentFence’s assessment workflow uses a synthetic request to exercise **its own policy decision boundary**. It does not run an exploit, send a payload, execute code, connect to third-party infrastructure, or claim that an attached agent application is comprehensively secure. OWASP describes the Agentic Top 10 as a practical framework for reducing security risks in systems where agents plan, act, and make decisions.[1]

| OWASP category | Prevention in AgentFence | Detection | Approval | Audit evidence | Assessment limitation |
|---|---|---|---|---|---|
| ASI01 — Agent Goal Hijack | Treat untrusted instructions as data; deny objective overrides. | Tool Gateway decision path and Data Guard findings. | Optional compensating control for consequential actions. | Synthetic assessment event and policy reason. | Does not test a live model’s prompt handling. |
| ASI02 — Tool Misuse & Exploitation | Explicit allow rules for tool actions; deny destructive calls by default. | Gateway evaluation detects an unmatched/denied action. | Require human review for destructive actions. | Tool decision and reviewer identity. | Does not invoke a real tool. |
| ASI03 — Identity & Privilege Abuse | Agent identity, tenant binding, scoped short-lived credentials. | Credential and scope validation events. | Require review for privilege changes. | Credential lifecycle and policy evidence. | Does not test a third-party identity provider. |
| ASI04 — Agentic Supply Chain Vulnerabilities | Limit connectors and tools to approved paths and destinations. | Gateway records attempted unapproved component action. | Require review before introducing consequential runtime components. | Component-action assessment event. | Does not install or inspect a real dependency. |
| ASI05 — Unexpected Code Execution | Deny execution tools by default; allow only narrow authorized paths. | Tool Gateway captures the attempted execution action. | Require explicit approval for execution. | Policy reason and assessment result. | Does not execute generated or user-provided code. |
| ASI06 — Memory & Context Poisoning | Gate persistent memory writes and instruction changes. | Context-changing assessment recorded by the gateway. | Require review for durable behavioral changes. | Immutable context-write decision record. | Does not modify a real agent memory store. |
| ASI07 — Insecure Inter-Agent Communication | Authenticate delegated tasks and authorize every received action. | Delegation decision and sender-verification signal. | Review high-impact delegated work. | Actor, task, and decision evidence. | Does not transmit inter-agent messages. |
| ASI08 — Cascading Failures | Enforce blast-radius limits and policy gates before fan-out. | Workflow-fan-out request is evaluated and recorded. | Require approval before consequential downstream automation. | Assessment sequence and policy outcome. | Does not trigger downstream workflows. |
| ASI09 — Human-Agent Trust Exploitation | Separate persuasive content from authorization; require independent review. | High-impact request and approval state are visible. | Identity-bound human approval is mandatory. | Reviewer, decision, and justification evidence. | Does not measure human susceptibility. |
| ASI10 — Rogue Agents | Enforce declared scope at the gateway and monitor unexpected actions. | Runtime monitoring and audit ledger expose unexpected behavior. | Review consequential autonomous actions. | Agent identity, action, and outcome chain. | Does not model autonomous behavior outside the connected control plane. |

## Reference

[1] [OWASP Top 10 for Agentic Applications for 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
