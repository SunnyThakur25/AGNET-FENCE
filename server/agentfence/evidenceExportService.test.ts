import { describe, expect, it } from "vitest";
import { scheduledExportRunKey } from "./evidenceExportService";

describe("scheduled evidence export identity", () => {
  it("uses a stable UTC-day run key so repeated delivery attempts can be idempotent", () => {
    expect(scheduledExportRunKey(new Date("2030-04-05T00:00:01.000Z"))).toBe("2030-04-05");
    expect(scheduledExportRunKey(new Date("2030-04-05T23:59:59.000Z"))).toBe("2030-04-05");
  });
});
