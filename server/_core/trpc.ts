import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    user?: User;
  }
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const user = req.session?.user ?? null;
  return { req, res, user };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
