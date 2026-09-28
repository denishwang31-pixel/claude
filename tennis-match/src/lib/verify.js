/* ============================================================
   이메일 인증 — 누구를 막을지만 정하는 순수 함수 (검사: scripts/test-verify.mjs)

   왜 필요한가 (앱 주인 요청 2026-09-28)
     아무 주소나 넣고 가입할 수 있으면 없는 사람(허수)이 클럽에 들어와 활동할 수 있다.
     이메일·비밀번호로 가입한 사람은 받은 메일의 링크를 눌러야 앱에 들어온다.

   누구를 막지 않나
     · 구글 — 구글이 이미 확인한 이메일이다(emailVerified = true 로 온다)
     · 카카오·네이버 — 그쪽 계정으로 확인된 사람이다(비밀번호 방식이 아니다)
     · 둘러보기(익명) — 계정이 아니라 구경이다
     · **이 기능 전에 가입한 사람** — 지금 클럽에서 쓰고 있는 회원을 하루아침에
       잠그면 안 된다. VERIFY_REQUIRED_FROM 이후 가입자만 막는다.
   ============================================================ */

/** 이 시각 이후에 만든 비밀번호 계정부터 인증을 요구한다 (한국 2026-09-28 00:00) */
export const VERIFY_REQUIRED_FROM = '2026-09-27T15:00:00Z';

/**
 * @param {{isAnonymous?: boolean, emailVerified?: boolean, providers?: string[], createdAt?: string|number}} u
 * @returns {boolean} 인증 전까지 앱에 못 들어오는가
 */
export function needsEmailVerify(u, from = VERIFY_REQUIRED_FROM) {
  if (!u || u.isAnonymous) return false;
  if (u.emailVerified) return false;
  const providers = Array.isArray(u.providers) ? u.providers : [];
  if (!providers.includes('password')) return false;       // 구글·카카오·네이버
  const created = new Date(u.createdAt || 0).getTime();
  if (!Number.isFinite(created) || created < new Date(from).getTime()) return false;  // 기존 회원
  return true;
}

/** 인증 메일을 다시 보낼 수 있나 — 너무 자주 누르면 Firebase 가 막는다(too-many-requests) */
export const RESEND_GAP_SEC = 60;
export function resendWait(lastSentMs, nowMs = Date.now()) {
  if (!lastSentMs) return 0;
  return Math.max(0, Math.ceil((lastSentMs + RESEND_GAP_SEC * 1000 - nowMs) / 1000));
}

/** 메일이 안 보일 때 안내 — 인증·비밀번호 재설정 공통 */
export const MAIL_HINT = '메일이 안 보이면 스팸함·프로모션함·전체보관함을 확인해 주세요. '
  + '보내는 사람은 noreply@tennis-match-52b31.firebaseapp.com 입니다. 몇 분 걸릴 수 있습니다.';
