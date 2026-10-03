/* ============================================================
   팀 리그 — 경기 손으로 넣기 · 고치기

   자동으로 짠 대진을 고치거나, 처음부터 손으로 넣는다(2026-10-03 앱 주인 —
   "자동 대진표 생성 후 수정하거나, 수기 입력도 할 수 있어야 한다").
   타임 · 코트 · 유형 · 두 팀 · 양쪽 선수를 고르면 끝.
   검사는 lib/teamLeague.js checkLeagueMatch — 사람·칸 겹침은 막고, 성별 구성은 경고만.
   ============================================================ */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { teamLook, checkLeagueMatch, sideSize, TEAM_ROUND_TYPES } from '../lib/teamLeague';
import { Card, Chip, Field, Btn } from './ui';
import { Touchable } from './native';
import { Label } from './pickers';
import { C, S, R, F } from '../lib/theme';

/**
 * @param open      { id: string|null, draft } | null — null 이면 닫힘
 * @param onSave    (id|null, draft) => string|undefined   실패 문구를 돌려주면 화면에 띄운다
 * @param onDelete  (id) => void
 */
export function LeagueMatchEditor({ open, teams, matches, teamNames, onSave, onDelete, onClose }) {
  const insets = useSafeAreaInsets();
  const [d, setD] = useState(null);
  const [round, setRound] = useState('');
  const [court, setCourt] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setD({ ...open.draft });
    setRound(String(open.draft.round || ''));
    setCourt(String(open.draft.court || ''));
    setErr('');
  }, [open]);

  const draft = d ? { ...d, round: Number(round) || 0, court: Number(court) || 0 } : null;
  const check = useMemo(
    () => (draft ? checkLeagueMatch(teams, matches, draft, open?.id || null) : { warnings: [] }),
    [teams, matches, d, round, court, open],
  );

  /* 이번 타임에 다른 코트에서 뛰는 사람 · 이미 찬 코트 */
  const others = (matches || []).filter((m) => m.id !== open?.id && Number(m.round) === Number(round));
  const busy = new Set(others.flatMap((m) => [...(m.teamA || []), ...(m.teamB || [])]));
  const usedCourts = others.map((m) => Number(m.court)).sort((a, b) => a - b);

  if (!open || !d) return null;
  const need = sideSize(d.typeKey);

  const setType = (key) => {
    const n = sideSize(key);
    setD({ ...d, typeKey: key, teamA: d.teamA.slice(0, n), teamB: d.teamB.slice(0, n) });
  };
  const setTeam = (side, idx) => {
    if (side === 'A') setD({ ...d, teamAIdx: idx, teamA: idx === d.teamAIdx ? d.teamA : [] });
    else setD({ ...d, teamBIdx: idx, teamB: idx === d.teamBIdx ? d.teamB : [] });
  };
  const toggle = (side, id) => {
    const key = side === 'A' ? 'teamA' : 'teamB';
    const cur = d[key];
    if (cur.includes(id)) { setD({ ...d, [key]: cur.filter((x) => x !== id) }); return; }
    /* 다 찼으면 먼저 고른 사람을 밀어낸다 — 하나 빼고 다시 누르는 수고를 덜어 준다 */
    setD({ ...d, [key]: [...cur, id].slice(-need) });
  };

  const save = () => {
    if (check.error) { setErr(check.error); return; }
    const msg = onSave(open.id, draft);
    if (msg) setErr(msg);
  };

  const side = (s) => {
    const tIdx = s === 'A' ? d.teamAIdx : d.teamBIdx;
    const otherIdx = s === 'A' ? d.teamBIdx : d.teamAIdx;
    const picked = s === 'A' ? d.teamA : d.teamB;
    const st = teamLook(tIdx, teamNames);
    return (
      <Card style={{ marginTop: S.md, borderLeftWidth: 4, borderLeftColor: st.color }}>
        <Label hint={`${picked.length}/${need}명`}>{s === 'A' ? '왼쪽 팀' : '오른쪽 팀'}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {teams.map((_, i) => (
            <Chip key={i} tone={tIdx === i ? 'green' : 'outline'} style={i === otherIdx ? { opacity: 0.35 } : undefined}
              onPress={i === otherIdx ? undefined : () => setTeam(s, i)}>{teamLook(i, teamNames).name}</Chip>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {(teams[tIdx] || []).map((p) => {
            const on = picked.includes(p.id);
            const taken = !on && busy.has(p.id);
            return (
              <Touchable key={p.id} onPress={() => !taken && toggle(s, p.id)}
                style={{
                  paddingHorizontal: 9, paddingVertical: 6, borderRadius: R.sm,
                  borderWidth: 1.5,
                  borderColor: on ? C.green : 'transparent',
                  backgroundColor: on ? C.fill : p.gender === 'F' ? C.femaleBg : C.maleBg,
                  opacity: taken ? 0.35 : 1,
                }}>
                <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: p.gender === 'F' ? C.female : C.male }}>
                  {on ? '✓ ' : ''}{p.name}
                </Text>
              </Touchable>
            );
          })}
        </View>
        {(teams[tIdx] || []).some((p) => busy.has(p.id)) && (
          <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>흐린 이름은 이 타임에 다른 코트에서 뜁니다.</Text>
        )}
      </Card>
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface,
        }}>
          <Text style={[F.h3, { flex: 1 }]}>{open.id ? '경기 고치기' : '경기 추가'}</Text>
          <Btn small tone="ghost" onPress={onClose}>닫기</Btn>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Label>타임</Label>
                <Field keyboardType="number-pad" suffix="타임" value={round} onChangeText={setRound} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>코트</Label>
                <Field keyboardType="number-pad" suffix="번" value={court} onChangeText={setCourt} />
              </View>
            </View>
            {usedCourts.length > 0 && (
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>
                {round}타임에 이미 쓰는 코트: {usedCourts.join(', ')}
              </Text>
            )}
            <View style={{ marginTop: S.md }}>
              <Label>유형</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {TEAM_ROUND_TYPES.map((t) => (
                  <Chip key={t.key} tone={d.typeKey === t.key ? 'green' : 'outline'} onPress={() => setType(t.key)}>{t.name}</Chip>
                ))}
              </View>
            </View>
          </Card>

          {side('A')}
          {side('B')}

          {check.warnings.map((w) => (
            <Text key={w} style={{ fontSize: 12, color: C.warn, marginTop: 10 }}>⚠ {w} — 그래도 저장할 수 있습니다.</Text>
          ))}
          {!!(err || check.error) && (
            <Text style={{ fontSize: 12, color: C.danger, marginTop: 10 }}>{err || check.error}</Text>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: S.lg }}>
            <View style={{ flex: 1 }}>
              <Btn full onPress={save} disabled={!!check.error}>{open.id ? '고친 대로 저장' : '이 경기 넣기'}</Btn>
            </View>
            {!!open.id && (
              <Btn tone="danger" onPress={() => onDelete(open.id)}>삭제</Btn>
            )}
          </View>
          {!!open.id && (
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              선수·팀·유형을 바꾸면 이 경기에 넣었던 점수는 지워집니다. 타임·코트만 바꾸면 점수는 그대로입니다.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default LeagueMatchEditor;
