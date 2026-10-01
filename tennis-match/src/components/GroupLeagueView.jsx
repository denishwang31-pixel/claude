/* ============================================================
   조별리그 — 대진표 · 결과 · 실시간 순위 (클럽 대회 상세)

   누가 무엇을 하나
     · 회원(누구나)  : 전체 순위·조별 순위·시간표·결과를 본다. 대회 문서를
                      구독하므로 운영진이 결과를 넣는 즉시 순위가 바뀐다.
     · 운영진        : 경기를 눌러 결과 입력, [편성 수정]으로 조 옮기기·선수
                      맞바꾸기·조별 코트 정하기, 예선이 끝나면 본선 대진 생성.

   기존 대진 화면의 표(MatchGrid — 가로 코트 × 세로 타임)를 그대로 써서
   정기 모임 대진표와 같은 모양으로 보인다.
   계산은 전부 src/lib/groupLeague.js (테스트: scripts/test-groupleague.mjs).
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  normRules, RULE_LABELS, RANK_RULE_TEXT, standings, progress, ensureSchedule, setScore,
  moveEntry, swapPlayers, replacePlayer, advanceOf, setGroupCourts, schedule, scoreChoices, nameLookup,
} from '../lib/groupLeague';
import { MatchGrid } from './MatchGrid';
import { mineStyle, MineLegend, MINE } from './Mine';
import { useOptionSheet } from './native';
import { Card, SectionTitle, Chip, Btn, Field } from './ui';
import { C, S, R, F } from '../lib/theme';

const ALL = '__all';
const GRID = '__grid';

/** 순위표 한 조 */
function StandingTable({ group, nameOfEntry, advance, myEntryId, compact }) {
  const rows = standings(group);
  const pr = progress(group);
  const W = { rank: 26, n: 26, wl: 30, g: 30 };
  const head = (t, w) => <Text style={{ width: w, textAlign: 'center', fontSize: 10.5, color: C.faint, fontWeight: '700' }}>{t}</Text>;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {head('순위', W.rank)}
        <Text style={{ flex: 1, fontSize: 10.5, color: C.faint, fontWeight: '700', paddingLeft: 6 }}>팀</Text>
        {!compact && head('경기', W.n)}
        {head('승', W.wl)}
        {head('패', W.wl)}
        {!compact && head('득', W.g)}
        {!compact && head('실', W.g)}
        {head('득실', 36)}
      </View>
      {rows.map((r) => {
        const up = advance > 0 && r.rank <= advance && r.played > 0;
        const mine = r.id === myEntryId;
        return (
          <View key={r.id} style={{
            flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
            borderBottomWidth: 1, borderBottomColor: C.fill,
            backgroundColor: mine ? MINE.bg : 'transparent',
          }}>
            <View style={{ width: W.rank, alignItems: 'center' }}>
              <View style={{
                minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
                backgroundColor: up ? C.green : C.fill, alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: up ? '#fff' : C.sub }}>{r.rank}{r.tie ? '=' : ''}</Text>
              </View>
            </View>
            <Text numberOfLines={2} style={{ flex: 1, fontSize: 12.5, fontWeight: mine ? '800' : '600', color: C.text, paddingLeft: 6 }}>
              {nameOfEntry(r.id)}
            </Text>
            {!compact && <Text style={{ width: W.n, textAlign: 'center', fontSize: 12, color: C.sub }}>{r.played}</Text>}
            <Text style={{ width: W.wl, textAlign: 'center', fontSize: 12.5, fontWeight: '800', color: C.green }}>{r.w}</Text>
            <Text style={{ width: W.wl, textAlign: 'center', fontSize: 12, color: C.sub }}>{r.l}</Text>
            {!compact && <Text style={{ width: W.g, textAlign: 'center', fontSize: 12, color: C.sub }}>{r.gf}</Text>}
            {!compact && <Text style={{ width: W.g, textAlign: 'center', fontSize: 12, color: C.sub }}>{r.ga}</Text>}
            <Text style={{
              width: 36, textAlign: 'center', fontSize: 12, fontWeight: '700',
              color: r.diff > 0 ? C.green2 : r.diff < 0 ? C.danger : C.faint,
            }}>{r.diff > 0 ? '+' : ''}{r.diff}</Text>
          </View>
        );
      })}
      <Text style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>
        경기 {pr.done}/{pr.total}{pr.finished ? ' · 조 경기 끝' : ''}{advance > 0 ? ` · 초록 순위 = 본선 진출권(상위 ${advance}팀)` : ''}
      </Text>
    </View>
  );
}

