/* ============================================================
   앱 오류 기록 — 화면이 하얗게 비는 일을 추측 말고 기록으로 본다

   왜 필요한가 (2026-10-03 앱 주인: "이렇게 뻑날 때가 있네" — 빈 화면 캡처)
     화면을 그리다 오류가 나면 React 는 화면 전체를 내려 버린다. 지금까지는
     그걸 잡는 곳이 없어서 아무 말 없이 하얀 화면만 남았다. 휴대폰 로그를
     볼 방법이 없으니 무엇이 문제였는지도 알 수 없었다.
     → app/_layout.jsx 의 ErrorBoundary 가 잡아서 안내 화면을 띄우고, 여기로 기록을 보낸다.
     → 화면 밖(버튼 처리 등)에서 난 치명적 오류도 setGlobalHandler 로 한 번 남긴다.

   무엇을 남기나 — clientErrors/{자동 id}
     uid · 시각 · 오류 문구(400자) · 스택 앞부분(2000자) · 어디서(boundary/global) · 화면 경로 ·
     앱 버전·업데이트 id·기기 종류. 이메일 같은 것은 문구에서 가린다.
     읽는 것은 앱 관리자만(규칙). 「테니스매치 앱 관리자」 → errors 로 최근 기록을 본다.

   ⚠️ 여기서 다시 오류가 나면 안 된다 — 전부 try 로 감싸고 조용히 끝낸다.
   ⚠️ 같은 오류를 짧은 시간에 여러 번 보내지 않는다(같은 문구는 1분에 한 번).
   ============================================================ */

const MAX_MSG = 400;
const MAX_STACK = 2000;
const maskEmail = (s) => String(s || '').replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, '$1***@$2');

/** 보낼 내용 만들기 (순수 함수 — 검사가 본다) */
export function crashPayload(error, { uid = '', where = '', path = '', app = {} } = {}) {
  const e = error || {};
  const message = maskEmail(String(e.message || e || '알 수 없는 오류')).slice(0, MAX_MSG);
  const stack = maskEmail(String(e.componentStack || e.stack || '')).slice(0, MAX_STACK);
  return {
    uid: String(uid || ''),
    message,
    stack,
    where: String(where || '').slice(0, 40),
    path: String(path || '').slice(0, 120),
    app: {
      version: String(app.version || ''),
      updateId: String(app.updateId || '').slice(0, 40),
      platform: String(app.platform || ''),
      os: String(app.os || '').slice(0, 20),
    },
  };
}

const recent = new Map();     // 문구 → 마지막으로 보낸 시각
let currentPath = '';
export const setCrashPath = (p) => { currentPath = String(p || ''); };

async function appInfo() {
  const out = { version: '', updateId: '', platform: '', os: '' };
  try {
    const RN = await import('react-native');
    out.platform = RN.Platform?.OS || '';
    out.os = String(RN.Platform?.Version ?? '');
  } catch (e) { /* 없으면 빈칸 */ }
  try {
    const Constants = (await import('expo-constants')).default;
    out.version = Constants?.expoConfig?.version || '';
  } catch (e) { /* 없으면 빈칸 */ }
  try {
    const U = await import('expo-updates');
    out.updateId = U.updateId || '';
  } catch (e) { /* 없으면 빈칸 */ }
  return out;
}

/** 오류 하나 보내기 — 실패해도 아무 일 없다 */
export async function reportCrash(error, { where = '' } = {}) {
  try {
    const key = String(error?.message || error || '').slice(0, 120);
    const now = Date.now();
    if (recent.has(key) && now - recent.get(key) < 60 * 1000) return;
    recent.set(key, now);
    const [{ auth, db }, { collection, addDoc, serverTimestamp }] = await Promise.all([
      import('../../firebaseConfig'),
      import('firebase/firestore'),
    ]);
    const uid = auth?.currentUser?.uid;
    if (!uid) return;                       // 규칙상 로그인한 사람만 남길 수 있다
    const body = crashPayload(error, { uid, where, path: currentPath, app: await appInfo() });
    await addDoc(collection(db, 'clientErrors'), { ...body, at: serverTimestamp() });
  } catch (e) {
    /* 기록이 실패해도 앱은 그대로 */
  }
}

/** 화면 밖에서 난 치명적 오류도 한 번 남긴다 — 원래 처리기는 그대로 부른다 */
let installed = false;
export function installCrashHandler() {
  if (installed) return;
  installed = true;
  try {
    const EU = global.ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    const prev = EU.getGlobalHandler?.();
    EU.setGlobalHandler((error, isFatal) => {
      if (isFatal) reportCrash(error, { where: 'global' });
      if (typeof prev === 'function') prev(error, isFatal);
    });
  } catch (e) { /* 없으면 넘어간다 */ }
}

export default { crashPayload, reportCrash, installCrashHandler, setCrashPath };
