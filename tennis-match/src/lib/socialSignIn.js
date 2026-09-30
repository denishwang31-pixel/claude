/* ============================================================
   소셜 로그인 — 실제로 창을 띄우고 Firebase 계정으로 바꾸는 곳

   ⚠️⚠️ 네이티브 모듈은 **버튼을 누를 때** 불러온다. 파일 맨 위에서
        부르지 않는다. 이건 취향이 아니라 한 번 당하고 고친 것이다.

        expo-router 는 앱이 뜰 때 화면 모듈을 평가한다. 로그인 화면이
        이 파일을 맨 위에서 import 하고, 이 파일이 expo-auth-session 을
        맨 위에서 import 하면, 그 모듈을 불러오다 실패하는 순간
        **앱이 시작도 못 하고 닫힌다**. 오류 화면조차 못 띄운다.
        사용자는 "앱을 켜면 바로 꺼진다" 말고는 아무것도 볼 수 없고,
        기기에 로그를 볼 방법이 없으면 원인을 찾을 길이 없다.

        그래서 await import() 로 미룬다. 이러면
          · 앱은 무슨 일이 있어도 뜬다
          · 실패는 버튼을 눌렀을 때 일어나고, 그때는 try/catch 로
            잡아서 화면에 이유를 적어 줄 수 있다
        앞으로 네이티브를 더 붙일 때도 같은 모양을 지킬 것.

   왜 훅을 안 쓰나
     expo-auth-session 의 Google 제공자는 훅(useIdTokenAuthRequest)으로만
     쓸 수 있는데, 훅은 조건부로 부를 수 없어서 결국 맨 위 import 가
     된다. 위의 이유로 그 길을 버리고, 일반 AuthRequest 를 직접 쓴다.
     대신 되돌아올 주소를 우리가 만들어야 한다 — social.js 의
     googleRedirectUri() 가 그 규칙을 갖고 있고 검사도 붙어 있다.

   ⚠️ 이 코드는 이 개발 환경에서 돌려 볼 수 없다. 키·실기기·expo.dev
      접속이 모두 필요하다. 그래서 "된다"고 장담하지 않는다. 대신
      어디서 멈췄는지 단계마다 다른 문구가 나오게 해 두었다.
   ============================================================ */
import {
  googleErrorText, googleRedirectUri, googleClientMixup, GOOGLE_SCOPES,
  browserCandidates, isNoBrowserError,
  PROVIDERS, makeState, authorizeUrl, socialReturnUrl, parseSocialReturn, socialAuthErrorText,
  matchLateReturn, socialClosedHint, LATE_WAIT_MS, HANDOFF_POLL_MS, PENDING_TTL_MS, socialResultUrl,
} from './social';
import { LIVE_SOCIAL_CONFIG } from './socialConfig';

/* 구글 OAuth 주소. 고정값이라 네트워크로 가져올 필요가 없다. */
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * 구글로 로그인한다.
 *
 * @returns {Promise<{ok: boolean, uid?: string, error?: string, cancelled?: boolean}>}
 *          error 가 빈 문자열이면 "사용자가 닫았다"는 뜻이라 화면에
 *          아무것도 띄우지 않는다.
 */
