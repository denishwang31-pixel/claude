/* 내 부·내 조·내 팀 표시 — 글자('내 부') 대신 노란 음영·테두리.
   앱 주인: '내 부 · 내 조' 글자는 어색하고 잘 안 보인다 → 눈에 띄는 색으로 */
import React from 'react';
import { View, Text } from 'react-native';
import { C } from '../lib/theme';

/* ---------------- 내 부·내 조 표시 — 글자 대신 노란 음영·테두리(앱 주인: '내 부' 글자는 어색하고 잘 안 보인다) ---------------- */
export const MINE = { bg: '#FEF3C7', border: '#F59E0B' };
export const mineStyle = (selected) => (selected
  ? { borderWidth: 2.5, borderColor: MINE.border }
  : { backgroundColor: MINE.bg, borderWidth: 2, borderColor: MINE.border });
export function MineLegend({ text }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <View style={{ width: 14, height: 10, borderRadius: 3, backgroundColor: MINE.bg, borderWidth: 1.5, borderColor: MINE.border }} />
      <Text style={{ fontSize: 10.5, color: C.sub }}>{text}</Text>
    </View>
  );
}

/** 이름 앞 성별 글자 — Chip 안(Text 안)에 넣는다. 고른 칩(초록 바탕)에서는 글자색을 따르게 */
export function GenderMark({ gender, on }) {
  if (gender !== 'M' && gender !== 'F') return null;
  /* 고른 칩(초록 바탕)에서는 밝은 색으로 — 남·여가 한눈에 갈리게 */
  const color = on ? (gender === 'F' ? '#FFC2D1' : '#B9D3FF') : gender === 'F' ? C.female : C.male;
  return <Text style={{ color, fontWeight: '800' }}>{gender === 'F' ? '여 ' : '남 '}</Text>;
}

/** '남 8 · 여 4' (성별 모름이 있으면 '· ? 1') */
export const genderCount = (people, genderOf = (p) => p.gender) => {
  const m = people.filter((p) => genderOf(p) === 'M').length;
  const f = people.filter((p) => genderOf(p) === 'F').length;
  const u = people.length - m - f;
  return `남 ${m} · 여 ${f}${u ? ` · 성별 미입력 ${u}` : ''}`;
};

export default MineLegend;
