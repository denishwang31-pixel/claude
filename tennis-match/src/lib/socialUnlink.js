/* ============================================================
   계정 삭제 — 카카오·네이버·구글 쪽 연결 끊기
   (화면에 띄우는 문구가 아니라 삭제 화면이 결과만 보고 판단한다 — 그래서 socialSignIn 의
    [G·S 번호] 규칙 밖에 따로 둔다)

   Court 계정만 지우면 카카오·네이버·구글 쪽 「연결된 서비스」에 Court 가 남는다.
   삭제 과정에서(로그인 계정을 지우기 **전에** — 우리 서버가 누구인지 확인해야 하므로) 끊는다.
   실패해도 삭제는 계속한다. 화면이 "직접 끊어 주세요"라고 알린다.
   서버 쪽: functions/socialAuth.js 「연결 끊기」
   ============================================================ */
import { socialUnlinkUrl } from './social';

/** 카카오·네이버 — 우리 서버가 본인 확인 때 맡아 둔 토큰으로 끊는다 */
export async function unlinkSocial() {
  try {
    const [{ auth }] = await Promise.all([import('../../firebaseConfig')]);
    const idToken = await auth.currentUser?.getIdToken?.();
    if (!idToken) return { ok: false, error: 'auth' };
    const r = await fetch(socialUnlinkUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const j = await r.json().catch(() => ({}));
    return j && typeof j.ok === 'boolean' ? j : { ok: false, error: `http-${r.status}` };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

/** 구글 — 본인 확인 때 받은 토큰을 구글에 반납하면 Court 의 접근 권한이 사라진다 */
export async function revokeGoogle(accessToken) {
  if (!accessToken) return { ok: false, error: 'no-token' };
  try {
    const r = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return { ok: r.ok };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

export default { unlinkSocial, revokeGoogle };
