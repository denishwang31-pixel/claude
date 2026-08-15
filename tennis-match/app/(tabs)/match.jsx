/* 대진 — 코트장·모임 선택 → 편성 → 그리드로 한눈에 보기
   ⚠️ 이전 버전은 "가장 가까운 모임 1건"만 다뤄서 여러 일정 중 첫 경기만 보였음.
      이제 코트장(드롭다운) + 날짜(가로 스크롤)로 원하는 모임을 골라 편성/조회한다. */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { useBackHandler } from '../../src/hooks/useBackHandler';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import {
  generateMatchesV5, collectPastPairs, diagnoseRoster, describeShortage, ROUND_TYPES,
} from '../../src/lib/matchmaking';
import { DEFAULT_MATCH_CONFIG, roundTimes, dowName } from '../../src/lib/schedule';
import { effectiveNtrp } from '../../src/lib/ntrp';
import { RSVP } from '../../src/lib/constants';
import { setRules, setRestScore, saveMatches, updateMeeting } from '../../src/lib/firestore';
import { VenuePicker } from '../../src/components/VenuePicker';
import { MatchGrid, AttendanceGrid } from '../../src/components/MatchGrid';
import { Card, SectionTitle, Chip, Btn, Field, Avatar } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Match() {
  const { clubId, me, viewMode } = useApp();
  const params = useLocalSearchParams();
  const router = useRouter();
  const {
    club, members, meetings, venues, rules, pairs, matchConfig,
    isAdmin, scopeVenues, nameOf,
  } = useClub(clubId, me, { viewMode });
  const cfg = { ...DEFAULT_MATCH_CONFIG, ...(matchConfig || {}) };

  const [venueId, setVenueId] = useState(null);   // null = 전체
  const [meetingId, setMeetingId] = useState(null);
  const [view, setView] = useState('grid');       // grid | list
  const [showTools, setShowTools] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sc, setSc] = useState({ a: '', b: '' });
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  /* 내가 볼 수 있는 코트장 범위 안의 모임만 */
  const scopeIds = useMemo(() => scopeVenues.map((v) => v.id), [scopeVenues]);
  const candidates = useMemo(() => {
    const list = meetings.filter((m) => !m.canceled && m.date >= today());
    const inScope = list.filter((m) => (!m.venueId ? true : scopeIds.includes(m.venueId)));
    return (venueId ? inScope.filter((m) => m.venueId === venueId) : inScope)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  }, [meetings, scopeIds, venueId]);

  /* 홈에서 특정 모임을 눌러 들어온 경우 그 모임을 연다 */
  useEffect(() => {
    if (params?.meetingId) setMeetingId(String(params.meetingId));
  }, [params?.meetingId]);

  /* 선택된 모임 (없으면 가장 가까운 것) */
  const meeting = useMemo(
    () => candidates.find((m) => m.id === meetingId) || candidates[0] || null,
    [candidates, meetingId],
  );

  const attendees = useMemo(() => {
    if (!meeting) return [];
    return [
      ...members.filter((m) => meeting.rsvp?.[m.id] === RSVP.YES)
        .map((m) => ({ ...m, ntrp: effectiveNtrp(m).value ?? undefined })),
      ...(meeting.guests || []).map((g) => ({
        id: 'g:' + (g.uid || g.name), name: g.name, gender: g.gender, grade: g.grade, ntrp: g.ntrp,
      })),
    ];
  }, [meeting, members]);

  const venueOf = (m) => venues.find((v) => v.id === m?.venueId);
  const times = useMemo(() => {
    if (!meeting) return [];
    const v = venueOf(meeting);
    return roundTimes(
      v || { startTime: meeting.time, roundMinutes: club?.settings?.roundMinutes || 40 },
      meeting.rounds,
    );
  }, [meeting, venues, club]);

  /* ---------------- 편성 ---------------- */
  const roundTypeOf = (r) => (meeting?.roundPlan?.[r]) || cfg.defaultRoundType;
  const setRoundType = (r, key) => {
    const plan = { ...(meeting.roundPlan || {}) };
    if (key === cfg.defaultRoundType) delete plan[r]; else plan[r] = key;
    updateMeeting(clubId, meeting.id, { roundPlan: plan });
  };

  const runGenerate = (allowMixed) => {
    const past = collectPastPairs(meetings, meeting.id);
    const present = new Set(attendees.map((p) => p.id));
    const bothHere = (list) => (list || []).filter(([a, b]) => present.has(a) && present.has(b));
    const report = {};
    const matches = generateMatchesV5(
      attendees, meeting.courts, meeting.rounds, rules, past, meeting.restScores || {},
      {
        couples: bothHere(pairs?.couples),
        fixedPairs: bothHere(pairs?.fixedPairs),
        allowMixed,
        skillBalance: meeting.skillBalance ?? cfg.skillBalance,
        defaultRoundType: cfg.defaultRoundType,
        roundPlan: meeting.roundPlan || {},
        report,
      },
    );
    if (!matches.length) return flash('편성 가능한 구성이 없습니다');
    saveMatches(clubId, meeting.id, matches);

    const mixedN = matches.filter((m) => m.type === '잡복').length;
    const parts = [`${matches.length}경기 생성`];
    if (mixedN) parts.push(`잡복 ${mixedN}경기`);
    if (report.relaxed?.length) parts.push(`${report.relaxed.map((x) => x.round).join('·')}타임 제약 완화`);
    if (report.skippedRounds?.length) parts.push(`${report.skippedRounds.join('·')}타임 편성 불가`);
    flash(parts.join(' · '));
  };

  const gen = () => {
    const d = diagnoseRoster(attendees, meeting.courts, roundTypeOf(1));
    if (!d.canPlayMixed) {
      return Alert.alert('대진표를 만들 수 없습니다',
        `참석 ${d.M + d.F}명 (남 ${d.M} · 여 ${d.F})\n복식 한 경기에는 4명이 필요합니다.\n\n`
        + `▸ 1면이라도 진행하려면 ${describeShortage(d.needForFirstCourt)}이 더 필요합니다.`);
    }
    if (!d.canPlayStrict) {
      return Alert.alert('잡복 없이는 편성할 수 없습니다',
        `참석 ${d.M + d.F}명 (남 ${d.M} · 여 ${d.F})\n\n`
        + `▸ 잡복 없이 하려면: ${describeShortage(d.needForFirstCourt)} 추가\n`
        + `▸ 잡복 허용 시: ${d.mixedCourts}면 진행 가능\n\n잡복을 허용하시겠습니까?`,
        [{ text: '아니오', style: 'cancel' }, { text: '예, 잡복 편성', onPress: () => runGenerate(true) }]);
    }
    if (d.strictCourts < meeting.courts && d.mixedCourts > d.strictCourts) {
      return Alert.alert('일부 코트만 사용됩니다',
        `참석 ${d.M + d.F}명 · 확보 ${meeting.courts}면\n\n`
        + `▸ 잡복 없이: ${d.strictCourts}면\n`
        + `▸ ${meeting.courts}면 모두 쓰려면: ${describeShortage(d.needForFullStrict)} 추가\n`
        + `▸ 잡복 허용 시: ${d.mixedCourts}면\n\n잡복을 허용하시겠습니까?`,
        [{ text: '아니오', onPress: () => runGenerate(false) }, { text: '예, 잡복 허용', onPress: () => runGenerate(true) }]);
    }
    runGenerate(!!(cfg.allowMixed || club?.settings?.allowMixedDefault));
  };

  /* 뒤로가기 우선순위: 스코어 입력 → 편성 설정 → (홈에서 들어왔으면) 홈으로 */
  const fromHome = !!params?.meetingId;
  const goBack = () => {
    if (editing) { setEditing(null); return; }
    if (showTools) { setShowTools(false); return; }
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
  };
  useBackHandler(() => {
    if (editing) { setEditing(null); return true; }
    if (showTools) { setShowTools(false); return true; }
    if (fromHome) { goBack(); return true; }
    return false;
  });

  const saveSc = (mid) => {
    if (sc.a === '' || sc.b === '' || sc.a === sc.b) return flash('스코어 확인 (동점 불가)');
    const next = meeting.matches.map((x) => (x.id === mid ? { ...x, score: { a: +sc.a, b: +sc.b } } : x));
    saveMatches(clubId, meeting.id, next);
    setEditing(null); setSc({ a: '', b: '' });
  };

  /* ---------------- 화면 ---------------- */
  const matches = meeting?.matches || [];
  const nM = attendees.filter((p) => p.gender === 'M').length;

  const Header = (
    <View>
      {/* 코트장 드롭다운 */}
      {venues.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <VenuePicker venues={scopeVenues} value={venueId} onChange={(v) => { setVenueId(v); setMeetingId(null); }} />
        </View>
      )}

      {/* 날짜 선택 — 여러 일정 중 원하는 회차를 고른다 */}
      {candidates.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {candidates.slice(0, 12).map((m) => {
              const on = meeting?.id === m.id;
              const cnt = Object.values(m.rsvp || {}).filter((v) => v === RSVP.YES).length + (m.guests?.length || 0);
              return (
                <Pressable key={m.id} onPress={() => setMeetingId(m.id)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                    backgroundColor: on ? C.green : '#fff',
                    borderWidth: on ? 0 : 1, borderColor: C.border, alignItems: 'center', minWidth: 74,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: on ? C.lime : C.ink }}>
                    {m.date.slice(5)}({dowName(m.date)})
                  </Text>
                  <Text style={{ fontSize: 9, color: on ? '#a7f3d0' : C.faint, marginTop: 1 }}>
                    {m.time} · {cnt}명{m.matches?.length ? ' ✓' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {!meeting ? (
        <Card>
          <Text style={{ color: C.sub, fontSize: 13 }}>
            {venues.length && venueId ? '이 코트장에 예정된 모임이 없습니다.' : '예정된 모임이 없습니다.'}
            {isAdmin ? ' 일정 탭에서 등록하세요.' : ''}
          </Text>
        </Card>
      ) : (
        <>
          {!isAdmin && (
            <Card style={{ marginBottom: 8, backgroundColor: '#fafaf9' }}>
              <Text style={{ fontSize: 12, color: C.sub }}>
                대진표는 <Text style={{ fontWeight: '700' }}>운영진이 편성</Text>합니다. 확정된 대진을 확인만 할 수 있어요.
              </Text>
            </Card>
          )}

          <Card>
            <Text style={{ fontSize: 14, fontWeight: '800' }}>
              {meeting.date}({dowName(meeting.date)}) {meeting.time}
              {venueOf(meeting) ? ` · ${venueOf(meeting).name}` : (meeting.place ? ` · ${meeting.place}` : '')}
            </Text>
            <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
              참석 {attendees.length}명 (남{nM} 여{attendees.length - nM}) · 코트 {meeting.courts}면 · {meeting.rounds}타임
            </Text>

            {/* 편성 가능 여부 진단 */}
            {attendees.length > 0 && (() => {
              const d = diagnoseRoster(attendees, meeting.courts, roundTypeOf(1));
              const full = d.strictCourts >= meeting.courts;
              return (
                <View style={{ marginTop: 8, backgroundColor: '#fafaf9', borderRadius: 10, padding: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: !d.canPlayMixed ? C.danger : full ? C.green2 : '#a16207' }}>
                    {!d.canPlayMixed
                      ? `⚠ 인원 부족 — ${describeShortage(d.needForFirstCourt)} 더 필요`
                      : full ? `✓ ${meeting.courts}면 모두 편성 가능`
                        : `△ 잡복 없이 ${d.strictCourts}면 (${describeShortage(d.needForFullStrict)} 추가 시 ${meeting.courts}면)`}
                  </Text>
                </View>
              );
            })()}

            {isAdmin && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn onPress={gen}>{matches.length ? '대진 재생성' : '자동 대진 생성'}</Btn>
                <Btn tone="ghost" onPress={() => setShowTools(!showTools)}>{showTools ? '설정 닫기' : '편성 설정'}</Btn>
              </View>
            )}
          </Card>

          {/* 편성 설정(타임 유형·실력매칭·휴식점수·우선순위) */}
          {isAdmin && showTools && (
            <>
              <SectionTitle right={
                <Chip tone={(meeting.skillBalance ?? cfg.skillBalance) ? 'green' : 'outline'}
                  onPress={() => updateMeeting(clubId, meeting.id, { skillBalance: !(meeting.skillBalance ?? cfg.skillBalance) })}>
                  {(meeting.skillBalance ?? cfg.skillBalance) ? '✓ 실력매칭' : '실력매칭 OFF'}
                </Chip>
              }>타임별 경기 유형</SectionTitle>
              <Card>
                {Array.from({ length: meeting.rounds || 0 }, (_, i) => i + 1).map((r) => (
                  <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderTopWidth: r > 1 ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                    <Text style={{ width: 44, fontSize: 12, fontWeight: '800', color: C.ink }}>{r}타임</Text>
                    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {ROUND_TYPES.map((t) => (
                        <Chip key={t.key} tone={roundTypeOf(r) === t.key ? 'green' : 'outline'}
                          onPress={() => setRoundType(r, t.key)}>{t.name}</Chip>
                      ))}
                    </View>
                  </View>
                ))}
              </Card>

              <SectionTitle>휴식 우선점수</SectionTitle>
              <Card>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {attendees.map((p) => {
                    const v = (meeting.restScores || {})[p.id] || 0;
                    return (
                      <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fafaf9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600' }}>{p.name}</Text>
                        <Pressable onPress={() => setRestScore(clubId, meeting.id, p.id, Math.max(0, v - 1))}><Text style={{ fontWeight: '900', paddingHorizontal: 4 }}>−</Text></Pressable>
                        <Text style={{ fontSize: 12, fontWeight: '900', width: 12, textAlign: 'center', color: v ? C.green2 : '#d6d3d1' }}>{v}</Text>
                        <Pressable onPress={() => setRestScore(clubId, meeting.id, p.id, Math.min(9, v + 1))}><Text style={{ fontWeight: '900', paddingHorizontal: 4 }}>＋</Text></Pressable>
                      </View>
                    );
                  })}
                  {attendees.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>참석자가 없습니다.</Text>}
                </View>
              </Card>

              <SectionTitle>편성 기준 우선순위 <Text style={{ fontSize: 10, color: C.faint }}>(길게 눌러 드래그)</Text></SectionTitle>
            </>
          )}
        </>
      )}
    </View>
  );

  const Footer = (
    <View>
      {meeting && matches.length > 0 && (
        <>
          <SectionTitle right={
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Chip tone={view === 'grid' ? 'green' : 'outline'} onPress={() => setView('grid')}>표</Chip>
              <Chip tone={view === 'list' ? 'green' : 'outline'} onPress={() => setView('list')}>목록</Chip>
            </View>
          }>대진표</SectionTitle>

          {view === 'grid' ? (
            <Card style={{ padding: 10 }}>
              <MatchGrid
                matches={matches} nameOf={nameOf} roundTimes={times}
                onPressMatch={(m) => {
                  if (!isAdmin) return;
                  setEditing(m.id); setSc({ a: '', b: '' });
                }}
              />
              {isAdmin && <Text style={{ fontSize: 9, color: C.faint, marginTop: 8 }}>경기를 누르면 스코어를 입력할 수 있습니다.</Text>}
            </Card>
          ) : (
            <View>
              {[...new Set(matches.map((m) => m.round))].sort((a, b) => a - b).map((r) => (
                <View key={r}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: C.ink, marginTop: 10, marginBottom: 4 }}>
                    {r}타임 {times.find((t) => t.round === r) ? `(${times.find((t) => t.round === r).start}~${times.find((t) => t.round === r).end})` : ''}
                  </Text>
                  {matches.filter((m) => m.round === r).map((m) => (
                    <Card key={m.id} style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <Chip tone="lime">코트 {m.court}</Chip>
                          <Chip tone={m.type === '혼복' ? 'green' : 'default'}>{m.type}</Chip>
                        </View>
                        {m.score ? (
                          <Text style={{ fontWeight: '900', color: C.green }}>{m.score.a} : {m.score.b}</Text>
                        ) : isAdmin ? (
                          <Btn small tone="ghost" onPress={() => { setEditing(m.id); setSc({ a: '', b: '' }); }}>스코어</Btn>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {m.teamA.map((id) => <Avatar key={id} id={id} nameOf={nameOf} members={members} />)}
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: C.faint }}>VS</Text>
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                          {m.teamB.map((id) => <Avatar key={id} id={id} nameOf={nameOf} members={members} />)}
                        </View>
                      </View>
                    </Card>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* 스코어 입력 */}
          {editing && (
            <Card style={{ marginTop: 8, borderColor: C.lime2, borderWidth: 2 }}>
              {(() => {
                const m = matches.find((x) => x.id === editing);
                if (!m) return null;
                return (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: '800', marginBottom: 8 }}>
                      {m.round}타임 코트{m.court} · {m.teamA.map(nameOf).join('·')} vs {m.teamB.map(nameOf).join('·')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Field placeholder="앞팀" keyboardType="number-pad" value={sc.a} onChangeText={(t) => setSc({ ...sc, a: t })} style={{ flex: 1 }} />
                      <Text style={{ fontWeight: '900', color: C.faint }}>:</Text>
                      <Field placeholder="뒷팀" keyboardType="number-pad" value={sc.b} onChangeText={(t) => setSc({ ...sc, b: t })} style={{ flex: 1 }} />
                      <Btn small onPress={() => saveSc(m.id)}>저장</Btn>
                      <Btn small tone="ghost" onPress={() => setEditing(null)}>닫기</Btn>
                    </View>
                  </>
                );
              })()}
            </Card>
          )}

          <SectionTitle>참석자 경기 현황</SectionTitle>
          <Card style={{ padding: 10 }}>
            <AttendanceGrid attendees={attendees} matches={matches} roundTimes={times} />
          </Card>
        </>
      )}

      {meeting && matches.length === 0 && (
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 12, color: C.sub }}>
            아직 대진이 생성되지 않았습니다.{isAdmin ? ' 위 [자동 대진 생성]을 누르세요.' : ' 운영진이 편성하면 여기에 표시됩니다.'}
          </Text>
        </Card>
      )}
      <View style={{ height: 40 }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="🎾 대진"
        subtitle={meeting
          ? `${meeting.date}(${dowName(meeting.date)}) ${meeting.time || ''} · 참석 ${attendees.length}명`
          : (club?.name || '예정된 모임 없음')}
        onBack={(editing || showTools || fromHome) ? goBack : undefined}
        backLabel={editing ? '대진표' : showTools ? '대진표' : '홈'}
      />
      <DraggableFlatList
        data={isAdmin && showTools && meeting ? rules : []}
        keyExtractor={(item) => item.key}
        onDragEnd={({ data }) => setRules(clubId, data.map((r) => r.key))}
        renderItem={({ item, drag, isActive, getIndex }) => (
          <Pressable onLongPress={drag}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12,
              marginBottom: 4, backgroundColor: isActive ? '#ecfccb' : '#fafaf9',
            }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.lime, fontSize: 11, fontWeight: '900' }}>{getIndex() + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700' }}>{item.name}</Text>
              <Text numberOfLines={1} style={{ fontSize: 10, color: C.faint }}>{item.desc}</Text>
            </View>
            <Text style={{ color: '#d6d3d1', fontSize: 16 }}>⠿</Text>
          </Pressable>
        )}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        contentContainerStyle={{ padding: 16 }}
        activationDistance={12}
      />
      {toast && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, maxWidth: 340 }}>
          <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
