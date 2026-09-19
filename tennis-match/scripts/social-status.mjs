/* 이 빌드에 어떤 소셜 로그인이 실리는가.

   왜 필요한가
     키가 흘러오는 길이 길다. GitHub Secrets → workflow env → app.config.js
     → extra.social → 앱. 중간 어디가 끊겨도 증상은 하나뿐이다 —
     "버튼이 안 나온다". 빌드는 성공하고 오류도 없다. 앱을 깔아서 로그인
     화면을 열어 봐야 안다. 30분짜리 빌드를 마치고서.

     그래서 빌드 직전에 여기서 한 번 찍는다.

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

say('### 이 빌드에 실리는 소셜 로그인');
say('');
say('| 제공자 | 실림 | 빠진 것 |');
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
