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
  moveEntry, swapPlayers, setGroupCourts, schedule, scoreChoices, nameLookup,
} from '../lib/groupLeague';
import { MatchGrid } from './MatchGrid';
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
            backgroundColor: mine ? C.greenSoft : 'transparent',
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
export function GroupLeagueView({ t, members = [], isAdmin, me = '', flash = () => {}, onUpdate, onKnockout }) {
  const rules = normRules({ ...(t.rules || {}), advance: t.rules?.advance ?? t.advancePerGroup ?? 2 });
  const courts = Math.max(1, Number(t.courts) || 2);
  const groups = useMemo(() => ensureSchedule(t.groups || [], courts), [t.groups, courts]);
  const entries = t.entries || [];
  const nameOfPlayer = useMemo(() => nameLookup(members, t.guests || []), [members, t.guests]);
  const nameOfEntry = (id) => entries.find((e) => e.id === id)?.name || '?';
  const myEntryId = entries.find((e) => (e.players || []).includes(me))?.id || '';
  const myGroup = groups.find((g) => g.entryIds.includes(myEntryId));
  const [tab, setTab] = useState(myGroup?.id || ALL);
  const [editing, setEditing] = useState(false);
  const [pickPlayer, setPickPlayer] = useState(null);   // 선수 맞바꾸기 — 첫 번째로 누른 사람
  const [typed, setTyped] = useState(null);             // { id, a, b } 직접 입력 중
  const sheet = useOptionSheet();
  const canEdit = !!isAdmin && !!onUpdate;

  const save = async (patch, msg) => {
    try { await onUpdate(patch); if (msg) flash(msg); } catch (e) { flash('저장하지 못했습니다'); }
  };
  const saveGroups = (gs, msg) => save({ groups: gs }, msg);

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
      title: `${m.round}타임 · 코트 ${m.court}\n${nameOfEntry(m.a)} vs ${nameOfEntry(m.b)}`,
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
        return saveGroups(r.groups, '조를 옮겼습니다 — 두 조의 경기와 시간표를 다시 짰습니다');
      },
    });
  };
  const tapPlayer = (pid) => {
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
    saveGroups(setGroupCourts(groups, g.id, next, courts));
  };
  const reschedule = () => saveGroups(schedule(groups, courts), '시간표를 다시 짰습니다(결과는 그대로)');

  /* 표 — 기존 대진 표 모양 */
  const gridMatches = (gs) => gs.flatMap((g) => (g.matches || []).map((m) => ({
    ...m,
    teamA: entries.find((e) => e.id === m.a)?.players || [],
    teamB: entries.find((e) => e.id === m.b)?.players || [],
    type: g.name,
  })));
  const genderOf = (id) => members.find((m) => m.id === id)?.gender || '';

  const allDone = groups.length > 0 && groups.every((g) => progress(g).finished);
  const tabs = [{ key: ALL, label: '전체 순위' }, ...groups.map((g) => ({ key: g.id, label: g.name })), { key: GRID, label: '시간표' }];
  const shown = groups.find((g) => g.id === tab);

  return (
    <View>
      {/* 기준 */}
      <Card style={{ marginTop: S.md, backgroundColor: C.fill }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          <Chip tone="outline">{RULE_LABELS.play[rules.play]}</Chip>
          {rules.play === 'doubles' && <Chip tone="outline">{RULE_LABELS.teamMode[rules.teamMode]}</Chip>}
          <Chip tone="outline">조 편성 · {RULE_LABELS.groupMethod[rules.groupMethod]}</Chip>
          <Chip tone="outline">{rules.games}게임 선승</Chip>
          <Chip tone="outline">코트 {courts}면</Chip>
        </View>
        <Text style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>순위: {RANK_RULE_TEXT}</Text>
      </Card>

      {/* 탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {tabs.map((x) => (
            <Chip key={x.key} tone={tab === x.key ? 'green' : 'outline'} onPress={() => setTab(x.key)}>
              {x.label}{x.key === myGroup?.id ? ' · 내 조' : ''}
            </Chip>
          ))}
        </View>
      </ScrollView>

      {tab === ALL && groups.map((g) => (
        <Card key={g.id} style={{ marginTop: S.md }}>
          <Pressable onPress={() => setTab(g.id)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[F.h3, { flex: 1 }]}>{g.name}</Text>
            <Text style={{ fontSize: 11.5, color: C.green2, fontWeight: '700' }}>경기·결과 ›</Text>
          </Pressable>
          <StandingTable group={g} nameOfEntry={nameOfEntry} advance={rules.advance} myEntryId={myEntryId} compact />
        </Card>
      ))}

      {tab === GRID && (
        <>
          <SectionTitle hint={canEdit ? '경기를 누르면 결과를 넣습니다. 칸 위 꼬리표가 조 이름입니다.' : '칸 위 꼬리표가 조 이름입니다. 내 이름은 초록으로 칠해집니다.'}>
            전체 시간표
          </SectionTitle>
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={gridMatches(groups)} nameOf={nameOfPlayer} genderOf={genderOf} me={me}
              onPressMatch={canEdit ? (gm) => record(gm) : undefined} />
          </Card>
        </>
      )}

      {shown && (
        <>
          <SectionTitle>{shown.name} 순위</SectionTitle>
          <Card>
            <StandingTable group={shown} nameOfEntry={nameOfEntry} advance={rules.advance} myEntryId={myEntryId} />
          </Card>

          <SectionTitle hint={canEdit ? '경기를 누르면 결과를 넣습니다' : undefined}>{shown.name} 경기</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {[...(shown.matches || [])].sort((a, b) => a.round - b.round || a.court - b.court).map((m, i) => {
              const aWin = m.score && m.score.a > m.score.b;
              const bWin = m.score && m.score.b > m.score.a;
              const mine = m.a === myEntryId || m.b === myEntryId;
              return (
                <View key={m.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: C.fill }}>
                  <Pressable disabled={!canEdit} onPress={() => record(m)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, backgroundColor: mine ? C.greenSoft : 'transparent' }}>
                    <View style={{ width: 52 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: C.green }}>{m.round}타임</Text>
                      <Text style={{ fontSize: 10.5, color: C.faint }}>코트 {m.court}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: aWin ? '800' : '500', color: aWin ? C.green : C.text }}>{nameOfEntry(m.a)}</Text>
                      <Text style={{ fontSize: 12.5, fontWeight: bWin ? '800' : '500', color: bWin ? C.green : C.text, marginTop: 2 }}>{nameOfEntry(m.b)}</Text>
                    </View>
                    {m.score ? (
                      <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{m.score.a} : {m.score.b}</Text>
                    ) : (
                      <Text style={{ fontSize: 11.5, color: canEdit ? C.green2 : C.faint, fontWeight: '700' }}>{canEdit ? '입력' : '경기 전'}</Text>
                    )}
                  </Pressable>
                  {typed?.id === m.id && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10 }}>
                      <Field keyboardType="number-pad" placeholder="위 팀" value={typed.a} onChangeText={(v) => setTyped({ ...typed, a: v })} style={{ flex: 1 }} />
                      <Text style={{ fontWeight: '700', color: C.faint }}>:</Text>
                      <Field keyboardType="number-pad" placeholder="아래 팀" value={typed.b} onChangeText={(v) => setTyped({ ...typed, b: v })} style={{ flex: 1 }} />
                      <Btn small onPress={saveTyped}>저장</Btn>
                      <Btn small tone="ghost" onPress={() => setTyped(null)}>취소</Btn>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>

          <SectionTitle>{shown.name} 시간표</SectionTitle>
          <Card style={{ padding: 10 }}>
            <MatchGrid matches={gridMatches([shown])} nameOf={nameOfPlayer} genderOf={genderOf} me={me}
              onPressMatch={canEdit ? (gm) => record(gm) : undefined} />
          </Card>
        </>
      )}

      {/* 편성 수정 — 운영진 */}
      {canEdit && (
        <>
          <SectionTitle right={
            <Chip tone={editing ? 'green' : 'outline'} onPress={() => { setEditing(!editing); setPickPlayer(null); }}>
              {editing ? '닫기' : '열기'}
            </Chip>
          }>편성 수정 (운영진)</SectionTitle>
          {!editing && (
            <Text style={{ fontSize: 11.5, color: C.faint, lineHeight: 17 }}>
              조 옮기기 · 선수 맞바꾸기 · 조별 코트 정하기 · 시간표 다시 짜기. 이미 친 경기 결과는 지켜집니다.
            </Text>
          )}
          {editing && (
            <Card>
              <Text style={{ fontSize: 11.5, color: C.sub, lineHeight: 17 }}>
                · 팀 오른쪽 「조 이동」으로 다른 조에 보냅니다(경기한 팀은 못 옮김).{'\n'}
                · 선수 이름 두 개를 차례로 누르면 두 사람을 맞바꿉니다(경기 전 팀만).{'\n'}
                · 코트 번호를 누르면 그 조는 그 코트에서만 돕니다. 아무것도 안 고르면 함께 씁니다.
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
                    <Text style={{ fontSize: 11, color: C.faint }}>코트</Text>
                    {Array.from({ length: courts }, (_, i) => i + 1).map((c) => (
                      <Chip key={c} tone={(g.courts || []).map(Number).includes(c) ? 'green' : 'outline'} onPress={() => toggleCourt(g, c)}>{c}</Chip>
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
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={{ marginTop: 12 }}>
                <Btn small tone="ghost" onPress={reschedule}>시간표 다시 짜기</Btn>
              </View>
            </Card>
          )}
        </>
      )}

      {canEdit && onKnockout && rules.advance > 0 && (
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
