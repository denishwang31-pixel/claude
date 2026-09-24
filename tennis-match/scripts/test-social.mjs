/* 소셜 로그인 — 어느 버튼을 그릴 것인가.

   여기서 잡으려는 사고
     1. 키가 반쯤 들어온 채로 버튼이 그려지는 것. 누르면 아무 일도
        안 일어나고, 사용자는 앱이 고장 났다고 생각한다.
     2. iOS 에 카카오·네이버만 켜고 제출하는 것. 애플 심사 지침 4.8
        위반이라 반려된다 — 코드는 멀쩡한데 떨어진다.
   ============================================================ */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  PROVIDERS, PROVIDER_ORDER, PROVIDER_LABEL, PROVIDER_SHORT, PROVIDER_STYLE,
  REQUIREMENTS, SOCIAL_CONFIG,
  configFromExtra, unknownKeys, googleErrorText,
  GOOGLE_SCOPES, googleRedirectUri, browserCandidates, isNoBrowserError, KNOWN_BROWSERS,
  providerReady, enabledProviders, missingFor, googleClientMixup,
  appleGap, socialReadiness, needsNativeRebuild, SETUP,
} from '../src/lib/social.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m} — 기대 ${JSON.stringify(b)} / 실제 ${JSON.stringify(a)}`);

/* 키가 다 있는 설정 */
const FULL = {
  kakaoRestKey: 'k-rest', kakaoNativeKey: 'k-native',
  naverClientId: 'n-id', naverClientSecret: 'n-secret',
  googleWebClientId: 'g-web', googleAndroidClientId: 'g-and',
  appleServiceId: 'a-svc',
  tokenEndpoint: 'https://example.com/social',
};

console.log('[사전이 빠짐없이 맞물린다]');
const all = Object.values(PROVIDERS);
eq([...PROVIDER_ORDER].sort(), [...all].sort(), '순서 목록이 제공자 전체를 덮는다');
eq(PROVIDER_ORDER.length, new Set(PROVIDER_ORDER).size, '순서에 중복이 없다');
ok(PROVIDER_ORDER[0] === PROVIDERS.KAKAO, '카카오가 맨 위 — 국내 사용자 대부분이 갖고 있다');
ok(PROVIDER_ORDER[PROVIDER_ORDER.length - 1] === PROVIDERS.APPLE, '애플이 맨 아래');
all.forEach((p) => {
  ok(!!PROVIDER_LABEL[p], `${p}: 긴 이름이 있다`);
  ok(!!PROVIDER_SHORT[p], `${p}: 짧은 이름이 있다`);
  ok(!!PROVIDER_STYLE[p]?.bg, `${p}: 버튼 색이 있다`);
  ok(!!PROVIDER_STYLE[p]?.mark, `${p}: 버튼 표시가 있다`);
  ok(REQUIREMENTS[p]?.keys?.length > 0, `${p}: 필요한 키가 적혀 있다`);
  ok(REQUIREMENTS[p]?.platforms?.length > 0, `${p}: 그릴 OS 가 적혀 있다`);
  ok(SETUP[p]?.length > 0, `${p}: 받는 절차가 적혀 있다`);
});
/* ⚠️ 이 한 줄 때문에 며칠을 썼다. 안드로이드 OAuth 클라이언트는
   커스텀 URI 스킴이 기본으로 꺼져 있고, 꺼진 채로는 구글이
   `400 invalid_request — Custom URI scheme is not enabled for your
   Android client` 로 막는다. 그 실패는 구글 화면에서 끝나 앱으로
   돌아오지 않으므로 앱은 아무 말도 못 한다. 절차에서 빠지면 다음
   사람이 똑같이 막힌다. */
ok(SETUP[PROVIDERS.GOOGLE].some((s) => /커스텀 URI 스킴/.test(s)),
  '구글 절차에 커스텀 URI 스킴 켜는 단계가 남아 있다');

