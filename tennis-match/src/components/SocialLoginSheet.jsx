/* ============================================================
   카카오 로그인 — 앱 안에서 여는 로그인 화면

   왜 바깥 브라우저 창이 아니라 앱 안인가 (2026-09-30)
     안드로이드에서 카카오 로그인 화면을 바깥 창(크롬 탭)으로 열면, [로그인]을 누르는
     순간 창이 사라지고 Court 앱으로 돌아왔다. 서버 기록에 카카오의 결과 요청이
     한 번도 없었다 — 카카오가 결과를 보내기 전에 창이 없어진 것이다. 앱이 창을
     닫지 않게 바꿔도 같았다. 네이버는 같은 창에서 된다.
     앱 안 화면(WebView)은 앱 밖의 무엇도 닫을 수 없고, 결과 주소도 여기서 바로
     가로챈다. react-native-webview 는 이미 설치된 앱에 들어 있다(원포인트 영상).

   흐름
     카카오 로그인 → 우리 서버(/auth/kakao/callback) → 서버가 앱 주소로 넘기려 하면
     (com.donghyun.tennismatch://oauth?...) 그 주소를 여기서 잡아 onResult 로 준다.
     카카오톡 앱을 여는 주소(intent:, kakaotalk:)는 휴대폰에 넘긴다.
   판단은 src/lib/social.js 의 webLoginDecision (검사 있음).
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Linking, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { webLoginDecision, intentFallback, intentToScheme, intentPackage, IN_APP_LOGIN_UA } from '../lib/social';
import { C } from '../lib/theme';

export function SocialLoginSheet({ request, onDone }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const web = useRef(null);
  const finished = useRef(false);
  const trail = useRef([]);        // 진단용 — 거쳐 간 주소(호스트·경로만, 값은 안 남김)
  const visible = !!request;
  /* 새 로그인을 열 때마다 처음부터 */
  useEffect(() => { finished.current = false; trail.current = []; setLoading(true); }, [request]);

  const finish = (url) => {
    if (finished.current) return;
    finished.current = true;
    onDone?.(url || '', trail.current.slice(-8).join(' → '));
  };

  const onRequest = (req) => {
    const url = String(req?.url || '');
    const what = webLoginDecision(url, request?.returnUrl);
    trail.current.push(what === 'load' ? url.split('?')[0].replace(/^https?:\/\//, '').slice(0, 60) : `[${url.split(':')[0]}]`);
    if (what === 'result') { finish(url); return false; }
    if (what === 'external') {
      /* 카카오톡으로 로그인 — intent: 주소는 WebView 가 못 여니 앱 주소로 바꿔 휴대폰에 넘긴다.
         카카오톡에서 확인하고 Court 로 돌아오면 이 화면이 이어서 로그인을 마친다. */
      const target = /^intent:/i.test(url) ? (intentToScheme(url) || url) : url;
      Linking.openURL(target).catch(() => {
        /* 그 앱이 없으면 대체 웹 주소로 이어 간다(카카오톡이 없는 휴대폰 등) */
        const fb = intentFallback(url);
        if (fb) { web.current?.injectJavaScript(`window.location.href=${JSON.stringify(fb)};true;`); return; }
        const pkg = intentPackage(url);
        if (pkg) Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
      });
      return false;
    }
    return true;
  };

  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={() => finish('')}>
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{request.title || '로그인'}</Text>
          <Pressable onPress={() => finish('')} hitSlop={12}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.sub }}>닫기</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <WebView
            ref={web}
            source={{ uri: request.url }}
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={onRequest}
            onLoadEnd={() => setLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            userAgent={IN_APP_LOGIN_UA}
            style={{ flex: 1 }}
          />
          {loading && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.green} />
            </View>
          )}
        </View>
        <View style={{ height: insets.bottom }} />
      </View>
    </Modal>
  );
}

export default SocialLoginSheet;
