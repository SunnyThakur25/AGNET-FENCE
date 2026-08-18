import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const state = vi.hoisted(() => ({
  membership: vi.fn(),
  quota: vi.fn(() => ({ allowed: true, remaining: 11, retryAfterMs: 0 })),
  reply: vi.fn(async () => ({ answer: "Safe guidance only.", inputRedacted: false })),
}));

vi.mock("../agentfence/authz", () => ({ requireOrganizationMembership: state.membership }));
vi.mock("../agentfence/aiAssistant", async importOriginal => {
  const actual = await importOriginal<typeof import("../agentfence/aiAssistant")>();
  return { ...actual, consumeAssistantRequestQuota: state.quota, generateAiAssistantReply: state.reply };
});

import { aiAssistantRouter } from "./aiAssistant";

function context(): TrpcContext {
  return {
    user: { id: 42, openId: "operator-42", email: "operator@example.test", name: "Operator", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("aiAssistant.chat authorization", () => {
  it("requires organization membership before generating operator guidance", async () => {
    state.membership.mockResolvedValue(undefined);
    const result = await aiAssistantRouter.createCaller(context()).chat({ organizationId: 9, question: "How does the Tool Gateway work?", currentPage: "gateway" });
    expect(state.membership).toHaveBeenCalledWith(9, 42);
    expect(state.reply).toHaveBeenCalledWith({ question: "How does the Tool Gateway work?", currentPage: "gateway" });
    expect(result).toEqual({ answer: "Safe guidance only.", inputRedacted: false });
  });

  it("does not invoke the LLM path when the organization membership check fails", async () => {
    state.membership.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(aiAssistantRouter.createCaller(context()).chat({ organizationId: 999, question: "Explain this policy.", currentPage: "policies" })).rejects.toThrow("FORBIDDEN");
    expect(state.reply).toHaveBeenCalledTimes(1);
  });
});
