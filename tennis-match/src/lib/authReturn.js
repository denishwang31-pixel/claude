/* 로그인 창에서 돌아오는 주소인가 — app/+native-intent.js 가 쓴다(검사: test-social) */

/** 구글(:/oauthredirect)·카카오·네이버(://oauth) 로그인 복귀 주소 */
export function isAuthReturn(path) {
  const s = String(path || '');
  return /^[a-z][a-z0-9.+-]*:\/{1,2}oauth(redirect)?(\/|\?|$)/i.test(s)
    || /^\/?oauth(redirect)?(\/|\?|$)/i.test(s);
}

/**
 * 화면 라우터에 넘길 주소. null 이면 "화면은 그대로" — 로그인 창이 결과를 받는다.
 * 앱이 꺼진 상태에서 이 주소로 켜졌다면(드묾) 첫 화면으로 보낸다.
 */
export function routeForIncoming(path, initial = false) {
  if (!isAuthReturn(path)) return path;
  return initial ? '/' : null;
}
