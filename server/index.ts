import express from "express";
import session from "express-session";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/trpc";
import { ENV } from "./_core/env";
import { upsertUser, getUserByOpenId, getUserByEmail, createEmailUser } from "./db";
import { hashPassword, verifyPassword, isValidEmail, MAX_PASSWORD_LENGTH } from "./_core/password";
import { makeAppleClientSecret, decodeAppleIdToken } from "./_core/appleAuth";
import { toSafeUser } from "./_core/safeUser";
import type { User } from "../drizzle/schema";
import rateLimit from "express-rate-limit";
import connectPgSimple from "connect-pg-simple";
import { randomBytes } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

// DB 연결이 요청 처리 도중 끊기는 등의 비동기 예외가 프로세스 전체를
// 죽이지 않도록 방지 — 그렇지 않으면 진행 중이던 응답이 중간에 끊겨
// 클라이언트에서 "Unexpected end of JSON input" 같은 에러로 나타난다.
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection (server continues running):", reason);
});
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  // 포트 충돌은 치명적 — 좀비로 남지 말고 명확히 알리고 종료한다.
  // (이전 서버 인스턴스가 안 꺼지고 포트 3001을 잡고 있으면 발생)
  if (err?.code === "EADDRINUSE") {
    console.error(`\n[Server] 포트 ${ENV.port}이(가) 이미 사용 중입니다 — 이전에 켜둔 가계부 서버가 아직 살아있습니다.`);
    console.error("[Server] 실행 창을 모두 닫거나 PC를 재부팅한 뒤 다시 실행해주세요. (가계부실행.bat 최신본은 자동으로 정리합니다.)\n");
    process.exit(1);
  }
  console.error("[Server] Uncaught exception (server continues running):", err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Render/Railway 등은 앞단(프록시)에서 TLS를 종료하고 서버로는 http로 넘긴다.
// 이 설정이 없으면 secure 쿠키가 "안전하지 않은 연결"로 오판되어 전송되지 않는다.
app.set("trust proxy", 1);

// ── CORS 허용 출처 ─────────────────────────────────────────────
// 앱(Capacitor) 웹뷰의 출처 + 환경변수(CLIENT_ORIGINS)로 지정한 웹 도메인을 허용한다.
//  - iOS 앱:            capacitor://localhost
//  - Android 앱:        http://localhost / https://localhost (androidScheme)
//  - 구형 Ionic 웹뷰:   ionic://localhost
const ALLOWED_ORIGINS = new Set<string>([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
  ...ENV.clientOrigins,
]);

app.use(
  cors({
    origin(origin, callback) {
      // 네이티브 앱/서버-사이드 요청은 Origin 헤더가 없을 수 있다 → 허용.
      if (!origin) return callback(null, true);
      // 개발 환경에서는 편의를 위해 모든 출처 허용(로컬 5173 등).
      if (!ENV.isProd) return callback(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      return callback(new Error(`CORS로 차단된 출처입니다: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
// Apple 로그인 콜백은 application/x-www-form-urlencoded 로 POST 된다(response_mode=form_post).
app.use(express.urlencoded({ extended: true }));

// 세션 저장소: 프로덕션은 PostgreSQL(connect-pg-simple)에 저장해 재시작에도 유지되고
// 다중 인스턴스에서도 공유된다. DB가 없으면(로컬 개발) 기본 MemoryStore로 폴백.
const PgStore = connectPgSimple(session);
const sessionStore = ENV.isProd
  ? new PgStore({ conString: process.env.DATABASE_URL, createTableIfMissing: true, tableName: "user_sessions" })
  : undefined;

app.use(
  session({
    store: sessionStore,
    secret: ENV.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // 앱은 서버와 출처가 다른(교차 출처) 요청이므로 프로덕션에선 SameSite=None + Secure 필수.
      // (SameSite=None은 Secure가 없으면 브라우저/웹뷰가 쿠키를 거부한다.)
      // 개발(http)에서는 Secure 쿠키가 막히므로 Lax + non-secure로 둔다.
      secure: ENV.isProd,
      sameSite: ENV.isProd ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// 로그인 성공 시: 세션 고정(session fixation) 공격 방지를 위해 세션 ID를 새로 발급한 뒤
// (regenerate) 안전한 사용자 정보만 저장한다. 모든 로그인/소셜 콜백이 이 함수를 쓴다.
function loginSession(req: express.Request, user: User): Promise<void> {
  const safe = toSafeUser(user);
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = safe;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

// 인증 엔드포인트 브루트포스/남용 방지 (IP 기준)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
});
app.use(["/auth/login", "/auth/register"], authLimiter);

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
      if (user) req.session.user = toSafeUser(user);
    }
    next();
  });
}

// ── Kakao OAuth ────────────────────────────────────────────────
app.get("/auth/kakao", (req, res) => {
  if (!ENV.kakaoClientId) {
    return res.status(400).json({ error: "KAKAO_CLIENT_ID not configured" });
  }
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const url =
    `https://kauth.kakao.com/oauth/authorize` +
    `?client_id=${ENV.kakaoClientId}` +
    `&redirect_uri=${encodeURIComponent(ENV.kakaoRedirectUri)}` +
    `&response_type=code&state=${state}`;
  res.redirect(url);
});

app.get("/auth/kakao/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  if (!code) return res.redirect("/?error=no_code");
  if (!state || state !== req.session.oauthState) return res.redirect("/?error=bad_state");
  req.session.oauthState = undefined;

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
    if (user) await loginSession(req, user);

    res.redirect(ENV.authSuccessRedirect);
  } catch (err) {
    console.error("[Auth] Kakao callback error:", err);
    res.redirect("/?error=auth_failed");
  }
});

// ── 이메일/비밀번호 회원가입 ───────────────────────────────────
app.post("/auth/register", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const name = String(req.body?.name ?? "").trim() || email.split("@")[0];

    if (!isValidEmail(email)) return res.status(400).json({ error: "이메일 형식이 올바르지 않습니다." });
    if (password.length < 8) return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
    if (password.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ error: `비밀번호는 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.` });

    const created = await createEmailUser({ email, passwordHash: await hashPassword(password), name });
    if (!created) return res.status(409).json({ error: "이미 가입된 이메일입니다." });

    await loginSession(req, created);
    res.json({ success: true, user: { id: created.id, name: created.name, email: created.email } });
  } catch (err) {
    console.error("[Auth] register error:", err);
    res.status(500).json({ error: "회원가입에 실패했습니다." });
  }
});

// ── 이메일/비밀번호 로그인 ─────────────────────────────────────
app.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    const user = await getUserByEmail(email);
    // 이메일 없음/소셜전용 계정/비번 불일치 모두 동일 메시지(계정 존재 여부 노출 방지)
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }

    await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    await loginSession(req, user);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("[Auth] login error:", err);
    res.status(500).json({ error: "로그인에 실패했습니다." });
  }
});

