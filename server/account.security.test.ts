import { describe, expect, it } from "vitest";
import { hashSessionToken } from "./db";
import { accountRouter } from "./routers/account";

describe("account security backend contract", () => {
  it("hashes session tokens deterministically without returning the raw token", () => {
    const token = "session-token-that-must-never-be-stored-raw";
    const hashed = hashSessionToken(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hashed);
  });

  it("exposes protected account procedures for profile, avatar, password provider, sessions, and deletion", () => {
    const account = accountRouter;
    expect(account).toBeDefined();
    expect(account._def.procedures.profile).toBeDefined();
    expect(account._def.procedures.uploadAvatar).toBeDefined();
    expect(account._def.procedures.passwordProvider).toBeDefined();
    expect(account._def.record.sessions).toBeDefined();
    expect(account._def.procedures.deleteAccount).toBeDefined();
  });
});
