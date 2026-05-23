import { initTRPC } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { upsertUser, getUserByOpenId } from "../db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    user?: User;
  }
}

const DEV_OPEN_ID = "dev-user-001";

export async function createContext({ req, res }: CreateExpressContextOptions) {
  let user = req.session?.user ?? null;

  if (!user) {
    await upsertUser({
      openId: DEV_OPEN_ID,
      name: "사용자",
      email: "user@localhost",
      loginMethod: "dev",
      lastSignedIn: new Date(),
    });
    user = (await getUserByOpenId(DEV_OPEN_ID)) ?? null;
    if (user) req.session.user = user;
  }

  return { req, res, user };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  return next({ ctx: { ...ctx, user: ctx.user! } });
});
