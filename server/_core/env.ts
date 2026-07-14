export const ENV = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? "development",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-in-prod",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  kakaoClientId: process.env.KAKAO_CLIENT_ID ?? "",
  kakaoRedirectUri: process.env.KAKAO_REDIRECT_URI ?? "http://localhost:3001/auth/kakao/callback",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/auth/google/callback",
  naverClientId: process.env.NAVER_CLIENT_ID ?? "",
  naverClientSecret: process.env.NAVER_CLIENT_SECRET ?? "",
  naverRedirectUri: process.env.NAVER_REDIRECT_URI ?? "http://localhost:3001/auth/naver/callback",
  // 로그인 성공 후 이동할 곳(웹은 "/", 앱은 딥링크 스킴으로 바꿀 수 있음)
  authSuccessRedirect: process.env.AUTH_SUCCESS_REDIRECT ?? "/",
  devAutoLogin: process.env.DEV_AUTO_LOGIN === "true",
  isProd: process.env.NODE_ENV === "production",
  // 앱/웹에서 이 서버로 붙는 것을 허용할 출처 목록(쉼표 구분).
  // 예: CLIENT_ORIGINS="https://myapp.com,https://budget.example.com"
  // 앱(Capacitor)의 capacitor://localhost 등은 아래 index.ts에서 기본 허용한다.
  clientOrigins: (process.env.CLIENT_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