export async function signInWithGoogle({ config = LIVE_SOCIAL_CONFIG } = {}) {
  const clientId = String(config?.googleAndroidClientId || '').trim();
  if (!clientId) {
    return { ok: false, error: '[G1] 구글 로그인 설정이 빠져 있습니다(안드로이드 클라이언트 ID).' };
  }

  /* ⚠️ 창을 띄우기 전에 잡는다. 이 실수로 그냥 진행하면 구글 서버에서
        `400 오류: invalid_request` 로 막히는데, 그 실패는 구글 화면에서
        끝나고 앱으로 돌아오지 않는다 — 앱이 이유를 말할 기회조차 없다.
        여기서 멈춰야 화면에 이유가 남는다. social.js 머리말 참고. */
  if (googleClientMixup(config)) {
    return {
      ok: false,
      error: '[G0] 구글 웹 클라이언트 ID 와 안드로이드 클라이언트 ID 가 같은 값입니다. 둘 중 하나가 잘못 들어갔습니다. 구글 클라우드의 「사용자 인증 정보」에서 유형이 Android 인 줄의 클라이언트 ID 를 GOOGLE_ANDROID_CLIENT_ID 에 넣어 주세요.',
    };
  }

  /* ---- 1. 네이티브 모듈 불러오기 (여기서만) ---- */
  let AuthSession;
  let applicationId = '';
  try {
    const [as, app] = await Promise.all([
      import('expo-auth-session'),
      import('expo-application'),
    ]);
    AuthSession = as;
    applicationId = app?.applicationId || '';
  } catch (e) {
    return {
      ok: false,
      error: '[G2] 이 앱에는 구글 로그인 기능이 들어 있지 않습니다. 최신 버전을 새로 설치해 주세요.',
    };
  }

  const redirectUri = googleRedirectUri(applicationId);
  if (!redirectUri) {
    return { ok: false, error: '[G3] 앱 패키지명을 읽지 못했습니다. 앱을 다시 설치해 주세요.' };
  }

  /* ---- 2. 로그인 창 ----

     ⚠️ 어느 브라우저로 열지 **우리가 정한다**. 안 정하면 안드로이드가
        "연결 프로그램" 선택창을 띄우고, 거기서 지메일을 고르면 메일
        쓰기 화면으로 넘어가 로그인이 통째로 날아간다. 실제로 그랬다.

        로그인 주소는 브라우저로 열려야 한다 — 커스텀 탭을 지원하는
        브라우저만 고른다(그래야 로그인 후 앱으로 되돌아온다).
        후보 순서는 social.js browserCandidates() 가 정한다(검사 있음).
        안드로이드 11+ 에선 expo 가 주는 목록이 비어 오기 쉬워서, 예전처럼
        "목록의 첫 번째"만 믿으면 지정 없이 열려 선택창이 떴다.

     ⚠️ 못 고르면 지정 없이 연다 — 예전과 같은 동작이다. 브라우저를
        못 찾았다고 로그인 자체를 막으면 안 된다. */
  let candidates = [];
  try {
    const wb = await import('expo-web-browser');
    candidates = browserCandidates(await wb.getCustomTabsSupportingBrowsersAsync());
  } catch (e) {
    candidates = browserCandidates(null);
  }

  let result;
  let request;
  try {
    request = new AuthSession.AuthRequest({
      clientId,
      redirectUri,
      scopes: GOOGLE_SCOPES,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    });
  } catch (e) {
    return { ok: false, error: `[G12] 구글 로그인 준비에 실패했습니다. ${googleErrorText(e)}`.trim() };
  }
  /* 후보를 하나씩. "그 브라우저가 없다"면 다음으로, 다른 실패는 그대로 멈춘다.
     끝까지 못 열면 마지막으로 지정 없이 연다(예전 동작 — 선택창이 뜰 수 있다). */
  let lastErr = null;
  for (const browserPackage of [...candidates, undefined]) {
    try {
      result = await request.promptAsync(GOOGLE_DISCOVERY,
        browserPackage ? { browserPackage } : undefined);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (!isNoBrowserError(e)) break;
    }
  }
  if (lastErr) {
    return { ok: false, error: `[G4] 구글 로그인 창을 열지 못했습니다. ${googleErrorText(lastErr)}`.trim() };
  }

  if (!result || result.type === 'dismiss' || result.type === 'cancel') {
    return { ok: false, cancelled: true, error: '' };
  }
  if (result.type === 'locked') {
    /* 앞선 시도가 아직 안 끝났다. 창을 닫고 다시 누르면 풀린다. */
    return { ok: false, error: '[G5] 앞선 로그인 시도가 아직 열려 있습니다. 앱을 닫았다 다시 열어 주세요.' };
  }
  if (result.type === 'error') {
    /* ⚠️ 구글이 보낸 원문 코드를 그대로 붙인다. 이게 없으면
       redirect_uri_mismatch·invalid_client·access_denied 가 전부 같은
       "거부되었습니다" 한 줄로 보여서, 고칠 곳이 콘솔의 어느 화면인지
       알 수가 없다. 이 값들은 비밀이 아니다 — 키가 아니라 오류 이름이다. */
    const code = String(result.error?.code || result.params?.error || '');
    const desc = String(result.error?.description || result.error?.message || '');
    if (/redirect_uri_mismatch/i.test(`${code} ${desc}`)) {
      return {
        ok: false,
        error: `[G6] 구글에 등록된 주소와 맞지 않습니다. 구글 클라우드의 안드로이드 클라이언트에 패키지명과 SHA-1 이 제대로 들어갔는지 확인해 주세요.\n앱이 쓰는 주소: ${redirectUri}`,
      };
    }
    return {
      ok: false,
      error: `[G7] 구글이 로그인을 거부했습니다. (${code || '이유 없음'})\n${desc}`.trim(),
    };
  }
  if (result.type !== 'success' || !result.params?.code) {
    return { ok: false, error: `[G8] 구글에서 인증 코드를 받지 못했습니다. (${result.type})` };
  }

  /* ---- 3. 코드를 토큰으로 ---- */
  let idToken = '';
  try {
    const token = await AuthSession.exchangeCodeAsync({
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: request.codeVerifier
        ? { code_verifier: request.codeVerifier }
        : undefined,
    }, GOOGLE_DISCOVERY);
    idToken = token?.idToken || '';
  } catch (e) {
    /* 여기서 실패하면 창은 떴다는 뜻이다 — 즉 클라이언트 ID 자체는 맞다.
       원문을 붙여 둔다. invalid_grant / invalid_client 가 갈린다. */
    return { ok: false, error: `[G9] 구글 토큰을 받지 못했습니다.\n${String(e?.message || e || '')}`.trim() };
  }
  if (!idToken) {
    return { ok: false, error: '[G10] 구글이 로그인 정보를 주지 않았습니다. 클라이언트 ID 설정을 확인해 주세요.' };
  }

  /* ---- 4. Firebase 계정으로 ---- */
  try {
    const [{ GoogleAuthProvider, signInWithCredential }, { auth }] = await Promise.all([
      import('firebase/auth'),
      import('../../firebaseConfig'),
    ]);
    const res = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return { ok: true, uid: res.user.uid };
  } catch (e) {
    /* 구글은 통과했고 Firebase 가 거부한 자리다. 고칠 곳이 구글
       클라우드가 아니라 Firebase 콘솔이라는 뜻이라 꼭 구분해야 한다. */
    const code = String(e?.code || '');
    return { ok: false, error: `[G11] ${googleErrorText(e)}${code ? `\n(${code})` : ''}` };
  }
}

