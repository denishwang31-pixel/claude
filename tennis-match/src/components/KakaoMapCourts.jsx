/* PHASE 4 — 카카오맵 코트 지도 (react-native-webview)
   좌표(lat/lng) 있는 코트만 핀 표시. 핀 탭 → 예약 링크 외부 브라우저 이동. */
import React, { useMemo } from 'react';
import { View, Text, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { KAKAO_JS_KEY } from '../lib/keys';
import { C } from '../lib/theme';

export function KakaoMapCourts({ courts, height = 220 }) {
  const pins = useMemo(
    () => courts.filter((c) => c.lat && c.lng).map((c) => ({ name: c.name, lat: c.lat, lng: c.lng, link: c.link || '' })),
    [courts],
  );

  const html = useMemo(() => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#022c22}</style>
<script src="https://dapp.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false"></script>
</head><body><div id="map"></div><script>
  var PINS = ${JSON.stringify(pins)};
  kakao.maps.load(function () {
    var center = PINS.length ? new kakao.maps.LatLng(PINS[0].lat, PINS[0].lng) : new kakao.maps.LatLng(37.5665, 126.9780);
    var map = new kakao.maps.Map(document.getElementById('map'), { center: center, level: 8 });
    if (PINS.length > 1) {
      var bounds = new kakao.maps.LatLngBounds();
      PINS.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
      map.setBounds(bounds);
    }
    PINS.forEach(function (p) {
      var pos = new kakao.maps.LatLng(p.lat, p.lng);
      var marker = new kakao.maps.Marker({ map: map, position: pos, title: p.name });
      var iw = new kakao.maps.InfoWindow({ content: '<div style="padding:4px 8px;font-size:12px;white-space:nowrap">' + p.name + '</div>' });
      iw.open(map, marker);
      kakao.maps.event.addListener(marker, 'click', function () {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ link: p.link }));
      });
    });
  });
</script></body></html>`, [pins]);

  if (!KAKAO_JS_KEY) return null;

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
      {pins.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink }}>
          <Text style={{ color: C.lime, fontSize: 12 }}>좌표가 등록된 코트가 없습니다 (코트 추가 시 주소로 자동 변환)</Text>
        </View>
      ) : (
        <WebView
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled
          onMessage={(e) => {
            try {
              const { link } = JSON.parse(e.nativeEvent.data);
              if (link) Linking.openURL(link);
            } catch (_) {}
          }}
        />
      )}
    </View>
  );
}
