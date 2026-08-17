import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { agentfenceRouter } from "./routers/agentfence";
import { accountRouter } from "./routers/account";
import { enterpriseRouter } from "./routers/enterprise";
import { policyGovernanceRouter } from "./routers/policyGovernance";
import * as dbHelpers from "./db";
import { parse as parseCookieHeader } from "cookie";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME];
      if (ctx.user && token) await dbHelpers.revokeTokenSession(ctx.user.id, token);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  agentfence: agentfenceRouter,
  account: accountRouter,
  enterprise: enterpriseRouter,
  policyGovernance: policyGovernanceRouter,
});

export type AppRouter = typeof appRouter;