// ── Google OAuth ───────────────────────────────────────────────
app.get("/auth/google", (req, res) => {
  if (!ENV.googleClientId) return res.status(400).json({ error: "GOOGLE_CLIENT_ID not configured" });
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(ENV.googleClientId)}` +
    `&redirect_uri=${encodeURIComponent(ENV.googleRedirectUri)}` +
    `&response_type=code&scope=${encodeURIComponent("openid email profile")}` +
    `&state=${state}`;
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  if (!code) return res.redirect("/?error=no_code");
  if (!state || state !== req.session.oauthState) return res.redirect("/?error=bad_state");
  req.session.oauthState = undefined;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ENV.googleClientId,
        client_secret: ENV.googleClientSecret,
        redirect_uri: ENV.googleRedirectUri,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) throw new Error("Token error: " + tokenData.error);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const g = (await userRes.json()) as { id: string; email?: string; name?: string };

    const openId = `google:${g.id}`;
    await upsertUser({ openId, name: g.name ?? null, email: g.email ?? null, loginMethod: "google", lastSignedIn: new Date() });
    const user = await getUserByOpenId(openId);
    if (user) await loginSession(req, user);

    res.redirect(ENV.authSuccessRedirect);
  } catch (err) {
    console.error("[Auth] Google callback error:", err);
    res.redirect("/?error=auth_failed");
  }
});

// ── Naver OAuth ────────────────────────────────────────────────
app.get("/auth/naver", (req, res) => {
  if (!ENV.naverClientId) return res.status(400).json({ error: "NAVER_CLIENT_ID not configured" });
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const url =
    `https://nid.naver.com/oauth2.0/authorize` +
    `?response_type=code&client_id=${encodeURIComponent(ENV.naverClientId)}` +
    `&redirect_uri=${encodeURIComponent(ENV.naverRedirectUri)}` +
    `&state=${state}`;
  res.redirect(url);
});

