/* ============================================================
   대회 현황 — 청백전(2팀·3팀)·팀 리그 화면 맨 위 (대진을 짠 뒤)

   2026-10-06 앱 주인: 엑셀 '대시보드'를 앱에. "다 보이면 피곤하니 주요 결과만, 나머지는 접기"
     · 늘 보이는 것: 진행 · 팀 순위(+ 오늘의 MVP 남·여 1위) · 개인 순위 남녀 TOP 5
     · [종목별·맞대결 승점] 접기
     · [전체 선수 기록] 접기 — 운영진만
   계산은 lib/tourneyStats.js(공개 웹 링크와 같은 계산).
   ============================================================ */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Card, SectionTitle } from './ui';
import { Fold } from './MatchBoard';
import { C, R } from '../lib/theme';
import { pct, ptsText } from '../lib/tourneyStats';

const H = ({ w, flex, children, center = true }) => (
  <Text style={{ width: w, flex, fontSize: 10, color: C.faint, fontWeight: '700', textAlign: center ? 'center' : 'left' }}>{children}</Text>
);
const TeamPill = ({ t, small }) => (
  <View style={{ paddingHorizontal: small ? 5 : 7, paddingVertical: small ? 1 : 2, borderRadius: R.sm, backgroundColor: t.bg, borderWidth: t.white ? 1 : 0, borderColor: '#111827' }}>
    <Text style={{ fontSize: small ? 10 : 11.5, fontWeight: '800', color: t.color }}>{t.name}</Text>
  </View>
);
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
const diffColor = (n) => (n > 0 ? C.green : n < 0 ? C.danger : C.sub);

/** 개인 순위 표 — rows 는 tourneyStats players.M/F 의 한 묶음 */
function PlayerTable({ rows, look, full = false }) {
  if (!rows.length) return <Text style={{ fontSize: 11.5, color: C.faint, paddingVertical: 6 }}>아직 경기한 사람이 없습니다</Text>;
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <H w={26}>순위</H><H flex={1} center={false}>선수</H><H w={30}>경기</H><H w={50}>승-무-패</H><H w={46}>승률</H>
        {full && <H w={36}>득실</H>}
      </View>
      {rows.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}>
          <Text style={{ width: 26, fontSize: 12.5, fontWeight: '900', textAlign: 'center', color: r.rank === 1 ? C.green : C.sub }}>
            {r.rank == null ? '-' : r.rank === 1 ? '🥇' : r.rank}
          </Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: C.text, flexShrink: 1 }}>{r.name}</Text>
            <TeamPill t={look(r.team)} small />
          </View>
          <Text style={{ width: 30, fontSize: 12, textAlign: 'center', color: C.sub }}>{r.games}</Text>
          <Text style={{ width: 50, fontSize: 12, textAlign: 'center', fontWeight: '700' }}>{r.games ? `${r.w}-${r.d}-${r.l}` : '-'}</Text>
          <Text style={{ width: 46, fontSize: 12, textAlign: 'center', fontWeight: '800', color: C.text }}>{r.games ? pct(r.rate) : '-'}</Text>
          {full && <Text style={{ width: 36, fontSize: 11.5, textAlign: 'center', color: diffColor(r.diff), fontWeight: '700' }}>{r.games ? signed(r.diff) : '-'}</Text>}
        </View>
      ))}
    </View>
  );
}

/**
 * @param dash    tourneyStats.tourneyDashboard 결과
 * @param look    팀 번호 → { name, color, bg, white }
 * @param isAdmin 운영진이면 [전체 선수 기록]
 */
