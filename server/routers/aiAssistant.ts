import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AI_ASSISTANT_PAGE_IDS, consumeAssistantRequestQuota, generateAiAssistantReply } from "../agentfence/aiAssistant";
import { requireOrganizationMembership } from "../agentfence/authz";
import { protectedProcedure, router } from "../_core/trpc";

const assistantInput = z.object({
  organizationId: z.number().int().positive(),
  question: z.string().trim().min(3).max(2_000),
  currentPage: z.enum([...AI_ASSISTANT_PAGE_IDS]).default("other"),
});

export const aiAssistantRouter = router({
  chat: protectedProcedure.input(assistantInput).mutation(async ({ ctx, input }) => {
    await requireOrganizationMembership(input.organizationId, ctx.user.id);
    const quota = consumeAssistantRequestQuota(`${ctx.user.id}:${input.organizationId}`);
    if (!quota.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Guidance requests are temporarily limited. Please wait a minute before trying again.",
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
