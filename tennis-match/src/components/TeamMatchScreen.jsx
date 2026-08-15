/* ============================================================
   단체전 화면 — 청백전 / 클럽 교류전

   두 형식이 거의 같아서 한 화면으로 처리한다. 차이는 B팀을 어디서
   데려오느냐뿐이다.
     청백전     : 참석 회원을 실력·성별이 고르게 두 팀으로 자동 분할
     클럽교류전 : A팀은 우리 회원, B팀은 상대 클럽 선수를 직접 입력
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  splitTeams, teamStrength, generateTeamMatches, teamScore, teamPlayerStats,
} from '../lib/teamMatch';
import { TOURNAMENT_FORMAT, TEAM_SIDES, BUSU_KEYS, busuToNtrp } from '../lib/constants';
import { MatchGrid } from './MatchGrid';
import { AppButton, Segmented, Touchable, useOptionSheet } from './native';
import { Card, SectionTitle, Chip, Field, Divider, EmptyState, CheckRow } from './ui';
import { Label } from './pickers';
import { C, S, R, F } from '../lib/theme';

const rid = () => 'x' + Math.random().toString(36).slice(2, 8);

/** 팀 배지 */
function TeamTag({ side, children }) {
  return (
    <View style={{ backgroundColor: side.bg, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '800', color: side.color }}>{children}</Text>
    </View>
  );
}

