# Enterprise Pilot Integrations — Research Notes

**Reference date:** August 17, 2026.

## SIEM and SOAR delivery

| Integration profile | Official capability | AgentFence pilot design implication | Source |
|---|---|---|---|
| Splunk HTTP Event Collector (HEC) | Splunk’s HEC accepts application and event data over HTTP/HTTPS. | Use a server-side, tenant-scoped delivery profile; store endpoint metadata only and obtain the HEC token through secure deployment configuration or a scoped Vault reference. Never expose the token in the browser, database payloads, or audit evidence. | [Splunk HEC documentation](https://help.splunk.com/en/splunk-enterprise/get-started/get-data-in/9.4/get-data-with-http-event-collector/set-up-and-use-http-event-collector-in-splunk-web) |
| Azure Monitor / Microsoft Sentinel | The Logs Ingestion API sends JSON to a Log Analytics workspace through a Data Collection Rule and HTTPS; app registration credentials require DCR permission and TLS 1.2 or higher is enforced from March 1, 2026. | Model a Sentinel profile as a server-only integration that validates an HTTPS DCR/DCE endpoint and uses customer-owned client-credentials through secure deployment configuration. Keep raw client secrets out of AgentFence records and action exports. | [Microsoft Learn: Logs Ingestion API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/logs-ingestion-api-overview) |
| PagerDuty Events API v2 | The asynchronous Events API accepts alert and change events; it returns 202 when accepted and recommends retry on 429, network errors, and 5xx. | Support a SOAR/incident-delivery profile with server-side routing keys and bounded retry/dead-letter observability. Treat acknowledgements as delivery attempts, not as proof of downstream incident response. | [PagerDuty Events API v2](https://developer.pagerduty.com/docs/events-api-v2-overview) |

## Identity provider and provisioning readiness

| Standard | Official requirement | AgentFence pilot design implication | Source |
|---|---|---|---|
| OpenID Connect Discovery | Defines discovery of an OpenID Provider and metadata retrieval via HTTPS; metadata includes issuer, authorization endpoint, token endpoint, and JWKS URI. | Support secure OIDC readiness profiles validated on the server. Validate HTTPS issuer metadata and do not replace the current Manus OAuth sign-in path until the customer completes an IdP federation activation. | [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) |
| SCIM 2.0 | An HTTP-based protocol for provisioning and managing Users and Groups in multi-domain environments. It requires secure authentication/authorization and covers multi-tenancy considerations. | Implement tenant-safe team and membership lifecycle APIs first, then expose a standards-aligned SCIM readiness profile. A live SCIM endpoint needs a customer-authenticated service principal and protocol testing before activation. | [RFC 7644](https://datatracker.ietf.org/doc/html/rfc7644) |
| Okta SCIM guidance | Recommends SCIM 2.0, TLS-only endpoints, authenticated access, stable unique IDs, and active-resource state. | Use stable internal user IDs, tenant-scope every membership operation, and never permit anonymous provisioning. | [Okta: Build your SCIM API service](https://developer.okta.com/docs/guides/scim-provisioning-integration-prepare/main/) |

## Architecture decision

AgentFence will implement **server-side enterprise connection profiles** rather than browser-held vendor keys. Each profile is tenant-scoped, records configuration state and safe metadata, supports a controlled health/test action, and emits an audit event. Live outbound delivery and live SSO/SCIM enforcement are activation-dependent: they require customer-owned endpoint details, restricted service identities, and secure secret injection. This preserves the platform’s zero-trust boundary while allowing pilot teams to configure and validate an integration plan before credentials are activated.
