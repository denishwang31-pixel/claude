/* ============================================================
   앱 설정 — app.json 을 읽어 빌드 시점 값만 얹는다

   왜 app.json 만으로는 안 되나
     app.json 은 고정된 글이라 환경변수를 읽을 수 없다. 소셜 로그인 키는
     저장소에 두면 안 되는 값이라(공개되면 발급처에서 지우고 다시 받는
     것 말고는 방법이 없다) 빌드할 때 밖에서 넣어 줘야 한다.

   ⚠️ app.json 을 지우지 않았다. 여기서 config 로 받아 그대로 펼치고,
      extra.social 한 군데만 더한다. 설정의 출처는 여전히 app.json 이다.
      양쪽에 나눠 적으면 어느 쪽이 이기는지 헷갈리고, 실제로 그렇게
      갈라진 설정은 빌드해 보기 전까지 아무도 모른다.

   키가 없을 때
     전부 빈 문자열이 된다. 빈 값이면 로그인 화면에 그 버튼이 안 그려진다
     (src/lib/social.js 참고). 그래서 키 없이 빌드해도 아무것도 깨지지
     않는다 — 소셜 버튼만 없는 지금 모습 그대로다.

   ⚠️ 이 값들은 빌드 시점에 앱 안에 박힌다. 키를 새로 넣거나 바꾸면
      OTA 가 아니라 **새 빌드**가 필요하다.
   ============================================================ */

/* 값이 없을 때 undefined 가 아니라 빈 문자열이 되게 한다.
   undefined 는 JSON 으로 나가면서 키 자체가 사라져, 나중에
   "왜 extra 에 이 이름이 없지"로 헤매게 된다. */
const env = (name) => String(process.env[name] || '').trim();

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    /* 이름은 src/lib/social.js 의 SOCIAL_CONFIG 키와 정확히 같아야 한다.
       다르면 조용히 무시되고 버튼이 안 나온다. 검사가 이 짝을 본다
       (scripts/test-social.mjs 의 [빌드 설정과 이름이 맞물린다]). */
    social: {
      kakaoRestKey: env('KAKAO_REST_KEY'),
      kakaoNativeKey: env('KAKAO_NATIVE_KEY'),
      naverClientId: env('NAVER_CLIENT_ID'),
      naverClientSecret: env('NAVER_CLIENT_SECRET'),
      googleWebClientId: env('GOOGLE_WEB_CLIENT_ID'),
      googleAndroidClientId: env('GOOGLE_ANDROID_CLIENT_ID'),
      appleServiceId: env('APPLE_SERVICE_ID'),
      tokenEndpoint: env('SOCIAL_TOKEN_ENDPOINT'),
    },
  },
});
