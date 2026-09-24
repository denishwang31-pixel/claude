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

   ⚠️ 이 파일은 네이티브 모듈을 절대 불러오지 않는다
     두 가지 이유다.
       1) node 로 도는 검사(scripts/test-social.mjs)가 이 판단을 전부
          돌려 볼 수 있어야 한다. 네이티브를 한 줄이라도 끌어들이면
          그 검사가 통째로 못 돈다.
       2) 더 중요한 것 — expo-router 는 앱이 뜰 때 화면 모듈을 평가한다.
          로그인 화면이 타고 들어오는 파일 중 하나라도 맨 위에서
          네이티브를 부르다 실패하면 **앱이 시작도 못 하고 닫힌다**.
          오류 화면조차 못 띄운다. 실제로 한 번 그렇게 됐다.

     그래서 창을 띄우는 일은 src/lib/socialSignIn.js 가 맡고, 그쪽도
     맨 위가 아니라 버튼을 눌렀을 때 await import() 로 불러온다.

   ⚠️ 네이티브가 들어가는 변경은 OTA 로 못 나간다
     APK·IPA 를 새로 구워야 하고, 그때 app.json 의 version 을 반드시
     올린다. runtimeVersion 정책이 appVersion 이라, 버전을 올려야
     옛 앱이 새 JS 를 받아 죽는 일을 막을 수 있다.

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

/**
 * 안드로이드 자리에 웹 클라이언트 ID 를 넣었는가.
 *
 * ⚠️ 왜 이 검사가 따로 필요한가
 *    구글의 웹 클라이언트 ID 와 안드로이드 클라이언트 ID 는 생긴 모양이
 *    완전히 같다 — `숫자-문자.apps.googleusercontent.com`. 눈으로는
 *    구별할 수 없고, 시크릿에 한 번 넣으면 다시 읽어 볼 수도 없다.
 *
 *    그런데 안드로이드 자리에 웹 것을 넣으면 구글이 로그인 자체를
 *    막는다 — `400 오류: invalid_request`. 이 실패는 구글 서버에서
 *    일어나므로 앱으로 돌아오지 않고, 따라서 앱이 이유를 말해 줄
 *    기회조차 없다. 사용자는 구글 화면에서 막힌 채 끝난다.
 *
 *    Firebase 콘솔이 "웹 클라이언트 ID" 를 눈에 잘 띄게 보여 주기
 *    때문에 이 실수는 아주 흔하다.
 *
 *    두 값이 같으면 둘 중 하나는 반드시 틀린 것이다. 그건 키를 보지
 *    않고도 확실히 알 수 있다. 미리 잡아서 어디를 고칠지 말해 준다.
 */