/**
 * 카카오·네이버로 로그인한다 — 웹 로그인 창 → 우리 서버(socialAuth) → 커스텀 토큰.
 *
 * 네이티브 SDK 를 쓰지 않아서 새 빌드 없이 키만 들어오면 된다. 비밀값은 서버에만 있다.
 * 흐름은 functions/socialAuth.js 머리말 참고.
 *
 * @returns {Promise<{ok: boolean, uid?: string, name?: string, error?: string, cancelled?: boolean}>}
 */
export async function signInWithSocialWeb(provider, { config = LIVE_SOCIAL_CONFIG, onWaiting } = {}) {
  const clientId = String(
    provider === PROVIDERS.KAKAO ? config?.kakaoRestKey : provider === PROVIDERS.NAVER ? config?.naverClientId : '',
  ).trim();
  if (!clientId) return { ok: false, error: '[S0] 이 로그인은 아직 설정되지 않았습니다.' };

  let WebBrowser;
  let applicationId = '';
  let bytes = null;
  try {
    const [wb, app] = await Promise.all([import('expo-web-browser'), import('expo-application')]);
    WebBrowser = wb;
    applicationId = app?.applicationId || '';
  } catch (e) {
    return { ok: false, error: '[S8] 이 앱에는 로그인 창 기능이 들어 있지 않습니다. 최신 버전을 설치해 주세요.' };
  }
  try {
    const Crypto = await import('expo-crypto');
    bytes = Crypto.getRandomBytes(32);
  } catch (e) {
    bytes = null;   // 없으면 makeState 가 Math.random 으로 만든다(위조 방지용 값이라 충분)
  }
  const returnUrl = socialReturnUrl(applicationId);
  if (!returnUrl) return { ok: false, error: '[S9] 앱 패키지명을 읽지 못했습니다.' };

  const state = makeState(provider, bytes);
  const url = authorizeUrl(provider, { clientId, state });

  /* 늦게 도착하는 결과를 받을 준비 — social.js 의 matchLateReturn 머리말 참고.
     기억은 파일에도 남긴다: 카카오톡에 가 있는 동안 휴대폰이 앱을 닫아 버리면
     결과 주소가 앱을 새로 켜는데, 그때도 이어서 로그인하려고. */
  await savePending({ provider, state, at: Date.now() });
  let lateUrl = '';
  let sub = null;
  const seen = [];          // 진단용 — 들어온 주소의 앞부분만(값은 안 남김)
  try {
    const { Linking } = await import('react-native');
    sub = Linking.addEventListener('url', (e) => {
      seen.push(String(e?.url || '').split('?')[0].slice(0, 40));
      if (parseSocialReturn(e?.url).state === state) lateUrl = e.url;
    });
  } catch (e) {
    sub = null;
  }

  let candidates = [];
  try {
    candidates = browserCandidates(await WebBrowser.getCustomTabsSupportingBrowsersAsync());
  } catch (e) {
    candidates = browserCandidates(null);
  }

  /* ⚠️ 안드로이드에서는 openAuthSessionAsync 를 쓰지 않는다.
        그 함수는 로그인 중에 **우리 앱이 잠깐이라도 앞에 나오면** "사용자가 닫았다"로 보고
        로그인 창을 강제로 닫는다(expo-web-browser 의 안드로이드 대체 구현).
        카카오 로그인 화면은 로그인을 누를 때 그런 순간을 만들고, 창이 닫혀 카카오가 우리
        서버로 결과를 보낼 기회가 없었다 — 서버 기록에 카카오 콜백이 한 번도 없었다(2026-09-30).
        그래서 평범한 브라우저 창(openBrowserAsync)으로 열고, 결과는 우리가 기다린다:
        앱 주소로 돌아오는 것(Linking) + 서버에 맡겨 둔 결과(handoff). iOS 는 그대로. */
  const RN = await import('react-native');
  const android = RN.Platform?.OS === 'android';
  let result = null;
  let lastErr = null;
  for (const browserPackage of [...candidates, undefined]) {
    try {
      const opt = browserPackage ? { browserPackage } : undefined;
      result = android
        ? await WebBrowser.openBrowserAsync(url, opt)
        : await WebBrowser.openAuthSessionAsync(url, returnUrl, opt);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (!isNoBrowserError(e)) break;
    }
  }
  if (lastErr) {
    try { sub?.remove?.(); } catch (e) { /* 이미 떨어졌다 */ }
    await clearPending();
    return { ok: false, error: `[S10] 브라우저 창을 열지 못했습니다. ${googleErrorText(lastErr)}`.trim() };
  }

  let backUrl = result?.type === 'success' ? result.url : '';
  let got = null;
  if (android) {
    onWaiting?.();
    const w = await waitForResult(RN.AppState, state, () => lateUrl);
    backUrl = w.url || '';
    got = w.handoff || (w.gone ? GONE : null);
    if (backUrl || (got && got !== GONE)) {
      try { WebBrowser.dismissBrowser?.(); } catch (e) { /* 이미 닫혔다 */ }
    }
  } else if (!backUrl) {
    /* iOS — 창이 "닫혔다"고 먼저 알려도 결과 주소가 바로 뒤에 올 수 있다 */
    for (let waited = 0; waited < LATE_WAIT_MS && !lateUrl; waited += 250) await sleep(250);
    backUrl = lateUrl;
    if (!backUrl) { onWaiting?.(); got = await pollHandoff(state, HANDOFF_POLL_MS); }
  }
  try { sub?.remove?.(); } catch (e) { /* 이미 떨어졌다 */ }

  if (!backUrl) {
    if (got === GONE) return { ok: false, cancelled: true, error: '' };   // 다른 곳(앱 뿌리)이 이미 받아 처리했다
    if (got && got.error !== 'expired') {
      await clearPending();
      return finishSocial(got, got.provider || provider);
    }
    /* 끝내 없으면 기억은 남겨 둔다 — 나중에 앱으로 돌아올 때 checkPendingSocial 이 한 번 더 본다 */
    const hint = socialClosedHint(provider);
    const diag = `(창 ${result?.type || '없음'} · 들어온 주소 ${seen.length ? seen.join(', ') : '없음'})`;
    return { ok: false, cancelled: true, error: '', hint: hint ? `${hint}\n${diag}` : '' };
  }
  await clearPending();

  const back = parseSocialReturn(backUrl);
  /* ⚠️ 우리가 연 로그인에서 돌아온 것인지 확인한다 — 다른 곳에서 만든 주소로
        남의 계정에 들어가게 만드는 공격을 막는다. */
  if (back.state !== state) return { ok: false, error: socialAuthErrorText('state', provider) };
  return finishSocial(back, provider);
}

