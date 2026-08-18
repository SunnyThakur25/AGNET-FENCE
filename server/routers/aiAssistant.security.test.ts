import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const state = vi.hoisted(() => ({
  membership: vi.fn(),
  quota: vi.fn(async () => ({ allowed: true, used: 1, limit: 200, remaining: 199, windowStartedAt: new Date("2030-01-01T00:00:00.000Z") })),
  reply: vi.fn(async () => ({ answer: "Safe guidance only.", inputRedacted: false })),
}));

vi.mock("../agentfence/authz", () => ({ requireOrganizationMembership: state.membership }));
vi.mock("../agentfence/aiAssistant", async importOriginal => {
  const actual = await importOriginal<typeof import("../agentfence/aiAssistant")>();
  return { ...actual, generateAiAssistantReply: state.reply };
});
vi.mock("../agentfence/tenantQuotas", () => ({ consumeTenantQuota: state.quota }));

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
    expect(state.quota).toHaveBeenCalledWith({ organizationId: 9, kind: "assistant_guidance" });
    expect(state.reply).toHaveBeenCalledWith({ question: "How does the Tool Gateway work?", currentPage: "gateway" });
    expect(result).toEqual({ answer: "Safe guidance only.", inputRedacted: false });
  });

  it("does not invoke the LLM path when the durable tenant-wide quota is exhausted", async () => {
    state.quota.mockResolvedValueOnce({ allowed: false, used: 201, limit: 200, remaining: 0, windowStartedAt: new Date("2030-01-01T00:00:00.000Z") });
    await expect(aiAssistantRouter.createCaller(context()).chat({ organizationId: 9, question: "Explain policy scope.", currentPage: "policies" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(state.reply).toHaveBeenCalledTimes(1);
  });

  it("does not invoke the LLM path when the organization membership check fails", async () => {
    state.membership.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(aiAssistantRouter.createCaller(context()).chat({ organizationId: 999, question: "Explain this policy.", currentPage: "policies" })).rejects.toThrow("FORBIDDEN");
    expect(state.reply).toHaveBeenCalledTimes(1);
  });
});
