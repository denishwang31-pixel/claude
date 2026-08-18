/* ============================================================
   팀 리그 — 3팀 이상으로 나눠 돌려가며 붙는다

   청백전은 두 팀이라 인원이 많으면 한 팀이 10명이 되고, 뛰는 시간보다
   기다리는 시간이 길어진다. 그래서 4~6명씩 여러 팀으로 나눠 돌린다.

   화면 흐름
     1. 팀 수를 정하고 [자동 편성] — 실력·성비가 고르게 나뉜다
     2. 마음에 안 들면 선수를 눌러 다른 팀으로 옮긴다
     3. 코트·타임·타임별 유형을 정하고 [대진 자동 작성]
     4. 경기를 눌러 결과 입력 → 팀 순위가 자동으로 갱신된다
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  MIN_TEAMS, MAX_TEAMS, splitIntoTeams, teamAverage, teamComposition,
  generateLeagueMatches, leagueStandings, leaguePlayerStats, diagnoseLeague,
  teamStyle,
} from '../lib/teamLeague';
import { TEAM_ROUND_TYPES } from '../lib/teamMatch';
import { busuToNtrp } from '../lib/constants';
import { MatchGrid } from './MatchGrid';
import { AppButton, Touchable, useOptionSheet } from './native';
import { Card, SectionTitle, Chip, Field, Divider, EmptyState } from './ui';
import { Label } from './pickers';
import { C, S, R, F } from '../lib/theme';

export function TeamLeague({ roster, courts, saved, isAdmin, onSave, flash }) {
  const [teamCount, setTeamCount] = useState(saved?.teams?.length || 4);
  const [teams, setTeams] = useState(
    () => saved?.teams || splitIntoTeams(roster, 4, { busuToNtrp }),
  );
  const [matches, setMatches] = useState(saved?.matches || []);
  const [nCourts, setNCourts] = useState(String(saved?.config?.courts || courts || 2));
  const [nRounds, setNRounds] = useState(String(saved?.config?.rounds || 6));
  const [roundTypes, setRoundTypes] = useState(saved?.config?.roundTypes || {});
  const sheet = useOptionSheet();

  const cfg = {
    courts: Math.max(1, Number(nCourts) || 1),
    rounds: Math.max(1, Number(nRounds) || 1),
    roundTypes,
  };

  const nameOf = useMemo(() => {
    const map = {};
    teams.forEach((t) => t.forEach((p) => { map[p.id] = p.name; }));
    return (id) => map[id] || '?';
  }, [teams]);

  const genderOf = useMemo(() => {
    const map = {};
    teams.forEach((t) => t.forEach((p) => { map[p.id] = p.gender; }));
    return (id) => map[id] || '';
  }, [teams]);

  const standings = useMemo(() => leagueStandings(teams, matches), [teams, matches]);
  const mvp = useMemo(
    () => leaguePlayerStats(teams, matches).filter((r) => r.games > 0).slice(0, 3),
    [teams, matches],
  );
  const check = useMemo(() => diagnoseLeague(teams, cfg), [teams, nCourts, nRounds, roundTypes]);

  const persist = (next) => onSave?.({
    teams: next.teams ?? teams,
    matches: next.matches ?? matches,
    config: next.config ?? cfg,
  });

  const reshuffle = (n) => {
    const cnt = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, n));
    const next = splitIntoTeams(roster, cnt, { busuToNtrp });
    setTeamCount(cnt);
    setTeams(next);
    setMatches([]);            // 팀이 바뀌면 옛 대진은 의미가 없다
    persist({ teams: next, matches: [] });
    flash(`${cnt}개 팀으로 나눴습니다`);
  };

  /** 선수를 눌러 다른 팀으로 옮긴다 */
  const movePlayer = (player, fromIdx) => {
    if (!isAdmin) return;
    sheet.open({
      title: `${player.name} — 팀 옮기기`,
      options: teams.map((_, i) => ({
        key: String(i),
        label: `${teamStyle(i).name}${i === fromIdx ? ' (현재)' : ''}`,
      })),
      onSelect: (o) => {
        const to = Number(o.key);
        if (to === fromIdx) return;
        const next = teams.map((t, i) => {
          if (i === fromIdx) return t.filter((p) => p.id !== player.id);
          if (i === to) return [...t, player];
          return t;
        });
        setTeams(next);
        persist({ teams: next });
      },
    });
  };

  const setRoundType = (r, key) => {
    const next = { ...roundTypes, [r]: key };
    setRoundTypes(next);
    persist({ config: { ...cfg, roundTypes: next } });
  };

  const generate = () => {
    if (teams.filter((t) => t.length).length < MIN_TEAMS) {
      return flash(`선수가 있는 팀이 ${MIN_TEAMS}개 이상 필요합니다`);
    }
    const { matches: ms, shortages } = generateLeagueMatches(teams, cfg);
    if (!ms.length) return flash('편성 가능한 구성이 없습니다. 팀 인원과 타임 유형을 확인하세요');
    setMatches(ms);
    persist({ matches: ms, config: cfg });
    if (shortages.length) {
      Alert.alert('일부 코트를 채우지 못했습니다',
        `${ms.length}경기를 만들었습니다.\n\n`
        + shortages.slice(0, 6).map((s) => `${s.round}타임 ${s.court}코트 ${s.type} — ${s.reason}`).join('\n')
        + (shortages.length > 6 ? `\n외 ${shortages.length - 6}건` : ''));
      return undefined;
    }
    return flash(`${ms.length}경기를 편성했습니다`);
  };

  const editScore = (m) => {
    if (!isAdmin) return;
    const A = teamStyle(m.teamAIdx).name;
    const B = teamStyle(m.teamBIdx).name;
    sheet.open({
      title: `${m.round}타임 코트${m.court} · ${A} vs ${B}`,
      options: [
        { key: 'a', label: `${A} 승 (6:4)` },
        { key: 'b', label: `${B} 승 (4:6)` },
        { key: 'a2', label: `${A} 승 (6:2)` },
        { key: 'b2', label: `${B} 승 (2:6)` },
        { key: 'clear', label: '기록 지우기', destructive: true },
      ],
      onSelect: (o) => {
        const map = {
          a: { a: 6, b: 4 }, b: { a: 4, b: 6 },
          a2: { a: 6, b: 2 }, b2: { a: 2, b: 6 },
        };
        const next = matches.map((x) =>
          (x.id === m.id ? { ...x, score: o.key === 'clear' ? null : map[o.key] } : x));
        setMatches(next);
        persist({ matches: next });
      },
    });
  };

  return (
    <View>
      {/* 순위 */}
      {matches.length > 0 && (
        <>
          <SectionTitle hint="승점 → 게임 득실 → 총 득점 순">팀 순위</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ width: 28, fontSize: 10, color: C.faint, fontWeight: '700' }}>순위</Text>
              <Text style={{ flex: 1, fontSize: 10, color: C.faint, fontWeight: '700' }}>팀</Text>
              <Text style={{ width: 62, fontSize: 10, color: C.faint, fontWeight: '700', textAlign: 'center' }}>승-무-패</Text>
              <Text style={{ width: 44, fontSize: 10, color: C.faint, fontWeight: '700', textAlign: 'center' }}>득실</Text>
            </View>
            {standings.map((r) => {
              const st = teamStyle(r.idx);
              return (
                <View key={r.idx} style={{
                  flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
                  borderBottomWidth: 1, borderBottomColor: '#f5f5f4',
                }}>
                  <Text style={{
                    width: 28, fontSize: 13, fontWeight: '900',
                    color: r.rank === 1 ? C.green : C.sub,
                  }}>
                    {r.rank === 1 ? '🥇' : r.rank}
                  </Text>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{
                      paddingHorizontal: 7, paddingVertical: 2,
                      borderRadius: R.sm, backgroundColor: st.bg,
                    }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: st.color }}>{st.name}</Text>
                    </View>
                    <Text style={{ fontSize: 10.5, color: C.faint }}>{r.players}명</Text>
                  </View>
                  <Text style={{ width: 62, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
                    {r.wins}-{r.draws}-{r.losses}
                  </Text>
                  <Text style={{
                    width: 44, fontSize: 12, textAlign: 'center',
                    color: r.diff > 0 ? C.green : r.diff < 0 ? C.danger : C.sub,
                    fontWeight: '700',
                  }}>
                    {r.diff > 0 ? '+' : ''}{r.diff}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      )}

      {/* 팀 편성 */}
      <SectionTitle
        hint={isAdmin ? '선수를 누르면 다른 팀으로 옮길 수 있습니다.' : undefined}>
        팀 편성
      </SectionTitle>

      {isAdmin && (
        <Card style={{ marginBottom: 10 }}>
          <Label hint="인원이 많을수록 팀을 늘리면 대기가 짧아집니다">팀 수</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => i + MIN_TEAMS).map((n) => (
              <Chip key={n} tone={teamCount === n ? 'green' : 'outline'}
                onPress={() => reshuffle(n)}>
                {n}팀
              </Chip>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
            참가자 {roster.length}명 · {teamCount}팀이면 팀당 약 {Math.round(roster.length / teamCount)}명.
            누르면 실력·성비가 고르게 다시 나뉩니다(기존 대진은 지워집니다).
          </Text>
        </Card>
      )}

      <View style={{ gap: 8 }}>
        {teams.map((team, i) => {
          const st = teamStyle(i);
          const comp = teamComposition(team);
          return (
            <Card key={i} style={{ borderLeftWidth: 4, borderLeftColor: st.color }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: st.color }}>{st.name}</Text>
                <Text style={{ fontSize: 11.5, color: C.sub, flex: 1 }}>
                  {comp.total}명 (남 {comp.male} · 여 {comp.female})
                </Text>
                <Text style={{ fontSize: 11, color: C.faint }}>
                  평균 {teamAverage(team, { busuToNtrp })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {team.map((p) => (
                  <Touchable key={p.id} onPress={() => movePlayer(p, i)}
                    style={{
                      paddingHorizontal: 9, paddingVertical: 6, borderRadius: R.sm,
                      backgroundColor: p.gender === 'F' ? C.femaleBg : C.maleBg,
                    }}>
                    <Text style={{
                      fontSize: 12, fontWeight: '700',
                      color: p.gender === 'F' ? C.female : C.male,
                    }}>
                      {p.name}
                    </Text>
                  </Touchable>
                ))}
                {team.length === 0 && (
                  <Text style={{ fontSize: 11.5, color: C.faint }}>선수가 없습니다.</Text>
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {/* 대진 설정 */}
      {isAdmin && (
        <>
          <SectionTitle>대진 설정</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Label hint="동시에 쓰는 코트">코트 면수</Label>
                <Field keyboardType="number-pad" suffix="면"
                  value={nCourts} onChangeText={setNCourts} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>타임 수</Label>
                <Field keyboardType="number-pad" suffix="타임"
                  value={nRounds} onChangeText={setNRounds} />
              </View>
            </View>

            <Divider style={{ marginVertical: S.md }} />

            <Label hint="타임마다 어떤 경기를 할지">타임별 경기 유형</Label>
            <View style={{ gap: 6 }}>
              {Array.from({ length: Math.max(1, Math.min(30, Number(nRounds) || 1)) }, (_, i) => i + 1)
                .map((r) => {
                  const cur = roundTypes[r] || roundTypes[String(r)] || 'MX';
                  return (
                    <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ width: 42, fontSize: 12, fontWeight: '700', color: C.sub }}>
                        {r}타임
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 }}>
                        {TEAM_ROUND_TYPES.map((t) => (
                          <Chip key={t.key} tone={cur === t.key ? 'green' : 'outline'}
                            onPress={() => setRoundType(r, t.key)}>{t.name}</Chip>
                        ))}
                      </View>
                    </View>
                  );
                })}
            </View>

            {!check.ok && (
              <View style={{
                marginTop: S.md, padding: 10, borderRadius: R.md, backgroundColor: C.warnBg,
              }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: C.warn }}>
                  이대로 짜면 빈 칸이 생깁니다
                </Text>
                {check.problems.slice(0, 5).map((p) => (
                  <Text key={p} style={{ fontSize: 11, color: C.warn, marginTop: 3 }}>· {p}</Text>
                ))}
              </View>
            )}

            <View style={{ marginTop: S.lg }}>
              <AppButton full onPress={generate}>
                {matches.length ? '대진 다시 작성' : '대진 자동 작성'}
              </AppButton>
            </View>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              아직 안 만난 팀끼리 먼저 붙입니다. 한 타임에 같은 팀이 두 코트로
              갈라지지 않으므로, 한 팀은 한 코트에 모여 있습니다.
            </Text>
          </Card>
        </>
      )}

      {/* 대진표 */}
      {matches.length > 0 ? (
        <>
          <SectionTitle hint={isAdmin ? '경기를 누르면 결과를 기록합니다.' : undefined}>
            대진표
          </SectionTitle>
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={matches} nameOf={nameOf} genderOf={genderOf}
              onPressMatch={editScore} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {teams.map((_, i) => {
                const st = teamStyle(i);
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
                    <Text style={{ fontSize: 9, color: C.faint }}>{st.name}</Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* 어느 팀끼리 붙는 경기인지 — 표에는 이름만 나온다 */}
          <Card style={{ marginTop: S.sm, paddingVertical: 6 }}>
            {[...new Set(matches.map((m) => m.round))].sort((a, b) => a - b).map((r) => (
              <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 }}>
                <Text style={{ width: 42, fontSize: 11, fontWeight: '700', color: C.sub }}>{r}타임</Text>
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {matches.filter((m) => m.round === r).map((m) => (
                    <View key={m.id} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 3,
                      paddingHorizontal: 7, paddingVertical: 3,
                      borderRadius: R.sm, backgroundColor: C.fill,
                    }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: teamStyle(m.teamAIdx).color }}>
                        {teamStyle(m.teamAIdx).name}
                      </Text>
                      <Text style={{ fontSize: 9, color: C.faint }}>vs</Text>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: teamStyle(m.teamBIdx).color }}>
                        {teamStyle(m.teamBIdx).name}
                      </Text>
                      <Text style={{ fontSize: 9, color: C.faint }}>
                        {m.score ? ` ${m.score.a}:${m.score.b}` : ` ${m.type}`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </Card>

          {mvp.length > 0 && (
            <>
              <SectionTitle>오늘의 MVP</SectionTitle>
              <Card style={{ paddingVertical: 6 }}>
                {mvp.map((r, i) => (
                  <View key={r.id} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                  }}>
                    <Text style={{ fontSize: 16 }}>{['🥇', '🥈', '🥉'][i]}</Text>
                    <Text style={[F.bodyBold, { flex: 1 }]}>{r.name}</Text>
                    <Text style={{ fontSize: 11, color: C.faint }}>{r.team}</Text>
                    <Text style={{ fontSize: 12, color: C.sub }}>{r.games}경기</Text>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.green }}>{r.wins}승</Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      ) : (
        <View style={{ marginTop: S.lg }}>
          <EmptyState
            icon="🚩"
            title="아직 대진이 없습니다"
            body={isAdmin
              ? '팀 편성을 확인한 뒤 [대진 자동 작성]을 누르세요.'
              : '운영진이 편성하면 여기에 표시됩니다.'}
          />
        </View>
      )}

      {sheet.node}
    </View>
  );
}

export default TeamLeague;