console.log('[기본 설정에서는 아무 버튼도 안 그린다]');
/* 눌러도 안 되는 버튼을 두는 것이 제일 나쁘다. 지금은 키가 없으므로
   하나도 그리면 안 된다. */
eq(enabledProviders(SOCIAL_CONFIG), [], '키가 비어 있으면 버튼이 없다');
eq(enabledProviders(SOCIAL_CONFIG, 'ios'), [], 'iOS 에서도 없다');
eq(enabledProviders(SOCIAL_CONFIG, 'android'), [], '안드로이드에서도 없다');
ok(!needsNativeRebuild(SOCIAL_CONFIG), '켠 것이 없으면 새 빌드도 필요 없다');
ok(appleGap(SOCIAL_CONFIG) === null, '소셜을 아예 안 쓰면 애플 의무도 없다');

console.log('[키가 반쯤 들어온 것은 준비된 것이 아니다]');
ok(!providerReady(PROVIDERS.KAKAO, { ...FULL, kakaoNativeKey: '' }),
  '카카오: 네이티브 키가 없으면 안 그린다');
ok(!providerReady(PROVIDERS.KAKAO, { ...FULL, kakaoRestKey: '   ' }),
  '카카오: 공백만 있는 키는 없는 것으로 본다');
ok(!providerReady(PROVIDERS.NAVER, { ...FULL, naverClientSecret: '' }),
  '네이버: 시크릿이 없으면 안 그린다');
ok(!providerReady(PROVIDERS.GOOGLE, { ...FULL, googleAndroidClientId: '' }),
  '구글: 안드로이드 클라이언트 ID 가 없으면 안 그린다');

console.log('[서버가 필요한 제공자는 서버 주소까지 있어야 한다]');
/* 카카오·네이버는 Firebase 가 모르는 제공자다. 토큰을 바꿔 줄 서버가
   없으면 로그인 창까지는 떠도 마지막에 앉은자리에서 실패한다 —
   사용자 입장에서는 제일 짜증나는 실패다. */
const noServer = { ...FULL, tokenEndpoint: '' };
ok(!providerReady(PROVIDERS.KAKAO, noServer), '카카오: 서버 주소가 없으면 안 그린다');
ok(!providerReady(PROVIDERS.NAVER, noServer), '네이버: 서버 주소가 없으면 안 그린다');
ok(providerReady(PROVIDERS.GOOGLE, noServer), '구글: 서버가 필요 없다 — 그대로 그린다');
ok(providerReady(PROVIDERS.APPLE, noServer, 'ios'), '애플: 서버가 필요 없다');
eq(enabledProviders(noServer, 'android'), [PROVIDERS.GOOGLE],
  '서버가 없으면 안드로이드에는 구글만 남는다');
eq(missingFor(PROVIDERS.KAKAO, noServer), ['tokenEndpoint'],
  '무엇이 없는지 이름으로 알려 준다');

console.log('[애플은 iOS 에서만 그린다]');
ok(providerReady(PROVIDERS.APPLE, FULL, 'ios'), 'iOS: 그린다');
ok(!providerReady(PROVIDERS.APPLE, FULL, 'android'),
  '안드로이드: 안 그린다 — 의무도 없고 쓰는 사람도 없다');
ok(providerReady(PROVIDERS.APPLE, FULL), 'OS 를 안 주면 키만 보고 판단한다(설정 점검용)');
ok(!enabledProviders(FULL, 'android').includes(PROVIDERS.APPLE),
  '안드로이드 목록에 애플이 없다');
ok(enabledProviders(FULL, 'ios').includes(PROVIDERS.APPLE),
  'iOS 목록에는 애플이 있다');

console.log('[다 갖춰지면 순서대로 나온다]');
eq(enabledProviders(FULL, 'ios'),
  [PROVIDERS.KAKAO, PROVIDERS.NAVER, PROVIDERS.GOOGLE, PROVIDERS.APPLE],
  'iOS: 카카오 → 네이버 → 구글 → 애플');
