/* ============================================================
   소셜 로그인 — 카카오 · 네이버 · 구글 · 애플

   이 파일이 하는 일
     "어느 버튼을 그릴 것인가"만 정한다. 실제로 로그인 창을 띄우는
     코드는 여기 없다 — 아래 [왜 아직 없나] 참고.

   ⚠️ 애플이 목록에 들어간 이유 (이게 제일 중요하다)
     애플 심사 지침 4.8 — iOS 앱이 카카오·구글 같은 제3자 로그인을
     제공하면 "애플로 로그인"도 **반드시** 함께 제공해야 한다. 선택이
     아니다. 없으면 심사에서 떨어진다.

     이걸 모르고 카카오·네이버만 붙였다가 제출 단계에서 막히는 일이
     흔하다. 그때는 이미 빌드를 다 만들어 둔 뒤라 되돌리기가 비싸다.
     그래서 appleGap() 으로 "지금 제출하면 떨어진다"를 코드가 미리
     말하게 해 두었다.

     안드로이드에는 이 의무가 없다. 그래서 애플 버튼은 iOS 에서만
     그린다 — 안드로이드에서 애플 로그인은 웹 흐름이라 어색하기만 하고
     쓰는 사람도 없다.

   왜 아직 로그인 창을 띄우지 않나
     1) 키가 없다. 카카오·네이버·구글·애플 각 개발자센터에 앱을 등록해야
        나오는 값이라, 코드로 만들어 낼 수 있는 것이 아니다.
     2) 네이티브 모듈이 필요하다. 로그인 창은 브라우저를 띄우므로
        expo-auth-session / expo-apple-authentication 이 들어간다.
        JS 만 바뀌는 것이 아니라서 OTA(eas update)로는 안 나가고
        APK·IPA 를 새로 구워야 한다.

     키가 없는 채로 흐름 코드를 먼저 넣지 않는 이유는, 돌려 볼 수 없는
     코드가 "된다"는 얼굴로 저장소에 남기 때문이다. 키가 오면 그때
     src/lib/socialSignIn.js 를 만들고 이 파일의 결정만 가져다 쓴다.

   그래서 화면은 어떻게 하나
     준비된 제공자의 버튼만 그린다. 키가 없으면 그 버튼은 아예 안 그린다.
     눌러도 아무 일이 없는 버튼을 두면 사용자는 앱이 고장 났다고
     생각하고, 그 인상은 되돌리기 어렵다.

     화면 코드는 enabledProviders() 만 본다. 키가 들어와 SOCIAL_CONFIG 가
     채워지면 버튼이 저절로 나타난다 — 화면은 손댈 필요가 없다.
   ============================================================ */

export const PROVIDERS = {
  KAKAO: 'kakao',
  NAVER: 'naver',
  GOOGLE: 'google',
  APPLE: 'apple',
};

/**
 * 버튼을 세우는 순서.
 *
 * 카카오가 맨 위인 이유는 국내 사용자 대부분이 카카오 계정을 이미
 * 갖고 있기 때문이다. 이 앱의 주 사용자층(40~60대 클럽 회원)에게는
 * 특히 그렇다. 애플은 맨 아래 — iOS 에서만 나오고, 의무라서 두는
 * 쪽에 가깝다.
 */
export const PROVIDER_ORDER = [
  PROVIDERS.KAKAO, PROVIDERS.NAVER, PROVIDERS.GOOGLE, PROVIDERS.APPLE,
];

export const PROVIDER_LABEL = {
  [PROVIDERS.KAKAO]: '카카오로 시작하기',
  [PROVIDERS.NAVER]: '네이버로 시작하기',
  [PROVIDERS.GOOGLE]: '구글로 시작하기',
  [PROVIDERS.APPLE]: 'Apple로 시작하기',
};

/** 좁은 자리(가로 배치)용 짧은 이름 */
export const PROVIDER_SHORT = {
  [PROVIDERS.KAKAO]: '카카오',
  [PROVIDERS.NAVER]: '네이버',
  [PROVIDERS.GOOGLE]: '구글',
  [PROVIDERS.APPLE]: 'Apple',
};

