/* ============================================================
   빌드에 심어진 소셜 로그인 키를 읽는 유일한 자리

   왜 파일을 따로 두나
     여기서만 expo-constants(네이티브)를 만진다. social.js 는 순수하게
     두어야 node 로 도는 검사(scripts/test-social.mjs)가 그 판단 로직을
     전부 돌려 볼 수 있다. 네이티브를 한 줄이라도 끌어들이면 그 검사가
     통째로 못 돈다.

   키가 흘러오는 길
     GitHub Secrets
       → .github/workflows/tennis-build.yml 이 eas build 에 환경변수로 넘김
       → app.config.js 가 extra.social 에 담음
       → 빌드된 앱 안에서 Constants.expoConfig.extra.social
       → 여기
       → social.js 의 configFromExtra 가 정리
       → enabledProviders() 가 버튼을 정함

   ⚠️ 키가 없으면 빈 값이고, 빈 값이면 버튼이 안 그려진다. 그게 정상이다.
      "키를 넣었는데 버튼이 안 나온다"면 이 길 어딘가에서 끊긴 것인데,
      제일 흔한 원인은 이름 오타다. unknownKeys() 로 확인할 수 있다.

   ⚠️ 키를 새로 넣으면 **새로 빌드해야** 한다. extra 는 빌드 시점에
      앱 안에 박히는 값이라 OTA 로는 안 바뀐다.
   ============================================================ */
import Constants from 'expo-constants';
import { configFromExtra, unknownKeys } from './social';

/* Constants.expoConfig 는 개발 중 형태가 달라질 수 있어 방어적으로 읽는다.
   여기서 터지면 로그인 화면 자체가 안 뜬다 — 최악의 실패다. */
const extra = (() => {
  try {
    return Constants?.expoConfig?.extra?.social
      || Constants?.manifest?.extra?.social
      || {};
  } catch {
    return {};
  }
})();

/** 지금 빌드에 심어진 소셜 설정 */
export const LIVE_SOCIAL_CONFIG = configFromExtra(extra);

/** 설정에 모르는 이름이 섞여 있는가 — 오타 찾기용 */
export const LIVE_UNKNOWN_KEYS = unknownKeys(extra);

export default LIVE_SOCIAL_CONFIG;
