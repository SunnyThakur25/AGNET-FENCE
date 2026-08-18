import { describe, expect, it } from "vitest";
import { EMPTY_POLICY_DRAFT, policyDraftForQuickStart } from "./policyQuickStarts";

describe("policy authoring quick starts", () => {
  it("starts with a blank editable policy rather than a predefined enforcement rule", () => {
    const blank = policyDraftForQuickStart("blank");
    expect(blank).toEqual(EMPTY_POLICY_DRAFT);
    expect(blank).not.toBe(EMPTY_POLICY_DRAFT);
    expect(blank.toolPattern).toBe("");
    expect(blank.destinationPattern).toBe("");
  });

  it("returns editable copies so selecting a quick start cannot mutate its shared template", () => {
    const first = policyDraftForQuickStart("deny_export");
    first.name = "Operator-specific policy";
    const second = policyDraftForQuickStart("deny_export");
    expect(second.name).toBe("Deny customer export");
    expect(second.effect).toBe("deny");
  });
});
