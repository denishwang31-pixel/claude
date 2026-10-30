/* ============================================================
   클럽 대회 — KDK 부 한 개 (개인전, 매 경기 파트너 교체)

   시간표(타임 × 코트) · 결과 입력 · 개인 순위. 팀 고정 조별리그와 달리
   본선 토너먼트 없이 개인 순위로 끝난다(조가 여럿이면 조마다 1위).
   계산: src/lib/groupLeague.js kdkTables / setKdkScore
   ============================================================ */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { kdkTables, setKdkScore, KDK_RANK_TEXT } from '../lib/groupLeague';
import { MatchGrid } from './MatchGrid';
import { ScoreSheet } from './MatchBoard';
import { MINE } from './Mine';
import { Card, SectionTitle } from './ui';
import { C, F } from '../lib/theme';

function KdkTable({ g, me }) {
  const W = { rank: 26, n: 28, wl: 28 };
  const head = (t, w) => <Text style={{ width: w, textAlign: 'center', fontSize: 10.5, color: C.faint, fontWeight: '700' }}>{t}</Text>;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {head('순위', W.rank)}
        <Text style={{ flex: 1, fontSize: 10.5, color: C.faint, fontWeight: '700', paddingLeft: 6 }}>이름</Text>
        {head('경기', W.n)}
        {head('승', W.wl)}
        {head('패', W.wl)}
        {head('득실', 36)}
      </View>
      {g.standings.map((r) => {
        const top = r.rank === 1 && r.played > 0;
        const mine = r.id === me;
        return (
          <View key={r.id} style={{
            flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
            borderBottomWidth: 1, borderBottomColor: C.fill, backgroundColor: mine ? MINE.bg : 'transparent',
          }}>
            <View style={{ width: W.rank, alignItems: 'center' }}>
              <View style={{
                minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
                backgroundColor: top ? C.green : C.fill, alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: top ? '#fff' : C.sub }}>{r.rank}{r.tie ? '=' : ''}</Text>
              </View>
            </View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontWeight: mine ? '800' : '600', color: C.text, paddingLeft: 6 }}>{r.name}</Text>
            <Text style={{ width: W.n, textAlign: 'center', fontSize: 12, color: C.sub }}>{r.played}</Text>
            <Text style={{ width: W.wl, textAlign: 'center', fontSize: 12.5, fontWeight: '800', color: C.green }}>{r.w}</Text>
            <Text style={{ width: W.wl, textAlign: 'center', fontSize: 12, color: C.sub }}>{r.l}</Text>
            <Text style={{
              width: 36, textAlign: 'center', fontSize: 12, fontWeight: '700',
              color: r.diff > 0 ? C.green2 : r.diff < 0 ? C.danger : C.faint,
            }}>{r.diff > 0 ? '+' : ''}{r.diff}</Text>
          </View>
        );
      })}
      <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>
        경기 {g.progress.done}/{g.progress.total}{g.progress.finished ? ' · 경기 끝' : ''}
      </Text>
    </View>
  );
}

/**
 * @param kdk     대회의 t.kdk 전체(저장할 때 이 부만 바꿔 돌려준다)
 * @param div     부 키
 * @param onSave  (nextKdk, msg) => void
 */
export function KdkDivView({ kdk, div, games = 6, venue, nameOf, me = '', canEdit, onSave, title = '' }) {
  const d = kdk?.[div];
  const [scoring, setScoring] = useState(null);
  if (!d?.matches?.length) return null;
  const pname = (id) => d.players.find((p) => p.id === id)?.name || nameOf(id);
  const team = (ids) => (ids || []).map(pname).join('·');
  const cn = (c) => (venue?.courtNames && venue.courtNames[c - 1]) || String(c);
  const tables = kdkTables(d);

  /* 결과 입력 — 게임 수 직접 입력 · 타이브레이크 체크(MatchBoard ScoreSheet, 2026-10-30 앱 주인) */
  const record = (m) => {
    if (!canEdit) return;
    setScoring({
      match: m, title: `${m.round}타임 · 코트 ${cn(m.court)} · ${games}게임 선승`,
      A: { name: team(m.teamA) }, B: { name: team(m.teamB) }, allowDraw: false,
    });
  };
  const saveScore = (score) => {
    const m = scoring?.match;
    setScoring(null);
    if (m) onSave(setKdkScore(kdk, div, m.id, score), score ? '' : '결과를 지웠습니다');
  };

  return (
    <View>
      <SectionTitle hint={canEdit ? '칸을 누르면 결과를 넣습니다 · 매 경기 파트너가 바뀝니다' : '매 경기 파트너가 바뀝니다 · 내 경기는 초록 테두리'}>
        {title}KDK 시간표
      </SectionTitle>
      <Card style={{ padding: 10 }}>
        <MatchGrid matches={d.matches} nameOf={pname} me={me} venue={venue} onPressMatch={canEdit ? record : undefined} />
      </Card>
      <ScoreSheet target={scoring} onSave={saveScore} onClose={() => setScoring(null)} />
      <SectionTitle hint={`순위: ${KDK_RANK_TEXT}`}>{title}개인 순위 (실시간)</SectionTitle>
      {tables.map((g) => (
        <Card key={g.gi} style={{ marginBottom: 8 }}>
          {!!g.name && <Text style={[F.bodyBold, { marginBottom: 6 }]}>{g.name}</Text>}
          <KdkTable g={g} me={me} />
        </Card>
      ))}
    </View>
  );
}

export default KdkDivView;
