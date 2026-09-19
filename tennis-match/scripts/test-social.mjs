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
import {
  PROVIDERS, PROVIDER_ORDER, PROVIDER_LABEL, PROVIDER_SHORT, PROVIDER_STYLE,
  REQUIREMENTS, SOCIAL_CONFIG,
  configFromExtra, unknownKeys, googleErrorText,
  reversedClientId, googleRedirectUri,
  providerReady, enabledProviders, missingFor,
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
/* ⚠️ 구글은 안드로이드 클라이언트에 대해 "클라이언트 ID 를 거꾸로 뒤집은"
   주소만 받아 준다. 이 변환이 틀리면 로그인 창은 뜨는데 앱으로 돌아오지
   못하고, 구글은 redirect_uri_mismatch 라고만 말한다 — 무엇이 틀렸는지
   알려 주지 않아서 찾기가 아주 어렵다. */
eq(reversedClientId('123-abc.apps.googleusercontent.com'),
  'com.googleusercontent.apps.123-abc', '뒤집어서 만든다');
eq(googleRedirectUri({ googleAndroidClientId: '123-abc.apps.googleusercontent.com' }),
  'com.googleusercontent.apps.123-abc:/oauthredirect', '되돌아올 주소 전체');
eq(reversedClientId('  123-abc.apps.googleusercontent.com  '),
  'com.googleusercontent.apps.123-abc', '앞뒤 공백은 걷어낸다');

/* 모양이 아니면 빈 문자열을 돌려준다. 억지로 만들면 창은 뜨는데
   돌아오지 못하는, 제일 찾기 힘든 실패가 된다. */
eq(reversedClientId('그냥문자열'), '', '구글 ID 모양이 아니면 빈 문자열');
eq(reversedClientId('.apps.googleusercontent.com'), '', '앞이 비었으면 빈 문자열');
eq(reversedClientId(''), '', '빈 값');
eq(reversedClientId(null), '', 'null 이어도 터지지 않는다');
eq(reversedClientId(undefined), '', 'undefined 여도 터지지 않는다');
eq(googleRedirectUri({}), '', '키가 없으면 주소도 없다');
eq(googleRedirectUri(), '', '설정을 안 줘도 터지지 않는다');
/* ⚠️ 웹 클라이언트 ID 를 안드로이드 자리에 잘못 넣는 실수가 흔하다.
   둘 다 같은 꼬리표라 모양만으로는 못 거른다 — 그래서 거르지 않고
   그대로 만든다. 대신 실패했을 때 문구가 어디를 보라고 말한다. */
ok(!!reversedClientId('999-web.apps.googleusercontent.com'),
  '웹 ID 를 넣어도 모양은 같아서 통과한다 (문구로 안내할 수밖에 없다)');

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
  'expo-apple-authentication',
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
    const topLevel = new RegExp(`^\\s*import[^\\n]*['"]${mod}`, 'm');
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

console.log(`\n소셜 로그인 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
