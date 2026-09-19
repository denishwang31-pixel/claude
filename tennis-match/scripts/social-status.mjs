/* GitHub 쪽에 키가 들어와 있는가.

   ⚠️⚠️ 이것은 "빌드에 실린다"는 뜻이 **아니다**. 한 번 크게 속았다.

     eas build 는 프로젝트를 압축해 EAS 서버로 보내고, 빌드는 거기서
     돈다. app.config.js 도 **EAS 서버에서** 평가된다. 그런데 이 스크립트는
     GitHub 러너에서 돌면서 **러너의** 환경변수를 본다. 둘은 다른 곳이다.

     실제로 러너에는 키가 있고 EAS 서버에는 없던 적이 있다. 이 표는
     "구글 ✅"이라고 했고, 구워진 앱에는 키가 없었다. 검사가 엉뚱한 곳을
     보면서 확신을 준 것이라, 없는 것만 못했다.

     → 빌드에 실제로 무엇이 박혔는지는 **앱에서** 봐야 한다.
        [더보기] → 앱 정보 → 소셜 로그인 (src/components/SocialStatus.jsx)
     → EAS 서버가 쓰는 값은 expo.dev 의 프로젝트 환경변수다.

   그래도 이 표를 남겨 두는 이유
     GitHub Secrets 이름을 잘못 적은 경우는 여기서 걸린다. 그건 흔한
     실수이고, 여기서 걸러 주면 한 단계는 줄어든다. 다만 여기를 통과했다고
     빌드에 실린 것은 아니라는 점을 표 아래에 적어 둔다.

   ⚠️ 키 값 자체는 절대 찍지 않는다. 로그는 저장소 권한이 있는 사람이
      다 볼 수 있고, GitHub 는 시크릿을 가려 주지만 가공된 값(앞 몇 자
      같은 것)까지 가려 주지는 않는다. "있다/없다"만 말한다.

   쓰는 법
     node scripts/social-status.mjs
*/
import {
  PROVIDER_ORDER, PROVIDER_SHORT, REQUIREMENTS, SOCIAL_CONFIG,
  configFromExtra, unknownKeys, providerReady, appleGap, needsNativeRebuild,
} from '../src/lib/social.js';

/* app.config.js 와 같은 이름을 읽는다. 짝이 맞는지는 test-social.mjs 가 본다. */
const ENV_OF = {
  kakaoRestKey: 'KAKAO_REST_KEY',
  kakaoNativeKey: 'KAKAO_NATIVE_KEY',
  naverClientId: 'NAVER_CLIENT_ID',
  naverClientSecret: 'NAVER_CLIENT_SECRET',
  googleWebClientId: 'GOOGLE_WEB_CLIENT_ID',
  googleAndroidClientId: 'GOOGLE_ANDROID_CLIENT_ID',
  appleServiceId: 'APPLE_SERVICE_ID',
  tokenEndpoint: 'SOCIAL_TOKEN_ENDPOINT',
};

const extra = {};
Object.entries(ENV_OF).forEach(([key, envName]) => {
  extra[key] = String(process.env[envName] || '').trim();
});

const config = configFromExtra(extra);
const md = [];
const say = (s = '') => { console.log(s); md.push(s); };

say('### GitHub Secrets 에 들어와 있는 소셜 로그인 키');
say('');
say('| 제공자 | Secrets 있음 | 빠진 것 |');
say('|---|---|---|');
PROVIDER_ORDER.forEach((p) => {
  const ready = providerReady(p, config);
  const missing = Object.keys(SOCIAL_CONFIG)
    .filter((k) => REQUIREMENTS[p].keys.includes(k)
      || (REQUIREMENTS[p].needsServer && k === 'tokenEndpoint'))
    .filter((k) => !config[k])
    .map((k) => `\`${ENV_OF[k]}\``);
  say(`| ${PROVIDER_SHORT[p]} | ${ready ? '✅' : '—'} | ${missing.join(', ') || '없음'} |`);
});
say('');
/* ⚠️ 여기를 통과해도 빌드에 실렸다는 뜻이 아니다. 스크립트 머리말 참고. */
say('> ⚠️ 이 표는 **GitHub 쪽에 키가 있는지**만 봅니다. 빌드는 EAS 서버에서');
say('> 돌고, 거기 환경변수는 따로입니다 — expo.dev 의 프로젝트 환경변수에도');
say('> 같은 값을 넣어야 앱에 박힙니다.');
say('>');
say('> 앱에 실제로 박혔는지는 앱에서 확인하세요: **더보기 → 앱 정보 → 소셜 로그인**');
say('');

const gap = appleGap(config);
if (gap) {
  say(`> ⚠️ **${gap.message}**`);
  say('');
}

const unknown = unknownKeys(extra);
if (unknown.length) {
  say(`> ⚠️ 모르는 이름이 섞여 있습니다: ${unknown.join(', ')}`);
  say('');
}

if (!needsNativeRebuild(config)) {
  say('아직 실리는 소셜 로그인이 없습니다. 로그인 화면에는 이메일과');
  say('둘러보기만 나옵니다 — 키를 넣기 전의 정상 모습입니다.');
  say('');
  say('키를 넣는 방법은 tennis-match/DEPLOY.md 의 「소셜 로그인 키」 참고.');
}

/* workflow 요약에도 같은 표를 남긴다 */
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`);
}
