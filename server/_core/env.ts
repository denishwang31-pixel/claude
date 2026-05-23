export const ENV = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? "development",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-in-prod",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  kakaoClientId: process.env.KAKAO_CLIENT_ID ?? "",
  kakaoRedirectUri: process.env.KAKAO_REDIRECT_URI ?? "http://localhost:3001/auth/kakao/callback",
  devAutoLogin: process.env.DEV_AUTO_LOGIN === "true",
  isProd: process.env.NODE_ENV === "production",
};
