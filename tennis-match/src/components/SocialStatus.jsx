/* ============================================================
   소셜 로그인 상태 — 기기에서 직접 확인한다

   왜 필요한가
     키가 흘러오는 길이 길다.
       GitHub Secrets → workflow → EAS 서버 → app.config.js
       → extra.social → 앱
     중간 어디가 끊겨도 증상은 하나뿐이다: "버튼이 안 보인다".
     빌드는 성공하고 오류도 없다.

   ⚠️ 실제로 이것 때문에 한 번 크게 돌아갔다.
      workflow 안에서 키를 확인하는 단계를 두었는데, 그 검사는 GitHub
      러너에서 돌아서 **러너의** 환경변수를 보고 "✅ 실림"이라고 했다.
      정작 빌드는 EAS 서버에서 돌고, 그 서버에는 키가 없었다.
      검사가 엉뚱한 곳을 보고 있었던 것이다.

      그래서 이 화면을 만들었다. 여기는 **빌드된 앱 안**이라, 실제로
      앱에 무엇이 박혔는지를 있는 그대로 보여 준다. 더 이상 추측하지
      않는다.

   ⚠️ 값은 절대 보여 주지 않는다. "있다/없다"만 말한다.
      화면은 남이 볼 수 있고, 캡처해서 보내는 일도 흔하다.
   ============================================================ */
import React from 'react';
import { View, Text } from 'react-native';
import {
  PROVIDER_ORDER, PROVIDER_SHORT, REQUIREMENTS,
  providerReady, missingFor, googleClientMixup,
} from '../lib/social';
import { LIVE_SOCIAL_CONFIG, LIVE_UNKNOWN_KEYS } from '../lib/socialConfig';
import { Card, Chip } from './ui';
import { C, S, F } from '../lib/theme';

export function SocialStatus() {
  const cfg = LIVE_SOCIAL_CONFIG;
  const rows = PROVIDER_ORDER.map((p) => ({
    key: p,
    label: PROVIDER_SHORT[p],
    on: providerReady(p, cfg),
    missing: missingFor(p, cfg),
    needsServer: REQUIREMENTS[p].needsServer,
  }));
  const onCount = rows.filter((r) => r.on).length;

  /* ⚠️ 여기만 값의 일부를 보여 준다. 이유가 있다.

       구글 클라이언트 ID 는 비밀이 아니다 — APK 안에 박혀 있고,
       로그인할 때 브라우저 주소창에 그대로 뜬다. 구글 문서도 공개
       정보라고 말한다.

       그런데 **웹 클라이언트 ID 와 안드로이드 클라이언트 ID 가 생긴
       모양이 똑같다**(숫자-문자.apps.googleusercontent.com). 눈으로는
       구별이 안 된다. 웹 것을 잘못 넣으면 구글이 "액세스 차단 — 요청이
       잘못되었습니다"로 막는데, 화면에는 어느 쪽을 넣었는지 확인할
       방법이 전혀 없다. 콘솔에서 보이는 앞자리와 대 볼 수 있어야 한다.

       앞 몇 자만 보여 준다. 그리고 이건 구글에만 한다 —
       카카오 REST 키나 네이버 시크릿은 진짜 비밀이라 절대 안 된다. */
  const googleHead = (() => {
    const id = String(cfg?.googleAndroidClientId || '');
    const tail = id.split('-')[1] || '';
    return tail ? tail.slice(0, 4) : '';
  })();

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={F.bodyBold}>소셜 로그인</Text>
        <Chip tone={onCount ? 'soft' : 'default'}>
          {onCount ? `${onCount}개 켜짐` : '꺼짐'}
        </Chip>
      </View>

      <View style={{ marginTop: S.md, gap: 7 }}>
        {rows.map((r) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: r.on ? C.green : C.faint, width: 52 }}>
              {r.label}
            </Text>
            <Text style={{ flex: 1, fontSize: 11.5, color: C.sub, lineHeight: 17 }}>
              {r.on ? '앱에 들어와 있습니다' : `빠진 값: ${r.missing.join(', ')}`}
            </Text>
          </View>
        ))}
      </View>

      {googleClientMixup(cfg) && (
        <Text style={{ fontSize: 11.5, color: C.warn, marginTop: S.md, lineHeight: 17 }}>
          ⚠️ 구글 웹 / 안드로이드 클라이언트 ID 가 같은 값입니다. 둘 중 하나가
          잘못 들어갔고, 이대로면 구글이 로그인을 막습니다
          (400 invalid_request).
        </Text>
      )}

      {!!googleHead && (
        <Text style={{ fontSize: 11.5, color: C.sub, marginTop: S.md, lineHeight: 17 }}>
          앱에 실린 구글 클라이언트: <Text style={{ fontWeight: '700' }}>…-{googleHead}…</Text>
          {'\n'}구글 클라우드의 [사용자 인증 정보] 목록에서 유형이
          <Text style={{ fontWeight: '700' }}> Android</Text> 인 줄의 앞자리와 같아야 합니다.
          웹 클라이언트를 넣으면 로그인이 "액세스 차단"으로 막힙니다.
        </Text>
      )}

      {LIVE_UNKNOWN_KEYS.length > 0 && (
        <Text style={{ fontSize: 11.5, color: C.warn, marginTop: S.md, lineHeight: 17 }}>
          ⚠️ 모르는 이름이 함께 들어왔습니다: {LIVE_UNKNOWN_KEYS.join(', ')}
          {'\n'}빌드 설정의 이름에 오타가 있을 수 있습니다.
        </Text>
      )}

      {onCount === 0 && (
        <Text style={{ fontSize: 11.5, color: C.faint, marginTop: S.md, lineHeight: 17 }}>
          키가 앱에 들어오지 않았습니다. 키는 빌드할 때도, 업데이트(OTA)를
          만들 때도 들어옵니다 — <Text style={{ fontWeight: '700' }}>나중에 한 쪽이 이깁니다</Text>.
          위 [앱 정보]에서 업데이트를 한 번 받아 보고, 그래도 비어 있으면
          새로 빌드해 주세요.
        </Text>
      )}
    </Card>
  );
}

export default SocialStatus;