export function googleClientMixup(config = SOCIAL_CONFIG) {
  const web = String(config?.googleWebClientId || '').trim();
  const android = String(config?.googleAndroidClientId || '').trim();
  return !!web && !!android && web === android;
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

/* ---------------- 구글 주소·범위 ---------------- */

/**
 * 구글에 요청할 권한 범위.
 *
 * expo-auth-session 의 Google 제공자가 쓰는 것과 같은 값으로 맞춘다
 * (node_modules/expo-auth-session/build/providers/Google.js 의
 *  settings.minimumScopes). 'profile' 같은 줄임말도 대개 통하지만,
 * 라이브러리가 검증해 둔 형태를 그대로 쓰는 편이 안전하다.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * 로그인 창이 끝나고 앱으로 돌아올 주소.
 *
 * ⚠️ 여기서 한 번 크게 틀렸다.
 *    예전 규칙은 "클라이언트 ID 를 거꾸로 뒤집은" 주소
 *    (com.googleusercontent.apps.123-abc:/oauthredirect) 였고, 나도 그렇게
 *    만들었다. 구글은 그 요청을 "액세스 차단 — 요청이 잘못되었습니다"
 *    로 거부했다. 화면에는 우리 앱 이름조차 안 나와서 원인을 짐작하기
 *    어려웠다.
 *
 *    지금 규칙은 **패키지명**이다.
 *      com.donghyun.tennismatch:/oauthredirect
 *    안드로이드 클라이언트는 패키지명 + SHA-1 로 신원을 확인하므로,
 *    되돌아올 주소도 패키지명을 쓴다.
 *
 *    근거는 추측이 아니라 라이브러리 소스다 —
 *    expo-auth-session 의 Google 제공자가 정확히 이 형태를 만들고,
 *    뒤집은 ID 를 만들던 줄은 주석으로 남아 있다.
 *
 * ⚠️ 이 주소를 앱이 받을 수 있어야 한다. app.json 의 scheme 에 패키지명을
 *    함께 넣어 둔 이유가 이것이다. 빼면 창은 떴다가 돌아오지 못한다.
 */
export function googleRedirectUri(applicationId) {
  const id = String(applicationId || '').trim();
  return id ? `${id}:/oauthredirect` : '';
}

/* ---------------- 로그인 창을 열 브라우저 ---------------- */
/* 지정 없이 열면 안드로이드가 「연결 앱」 선택창을 띄운다. 구글 로그인
   주소(accounts.google.com)는 지메일·구글 앱도 받겠다고 손을 들기 때문이다.
   거기서 지메일을 고르면 메일 쓰기 화면이 나오고 로그인이 날아간다
   — 앱 주인이 실제로 겪었다.

   expo-web-browser 가 알려 주는 목록은 안드로이드 11 부터 비어 오기
   쉽다(다른 앱 목록을 보려면 매니페스트에 적어야 한다). 그래서
     1. 알려 준 것(선호 → 기본 → 커스텀 탭 서비스 → 브라우저 목록)
     2. 그래도 비면 널리 깔린 브라우저 이름
   순서로 후보를 만들고, 여는 쪽이 하나씩 시도한다. 없는 패키지는
   "No matching browser activity" 로 바로 실패하니 다음으로 넘어가면 된다.
   'android' 는 선택창 자체의 패키지라 절대 넣지 않는다. */
export const KNOWN_BROWSERS = [
  'com.android.chrome',
  'com.sec.android.app.sbrowser',
  'com.chrome.beta',
  'com.microsoft.emmx',
  'org.mozilla.firefox',
  'com.brave.browser',
  'com.naver.whale',
];

/**
 * @param {{preferredBrowserPackage?, defaultBrowserPackage?, servicePackages?, browserPackages?}|null} found
 * @returns {string[]} 시도할 순서. 비지 않는다.
 */
export function browserCandidates(found) {
  const f = found || {};
  const services = Array.isArray(f.servicePackages) ? f.servicePackages : [];
  const browsers = Array.isArray(f.browserPackages) ? f.browserPackages : [];
  /* 서비스 목록 중 아는 브라우저를 앞으로 — 커스텀 탭을 제대로 지원하는 쪽 */
  const knownFirst = [
    ...KNOWN_BROWSERS.filter((p) => services.includes(p)),
    ...services,
  ];
  const raw = [
    f.preferredBrowserPackage, f.defaultBrowserPackage,
    ...knownFirst, ...browsers, ...KNOWN_BROWSERS.slice(0, 2),
  ];
  const out = [];
  raw.forEach((p) => {
    const s = String(p || '').trim();
    if (!s || s === 'android' || out.includes(s)) return;
    out.push(s);
  });
  return out;
}

/** 이 오류는 "그 브라우저가 없다" — 다음 후보로 넘어가도 되는 실패 */
export function isNoBrowserError(e) {
  const t = `${e?.code || ''} ${e?.message || e || ''}`;
  return /no matching browser|NoMatchingActivity|ActivityNotFound|PREFERRED_PACKAGE_NOT_FOUND/i.test(t);
}

/* ---------------- 로그인 결과 읽기 ---------------- */
/* 창을 띄우는 것은 socialSignIn.js 가 하지만, "받은 것을 어떻게 읽나"는
   판단이라 여기 둔다. 저쪽은 네이티브 모듈을 불러오므로 node 로 도는
   검사가 못 들어간다 — 판단이 그 안에 갇히면 영영 검사를 못 한다. */

/**
 * 실패 이유를 사람 말로. 코드가 그대로 보이면 아무도 못 고친다.
 * 빈 문자열은 "오류로 볼 것 없음"(사용자가 창을 닫은 경우)이다.
 */
export function googleErrorText(e) {
  const code = String(e?.code || '');
  const msg = String(e?.message || e || '');
  if (code.includes('account-exists-with-different-credential')) {
    return '같은 이메일로 이미 가입되어 있습니다. 그 방법으로 로그인한 뒤 계정을 연결해 주세요.';
  }
  if (code.includes('invalid-credential')) {
    /* 이 문구가 중요하다. 구글 로그인이 실패하는 가장 흔한 원인이
       SHA-1 불일치인데, Firebase 는 그냥 "자격 증명이 잘못됐다"고만
       한다. 어디를 봐야 하는지 짚어 주지 않으면 한참 헤맨다. */
    return '구글 인증이 거부되었습니다. 앱 서명 키(SHA-1)가 구글 클라우드에 등록된 값과 같은지 확인해 주세요.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'Firebase 콘솔에서 구글 로그인이 꺼져 있습니다.';
  }
  if (code.includes('network')) return '네트워크 연결을 확인해 주세요.';
  if (/popup|cancel/i.test(msg)) return '';          // 사용자가 닫은 것 — 오류가 아니다
  return '구글 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

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
    'OAuth 동의 화면(브랜딩)에 앱 이름·로고를 넣을 것. 안 넣으면 로그인 화면에 앱 이름 대신 "project-숫자로 이동"이라고 뜬다 — 처음 보는 사람은 이걸 피싱으로 읽고 그 자리에서 그만둔다',
    'Google Cloud 콘솔 → 사용자 인증 정보 → Android OAuth 클라이언트 (SHA-1 지문 필요)',
    'SHA-1 은 EAS 빌드가 쓰는 키의 것이어야 한다 — 로컬 디버그 키가 아니다',
    '⚠️ 그 클라이언트를 열어 「고급 설정」 → 커스텀 URI 스킴 사용 설정을 켤 것. 새로 만든 클라이언트는 꺼져 있고, 꺼진 채로는 구글이 400 invalid_request 로 막는다 ("Custom URI scheme is not enabled for your Android client")',
    '웹 클라이언트 ID · 안드로이드 클라이언트 ID 를 SOCIAL_CONFIG 에 넣기',
    '⚠️ 두 값은 생긴 모양이 같다. 안드로이드 자리에 웹 것을 넣으면 구글이 400 invalid_request 로 막는다 — 유형 열이 Android 인 줄을 쓸 것',
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
  GOOGLE_SCOPES, googleRedirectUri, googleErrorText,
  KNOWN_BROWSERS, browserCandidates, isNoBrowserError,
  providerReady, enabledProviders, missingFor, googleClientMixup,
  appleGap, socialReadiness, needsNativeRebuild, SETUP,
};
