/* ============================================================
   소셜 로그인 — 실제로 창을 띄우고 Firebase 계정으로 바꾸는 곳

   ⚠️ 이 파일은 네이티브 모듈(expo-auth-session, expo-web-browser)을
      맨 위에서 불러온다. 그래서 이 모듈이 실리지 않은 앱에 이 코드가
      OTA 로 내려가면 **로그인 화면에서 앱이 죽는다**.

      막는 장치는 app.json 의 runtimeVersion: appVersion 이다.
      version 을 0.2.0 으로 올렸으므로, 이 업데이트는 0.2.0 으로 구운
      앱에만 간다. 0.1.0 이 깔린 기기는 이 코드를 받지 못한다.
      → 앞으로도 네이티브 모듈을 더할 때는 반드시 version 을 올릴 것.

   왜 expo-auth-session 인가 (그리고 그 한계)
     expo-auth-session 의 Google 제공자는 SDK 51 기준 deprecated 표시가
     붙어 있고, Expo 는 @react-native-google-signin/google-signin 을
     권한다. 그런데도 이쪽을 고른 이유는
       · SDK 가 버전을 지정해 주는 패키지라 버전을 맞출 수 있다
       · config plugin 이 필요 없어 네이티브 빌드가 깨질 여지가 적다
       · 안드로이드·iOS 가 같은 코드로 돈다
     대신 계정 선택 화면이 브라우저로 열린다. 네이티브 선택창보다
     투박하다. 실기기에서 써 보고 불편하면 그때 옮긴다 — 바꿀 곳은
     이 파일 하나다.

   ⚠️ 여기 있는 코드는 이 개발 환경에서 돌려 볼 수 없다.
      키가 있어야 하고, 네이티브 빌드가 있어야 하고, 이 컨테이너는
      expo.dev 로 나가지 못한다. 그래서 "된다"고 장담하지 않는다.
      대신 실패했을 때 무엇이 잘못됐는지 화면에 말하게 해 두었다 —
      조용히 아무 일도 안 일어나는 것이 제일 나쁘다.
   ============================================================ */
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { PROVIDERS, idTokenOf, googleErrorText } from './social';
import { LIVE_SOCIAL_CONFIG } from './socialConfig';

/* 로그인 창이 닫힌 뒤 앱으로 제대로 돌아오게 한다.
   이걸 빼면 안드로이드에서 브라우저가 남아 "로그인했는데 앱이 그대로"가
   된다. 앱이 뜰 때 한 번만 부르면 되는 것이라 모듈 맨 위에서 부른다. */
WebBrowser.maybeCompleteAuthSession();

/**
 * 구글 로그인.
 *
 * ⚠️ 훅이라 조건부로 부를 수 없다(리액트 규칙). 키가 없을 때도 그냥
 *    부르고, 그때는 request 가 null 이라 ready 가 false 가 된다.
 *    버튼 자체는 social.js 의 판단으로 안 그려지므로 눌릴 일도 없다.
 *
 * @returns {{ready, busy, error, signIn, clearError}}
 */
export function useGoogleSignIn({ config = LIVE_SOCIAL_CONFIG, onDone } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    /* 둘 다 넘긴다. 기기에서는 안드로이드 클라이언트로 창을 띄우고,
       Firebase 가 그 토큰을 받아 줄 때는 웹 클라이언트를 본다.
       둘 중 하나만 넣으면 창은 떠도 Firebase 가 거부한다.

       ⚠️ iOS 는 아직 없다. iosClientId 가 따로 필요한데, 그건 Apple
          Developer 계정을 만든 뒤에 나온다. 그때 SOCIAL_CONFIG 에
          googleIosClientId 를 더하고 app.config.js 에도 같은 이름을
          넣으면 된다(검사가 그 짝을 본다). 지금 미리 적어 두면
          항상 undefined 인 줄이 남아 있어 헷갈리기만 한다. */
    androidClientId: config.googleAndroidClientId || undefined,
    webClientId: config.googleWebClientId || undefined,
  });

  useEffect(() => {
    if (!response) return;
    let cancelled = false;

    (async () => {
      if (response.type === 'dismiss' || response.type === 'cancel') {
        setBusy(false);
        return;                                   // 사용자가 닫았다. 조용히 끝낸다
      }
      if (response.type === 'error') {
        setBusy(false);
        setError(googleErrorText(response.error) || '구글 로그인이 취소되었습니다.');
        return;
      }
      if (response.type !== 'success') { setBusy(false); return; }

      const idToken = idTokenOf(response);
      if (!idToken) {
        /* ⚠️ 여기까지 왔는데 토큰이 없으면 대개 클라이언트 ID 설정 문제다.
           조용히 넘기면 "눌렀는데 아무 일이 없다"가 되어 원인을 못 찾는다. */
        setBusy(false);
        setError('구글에서 인증 정보를 받지 못했습니다. 클라이언트 ID 설정을 확인해 주세요.');
        return;
      }

      try {
        const cred = GoogleAuthProvider.credential(idToken);
        const res = await signInWithCredential(auth, cred);
        if (!cancelled) { setBusy(false); onDone?.(res.user.uid); }
      } catch (e) {
        if (!cancelled) { setBusy(false); setError(googleErrorText(e)); }
      }
    })();

    return () => { cancelled = true; };
  }, [response]);

  const signIn = async () => {
    setError('');
    if (!request) {
      setError('구글 로그인 준비가 끝나지 않았습니다. 잠시 후 다시 눌러 주세요.');
      return;
    }
    setBusy(true);
    try {
      await promptAsync();
    } catch (e) {
      setBusy(false);
      setError(googleErrorText(e));
    }
  };

  return {
    ready: !!request,
    busy,
    error,
    signIn,
    clearError: () => setError(''),
  };
}

/** 이 제공자를 이 파일이 실제로 처리할 수 있는가 */
export const canHandle = (provider) => provider === PROVIDERS.GOOGLE;

export default { useGoogleSignIn, canHandle };
