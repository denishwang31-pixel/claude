/* ============================================================
   레벨업 머리 — [원포인트 | 용품 | 코치] 칸 나누기 + 오른쪽 버튼

   예전엔 "레벨업" 제목·부제 → 칸 나누기 → (원포인트) 영역 칩 두 줄이
   쌓여서 영상이 화면 절반 아래에서 시작했다. 탭바에 이미 「레벨업」이
   보이므로 제목을 빼고 칸 나누기를 화면 첫 줄로 올렸다.
   세 칸 모두 이 머리를 같이 쓴다 — 칸을 옮겨도 머리가 들썩이지 않게.

   ⚠️ 칸 하나의 높이는 48. 줄이지 말 것(theme.js 의 TAP 설명 참고).
   ============================================================ */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { C } from '../lib/theme';

/**
 * @param options  [{ key, label }]
 * @param right    오른쪽에 붙일 것(운영진 + 버튼 등)
 * @param beside   넓은 화면에서 칸 나누기 옆에 둘 것(원포인트 검색창)
 */
export function LevelupTop({ options, value, onChange, right = null, beside = null }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {options.length === 1 ? (
          /* 칸이 하나뿐이면(일반 사용자 — 용품·코치 숨김) 고를 것이 없으니 제목으로 */
          <View style={[{ height: 56, justifyContent: 'center' }, beside ? { width: 420 } : { flex: 1 }]}>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header"
              style={{ fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.4 }}>{options[0].label}</Text>
          </View>
        ) : (
        <View style={[{
          height: 56, borderRadius: 14, padding: 3, flexDirection: 'row', gap: 3,
          backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
        }, beside ? { width: 420 } : { flex: 1 }]}>
          {options.map((o) => {
            const on = o.key === value;
            return (
              <Pressable key={o.key} onPress={() => onChange(o.key)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={({ pressed }) => ({
                  flex: 1, height: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? C.green : 'transparent', opacity: pressed && !on ? 0.7 : 1,
                })}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3}
                  style={{ fontSize: 15, fontWeight: on ? '800' : '700', color: on ? '#FFFFFF' : C.sub }}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        )}
        {beside ? <View style={{ flex: 1 }}>{beside}</View> : null}
        {right}
      </View>
    </View>
  );
}

/** 머리 오른쪽의 초록 + 버튼(56×56) — 운영진 등록 입구 */
export function AddButton({ onPress, label }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 56, height: 56, borderRadius: 14, backgroundColor: C.green,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
      })}>
      <Icon name="add" size={28} color="#FFFFFF" />
    </Pressable>
  );
}

export default LevelupTop;
