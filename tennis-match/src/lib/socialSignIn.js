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
        사용자가 정한 기본 브라우저를 먼저 쓰고, 없으면 시스템 기본,
        그것도 없으면 지원하는 것 아무거나.

     ⚠️ 못 고르면 지정 없이 연다 — 예전과 같은 동작이다. 브라우저를
        못 찾았다고 로그인 자체를 막으면 안 된다. */
  let browserPackage;
  try {
    const wb = await import('expo-web-browser');
    const found = await wb.getCustomTabsSupportingBrowsersAsync();
    browserPackage = found?.preferredBrowserPackage
      || found?.defaultBrowserPackage
      || (found?.browserPackages || [])[0]
      || undefined;
  } catch (e) {
    browserPackage = undefined;
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
    result = await request.promptAsync(GOOGLE_DISCOVERY,
      browserPackage ? { browserPackage } : undefined);
  } catch (e) {
    return { ok: false, error: `[G4] 구글 로그인 창을 열지 못했습니다. ${googleErrorText(e)}`.trim() };
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

export default { signInWithGoogle };
