/* ============================================================
   안드로이드 11+ 에서 "어떤 브라우저가 깔려 있나"를 볼 수 있게

   안드로이드 11 부터 다른 앱 목록은 매니페스트 <queries> 에 적은 것만
   보인다. expo-web-browser 는 커스텀 탭 "서비스"만 적어 두어서, 링크를
   여는 "브라우저 화면" 목록은 비어 온다. 그러면 구글 로그인을 지정 없이
   열게 되고, 안드로이드가 「연결 앱」 선택창을 띄워 지메일이 끼어든다.

   여기서 https 링크를 여는 앱을 볼 수 있게 한 줄 더한다.
   ⚠️ 매니페스트라 OTA 로는 안 바뀐다 — 새 빌드부터 적용.
      그 전에도 socialSignIn.js 가 알려진 브라우저 이름으로 시도하므로
      대부분 기기에선 이미 선택창 없이 열린다.
   ============================================================ */
const { withAndroidManifest } = require('@expo/config-plugins');

const VIEW_HTTPS = {
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
  data: [{ $: { 'android:scheme': 'https' } }],
};

function addQuery(manifest) {
  const m = manifest.manifest;
  m.queries = m.queries || [];
  if (!m.queries.length) m.queries.push({});
  const q = m.queries[0];
  q.intent = q.intent || [];
  const has = q.intent.some((it) =>
    (it.action || []).some((a) => a.$?.['android:name'] === 'android.intent.action.VIEW')
    && (it.data || []).some((d) => d.$?.['android:scheme'] === 'https'));
  if (!has) q.intent.push(VIEW_HTTPS);
  return manifest;
}

module.exports = (config) => withAndroidManifest(config, (cfg) => {
  cfg.modResults = addQuery(cfg.modResults);
  return cfg;
});
module.exports.addQuery = addQuery;
