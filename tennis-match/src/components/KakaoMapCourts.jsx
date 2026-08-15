/* 코트 지도 (카카오맵 · WebView)

   지도가 안 보이던 이유
     카카오 JS 키가 비어 있으면 지도를 그릴 수 없다. 예전에는 이때
     "핀만 아무 자리에나 찍힌 가짜 지도"를 대신 보여 줬는데, 실제 위치와
     아무 상관이 없어서 오히려 오해를 부른다. 그래서 지금은 왜 안 보이는지와
     어떻게 켜는지를 그대로 적어 준다.

   좌표가 있는 코트만 핀으로 찍는다. 핀을 누르면 예약 화면으로 나간다. */
import React, { useMemo } from 'react';
import { View, Text, Linking, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { KAKAO_JS_KEY } from '../lib/keys';
import { courtLink } from '../lib/courtData';
import { C, R, S } from '../lib/theme';

/** 좌표가 없어도 이름으로 카카오맵을 열 수 있다 */
const kakaoSearchUrl = (name) =>
  `https://map.kakao.com/?q=${encodeURIComponent(name)}`;

function MapOff({ courts }) {
  const first = courts[0];
  return (
    <View style={{
      borderRadius: R.xl, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.fill, padding: S.lg,
    }}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>지도가 꺼져 있습니다</Text>
      <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 6, lineHeight: 17 }}>
        카카오맵 키가 등록되지 않아 지도를 그릴 수 없습니다.
        {'\n'}developers.kakao.com 에서 JavaScript 키를 발급받아
        {'\n'}src/lib/keys.js 의 KAKAO_JS_KEY 에 넣으면 켜집니다.
      </Text>
      {!!first && (
        <Pressable
          onPress={() => Linking.openURL(kakaoSearchUrl(first.name))}
          style={{
            marginTop: 12, alignSelf: 'flex-start', backgroundColor: C.surface,
            borderWidth: 1, borderColor: C.border,
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.pill,
          }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.green }}>
            카카오맵에서 열기 · {first.name}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function KakaoMapCourts({ courts = [], height = 240 }) {
  const pins = useMemo(
    () => courts
      .filter((c) => c.lat && c.lng)
      .map((c) => ({ name: c.name, lat: c.lat, lng: c.lng, link: courtLink(c) })),
    [courts],
  );

  const html = useMemo(() => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:${C.fill}}</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false"></script>
</head><body><div id="map"></div><script>
  var PINS = ${JSON.stringify(pins)};
  kakao.maps.load(function () {
    var center = PINS.length
      ? new kakao.maps.LatLng(PINS[0].lat, PINS[0].lng)
      : new kakao.maps.LatLng(37.5665, 126.9780);
    var map = new kakao.maps.Map(document.getElementById('map'), { center: center, level: 7 });
    if (PINS.length > 1) {
      var bounds = new kakao.maps.LatLngBounds();
      PINS.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
      map.setBounds(bounds);
    }
    PINS.forEach(function (p) {
      var pos = new kakao.maps.LatLng(p.lat, p.lng);
      var marker = new kakao.maps.Marker({ map: map, position: pos, title: p.name });
      kakao.maps.event.addListener(marker, 'click', function () {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ link: p.link }));
      });
    });
  });
</script></body></html>`, [pins]);

  /* 키가 없으면 가짜 지도 대신 이유를 알려 준다 */
  if (!KAKAO_JS_KEY) return <MapOff courts={courts} />;

  if (pins.length === 0) {
    return (
      <View style={{
        borderRadius: R.xl, borderWidth: 1, borderColor: C.border,
        backgroundColor: C.fill, padding: S.lg,
      }}>
        <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 17 }}>
          이 조건의 코트에는 좌표가 없어 지도에 표시할 수 없습니다.
          {'\n'}목록에서 [예약하기]로 바로 이동할 수 있습니다.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: R.xl, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(e) => {
          try {
            const { link } = JSON.parse(e.nativeEvent.data);
            if (link) Linking.openURL(link);
          } catch (_) { /* 핀에 링크가 없으면 무시 */ }
        }}
      />
    </View>
  );
}