/**
 * 안드로이드 — 로그인 창을 열어 둔 채 결과를 기다린다.
 * 끝나는 경우: 앱 주소로 결과가 옴(url) · 서버에 맡겨진 결과(handoff) · 다른 곳이 이미 처리(gone)
 *            · 사용자가 창을 닫고 앱에 머문 지 ACTIVE_GIVEUP_MS 지남 · 전체 WAIT_MAX_MS 지남.
 * 로그인 중 앱이 **잠깐** 앞에 나왔다 들어가는 것은 닫은 것으로 보지 않는다(그게 카카오 문제였다).
 */
const ACTIVE_GIVEUP_MS = 15000;
const WAIT_MAX_MS = 5 * 60 * 1000;
async function waitForResult(AppState, state, getUrl) {
  const started = Date.now();
  let activeSince = AppState?.currentState === 'active' ? 0 : null;   // 막 연 직후 잠깐은 셈하지 않는다
  let appSub = null;
  try {
    appSub = AppState?.addEventListener?.('change', (st) => {
      activeSince = st === 'active' ? Date.now() : null;
    });
  } catch (e) { appSub = null; }
  let lastPoll = 0;
  try {
    while (Date.now() - started < WAIT_MAX_MS) {
      const u = getUrl();
      if (u) return { url: u };
      const p = await loadPending();
      if (!p || p.state !== state) return { gone: true };
      const now = Date.now();
      const active = activeSince !== null;
      /* 앱이 앞에 있으면 자주, 뒤에 있으면 가끔 서버를 본다 */
      if (now - lastPoll > (active ? 1500 : 4000)) {
        lastPoll = now;
        const j = await fetchHandoff(state);
        if (j) return { handoff: j };
      }
      if (activeSince && now - activeSince > ACTIVE_GIVEUP_MS) return {};
      await sleep(300);
    }
    return {};
  } finally {
    try { appSub?.remove?.(); } catch (e) { /* 이미 떨어졌다 */ }
  }
}

