import { describe, expect, it } from "vitest";
import { DELETE_ACCOUNT_CONFIRMATION, initials, isSupportedAvatarDataUrl } from "./Account";

describe("account security helpers", () => {
  it("creates stable profile initials without exposing extra identity data", () => {
    expect(initials("Sunny Thakur")).toBe("ST");
    expect(initials("Operator")).toBe("O");
    expect(initials(null)).toBe("A");
  });

  it("accepts only supported, base64-encoded avatar data URLs", () => {
    expect(isSupportedAvatarDataUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isSupportedAvatarDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(isSupportedAvatarDataUrl("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(isSupportedAvatarDataUrl("https://example.com/avatar.png")).toBe(false);
  });

  it("requires the exact destructive-action confirmation phrase", () => {
    expect(DELETE_ACCOUNT_CONFIRMATION).toBe("DELETE MY ACCOUNT");
    expect("DELETE MY ACCOUNT").toBe(DELETE_ACCOUNT_CONFIRMATION);
    expect("delete my account").not.toBe(DELETE_ACCOUNT_CONFIRMATION);
  });
});