export function TournamentDashboard({ dash, look, isAdmin }) {
  const [more, setMore] = useState(false);
  const [all, setAll] = useState(false);
  if (!dash) return null;
  const { progress: pg, standings, byType, h2h, top, mvp, players, rule } = dash;
  const started = pg.done > 0;
  const teamIds = standings.map((r) => r.idx).sort((a, b) => a - b);

  return (
    <View>
      <SectionTitle hint={rule === 'wins' ? '이긴 경기 → 득실차' : '승점(승 1·무 0.5) → 득실차'}>🏆 대회 현황</SectionTitle>
      <Card>
        {/* 진행 */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.text }}>{pg.done}</Text>
          <Text style={{ fontSize: 13, color: C.sub }}>/ {pg.total}경기 끝남{pg.lastRound ? ` · 마지막 입력 ${pg.lastRound}타임` : ''}</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.fill, marginTop: 6, overflow: 'hidden' }}>
          <View style={{ width: `${pg.total ? Math.round((pg.done / pg.total) * 100) : 0}%`, height: 6, backgroundColor: C.green }} />
        </View>

        {/* 팀 순위 */}
        <View style={{ flexDirection: 'row', paddingVertical: 6, marginTop: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <H w={28}>순위</H><H flex={1} center={false}>팀</H><H w={40}>승점</H><H w={58}>승-무-패</H><H w={42}>득실</H>
        </View>
        {standings.map((r) => (
          <View key={r.idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}>
            <Text style={{ width: 28, fontSize: 13, fontWeight: '900', textAlign: 'center', color: r.rank === 1 && started ? C.green : C.sub }}>
              {r.rank === 1 && started ? '🥇' : r.rank}
            </Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TeamPill t={look(r.idx)} />
              <Text style={{ fontSize: 10.5, color: C.faint }}>{r.players}명</Text>
            </View>
            <Text style={{ width: 40, fontSize: 14, fontWeight: '900', textAlign: 'center', color: C.text }}>{ptsText(r.pts)}</Text>
            <Text style={{ width: 58, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{r.w}-{r.d}-{r.l}</Text>
            <Text style={{ width: 42, fontSize: 12, fontWeight: '700', textAlign: 'center', color: diffColor(r.diff) }}>{signed(r.diff)}</Text>
          </View>
        ))}

        {/* 오늘의 MVP — 남·여 1위 */}
        {(mvp.M.length > 0 || mvp.F.length > 0) && (
          <View style={{ marginTop: 12, padding: 10, borderRadius: R.md, backgroundColor: '#FEF9C3', flexDirection: 'row', gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#854D0E' }}>오늘의{'\n'}MVP</Text>
            {[['M', '남'], ['F', '여']].map(([g, l]) => (mvp[g].length ? (
              <View key={g} style={{ flex: 1 }}>
                <Text style={{ fontSize: 10.5, color: '#A16207', fontWeight: '700' }}>{l} 1위{mvp[g].length > 1 ? ` (공동 ${mvp[g].length}명)` : ''}</Text>
                {mvp[g].slice(0, 3).map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '900', color: C.text, flexShrink: 1 }}>🏅 {p.name}</Text>
                    <TeamPill t={look(p.team)} small />
                  </View>
                ))}
                {mvp[g].length > 3 && <Text style={{ fontSize: 10.5, color: C.sub }}>외 {mvp[g].length - 3}명</Text>}
                <Text style={{ fontSize: 10.5, color: C.sub, marginTop: 1 }}>{mvp[g][0].w}-{mvp[g][0].d}-{mvp[g][0].l} · 승률 {pct(mvp[g][0].rate)}</Text>
              </View>
            ) : <View key={g} style={{ flex: 1 }} />))}
          </View>
        )}

        {/* 개인 순위 TOP 5 — 모든 회원 */}
        {[['M', '남자'], ['F', '여자']].map(([g, l]) => (
          <View key={g} style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '900', color: C.text, marginBottom: 2 }}>{l} TOP 5</Text>
            <PlayerTable rows={top[g]} look={look} />
          </View>
        ))}
        <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>개인 순위: 승률((승+무×0.5)÷경기) → 득실차 → 딴 게임</Text>
      </Card>

      {/* 더 보기 — 종목별 · 맞대결 */}
      <Fold title="종목별 · 맞대결 승점" open={more} onToggle={() => setMore(!more)} summary="남복·여복·혼복별 팀 승점, 팀끼리 붙었을 때의 승점">
        <Card>
          <Text style={{ fontSize: 12.5, fontWeight: '900', color: C.text }}>종목별 승점</Text>
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <H w={56} center={false}>종목</H>
            {teamIds.map((i) => <H key={i} flex={1}>{look(i).name}</H>)}
            <H w={56}>완료/전체</H>
          </View>
          {byType.map((b) => (
            <View key={b.type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}>
              <Text style={{ width: 56, fontSize: 12, fontWeight: '800' }}>{b.type}</Text>
              {teamIds.map((i) => <Text key={i} style={{ flex: 1, fontSize: 12.5, fontWeight: '800', textAlign: 'center', color: look(i).white ? '#111827' : look(i).color }}>{ptsText(b.pts[i] || 0)}</Text>)}
              <Text style={{ width: 56, fontSize: 11.5, textAlign: 'center', color: C.sub }}>{b.done}/{b.total}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 12.5, fontWeight: '900', color: C.text, marginTop: 14 }}>맞대결 승점 <Text style={{ fontSize: 10.5, color: C.faint, fontWeight: '600' }}>(가로 팀이 세로 팀을 상대로)</Text></Text>
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <H w={56} center={false}> </H>
            {teamIds.map((j) => <H key={j} flex={1}>vs {look(j).name}</H>)}
          </View>
          {teamIds.map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}>
              <View style={{ width: 56 }}><TeamPill t={look(i)} small /></View>
              {teamIds.map((j) => (
                <Text key={j} style={{ flex: 1, fontSize: 12.5, fontWeight: '800', textAlign: 'center', color: i === j ? C.faint : C.text }}>
                  {i === j ? '—' : ptsText(h2h[i]?.[j] || 0)}
                </Text>
              ))}
            </View>
          ))}
        </Card>
      </Fold>

      {/* 전체 선수 기록 — 운영진만 */}
      {isAdmin && (
        <Fold title="전체 선수 기록 (운영진)" open={all} onToggle={() => setAll(!all)} summary="모든 참가자의 순위 · 승-무-패 · 승률 · 득실">
          <Card>
            {[['M', '남자'], ['F', '여자']].map(([g, l]) => (
              <View key={g} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '900', color: C.text, marginBottom: 2 }}>{l} {players[g].length}명</Text>
                <PlayerTable rows={players[g]} look={look} full />
              </View>
            ))}
            <Text style={{ fontSize: 10.5, color: C.faint }}>순위: 승률 → 득실차 → 딴 게임 · 경기 없는 사람은 순위 '-'</Text>
          </Card>
        </Fold>
      )}
    </View>
  );
}

export default TournamentDashboard;
