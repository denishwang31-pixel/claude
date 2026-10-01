/* ============================================================
   클럽 대회 — 대진 작성 · 진행 (조별리그 → 본선, 부별 운영)

   정기 모임 [대진] 화면과 같은 흐름이다.
     1) 작성 기준 (대회 전체 적용)  짝 짓기 · 조 나누기 · 게임 수 · 조 개수 · 본선 진출 · 코트(면수·이름)
     2) 「자동 대진 작성」            부(남복·여복·혼복 …)마다 팀 → 조 → 조별 풀리그, 시간표는 코트를 나눠 함께
     3) 「수기 수정」                 조 옮기기 · 선수 맞바꾸기 · 빠진 사람 넣기 · 팀 빼기 · 조별 코트
     4) 결과 입력 → 실시간 순위 → 부별 본선 토너먼트 → 부별 우승

   개설 화면에서는 종목·조 개수·본선 진출·참가자만 정한다. 대진은 개설한 뒤 여기서 짠다
   (개설 화면에서 미리 짜게 하면 "거기서 꼭 짜야 하는 줄" 알게 된다 — 앱 주인).

   남복·여복을 함께 고르면 남자부·여자부가 따로 돌고 따로 시상한다.

   진행 방식 두 가지
     · 팀 고정 조별리그 — 조 안에서 풀리그, 또는 「팀당 N경기」(원형 순서로 N라운드, 같은 팀과 두 번 붙지 않음)
     · KDK 개인전       — 매 경기 파트너가 바뀌고 모두 같은 경기 수, 개인 순위로 끝(남복·여복·자유 복식만)
   계산은 src/lib/groupLeague.js (테스트: scripts/test-groupleague.mjs).
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { View, Text, Alert, ScrollView, Pressable } from 'react-native';
import { updateTournament } from '../lib/firestore';
import {
  normRules, RULE_LABELS, RANK_RULE_TEXT, TEAM_MODE, GROUP_METHOD, PLAY,
  EVENTS, eventOf, eligible, drawAll, redrawDivision, schedule, playersOfFn, addTeam, removeTeam,
  leagueQualifiers, nameLookup, progress, KDK_RANK_TEXT, divRules, advanceOf, bracketPlan, leagueChampions, standings,
  groupSizesFor, gamesCheck, gamesFixes, gamesProblemText,
} from '../lib/groupLeague';
import { drawKdkAll, kdkOk } from '../lib/tournamentKdk';
import { KdkDivView } from './KdkDivView';
import { buildBracket, applyResult, championOf, orderBySeed } from '../lib/tournament';
import { normalizeCourtNames } from '../lib/courtNames';
import { GroupLeagueView } from './GroupLeagueView';
import { mineStyle, MineLegend, GenderMark, genderCount } from './Mine';
import { BracketTree } from './BracketTree';
import { MatchGrid } from './MatchGrid';
import { Card, SectionTitle, Chip, Btn, Field, EmptyState } from './ui';
import { C, S, R, F } from '../lib/theme';

const GRID_ALL = '__grid_all';

/* ---------------- 부별 본선 ---------------- */
function DivKnockout({ ko, nameOfEntry, canEdit, onSave, title }) {
  const [edit, setEdit] = useState(null);
  const [sc, setSc] = useState({ a: '', b: '' });
  const bracket = ko?.bracket;
  if (!bracket?.rounds?.length) return null;
  const champion = championOf(bracket);
  const editing = edit ? bracket.rounds.flatMap((r) => r.matches).find((m) => m.id === edit) : null;
  const save = (matchId) => {
    if (sc.a === '' || sc.b === '' || +sc.a === +sc.b) return;
    const next = applyResult(bracket, matchId, +sc.a, +sc.b);
    const done = championOf(next);
    onSave({ bracket: next, championId: done || null });
    setEdit(null); setSc({ a: '', b: '' });
  };
  return (
    <View>
      <SectionTitle>{title} 본선 토너먼트</SectionTitle>
      {champion && (
        <Card style={{ backgroundColor: C.ink, borderColor: C.green, alignItems: 'center', paddingVertical: 18, marginBottom: 10 }}>
          <Text style={{ color: C.lime, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{title ? `${title} 우승` : 'CHAMPION'}</Text>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 6 }}>🏆 {nameOfEntry(champion)}</Text>
        </Card>
      )}
      <Card style={{ padding: 10 }}>
        <BracketTree bracket={bracket} nameOf={nameOfEntry}
          selectedId={edit} onPressMatch={canEdit ? (m) => { setEdit(m.id); setSc({ a: '', b: '' }); } : undefined} />
        <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>
          굵은 초록 선 = 이긴 팀이 올라간 길 · 흐린 칸 = 진 팀{canEdit ? ' · 경기를 누르면 결과를 넣습니다' : ''}
        </Text>
      </Card>
      {editing && (
        <Card style={{ marginTop: 8 }}>
          <Text style={F.bodyBold}>{nameOfEntry(editing.a)} vs {nameOfEntry(editing.b)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Field keyboardType="number-pad" placeholder="위 팀" value={sc.a} onChangeText={(v) => setSc({ ...sc, a: v })} style={{ flex: 1 }} />
            <Text style={{ fontWeight: '700', color: C.faint }}>:</Text>
            <Field keyboardType="number-pad" placeholder="아래 팀" value={sc.b} onChangeText={(v) => setSc({ ...sc, b: v })} style={{ flex: 1 }} />
            <Btn small onPress={() => save(editing.id)}>저장</Btn>
            <Btn small tone="ghost" onPress={() => setEdit(null)}>닫기</Btn>
          </View>
        </Card>
      )}
    </View>
  );
}

/* ---------------- 작성 기준 한 줄 ---------------- */
function ChoiceRow({ label, options, value, onChange }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11.5, color: C.sub, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map(([k, l]) => <Chip key={k} tone={value === k ? 'green' : 'outline'} onPress={() => onChange(k)}>{l}</Chip>)}
      </View>
    </View>
  );
}