/* ---------------- 로그인 창 밖에서 도착한 결과 ---------------- */

const PENDING_KEY = 'socialPending';
let pendingMem;          // undefined = 아직 파일을 안 읽음

async function savePending(p) {
  pendingMem = p;
  try { const { setJSON } = await import('./deviceStore'); await setJSON(PENDING_KEY, p); } catch (e) { /* 기억만 못 남긴다 */ }
}
async function loadPending() {
  if (pendingMem !== undefined) return pendingMem;
  try { const { getJSON } = await import('./deviceStore'); pendingMem = await getJSON(PENDING_KEY, null); } catch (e) { pendingMem = null; }
  return pendingMem;
}
async function clearPending() { await savePending(null); }

/**
 * 앱으로 들어온 주소가 우리가 열었던 카카오·네이버 로그인의 결과면 로그인을 마친다.
 * app/_layout.jsx 가 앱을 켤 때와 주소가 들어올 때마다 부른다.
 * 로그인 창이 제대로 받은 경우에는 그쪽이 먼저 기억을 지우므로 여기서는 아무것도 안 한다.
 * @returns {Promise<null | {ok, uid?, error?}>} null = 우리 일이 아니다
 */
export async function handleLateSocialUrl(url, { delayMs = 1500 } = {}) {
  if (!url || !matchLateReturn(url, { state: parseSocialReturn(url).state, at: Date.now() })) return null;
  /* 로그인 창이 같은 주소를 받았다면 그쪽이 곧 기억을 지운다 — 두 번 로그인하지 않게 잠깐 기다린다 */
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const back = matchLateReturn(url, await loadPending());
  if (!back) return null;
  await clearPending();
  return finishSocial(back, back.provider);
}

