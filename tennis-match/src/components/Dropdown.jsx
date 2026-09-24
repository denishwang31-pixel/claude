/* ============================================================
   드롭다운 — 눌러서 고르는 칸 (지금 값 + ▾)

   탭 버튼을 줄지어 놓으면 항목이 늘 때마다 칸이 좁아지고 줄이 바뀐다.
   회비 관리처럼 "한 화면 안에서 여러 가지를 바꿔 보는" 곳은 이걸 쓴다.
   고르는 목록은 휴대폰 기본 모양(안드로이드: 아래에서 올라오는 목록,
   아이폰: 액션 시트)으로 뜬다 — native.jsx 의 useOptionSheet.
   ============================================================ */
import React from 'react';
import { Text, Pressable } from 'react-native';
import { useOptionSheet } from './native';
import { C } from '../lib/theme';

/**
 * @param options  [{ key, label, sub? }]
 * @param big      화면 맨 위 큰 칸(56) — 아니면 작은 알약(36, 줄 안에 들어가는 상태 표시)
 * @param tone     작은 알약 색: 'good' | 'bad' | 'plain'
 */
export function Dropdown({ value, options, onChange, title, big = false, tone = 'plain', a11y }) {
  const sheet = useOptionSheet();
  const cur = options.find((o) => o.key === value) || options[0];
  const open = () => sheet.open({
    title,
    options: options.map((o) => ({ ...o, label: `${o.key === cur?.key ? '✓ ' : '   '}${o.label}` })),
    onSelect: (o) => { if (o.key !== cur?.key) onChange(o.key); },
  });
  const colors = {
    good: { bg: C.green, fg: '#FFFFFF', border: C.green },
    bad: { bg: '#FEE2E2', fg: '#B91C1C', border: '#FECACA' },
    plain: { bg: C.surface, fg: C.text, border: C.border },
  }[big ? 'plain' : tone];
  return (
    <>
      <Pressable onPress={open} accessibilityRole="button"
        accessibilityLabel={`${a11y || title || ''} ${cur?.label || ''}, 바꾸려면 누르세요`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          minHeight: big ? 56 : 36, paddingHorizontal: big ? 16 : 12,
          borderRadius: big ? 12 : 999, borderWidth: big ? 1.5 : 1,
          backgroundColor: colors.bg, borderColor: big ? C.green : colors.border,
          opacity: pressed ? 0.8 : 1,
        })}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: big ? 17 : 13, fontWeight: '800', color: colors.fg }}>
          {cur?.label}
        </Text>
        <Text style={{ fontSize: big ? 14 : 11, color: big ? C.green : colors.fg, fontWeight: '800' }}>▼</Text>
      </Pressable>
      {sheet.node}
    </>
  );
}

export default Dropdown;
