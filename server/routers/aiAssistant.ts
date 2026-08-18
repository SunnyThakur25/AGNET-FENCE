import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AI_ASSISTANT_PAGE_IDS, generateAiAssistantReply } from "../agentfence/aiAssistant";
import { requireOrganizationMembership } from "../agentfence/authz";
import { consumeTenantQuota } from "../agentfence/tenantQuotas";
import { protectedProcedure, router } from "../_core/trpc";

const assistantInput = z.object({
  organizationId: z.number().int().positive(),
  question: z.string().trim().min(3).max(2_000),
  currentPage: z.enum([...AI_ASSISTANT_PAGE_IDS]).default("other"),
});

export const aiAssistantRouter = router({
  chat: protectedProcedure.input(assistantInput).mutation(async ({ ctx, input }) => {
    await requireOrganizationMembership(input.organizationId, ctx.user.id);
    let quota: Awaited<ReturnType<typeof consumeTenantQuota>>;
    try {
      quota = await consumeTenantQuota({ organizationId: input.organizationId, kind: "assistant_guidance" });
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Guidance usage controls are temporarily unavailable. Please try again." });
    }
    if (!quota.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "This organization has reached its AgentFence Guide quota for the current UTC day. An administrator can review or adjust the limit in Operations Center.",
      });
    }
    try {
      return await generateAiAssistantReply({ question: input.question, currentPage: input.currentPage });
    } catch (error) {
      console.error("[AI Assistant] Guidance generation failed", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Guidance is temporarily unavailable. Please try again." });
    }
  }),
});
