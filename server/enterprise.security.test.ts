import { describe, expect, it } from "vitest";
import { BILLING_PLANS, isBillingPlanKey } from "./agentfence/billing";
import { extractSplunkHecToken, isEnterpriseSecretReferenceAllowed, normalizeEnterpriseHttpsEndpoint, normalizeSplunkHecEventEndpoint, safeConfigContainsSecret, splunkSafeMetadata } from "./routers/enterprise";

describe("enterprise-pilot security contracts", () => {
  it("accepts only feature-based billing plan keys and preserves the custom enterprise boundary", () => {
    expect(Object.keys(BILLING_PLANS)).toEqual(["pilot", "growth", "enterprise"]);
    expect(BILLING_PLANS.pilot.monthlyPriceCents).toBe(9900);
    expect(BILLING_PLANS.growth.monthlyPriceCents).toBe(29900);
    expect(BILLING_PLANS.enterprise.monthlyPriceCents).toBeNull();
    expect(isBillingPlanKey("growth")).toBe(true);
    expect(isBillingPlanKey("unbounded")).toBe(false);
  });

  it("requires HTTPS enterprise endpoints and normalizes a trailing slash", () => {
    expect(normalizeEnterpriseHttpsEndpoint("https://idp.example.test/")).toBe("https://idp.example.test");
    expect(() => normalizeEnterpriseHttpsEndpoint("http://idp.example.test")).toThrow("HTTPS");
  });

  it("limits integration secret references to the matching tenant and connection kind", () => {
    expect(isEnterpriseSecretReferenceAllowed("agentfence/tenants/9/integrations/splunk_hec/primary", 9, "splunk_hec")).toBe(true);
    expect(isEnterpriseSecretReferenceAllowed("agentfence/tenants/10/integrations/splunk_hec/primary", 9, "splunk_hec")).toBe(false);
    expect(isEnterpriseSecretReferenceAllowed("agentfence/tenants/9/integrations/pagerduty_events/primary", 9, "splunk_hec")).toBe(false);
  });

  it("rejects credential-shaped safe metadata and accepts ordinary routing metadata", () => {
    expect(safeConfigContainsSecret({ index: "agentfence_audit", region: "us-east-1" })).toBe(false);
    expect(safeConfigContainsSecret({ apiKey: "not-allowed" })).toBe(true);
    expect(safeConfigContainsSecret({ routing_key: "not-allowed" })).toBe(true);
  });

  it("extracts only approved HEC token fields and fails closed for malformed Vault records", () => {
    expect(extractSplunkHecToken({ hec_token: "a-tenant-hec-token" })).toBe("a-tenant-hec-token");
    expect(extractSplunkHecToken({ token: "alternate-hec-token" })).toBe("alternate-hec-token");
    expect(() => extractSplunkHecToken({ password: "not-a-token" })).toThrow("HEC token");
  });

  it("requires the precise Splunk HEC event endpoint and forwards only allowlisted metadata", () => {
    expect(normalizeSplunkHecEventEndpoint("https://splunk.example.test:8088/services/collector/event/")).toBe("https://splunk.example.test:8088/services/collector/event");
    expect(() => normalizeSplunkHecEventEndpoint("https://splunk.example.test:8088/services/collector/health")).toThrow("HEC event endpoint");
    expect(splunkSafeMetadata({ index: "agentfence", source: "agentfence", token: "never" })).toEqual({ index: "agentfence", source: "agentfence" });
  });
});
