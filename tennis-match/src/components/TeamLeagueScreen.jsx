/* ============================================================
   팀 리그 — 3팀 이상으로 나눠 돌려가며 붙는다

   청백전은 두 팀이라 인원이 많으면 한 팀이 10명이 되고, 뛰는 시간보다
   기다리는 시간이 길어진다. 그래서 4~6명씩 여러 팀으로 나눠 돌린다.

   화면 흐름
     1. 배치 방식을 고른다
          자동 배치 — 팀 수를 누르면 실력·성비가 고르게 나뉜다
          수동 배치 — 모두 '미배정'에서 시작해 운영진이 팀에 넣는다
     2. 회원을 눌러 여러 명 고른 뒤 옮길 팀을 누르면 한 번에 옮겨진다(자동 배치 뒤에도 같다)
     3. 코트·타임·타임별 유형을 정하고 [대진 자동 작성] — 또는 [경기 직접 추가]로 손으로 넣는다
     4. 경기를 눌러 결과 입력 → 팀 순위가 자동으로 갱신된다
        대진표 위 [결과 입력]·[대진표 수정]을 고른 뒤 경기를 누른다(components/MatchBoard.jsx, 2026-10-04 앱 주인)
   ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  MIN_TEAMS, MAX_TEAMS, splitIntoTeams, teamAverage, teamComposition,
  generateLeagueMatches, leagueStandings, leaguePlayerStats, diagnoseLeague,
  teamLook, teamNamePresets, cleanTeamName, duplicateTeamNames, TEAM_NAME_MAX,
  leagueBalanceNote, teamGameCounts,
  addLeagueMatch, updateLeagueMatch, removeLeagueMatch, matchToDraft, emptyDraft,
  packLeague, unpackLeague, moveToTeam, emptyTeams, resizeTeams, UNASSIGNED,
  actualMatchType, gridExtent,
} from '../lib/teamLeague';
import { LeagueMatchEditor } from './LeagueMatchEditor';
import { CourtNamesEditor } from './CourtNamesEditor';
import { RoundTimingEditor } from './RoundTimingEditor';
import { tournamentRoundTimes, timingRounds } from '../lib/schedule';
import { courtLabel } from '../lib/courtNames';
import { TEAM_ROUND_TYPES } from '../lib/teamMatch';
import { busuToNtrp } from '../lib/constants';
import { MatchGrid, AttendanceGrid } from './MatchGrid';
import { AppButton, Touchable } from './native';
import { BoardModeBar, ScoreSheet, BOARD_MODE, Fold, MyGames } from './MatchBoard';
import { Card, SectionTitle, Chip, Field, Divider, EmptyState } from './ui';
import { Label } from './pickers';
import { C, S, R, F } from '../lib/theme';
import { guard, later, breadcrumb, slowRender } from '../lib/crashReport';

/**
 * @param courtNames       대회 문서의 코트 이름(2팀·3팀 청백전이 함께 쓴다)
 * @param onSaveCourtNames (names) => Promise
 */
