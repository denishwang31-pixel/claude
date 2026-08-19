/* ============================================================
   소셜 로그인 — 카카오 · 구글 · 네이버

   지금 상태를 먼저 정확히 밝힌다
     이 파일은 "무엇이 준비됐고 무엇이 안 됐는지"를 판단하는 곳이다.
     실제 로그인 창을 띄우는 코드는 아직 없다. 이유는 두 가지다.

     1) 앱 키가 없다.
        카카오·네이버·구글 각 개발자센터에 앱을 등록하고 키를 받아야 한다.
        코드로 만들 수 있는 것이 아니다. 아래 SETUP 에 절차를 적어 두었다.

     2) 네이티브 모듈이 필요하다.
        로그인 창은 브라우저를 띄워야 하므로 expo-web-browser /
        expo-auth-session 이 들어간다. 이건 JS 만 바뀌는 것이 아니라서
        OTA(eas update)로는 안 나가고 APK 를 새로 빌드해야 한다.

   그래서 화면은 어떻게 하나
     준비된 제공자의 버튼만 보여 준다. 키가 없으면 그 버튼은 아예 안
     그린다. 눌러도 아무 일이 없는 버튼을 두면 사용자는 앱이 고장 났다고
     생각하고, 그 인상은 되돌리기 어렵다.

   키가 들어오면 무엇이 바뀌나
     providerReady 가 true 가 되면서 버튼이 나타난다. 화면 코드는 이미
     enabledProviders() 만 보고 그리므로 손댈 필요가 없다.
   ============================================================ */

export const PROVIDERS = {
  KAKAO: 'kakao',
  GOOGLE: 'google',
  NAVER: 'naver',
};

export const PROVIDER_LABEL = {
  [PROVIDERS.KAKAO]: '카카오로 시작하기',
  [PROVIDERS.GOOGLE]: '구글로 시작하기',
  [PROVIDERS.NAVER]: '네이버로 시작하기',
};

/** 버튼 색 — 각 서비스의 공식 색을 쓴다. 흉내 낸 색은 오히려 어색하다. */
export const PROVIDER_STYLE = {
  [PROVIDERS.KAKAO]: { bg: '#FEE500', fg: '#191600' },
  [PROVIDERS.GOOGLE]: { bg: '#FFFFFF', fg: '#1B1F27', border: '#D9DCE1' },
  [PROVIDERS.NAVER]: { bg: '#03C75A', fg: '#FFFFFF' },
};

/**
 * 제공자별로 무엇이 있어야 동작하는가.
 *
 * needsServer 는 "Firebase 커스텀 토큰을 만들어 줄 서버 함수가 필요한가".
 *   구글은 Firebase 가 기본 제공자로 지원하므로 서버가 필요 없다.
 *   카카오·네이버는 Firebase 가 모르는 제공자라서, 그쪽에서 받은 토큰을
 *   서버가 확인하고 Firebase 계정으로 바꿔 줘야 한다.
 */
export const REQUIREMENTS = {
  [PROVIDERS.KAKAO]: { keys: ['kakaoRestKey', 'kakaoNativeKey'], needsServer: true },
  [PROVIDERS.GOOGLE]: { keys: ['googleWebClientId', 'googleAndroidClientId'], needsServer: false },
  [PROVIDERS.NAVER]: { keys: ['naverClientId', 'naverClientSecret'], needsServer: true },
};

/**
 * 소셜 로그인 설정. 키가 들어오면 여기만 채우면 된다.
 * 값을 코드에 직접 적지 말고 app.json 의 extra 나 EAS 시크릿에서
 * 읽어 넣는 것이 안전하다 — 저장소에 키가 남지 않는다.
 */
export const SOCIAL_CONFIG = {
  kakaoRestKey: '',
  kakaoNativeKey: '',
  googleWebClientId: '',
  googleAndroidClientId: '',
  naverClientId: '',
  naverClientSecret: '',
  /* 서버가 커스텀 토큰을 만들어 주는 함수 주소.
     카카오·네이버를 켤 때 함께 배포해야 한다. */
  tokenEndpoint: '',
};

/** 그 제공자를 지금 쓸 수 있는가 */
export function providerReady(provider, config = SOCIAL_CONFIG) {
  const req = REQUIREMENTS[provider];
  if (!req) return false;
  const hasKeys = req.keys.every((k) => !!String(config?.[k] || '').trim());
  if (!hasKeys) return false;
  if (req.needsServer && !String(config?.tokenEndpoint || '').trim()) return false;
  return true;
}

/** 화면이 그릴 버튼 목록. 준비 안 된 것은 빠진다. */
export const enabledProviders = (config = SOCIAL_CONFIG) =>
  Object.values(PROVIDERS).filter((p) => providerReady(p, config));

/** 아직 뭐가 없는지 — 설정 화면과 PRE-LAUNCH 문서에 같은 값을 쓴다 */
export function missingFor(provider, config = SOCIAL_CONFIG) {
  const req = REQUIREMENTS[provider];
  if (!req) return [];
  const out = req.keys.filter((k) => !String(config?.[k] || '').trim());
  if (req.needsServer && !String(config?.tokenEndpoint || '').trim()) out.push('tokenEndpoint');
  return out;
}

/**
 * 키를 받는 절차. 화면(앱 운영자 전용)에도 그대로 보여 준다 —
 * 문서를 따로 찾아보지 않아도 되게.
 */
export const SETUP = {
  [PROVIDERS.KAKAO]: [
    'developers.kakao.com 에서 앱 만들기',
    '[플랫폼] → Android 등록 (패키지명 + 키 해시)',
    '[카카오 로그인] 켜기 → Redirect URI 등록',
    'REST API 키와 네이티브 앱 키를 SOCIAL_CONFIG 에 넣기',
    '서버 함수 배포 — 카카오 토큰을 Firebase 계정으로 바꿔 준다',
  ],
  [PROVIDERS.GOOGLE]: [
    'Firebase 콘솔 → Authentication → 로그인 방법 → Google 사용 설정',
    'Google Cloud 콘솔에서 Android OAuth 클라이언트 만들기 (SHA-1 지문 필요)',
    '웹 클라이언트 ID 와 안드로이드 클라이언트 ID 를 SOCIAL_CONFIG 에 넣기',
  ],
  [PROVIDERS.NAVER]: [
    'developers.naver.com → 애플리케이션 등록',
    '[네이버 로그인] 사용 설정 → Android 패키지명 등록',
    'Client ID / Secret 을 SOCIAL_CONFIG 에 넣기',
    '서버 함수 배포 — 네이버 토큰을 Firebase 계정으로 바꿔 준다',
  ],
};

/** 새 APK 빌드가 필요한가 — 하나라도 켜면 필요하다(네이티브 모듈이 들어가므로) */
export const needsNativeRebuild = (config = SOCIAL_CONFIG) =>
  enabledProviders(config).length > 0;
