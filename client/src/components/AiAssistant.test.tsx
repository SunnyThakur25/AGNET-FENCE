import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/contexts/AgentFenceContext", () => ({ useAgentFenceWorkspace: () => ({ organizationId: 7, ready: true }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { aiAssistant: { chat: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) } } } }));
vi.mock("wouter", () => ({ useLocation: () => ["/policies"] }));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

import AiAssistant, { AI_ASSISTANT_BOUNDARY_MESSAGE, pageForAssistantPath } from "./AiAssistant";

describe("AgentFence Guide route context", () => {
  it("maps product routes to bounded guidance contexts without carrying tenant record identifiers", () => {
    expect(pageForAssistantPath("/policies")).toBe("policies");
    expect(pageForAssistantPath("/action-trace?toolCallId=123")).toBe("action_trace");
    expect(pageForAssistantPath("/secure-connectors")).toBe("secure_connectors");
    expect(pageForAssistantPath("/unknown-screen")).toBe("other");
  });

  it("renders an accessible global launcher and keeps the guidance safety boundary explicit", () => {
    const markup = renderToStaticMarkup(<AiAssistant />);
    expect(markup).toContain("Ask AgentFence");
    expect(markup).toContain("Open AgentFence Guide");
    expect(AI_ASSISTANT_BOUNDARY_MESSAGE).toContain("No access to tenant records, secrets, tokens, or external systems.");
  });
});
