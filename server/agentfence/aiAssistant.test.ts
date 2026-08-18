import { describe, expect, it } from "vitest";
import { buildAssistantSystemPrompt, prepareAssistantQuestion, redactAssistantText } from "./aiAssistant";

describe("AgentFence guidance assistant safety boundaries", () => {
  it("redacts named credential material and private keys before a question reaches the model", () => {
    const question = "Can I paste authorization: Bearer sk_0123456789abcdefghijklmnop and -----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY----- here?";
    const prepared = prepareAssistantQuestion(question);
    expect(prepared.redactions).toBeGreaterThanOrEqual(2);
    expect(prepared.text).toContain("[redacted credential material]");
    expect(prepared.text).not.toContain("sk_0123456789abcdefghijklmnop");
    expect(prepared.text).not.toContain("BEGIN PRIVATE KEY");
  });

  it("redacts credential-like output before returning it to an operator", () => {
    const result = redactAssistantText("Never expose api_key=AKIA0123456789ABCDEFGHIJK to an agent.");
    expect(result.redactions).toBeGreaterThan(0);
    expect(result.text).not.toContain("AKIA0123456789ABCDEFGHIJK");
  });

  it("makes the no-record, no-secret, no-action boundary explicit in the system prompt", () => {
    const prompt = buildAssistantSystemPrompt("policies");
    expect(prompt).toContain("Policies are authored from scratch");
    expect(prompt).toContain("no access to tenant records");
    expect(prompt).toContain("Never request, reproduce, infer, or expose secrets");
    expect(prompt).toContain("Never execute actions");
  });

});
