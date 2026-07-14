import { createPrivateKey, sign } from "crypto";
import { ENV } from "./env";

// Apple "Sign in with Apple" 은 다른 소셜과 달리 client_secret 을 정적 문자열이 아니라
// ES256(P-256)으로 서명한 JWT 로 만들어야 한다. 외부 JWT 라이브러리 없이 Node 내장
// crypto 로 생성한다.

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Apple 토큰 교환에 쓸 client_secret(JWT, ES256) 생성. 유효기간 1시간. */
export function makeAppleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: ENV.appleKeyId, typ: "JWT" };
  const payload = {
    iss: ENV.appleTeamId,
    iat: now,
    exp: now + 3600,
    aud: "https://appleid.apple.com",
    sub: ENV.appleClientId, // Services ID
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  // .p8 키 내용. 환경변수에 한 줄로 넣기 위해 \n 을 실제 줄바꿈으로 복원.
  const pem = ENV.applePrivateKey.replace(/\\n/g, "\n");
  const key = createPrivateKey(pem);

  // ES256 JOSE 서명은 raw R||S(64바이트) 형식이어야 한다 → dsaEncoding: ieee-p1363
  const signature = sign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

/** Apple id_token(JWT)의 payload 를 디코드. (토큰은 Apple 토큰 엔드포인트에서 TLS 로
 *  직접 받은 것이므로 여기서는 payload 만 읽는다.) */
export function decodeAppleIdToken(idToken: string): { sub: string; email?: string; email_verified?: string | boolean } {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("invalid id_token");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}
