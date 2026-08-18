import { describe, expect, it } from "vitest";
import { pageForAssistantPath } from "./AiAssistant";

describe("AgentFence Guide route context", () => {
  it("maps product routes to bounded guidance contexts without carrying tenant record identifiers", () => {
    expect(pageForAssistantPath("/policies")).toBe("policies");
    expect(pageForAssistantPath("/action-trace?toolCallId=123")).toBe("action_trace");
    expect(pageForAssistantPath("/secure-connectors")).toBe("secure_connectors");
    expect(pageForAssistantPath("/unknown-screen")).toBe("other");
  });
});