const GONE = 'gone';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 서버에 맡겨 둔 결과 한 번 찾기. 아직 없으면 null */
async function fetchHandoff(state) {
  try {
    const r = await fetch(socialResultUrl(state), { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && !j.pending ? j : null;
  } catch (e) {
    return null;
  }
}

/** 정해진 시간 동안 결과를 찾는다. 기억(pending)이 지워졌으면 GONE — 다른 곳이 받았다 */
async function pollHandoff(state, totalMs) {
  const until = Date.now() + totalMs;
  while (Date.now() < until) {
    const p = await loadPending();
    if (!p || p.state !== state) return GONE;
    const j = await fetchHandoff(state);
    if (j) return j;
    await sleep(1500);
  }
  return null;
}

/**
 * 앱이 다시 앞에 나올 때(app/_layout.jsx) — 열어 둔 카카오·네이버 로그인이 있으면
 * 서버에 맡겨진 결과를 한 번 찾아 로그인을 마친다. 크롬에 멈춰 있다가 손으로
 * 앱으로 돌아온 경우를 받는다.
 * @returns {Promise<null | {ok, uid?, error?}>}
 */
export async function checkPendingSocial() {
  const p = await loadPending();
  if (!p || !p.state) return null;
  if (Date.now() - Number(p.at || 0) > PENDING_TTL_MS) { await clearPending(); return null; }
  const j = await fetchHandoff(p.state);
  if (!j) return null;
  await clearPending();
  if (j.error === 'expired') return null;
  return finishSocial(j, j.provider || p.provider);
}

async function finishSocial(back, provider) {
  if (back.error) {
    const text = socialAuthErrorText(back.error, provider);
    return text ? { ok: false, error: text } : { ok: false, cancelled: true, error: '' };
  }
  if (!back.token) return { ok: false, error: socialAuthErrorText('server', provider) };

  try {
    const [{ signInWithCustomToken }, { auth }] = await Promise.all([
      import('firebase/auth'),
      import('../../firebaseConfig'),
    ]);
    const res = await signInWithCustomToken(auth, back.token);
    return { ok: true, uid: res.user.uid, name: back.name };
  } catch (e) {
    const code = String(e?.code || '');
    return { ok: false, error: `[S11] ${googleErrorText(e)}${code ? `\n(${code})` : ''}` };
  }
}

export default { signInWithGoogle, signInWithSocialWeb, handleLateSocialUrl, checkPendingSocial };