eq(enabledProviders(FULL, 'android'),
  [PROVIDERS.KAKAO, PROVIDERS.NAVER, PROVIDERS.GOOGLE],
  '안드로이드: 애플만 빠진다');
ok(needsNativeRebuild(FULL), '하나라도 켜면 새 빌드가 필요하다');

console.log('[애플 심사 지침 4.8 — 제출 전에 코드가 먼저 말한다]');
/* 실제로 자주 당하는 반려다. 빌드를 다 만들어 제출한 뒤에야 알게 되면
   되돌리는 비용이 크다. */
const kakaoOnly = {
  kakaoRestKey: 'k', kakaoNativeKey: 'k2',
  tokenEndpoint: 'https://example.com/social',
};
const gap = appleGap(kakaoOnly);
ok(gap !== null, '카카오만 켜면 경고가 나온다');
ok(gap?.missing === PROVIDERS.APPLE, '빠진 것이 애플이라고 짚어 준다');
eq(gap?.others, [PROVIDERS.KAKAO], '무엇 때문에 의무가 생겼는지 알려 준다');
ok(/4\.8/.test(gap?.message || ''), '지침 번호를 문구에 담는다 — 찾아보기 쉽게');
ok(/반려/.test(gap?.message || ''), '결과("반려")를 분명히 말한다');

ok(appleGap(FULL) === null, '애플까지 켜면 경고가 사라진다');
ok(appleGap({ googleWebClientId: 'g', googleAndroidClientId: 'g2' }) !== null,
  '구글만 켜도 애플 의무는 생긴다 — 제3자 로그인이면 종류를 가리지 않는다');

/* ⚠️ 이게 이 검사의 핵심이다. 안드로이드 전용 키만 있는 상태에서는
   iOS 에 아무 소셜도 안 뜨므로 애플 의무가 없다. 그런데 appleGap 이
   OS 를 안 보고 판단하면 "고칠 것이 없는데 고치라"고 말하게 된다.
   경고가 잘못 뜨면 사람은 곧 경고 전체를 무시한다. */
const androidOnlySocial = {
  kakaoRestKey: 'k', kakaoNativeKey: 'k2',
  tokenEndpoint: 'https://example.com/social',
};
ok(appleGap(androidOnlySocial) !== null,
  '카카오는 iOS 에서도 뜨므로 의무가 맞다');

console.log('[한눈에 보는 상태]');
const r = socialReadiness(SOCIAL_CONFIG);
eq(r.readyCount, 0, '지금은 준비된 것이 0개');
eq(r.total, 4, '전체 4개');
eq(r.rows.length, 4, '줄이 4개');
ok(r.rows.every((x) => x.missing.length > 0), '전부 뭔가 빠져 있다고 표시된다');
ok(r.rows.find((x) => x.provider === PROVIDERS.KAKAO).needsServer === true,
  '카카오는 서버가 필요하다고 표시된다');
ok(r.rows.find((x) => x.provider === PROVIDERS.GOOGLE).needsServer === false,
  '구글은 서버가 필요 없다고 표시된다');

const rFull = socialReadiness(FULL);
eq(rFull.readyCount, 4, '다 채우면 4개 준비됨');
ok(rFull.appleGap === null, '다 채우면 경고 없음');
ok(rFull.needsRebuild === true, '다 채우면 새 빌드 필요');

console.log('[키는 저장소에 없어야 한다]');
/* 값을 코드에 적어 두고 잊는 사고를 막는다. 한 번 새어 나간 키는
   발급처에서 지우고 다시 받는 것 말고는 방법이 없다. */
Object.entries(SOCIAL_CONFIG).forEach(([k, v]) => {
  ok(v === '', `SOCIAL_CONFIG.${k} 가 비어 있다 — 실제 키는 app.json/EAS 시크릿에서 넣는다`);
});

