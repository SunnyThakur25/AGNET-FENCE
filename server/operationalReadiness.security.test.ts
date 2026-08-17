import { describe, expect, it } from "vitest";
import { safeReference } from "./routers/operationalReadiness";

describe("operational readiness evidence references", () => {
  it("accepts non-secret evidence identifiers and rejects credential-shaped references", () => {
    expect(safeReference("DR-EXERCISE-2026-08-17")).toBe("DR-EXERCISE-2026-08-17");
    expect(safeReference("https://customer.example/records/restore-report")).toBe("https://customer.example/records/restore-report");
    expect(() => safeReference("https://customer.example/report?token=secret-value")).toThrow("non-secret locations or identifiers");
    expect(() => safeReference("vault://customer/password/restore")).toThrow("non-secret locations or identifiers");
  });
});
