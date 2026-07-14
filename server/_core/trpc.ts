import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { upsertUser, getUserByOpenId, getDataUserId } from "../db";
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

  // 가족 공유: 그룹에 속하면 그룹 소유자의 데이터셋을 함께 사용한다.
  // (그룹이 없으면 자기 자신) — 모든 데이터 조회/저장은 이 dataUserId 로 이뤄진다.
  const dataUserId = user ? await getDataUserId(user.id) : undefined;

  return { req, res, user, dataUserId };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }
  // dataUserId 는 그룹 소유자(가족 공유) 또는 자기 자신. 데이터 접근에 사용.
  return next({ ctx: { ...ctx, user: ctx.user, dataUserId: ctx.dataUserId ?? ctx.user.id } });
});
