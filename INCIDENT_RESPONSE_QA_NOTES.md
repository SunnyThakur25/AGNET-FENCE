# Incident Response QA Notes

## 2026-08-18 visual verification

The Incident Response route renders the tenant-scoped evidence filter bar without desktop overflow. The view clearly states that it covers only AgentFence-supported integrated paths and does not claim visibility into direct bypass calls.

The live team-membership schema uses the `membershipRole` column. The Drizzle mapping was corrected so the existing Security Operations administrator is recognized by administrator-only incident controls. The active administrator membership is assigned as the incident commander in tenant settings.

Slack and PagerDuty are represented as disconnected-safe ownership and readiness profiles. No live external routing credentials, webhook URLs, API keys, or outbound delivery were activated during this verification.
