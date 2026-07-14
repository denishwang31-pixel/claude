import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// 외부 라이브러리 없이 Node 내장 crypto(scrypt)로 비밀번호를 해싱한다.
// 저장 형식: "scrypt$<salt(hex)>$<hash(hex)>"

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, KEYLEN);
  // 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 확인한다.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** 간단한 이메일 형식 검증 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}
