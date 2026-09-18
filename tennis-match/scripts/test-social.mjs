/* 소셜 로그인 — 어느 버튼을 그릴 것인가.

   여기서 잡으려는 사고
     1. 키가 반쯤 들어온 채로 버튼이 그려지는 것. 누르면 아무 일도
        안 일어나고, 사용자는 앱이 고장 났다고 생각한다.
     2. iOS 에 카카오·네이버만 켜고 제출하는 것. 애플 심사 지침 4.8
        위반이라 반려된다 — 코드는 멀쩡한데 떨어진다.
   ============================================================ */
import {
  PROVIDERS, PROVIDER_ORDER, PROVIDER_LABEL, PROVIDER_SHORT, PROVIDER_STYLE,
  REQUIREMENTS, SOCIAL_CONFIG,
  providerReady, enabledProviders, missingFor,
  appleGap, socialReadiness, needsNativeRebuild, SETUP,
} from '../src/lib/social.js';

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

console.log(`\n소셜 로그인 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
