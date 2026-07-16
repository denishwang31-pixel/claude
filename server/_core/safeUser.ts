import type { User } from "../../drizzle/schema";

// 세션·API 응답에 실려도 되는 사용자 필드만 화이트리스트로 뽑는다.
// (특히 passwordHash 는 절대 밖으로 나가면 안 된다 — 오프라인 크래킹 위험.)
export interface SafeUser {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: string;
  loginMethod: string | null;
}

/** User 행에서 안전한 필드만 추린다. passwordHash 등 민감 필드는 제외. */
export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role,
    loginMethod: user.loginMethod ?? null,
  };
}
