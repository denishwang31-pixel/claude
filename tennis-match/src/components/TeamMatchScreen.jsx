/* ============================================================
   단체전 화면 — 청백전 / 클럽 교류전

   두 형식이 거의 같아서 한 화면으로 처리한다. 차이는 B팀을 어디서
   데려오느냐뿐이다.
     청백전     : 참석 회원을 실력·성별이 고르게 두 팀으로 자동 분할(자동 배치),
                  또는 모두 '미배정'에서 시작해 운영진이 넣는다(수동 배치).
                  회원을 여러 명 골라 한 번에 반대 팀·미배정으로 옮긴다 — 3팀 청백전과 같은 방식
                  (lib/teamLeague.js moveToTeam · 2026-10-04 앱 주인)
     클럽교류전 : A팀은 우리 회원, B팀은 상대 클럽 선수를 직접 입력
   ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  splitTeams, teamStrength, generateTeamMatches, teamScore, teamPlayerStats,
} from '../lib/teamMatch';
import {
  moveToTeam, UNASSIGNED, withTeamIdx, twoTeamSide, actualMatchType, gridExtent,
  addLeagueMatch, updateLeagueMatch, removeLeagueMatch, matchToDraft, emptyDraft,
} from '../lib/teamLeague';
import { LeagueMatchEditor } from './LeagueMatchEditor';
import { courtLabel } from '../lib/courtNames';
import { CourtNamesEditor } from './CourtNamesEditor';
import { guard, later, breadcrumb, slowRender } from '../lib/crashReport';
import { TOURNAMENT_FORMAT, TEAM_SIDES, BUSU_KEYS, busuToNtrp } from '../lib/constants';
import { MatchGrid, AttendanceGrid } from './MatchGrid';
import { AppButton, Segmented, Touchable } from './native';
import { BoardModeBar, ScoreSheet, BOARD_MODE, Fold } from './MatchBoard';
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
  format, attendees, courts, rounds, saved, onSave, isAdmin, flash, courtNames = [], onSaveCourtNames,
}) {
  /* 그리기에 걸린 시간 — 길면 동작 기록에(lib/crashReport.js slowRender) */
  const renderStart = Date.now();
  const sides = TEAM_SIDES[format] || TEAM_SIDES[TOURNAMENT_FORMAT.TEAM_BLUE_WHITE];
  const isClubMatch = format === TOURNAMENT_FORMAT.TEAM_CLUB;

  /* 저장된 편성이 있으면 그걸 쓰고, 없으면 자동 분할 결과를 보여준다 */
  const [teamA, setTeamA] = useState(() => saved?.teamA
    || (isClubMatch ? attendees : splitTeams(attendees, { busuToNtrp }).teamA));
  const [teamB, setTeamB] = useState(() => saved?.teamB
    || (isClubMatch ? [] : splitTeams(attendees, { busuToNtrp }).teamB));
  const [matches, setMatches] = useState(saved?.matches || []);
  /* 배치 방식 · 미배정 · 골라 둔 회원 — 청백전만(교류전 B팀은 상대 클럽 선수라 옮길 일이 없다) */
  const [placement, setPlacement] = useState(saved?.placement === 'manual' ? 'manual' : 'auto');
  const [unassigned, setUnassigned] = useState(saved?.unassigned || []);
  const [picked, setPicked] = useState([]);
  const selectable = isAdmin && !isClubMatch;
  /* 경기 손보기 — 3팀 청백전과 같은 고치기 화면(LeagueMatchEditor)을 쓴다 */
  const [editing, setEditing] = useState(null);
  /* 대진표 위 [결과 입력]·[대진표 수정] — 고른 뒤 경기를 누르면 그 일을 한다(components/MatchBoard.jsx) */
  const [mode, setModeRaw] = useState(BOARD_MODE.NONE);
  /* 여러 경기 골라 지우기 — [대진표 수정] 안에서 */
  const [multi, setMultiRaw] = useState(false);
  const [pickedGames, setPickedGames] = useState([]);
  const setMulti = (on) => { setMultiRaw(on); setPickedGames([]); };
  const setMode = (m) => { setModeRaw(m); setMulti(false); };
  /* 접었다 펴는 구역 — 대진이 이미 있으면 설정들은 접힌 채로 시작한다 */
  const hasDrawAtOpen = (saved?.matches || []).length > 0;
  const [openSetup, setOpenSetup] = useState(!hasDrawAtOpen);
  const [openTeams, setOpenTeams] = useState(!hasDrawAtOpen);
  const [openConfig, setOpenConfig] = useState(!hasDrawAtOpen);
  const [openAttend, setOpenAttend] = useState(false);
  const [scoring, setScoring] = useState(null);
  const [sameSexOnly, setSameSexOnly] = useState(false);
  const [nRounds, setNRounds] = useState(String(rounds || 4));

  /* 상대 클럽 선수 입력 */
  const [opp, setOpp] = useState({ name: '', gender: 'M', busu: '' });
  const [oppClub, setOppClub] = useState(saved?.opponentClub || '');

  /* 코트 이름 — 대회 문서 courtNames(3팀 청백전과 같은 이름) */
  const venue = { courts, courtNames };
  const cn = (c) => courtLabel(venue, c);
  const saveCourtNames = async (names) => {
    try {
      await onSaveCourtNames?.(names);
      flash('코트 이름을 저장했습니다');
    } catch (e) {
      flash('코트 이름을 저장하지 못했습니다. 인터넷 연결을 확인해 주세요');
    }
  };

  const strengthA = useMemo(() => teamStrength(teamA, { busuToNtrp }), [teamA]);
  const strengthB = useMemo(() => teamStrength(teamB, { busuToNtrp }), [teamB]);
  const score = useMemo(() => teamScore(matches), [matches]);
  const mvp = useMemo(
    () => teamPlayerStats([...teamA, ...teamB], matches).filter((r) => r.games > 0).slice(0, 3),
    [teamA, teamB, matches],
  );

  const genderOf = useMemo(() => {
    const map = {};
    [...teamA, ...teamB, ...unassigned].forEach((p) => { map[p.id] = p.gender; });
    return (id) => map[id] || '';
  }, [teamA, teamB, unassigned]);

  /* 대진표·집계에 쓰는 경기 — 유형은 실제로 선 선수 성별로 */
  const shown = useMemo(() => matches.map((m) => ({ ...m, type: actualMatchType(m, genderOf) })), [matches, genderOf]);

  const nameOf = useMemo(() => {
    const map = {};
    [...teamA, ...teamB].forEach((p) => { map[p.id] = p.name; });
    return (id) => map[id] || '?';
  }, [teamA, teamB]);

  /* 버튼·알림창 처리 중 오류 — 앱을 끄지 않고 알리기만(lib/crashReport.js guard) */
  const fail = () => flash('문제가 생겨 멈췄습니다. 잠시 뒤 다시 해 주세요');

  /* ⚠️ 저장 실패가 버튼 처리 안에서 터지면 앱이 꺼진다 — 받아서 알리기만 한다 */
  const persist = (next = {}) => {
    try {
      const r = onSave?.({
        teamA: next.teamA ?? teamA,
        teamB: next.teamB ?? teamB,
        matches: next.matches ?? matches,
        unassigned: next.unassigned ?? unassigned,
        placement: next.placement ?? placement,
        opponentClub: oppClub,
        format,
      });
      if (r && typeof r.catch === 'function') r.catch(() => flash('저장하지 못했습니다. 인터넷 연결을 확인해 주세요'));
    } catch (e) {
      flash('저장하지 못했습니다. 잠시 뒤 다시 해 주세요');
    }
  };

  /** 자동 배치 — 실력·성비 고르게. 팀이 바뀌면 옛 대진은 의미가 없어 지운다 */
  const reshuffle = () => {
    const { teamA: a, teamB: b } = splitTeams(attendees, { busuToNtrp });
    setTeamA(a); setTeamB(b); setUnassigned([]); setPicked([]); setMatches([]); setPlacement('auto');
    persist({ teamA: a, teamB: b, unassigned: [], matches: [], placement: 'auto' });
    flash('팀을 고르게 다시 나눴습니다');
  };

  const startManual = () => {
    setTeamA([]); setTeamB([]); setUnassigned([...attendees]); setPicked([]); setMatches([]); setPlacement('manual');
    persist({ teamA: [], teamB: [], unassigned: [...attendees], matches: [], placement: 'manual' });
    flash('모두 미배정으로 돌렸습니다. 회원을 골라 팀에 넣으세요');
  };

  const choosePlacement = (mode) => {
    if (mode === placement) return;
    const wipe = matches.length ? ' 지금 대진도 지워집니다.' : '';
    if (mode === 'auto') {
      Alert.alert('자동 배치로 바꿀까요?', `모든 회원을 실력·성비가 고르게 두 팀으로 다시 나눕니다.${wipe}`,
        [{ text: '취소', style: 'cancel' }, { text: '자동 배치', onPress: guard(reshuffle, 'team-placement', fail) }]);
      return;
    }
    Alert.alert('수동 배치', `모든 회원을 미배정으로 돌리고 직접 팀에 넣을까요?${wipe}\n\n지금 편성을 그대로 두고 고치기만 할 수도 있습니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '지금 편성 그대로', onPress: guard(() => { setPlacement('manual'); persist({ placement: 'manual' }); }, 'team-placement', fail) },
      { text: '미배정에서 시작', onPress: guard(startManual, 'team-placement', fail) },
    ]);
  };

  /* ---- 여러 명 골라 한꺼번에 옮기기 ---- */
  const togglePick = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const pickAll = (list) => {
    const ids = list.map((p) => p.id);
    setPicked((cur) => (ids.every((id) => cur.includes(id))
      ? cur.filter((id) => !ids.includes(id))
      : [...new Set([...cur, ...ids])]));
  };
  /** to: 0 = 청팀(A) · 1 = 백팀(B) · UNASSIGNED = 미배정 */
  const moveTo = (to) => {
    const r = moveToTeam([teamA, teamB], unassigned, picked, to);
    setPicked([]);
    if (!r.moved) return;
    const [a, b] = r.teams;
    setTeamA(a); setTeamB(b); setUnassigned(r.unassigned);
    persist({ teamA: a, teamB: b, unassigned: r.unassigned });
    const inMatches = matches.some((m) => [...(m.teamA || []), ...(m.teamB || [])].some((id) => picked.includes(id)));
    const where = to === UNASSIGNED ? '미배정' : sides[to].name;
    flash(inMatches
      ? `${r.moved}명을 ${where}(으)로 옮겼습니다 — 이미 짠 대진은 그대로라 [대진 다시 생성]으로 반영하세요`
      : `${r.moved}명을 ${where}(으)로 옮겼습니다`);
  };

  /** 교류전: 사람을 반대편으로 옮기기(예전 그대로) */
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

  const gen = guard(() => {
    if (teamA.length < 2 || teamB.length < 2) {
      return Alert.alert('인원이 부족합니다',
        `${sides[0].name} ${teamA.length}명 · ${sides[1].name} ${teamB.length}명\n\n`
        + '단체전은 양 팀 모두 최소 2명이 필요합니다.');
    }
    const run = () => {
      const ms = generateTeamMatches(teamA, teamB, courts, Number(nRounds) || 4, { sameSexOnly });
      if (!ms.length) { flash('편성 가능한 구성이 없습니다'); return; }
      setMatches(ms);
      persist({ matches: ms });
      flash(`${ms.length}경기 생성`);
    };
    /* 미배정이 남았으면 그 사람들은 대진에 안 들어간다 — 먼저 알린다 */
    if (unassigned.length) {
      Alert.alert('미배정 회원이 있습니다',
        `${unassigned.length}명이 아직 팀에 없어 대진에 들어가지 않습니다. 그래도 짤까요?`,
        [{ text: '취소', style: 'cancel' }, { text: '그대로 짜기', onPress: () => later(run, 'team-generate', fail) }]);
      return undefined;
    }
    run();
    return undefined;
  }, 'team-generate', fail);

  /* ---- 손으로 넣기·고치기·지우기 ---- */
  const both = [teamA, teamB];
  const openAdd = () => setEditing({ id: null, draft: emptyDraft(matches, { courts, rounds: Number(nRounds) || 4 }, 2) });
  const saveEdit = (id, draft) => {
    const lm = withTeamIdx(matches);
    const r = id
      ? updateLeagueMatch(both, lm, id, draft, { courtName: cn })
      : addLeagueMatch(both, lm, draft, undefined, { courtName: cn });
    if (r.error) return r.error;
    const next = r.matches.map((m) => { const x = twoTeamSide(m); return { ...x, type: actualMatchType(x, genderOf) }; });
    setMatches(next);
    persist({ matches: next });
    setEditing(null);
    flash(id ? (r.scoreCleared ? '경기를 고쳤습니다 (점수는 지움)' : '경기를 고쳤습니다') : '경기를 넣었습니다');
    return undefined;
  };
  const deleteMatch = (id) => {
    const next = removeLeagueMatch(matches, id);
    setMatches(next);
    persist({ matches: next });
    setEditing(null);
    flash('경기를 지웠습니다');
  };
  const clearAll = () => Alert.alert('대진을 모두 지울까요?',
    `${matches.length}경기${matches.some((m) => m.score) ? '와 넣은 점수' : ''}가 모두 지워집니다. 팀 편성은 그대로입니다.`,
    [{ text: '취소', style: 'cancel' }, {
      text: '모두 지우기',
      style: 'destructive',
      onPress: guard(() => { setMatches([]); setMode(BOARD_MODE.NONE); persist({ matches: [] }); flash('대진을 모두 지웠습니다'); }, 'team-clear', fail),
    }]);
  const openEdit = (m) => setEditing({ id: m.id, draft: matchToDraft(withTeamIdx([m])[0]) });

  /** 경기를 눌렀을 때 — 위에서 고른 버튼에 따라 */
  const onPressMatch = (m) => {
    breadcrumb(`경기 누름 ${mode || '-'}${multi ? '/골라서삭제' : ''}`);
    if (!isAdmin) return;
    if (mode === BOARD_MODE.EDIT && multi) {
      setPickedGames((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id]));
      return;
    }
    if (mode === BOARD_MODE.EDIT) { openEdit(m); return; }
    if (mode === BOARD_MODE.SCORE) {
      setScoring({
        match: m,
        title: `${m.round}타임 코트 ${cn(m.court)} · ${m.type}`,
        A: { name: isClubMatch ? '우리 클럽' : sides[0].name, color: sides[0].color },
        B: { name: isClubMatch ? (oppClub || '상대 클럽') : sides[1].name, color: sides[1].color },
      });
      return;
    }
    flash('대진표 위에서 [결과 입력] 또는 [대진표 수정]을 먼저 누르세요');
  };
  /** 빈칸을 눌렀을 때 — 그 타임·코트에 경기 넣기 */
  const addAt = (round, court) => {
    if (!(isAdmin && mode === BOARD_MODE.EDIT && !multi)) return;
    setEditing({ id: null, draft: { ...emptyDraft(matches, { courts, rounds: Number(nRounds) || 4 }, 2), round, court } });
  };
  /** 고른 경기만 지우기 — 그 자리는 빈칸으로 남는다 */
  const deletePicked = () => Alert.alert(`${pickedGames.length}경기를 지울까요?`,
    '지운 자리는 대진표에 빈칸으로 남습니다. 빈칸을 누르면 다시 경기를 넣을 수 있습니다.',
    [{ text: '취소', style: 'cancel' }, {
      text: '지우기',
      style: 'destructive',
      onPress: guard(() => {
        const n = pickedGames.length;
        const next = matches.filter((m) => !pickedGames.includes(m.id));
        setMatches(next);
        persist({ matches: next });
        setMulti(false);
        flash(`${n}경기를 지웠습니다`);
      }, 'team-delete-picked', fail),
    }]);

  const saveScore = guard((score) => {
    const id = scoring?.match?.id;
    setScoring(null);
    if (!id) return;
    const next = matches.map((x) => (x.id === id ? { ...x, score } : x));
    setMatches(next);
    persist({ matches: next });
    flash(score ? '결과를 넣었습니다' : '기록을 지웠습니다');
  }, 'team-score', fail);


  /* 회원 한 줄 — 청백전 운영진은 눌러서 고른다(✓), 교류전은 예전처럼 눌러 반대편으로 */
  const PlayerRow = ({ p, side, which }) => {
    const on = picked.includes(p.id);
    const onPress = selectable ? () => togglePick(p.id)
      : (isAdmin && !p.external && which !== 'U' ? () => move(p, which) : undefined);
    return (
      <Touchable onPress={onPress} disabled={!onPress}
        style={{
          backgroundColor: on ? C.fill : side.bg, borderRadius: R.sm,
          borderWidth: 1.5, borderColor: on ? C.green : 'transparent',
          paddingHorizontal: 9, paddingVertical: 7,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: on ? '800' : '700', color: side.color, flex: 1 }}>
          {on ? '✓ ' : ''}{p.name}
          <Text style={{ fontWeight: '400', fontSize: 11 }}>
            {p.gender === 'F' ? ' 여' : ' 남'}{p.busu ? ` · ${p.busu}` : ''}
          </Text>
        </Text>
        {!selectable && isAdmin && !p.external && (
          <Text style={{ fontSize: 12, color: side.color, opacity: 0.5 }}>
            {which === 'A' ? '→' : '←'}
          </Text>
        )}
      </Touchable>
    );
  };

  const PickAll = ({ list }) => (selectable && list.length > 0 ? (
    <Touchable onPress={() => pickAll(list)}>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.green2 }}>
        {list.every((p) => picked.includes(p.id)) ? '풀기' : '모두'}
      </Text>
    </Touchable>
  ) : null);

  const TeamColumn = ({ team, side, which }) => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <TeamTag side={side}>{side.name}</TeamTag>
        <Text style={{ fontSize: 11.5, color: C.sub, flex: 1 }}>{team.length}명</Text>
        <PickAll list={team} />
      </View>
      <View style={{ gap: 5 }}>
        {team.map((p) => <PlayerRow key={p.id} p={p} side={side} which={which} />)}
        {team.length === 0 && (
          <Text style={{ fontSize: 11.5, color: C.faint }}>선수가 없습니다.</Text>
        )}
      </View>
    </View>
  );

  /* 골라 둔 사람이 어디에 있는지 — 옮길 곳에서 '지금 있는 곳'은 뺀다 */
  const pickedIn = (list) => list.some((p) => picked.includes(p.id));
  const UNSIDE = { name: '미배정', color: C.sub, bg: C.fill };

  useEffect(() => { slowRender('2팀', Date.now() - renderStart, `경기 ${matches.length}`); });

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

      {/* 팀 편성 — 설정 · 배치 현황을 따로 접는다 */}
      {selectable && (
        <Fold title="팀 편성 설정" open={openSetup} onToggle={() => setOpenSetup(!openSetup)}
          summary={placement === 'manual' ? '수동 배치' : '자동 배치'}>
        <Card style={{ marginBottom: 10 }}>
          <Label>배치 방식</Label>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip tone={placement === 'auto' ? 'green' : 'outline'} onPress={() => choosePlacement('auto')}>자동 배치</Chip>
            <Chip tone={placement === 'manual' ? 'green' : 'outline'} onPress={() => choosePlacement('manual')}>수동 배치</Chip>
          </View>
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 16 }}>
            {placement === 'auto'
              ? '실력·성비가 고르게 자동으로 나뉩니다. 나눈 뒤에도 여러 명을 골라 반대 팀으로 옮길 수 있습니다.'
              : '미배정 회원을 골라 청팀·백팀에 넣습니다.'}
          </Text>
          {placement === 'auto' && (
            <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Chip tone="soft" onPress={() => Alert.alert('다시 고르게 나눌까요?',
                `모든 회원을 두 팀으로 새로 나눕니다.${matches.length ? ' 지금 대진은 지워집니다.' : ''}`,
                [{ text: '취소', style: 'cancel' }, { text: '다시 나누기', onPress: guard(reshuffle, 'team-reshuffle', fail) }])}>다시 나누기</Chip>
            </View>
          )}
        </Card>
        </Fold>
      )}
      <Fold title="팀 배치 현황" open={openTeams} onToggle={() => setOpenTeams(!openTeams)}
        summary={`${sides[0].name} ${teamA.length}명 · ${sides[1].name} ${teamB.length}명${unassigned.length ? ` · 미배정 ${unassigned.length}명` : ''}`}>
      {selectable && (
        <Text style={{ fontSize: 11.5, color: C.sub, marginBottom: 8 }}>회원을 눌러 여러 명 고른 뒤, 옮길 팀을 누르세요.</Text>
      )}
      <Card>
        {(unassigned.length > 0 || (selectable && placement === 'manual')) && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TeamTag side={UNSIDE}>미배정</TeamTag>
              <Text style={{ fontSize: 11.5, color: C.sub, flex: 1 }}>{unassigned.length}명</Text>
              <PickAll list={unassigned} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {unassigned.map((p) => (
                <View key={p.id} style={{ width: '48%' }}><PlayerRow p={p} side={UNSIDE} which="U" /></View>
              ))}
              {unassigned.length === 0 && (
                <Text style={{ fontSize: 11.5, color: C.faint }}>모든 회원이 팀에 들어갔습니다.</Text>
              )}
            </View>
            <Divider style={{ marginVertical: S.md }} />
          </>
        )}
        <View style={{ flexDirection: 'row', gap: S.md }}>
          <TeamColumn team={teamA} side={sides[0]} which="A" />
          <View style={{ width: 1, backgroundColor: C.border }} />
          <TeamColumn team={teamB} side={sides[1]} which="B" />
        </View>

        {selectable && picked.length > 0 && (
          <View style={{ marginTop: S.md, padding: 10, borderRadius: R.md, backgroundColor: C.fill }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: C.text }}>고른 {picked.length}명을 옮길 곳</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {[0, 1].map((j) => {
                const here = j === 0 ? teamA : teamB;
                /* 고른 사람이 전부 이 팀이면 옮길 곳이 아니다 */
                if (here.length && picked.every((id) => here.some((p) => p.id === id))) return null;
                return (
                  <Chip key={j} tone="outline" onPress={() => moveTo(j)}>
                    <Text style={{ color: sides[j].color, fontWeight: '800' }}>{sides[j].name}</Text>
                  </Chip>
                );
              })}
              {!(pickedIn(unassigned) && picked.every((id) => unassigned.some((p) => p.id === id))) && (
                <Chip tone="outline" onPress={() => moveTo(UNASSIGNED)}>미배정</Chip>
              )}
              <Chip tone="soft" onPress={() => setPicked([])}>선택 해제</Chip>
            </View>
          </View>
        )}

        {!isClubMatch && teamA.length > 0 && teamB.length > 0 && (
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
                : `△ 실력 차 ${Math.abs(strengthA - strengthB).toFixed(2)} — 선수를 골라 옮겨 조정하세요`}
            </Text>
          </>
        )}
      </Card>
      </Fold>

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
        <Fold title="대진 설정" open={openConfig} onToggle={() => setOpenConfig(!openConfig)}
          summary={`코트 ${courts}면 · ${Number(nRounds) || 4}타임${sameSexOnly ? ' · 같은 성별끼리' : ''}`}>
          <Card>
            <Label hint="몇 타임을 돌릴지">타임 수</Label>
            <Field keyboardType="number-pad" value={nRounds} onChangeText={setNRounds} suffix="타임" />

            {!isClubMatch && (
              <View style={{ marginTop: S.lg }}>
                <CourtNamesEditor count={courts} value={courtNames} onSave={saveCourtNames} />
              </View>
            )}

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
            {matches.length === 0 && (
              <View style={{ marginTop: 8 }}>
                <AppButton full variant="outlined" onPress={openAdd}>경기 직접 추가</AppButton>
              </View>
            )}
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              모든 경기는 {sides[0].name} 2명 vs {sides[1].name} 2명으로 짜입니다.
              팀 안에서 맞붙는 경기는 생기지 않습니다.
            </Text>
          </Card>
        </Fold>
      )}

      {/* 대진표 */}
      {matches.length > 0 || mode === BOARD_MODE.EDIT ? (
        <>
          <SectionTitle>대진표</SectionTitle>
          {isAdmin && (
            <BoardModeBar mode={mode} onMode={setMode} onAdd={openAdd} onClearAll={clearAll} hasMatches={matches.length > 0}
              multi={multi} onMulti={setMulti} pickedCount={pickedGames.length} onDeletePicked={deletePicked} />
          )}
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={shown} nameOf={nameOf} genderOf={genderOf} venue={venue} onPressMatch={onPressMatch}
              roundCount={gridExtent(matches, { rounds: Number(nRounds) || 4, courts }).rounds} courtCount={gridExtent(matches, { rounds: Number(nRounds) || 4, courts }).courts}
              onPressEmpty={isAdmin && mode === BOARD_MODE.EDIT && !multi ? addAt : undefined}
              selected={multi ? pickedGames : null}
              sideOf={(m, side) => (side === 'A'
                ? { ...sides[0], name: isClubMatch ? '우리' : sides[0].name }
                : { ...sides[1], name: isClubMatch ? (oppClub || '상대') : sides[1].name })} />
          </Card>

          {/* 타임별 출전 현황 — 누가 언제 뛰고 쉬는지, 몇 경기 · 유형별 몇 경기 */}
          <Fold title="타임별 출전 현황" open={openAttend} onToggle={() => setOpenAttend(!openAttend)}
            summary={`총 ${shown.length}경기 · 사람마다 몇 경기, 남복·여복·혼복 몇 경기씩`}>
            <Card style={{ padding: 10 }}>
              <AttendanceGrid attendees={[...teamA, ...teamB]} matches={shown} venue={venue}
                groups={[
                  { key: 'A', ...sides[0], name: isClubMatch ? '우리 클럽' : sides[0].name, players: teamA, games: matches.length },
                  { key: 'B', ...sides[1], name: isClubMatch ? (oppClub || '상대 클럽') : sides[1].name, players: teamB, games: matches.length },
                ]}
                roundCount={gridExtent(matches, { rounds: Number(nRounds) || 4, courts }).rounds}
                typeOf={(m) => m.type}
                tagOf={(p) => (teamA.some((x) => x.id === p.id) ? sides[0] : sides[1])} />
            </Card>
          </Fold>

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
              ? '팀 편성을 확인한 뒤 [대진 생성]을 누르거나, [경기 직접 추가]로 손으로 넣으세요.'
              : '운영진이 편성하면 여기에 표시됩니다.'}
          />
        </View>
      )}

      <ScoreSheet target={scoring} onSave={saveScore} onClose={() => setScoring(null)} />
      <LeagueMatchEditor
        open={editing}
        teams={both}
        matches={withTeamIdx(matches)}
        teamNames={[sides[0].name, sides[1].name]}
        courts={courts}
        courtName={cn}
        onSave={saveEdit}
        onDelete={deleteMatch}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

export default TeamMatch;