export function TeamMatch({
  format, attendees, courts, rounds, saved, onSave, isAdmin, flash,
}) {
  const sides = TEAM_SIDES[format] || TEAM_SIDES[TOURNAMENT_FORMAT.TEAM_BLUE_WHITE];
  const isClubMatch = format === TOURNAMENT_FORMAT.TEAM_CLUB;

  /* 저장된 편성이 있으면 그걸 쓰고, 없으면 자동 분할 결과를 보여준다 */
  const [teamA, setTeamA] = useState(() => saved?.teamA
    || (isClubMatch ? attendees : splitTeams(attendees, { busuToNtrp }).teamA));
  const [teamB, setTeamB] = useState(() => saved?.teamB
    || (isClubMatch ? [] : splitTeams(attendees, { busuToNtrp }).teamB));
  const [matches, setMatches] = useState(saved?.matches || []);
  const [sameSexOnly, setSameSexOnly] = useState(false);
  const [nRounds, setNRounds] = useState(String(rounds || 4));

  /* 상대 클럽 선수 입력 */
  const [opp, setOpp] = useState({ name: '', gender: 'M', busu: '' });
  const [oppClub, setOppClub] = useState(saved?.opponentClub || '');
  const sheet = useOptionSheet();

  const strengthA = useMemo(() => teamStrength(teamA, { busuToNtrp }), [teamA]);
  const strengthB = useMemo(() => teamStrength(teamB, { busuToNtrp }), [teamB]);
  const score = useMemo(() => teamScore(matches), [matches]);
  const mvp = useMemo(
    () => teamPlayerStats([...teamA, ...teamB], matches).filter((r) => r.games > 0).slice(0, 3),
    [teamA, teamB, matches],
  );

  const nameOf = useMemo(() => {
    const map = {};
    [...teamA, ...teamB].forEach((p) => { map[p.id] = p.name; });
    return (id) => map[id] || '?';
  }, [teamA, teamB]);

  const reshuffle = () => {
    const { teamA: a, teamB: b } = splitTeams(attendees, { busuToNtrp });
    setTeamA(a); setTeamB(b);
    flash('팀을 다시 나눴습니다');
  };

  /** 사람을 반대편으로 옮기기 */
  const move = (p, from) => {
    if (from === 'A') { setTeamA(teamA.filter((x) => x.id !== p.id)); setTeamB([...teamB, p]); }
    else { setTeamB(teamB.filter((x) => x.id !== p.id)); setTeamA([...teamA, p]); }
  };

  const addOpponent = () => {
    if (!opp.name.trim()) return flash('선수 이름을 입력하세요');
    setTeamB([...teamB, {
      id: `opp:${rid()}`,
      name: opp.name.trim(),
      gender: opp.gender,
      busu: opp.busu,
      external: true,
    }]);
    setOpp({ name: '', gender: 'M', busu: '' });
    return flash('상대 선수를 추가했습니다');
  };

  const gen = () => {
    if (teamA.length < 2 || teamB.length < 2) {
      return Alert.alert('인원이 부족합니다',
        `${sides[0].name} ${teamA.length}명 · ${sides[1].name} ${teamB.length}명\n\n`
        + '단체전은 양 팀 모두 최소 2명이 필요합니다.');
    }
    const ms = generateTeamMatches(teamA, teamB, courts, Number(nRounds) || 4, { sameSexOnly });
    if (!ms.length) return flash('편성 가능한 구성이 없습니다');
    setMatches(ms);
    onSave?.({ teamA, teamB, matches: ms, opponentClub: oppClub, format });
    return flash(`${ms.length}경기 생성`);
  };

  const editScore = (m) => {
    if (!isAdmin) return;
    sheet.open({
      title: `${m.round}타임 코트${m.court}`,
      options: [
        { key: 'a', label: `${sides[0].name} 승 (6:4)` },
        { key: 'b', label: `${sides[1].name} 승 (4:6)` },
        { key: 'clear', label: '기록 지우기' },
      ],
      onSelect: (o) => {
        const next = matches.map((x) => {
          if (x.id !== m.id) return x;
          if (o.key === 'clear') return { ...x, score: null };
          return { ...x, score: o.key === 'a' ? { a: 6, b: 4 } : { a: 4, b: 6 } };
        });
        setMatches(next);
        onSave?.({ teamA, teamB, matches: next, opponentClub: oppClub, format });
      },
    });
  };

  const TeamColumn = ({ team, side, which }) => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <TeamTag side={side}>{side.name}</TeamTag>
        <Text style={{ fontSize: 11.5, color: C.sub }}>{team.length}명</Text>
      </View>
      <View style={{ gap: 5 }}>
        {team.map((p) => (
          <Touchable key={p.id} onPress={() => isAdmin && !p.external && move(p, which)}
            style={{
              backgroundColor: side.bg, borderRadius: R.sm,
              paddingHorizontal: 9, paddingVertical: 7,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: side.color, flex: 1 }}>
              {p.name}
              <Text style={{ fontWeight: '400', fontSize: 11 }}>
                {p.gender === 'F' ? ' 여' : ' 남'}{p.busu ? ` · ${p.busu}` : ''}
              </Text>
            </Text>
            {isAdmin && !p.external && (
              <Text style={{ fontSize: 12, color: side.color, opacity: 0.5 }}>
                {which === 'A' ? '→' : '←'}
              </Text>
            )}
          </Touchable>
        ))}
        {team.length === 0 && (
          <Text style={{ fontSize: 11.5, color: C.faint }}>선수가 없습니다.</Text>
        )}
      </View>
    </View>
  );

  return (
    <View>
      {/* 점수판 */}
      {matches.length > 0 && (
        <Card style={{ backgroundColor: C.ink }}>
          <Text style={{ color: C.lime, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' }}>
            {isClubMatch ? '클럽 교류전' : '청백전'} 스코어
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: S.md }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' }}>
                {isClubMatch ? '우리 클럽' : sides[0].name}
              </Text>
              <Text style={{ color: score.winner === 'A' ? C.lime : '#fff', fontSize: 40, fontWeight: '700' }}>
                {score.a}
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '700' }}>:</Text>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                {isClubMatch ? (oppClub || '상대 클럽') : sides[1].name}
              </Text>
              <Text style={{ color: score.winner === 'B' ? C.lime : '#fff', fontSize: 40, fontWeight: '700' }}>
                {score.b}
              </Text>
            </View>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
            {score.played}/{score.total}경기 완료 · 총 게임 {score.gamesA}:{score.gamesB}
            {score.winner ? ` · ${score.winner === 'A' ? (isClubMatch ? '우리 클럽' : sides[0].name) : (isClubMatch ? (oppClub || '상대') : sides[1].name)} 우세` : ' · 동점'}
          </Text>
        </Card>
      )}

      {/* 팀 편성 */}
      <SectionTitle
        hint={isAdmin && !isClubMatch ? '선수를 누르면 반대 팀으로 옮겨집니다.' : undefined}
        right={isAdmin && !isClubMatch
          ? <Chip tone="soft" onPress={reshuffle}>다시 나누기</Chip>
          : undefined}>
        팀 편성
      </SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', gap: S.md }}>
          <TeamColumn team={teamA} side={sides[0]} which="A" />
          <View style={{ width: 1, backgroundColor: C.border }} />
          <TeamColumn team={teamB} side={sides[1]} which="B" />
        </View>

        {!isClubMatch && (
          <>
            <Divider style={{ marginVertical: S.md }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11.5, color: C.sub }}>
                평균 실력 {sides[0].name} <Text style={{ fontWeight: '800', color: C.text }}>{strengthA}</Text>
              </Text>
              <Text style={{ fontSize: 11.5, color: C.sub }}>
                {sides[1].name} <Text style={{ fontWeight: '800', color: C.text }}>{strengthB}</Text>
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: Math.abs(strengthA - strengthB) < 0.25 ? C.green2 : C.warn, marginTop: 4 }}>
              {Math.abs(strengthA - strengthB) < 0.25
                ? '✓ 전력이 고르게 나뉘었습니다'
                : `△ 실력 차 ${Math.abs(strengthA - strengthB).toFixed(2)} — 선수를 눌러 조정하세요`}
            </Text>
          </>
        )}
      </Card>

      {/* 상대 클럽 선수 입력 */}
      {isClubMatch && isAdmin && (
        <>
          <SectionTitle>상대 클럽 선수 등록</SectionTitle>
          <Card>
            <Label>상대 클럽 이름</Label>
            <Field placeholder="예: 한강 테니스클럽" value={oppClub} onChangeText={setOppClub} />

            <View style={{ marginTop: S.md }}>
              <Label>선수 이름</Label>
              <Field placeholder="이름" value={opp.name} onChangeText={(v) => setOpp({ ...opp, name: v })} />
            </View>

            <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.md }}>
              <View style={{ flex: 1 }}>
                <Label>성별</Label>
                <Segmented
                  options={[{ key: 'M', label: '남' }, { key: 'F', label: '여' }]}
                  value={opp.gender}
                  onChange={(v) => setOpp({ ...opp, gender: v })}
                />
              </View>
            </View>

            <View style={{ marginTop: S.md }}>
              <Label hint="선택 · 대진 실력 배분에 쓰입니다">부수</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {BUSU_KEYS.map((b) => (
                  <Chip key={b} tone={opp.busu === b ? 'green' : 'outline'}
                    onPress={() => setOpp({ ...opp, busu: opp.busu === b ? '' : b })}>{b}</Chip>
                ))}
              </View>
            </View>

            <View style={{ marginTop: S.lg }}>
              <AppButton full variant="tonal" icon="＋" onPress={addOpponent}>상대 선수 추가</AppButton>
            </View>
          </Card>
        </>
      )}

      {/* 편성 */}
      {isAdmin && (
        <>
          <SectionTitle>대진 생성</SectionTitle>
          <Card>
            <Label hint="몇 타임을 돌릴지">타임 수</Label>
            <Field keyboardType="number-pad" value={nRounds} onChangeText={setNRounds} suffix="타임" />

            <View style={{ marginTop: S.lg }}>
              <CheckRow
                checked={sameSexOnly}
                onToggle={() => setSameSexOnly(!sameSexOnly)}
                label="같은 성별끼리만 팀 구성"
                hint="켜면 남남·여여 짝만 만듭니다. 인원이 안 맞으면 자동으로 완화됩니다."
              />
            </View>

            <View style={{ marginTop: S.lg }}>
              <AppButton full onPress={gen}>
                {matches.length ? '대진 다시 생성' : '대진 생성'}
              </AppButton>
            </View>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              모든 경기는 {sides[0].name} 2명 vs {sides[1].name} 2명으로 짜입니다.
              팀 안에서 맞붙는 경기는 생기지 않습니다.
            </Text>
          </Card>
        </>
      )}

      {/* 대진표 */}
      {matches.length > 0 ? (
        <>
          <SectionTitle hint={isAdmin ? '경기를 누르면 승패를 기록합니다.' : undefined}>대진표</SectionTitle>
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={matches} nameOf={nameOf} onPressMatch={editScore} />
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
            icon={isClubMatch ? '🤝' : '🔵'}
            title="아직 대진이 없습니다"
            body={isAdmin
              ? '팀 편성을 확인한 뒤 [대진 생성]을 누르세요.'
              : '운영진이 편성하면 여기에 표시됩니다.'}
          />
        </View>
      )}

      {sheet.node}
    </View>
  );
}

export default TeamMatch;