export function TournamentDraw({ clubId, t, members = [], isAdmin, me = '', flash = () => {} }) {
  const events = (t.events || []).filter((k) => EVENTS[k]);
  const roster = t.roster || [];
  const entries = t.entries || [];
  const groups = t.groups || [];
  const useGroups = t.useGroupStage !== false;
  const courts = Math.max(1, Number(t.courts) || 2);
  const courtNames = normalizeCourtNames(t.courtNames, courts);
  const rules = normRules(t.rules);
  /* 진행 — 조별리그 → 본선 / 조별리그만 / 토너먼트만 */
  const stage = !useGroups ? 'ko' : rules.knockout ? 'group_ko' : 'group';
  const kdk = t.kdk || {};
  const kdkDivs = events.filter((k) => kdk[k]?.matches?.length);
  const isKdk = kdkDivs.length > 0;                    // 지금 저장된 대진이 KDK 인가
  const drawn = entries.length > 0 || isKdk;
  const kdkAble = events.length > 0 && events.every(kdkOk);
  /* 부별 인원 — 성별이 맞는 사람 수(남복 → 남자, 혼복 → 남녀 각각) */
  const countFor = (k) => {
    const g = EVENTS[k].gender;
    if (g === 'M') return `${roster.filter((p) => p.gender === 'M').length}명`;
    if (g === 'F') return `${roster.filter((p) => p.gender === 'F').length}명`;
    if (g === 'X') return `남${roster.filter((p) => p.gender === 'M').length}·여${roster.filter((p) => p.gender === 'F').length}`;
    return `${roster.length}명`;
  };
  const showKdk = isKdk || (!drawn && rules.format === 'kdk' && kdkAble);   // 위 요약 줄
  const nameOfPlayer = useMemo(() => nameLookup(members, t.guests || []), [members, t.guests]);
  const nameOfEntry = (id) => entries.find((e) => e.id === id)?.name || '?';
  const hasResults = groups.some((g) => (g.matches || []).some((m) => m.score)) || Object.values(t.ko || {}).some((k) => k?.bracket)
    || kdkDivs.some((k) => kdk[k].matches.some((m) => m.score));

  const myDiv = events.find((k) => entries.some((e) => e.div === k && (e.players || []).includes(me))
    || (kdk[k]?.players || []).some((p) => p.id === me));
  const [div, setDiv] = useState(myDiv || events[0]);
  const [setupOpen, setSetupOpen] = useState(!drawn && isAdmin);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /* 작성 기준 — 고치는 동안은 화면에만, [저장]·[대진 작성] 때 대회에 적용 */
  const [crit, setCrit] = useState(() => ({
    teamMode: rules.teamMode === TEAM_MODE.MANUAL ? TEAM_MODE.BALANCED : rules.teamMode,
    groupMethod: rules.groupMethod,
    games: String(rules.games),
    groupCount: String(rules.groupCount),
    advance: String(rules.advance),
    perTeam: String(rules.perTeam),
    format: rules.format === 'kdk' && kdkAble ? 'kdk' : 'league',
    courts: String(courts),
    courtNames,
    events,
    stage,
    /* 부·조마다 따로(필요할 때만) — 빈칸이면 위 기본값 */
    byDiv: Object.fromEntries(Object.entries(rules.byDiv).map(([k, v]) => [k, {
      groupCount: v.groupCount != null ? String(v.groupCount) : '', advance: v.advance != null ? String(v.advance) : '',
    }])),
    groupAdvance: Object.fromEntries(Object.entries(rules.groupAdvance).map(([k, v]) => [k, String(v)])),
  }));
  const [splitOpen, setSplitOpen] = useState(() => Object.keys(rules.byDiv).length > 0 || Object.keys(rules.groupAdvance).length > 0);
  const critUseGroups = crit.stage !== 'ko';
  const critKnockout = crit.stage !== 'group';
  const stageNeedsRedraw = drawn && (crit.stage === 'ko') !== (stage === 'ko');
  const setDivCrit = (k, key, v) => setCrit({ ...crit, byDiv: { ...crit.byDiv, [k]: { ...(crit.byDiv[k] || {}), [key]: v } } });
  const critEvents = (crit.events || []).filter((k) => EVENTS[k]);
  const critKdkAble = critEvents.length > 0 && critEvents.every(kdkOk);
  const eventsChanged = critEvents.join() !== events.join();
  const toggleEvent = (k) => {
    const cur = crit.events || [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    setCrit({ ...crit, events: Object.keys(EVENTS).filter((x) => next.includes(x)) });
  };
  const [pick, setPick] = useState([]);           // 수기 수정 — 빠진 사람 짝짓기

  const ev = eventOf(div);
  const divEntries = entries.filter((e) => e.div === div);
  const divGroups = groups.filter((g) => g.div === div);
  const excluded = (t.excluded || {})[div] || [];
  const divPlayers = eligible(roster, div);
  const inDiv = new Set(divEntries.flatMap((e) => e.players));
  const leftover = eligible(roster, div, excluded).filter((p) => !inDiv.has(p.id));

  const critRules = () => normRules({
    ...rules, teamMode: crit.teamMode, groupMethod: crit.groupMethod,
    games: crit.games, groupCount: crit.groupCount, advance: crit.advance,
    perTeam: crit.perTeam, format: crit.format === 'kdk' && critKdkAble ? 'kdk' : 'league',
    knockout: critKnockout, byDiv: crit.byDiv, groupAdvance: crit.groupAdvance,
  });
  /* 부별 본선 크기 미리 보기 — 진출 팀 수가 2의 거듭제곱이 아니면 부전승이 생긴다 */
  const teamsIn = (k) => {
    const e = EVENTS[k];
    const ps = eligible(roster, k, (t.excluded || {})[k] || []);
    if (e.play === PLAY.SINGLES) return ps.length;
    if (e.gender === 'X') return Math.min(ps.filter((p) => p.gender === 'M').length, ps.filter((p) => p.gender === 'F').length);
    return Math.floor(ps.length / 2);
  };
  const planFor = (k) => {
    const r = critRules();
    const gs = groups.filter((g) => g.div === k);
    if (gs.length && !eventsChanged) {
      return bracketPlan(gs.reduce((n, g) => n + Math.min(advanceOf(r, g), g.entryIds.length), 0));
    }
    const dr = divRules(r, k);
    const teams = teamsIn(k);
    const gc = Math.max(1, Math.min(dr.groupCount, Math.floor(teams / 2) || 1));
    const base = Math.floor(teams / gc);
    const extra = teams % gc;
    let n = 0;
    for (let i = 0; i < gc; i++) n += Math.min(dr.advance, base + (i < extra ? 1 : 0));
    return bracketPlan(n);
  };
  /* 조별 경기 수 점검 — 한 부 안에서 모든 팀이 같은 경기 수를 쳐야 한다.
     작성 전에는 지금 기준으로 예상한 조 크기로(같은 등급끼리 나누기는 짜 봐야 알아서 제외) */
  const gameIssues = () => {
    if (!critUseGroups || critKdk || crit.groupMethod === GROUP_METHOD.GRADE) return [];
    const r = critRules();
    return critEvents.map((k) => {
      const teams = teamsIn(k);
      if (teams < 2) return null;
      const gc = Math.max(1, Math.min(divRules(r, k).groupCount, teams));
      const sizes = groupSizesFor(teams, gc);
      const chk = gamesCheck(sizes, r.perTeam);
      if (chk.ok) return null;
      return { k, teams, gc, text: gamesProblemText(chk, r.perTeam), fixes: gamesFixes(teams, gc, r.perTeam) };
    }).filter(Boolean);
  };
  /* 실제로 짠 조로 다시 점검 — 맞지 않으면 저장하지 않는다 */
  const drawnIssues = (gs, r, keys) => keys.map((k) => {
    const sizes = gs.filter((g) => g.div === k).map((g) => g.entryIds.length);
    if (!sizes.length) return null;
    const chk = gamesCheck(sizes, r.perTeam);
    return chk.ok ? null : `${EVENTS[k].name}: ${gamesProblemText(chk, r.perTeam)}`;
  }).filter(Boolean);
  const applyFix = (iss, f) => {
    if (f.kind === 'perTeam') { setCrit({ ...crit, perTeam: String(f.value) }); return; }
    if (f.kind === 'groupCount') {
      if (critEvents.length === 1) { setCrit({ ...crit, groupCount: String(f.value) }); return; }
      setDivCrit(iss.k, 'groupCount', String(f.value));
      setSplitOpen(true);
    }
  };
  const fixLabel = (f) => (f.kind === 'perTeam'
    ? `팀당 ${f.value}경기로 맞추기`
    : f.kind === 'groupCount'
      ? `조 ${f.value}개로 (${f.sizes.join('·')}팀)`
      : `${f.add}팀 더 모으면 조마다 ${f.sizes[0]}팀`);
  const planText = (p) => (p.teams < 2 ? '본선 팀 부족' : `본선 ${p.teams}팀 → ${p.size === 2 ? '결승' : p.size === 4 ? '4강' : `${p.size}강`}${p.byes ? ` (부전승 ${p.byes})` : ''}`);
  const critKdk = crit.format === 'kdk' && critKdkAble;
  const critCourts = () => Math.max(1, Math.min(20, Number(crit.courts) || 1));

  const save = async (patch, msg) => {
    try { await updateTournament(clubId, t.id, patch); if (msg) flash(msg); } catch (e) { flash('저장하지 못했습니다'); }
  };

  /* 부별 본선(토너먼트만 진행일 때는 대진 작성 때 바로) */
  const koFor = (es) => ({ bracket: buildBracket(orderBySeed(es).map((e) => e.id)), championId: null });

  const runDraw = async (scope) => {
    const r = critRules();
    const n = critCourts();
    const names = normalizeCourtNames(crit.courtNames, n);
    const evs = critEvents;
    if (!evs.length) { flash('종목을 하나 이상 고르세요'); return; }
    /* 종목·진행 방식이 바뀌었으면 한 부만 다시 짤 수 없다 — 전체로 */
    if (scope !== 'all' && (eventsChanged || stageNeedsRedraw)) scope = 'all';
    const ug = critUseGroups;
    setBusy(true);
    try {
      if (r.format === 'kdk') {
        const d = drawKdkAll(roster, r, evs, { courts: n, excluded: t.excluded || {} });
        if (!Object.keys(d.kdk).length) { flash(d.problems[0] || 'KDK 대진을 짤 사람이 부족합니다(부마다 4명 이상)'); return; }
        await updateTournament(clubId, t.id, {
          rules: r, courts: n, courtNames: names, events: evs, kdk: d.kdk, entries: [], groups: [], ko: {}, drawNotes: d.problems,
        });
        flash(d.problems.length ? `KDK 대진을 작성했습니다 — 확인할 것 ${d.problems.length}건` : 'KDK 대진을 작성했습니다');
      } else if (scope === 'all') {
        const d = drawAll(roster, { ...r, groupAdvance: {} }, evs, { courts: n, excluded: t.excluded || {}, useGroups: ug });
        if (!d.entries.length) { flash(d.problems[0] || '대진을 짤 사람이 부족합니다'); return; }
        const bad = ug ? drawnIssues(d.groups, r, evs) : [];
        if (bad.length) {
          setSetupOpen(true);
          Alert.alert('조마다 경기 수가 다릅니다', `${bad.join('\n')}\n\n한 부 안에서는 모든 팀이 같은 경기 수를 쳐야 합니다. 「작성 기준」의 안내대로 조 안 경기 수나 조 개수를 고친 뒤 다시 작성하세요.`);
          return;
        }
        const ko = ug ? {} : Object.fromEntries(evs.map((k) => [k, koFor(d.entries.filter((e) => e.div === k))]).filter(([, v]) => v.bracket?.rounds?.length));
        await updateTournament(clubId, t.id, {
          rules: { ...r, groupAdvance: {} }, useGroupStage: ug, courts: n, courtNames: names, events: evs, entries: d.entries, groups: d.groups, ko, drawNotes: d.problems, kdk: null,
        });
        flash(d.problems.length ? `대진을 작성했습니다 — 확인할 것 ${d.problems.length}건` : '대진을 작성했습니다');
      } else {
        /* 이 부 조가 새로 생기니 이 부 조별 진출 지정은 지운다 */
        const oldIds = new Set(groups.filter((g) => g.div === div).map((g) => g.id));
        r.groupAdvance = Object.fromEntries(Object.entries(r.groupAdvance).filter(([gid]) => !oldIds.has(gid)));
        const d = redrawDivision(t, div, roster, r, { courts: n, excluded, useGroups: ug });
        const bad = ug ? drawnIssues(d.groups, r, [div]) : [];
        if (bad.length) {
          setSetupOpen(true);
          Alert.alert('조마다 경기 수가 다릅니다', `${bad.join('\n')}\n\n「작성 기준」의 안내대로 고친 뒤 다시 작성하세요.`);
          return;
        }
        const ko = { ...(t.ko || {}) };
        delete ko[div];
        if (!ug) {
          const k = koFor(d.entries.filter((e) => e.div === div));
          if (k.bracket?.rounds?.length) ko[div] = k;
        }
        await updateTournament(clubId, t.id, {
          rules: r, courts: n, courtNames: names, entries: d.entries, groups: d.groups, ko,
          drawNotes: d.problem ? [d.problem] : [], kdk: null,
        });
        flash(d.problem || `${ev.name} 대진을 다시 작성했습니다`);
      }
      if (!evs.includes(div)) setDiv(evs[0]);
      setSetupOpen(false);
    } catch (e) {
      flash('대진을 저장하지 못했습니다');
    } finally { setBusy(false); }
  };
  const askDraw = () => {
    if (!drawn) { runDraw('all'); return; }
    const warn = hasResults ? '\n\n⚠️ 입력한 결과가 함께 지워집니다.' : '';
    const opts = [{ text: '취소', style: 'cancel' }];
    /* 한 부만 다시 — 팀 고정 조별리그끼리일 때만(KDK 는 모든 부를 한 시간표로 함께 짠다) */
    if (events.length > 1 && !isKdk && !critKdk && !eventsChanged && !stageNeedsRedraw) opts.push({ text: `${ev.name}만`, onPress: () => runDraw(div) });
    opts.push({ text: events.length > 1 ? '전체 부' : '다시 작성', style: hasResults ? 'destructive' : 'default', onPress: () => runDraw('all') });
    Alert.alert('대진 다시 작성', `지금 기준으로 다시 짭니다.${warn}`, opts);
  };
  const saveCrit = () => {
    const n = critCourts();
    const next = { rules: critRules(), courts: n, courtNames: normalizeCourtNames(crit.courtNames, n) };
    /* 진행 방식 — 조별리그 ↔ 조별리그만은 바로, 토너먼트만으로(에서) 바꾸는 것은 대진을 다시 짤 때 */
    if (!stageNeedsRedraw) next.useGroupStage = critUseGroups;
    else next.rules = { ...next.rules, knockout: rules.knockout };
    /* 종목은 대진이 없을 때만 바로 바꾼다 — 짜 둔 대진이 있으면 「대진 다시 작성」 때 함께 바뀐다 */
    if (eventsChanged && !drawn) {
      if (!critEvents.length) { flash('종목을 하나 이상 고르세요'); return; }
      next.events = critEvents;
      if (!critEvents.includes(div)) setDiv(critEvents[0]);
    }
    /* 면수가 바뀌었으면 시간표만 다시(대진·결과는 그대로) */
    if (entries.length && n !== courts) next.groups = schedule(groups, n, { playersOf: playersOfFn(entries) });
    save(next, (eventsChanged && drawn) || stageNeedsRedraw ? '저장했습니다 — 바꾼 종목·진행 방식은 「대진 다시 작성」을 눌러야 반영됩니다' : '작성 기준을 저장했습니다');
  };

  /* 한 부의 변경을 대회 전체에 합친다 — 조·코트가 바뀌면 모든 부의 시간표를 함께 다시 짠다 */
  const order = (gs) => [...gs].sort((a, b) => events.indexOf(a.div) - events.indexOf(b.div));
  const applyDiv = async (patch, opts = {}) => {
    const nextEntries = patch.entries ? [...entries.filter((e) => e.div !== div), ...patch.entries] : entries;
    let nextGroups = patch.groups ? order([...groups.filter((g) => g.div !== div), ...patch.groups]) : groups;
    if (opts.reschedule) nextGroups = schedule(nextGroups, courts, { playersOf: playersOfFn(nextEntries) });
    /* 조별리그만 — 모든 조 경기가 끝나면 대회도 끝 */
    const allDone = !rules.knockout && nextGroups.length > 0 && nextGroups.every((g) => progress(g).finished);
    await updateTournament(clubId, t.id, {
      ...(patch.entries ? { entries: nextEntries } : {}),
      ...(patch.groups ? { groups: nextGroups } : {}),
      ...(allDone ? { status: 'finished' } : {}),
    });
  };
  const toggleExclude = (pid) => {
    const cur = new Set(excluded);
    if (cur.has(pid)) cur.delete(pid); else cur.add(pid);
    save({ excluded: { ...(t.excluded || {}), [div]: [...cur] } });
  };
  const putTeam = (groupId) => {
    const need = ev.play === PLAY.SINGLES ? 1 : 2;
    if (pick.length !== need) { flash(need === 2 ? '두 사람을 고르세요' : '한 사람을 고르세요'); return; }
    const r = addTeam(entries, groups, { div, players: pick, groupId, nameOf: nameOfPlayer });
    if (r.error) { flash(r.error); return; }
    setPick([]);
    updateTournament(clubId, t.id, { entries: r.entries, groups: schedule(r.groups, courts, { playersOf: playersOfFn(r.entries) }) })
      .then(() => flash('팀을 넣었습니다 — 그 조의 경기와 시간표를 다시 짰습니다')).catch(() => flash('저장하지 못했습니다'));
  };
  const dropTeam = (entryId) => Alert.alert('팀 빼기', `${nameOfEntry(entryId)} 팀을 대진에서 뺄까요?`, [
    { text: '취소', style: 'cancel' },
    {
      text: '빼기', style: 'destructive', onPress: () => {
        const r = removeTeam(entries, groups, entryId);
        if (r.error) { flash(r.error); return; }
        updateTournament(clubId, t.id, { entries: r.entries, groups: schedule(r.groups, courts, { playersOf: playersOfFn(r.entries) }) })
          .catch(() => flash('저장하지 못했습니다'));
      },
    },
  ]);

  const divKo = (t.ko || {})[div];
  const goKnockout = (gs) => {
    const q = leagueQualifiers(gs, (g) => advanceOf(rules, g));
    if (q.length < 2) { flash('진출 팀이 부족합니다'); return; }
    save({ ko: { ...(t.ko || {}), [div]: { bracket: buildBracket(q.map((x) => x.entryId)), championId: null } } },
      `${ev.name} 본선 토너먼트 대진을 만들었습니다`);
  };
  const saveKo = (k) => {
    const next = { ...(t.ko || {}), [div]: k };
    const allDone = events.every((e) => next[e]?.championId);
    save({ ko: next, ...(allDone ? { status: 'finished' } : {}) }, k.championId ? `🏆 ${ev.name} 우승: ${nameOfEntry(k.championId)}` : '');
  };

  /* KDK 결과 저장 — 모든 부의 모든 경기가 끝나면 대회도 끝 */
  const saveKdk = (next, msg) => {
    const allDone = Object.values(next).every((d) => (d?.matches || []).every((m) => m.score));
    save({ kdk: next, ...(allDone ? { status: 'finished' } : {}) }, msg || '');
  };

  /* 전체 시간표 — 모든 부를 한 표에 (코트 운영용) */
  const allGrid = () => [
    ...groups.flatMap((g) => (g.matches || []).map((m) => ({
      ...m,
      teamA: entries.find((e) => e.id === m.a)?.players || [],
      teamB: entries.find((e) => e.id === m.b)?.players || [],
      type: `${eventOf(g.div).short} ${g.name}`,
    }))),
    ...kdkDivs.flatMap((k) => kdk[k].matches.map((m) => ({ ...m, type: `${eventOf(k).short} KDK` }))),
  ];
  const [tabAll, setTabAll] = useState(false);

  return (
    <View>
      {/* ---------- 대진 작성 (운영진) — 정기 모임 [대진] 화면과 같은 모양 ---------- */}
      {isAdmin && (
        <Card style={{ marginTop: S.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {events.map((k) => <Chip key={k} tone="soft">{EVENTS[k].short}</Chip>)}
            <Chip tone="outline">코트 {courts}면</Chip>
            <Chip tone="outline">참가 {roster.length}명</Chip>
            <Chip tone="outline">{showKdk ? 'KDK 개인전' : stage === 'ko' ? '토너먼트만' : stage === 'group' ? '조별리그만' : `조별리그 → 본선 ${rules.advance}팀씩${Object.keys(rules.byDiv).length || Object.keys(rules.groupAdvance).length ? '(부·조별 따로)' : ''}`}</Chip>
          </View>
          <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 8, lineHeight: 17 }}>
            {showKdk
              ? `매 경기 파트너 교체 · 모두 같은 경기 수 · ${rules.games}게임 선승 · 개인 순위`
              : `${RULE_LABELS.teamMode[rules.teamMode] || ''} · ${RULE_LABELS.groupMethod[rules.groupMethod]} · ${rules.games}게임 선승${useGroups ? ` · 부마다 ${rules.groupCount}개 조 · ${rules.perTeam ? `팀당 ${rules.perTeam}경기` : '조 안 모두 한 번씩'}` : ''}`}
          </Text>
          {events.length > 1 && events.some((k) => EVENTS[k].gender === 'M') && events.some((k) => EVENTS[k].gender === 'F') && (
            <Text style={{ fontSize: 11, color: C.green, marginTop: 4 }}>남자부·여자부를 따로 운영하고 따로 시상합니다.</Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <Btn disabled={busy} onPress={askDraw}>{busy ? '작성 중…' : drawn ? '대진 다시 작성' : '자동 대진 작성'}</Btn>
            <Btn tone="ghost" onPress={() => setSetupOpen(!setupOpen)}>{setupOpen ? '기준 닫기' : '작성 기준 설정'}</Btn>
            {entries.length > 0 && useGroups && <Btn tone="ghost" onPress={() => setEditOpen(!editOpen)}>{editOpen ? '수정 닫기' : '수기 수정'}</Btn>}
          </View>
          {(t.drawNotes || []).length > 0 && (
            <View style={{ marginTop: 10, padding: 10, borderRadius: R.md, backgroundColor: C.warnBg }}>
              {(t.drawNotes || []).map((x) => <Text key={x} style={{ fontSize: 11.5, color: C.warn, lineHeight: 17 }}>· {x}</Text>)}
              {!isKdk && <Text style={{ fontSize: 10.5, color: C.warn, marginTop: 4 }}>빠진 사람은 「수기 수정」에서 짝을 지어 조에 넣을 수 있습니다.</Text>}
            </View>
          )}
        </Card>
      )}

      {isAdmin && setupOpen && (
        <>
          <SectionTitle hint="대회 전체에 적용됩니다. 저장하거나 「자동 대진 작성」을 누를 때 반영됩니다.">작성 기준</SectionTitle>
          <Card>
            <Text style={{ fontSize: 11.5, color: C.sub, fontWeight: '700', marginBottom: 6 }}>종목 (부) — 여러 개 고르면 부마다 따로</Text>
            {[['복식', ['MD', 'WD', 'XD', 'OD']], ['단식', ['MS', 'WS', 'OS']]].map(([lbl, ks]) => (
              <View key={lbl} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Text style={{ width: 30, fontSize: 11, color: C.faint }}>{lbl}</Text>
                {ks.map((k) => (
                  <Chip key={k} tone={critEvents.includes(k) ? 'green' : 'outline'} onPress={() => toggleEvent(k)}>
                    {EVENTS[k].name} {countFor(k)}
                  </Chip>
                ))}
              </View>
            ))}
            <Text style={{ fontSize: 11, color: C.faint, marginBottom: 12, lineHeight: 16 }}>
              남자복식·여자복식 — 남자부·여자부를 따로 조 편성·경기·순위·시상.{'\n'}
              혼합복식 — 남녀 한 명씩 짝만(남남·여여 팀 없음).{'\n'}
              자유 복식 — 성별 상관없이 한 부.
              {eventsChanged && drawn ? '\n⚠️ 종목을 바꾸면 「대진 다시 작성」(전체)을 눌러야 반영됩니다.' : ''}
            </Text>
            {!critKdk && (
              <>
                <ChoiceRow label="진행" options={[['group_ko', '조별리그 → 본선 토너먼트'], ['group', '조별리그만'], ['ko', '토너먼트만']]}
                  value={crit.stage} onChange={(v) => setCrit({ ...crit, stage: v })} />
                <Text style={{ fontSize: 11, color: C.faint, marginTop: -6, marginBottom: 12, lineHeight: 16 }}>
                  {crit.stage === 'group'
                    ? '조별리그만 — 본선 없이 조 순위로 끝납니다. 조가 하나면 1위가 우승, 여럿이면 조마다 1위를 냅니다.'
                    : crit.stage === 'ko'
                      ? '토너먼트만 — 조 없이 바로 본선 대진을 짭니다.'
                      : '조별리그를 치른 뒤 조 상위 팀이 본선 토너먼트로 올라갑니다.'}
                  {stageNeedsRedraw ? '\n⚠️ 토너먼트만으로(에서) 바꾸면 「대진 다시 작성」(전체)을 눌러야 반영됩니다.' : ''}
                </Text>
              </>
            )}
            {critUseGroups && (
              <>
                <ChoiceRow label="경기 방식" options={[['league', '팀 고정 조별리그'], ...(critKdkAble ? [['kdk', 'KDK 개인전 (파트너 교체)']] : [])]}
                  value={critKdk ? 'kdk' : 'league'} onChange={(v) => setCrit({ ...crit, format: v })} />
                <Text style={{ fontSize: 11, color: C.faint, marginTop: -6, marginBottom: 12, lineHeight: 16 }}>
                  {critKdk
                    ? 'KDK — 짝을 고정하지 않고 매 경기 파트너가 바뀝니다. 실력순으로 4~8명씩 조를 나누고, 모두 같은 경기 수를 치른 뒤 개인 승수로 순위를 냅니다. 본선 없이 개인 순위로 끝납니다.'
                    : critKdkAble
                      ? '조별리그 — 짝을 지은 팀이 조 안에서 경기합니다. 짝 없이 매번 파트너를 바꾸려면 KDK 를 고르세요.'
                      : '혼합 복식·단식이 있으면 KDK 를 고를 수 없습니다(KDK 는 남복·여복·자유 복식만).'}
                </Text>
              </>
            )}
            {!critKdk && critEvents.some((k) => EVENTS[k].play === PLAY.DOUBLES) && (
              <ChoiceRow label="짝 짓기 (복식)" options={[[TEAM_MODE.BALANCED, '실력 균등'], [TEAM_MODE.RANDOM, '무작위']]}
                value={crit.teamMode} onChange={(v) => setCrit({ ...crit, teamMode: v })} />
            )}
            {critUseGroups && !critKdk && (
              <ChoiceRow label="조 나누기" options={Object.entries(RULE_LABELS.groupMethod)}
                value={crit.groupMethod} onChange={(v) => setCrit({ ...crit, groupMethod: v })} />
            )}
            {critUseGroups && !critKdk && (
              <>
                <ChoiceRow label="조 안 경기 수"
                  options={[['0', '모두 한 번씩'], ...[1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), `팀당 ${n}경기`])]}
                  value={String(Number(crit.perTeam) || 0)} onChange={(v) => setCrit({ ...crit, perTeam: v })} />
                <Text style={{ fontSize: 11, color: C.faint, marginTop: -6, marginBottom: 12, lineHeight: 16 }}>
                  {Number(crit.perTeam) > 0
                    ? `팀마다 ${crit.perTeam}경기만 — 원형 순서(1번↔끝번 …)로 ${crit.perTeam}라운드를 돌려 같은 팀과는 두 번 붙지 않습니다. 모든 팀이 같은 경기 수가 되지 않는 조(3팀 조에 3경기, 5팀 조에 3경기 등)가 생기면 아래에 알려 드리고 대진을 작성하지 않습니다.`
                    : '조 안의 모든 팀과 한 번씩(풀리그) — 5팀 조면 팀당 4경기, 조 전체 10경기.'}
                </Text>
              </>
            )}
            <ChoiceRow label="한 경기" options={[['4', '4게임'], ['6', '6게임'], ['8', '8게임']]}
              value={crit.games} onChange={(v) => setCrit({ ...crit, games: v })} />
            {critUseGroups && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {(critKdk || crit.groupMethod !== GROUP_METHOD.GRADE) && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>{critKdk ? '조 개수 (1이면 인원에 맞춰 자동)' : '조 개수 (부마다)'}</Text>
                    <Field keyboardType="number-pad" value={crit.groupCount} onChangeText={(v) => setCrit({ ...crit, groupCount: v })} />
                  </View>
                )}
                {!critKdk && critKnockout && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>조별 본선 진출</Text>
                    <Field keyboardType="number-pad" value={crit.advance} onChangeText={(v) => setCrit({ ...crit, advance: v })} suffix="팀" />
                  </View>
                )}
              </View>
            )}
            {critUseGroups && !critKdk && (
              <View style={{ marginBottom: 12 }}>
                {/* 부별 본선 크기 — 진출 팀 수가 맞는지 바로 보이게 */}
                {critKnockout && critEvents.map((k) => {
                  const p = planFor(k);
                  return (
                    <Text key={k} style={{ fontSize: 11, color: p.byes ? C.warn : C.sub, lineHeight: 17 }}>
                      · {EVENTS[k].name}: {planText(p)}
                    </Text>
                  );
                })}
                {/* 조별 경기 수 경고 — 고칠 방법을 버튼으로 */}
                {gameIssues().map((iss) => (
                  <View key={iss.k} style={{ marginTop: 8, padding: 10, borderRadius: R.md, backgroundColor: C.warnBg, borderWidth: 1, borderColor: '#F5C27A' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: C.warn }}>⚠️ {EVENTS[iss.k].name} — 조마다 경기 수가 다릅니다</Text>
                    <Text style={{ fontSize: 11.5, color: C.warn, marginTop: 4, lineHeight: 17 }}>
                      {iss.teams}팀을 {iss.gc}개 조로: {iss.text}{'\n'}이대로는 대진을 작성할 수 없습니다. 아래 중 하나로 맞추세요.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {iss.fixes.map((f) => (
                        f.kind === 'addTeams'
                          ? <Chip key={f.kind} tone="outline">{fixLabel(f)}</Chip>
                          : <Chip key={f.kind} tone="green" onPress={() => applyFix(iss, f)}>{fixLabel(f)}</Chip>
                      ))}
                    </View>
                  </View>
                ))}
                <Pressable onPress={() => setSplitOpen(!splitOpen)}
                  style={({ pressed }) => ({
                    marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, borderRadius: R.md, borderWidth: 1.5,
                    borderColor: splitOpen ? C.green : C.border, backgroundColor: splitOpen ? C.greenSoft : C.surface,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Text style={{ fontSize: 18 }}>⚙️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: splitOpen ? C.green : C.text }}>부·조마다 따로 정하기</Text>
                    <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>남자부·여자부 조 개수가 다르거나, 조마다 본선 진출 수가 다를 때</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: C.green }}>{splitOpen ? '닫기' : '열기 ›'}</Text>
                </Pressable>
                {splitOpen && (
                  <View style={{ marginTop: 8, padding: 10, borderRadius: R.md, backgroundColor: C.fill }}>
                    <Text style={{ fontSize: 11, color: C.faint, lineHeight: 16, marginBottom: 8 }}>
                      빈칸은 위 기본값을 씁니다. 예) 남자부 2개 조·조마다 4팀 진출, 여자부 2개 조·조마다 2팀 진출.
                      {critKnockout ? ' 대진을 짠 뒤에는 조마다 진출 팀 수를 따로 정할 수 있습니다(예: A조 4팀, B조 3팀).' : ''}
                    </Text>
                    {critEvents.map((k) => {
                      const v = crit.byDiv[k] || {};
                      const gs = eventsChanged ? [] : groups.filter((g) => g.div === k);
                      const dAdv = divRules(critRules(), k).advance;
                      return (
                        <View key={k} style={{ marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: C.text }}>{EVENTS[k].name}</Text>
                            {crit.groupMethod !== GROUP_METHOD.GRADE && (
                              <>
                                <Text style={{ fontSize: 11, color: C.sub }}>조</Text>
                                <View style={{ width: 58 }}>
                                  <Field keyboardType="number-pad" placeholder={crit.groupCount} value={v.groupCount || ''} onChangeText={(x) => setDivCrit(k, 'groupCount', x)} />
                                </View>
                              </>
                            )}
                            {critKnockout && (
                              <>
                                <Text style={{ fontSize: 11, color: C.sub }}>진출</Text>
                                <View style={{ width: 58 }}>
                                  <Field keyboardType="number-pad" placeholder={crit.advance} value={v.advance || ''} onChangeText={(x) => setDivCrit(k, 'advance', x)} />
                                </View>
                              </>
                            )}
                          </View>
                          {critKnockout && gs.length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 8 }}>
                              {gs.map((g) => (
                                <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={{ fontSize: 11, color: C.sub }}>{g.name}({g.entryIds.length}팀)</Text>
                                  <View style={{ width: 52 }}>
                                    <Field keyboardType="number-pad" placeholder={String(dAdv)} value={crit.groupAdvance[g.id] || ''}
                                      onChangeText={(x) => setCrit({ ...crit, groupAdvance: { ...crit.groupAdvance, [g.id]: x } })} />
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            <Text style={{ fontSize: 11.5, color: C.sub, fontWeight: '700', marginBottom: 6 }}>코트</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 74 }}>
                <Field keyboardType="number-pad" value={crit.courts}
                  onChangeText={(v) => setCrit({ ...crit, courts: v, courtNames: normalizeCourtNames(crit.courtNames, Math.max(1, Math.min(20, Number(v) || 1))) })} />
              </View>
              <Text style={{ fontSize: 13, color: C.sub, fontWeight: '600' }}>면</Text>
              <Text style={{ flex: 1, fontSize: 11, color: C.faint }}>코트장에서 부르는 이름으로 바꿀 수 있습니다(예: A·B, 9·10)</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {normalizeCourtNames(crit.courtNames, critCourts()).map((nm, i) => (
                <View key={i} style={{ width: 74 }}>
                  <Text style={{ fontSize: 10, color: C.faint, marginBottom: 2 }}>{i + 1}번째</Text>
                  <Field value={nm} onChangeText={(v) => {
                    const next = normalizeCourtNames(crit.courtNames, critCourts());
                    next[i] = v;
                    setCrit({ ...crit, courtNames: next });
                  }} />
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 16 }}>순위: {critKdk ? KDK_RANK_TEXT : RANK_RULE_TEXT}</Text>
            <View style={{ marginTop: 10 }}>
              <Btn small tone="ghost" onPress={saveCrit}>기준만 저장</Btn>
            </View>
          </Card>

          <SectionTitle hint="이름을 누르면 이 부에서 빼거나 다시 넣습니다(대진을 다시 작성할 때 반영)">
            {ev.name} 참가자 ({divPlayers.length - excluded.filter((id) => divPlayers.some((p) => p.id === id)).length}명 · {genderCount(divPlayers.filter((p) => !excluded.includes(p.id)))})
          </SectionTitle>
          <Card>
            {critEvents.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {critEvents.map((k) => <Chip key={k} tone={div === k ? 'green' : 'outline'} onPress={() => setDiv(k)}>{EVENTS[k].name}</Chip>)}
              </View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {divPlayers.map((p) => (
                <Chip key={p.id} tone={excluded.includes(p.id) ? 'outline' : 'soft'} onPress={() => toggleExclude(p.id)}>
                  {excluded.includes(p.id) ? '✕ ' : ''}<GenderMark gender={p.gender} />{nameOfPlayer(p.id) !== '?' ? nameOfPlayer(p.id) : p.name}
                </Chip>
              ))}
              {divPlayers.length === 0 && <Text style={{ fontSize: 11.5, color: C.faint }}>이 부에 나갈 수 있는 참가자가 없습니다(성별 확인).</Text>}
            </View>
          </Card>
        </>
      )}

      {/* ---------- 부 고르기 ---------- */}
      {events.length > 1 && drawn && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.lg }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {events.map((k) => (
              <Chip key={k} tone={!tabAll && div === k ? 'green' : 'outline'} onPress={() => { setTabAll(false); setDiv(k); setPick([]); }}
                style={k === myDiv ? mineStyle(!tabAll && div === k) : undefined}>
                {EVENTS[k].name}
              </Chip>
            ))}
            <Chip tone={tabAll ? 'green' : 'outline'} onPress={() => setTabAll(true)}>전체 시간표</Chip>
          </View>
        </ScrollView>
      )}
      {events.length > 1 && drawn && !!myDiv && <MineLegend text="내가 나가는 부" />}

      {!drawn && (
        <EmptyState icon="🎾" title="아직 대진이 없습니다"
          body={isAdmin ? '위 「자동 대진 작성」을 누르세요. 기준은 「작성 기준 설정」에서 바꿉니다.' : '운영진이 대진을 작성하면 여기에 표시됩니다.'} />
      )}

      {drawn && tabAll && (
        <>
          <SectionTitle hint="모든 부를 한 표에 — 칸 위 꼬리표가 부·조입니다">전체 시간표</SectionTitle>
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={allGrid()} nameOf={nameOfPlayer} me={me} venue={{ courts, courtNames }}
              genderOf={(id) => members.find((m) => m.id === id)?.gender || roster.find((p) => p.id === id)?.gender || ''} />
          </Card>
        </>
      )}

      {drawn && !tabAll && isKdk && (
        kdk[div]?.matches?.length ? (
          <KdkDivView kdk={kdk} div={div} games={rules.games} venue={{ courts, courtNames }} nameOf={nameOfPlayer}
            me={me} canEdit={isAdmin} onSave={saveKdk} title={events.length > 1 ? `${ev.name} ` : ''} />
        ) : (
          <EmptyState icon="🎾" title={`${ev.name} 대진이 없습니다`} body={isAdmin ? '참가자가 4명보다 적었을 수 있습니다. 위 안내를 확인하세요.' : '운영진이 작성하면 표시됩니다.'} />
        )
      )}

      {drawn && !tabAll && !isKdk && (
        <>
          {/* 조별리그만 — 끝난 조의 1위(조가 하나면 우승) */}
          {useGroups && !rules.knockout && (() => {
            const champs = leagueChampions(t, rules).filter((c) => c.div === div);
            if (!champs.length) return null;
            const one = divGroups.length === 1;
            return (
              <Card style={{ backgroundColor: C.ink, borderColor: C.green, alignItems: 'center', paddingVertical: 16, marginTop: S.md }}>
                <Text style={{ color: C.lime, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
                  {one ? `${events.length > 1 ? `${ev.name} ` : ''}우승` : `${events.length > 1 ? `${ev.name} ` : ''}조 1위`}
                </Text>
                {champs.map((c) => (
                  <Text key={c.entryId} style={{ color: '#fff', fontSize: one ? 20 : 15, fontWeight: '700', marginTop: 6 }}>
                    🏆 {c.groupName ? `${c.groupName} ` : ''}{nameOfEntry(c.entryId)}
                  </Text>
                ))}
                {!one && champs.length < divGroups.length && (
                  <Text style={{ color: '#BFE3D3', fontSize: 11, marginTop: 6 }}>나머지 조는 경기가 끝나면 표시됩니다</Text>
                )}
              </Card>
            );
          })()}
          <DivKnockout ko={divKo} nameOfEntry={nameOfEntry} canEdit={isAdmin} onSave={saveKo} title={events.length > 1 ? ev.name : ''} />
          {useGroups && divGroups.length > 0 && (
            <>
              {divKo?.bracket && <SectionTitle>{events.length > 1 ? `${ev.name} ` : ''}예선 조별 결과</SectionTitle>}
              <GroupLeagueView
                key={`${t.id}-${div}`}
                t={{ ...t, rules, entries: divEntries, groups: divGroups }}
                members={members} isAdmin={isAdmin} me={me} flash={flash}
                onUpdate={applyDiv}
                onKnockout={divKo?.bracket || !rules.knockout ? undefined : goKnockout}
                courtNames={courtNames} label={events.length > 1 ? `${ev.short} ` : ''}
                editOpen={editOpen} onRemoveTeam={dropTeam} hideRules
                candidates={divPlayers.map((p) => ({ id: p.id, name: p.name, gender: p.gender || '' }))}
                sameGender={ev.gender === 'X'}
                extraEdit={(
                  <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border }}>
                    <Text style={F.bodyBold}>빠진 사람 넣기 ({leftover.length}명)</Text>
                    <Text style={{ fontSize: 11, color: C.faint, marginTop: 2, lineHeight: 16 }}>
                      {ev.play === PLAY.SINGLES ? '한 사람' : '두 사람'}을 고른 뒤 넣을 조를 누르세요.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {leftover.map((p) => (
                        <Chip key={p.id} tone={pick.includes(p.id) ? 'green' : 'outline'}
                          onPress={() => setPick(pick.includes(p.id) ? pick.filter((x) => x !== p.id) : [...pick, p.id].slice(-2))}>
                          {nameOfPlayer(p.id) !== '?' ? nameOfPlayer(p.id) : p.name}
                        </Chip>
                      ))}
                      {leftover.length === 0 && <Text style={{ fontSize: 11.5, color: C.faint }}>빠진 사람이 없습니다.</Text>}
                    </View>
                    {pick.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {divGroups.map((g) => <Btn key={g.id} small onPress={() => putTeam(g.id)}>{g.name}에 넣기</Btn>)}
                      </View>
                    )}
                  </View>
                )}
              />
            </>
          )}
          {useGroups && divGroups.length === 0 && (
            <EmptyState icon="🎾" title={`${ev.name} 대진이 없습니다`} body={isAdmin ? '참가자가 부족했을 수 있습니다. 위 안내를 확인하세요.' : '운영진이 작성하면 표시됩니다.'} />
          )}
          {useGroups && divGroups.length > 0 && !divKo?.bracket && divGroups.every((g) => progress(g).finished) && !isAdmin && rules.knockout && (
            <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>예선이 끝났습니다. 운영진이 본선 대진을 만들면 위에 표시됩니다.</Text>
          )}
        </>
      )}
    </View>
  );
}

export default TournamentDraw;
