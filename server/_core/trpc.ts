import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { upsertUser, getUserByOpenId } from "../db";
import { ENV } from "./env";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    user?: User;
    oauthState?: string;
  }
}

const DEV_OPEN_ID = "dev-user-001";

export async function createContext({ req, res }: CreateExpressContextOptions) {
  let user = req.session?.user ?? null;

  // 개발 환경에서 DEV_AUTO_LOGIN=true 일 때만 로그인 없이 자동 사용자 부여.
  // 프로덕션(앱 출시)에서는 실제 로그인 세션이 없으면 user=null → 보호 API 차단.
  if (!user && !ENV.isProd && ENV.devAutoLogin) {
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
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