console.log('[빌드가 넘겨준 값을 읽는다]');
/* 키는 GitHub Secrets → 빌드 → app.config.js 의 extra.social → 앱,
   이 순서로 흘러온다. 중간에 하나라도 어긋나면 "키를 넣었는데 버튼이
   안 나온다"가 되는데, 그때 원인을 찾기가 아주 어렵다. */
eq(configFromExtra(undefined), SOCIAL_CONFIG, 'extra 가 없으면 기본값(전부 빈 값)');
eq(configFromExtra(null), SOCIAL_CONFIG, 'null 이어도 터지지 않는다');
eq(configFromExtra('문자열'), SOCIAL_CONFIG, '엉뚱한 타입이어도 터지지 않는다');
eq(configFromExtra({}), SOCIAL_CONFIG, '빈 객체면 기본값');

const fromBuild = configFromExtra({
  googleWebClientId: 'web-1', googleAndroidClientId: '  and-1  ',
});
eq(fromBuild.googleWebClientId, 'web-1', '넣은 값이 들어온다');
eq(fromBuild.googleAndroidClientId, 'and-1', '앞뒤 공백은 걷어낸다');
eq(fromBuild.kakaoRestKey, '', '안 넣은 것은 빈 값 그대로');
eq(enabledProviders(fromBuild, 'android'), [PROVIDERS.GOOGLE],
  '구글 키만 넣으면 구글 버튼만 나온다');

/* 빈 문자열·공백만 있는 값은 "안 넣은 것"으로 본다. 환경변수가 설정은
   됐는데 값이 비어 있는 경우가 흔하다 — 그걸 넣은 것으로 치면 버튼이
   나오고 눌러도 안 된다. */
eq(configFromExtra({ googleWebClientId: '' }).googleWebClientId, '',
  '빈 문자열은 안 넣은 것으로 본다');
eq(configFromExtra({ googleWebClientId: '   ' }).googleWebClientId, '',
  '공백만 있어도 안 넣은 것으로 본다');
eq(configFromExtra({ googleWebClientId: 12345 }).googleWebClientId, '',
  '문자열이 아니면 무시한다');

eq(unknownKeys({ googleWebClientId: 'a', googleWebClientID: 'b', oops: 'c' }),
  ['googleWebClientID', 'oops'],
  '모르는 이름을 짚어 준다 — 대소문자 오타가 제일 흔하다');
eq(unknownKeys({}), [], '모르는 이름이 없으면 빈 목록');
eq(configFromExtra({ googleWebClientID: 'b' }).googleWebClientId, '',
  '⚠️ 대소문자가 다른 이름은 안 먹는다 (그래서 unknownKeys 가 필요하다)');

console.log('[app.config.js 가 같은 이름을 쓴다]');
/* ⚠️ 이 검사가 이 파일에서 제일 값어치 있다.
   app.config.js 에서 이름을 하나 잘못 적으면 키가 조용히 버려지고,
   버튼이 안 나오는 것 말고는 아무 증상이 없다. 빌드도 성공하고
   오류도 없다. 사람이 찾기 거의 불가능한 종류라 검사로 막는다. */
