/* ============================================================
   공용 화면 헤더 — 제목 + 뒤로가기 버튼

   iOS 에는 하드웨어 뒤로 버튼이 없으므로 화면 안에 뒤로가기가 반드시
   있어야 한다. 안드로이드도 화면 안 버튼이 있으면 한 손으로 쓰기 편하므로
   두 플랫폼 모두 같은 자리에 노출한다.
   (안드로이드 하드웨어 키는 useBackHandler 로 같은 핸들러에 연결)

   iOS 관례대로 "‹ 뒤로"처럼 왼쪽 꺾쇠를 쓰고, 터치 영역을 넉넉히 잡는다.
   ============================================================ */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/theme';

export function BackButton({ onPress, label = '뒤로', tone = 'dark' }) {
  const color = tone === 'dark' ? C.lime : C.green2;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="뒤로 가기"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 2,
        paddingVertical: 4, paddingRight: 8, opacity: pressed ? 0.55 : 1,
      })}>
      <Text style={{ color, fontSize: 22, lineHeight: 24, marginTop: Platform.OS === 'ios' ? -2 : 0 }}>‹</Text>
      <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * @param title    가운데(왼쪽) 제목
 * @param subtitle 제목 아래 보조 문구
 * @param onBack   있으면 뒤로가기 버튼 노출. 안드로이드 하드웨어 키에도 같은 함수를 연결할 것
 * @param backLabel 뒤로 버튼 옆 글자 (기본 '뒤로')
 * @param right    오른쪽 영역 (배지·버튼 등)
 * @param children 헤더 아래에 붙는 추가 영역 (모드 전환 버튼 등)
 */
export function ScreenHeader({ title, subtitle, onBack, backLabel, right, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.ink, paddingTop: insets.top + 6, paddingBottom: 12, paddingHorizontal: 16 }}>
      {!!onBack && (
        <View style={{ marginBottom: 2, alignSelf: 'flex-start' }}>
          <BackButton onPress={onBack} label={backLabel} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{title}</Text>
          {!!subtitle && <Text style={{ color: '#6ee7b7', fontSize: 11, marginTop: 2 }}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export default ScreenHeader;