app.get("/auth/naver/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  if (!code) return res.redirect("/?error=no_code");
  if (!state || state !== req.session.oauthState) return res.redirect("/?error=bad_state");
  req.session.oauthState = undefined;

  try {
    const tokenRes = await fetch(
      `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code` +
        `&client_id=${encodeURIComponent(ENV.naverClientId)}` +
        `&client_secret=${encodeURIComponent(ENV.naverClientSecret)}` +
        `&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    );
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) throw new Error("Token error: " + tokenData.error);

    const userRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const nv = (await userRes.json()) as { response?: { id: string; email?: string; name?: string; nickname?: string } };
    const r = nv.response;
    if (!r?.id) throw new Error("No user id from Naver");

    const openId = `naver:${r.id}`;
    await upsertUser({ openId, name: r.name ?? r.nickname ?? null, email: r.email ?? null, loginMethod: "naver", lastSignedIn: new Date() });
    const user = await getUserByOpenId(openId);
    if (user) await loginSession(req, user);

    res.redirect(ENV.authSuccessRedirect);
  } catch (err) {
    console.error("[Auth] Naver callback error:", err);
    res.redirect("/?error=auth_failed");
  }
});

// ── Apple "Sign in with Apple" ─────────────────────────────────
app.get("/auth/apple", (req, res) => {
  if (!ENV.appleClientId) return res.status(400).json({ error: "APPLE_CLIENT_ID not configured" });
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;
  // name/email scope 를 요청하면 Apple 은 response_mode=form_post 를 요구한다.
  const url =
    `https://appleid.apple.com/auth/authorize` +
    `?client_id=${encodeURIComponent(ENV.appleClientId)}` +
    `&redirect_uri=${encodeURIComponent(ENV.appleRedirectUri)}` +
    `&response_type=code&response_mode=form_post` +
    `&scope=${encodeURIComponent("name email")}` +
    `&state=${state}`;
  res.redirect(url);
});

app.post("/auth/apple/callback", async (req, res) => {
  const code = req.body?.code as string | undefined;
  const state = req.body?.state as string | undefined;
  if (!code) return res.redirect("/?error=no_code");
  // Apple 은 다른 도메인에서 교차 POST 하므로 세션 쿠키가 없을 수 있다.
  // 세션에 state 가 남아있는 경우에만 엄격 검증한다(있으면 반드시 일치해야 함).
  if (req.session.oauthState && state !== req.session.oauthState) {
    return res.redirect("/?error=bad_state");
  }
  req.session.oauthState = undefined;

  try {
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: ENV.appleClientId,
        client_secret: makeAppleClientSecret(),
        redirect_uri: ENV.appleRedirectUri,
      }),
    });
    const tokenData = (await tokenRes.json()) as { id_token?: string; error?: string };
    if (!tokenData.id_token) throw new Error("Token error: " + tokenData.error);

    const claims = decodeAppleIdToken(tokenData.id_token);
    if (!claims.sub) throw new Error("No sub in id_token");

    // 이름은 최초 인증 때만 form 의 user 필드(JSON)로 온다.
    let name: string | null = null;
    if (req.body?.user) {
      try {
        const u = JSON.parse(String(req.body.user)) as { name?: { firstName?: string; lastName?: string } };
        const full = [u.name?.lastName, u.name?.firstName].filter(Boolean).join(" ").trim();
        name = full || null;
      } catch { /* ignore */ }
    }

    // Apple 은 이름을 최초 1회만, 이메일도 상황에 따라 안 보낼 수 있다.
    // 값이 있을 때만 전달해 기존 저장값을 null 로 덮어쓰지 않도록 한다.
    const openId = `apple:${claims.sub}`;
    const upsert: Parameters<typeof upsertUser>[0] = { openId, loginMethod: "apple", lastSignedIn: new Date() };
    if (name) upsert.name = name;
    if (claims.email) upsert.email = claims.email;
    await upsertUser(upsert);
    const user = await getUserByOpenId(openId);
    if (user) await loginSession(req, user);

    res.redirect(ENV.authSuccessRedirect);
  } catch (err) {
    console.error("[Auth] Apple callback error:", err);
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