const cfgSrc = readFileSync(resolve(ROOT, 'app.config.js'), 'utf8');
const socialBlock = cfgSrc.slice(cfgSrc.indexOf('social: {'));
Object.keys(SOCIAL_CONFIG).forEach((k) => {
  ok(new RegExp(`\\b${k}:`).test(socialBlock),
    `app.config.js 가 ${k} 를 넘긴다`);
});
/* 반대 방향도 본다 — app.config.js 에만 있고 social.js 에 없는 이름 */
const inCfg = [...socialBlock.matchAll(/^\s{6}([A-Za-z][A-Za-z0-9]*):\s*env\(/gm)]
  .map((m) => m[1]);
ok(inCfg.length > 0, `app.config.js 에서 이름을 ${inCfg.length}개 읽었다`);
inCfg.forEach((k) => {
  ok(k in SOCIAL_CONFIG,
    `app.config.js 의 ${k} 는 SOCIAL_CONFIG 에도 있어야 한다`);
});

console.log('[구글에게 돌려줄 주소를 만든다]');
/* ⚠️ 여기서 한 번 크게 틀렸다.
   예전 규칙(클라이언트 ID 를 거꾸로 뒤집은 주소)으로 만들었더니 구글이
   "액세스 차단 — 요청이 잘못되었습니다"로 거부했다. 화면에 우리 앱
   이름조차 안 나와서 원인을 짐작하기 어려웠다.

   지금 규칙은 패키지명이다. 근거는 추측이 아니라 라이브러리 소스다 —
   expo-auth-session 의 Google 제공자가 정확히 이 형태를 만든다. */
eq(googleRedirectUri('com.donghyun.tennismatch'),
  'com.donghyun.tennismatch:/oauthredirect', '패키지명으로 만든다');
eq(googleRedirectUri('  com.donghyun.tennismatch  '),
  'com.donghyun.tennismatch:/oauthredirect', '앞뒤 공백은 걷어낸다');
eq(googleRedirectUri(''), '', '패키지명이 없으면 빈 문자열');
eq(googleRedirectUri(null), '', 'null 이어도 터지지 않는다');
eq(googleRedirectUri(undefined), '', 'undefined 여도 터지지 않는다');

/* ⚠️ 뒤집은 클라이언트 ID 는 이제 쓰지 않는다. 실수로 되살아나는 것을
   막는다 — 한 번 이것 때문에 빌드를 두 번 태웠다. */
ok(!googleRedirectUri('123-abc.apps.googleusercontent.com')
  .startsWith('com.googleusercontent.apps.'),
  '뒤집은 클라이언트 ID 형태를 만들지 않는다');

console.log('[앱이 이 주소를 받을 수 있어야 한다]');
/* ⚠️ 주소를 맞게 만들어도 앱이 그 scheme 을 등록하지 않으면, 로그인 창은
   떴다가 돌아오지 못한다. 사용자에게는 "로그인했는데 앱이 그대로"로
   보이고, 어디가 문제인지 알 길이 없다. 그래서 app.json 과 맞물리는지
   여기서 본다. */
const appCfg = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8')).expo;
const pkg = appCfg?.android?.package;
ok(!!pkg, `app.json 에 패키지명이 있다 (${pkg})`);
const schemes = Array.isArray(appCfg.scheme) ? appCfg.scheme : [appCfg.scheme];
ok(schemes.includes(pkg),
  `scheme 에 패키지명이 들어 있다 — 없으면 로그인 창이 돌아오지 못한다 (${JSON.stringify(schemes)})`);
ok(schemes.includes('tennismatch'),
  '원래 쓰던 scheme 도 그대로 있다 — 초대 링크가 이것을 쓴다');

console.log('[구글에 요청하는 권한 범위]');
ok(GOOGLE_SCOPES.includes('openid'), 'openid 가 들어 있다');
ok(GOOGLE_SCOPES.some((x) => x.includes('userinfo.email')), '이메일 범위가 들어 있다');
ok(GOOGLE_SCOPES.some((x) => x.includes('userinfo.profile')), '프로필 범위가 들어 있다');

console.log('[앱이 뜨는 길에 네이티브를 맨 위에서 부르지 않는다]');
/* ⚠️⚠️ 이 검사가 이 파일에서 제일 중요하다.
   expo-router 는 앱이 뜰 때 화면 모듈을 평가한다. 로그인 화면이 타고
   들어오는 파일 중 하나라도 맨 위에서 네이티브 모듈을 부르다 실패하면
   앱이 시작도 못 하고 닫힌다 — 오류 화면조차 못 띄운다.

   실제로 한 번 그렇게 됐다. socialSignIn.js 가 expo-auth-session 을
   맨 위에서 불러서, 앱을 켜면 바로 꺼졌다. 기기에 로그를 볼 방법이
   없으면 원인을 찾을 길이 없는 종류의 실패다.

   그래서 네이티브는 버튼을 눌렀을 때 await import() 로 부른다.
   누군가 편하다고 맨 위로 옮기면 여기서 막힌다. */
const NATIVE_ONLY = [
  'expo-auth-session', 'expo-web-browser', 'expo-crypto',
  'expo-apple-authentication', 'expo-application',
  /* 로그인 화면이 "업데이트 확인"에서 쓴다. 옛 APK 에는 이 모듈이
     없을 수 있으므로 맨 위에서 부르면 그 기기에서 앱이 안 뜬다. */
  'expo-updates',
];
const START_PATH = [
  'app/login.jsx',
  'src/lib/social.js',
  'src/lib/socialConfig.js',
  'src/lib/socialSignIn.js',
  'src/components/SocialButtons.jsx',
];
START_PATH.forEach((rel) => {
  const src = readFileSync(resolve(ROOT, rel), 'utf8');
  NATIVE_ONLY.forEach((mod) => {
    /* ⚠️ `import(` 는 미룬 호출이라 걸리면 안 된다. 처음에 이걸 구분하지
       않아서, 제대로 고친 코드를 검사가 잘못 잡았다.
       정적 import 만 본다 — import 뒤에 괄호가 오면 동적이다. */
    const topLevel = new RegExp(`^\\s*import(?!\\s*\\()[^\\n]*['"]${mod}['"]`, 'm');
    ok(!topLevel.test(src),
      `${rel} 가 ${mod} 를 맨 위에서 부르지 않는다`);
  });
});
/* 반대로, 실제로 미뤄서 부르고 있는지도 본다. 아무도 안 부르면
   위 검사는 통과하지만 기능이 없는 것이다. */
ok(readFileSync(resolve(ROOT, 'src/lib/socialSignIn.js'), 'utf8')
  .includes("import('expo-auth-session')"),
  'socialSignIn.js 는 누를 때 expo-auth-session 을 불러온다');

console.log('[app.json 을 지우지 않았다]');
/* app.config.js 가 app.json 을 대체한 것이 아니라 얹은 것이다.
   설정의 출처는 여전히 app.json 이어야 한다 — 둘로 갈라지면
   어느 쪽이 이기는지 헷갈리고, 빌드해 보기 전에는 모른다. */
const appJson = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8'));
ok(!!appJson?.expo?.slug, 'app.json 이 그대로 있다');
ok(/\.\.\.config/.test(cfgSrc), 'app.config.js 가 app.json 설정을 그대로 펼친다');
ok(/\.\.\.config\.extra/.test(cfgSrc), 'extra 도 덮어쓰지 않고 이어 붙인다');

console.log('[웹 클라이언트 ID 를 안드로이드 자리에 넣은 것을 잡는다]');
/* ⚠️ 실제로 여기서 막혔다. 구글이 `400 오류: invalid_request` 로 거부하는데,
   그 실패는 구글 서버 화면에서 끝나고 앱으로 돌아오지 않는다. 앱은 아무
   말도 못 한다. 두 ID 가 생긴 모양이 같아서 콘솔에서도 눈으로 구별이
   안 되고, 시크릿에 넣고 나면 다시 읽어 볼 수도 없다.

   두 값이 같다면 둘 중 하나는 반드시 틀렸다. 키를 보지 않고도 확실히
   알 수 있는 유일한 자리라, 창을 띄우기 전에 잡는다. */
const WEB = '738996873154-rgqd.apps.googleusercontent.com';
const AND = '738996873154-7e8s.apps.googleusercontent.com';
ok(googleClientMixup({ googleWebClientId: WEB, googleAndroidClientId: WEB }) === true,
  '같은 값이면 잡는다');
ok(googleClientMixup({ googleWebClientId: WEB, googleAndroidClientId: AND }) === false,
  '제대로 넣었으면 통과시킨다');
ok(googleClientMixup({ googleWebClientId: ` ${WEB} `, googleAndroidClientId: WEB }) === true,
  '앞뒤 공백이 붙어 있어도 같은 값으로 본다 — 붙여넣기에서 흔하다');
/* 아직 아무것도 안 넣은 상태를 "잘못 넣었다"고 하면 안 된다.
   그러면 구글을 안 쓰는 빌드에서도 경고가 뜬다. */
ok(googleClientMixup({ googleWebClientId: '', googleAndroidClientId: '' }) === false,
  '둘 다 비어 있으면 경고하지 않는다');
ok(googleClientMixup({ googleWebClientId: WEB, googleAndroidClientId: '' }) === false,
  '한쪽만 있으면 경고하지 않는다');
ok(googleClientMixup({}) === false, '설정이 없어도 죽지 않는다');
/* 창을 띄우기 전에 막아야 뜻이 있다. 띄운 뒤에는 구글 화면에서 끝난다. */
const signInEarly = readFileSync(resolve(ROOT, 'src/lib/socialSignIn.js'), 'utf8');
ok(signInEarly.indexOf('googleClientMixup') < signInEarly.indexOf('promptAsync'),
  '로그인 창을 띄우기 전에 검사한다');

console.log('[실패 문구마다 단계 번호가 붙어 있다]');
/* ⚠️ 구글 로그인은 이 개발 환경에서 돌려 볼 수 없다. 기기에서 실패하면
   화면에 뜬 한 줄이 유일한 단서다. 그런데 "구글 로그인에 실패했습니다"
   같은 문구가 여러 자리에서 똑같이 나오면, 그 한 줄을 받아도 어디서
   멈췄는지 알 수 없다 — 고칠 곳이 구글 클라우드인지 Firebase 인지,
   키 문제인지 주소 문제인지 갈라지지 않는다.

   실제로 그래서 한 바퀴를 헛돌았다. 그래서 자리마다 [G숫자] 를 붙인다.
   사용자가 "G7 나온다" 한 마디만 해 주면 볼 곳이 하나로 좁혀진다.
   번호가 겹치면 그 뜻이 사라지므로 겹침도 같이 막는다. */
const signInSrc = readFileSync(resolve(ROOT, 'src/lib/socialSignIn.js'), 'utf8');
/* error 가 빈 문자열인 자리는 "사용자가 창을 닫았다"는 뜻이라 제외한다. */
const failLines = signInSrc
  .split('\n')
  .filter((ln) => /error:\s*[`'"]/.test(ln) && !/error:\s*['"]['"]/.test(ln));
ok(failLines.length >= 8, `실패 문구를 여러 자리에서 낸다 (${failLines.length}곳)`);
failLines.forEach((ln) => {
  ok(/\[G\d+\]/.test(ln), `실패 문구에 단계 번호가 있다 — ${ln.trim().slice(0, 44)}…`);
});
const stages = (signInSrc.match(/\[G\d+\]/g) || []);
ok(stages.length === new Set(stages).size,
  `단계 번호가 겹치지 않는다 (${stages.join(' ')})`);


console.log('[구글 로그인 창을 열 브라우저 — 「연결 앱」 선택창 막기]');
{
  /* 안드로이드 11+ 에서 흔한 모양: 목록이 비어 온다 → 그래도 크롬·삼성으로 시도 */
  const empty = browserCandidates({ browserPackages: [], servicePackages: [], preferredBrowserPackage: null, defaultBrowserPackage: null });
  eq(empty.slice(0, 2), ['com.android.chrome', 'com.sec.android.app.sbrowser'], '목록이 비어도 크롬 → 삼성 인터넷 순으로 시도');
  eq(browserCandidates(null).slice(0, 2), ['com.android.chrome', 'com.sec.android.app.sbrowser'], 'expo 가 실패해도(null) 후보가 있다');
  ok(browserCandidates(undefined).length > 0, 'undefined 여도 비지 않는다');
  /* 사용자가 정한 브라우저가 먼저 */
  const pref = browserCandidates({ preferredBrowserPackage: 'com.naver.whale', defaultBrowserPackage: 'com.android.chrome', servicePackages: ['com.android.chrome', 'com.naver.whale'] });
  eq(pref[0], 'com.naver.whale', '선호 브라우저가 맨 앞');
  eq(pref.filter((p) => p === 'com.android.chrome').length, 1, '같은 이름은 한 번만');
  /* 'android' 는 선택창 자체 — 넣으면 선택창이 그대로 뜬다 */
  const withResolver = browserCandidates({ defaultBrowserPackage: 'android', servicePackages: ['org.mozilla.firefox'] });
  ok(!withResolver.includes('android'), "'android'(선택창)는 후보에서 뺀다");
  eq(withResolver[0], 'org.mozilla.firefox', '서비스 목록의 브라우저가 앞');
  /* 서비스 목록 중 아는 브라우저를 먼저 */
  const svc = browserCandidates({ servicePackages: ['com.example.unknown', 'com.sec.android.app.sbrowser'] });
  eq(svc[0], 'com.sec.android.app.sbrowser', '서비스 목록 중 아는 브라우저가 먼저');
  ok(svc.includes('com.example.unknown'), '모르는 서비스도 뒤에 남긴다');
  ok(!browserCandidates({}).some((p) => /gmail|google\.android\.gm/i.test(p)), '지메일은 절대 후보가 아니다');
  eq(KNOWN_BROWSERS[0], 'com.android.chrome', '크롬이 기본 후보 1순위');

  ok(isNoBrowserError(new Error('No matching browser activity found')), '"브라우저 없음"은 다음 후보로');
  ok(isNoBrowserError({ code: 'PREFERRED_PACKAGE_NOT_FOUND' }), '선호 패키지 없음도 다음 후보로');
  ok(!isNoBrowserError(new Error('network failed')), '다른 실패는 멈춘다');
  ok(!isNoBrowserError(null), 'null 은 브라우저 없음이 아니다');

  /* 여는 쪽이 후보를 끝까지 돌고, 마지막엔 지정 없이 연다 */
  const src = readFileSync(resolve(ROOT, 'src/lib/socialSignIn.js'), 'utf8');
  ok(/browserCandidates\(/.test(src) && /isNoBrowserError\(/.test(src), '로그인은 후보 목록과 "없음" 판정을 쓴다');
  ok(/\[\.\.\.candidates, undefined\]/.test(src), '후보를 다 써도 못 열면 지정 없이 한 번 더');

  /* 매니페스트 <queries> — 다음 빌드부터 목록이 제대로 온다 */
  const require = createRequire(import.meta.url);
  let addQuery = null;
  try { ({ addQuery } = require('../plugins/withBrowserQueries.js')); } catch (e) { addQuery = null; }
  ok(typeof addQuery === 'function', '매니페스트 플러그인이 있다');
  if (addQuery) {
    const m = addQuery({ manifest: { queries: [{ intent: [{ action: [{ $: { 'android:name': 'android.support.customtabs.action.CustomTabsService' } }] }] }] } });
    const intents = m.manifest.queries[0].intent;
    eq(intents.length, 2, '기존 커스텀 탭 항목은 두고 https 보기를 더한다');
    const again = addQuery(m);
    eq(again.manifest.queries[0].intent.length, 2, '두 번 돌려도 한 번만 들어간다');
    ok(addQuery({ manifest: {} }).manifest.queries[0].intent.length === 1, 'queries 가 없어도 만든다');
  }
  const appJson = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8'));
  ok(appJson.expo.plugins.includes('./plugins/withBrowserQueries'), 'app.json 에 플러그인이 걸려 있다');
}

console.log(`\n소셜 로그인 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
