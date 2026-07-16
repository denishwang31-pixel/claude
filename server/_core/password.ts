import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

// 외부 라이브러리 없이 Node 내장 crypto(scrypt)로 비밀번호를 해싱한다.
// 저장 형식: "scrypt$<salt(hex)>$<hash(hex)>"
// 동기(scryptSync)는 이벤트 루프를 블로킹하므로 비동기 scrypt 를 쓴다.

const KEYLEN = 64;
const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/** 비밀번호 정책상 허용 최대 길이 — 초장문 입력으로 CPU 소모 유발 방지. */
export const MAX_PASSWORD_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, KEYLEN)).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, KEYLEN);
  // 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 확인한다.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** 간단한 이메일 형식 검증 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}