/**
 * @param t         대회 문서
 * @param onUpdate  (patch) => Promise — 운영진 저장. 읽기 전용(외부 공개 등)이면 생략
 */
export function GroupLeagueView({
  t, members = [], isAdmin, me = '', flash = () => {}, onUpdate, onKnockout,
  courtNames = [], label = '', editOpen, onRemoveTeam, extraEdit = null, hideRules = false,
  candidates = null, sameGender = false,
}) {
  /* candidates — 이 부에 나갈 수 있는 사람 [{id,name,gender}]. 있으면 선수를 누를 때
     "누구로 바꿀까요?" 목록이 뜬다(대진 밖 사람으로 바꾸기 포함). sameGender — 혼복: 남↔남, 여↔여만 */
  const rules = normRules({ ...(t.rules || {}), advance: t.rules?.advance ?? t.advancePerGroup ?? 2 });
  const courts = Math.max(1, Number(t.courts) || 2);
  const groups = useMemo(() => ensureSchedule(t.groups || [], courts), [t.groups, courts]);
  const entries = t.entries || [];
  const nameOfPlayer = useMemo(() => nameLookup(members, t.guests || []), [members, t.guests]);
  const nameOfEntry = (id) => entries.find((e) => e.id === id)?.name || '?';
  const myEntryId = entries.find((e) => (e.players || []).includes(me))?.id || '';
  const myGroup = groups.find((g) => g.entryIds.includes(myEntryId));
  const [tab, setTab] = useState(myGroup?.id || ALL);
  const [editingOwn, setEditing] = useState(false);
  /* 부모(대회 대진 작성 화면)가 [수기 수정] 버튼으로 열고 닫을 수 있다 */
  const controlled = typeof editOpen === 'boolean';
  const editing = controlled ? editOpen : editingOwn;
  /* 코트 이름 — 표·결과 입력창에 숫자 대신 그 코트장이 부르는 이름 */
  const venue = { courts, courtNames };
  const cn = (c) => (courtNames && courtNames[c - 1]) || String(c);
  const [pickPlayer, setPickPlayer] = useState(null);   // 선수 맞바꾸기 — 첫 번째로 누른 사람
  const [typed, setTyped] = useState(null);             // { id, a, b } 직접 입력 중
  const sheet = useOptionSheet();
  const canEdit = !!isAdmin && !!onUpdate;

  /* opts.reschedule — 조·코트가 바뀌어 시간표를 다시 짜야 할 때(부모가 모든 부를 함께 다시 짠다) */
  const save = async (patch, msg, opts) => {
    try { await onUpdate(patch, opts); if (msg) flash(msg); } catch (e) { flash('저장하지 못했습니다'); }
  };
  const saveGroups = (gs, msg, opts) => save({ groups: gs }, msg, opts);

  /* 결과 입력 — 빠른 버튼(6:0 …) + 직접 입력 + 지우기 */
  const record = (m) => {
    if (!canEdit) return;
    const g = rules.games;
    const opts = [
      ...scoreChoices(g).map(([w, l]) => ({ key: `${w}:${l}`, label: `${nameOfEntry(m.a)}  ${w} : ${l}` })),
      ...scoreChoices(g).map(([w, l]) => ({ key: `${l}:${w}`, label: `${nameOfEntry(m.b)}  ${w} : ${l}` })),
      { key: 'type', label: '직접 입력' },
      ...(m.score ? [{ key: 'clear', label: '결과 지우기', destructive: true }] : []),
    ];
    sheet.open({
      title: `${m.round}타임 · 코트 ${cn(m.court)}\n${nameOfEntry(m.a)} vs ${nameOfEntry(m.b)}`,
      options: opts,
      onSelect: (o) => {
        if (o.key === 'type') { setTyped({ id: m.id, a: '', b: '' }); return; }
        if (o.key === 'clear') { saveGroups(setScore(groups, m.id, null), '결과를 지웠습니다'); return; }
        const [a, b] = o.key.split(':').map(Number);
        saveGroups(setScore(groups, m.id, { a, b }));
      },
    });
  };
  const saveTyped = () => {
    if (!typed) return;
    if (typed.a === '' || typed.b === '' || +typed.a === +typed.b) return flash('스코어를 확인하세요 (동점 불가)');
    saveGroups(setScore(groups, typed.id, { a: +typed.a, b: +typed.b }));
    return setTyped(null);
  };

  /* 편성 수정 */
  const moveTo = (entryId) => {
    const others = groups.filter((g) => !g.entryIds.includes(entryId));
    sheet.open({
      title: `${nameOfEntry(entryId)} — 어느 조로 옮길까요?`,
      options: others.map((g) => ({ key: g.id, label: `${g.name} (${g.entryIds.length}팀)` })),
      onSelect: (o) => {
        const r = moveEntry(groups, entryId, o.key, courts);
        if (r.error) return flash(r.error);
        return saveGroups(r.groups, '조를 옮겼습니다 — 두 조의 경기와 시간표를 다시 짰습니다', { reschedule: true });
      },
    });
  };
  const groupOfEntry = (eid) => groups.find((g) => g.entryIds.includes(eid));
  const changePlayer = (pid) => {
    const me0 = candidates.find((p) => p.id === pid);
    const myEntry = entries.find((e) => e.players.includes(pid));
    const inDraw = new Map(entries.flatMap((e) => e.players.map((p) => [p, e])));
    const ok = (p) => p.id !== pid && !(myEntry?.players || []).includes(p.id)
      && (!sameGender || !me0?.gender || p.gender === me0.gender);
    const nm = (p) => (nameOfPlayer(p.id) !== '?' ? nameOfPlayer(p.id) : p.name);
    const outside = candidates.filter((p) => ok(p) && !inDraw.has(p.id));
    const inside = candidates.filter((p) => ok(p) && inDraw.has(p.id));
    const options = [
      ...outside.map((p) => ({ key: p.id, label: `${nm(p)} 선수 넣기 · 지금 대진 밖` })),
      ...inside.map((p) => ({ key: p.id, label: `${nm(p)} 선수와 맞바꾸기 · ${groupOfEntry(inDraw.get(p.id).id)?.name || ''}` })),
    ];
    if (!options.length) { flash('바꿀 수 있는 사람이 없습니다'); return; }
    sheet.open({
      title: `${nameOfPlayer(pid)} 자리에 누구를?${sameGender ? ' (혼복 — 같은 성별만)' : ''}`,
      options,
      onSelect: (o) => {
        const r = replacePlayer(entries, groups, pid, o.key, nameOfPlayer);
        if (r.error) { flash(r.error); return; }
        save({ entries: r.entries }, inDraw.has(o.key) ? '두 사람을 맞바꿨습니다' : '선수를 바꿨습니다');
      },
    });
  };
  const tapPlayer = (pid) => {
    if (candidates) { changePlayer(pid); return; }
    if (!pickPlayer) { setPickPlayer(pid); return; }
    if (pickPlayer === pid) { setPickPlayer(null); return; }
    const r = swapPlayers(entries, groups, pickPlayer, pid, nameOfPlayer);
    setPickPlayer(null);
    if (r.error) { flash(r.error); return; }
    save({ entries: r.entries }, '선수를 맞바꿨습니다');
  };
  const toggleCourt = (g, c) => {
    const cur = (g.courts || []).map(Number);
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c].sort((a, b) => a - b);
    saveGroups(setGroupCourts(groups, g.id, next, courts), '', { reschedule: true });
  };
  const reschedule = () => saveGroups(schedule(groups, courts), '시간표를 다시 짰습니다(결과는 그대로)', { reschedule: true });

  /* 표 — 기존 대진 표 모양 */
  const gridMatches = (gs) => gs.flatMap((g) => (g.matches || []).map((m) => ({
    ...m,
    teamA: entries.find((e) => e.id === m.a)?.players || [],
    teamB: entries.find((e) => e.id === m.b)?.players || [],
    type: `${label}${g.name}`,
  })));
  const genderOf = (id) => members.find((m) => m.id === id)?.gender || '';

  const allDone = groups.length > 0 && groups.every((g) => progress(g).finished);
  const tabs = [{ key: ALL, label: '전체 순위' }, ...groups.map((g) => ({ key: g.id, label: g.name })), { key: GRID, label: '시간표' }];
  const shown = groups.find((g) => g.id === tab);

  return (
    <View>
      {/* 기준 */}
      {!hideRules && <Card style={{ marginTop: S.md, backgroundColor: C.fill }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          <Chip tone="outline">{RULE_LABELS.play[rules.play]}</Chip>
          {rules.play === 'doubles' && <Chip tone="outline">{RULE_LABELS.teamMode[rules.teamMode]}</Chip>}
          <Chip tone="outline">조 편성 · {RULE_LABELS.groupMethod[rules.groupMethod]}</Chip>
          <Chip tone="outline">{rules.games}게임 선승</Chip>
          <Chip tone="outline">코트 {courts}면</Chip>
        </View>
        <Text style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>순위: {RANK_RULE_TEXT}</Text>
      </Card>}

      {/* 탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {tabs.map((x) => (
            <Chip key={x.key} tone={tab === x.key ? 'green' : 'outline'} onPress={() => setTab(x.key)}
              style={x.key === myGroup?.id ? mineStyle(tab === x.key) : undefined}>
              {x.label}
            </Chip>
          ))}
        </View>
      </ScrollView>
      {!!myGroup && <MineLegend text="내가 속한 조 · 순위표의 내 팀도 같은 색 (시간표에서 내 경기는 초록 테두리)" />}

      {tab === ALL && groups.map((g) => (
        <Card key={g.id} style={{ marginTop: S.md }}>
          <Pressable onPress={() => setTab(g.id)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[F.h3, { flex: 1 }]}>{g.name}</Text>
            <Text style={{ fontSize: 11.5, color: C.green2, fontWeight: '700' }}>경기·결과 ›</Text>
          </Pressable>
          <StandingTable group={g} nameOfEntry={nameOfEntry} advance={advanceOf(rules, g)} myEntryId={myEntryId} compact />
        </Card>
      ))}

      {tab === GRID && (
        <>
          <SectionTitle hint={canEdit ? '경기를 누르면 결과를 넣습니다. 칸 위 꼬리표가 조 이름입니다.' : '칸 위 꼬리표가 조 이름입니다. 내 이름은 초록으로 칠해집니다.'}>
            전체 시간표
          </SectionTitle>
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={gridMatches(groups)} nameOf={nameOfPlayer} genderOf={genderOf} me={me} venue={venue}
              onPressMatch={canEdit ? (gm) => record(gm) : undefined} />
          </Card>
        </>
      )}

      {shown && (
        <>
          <SectionTitle>{shown.name} 순위</SectionTitle>
          <Card>
            <StandingTable group={shown} nameOfEntry={nameOfEntry} advance={advanceOf(rules, shown)} myEntryId={myEntryId} />
          </Card>

          {/* 경기 목록은 따로 두지 않는다 — 시간표 칸을 눌러 결과를 넣는다(앱 주인: 같은 경기가 두 번 나와 헷갈림) */}
          <SectionTitle hint={canEdit ? '칸을 누르면 결과를 넣습니다 · 결과가 들어간 칸에 점수가 보입니다' : '내 경기는 초록 테두리로 보입니다'}>
            {shown.name} 경기 · 시간표
          </SectionTitle>
          {canEdit && (
            <Text style={{ fontSize: 11.5, color: C.sub, marginTop: -4, marginBottom: 8, lineHeight: 17 }}>
              👆 경기 칸을 누르면 「6 : 0」 같은 빠른 버튼이 뜹니다. 점수가 다르면 「직접 입력」, 잘못 넣었으면 「결과 지우기」.
            </Text>
          )}
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={gridMatches([shown])} nameOf={nameOfPlayer} genderOf={genderOf} me={me} venue={venue}
              onPressMatch={canEdit ? (gm) => record(gm) : undefined} />
          </Card>
        </>
      )}

      {/* 직접 입력 — 시간표에서 「직접 입력」을 고르면 여기에 */}
      {typed && (() => {
        const m = groups.flatMap((g) => g.matches || []).find((x) => x.id === typed.id);
        if (!m) return null;
        return (
          <Card style={{ marginTop: 8, borderColor: C.green, borderWidth: 1.5 }}>
            <Text style={F.bodyBold}>{m.round}타임 · 코트 {cn(m.court)} — 점수 직접 입력</Text>
            <Text style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{nameOfEntry(m.a)}  vs  {nameOfEntry(m.b)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Field keyboardType="number-pad" placeholder="위 팀" value={typed.a} onChangeText={(v) => setTyped({ ...typed, a: v })} style={{ flex: 1 }} />
              <Text style={{ fontWeight: '700', color: C.faint }}>:</Text>
              <Field keyboardType="number-pad" placeholder="아래 팀" value={typed.b} onChangeText={(v) => setTyped({ ...typed, b: v })} style={{ flex: 1 }} />
              <Btn small onPress={saveTyped}>저장</Btn>
              <Btn small tone="ghost" onPress={() => setTyped(null)}>취소</Btn>
            </View>
          </Card>
        );
      })()}

      {/* 편성 수정 — 운영진 */}
      {canEdit && (
        <>
          {controlled ? (editing && <SectionTitle>수기 수정</SectionTitle>) : (
            <SectionTitle right={
              <Chip tone={editing ? 'green' : 'outline'} onPress={() => { setEditing(!editing); setPickPlayer(null); }}>
                {editing ? '닫기' : '열기'}
              </Chip>
            }>편성 수정 (운영진)</SectionTitle>
          )}
          {!editing && !controlled && (
            <Text style={{ fontSize: 11.5, color: C.faint, lineHeight: 17 }}>
              조 옮기기 · 선수 맞바꾸기 · 조별 코트 정하기 · 시간표 다시 짜기. 이미 친 경기 결과는 지켜집니다.
            </Text>
          )}
          {editing && (
            <Card>
              <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 17 }}>
                · 선수 이름을 누르면 {candidates ? '다른 사람으로 바꿉니다 — 대진 밖 사람을 넣거나, 다른 팀 선수와 맞바꿉니다' : '그다음 누른 사람과 맞바꿉니다'}(경기 전 팀만).{'\n'}
                · 팀 오른쪽 「조 이동」으로 다른 조에 보냅니다(경기한 팀은 못 옮김).{'\n'}
                · 「이 조 전용 코트」 — 조마다 쓸 코트를 정합니다. 예) A조는 1·2번, B조는 3·4번 코트에서만. 아무것도 안 고르면 모든 조가 빈 코트를 나눠 씁니다.
              </Text>
              {pickPlayer && (
                <Text style={{ fontSize: 12, color: C.green, fontWeight: '700', marginTop: 8 }}>
                  {nameOfPlayer(pickPlayer)} 선택됨 — 맞바꿀 사람을 누르세요
                </Text>
              )}
              {groups.map((g) => (
                <View key={g.id} style={{ marginTop: 14, padding: 10, borderRadius: R.md, backgroundColor: C.fill }}>
                  <Text style={F.bodyBold}>{g.name} · {g.entryIds.length}팀</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: C.faint }}>이 조 전용 코트{(g.courts || []).length ? '' : ' (지금: 모든 코트 함께)'}</Text>
                    {Array.from({ length: courts }, (_, i) => i + 1).map((c) => (
                      <Chip key={c} tone={(g.courts || []).map(Number).includes(c) ? 'green' : 'outline'} onPress={() => toggleCourt(g, c)}>{cn(c)}</Chip>
                    ))}
                  </View>
                  {g.entryIds.map((eid) => {
                    const e = entries.find((x) => x.id === eid);
                    return (
                      <View key={eid} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {(e?.players || []).map((pid) => (
                            <Chip key={pid} tone={pickPlayer === pid ? 'green' : 'default'} onPress={() => tapPlayer(pid)}>{nameOfPlayer(pid)}</Chip>
                          ))}
                        </View>
                        {groups.length > 1 && <Btn small tone="ghost" onPress={() => moveTo(eid)}>조 이동</Btn>}
                        {onRemoveTeam && <Btn small tone="ghost" onPress={() => onRemoveTeam(eid)}>빼기</Btn>}
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={{ marginTop: 12 }}>
                <Btn small tone="ghost" onPress={reschedule}>시간표 다시 짜기</Btn>
              </View>
              {extraEdit}
            </Card>
          )}
        </>
      )}

      {canEdit && onKnockout && groups.some((g) => advanceOf(rules, g) > 0) && (
        <View style={{ marginTop: 16 }}>
          <Btn full disabled={!allDone} onPress={() => onKnockout(groups)}>
            {allDone ? '예선 종료 → 본선 토너먼트 대진 만들기' : '예선 경기를 모두 입력하면 본선 대진을 만들 수 있습니다'}
          </Btn>
        </View>
      )}
      {sheet.node}
    </View>
  );
}

export default GroupLeagueView;
