import { describe, expect, it } from "vitest";
import { persistThemePreference, readStoredTheme } from "./ThemeContext";

describe("ThemeContext preference helpers", () => {
  it("reads only valid persisted light or dark preferences", () => {
    const storage = { getItem: () => "light" };
    expect(readStoredTheme("dark", storage)).toBe("light");
    expect(readStoredTheme("dark", { getItem: () => "unexpected" })).toBe("dark");
  });

  it("persists the selected theme through the storage contract", () => {
    let stored = "";
    persistThemePreference("light", { setItem: (_key, value) => { stored = value; } });
    expect(stored).toBe("light");
  });
});
