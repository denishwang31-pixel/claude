/* 조(등급) 매기기 줄 — 한 사람에 한 줄, 오른쪽에 A B C D … 버튼

   회원 목록의 [조 배정]과 대회 개설의 [대회 등급]이 같이 쓴다.
   한 사람씩 상세를 열어 고치게 하면 30명 조 나누기가 30번의 열고 닫기가
   된다(앱 주인: "A부터 부여하는 등급이 없어" — 있었지만 회원 상세 안에
   숨어 있었다). 한 화면에서 줄마다 한 번 누르면 끝나게 한다.

   A 가 가장 높다. 쓰는 칸 수는 [－][＋]로 정한다(A~B … A~F). */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { gradesUpTo, gradeSummary } from '../lib/grades';
import { GRADES } from '../lib/constants';
import { C, R } from '../lib/theme';

const Cell = ({ on, label, onPress, none }) => (
  <Pressable onPress={onPress} hitSlop={3}
    accessibilityRole="button" accessibilityState={{ selected: on }}
    style={({ pressed }) => ({
      minWidth: 34, height: 34, paddingHorizontal: 4, borderRadius: R.md,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: on ? (none ? C.fill : C.green) : C.surface,
      borderWidth: 1, borderColor: on ? (none ? C.border : C.green) : C.border,
      opacity: pressed ? 0.6 : 1,
    })}>
    <Text style={{ fontSize: 13, fontWeight: '800', color: on ? (none ? C.sub : '#fff') : C.sub }}>{label}</Text>
  </Pressable>
);

/**
 * @param people  [{ id, name, gender }]
 * @param value   { [id]: 'A' | ... }
 * @param onPick  (id, grade|'') => void
 * @param count   보여 줄 칸 수 · onCount(n)
 * @param unit    '조' | '등급' (요약 문구)
 * @param note    사람 이름 옆 작은 글씨 (예: 클럽 조) — (person) => string
 */
export function GradeRows({ people, value, onPick, count, onCount, unit = '조', note }) {
  const cols = gradesUpTo(count);
  const summary = gradeSummary(people, (p) => value?.[p.id], unit);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text style={{ flex: 1, fontSize: 11.5, color: C.sub }}>{summary || `아직 매긴 ${unit}이 없습니다`}</Text>
        {onCount && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11.5, color: C.faint }}>칸</Text>
            <Cell label="－" onPress={() => onCount(Math.max(2, cols.length - 1))} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text, minWidth: 34, textAlign: 'center' }}>
              A~{cols[cols.length - 1]}
            </Text>
            <Cell label="＋" onPress={() => onCount(Math.min(GRADES.length, cols.length + 1))} />
          </View>
        )}
      </View>
      {people.map((p, i) => {
        const g = value?.[p.id] || '';
        return (
          <View key={p.id} style={{
            flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6,
            borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
          }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: p.gender === 'F' ? C.female : C.text }}>{p.name}</Text>
              {!!note?.(p) && <Text numberOfLines={1} style={{ fontSize: 10.5, color: C.faint }}>{note(p)}</Text>}
            </View>
            {cols.map((c) => <Cell key={c} label={c} on={g === c} onPress={() => onPick(p.id, g === c ? '' : c)} />)}
            <Cell label="–" none on={!g} onPress={() => onPick(p.id, '')} />
          </View>
        );
      })}
    </View>
  );
}

export default GradeRows;
