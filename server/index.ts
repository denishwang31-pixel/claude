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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

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
  console.log(`[Server] Running on port ${ENV.port} (${ENV.nodeEnv})`);
  if (!ENV.isProd && ENV.devAutoLogin) {
    console.log("[Server] DEV_AUTO_LOGIN enabled — skipping OAuth");
  }
});