export function TeamLeague({
  roster, courts, saved: savedRaw, isAdmin, onSave, flash, courtNames = [], onSaveCourtNames, me = '',
  timing = null, onSaveTiming,
}) {
  /* 저장된 모양은 teams:[{players}] — 화면에서는 [[선수…]] 로 푼다(lib/teamLeague.js packLeague 머리말) */
  /* 그리기에 걸린 시간 — 길면 동작 기록에(lib/crashReport.js slowRender) */
  const renderStart = Date.now();
  const saved = useMemo(() => unpackLeague(savedRaw), [savedRaw]);
  const [teams, setTeams] = useState(
    () => saved?.teams || splitIntoTeams(roster, 4, { busuToNtrp }),
  );
  const [matches, setMatches] = useState(saved?.matches || []);
  /* 배치 방식 — auto: 실력·성비 자동 / manual: 미배정에서 손으로. 미배정 명단은 manual 에서 주로 쓴다 */
  const [placement, setPlacement] = useState(saved?.config?.placement === 'manual' ? 'manual' : 'auto');
  const [unassigned, setUnassigned] = useState(saved?.unassigned || []);
  const [picked, setPicked] = useState([]);       // 골라 둔 회원 id — 한꺼번에 옮길 사람
  const [nCourts, setNCourts] = useState(String(saved?.config?.courts || courts || 2));
  /* 타임 수 — 저장된 대진 설정, 없으면 대회 시작~종료 시간으로 계산(RoundTimingEditor), 그도 없으면 6 */
  const [nRounds, setNRounds] = useState(String(saved?.config?.rounds || timingRounds(timing) || 6));
  const [roundTypes, setRoundTypes] = useState(saved?.config?.roundTypes || {});
  /* 한 팀은 한 타임에 한 코트만 — 예전 기본. 이제는 끄는 것이 기본(팀보다 코트가 많으면 못 짠다) */
  const [oneCourtPerTeam, setOneCourtPerTeam] = useState(!!saved?.config?.oneCourtPerTeam);
  const [editing, setEditing] = useState(null);     // { id|null, draft } — 경기 추가·고치기 화면
  const [shortNote, setShortNote] = useState([]);  // 대진을 짤 때 못 채운 코트 — 창 대신 화면에
  /* 대진표 위 [결과 입력]·[대진표 수정] — 고른 뒤 경기를 누르면 그 일을 한다(components/MatchBoard.jsx) */
  const [mode, setModeRaw] = useState(BOARD_MODE.NONE);
  const [scoring, setScoring] = useState(null);    // 점수 창 대상
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
  /* 팀 이름 — 비어 있으면 A팀·B팀…(lib/teamLeague.js teamLook). 청팀·홍팀처럼 바꾸면 색도 따라간다 */
  const [teamNames, setTeamNames] = useState(saved?.config?.teamNames || []);
  const [renaming, setRenaming] = useState(null);  // { idx, text }
  const look = (i) => teamLook(i, teamNames);

  const cfg = {
    courts: Math.max(1, Number(nCourts) || 1),
    rounds: Math.max(1, Number(nRounds) || 1),
    roundTypes,
    oneCourtPerTeam,
    teamNames,
    placement,
  };

  /* 코트 이름 — 표·안내에 숫자 대신 그 코트장이 부르는 이름 */
  const venue = { courts: cfg.courts, courtNames };
  const cn = (c) => courtLabel(venue, c);

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

  /* 대진표·집계에 쓰는 경기 — 유형은 실제로 선 선수 성별로(설정한 유형이 아니라) */
  const shown = useMemo(() => matches.map((m) => ({ ...m, type: actualMatchType(m, genderOf) })), [matches, genderOf]);
  /* 타임별 시각 — 대회 시간(timing)을 정했을 때만. 대진표·출전 현황·내 경기에 같이 쓴다 */
  const gridRounds = gridExtent(matches, { rounds: cfg.rounds, courts: cfg.courts }).rounds;
  const times = useMemo(() => tournamentRoundTimes(timing, gridRounds), [timing, gridRounds]);
  const timeOf = (r) => times.find((t) => t.round === Number(r)) || null;
  const teamIdxOf = useMemo(() => {
    const map = {};
    teams.forEach((t, i) => t.forEach((p) => { map[p.id] = i; }));
    return map;
  }, [teams]);

  const standings = useMemo(() => leagueStandings(teams, matches, teamNames), [teams, matches, teamNames]);
  const mvp = useMemo(
    () => leaguePlayerStats(teams, matches, teamNames).filter((r) => r.games > 0).slice(0, 3),
    [teams, matches, teamNames],
  );
  const check = useMemo(() => diagnoseLeague(teams, cfg), [teams, nCourts, nRounds, roundTypes, oneCourtPerTeam, teamNames]);

  /* 버튼·알림창 처리 중 오류 — 앱을 끄지 않고 알리기만(lib/crashReport.js guard) */
  const fail = () => flash('문제가 생겨 멈췄습니다. 잠시 뒤 다시 해 주세요');

  /* ⚠️ 저장 실패가 버튼 처리 안에서 터지면 앱이 꺼진다 — 여기서 받아 알리기만 한다 */
  const persist = (next) => {
    try {
      const r = onSave?.(packLeague({
        teams: next.teams ?? teams,
        unassigned: next.unassigned ?? unassigned,
        matches: next.matches ?? matches,
        config: next.config ?? cfg,
      }));
      if (r && typeof r.catch === 'function') r.catch(() => flash('저장하지 못했습니다. 인터넷 연결을 확인해 주세요'));
    } catch (e) {
      flash('저장하지 못했습니다. 잠시 뒤 다시 해 주세요');
    }
  };

  /** 자동 배치 — 실력·성비가 고르게. 팀이 바뀌면 옛 대진은 의미가 없어 지운다 */
  const reshuffle = (n, mode = placement) => {
    const cnt = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, n));
    const next = splitIntoTeams(roster, cnt, { busuToNtrp });
    setTeams(next);
    setUnassigned([]);
    setPicked([]);
    setMatches([]);
    setPlacement(mode);
    persist({ teams: next, unassigned: [], matches: [], config: { ...cfg, placement: mode } });
    flash(`${cnt}개 팀으로 고르게 나눴습니다`);
  };

  /** 수동 배치에서 팀 수 바꾸기 — 넣어 둔 사람은 그대로 둔다 */
  const resize = (n) => {
    const r = resizeTeams(teams, unassigned, n);
    setTeams(r.teams);
    setUnassigned(r.unassigned);
    setPicked([]);
    const clear = r.dropped > 0 || r.teams.length !== teams.length;
    if (clear) setMatches([]);
    persist({ teams: r.teams, unassigned: r.unassigned, ...(clear ? { matches: [] } : {}) });
    flash(r.dropped ? `${r.teams.length}팀으로 줄였습니다 — ${r.dropped}명은 미배정으로` : `${r.teams.length}팀으로 바꿨습니다`);
  };

  const onTeamCount = (n) => {
    if (n === teams.length) return;
    if (placement === 'manual') resize(n);
    else reshuffle(n);
  };

  /** 수동 배치 시작 — 모두 미배정으로 */
  const startManual = () => {
    const r = emptyTeams(roster, teams.length);
    setTeams(r.teams);
    setUnassigned(r.unassigned);
    setPicked([]);
    setMatches([]);
    setPlacement('manual');
    persist({ teams: r.teams, unassigned: r.unassigned, matches: [], config: { ...cfg, placement: 'manual' } });
    flash('모두 미배정으로 돌렸습니다. 회원을 골라 팀에 넣으세요');
  };

  const choosePlacement = (mode) => {
    if (mode === placement) return;
    const wipe = matches.length ? ' 지금 대진도 지워집니다.' : '';
    if (mode === 'auto') {
      Alert.alert('자동 배치로 바꿀까요?', `모든 회원을 실력·성비가 고르게 ${teams.length}팀으로 다시 나눕니다.${wipe}`,
        [{ text: '취소', style: 'cancel' }, { text: '자동 배치', onPress: guard(() => reshuffle(teams.length, 'auto'), 'league-placement', fail) }]);
      return;
    }
    Alert.alert('수동 배치', `모든 회원을 미배정으로 돌리고 직접 팀에 넣을까요?${wipe}\n\n지금 편성을 그대로 두고 고치기만 할 수도 있습니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '지금 편성 그대로',
        onPress: guard(() => { setPlacement('manual'); persist({ config: { ...cfg, placement: 'manual' } }); }, 'league-placement', fail),
      },
      { text: '미배정에서 시작', onPress: guard(startManual, 'league-placement', fail) },
    ]);
  };

  /* ---- 여러 명 골라 한꺼번에 옮기기 ---- */
  const togglePick = (id) => {
    if (!isAdmin) return;
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  /** 이 팀 사람을 모두 고르기 — 이미 다 골랐으면 이 팀 사람만 풀기 */
  const pickAll = (list) => {
    const ids = list.map((p) => p.id);
    setPicked((cur) => (ids.every((id) => cur.includes(id))
      ? cur.filter((id) => !ids.includes(id))
      : [...new Set([...cur, ...ids])]));
  };
  const moveTo = (to) => {
    const r = moveToTeam(teams, unassigned, picked, to);
    if (!r.moved) { setPicked([]); return; }
    setTeams(r.teams);
    setUnassigned(r.unassigned);
    persist({ teams: r.teams, unassigned: r.unassigned });
    const inMatches = matches.some((m) => [...(m.teamA || []), ...(m.teamB || [])].some((id) => picked.includes(id)));
    setPicked([]);
    const where = to === UNASSIGNED ? '미배정' : look(to).name;
    flash(inMatches
      ? `${r.moved}명을 ${where}(으)로 옮겼습니다 — 이미 짠 대진은 그대로라 [대진 다시 작성]으로 반영하세요`
      : `${r.moved}명을 ${where}(으)로 옮겼습니다`);
  };

  /* ---- 팀 이름 ---- */
  const saveNames = (next, msg) => {
    const dup = duplicateTeamNames(next, teams.length);
    if (dup.length) { flash(`팀 이름이 겹칩니다: ${dup.join(', ')}`); return false; }
    setTeamNames(next);
    persist({ config: { ...cfg, teamNames: next } });
    if (msg) flash(msg);
    return true;
  };
  const saveRename = () => {
    if (!renaming) return;
    const next = [...teamNames];
    while (next.length < teams.length) next.push('');
    next[renaming.idx] = cleanTeamName(renaming.text);
    if (saveNames(next, '팀 이름을 바꿨습니다')) setRenaming(null);
  };

  const saveCourtNames = async (names) => {
    try {
      await onSaveCourtNames?.(names);
      flash('코트 이름을 저장했습니다');
    } catch (e) {
      flash('코트 이름을 저장하지 못했습니다. 인터넷 연결을 확인해 주세요');
    }
  };
  /* 대회 시간(시작 시간·한 타임 길이) — 대진표 타임 아래 시각 */
  const saveTiming = async (next) => {
    try {
      await onSaveTiming?.(next);
      flash(next ? '시간을 저장했습니다' : '시간을 지웠습니다');
    } catch (e) {
      flash('시간을 저장하지 못했습니다. 인터넷 연결을 확인해 주세요');
    }
  };

  const setRoundType = (r, key) => {
    const next = { ...roundTypes, [r]: key };
    setRoundTypes(next);
    persist({ config: { ...cfg, roundTypes: next } });
  };

  /* ⚠️ 알림창 안에서 알림창을 또 열지 않는다 — 안드로이드에서 앱이 통째로 꺼질 수 있다
        (2026-10-04 3팀 청백전 [대진 다시 작성]에서 하얀 화면 · 앱 꺼짐).
        확인은 한 번에 묻고, 못 채운 코트는 창이 아니라 화면(대진표 위)에 남긴다. */

  const generate = guard(() => {
    if (teams.filter((t) => t.length).length < MIN_TEAMS) {
      flash(`선수가 있는 팀이 ${MIN_TEAMS}개 이상 필요합니다`);
      return;
    }
    const notes = [];
    if (unassigned.length) notes.push(`미배정 ${unassigned.length}명은 팀에 없어 대진에 들어가지 않습니다.`);
    if (matches.length) notes.push(`지금 대진 ${matches.length}경기${matches.some((m) => m.score) ? '와 넣은 점수' : ''}가 지워지고 새로 만들어집니다.`);
    if (!notes.length) { runGenerate(); return; }
    Alert.alert(matches.length ? '대진을 다시 짤까요?' : '대진을 짤까요?', notes.join('\n\n'), [
      { text: '취소', style: 'cancel' },
      { text: matches.length ? '다시 짜기' : '짜기', style: matches.length ? 'destructive' : 'default', onPress: () => later(runGenerate, 'league-generate', fail) },
    ]);
  }, 'league-generate', fail);

  const runGenerate = () => {
    const { matches: ms, shortages } = generateLeagueMatches(teams, cfg);
    if (!ms.length) { flash('편성 가능한 구성이 없습니다. 팀 인원과 타임 유형을 확인하세요'); return; }
    setMatches(ms);
    setShortNote(shortages.slice(0, 8).map((x) => `${x.round}타임 코트 ${cn(x.court)} ${x.type} — ${x.reason}`)
      .concat(shortages.length > 8 ? [`외 ${shortages.length - 8}건`] : []));
    persist({ matches: ms, config: cfg });
    flash(shortages.length ? `${ms.length}경기를 편성했습니다 — 못 채운 코트 ${shortages.length}곳은 대진표 위에 적어 두었습니다` : `${ms.length}경기를 편성했습니다`);
  };

  /* ---- 손으로 넣기·고치기·지우기 ---- */
  const openAdd = () => setEditing({ id: null, draft: emptyDraft(matches, cfg, teams.length) });
  const saveEdit = (id, draft) => {
    const r = id
      ? updateLeagueMatch(teams, matches, id, draft, { courtName: cn })
      : addLeagueMatch(teams, matches, draft, undefined, { courtName: cn });
    if (r.error) return r.error;
    setMatches(r.matches);
    persist({ matches: r.matches });
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

  /** 대진 전체 지우기 — 팀 편성은 그대로 */
  const clearAll = () => Alert.alert('대진을 모두 지울까요?',
    `${matches.length}경기${matches.some((m) => m.score) ? '와 넣은 점수' : ''}가 모두 지워집니다. 팀 편성은 그대로입니다.`,
    [{ text: '취소', style: 'cancel' }, {
      text: '모두 지우기',
      style: 'destructive',
      onPress: guard(() => {
        setMatches([]); setShortNote([]); setMode(BOARD_MODE.NONE);
        persist({ matches: [] });
        flash('대진을 모두 지웠습니다');
      }, 'league-clear', fail),
    }]);

  /** 경기를 눌렀을 때 — 위에서 고른 버튼에 따라 */
  const onPressMatch = (m) => {
    breadcrumb(`경기 누름 ${mode || '-'}${multi ? '/골라서삭제' : ''}`);
    if (!isAdmin) return;
    if (mode === BOARD_MODE.EDIT && multi) {
      setPickedGames((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id]));
      return;
    }
    if (mode === BOARD_MODE.EDIT) { setEditing({ id: m.id, draft: matchToDraft(m) }); return; }
    if (mode === BOARD_MODE.SCORE) {
      setScoring({
        match: m,
        title: `${m.round}타임 코트 ${cn(m.court)} · ${m.type}`,
        A: { name: look(m.teamAIdx).name, color: look(m.teamAIdx).color },
        B: { name: look(m.teamBIdx).name, color: look(m.teamBIdx).color },
      });
      return;
    }
    flash('대진표 위에서 [결과 입력] 또는 [대진표 수정]을 먼저 누르세요');
  };
  /** 빈칸을 눌렀을 때 — 그 타임·코트에 경기 넣기 */
  const addAt = (round, court) => {
    if (!(isAdmin && mode === BOARD_MODE.EDIT && !multi)) return;
    setEditing({ id: null, draft: { ...emptyDraft(matches, cfg, teams.length), round, court } });
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
      }, 'league-delete-picked', fail),
    }]);

  const saveScore = guard((score) => {
    const id = scoring?.match?.id;
    setScoring(null);
    if (!id) return;
    const next = matches.map((x) => (x.id === id ? { ...x, score } : x));
    setMatches(next);
    persist({ matches: next });
    flash(score ? '결과를 넣었습니다' : '기록을 지웠습니다');
  }, 'league-score', fail);


  /* 회원 칩 — 운영진은 눌러서 고른다(✓). 여러 명 고른 뒤 아래 줄에서 옮길 팀을 누른다 */
  const playerChips = (list) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
      {list.map((p) => {
        const on = picked.includes(p.id);
        return (
          <Touchable key={p.id} disabled={!isAdmin} onPress={() => togglePick(p.id)}
            style={{
              paddingHorizontal: 9, paddingVertical: 6, borderRadius: R.sm,
              borderWidth: 1.5, borderColor: on ? C.green : 'transparent',
              backgroundColor: on ? C.fill : p.gender === 'F' ? C.femaleBg : C.maleBg,
            }}>
            <Text style={{
              fontSize: 12, fontWeight: on ? '800' : '700',
              color: p.gender === 'F' ? C.female : C.male,
            }}>
              {on ? '✓ ' : ''}{p.name}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );

  /* 고른 사람이 이 칸에 있으면 칸 바로 아래에 '어디로 옮길지'를 띄운다 — 위아래로 오가지 않게.
     다른 칸에서 고른 사람도 함께 옮겨진다. */
  const moveBar = (list, here) => {
    if (!isAdmin || !list.some((p) => picked.includes(p.id))) return null;
    return (
      <View style={{ marginTop: 10, padding: 10, borderRadius: R.md, backgroundColor: C.fill }}>
        <Text style={{ fontSize: 11.5, fontWeight: '800', color: C.text }}>
          고른 {picked.length}명을 옮길 곳
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {teams.map((_, j) => (j === here ? null : (
            <Chip key={j} tone="outline" onPress={() => moveTo(j)}>
              <Text style={{ color: look(j).color, fontWeight: '800' }}>{look(j).name}</Text>
            </Chip>
          )))}
          {here !== UNASSIGNED && (
            <Chip tone="outline" onPress={() => moveTo(UNASSIGNED)}>미배정</Chip>
          )}
          <Chip tone="soft" onPress={() => setPicked([])}>선택 해제</Chip>
        </View>
      </View>
    );
  };

  useEffect(() => { slowRender('팀리그', Date.now() - renderStart, `경기 ${matches.length}`); });

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
              const st = look(r.idx);
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
            <Text style={{ fontSize: 10.5, color: C.faint, paddingVertical: 6 }}>
              팀별 경기 수 · {teamGameCounts(teams.length, matches).map((n, i) => `${look(i).name} ${n}`).join(' · ')}
            </Text>
          </Card>
        </>
      )}

      {/* 팀 편성 — 설정 · 배치 현황을 따로 접는다 */}
      {isAdmin && (
        <Fold title="팀 편성 설정" open={openSetup} onToggle={() => setOpenSetup(!openSetup)}
          summary={`${placement === 'manual' ? '수동 배치' : '자동 배치'} · ${teams.length}팀 · ${teams.map((_, i) => look(i).name).join('·')}`}>
        <Card style={{ marginBottom: 10 }}>
          <Label>배치 방식</Label>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip tone={placement === 'auto' ? 'green' : 'outline'} onPress={() => choosePlacement('auto')}>자동 배치</Chip>
            <Chip tone={placement === 'manual' ? 'green' : 'outline'} onPress={() => choosePlacement('manual')}>수동 배치</Chip>
          </View>
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 16 }}>
            {placement === 'auto'
              ? '실력·성비가 고르게 자동으로 나뉩니다. 나눈 뒤에도 여러 명을 골라 다른 팀으로 옮길 수 있습니다.'
              : '미배정 회원을 골라 팀에 넣습니다. 팀 수를 바꿔도 넣어 둔 사람은 그대로입니다.'}
          </Text>

          <Divider style={{ marginVertical: S.md }} />
          <Label hint="인원이 많을수록 팀을 늘리면 대기가 짧아집니다">팀 수</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => i + MIN_TEAMS).map((n) => (
              <Chip key={n} tone={teams.length === n ? 'green' : 'outline'}
                onPress={() => onTeamCount(n)}>
                {n}팀
              </Chip>
            ))}
            {placement === 'auto' && (
              <Chip tone="soft" onPress={() => Alert.alert('다시 고르게 나눌까요?',
                `모든 회원을 ${teams.length}팀으로 새로 나눕니다.${matches.length ? ' 지금 대진은 지워집니다.' : ''}`,
                [{ text: '취소', style: 'cancel' }, { text: '다시 나누기', onPress: guard(() => reshuffle(teams.length), 'league-reshuffle', fail) }])}>
                다시 나누기
              </Chip>
            )}
          </View>
          <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
            참가자 {roster.length}명 · {teams.length}팀이면 팀당 약 {Math.round(roster.length / Math.max(1, teams.length))}명.
            {placement === 'auto' ? ' 팀 수를 누르면 고르게 다시 나뉩니다(기존 대진은 지워집니다).' : ''}
          </Text>

          <Divider style={{ marginVertical: S.md }} />
          <Label hint="아래 팀 카드의 이름을 누르면 직접 바꿀 수 있습니다">팀 이름</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {teamNamePresets(teams.length).map((set) => (
              <Chip key={set.join()} tone="outline" onPress={() => saveNames(set, `팀 이름을 ${set.join('·')}으로 바꿨습니다`)}>
                {set.join(' · ')}
              </Chip>
            ))}
            <Chip tone="outline" onPress={() => saveNames([], '기본 이름(A팀·B팀…)으로 되돌렸습니다')}>A팀 · B팀 … (기본)</Chip>
          </View>
        </Card>
        </Fold>
      )}

      <Fold title="팀 배치 현황" open={openTeams} onToggle={() => setOpenTeams(!openTeams)}
        summary={teams.map((t, i) => `${look(i).name} ${t.length}명`).join(' · ') + (unassigned.length ? ` · 미배정 ${unassigned.length}명` : '')}>
      {isAdmin && (
        <Text style={{ fontSize: 11.5, color: C.sub, marginBottom: 8 }}>회원을 눌러 여러 명 고른 뒤, 옮길 팀을 누르세요.</Text>
      )}
      <View style={{ gap: 8 }}>
        {(unassigned.length > 0 || (isAdmin && placement === 'manual')) && (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: C.faint }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.sub }}>미배정</Text>
              <Text style={{ fontSize: 11.5, color: C.sub, flex: 1 }}>{unassigned.length}명</Text>
              {isAdmin && unassigned.length > 0 && (
                <Touchable onPress={() => pickAll(unassigned)}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.green2 }}>
                    {unassigned.every((p) => picked.includes(p.id)) ? '선택 풀기' : '모두 선택'}
                  </Text>
                </Touchable>
              )}
            </View>
            {playerChips(unassigned)}
            {unassigned.length === 0 && (
              <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>모든 회원이 팀에 들어갔습니다.</Text>
            )}
            {moveBar(unassigned, UNASSIGNED)}
          </Card>
        )}

        {teams.map((team, i) => {
          const st = look(i);
          const comp = teamComposition(team);
          return (
            <Card key={i} style={{ borderLeftWidth: 4, borderLeftColor: st.color }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Touchable disabled={!isAdmin} onPress={() => setRenaming({ idx: i, text: cleanTeamName(teamNames[i]) || st.name })}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: st.color }}>
                    {st.name}{isAdmin ? ' ✎' : ''}
                  </Text>
                </Touchable>
                <Text style={{ fontSize: 11.5, color: C.sub, flex: 1 }}>
                  {comp.total}명 (남 {comp.male} · 여 {comp.female})
                </Text>
                {isAdmin && team.length > 0 ? (
                  <Touchable onPress={() => pickAll(team)}>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.green2 }}>
                      {team.every((p) => picked.includes(p.id)) ? '선택 풀기' : '모두 선택'}
                    </Text>
                  </Touchable>
                ) : null}
              </View>
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                평균 {teamAverage(team, { busuToNtrp })}
              </Text>
              {renaming?.idx === i && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Field value={renaming.text} maxLength={TEAM_NAME_MAX} placeholder="예: 청팀"
                      onChangeText={(v) => setRenaming({ idx: i, text: v })} />
                  </View>
                  <AppButton small onPress={saveRename}>저장</AppButton>
                  <AppButton small variant="text" onPress={() => setRenaming(null)}>취소</AppButton>
                </View>
              )}
              {playerChips(team)}
              {team.length === 0 && (
                <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
                  {isAdmin ? '선수가 없습니다. 다른 곳에서 회원을 골라 이 팀으로 옮기세요.' : '선수가 없습니다.'}
                </Text>
              )}
              {moveBar(team, i)}
            </Card>
          );
        })}
      </View>
      </Fold>

      {/* 대진 설정 */}
      {isAdmin && (
        <Fold title="대진 설정" open={openConfig} onToggle={() => setOpenConfig(!openConfig)}
          summary={`${timing?.startTime ? `${timing.startTime}${timing.endTime ? `~${timing.endTime}` : ' 시작'} · ` : ''}코트 ${cfg.courts}면 · ${cfg.rounds}타임${oneCourtPerTeam ? ' · 한 팀 한 코트' : ''}`}>
          <Card>
            <RoundTimingEditor value={timing} onSave={saveTiming} onRounds={(n) => setNRounds(String(n))} />
            <Divider style={{ marginVertical: S.md }} />

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

            <View style={{ marginTop: S.md }}>
              <CourtNamesEditor count={cfg.courts} value={courtNames} onSave={saveCourtNames} />
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

            <Divider style={{ marginVertical: S.md }} />
            <Label hint="켜면 응원·교대가 편하지만, 팀보다 코트가 많으면 코트가 남습니다">한 팀은 한 타임에 한 코트만</Label>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip tone={!oneCourtPerTeam ? 'green' : 'outline'} onPress={() => { setOneCourtPerTeam(false); persist({ config: { ...cfg, oneCourtPerTeam: false } }); }}>
                끄기 (코트를 다 채움)
              </Chip>
              <Chip tone={oneCourtPerTeam ? 'green' : 'outline'} onPress={() => { setOneCourtPerTeam(true); persist({ config: { ...cfg, oneCourtPerTeam: true } }); }}>
                켜기
              </Chip>
            </View>

            {!!leagueBalanceNote(teams.length, cfg.rounds) && (
              <Text style={{ fontSize: 11.5, color: C.warn, marginTop: S.md, lineHeight: 17 }}>
                {leagueBalanceNote(teams.length, cfg.rounds)}
              </Text>
            )}

            <View style={{ marginTop: S.lg, gap: 8 }}>
              <AppButton full onPress={generate}>
                {matches.length ? '대진 다시 작성' : '대진 자동 작성'}
              </AppButton>
              <AppButton full variant="outlined" onPress={openAdd}>경기 직접 추가</AppButton>
            </View>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 16 }}>
              아직 안 만난 팀끼리 먼저 붙입니다. 코트가 남으면 그 타임에 이미 붙은 두 팀이 옆 코트를 더 씁니다.
              자동으로 짠 뒤에는 대진표 위 [대진표 수정]을 누르고 경기를 누르면 고치거나 지울 수 있고, [결과 입력]을 누르고 경기를 누르면 점수를 넣습니다.
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
          {shortNote.length > 0 && (
            <View style={{ marginBottom: S.sm, padding: 10, borderRadius: R.md, backgroundColor: C.warnBg }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: C.warn }}>못 채운 코트가 있습니다</Text>
              {shortNote.map((x) => (
                <Text key={x} style={{ fontSize: 11, color: C.warn, marginTop: 3 }}>· {x}</Text>
              ))}
              <Text style={{ fontSize: 10.5, color: C.warn, marginTop: 4 }}>팀 인원·타임별 유형을 바꾸거나 [대진표 수정] → [＋ 경기 추가]로 채울 수 있습니다.</Text>
            </View>
          )}
          {/* 내 경기 — 명단에 든 회원(앱 가입·합치기 후)에게 */}
          <MyGames games={shown
            .filter((m) => !!me && [...(m.teamA || []), ...(m.teamB || [])].includes(me))
            .map((m) => {
              const mineIsA = (m.teamA || []).includes(me);
              const mine = look(mineIsA ? m.teamAIdx : m.teamBIdx);
              const opp = look(mineIsA ? m.teamBIdx : m.teamAIdx);
              return { id: m.id, round: m.round, time: timeOf(m.round), court: cn(m.court), type: m.type, mine, opp, score: m.score, mineIsA };
            })} />
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={shown} nameOf={nameOf} genderOf={genderOf} venue={venue} me={me} roundTimes={times}
              sideOf={(m, side) => look(side === 'A' ? m.teamAIdx : m.teamBIdx)}
              roundCount={gridExtent(matches, { rounds: cfg.rounds, courts: cfg.courts }).rounds} courtCount={gridExtent(matches, { rounds: cfg.rounds, courts: cfg.courts }).courts}
              onPressEmpty={isAdmin && mode === BOARD_MODE.EDIT && !multi ? addAt : undefined}
              selected={multi ? pickedGames : null}
              onPressMatch={onPressMatch} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {teams.map((_, i) => {
                const st = look(i);
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
                    <Text style={{ fontSize: 9, color: C.faint }}>{st.name}</Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* 타임별 출전 현황 — 누가 언제 뛰고 쉬는지, 몇 경기 · 유형별 몇 경기 */}
          <Fold title="타임별 출전 현황" open={openAttend} onToggle={() => setOpenAttend(!openAttend)}
            summary={`총 ${shown.length}경기 · 사람마다 몇 경기, 남복·여복·혼복 몇 경기씩`}>
            <Card style={{ padding: 10 }}>
              <AttendanceGrid attendees={teams.flat()} matches={shown} venue={venue} me={me} roundTimes={times}
                groups={teams.map((t, i) => ({ key: `t${i}`, ...look(i), players: t, games: teamGameCounts(teams.length, matches)[i] }))}
                roundCount={gridExtent(matches, { rounds: cfg.rounds, courts: cfg.courts }).rounds}
                typeOf={(m) => m.type}
                tagOf={(p) => (teamIdxOf[p.id] != null ? look(teamIdxOf[p.id]) : null)} />
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
              ? '팀 편성을 확인한 뒤 [대진 자동 작성]을 누르거나, [경기 직접 추가]로 손으로 넣으세요.'
              : '운영진이 편성하면 여기에 표시됩니다.'}
          />
        </View>
      )}

      <ScoreSheet target={scoring} onSave={saveScore} onClose={() => setScoring(null)} />
      <LeagueMatchEditor
        open={editing}
        teams={teams}
        matches={matches}
        teamNames={teamNames}
        courts={cfg.courts}
        courtName={cn}
        onSave={saveEdit}
        onDelete={deleteMatch}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

export default TeamLeague;