/**
 * 버튼 모양 — 각 서비스의 공식 색을 쓴다.
 *
 * 흉내 낸 색을 쓰면 오히려 가짜처럼 보인다. 그리고 각 사의 브랜드
 * 가이드가 "우리 색과 로고를 이렇게 쓰라"고 정해 둔 것이라, 심사에서
 * 지적받지 않으려면 맞춰 두는 편이 낫다.
 *
 * mark 는 버튼에 넣을 표시. 카카오·네이버는 아이콘 세트(Ionicons)에
 * 로고가 없어서 형태로 대신한다 — 카카오는 말풍선(원래 로고가 말풍선),
 * 네이버는 글자 N(로고 자체가 N 자다). 둘 다 색과 함께 놓이면 알아본다.
 */
export const PROVIDER_STYLE = {
  [PROVIDERS.KAKAO]: { bg: '#FEE500', fg: '#191600', mark: 'bubble' },
  [PROVIDERS.NAVER]: { bg: '#03C75A', fg: '#FFFFFF', mark: 'letterN' },
  [PROVIDERS.GOOGLE]: { bg: '#FFFFFF', fg: '#1B1F27', border: '#DADCE0', mark: 'google' },
  [PROVIDERS.APPLE]: { bg: '#000000', fg: '#FFFFFF', mark: 'apple' },
};

/**
 * 제공자별로 무엇이 있어야 동작하는가.
 *
 * needsServer 는 "Firebase 커스텀 토큰을 만들어 줄 서버 함수가 필요한가".
 *   구글·애플은 Firebase 가 기본 제공자로 지원하므로 서버가 필요 없다.
 *   카카오·네이버는 Firebase 가 모르는 제공자라서, 그쪽에서 받은 토큰을
 *   우리 서버가 확인하고 Firebase 계정으로 바꿔 줘야 한다.
 *   → 이 함수는 Cloud Functions 로 가고, 그래서 카카오·네이버를 켜려면
 *     서버 함수 배포 권한이 먼저 풀려 있어야 한다.
 *
 * platforms 는 그 버튼을 어느 OS 에서 그릴 것인가.
 */
export const REQUIREMENTS = {
  [PROVIDERS.KAKAO]: {
    keys: ['kakaoRestKey', 'kakaoNativeKey'],
    needsServer: true,
    platforms: ['ios', 'android'],
  },
  [PROVIDERS.NAVER]: {
    keys: ['naverClientId', 'naverClientSecret'],
    needsServer: true,
    platforms: ['ios', 'android'],
  },
  [PROVIDERS.GOOGLE]: {
    keys: ['googleWebClientId', 'googleAndroidClientId'],
    needsServer: false,
    platforms: ['ios', 'android'],
  },
  [PROVIDERS.APPLE]: {
    /* iOS 기기에서는 앱이 따로 키를 들고 있지 않는다. 애플 로그인은
       OS 가 처리하고, 앱은 결과만 Firebase 에 넘긴다. 다만 Firebase
       콘솔에 서비스 ID 를 등록해 둬야 그 결과를 받아 주므로, 그 값이
       채워졌는지를 "준비됨"의 기준으로 쓴다. */
    keys: ['appleServiceId'],
    needsServer: false,
    platforms: ['ios'],
  },
};

/**
 * 소셜 로그인 설정. 키가 들어오면 여기만 채우면 된다.
 *
 * ⚠️ 값을 이 파일에 직접 적지 말 것. app.json 의 extra 나 EAS 시크릿에서
 *    읽어 넣는다. 저장소는 공개될 수 있고, 키는 한 번 새어 나가면
 *    발급처에서 지우고 다시 받는 것 말고는 방법이 없다.
 *    (secret 이 붙은 값 — naverClientSecret — 은 특히 그렇다)
 */
export const SOCIAL_CONFIG = {
  kakaoRestKey: '',
  kakaoNativeKey: '',
  naverClientId: '',
  naverClientSecret: '',
  googleWebClientId: '',
  googleAndroidClientId: '',
  appleServiceId: '',
  /* 카카오·네이버 토큰을 Firebase 계정으로 바꿔 주는 서버 함수 주소.
     둘 중 하나라도 켜려면 이것이 먼저 있어야 한다. */
  tokenEndpoint: '',
};

