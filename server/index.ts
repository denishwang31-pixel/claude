import express from "express";
import session from "express-session";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/trpc";
import { ENV } from "./_core/env";
import { upsertUser, getUserByOpenId } from "./db";
import path from "path";
import { fileURLToPath } from "url";

// DB 연결이 요청 처리 도중 끊기는 등의 비동기 예외가 프로세스 전체를
// 죽이지 않도록 방지 — 그렇지 않으면 진행 중이던 응답이 중간에 끊겨
// 클라이언트에서 "Unexpected end of JSON input" 같은 에러로 나타난다.
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection (server continues running):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught exception (server continues running):", err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.use(
  session({
    secret: ENV.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: ENV.isProd,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// ── 개발용 자동 로그인 ─────────────────────────────────────────
if (!ENV.isProd && ENV.devAutoLogin) {
  app.use(async (req, _res, next) => {
    if (!req.session.user) {
      const devOpenId = "dev-user-001";
      await upsertUser({
        openId: devOpenId,
        name: "개발자",
        email: "dev@localhost",
        loginMethod: "dev",
        lastSignedIn: new Date(),
      });
      const user = await getUserByOpenId(devOpenId);
      if (user) req.session.user = user;
    }
    next();
  });
}

// ── Kakao OAuth ────────────────────────────────────────────────
app.get("/auth/kakao", (_req, res) => {
  if (!ENV.kakaoClientId) {
    return res.status(400).json({ error: "KAKAO_CLIENT_ID not configured" });
  }
  const url =
    `https://kauth.kakao.com/oauth/authorize` +
    `?client_id=${ENV.kakaoClientId}` +
    `&redirect_uri=${encodeURIComponent(ENV.kakaoRedirectUri)}` +
    `&response_type=code`;
  res.redirect(url);
});

app.get("/auth/kakao/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.redirect("/?error=no_code");

  try {
    // 토큰 요청
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ENV.kakaoClientId,
        redirect_uri: ENV.kakaoRedirectUri,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) throw new Error("Token error: " + tokenData.error);

    // 사용자 정보 요청
    const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const kakaoUser = (await userRes.json()) as {
      id: number;
      kakao_account?: { email?: string; profile?: { nickname?: string } };
    };

    const openId = `kakao:${kakaoUser.id}`;
    const name = kakaoUser.kakao_account?.profile?.nickname ?? null;
    const email = kakaoUser.kakao_account?.email ?? null;

    await upsertUser({ openId, name, email, loginMethod: "kakao", lastSignedIn: new Date() });
    const user = await getUserByOpenId(openId);
    if (user) req.session.user = user;

    res.redirect("/");
  } catch (err) {
    console.error("[Auth] Kakao callback error:", err);
    res.redirect("/?error=auth_failed");
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ── tRPC ──────────────────────────────────────────────────────
// 진단용: 모든 tRPC 요청의 소요 시간을 콘솔(검은 실행 창)에 남긴다.
// 어떤 요청이 느린지/멈추는지 실행 창만 봐도 바로 알 수 있게 한다.
app.use("/trpc", (req, res, next) => {
  const start = Date.now();
  const op = decodeURIComponent(req.path.replace(/^\//, "")).slice(0, 120);
  res.on("finish", () => {
    const ms = Date.now() - start;
    const tag = ms >= 3000 ? "[느림!]" : "[trpc]";
    console.log(`${tag} ${String(ms).padStart(6)}ms  ${op}`);
  });
  next();
});
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// ── 정적 파일 (프로덕션) ───────────────────────────────────────
if (ENV.isProd) {
  const publicDir = path.join(__dirname, "../public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.listen(ENV.port, () => {
  console.log(`[Server] ===== 코드 버전: rulecat-v2 (materialized ruleCategory) =====`);
  console.log(`[Server] Running on port ${ENV.port} (${ENV.nodeEnv})`);
  if (!ENV.isProd && ENV.devAutoLogin) {
    console.log("[Server] DEV_AUTO_LOGIN enabled — skipping OAuth");
  }
});
