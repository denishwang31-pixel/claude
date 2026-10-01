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
   계산은 src/lib/groupLeague.js (테스트: scripts/test-groupleague.mjs).
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { View, Text, Alert, ScrollView } from 'react-native';
import { updateTournament } from '../lib/firestore';
import {
  normRules, RULE_LABELS, RANK_RULE_TEXT, TEAM_MODE, GROUP_METHOD, PLAY,
  EVENTS, eventOf, eligible, drawAll, redrawDivision, schedule, playersOfFn, addTeam, removeTeam,
  leagueQualifiers, nameLookup, progress,
} from '../lib/groupLeague';
import { buildBracket, applyResult, championOf, roundName, orderBySeed } from '../lib/tournament';
import { normalizeCourtNames } from '../lib/courtNames';
import { GroupLeagueView } from './GroupLeagueView';
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
      {bracket.rounds.map((round, ri) => (
        <View key={ri}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.green, marginTop: 8, marginBottom: 6 }}>{roundName(ri, bracket.rounds.length)}</Text>
          {round.matches.map((m) => {
            const bye = (m.a && !m.b) || (!m.a && m.b);
            return (
              <Card key={m.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: m.winner === m.a ? '900' : '600', color: m.winner === m.a ? C.green : C.text }}>{m.a ? nameOfEntry(m.a) : '—'}</Text>
                    <Text style={{ fontSize: 13, fontWeight: m.winner === m.b ? '900' : '600', color: m.winner === m.b ? C.green : C.text, marginTop: 2 }}>{m.b ? nameOfEntry(m.b) : '—'}</Text>
                  </View>
                  {m.score ? <Text style={{ fontSize: 14, fontWeight: '800' }}>{m.score.a} : {m.score.b}</Text>
                    : bye ? <Chip tone="default">부전승</Chip>
                      : canEdit && m.a && m.b ? <Btn small tone="ghost" onPress={() => { setEdit(m.id); setSc({ a: '', b: '' }); }}>입력</Btn>
                        : <Text style={{ fontSize: 11, color: C.faint }}>대기</Text>}
                </View>
                {edit === m.id && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Field keyboardType="number-pad" placeholder="위" value={sc.a} onChangeText={(v) => setSc({ ...sc, a: v })} style={{ flex: 1 }} />
                    <Text style={{ fontWeight: '700', color: C.faint }}>:</Text>
                    <Field keyboardType="number-pad" placeholder="아래" value={sc.b} onChangeText={(v) => setSc({ ...sc, b: v })} style={{ flex: 1 }} />
                    <Btn small onPress={() => save(m.id)}>저장</Btn>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ))}
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
  const drawn = entries.length > 0;
  const nameOfPlayer = useMemo(() => nameLookup(members, t.guests || []), [members, t.guests]);
  const nameOfEntry = (id) => entries.find((e) => e.id === id)?.name || '?';
  const hasResults = groups.some((g) => (g.matches || []).some((m) => m.score)) || Object.values(t.ko || {}).some((k) => k?.bracket);

  const myDiv = events.find((k) => entries.some((e) => e.div === k && (e.players || []).includes(me)));
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
    courts: String(courts),
    courtNames,
  }));
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
  });
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
    setBusy(true);
    try {
      if (scope === 'all') {
        const d = drawAll(roster, r, events, { courts: n, excluded: t.excluded || {}, useGroups });
        if (!d.entries.length) { flash(d.problems[0] || '대진을 짤 사람이 부족합니다'); return; }
        const ko = useGroups ? {} : Object.fromEntries(events.map((k) => [k, koFor(d.entries.filter((e) => e.div === k))]).filter(([, v]) => v.bracket?.rounds?.length));
        await updateTournament(clubId, t.id, {
          rules: r, courts: n, courtNames: names, entries: d.entries, groups: d.groups, ko, drawNotes: d.problems,
        });
        flash(d.problems.length ? `대진을 작성했습니다 — 확인할 것 ${d.problems.length}건` : '대진을 작성했습니다');
      } else {
        const d = redrawDivision(t, div, roster, r, { courts: n, excluded, useGroups });
        const ko = { ...(t.ko || {}) };
        delete ko[div];
        if (!useGroups) {
          const k = koFor(d.entries.filter((e) => e.div === div));
          if (k.bracket?.rounds?.length) ko[div] = k;
        }
        await updateTournament(clubId, t.id, {
          rules: r, courts: n, courtNames: names, entries: d.entries, groups: d.groups, ko,
          drawNotes: d.problem ? [d.problem] : [],
        });
        flash(d.problem || `${ev.name} 대진을 다시 작성했습니다`);
      }
      setSetupOpen(false);
    } catch (e) {
      flash('대진을 저장하지 못했습니다');
    } finally { setBusy(false); }
  };
  const askDraw = () => {
    if (!drawn) { runDraw('all'); return; }
    const warn = hasResults ? '\n\n⚠️ 입력한 결과가 함께 지워집니다.' : '';
    const opts = [{ text: '취소', style: 'cancel' }];
    if (events.length > 1) opts.push({ text: `${ev.name}만`, onPress: () => runDraw(div) });
    opts.push({ text: events.length > 1 ? '전체 부' : '다시 작성', style: hasResults ? 'destructive' : 'default', onPress: () => runDraw('all') });
    Alert.alert('대진 다시 작성', `지금 기준으로 다시 짭니다.${warn}`, opts);
  };
  const saveCrit = () => {
    const n = critCourts();
    const next = { rules: critRules(), courts: n, courtNames: normalizeCourtNames(crit.courtNames, n) };
    /* 면수가 바뀌었으면 시간표만 다시(대진·결과는 그대로) */
    if (drawn && n !== courts) next.groups = schedule(groups, n, { playersOf: playersOfFn(entries) });
    save(next, '작성 기준을 저장했습니다');
  };

  /* 한 부의 변경을 대회 전체에 합친다 — 조·코트가 바뀌면 모든 부의 시간표를 함께 다시 짠다 */
  const order = (gs) => [...gs].sort((a, b) => events.indexOf(a.div) - events.indexOf(b.div));
  const applyDiv = async (patch, opts = {}) => {
    const nextEntries = patch.entries ? [...entries.filter((e) => e.div !== div), ...patch.entries] : entries;
    let nextGroups = patch.groups ? order([...groups.filter((g) => g.div !== div), ...patch.groups]) : groups;
    if (opts.reschedule) nextGroups = schedule(nextGroups, courts, { playersOf: playersOfFn(nextEntries) });
    await updateTournament(clubId, t.id, {
      ...(patch.entries ? { entries: nextEntries } : {}),
      ...(patch.groups ? { groups: nextGroups } : {}),
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
    const q = leagueQualifiers(gs, rules.advance || 2);
    if (q.length < 2) { flash('진출 팀이 부족합니다'); return; }
    save({ ko: { ...(t.ko || {}), [div]: { bracket: buildBracket(q.map((x) => x.entryId)), championId: null } } },
      `${ev.name} 본선 토너먼트 대진을 만들었습니다`);
  };
  const saveKo = (k) => {
    const next = { ...(t.ko || {}), [div]: k };
    const allDone = events.every((e) => next[e]?.championId);
    save({ ko: next, ...(allDone ? { status: 'finished' } : {}) }, k.championId ? `🏆 ${ev.name} 우승: ${nameOfEntry(k.championId)}` : '');
  };

  /* 전체 시간표 — 모든 부를 한 표에 (코트 운영용) */
  const allGrid = () => groups.flatMap((g) => (g.matches || []).map((m) => ({
    ...m,
    teamA: entries.find((e) => e.id === m.a)?.players || [],
    teamB: entries.find((e) => e.id === m.b)?.players || [],
    type: `${eventOf(g.div).short} ${g.name}`,
  })));
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
            <Chip tone="outline">{useGroups ? `조별리그 → 본선 ${rules.advance}팀씩` : '토너먼트만'}</Chip>
          </View>
          <Text style={{ fontSize: 11.5, color: C.sub, marginTop: 8, lineHeight: 17 }}>
            {RULE_LABELS.teamMode[rules.teamMode] || ''} · {RULE_LABELS.groupMethod[rules.groupMethod]} · {rules.games}게임 선승
            {useGroups ? ` · 부마다 ${rules.groupCount}개 조` : ''}
          </Text>
          {events.length > 1 && events.some((k) => EVENTS[k].gender === 'M') && events.some((k) => EVENTS[k].gender === 'F') && (
            <Text style={{ fontSize: 11, color: C.green, marginTop: 4 }}>남자부·여자부를 따로 운영하고 따로 시상합니다.</Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <Btn disabled={busy} onPress={askDraw}>{busy ? '작성 중…' : drawn ? '대진 다시 작성' : '자동 대진 작성'}</Btn>
            <Btn tone="ghost" onPress={() => setSetupOpen(!setupOpen)}>{setupOpen ? '기준 닫기' : '작성 기준 설정'}</Btn>
            {drawn && useGroups && <Btn tone="ghost" onPress={() => setEditOpen(!editOpen)}>{editOpen ? '수정 닫기' : '수기 수정'}</Btn>}
          </View>
          {(t.drawNotes || []).length > 0 && (
            <View style={{ marginTop: 10, padding: 10, borderRadius: R.md, backgroundColor: C.warnBg }}>
              {(t.drawNotes || []).map((x) => <Text key={x} style={{ fontSize: 11.5, color: C.warn, lineHeight: 17 }}>· {x}</Text>)}
              <Text style={{ fontSize: 10.5, color: C.warn, marginTop: 4 }}>빠진 사람은 「수기 수정」에서 짝을 지어 조에 넣을 수 있습니다.</Text>
            </View>
          )}
        </Card>
      )}

      {isAdmin && setupOpen && (
        <>
          <SectionTitle hint="대회 전체에 적용됩니다. 저장하거나 「자동 대진 작성」을 누를 때 반영됩니다.">작성 기준</SectionTitle>
          <Card>
            {events.some((k) => EVENTS[k].play === PLAY.DOUBLES) && (
              <ChoiceRow label="짝 짓기 (복식)" options={[[TEAM_MODE.BALANCED, '실력 균등'], [TEAM_MODE.RANDOM, '무작위']]}
                value={crit.teamMode} onChange={(v) => setCrit({ ...crit, teamMode: v })} />
            )}
            {useGroups && (
              <ChoiceRow label="조 나누기" options={Object.entries(RULE_LABELS.groupMethod)}
                value={crit.groupMethod} onChange={(v) => setCrit({ ...crit, groupMethod: v })} />
            )}
            <ChoiceRow label="한 경기" options={[['4', '4게임'], ['6', '6게임'], ['8', '8게임']]}
              value={crit.games} onChange={(v) => setCrit({ ...crit, games: v })} />
            {useGroups && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {crit.groupMethod !== GROUP_METHOD.GRADE && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>조 개수 (부마다)</Text>
                    <Field keyboardType="number-pad" value={crit.groupCount} onChangeText={(v) => setCrit({ ...crit, groupCount: v })} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>조별 본선 진출</Text>
                  <Field keyboardType="number-pad" value={crit.advance} onChangeText={(v) => setCrit({ ...crit, advance: v })} suffix="팀" />
                </View>
              </View>
            )}
            <Text style={{ fontSize: 11.5, color: C.sub, fontWeight: '700', marginBottom: 6 }}>코트</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 104 }}>
                <Field keyboardType="number-pad" value={crit.courts} suffix="면"
                  onChangeText={(v) => setCrit({ ...crit, courts: v, courtNames: normalizeCourtNames(crit.courtNames, Math.max(1, Math.min(20, Number(v) || 1))) })} />
              </View>
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
            <Text style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 16 }}>순위: {RANK_RULE_TEXT}</Text>
            <View style={{ marginTop: 10 }}>
              <Btn small tone="ghost" onPress={saveCrit}>기준만 저장</Btn>
            </View>
          </Card>

          <SectionTitle hint="이름을 누르면 이 부에서 빼거나 다시 넣습니다(대진을 다시 작성할 때 반영)">
            {ev.name} 참가자 ({divPlayers.length - excluded.filter((id) => divPlayers.some((p) => p.id === id)).length}명)
          </SectionTitle>
          <Card>
            {events.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {events.map((k) => <Chip key={k} tone={div === k ? 'green' : 'outline'} onPress={() => setDiv(k)}>{EVENTS[k].name}</Chip>)}
              </View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {divPlayers.map((p) => (
                <Chip key={p.id} tone={excluded.includes(p.id) ? 'outline' : 'soft'} onPress={() => toggleExclude(p.id)}>
                  {excluded.includes(p.id) ? '✕ ' : ''}{nameOfPlayer(p.id) !== '?' ? nameOfPlayer(p.id) : p.name}
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
              <Chip key={k} tone={!tabAll && div === k ? 'green' : 'outline'} onPress={() => { setTabAll(false); setDiv(k); setPick([]); }}>
                {EVENTS[k].name}{k === myDiv ? ' · 내 부' : ''}
              </Chip>
            ))}
            <Chip tone={tabAll ? 'green' : 'outline'} onPress={() => setTabAll(true)}>전체 시간표</Chip>
          </View>
        </ScrollView>
      )}

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

      {drawn && !tabAll && (
        <>
          <DivKnockout ko={divKo} nameOfEntry={nameOfEntry} canEdit={isAdmin} onSave={saveKo} title={events.length > 1 ? ev.name : ''} />
          {useGroups && divGroups.length > 0 && (
            <>
              {divKo?.bracket && <SectionTitle>{events.length > 1 ? `${ev.name} ` : ''}예선 조별 결과</SectionTitle>}
              <GroupLeagueView
                key={`${t.id}-${div}`}
                t={{ ...t, rules, entries: divEntries, groups: divGroups }}
                members={members} isAdmin={isAdmin} me={me} flash={flash}
                onUpdate={applyDiv}
                onKnockout={divKo?.bracket ? undefined : goKnockout}
                courtNames={courtNames} label={events.length > 1 ? `${ev.short} ` : ''}
                editOpen={editOpen} onRemoveTeam={dropTeam} hideRules
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
          {useGroups && divGroups.length > 0 && !divKo?.bracket && divGroups.every((g) => progress(g).finished) && !isAdmin && (
            <Text style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>예선이 끝났습니다. 운영진이 본선 대진을 만들면 위에 표시됩니다.</Text>
          )}
        </>
      )}
    </View>
  );
}

export default TournamentDraw;
