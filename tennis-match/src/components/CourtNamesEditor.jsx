/* ============================================================
   코트 이름 칸 — 청백전(2팀·3팀) · 팀 리그 대진 설정에서 쓴다

   코트장 관리·대회 대진 기준에는 이미 코트 이름 칸이 있다. 청백전·팀 리그만
   1·2·3 으로 나와 현장과 표가 다른 말을 했다(2026-10-04 앱 주인).
   이름은 대회 문서의 courtNames 에 둔다 — 2팀↔3팀을 오가도 같은 이름을 쓴다.
   ⚠️ 경기 문서의 court 는 그대로 1..N 숫자 — 이름은 보여 줄 때만(lib/courtNames.js 머리말).
   ============================================================ */
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { normalizeCourtNames, defaultCourtName, courtNameProblems } from '../lib/courtNames';
import { Field } from './ui';
import { AppButton } from './native';
import { Label } from './pickers';
import { C } from '../lib/theme';

/**
 * @param count   코트 면수
 * @param value   저장된 이름 목록(대회 문서 courtNames)
 * @param onSave  (names) => Promise|void
 */
export function CourtNamesEditor({ count, value, onSave }) {
  const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
  const saved = normalizeCourtNames(value, n);
  /* 칸에는 사람이 친 그대로(빈칸 포함)를 들고 있다 — 지우는 중에 기본 이름이 튀어나오지 않게 */
  const [draft, setDraft] = useState(() => saved.map((nm, i) => (nm === defaultCourtName(i + 1) ? '' : nm)));
  useEffect(() => {
    setDraft(saved.map((nm, i) => (nm === defaultCourtName(i + 1) ? '' : nm)));
  }, [n, (value || []).join('|')]);

  const cells = Array.from({ length: n }, (_, i) => draft[i] ?? '');
  const next = normalizeCourtNames(cells, n);
  const problems = courtNameProblems(cells, n);
  const changed = next.join('|') !== saved.join('|');

  return (
    <View>
      <Label hint="비우면 1·2·3 — 예: A·B·C 또는 9·10·11">코트 이름</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {cells.map((nm, i) => (
          <View key={`court-${i}`} style={{ width: 72 }}>
            <Field
              placeholder={defaultCourtName(i + 1)}
              value={nm}
              maxLength={8}
              onChangeText={(v) => {
                const d = [...cells];
                d[i] = v;
                setDraft(d);
              }} />
          </View>
        ))}
      </View>
      {problems.map((msg) => (
        <Text key={msg} style={{ fontSize: 11.5, color: C.danger, marginTop: 5 }}>{msg}</Text>
      ))}
      {changed && (
        <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          <AppButton small disabled={problems.length > 0} onPress={() => onSave?.(next)}>코트 이름 저장</AppButton>
        </View>
      )}
    </View>
  );
}

export default CourtNamesEditor;
