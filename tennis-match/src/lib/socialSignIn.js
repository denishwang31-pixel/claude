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
import { googleErrorText, googleRedirectUri, GOOGLE_SCOPES } from './social';
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
    return { ok: false, error: '구글 로그인 설정이 빠져 있습니다(안드로이드 클라이언트 ID).' };
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
      error: '이 앱에는 구글 로그인 기능이 들어 있지 않습니다. 최신 버전을 새로 설치해 주세요.',
    };
  }

  const redirectUri = googleRedirectUri(applicationId);
  if (!redirectUri) {
    return { ok: false, error: '앱 패키지명을 읽지 못했습니다. 앱을 다시 설치해 주세요.' };
  }

  /* ---- 2. 로그인 창 ---- */
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
    result = await request.promptAsync(GOOGLE_DISCOVERY);
  } catch (e) {
    return { ok: false, error: googleErrorText(e) || '구글 로그인 창을 열지 못했습니다.' };
  }

  if (!result || result.type === 'dismiss' || result.type === 'cancel') {
    return { ok: false, cancelled: true, error: '' };
  }
  if (result.type === 'error') {
    const desc = String(result.error?.description || result.error?.message || '');
    if (/redirect_uri_mismatch/i.test(desc)) {
      return {
        ok: false,
        error: '구글에 등록된 주소와 맞지 않습니다. 구글 클라우드의 안드로이드 클라이언트에 패키지명과 SHA-1 이 제대로 들어갔는지 확인해 주세요.',
      };
    }
    return { ok: false, error: googleErrorText(result.error) || '구글이 로그인을 거부했습니다.' };
  }
  if (result.type !== 'success' || !result.params?.code) {
    return { ok: false, error: '구글에서 인증 코드를 받지 못했습니다.' };
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
    return { ok: false, error: googleErrorText(e) || '구글 토큰을 받지 못했습니다.' };
  }
  if (!idToken) {
    return { ok: false, error: '구글이 로그인 정보를 주지 않았습니다. 클라이언트 ID 설정을 확인해 주세요.' };
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
    return { ok: false, error: googleErrorText(e) };
  }
}

export default { signInWithGoogle };
