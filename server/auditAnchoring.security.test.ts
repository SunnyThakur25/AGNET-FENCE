import { describe, expect, it } from "vitest";
import { normalizeRetentionReference } from "./routers/auditAnchoring";

describe("audit anchoring retention references", () => {
  it("accepts non-secret immutable storage locations and rejects credential-shaped locations", () => {
    expect(normalizeRetentionReference("s3://customer-worm/agentfence/audit/")).toBe("s3://customer-worm/agentfence/audit");
    expect(normalizeRetentionReference("https://account.blob.core.windows.net/audit-container")).toBe("https://account.blob.core.windows.net/audit-container");
    expect(() => normalizeRetentionReference("https://bucket.example/audit?token=secret-value")).toThrow("non-secret immutable-retention location");
    expect(() => normalizeRetentionReference("https://user:password@bucket.example/audit")).toThrow("non-secret immutable-retention location");
  });
});
