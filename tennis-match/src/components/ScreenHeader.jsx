/* ============================================================
   공용 화면 헤더 — 흰 배경 + 딥그린 액센트

   예전엔 헤더 전체가 딥그린이었는데, 화면마다 큰 색 덩어리가 얹혀
   무겁고 예스러워 보였다. 흰 헤더 + 얇은 경계선으로 바꾸고 색은
   포인트로만 쓴다.

   iOS 에는 하드웨어 뒤로 버튼이 없으므로 화면 안에 뒤로가기가 반드시
   있어야 한다. 안드로이드도 화면 안 버튼이 있으면 한 손으로 쓰기 편하므로
   두 플랫폼 모두 같은 자리에 노출한다.
   (안드로이드 하드웨어 키는 useBackHandler 로 같은 핸들러에 연결)
   ============================================================ */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S, F } from '../lib/theme';

export function BackButton({ onPress, label = '뒤로' }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="뒤로 가기"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 2,
        paddingVertical: 4, paddingRight: 8, opacity: pressed ? 0.5 : 1,
      })}>
      <Text style={{ color: C.green, fontSize: 22, lineHeight: 24, marginTop: Platform.OS === 'ios' ? -2 : 0 }}>‹</Text>
      <Text style={{ color: C.green, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * @param title     제목
 * @param subtitle  제목 아래 보조 문구
 * @param onBack    있으면 뒤로가기 노출. 안드로이드 하드웨어 키에도 같은 함수를 연결할 것
 * @param backLabel 뒤로 버튼 옆 글자
 * @param right     오른쪽 영역
 * @param children  헤더 아래 추가 영역(모드 전환 등)
 * @param bare      경계선 없이 (스크롤 상단에 바로 붙일 때)
 */
export function ScreenHeader({ title, subtitle, onBack, backLabel, right, children, bare }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      backgroundColor: C.surface,
      paddingTop: insets.top + 6,
      paddingBottom: children ? S.md : 10,
      paddingHorizontal: S.lg,
      borderBottomWidth: bare ? 0 : 1,
      borderBottomColor: C.border,
    }}>
      {!!onBack && (
        <View style={{ marginBottom: 2, alignSelf: 'flex-start' }}>
          <BackButton onPress={onBack} label={backLabel} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={F.h2}>{title}</Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{subtitle}</Text>
          )}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export default ScreenHeader;