/**
 * 빌드에 심어진 키를 읽어 설정을 만든다.
 *
 * 키는 저장소에 없다. GitHub Secrets → 빌드 workflow → app.config.js 의
 * extra.social → 여기로 흘러온다. 그래서 이 함수는 "그 흐름 끝에서 받은
 * 물건"을 정리하는 일만 한다.
 *
 * ⚠️ 이 파일은 순수하게 둔다 — expo-constants 를 여기서 import 하지
 *    않는다. 네이티브 모듈을 끌어들이면 node 로 도는 검사에서 못 부른다.
 *    실제로 Constants 를 읽는 것은 src/lib/socialConfig.js 한 곳뿐이고,
 *    그쪽이 읽은 값을 이 함수에 넘긴다.
 *
 * ⚠️ 모르는 이름은 버린다. extra 는 빌드 설정에서 오는 값이라 오타가
 *    조용히 섞여 들어오기 쉽다. 그대로 받아 두면 "키를 넣었는데 버튼이
 *    안 나온다"가 되고, 그때 오타를 찾기가 어렵다.
 */
export function configFromExtra(extra) {
  const out = { ...SOCIAL_CONFIG };
  const src = extra && typeof extra === 'object' ? extra : {};
  Object.keys(SOCIAL_CONFIG).forEach((k) => {
    const v = src[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  });
  return out;
}

/** extra 에 들어 있는 모르는 이름들 — 오타를 찾을 때 쓴다 */
export function unknownKeys(extra) {
  const src = extra && typeof extra === 'object' ? extra : {};
  const known = new Set(Object.keys(SOCIAL_CONFIG));
  return Object.keys(src).filter((k) => !known.has(k)).sort();
}

/* ---------------- 무엇을 그릴 것인가 ---------------- */

const filled = (v) => !!String(v ?? '').trim();

/** 그 제공자를 지금 쓸 수 있는가 */
export function providerReady(provider, config = SOCIAL_CONFIG, platform = null) {
  const req = REQUIREMENTS[provider];
  if (!req) return false;
  /* platform 을 안 주면 OS 를 따지지 않는다 — 설정 점검 화면처럼
     "키가 다 있는가"만 보고 싶은 자리가 있다. */
  if (platform && !req.platforms.includes(platform)) return false;
  if (!req.keys.every((k) => filled(config?.[k]))) return false;
  if (req.needsServer && !filled(config?.tokenEndpoint)) return false;
  return true;
}

/** 화면이 그릴 버튼 목록. 준비 안 된 것은 빠진다. 순서는 PROVIDER_ORDER. */
export const enabledProviders = (config = SOCIAL_CONFIG, platform = null) =>
  PROVIDER_ORDER.filter((p) => providerReady(p, config, platform));

/** 아직 뭐가 없는지 — 설정 화면과 PRE-LAUNCH 문서에 같은 값을 쓴다 */
export function missingFor(provider, config = SOCIAL_CONFIG) {
  const req = REQUIREMENTS[provider];
  if (!req) return [];
  const out = req.keys.filter((k) => !filled(config?.[k]));
  if (req.needsServer && !filled(config?.tokenEndpoint)) out.push('tokenEndpoint');
  return out;
}

/**
 * 애플 심사 지침 4.8 검사.
 *
 * "iOS 에서 다른 소셜 로그인은 켜 두고 애플만 빠진" 상태를 잡는다.
 * 그 상태로 제출하면 심사에서 떨어진다 — 기능이 잘못된 게 아니라
 * 규정이라서, 빌드를 다시 만들어야 한다.
 *
 * @returns null 이면 문제 없음. 아니면 {missing, others, message}
 */
export function appleGap(config = SOCIAL_CONFIG) {
  const others = PROVIDER_ORDER
    .filter((p) => p !== PROVIDERS.APPLE)
    .filter((p) => providerReady(p, config, 'ios'));
  if (!others.length) return null;                       // 소셜 자체를 안 쓴다
  if (providerReady(PROVIDERS.APPLE, config, 'ios')) return null;  // 이미 있다
  return {
    missing: PROVIDERS.APPLE,
    others,
    message:
      'iOS 에 소셜 로그인을 넣으면 [Apple로 시작하기]도 함께 있어야 합니다'
      + ' (애플 심사 지침 4.8). 지금 제출하면 반려됩니다.',
  };
}

/**
 * 지금 상태를 한 번에 — 앱 운영자 화면과 문서가 같은 값을 쓴다.
 */
export function socialReadiness(config = SOCIAL_CONFIG) {
  const rows = PROVIDER_ORDER.map((p) => ({
    provider: p,
    label: PROVIDER_SHORT[p],
    ready: providerReady(p, config),
    missing: missingFor(p, config),
    needsServer: REQUIREMENTS[p].needsServer,
    platforms: REQUIREMENTS[p].platforms,
  }));
  return {
    rows,
    readyCount: rows.filter((r) => r.ready).length,
    total: rows.length,
    appleGap: appleGap(config),
    needsRebuild: needsNativeRebuild(config),
  };
}

/** 새 빌드가 필요한가 — 하나라도 켜면 필요하다(네이티브 모듈이 들어가므로) */
export const needsNativeRebuild = (config = SOCIAL_CONFIG) =>
  PROVIDER_ORDER.some((p) => providerReady(p, config));

/* ---------------- 키 받는 절차 ---------------- */

/**
 * 화면(앱 운영자 전용)에도 그대로 보여 준다 — 문서를 따로 찾지 않아도 되게.
 * 순서대로 하면 된다. 한 단계라도 건너뛰면 마지막에 원인을 못 찾는다.
 */
export const SETUP = {
  [PROVIDERS.KAKAO]: [
    'developers.kakao.com → [내 애플리케이션] → 애플리케이션 추가',
    '[앱 설정 → 플랫폼] → Android 등록 (패키지명 + 키 해시)',
    '[제품 설정 → 카카오 로그인] 활성화 → Redirect URI 등록',
    '[동의항목] → 닉네임·이메일을 필수 동의로 (이메일은 별도 검수 신청)',
    'REST API 키 · 네이티브 앱 키를 SOCIAL_CONFIG 에 넣기',
    '서버 함수 배포 — 카카오 토큰을 Firebase 계정으로 바꿔 준다',
  ],
  [PROVIDERS.NAVER]: [
    'developers.naver.com → [애플리케이션 등록]',
    '사용 API 에서 [네이버 로그인] 선택 → 이메일·별명을 필수로',
    '[환경 추가] → Android 앱 패키지명 · 다운로드 URL 등록',
    'Client ID / Client Secret 을 SOCIAL_CONFIG 에 넣기',
    '서버 함수 배포 — 네이버 토큰을 Firebase 계정으로 바꿔 준다',
    '⚠️ 검수 전에는 개발자 본인 계정으로만 로그인된다. 공개 전 검수 신청',
  ],
  [PROVIDERS.GOOGLE]: [
    'Firebase 콘솔 → Authentication → 로그인 방법 → Google 사용 설정',
    'Google Cloud 콘솔 → 사용자 인증 정보 → Android OAuth 클라이언트 (SHA-1 지문 필요)',
    'SHA-1 은 EAS 빌드가 쓰는 키의 것이어야 한다 — 로컬 디버그 키가 아니다',
    '웹 클라이언트 ID · 안드로이드 클라이언트 ID 를 SOCIAL_CONFIG 에 넣기',
  ],
  [PROVIDERS.APPLE]: [
    'Apple Developer Program 가입 (연 $99) — 이것이 없으면 시작할 수 없다',
    'Certificates, Identifiers & Profiles → Identifiers → App ID 에 Sign In with Apple 켜기',
    'Services ID 만들기 → Firebase 의 콜백 주소 등록',
    'Keys → Sign in with Apple 용 키 만들기 (.p8 파일은 한 번만 받을 수 있다)',
    'Firebase 콘솔 → Authentication → Apple 사용 설정 → 서비스 ID · 팀 ID · 키 ID · .p8 넣기',
    'app.json 에 "usesAppleSignIn": true',
    'Services ID 를 SOCIAL_CONFIG.appleServiceId 에 넣기',
  ],
};

export default {
  PROVIDERS, PROVIDER_ORDER, PROVIDER_LABEL, PROVIDER_SHORT, PROVIDER_STYLE,
  REQUIREMENTS, SOCIAL_CONFIG,
  configFromExtra, unknownKeys,
  providerReady, enabledProviders, missingFor,
  appleGap, socialReadiness, needsNativeRebuild, SETUP,
};
