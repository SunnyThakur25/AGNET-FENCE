import { describe, expect, it } from "vitest";
import { quotaLimitForKind, usageWindowStart } from "./tenantQuotas";

describe("tenant quota window helpers", () => {
  it("uses an exact UTC minute for gateway evaluations and an exact UTC day for exports and guidance", () => {
    const instant = new Date("2030-04-05T12:34:56.789Z");
    expect(usageWindowStart("gateway_evaluations", instant).toISOString()).toBe("2030-04-05T12:34:00.000Z");
    expect(usageWindowStart("evidence_exports", instant).toISOString()).toBe("2030-04-05T00:00:00.000Z");
    expect(usageWindowStart("assistant_guidance", instant).toISOString()).toBe("2030-04-05T00:00:00.000Z");
  });

  it("maps each usage category to its distinct tenant-owned limit", () => {
    const quotas = { gatewayEvaluationsPerMinute: 600, evidenceExportsPerDay: 24, assistantGuidancePerDay: 200 };
    expect(quotaLimitForKind(quotas, "gateway_evaluations")).toBe(600);
    expect(quotaLimitForKind(quotas, "evidence_exports")).toBe(24);
    expect(quotaLimitForKind(quotas, "assistant_guidance")).toBe(200);
  });
});
