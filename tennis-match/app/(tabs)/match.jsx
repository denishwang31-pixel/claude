/* 대진 — VBA v5 엔진 + 우선순위 드래그 + 휴식점수 + 스코어 입력 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import {
  generateMatchesV5, collectPastPairs, diagnoseRoster, describeShortage, ROUND_TYPES,
} from '../../src/lib/matchmaking';
import { DEFAULT_MATCH_CONFIG } from '../../src/lib/schedule';
import { effectiveNtrp } from '../../src/lib/ntrp';
import { setRules, setRestScore, saveMatches, updateMeeting } from '../../src/lib/firestore';
import { Card, SectionTitle, Chip, Btn, Field, Avatar } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Match() {
  const { clubId, me } = useApp();
  const insets = useSafeAreaInsets();
  const { club, members, meetings, rules, pairs, matchConfig, isAdmin, nameOf } = useClub(clubId, me);
  const cfg = { ...DEFAULT_MATCH_CONFIG, ...(matchConfig || {}) };
  const [showRules, setShowRules] = useState(true);
  const [editing, setEditing] = useState(null);
  const [sc, setSc] = useState({ a: '', b: '' });
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const meeting = meetings.filter((m) => !m.canceled && m.date >= today())[0];

  const attendees = useMemo(() => {
    if (!meeting) return [];
    return [
      // 실력 매칭을 위해 확정 NTRP 를 함께 넘긴다
      ...members.filter((m) => meeting.rsvp?.[m.id] === 'yes')
        .map((m) => ({ ...m, ntrp: effectiveNtrp(m).value ?? undefined })),
      ...(meeting.guests || []).map((g) => ({
        id: 'g:' + (g.uid || g.name), name: g.name, gender: g.gender, grade: g.grade, ntrp: g.ntrp,
      })),
    ];
  }, [meeting, members]);

  if (!meeting) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card><Text style={{ color: C.sub }}>예정된 모임이 없습니다. 일정 탭에서 먼저 등록하세요.</Text></Card>
        </ScrollView>
      </View>
    );
  }

  const restScores = meeting.restScores || {};
  const nM = attendees.filter((p) => p.gender === 'M').length;
  const nF = attendees.length - nM;

  /** 실제 편성 실행 (allowMixed: 잡복 허용 여부) */
  const runGenerate = (allowMixed) => {
    const past = collectPastPairs(meetings, meeting.id);
    // 오늘 참석자 안에 양쪽 모두 있는 커플/고정페어만 제약으로 적용
    const present = new Set(attendees.map((p) => p.id));
    const bothHere = (list) => (list || []).filter(([a, b]) => present.has(a) && present.has(b));
    const options = {
      couples: bothHere(pairs?.couples),
      fixedPairs: bothHere(pairs?.fixedPairs),
      allowMixed,
      skillBalance: meeting.skillBalance ?? cfg.skillBalance,   // 모임별 설정 > 클럽 기본
      defaultRoundType: cfg.defaultRoundType,
      roundPlan: meeting.roundPlan || {},                        // 타임별 유형(체크박스)
    };
    const report = {};
    const matches = generateMatchesV5(
      attendees, meeting.courts, meeting.rounds, rules, past, restScores, { ...options, report },
    );
    if (!matches.length) return flash('편성 가능한 구성이 없습니다');
    saveMatches(clubId, meeting.id, matches);

    // 제약을 지킬 수 없어 완화했거나 편성 못 한 타임이 있으면 그대로 알려준다
    const n = options.couples.length + options.fixedPairs.length;
    const mixedN = matches.filter((m) => m.type === '잡복').length;
    const parts = [`${matches.length}경기 생성`];
    if (mixedN) parts.push(`잡복 ${mixedN}경기 포함`);
    if (n && !report.relaxed.length) parts.push(`커플/페어 ${n}건 반영`);
    if (report.relaxed.length) {
      const team = report.relaxed.filter((x) => x.what === 'fixedPairTeam').map((x) => x.round);
      const allc = report.relaxed.filter((x) => x.what === 'allPairConstraints').map((x) => x.round);
      if (team.length) parts.push(`${team.join('·')}타임은 고정페어 같은팀 적용 불가(성비 문제)`);
      if (allc.length) parts.push(`${allc.join('·')}타임은 커플/페어 제약 해제`);
    }
    if (report.skippedRounds.length) parts.push(`${report.skippedRounds.join('·')}타임 편성 불가`);
    flash(parts.join(' · '));
  };

  const roundTypeOf = (r) => (meeting.roundPlan?.[r]) || cfg.defaultRoundType;
  const setRoundType = (r, key) => {
    const plan = { ...(meeting.roundPlan || {}) };
    if (key === cfg.defaultRoundType) delete plan[r]; else plan[r] = key;
    updateMeeting(clubId, meeting.id, { roundPlan: plan });
  };

  const gen = () => {
    // 1타임 유형 기준으로 진단(단식은 코트당 2명이라 기준이 다름)
    const d = diagnoseRoster(attendees, meeting.courts, roundTypeOf(1));

    // ① 잡복을 허용해도 편성 불가 → 최소 필요 인원 안내
    if (!d.canPlayMixed) {
      Alert.alert(
        '대진표를 만들 수 없습니다',
        `현재 참석 ${d.M + d.F}명 (남 ${d.M} · 여 ${d.F})\n`
        + '복식 한 경기에는 4명이 필요합니다.\n\n'
        + `▸ 최소 1면이라도 진행하려면\n   ${describeShortage(d.needForFirstCourt)}이 더 필요합니다.`,
        [{ text: '확인' }],
      );
      return;
    }

    // ② 잡복 없이 아예 편성 불가 → 필요 인원 안내 + 잡복 허용 여부 확인
    if (!d.canPlayStrict) {
      Alert.alert(
        '잡복 없이는 편성할 수 없습니다',
        `현재 참석 ${d.M + d.F}명 (남 ${d.M} · 여 ${d.F})\n`
        + '남복(남4)·여복(여4)·혼복(남2여2) 조합이 만들어지지 않습니다.\n\n'
        + `▸ 잡복 없이 하려면: ${describeShortage(d.needForFirstCourt)} 추가 필요\n`
        + `▸ 잡복을 허용하면: 지금 인원으로 ${d.mixedCourts}면 진행 가능\n\n`
        + '잡복(남3여1 등)을 허용하시겠습니까?',
        [
          { text: '아니오', style: 'cancel' },
          { text: '예, 잡복으로 편성', onPress: () => runGenerate(true) },
        ],
      );
      return;
    }

    // ③ 일부 코트만 잡복 없이 채울 수 있음 → 코트를 더 쓰려면 잡복 필요
    if (d.strictCourts < meeting.courts && d.mixedCourts > d.strictCourts) {
      Alert.alert(
        '일부 코트만 사용됩니다',
        `현재 참석 ${d.M + d.F}명 (남 ${d.M} · 여 ${d.F}) · 확보 코트 ${meeting.courts}면\n\n`
        + `▸ 잡복 없이: ${d.strictCourts}면만 사용 (나머지는 대기)\n`
        + `▸ ${meeting.courts}면 모두 쓰려면: ${describeShortage(d.needForFullStrict)} 추가 필요\n`
        + `▸ 잡복을 허용하면: ${d.mixedCourts}면까지 사용 가능\n\n`
        + '잡복(남3여1 등)을 허용하시겠습니까?',
        [
          { text: '아니오 (잡복 없이)', onPress: () => runGenerate(false) },
          { text: '예, 잡복 허용', onPress: () => runGenerate(true) },
        ],
      );
      return;
    }

    // ④ 정상: 잡복 없이 전부 편성 가능
    runGenerate(!!(cfg.allowMixed || club?.settings?.allowMixedDefault));
  };

  const changeRest = (id, delta) => {
    const v = Math.max(0, Math.min(9, (restScores[id] || 0) + delta));
    setRestScore(clubId, meeting.id, id, v);
  };

  const saveSc = (mid) => {
    if (sc.a === '' || sc.b === '' || sc.a === sc.b) return flash('스코어 확인 (동점 불가)');
    const matches = meeting.matches.map((x) => (x.id === mid ? { ...x, score: { a: +sc.a, b: +sc.b } } : x));
    saveMatches(clubId, meeting.id, matches);
    setEditing(null); setSc({ a: '', b: '' });
  };

  const rounds = [...new Set((meeting.matches || []).map((m) => m.round))];
  const gameCount = {};
  (meeting.matches || []).forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { gameCount[id] = (gameCount[id] || 0) + 1; }));

  const renderRule = ({ item, drag, isActive, getIndex }) => {
    const i = getIndex();
    return (
      <Pressable
        onLongPress={isAdmin ? drag : undefined}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12,
          marginBottom: 4, backgroundColor: isActive ? '#ecfccb' : '#fafaf9',
        }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.lime, fontSize: 11, fontWeight: '900' }}>{i + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700' }}>{item.name}</Text>
          <Text numberOfLines={1} style={{ fontSize: 10, color: C.faint }}>{item.desc}</Text>
        </View>
        {isAdmin && <Text style={{ color: '#d6d3d1', fontSize: 16 }}>⠿</Text>}
      </Pressable>
    );
  };

  const Header = (
    <View>
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700' }}>
          {meeting.date} · 참석 {attendees.length}명 (남{nM} 여{nF}) · 코트 {meeting.courts}면 · {meeting.rounds}R
        </Text>
        <Text style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
          고정 원칙: 남복·여복·혼복만(잡복 금지) · 동일 타임 중복 금지 · 이전 모임 페어 누적 반영
        </Text>

        {/* 편성 가능 여부 사전 진단 — 생성 버튼을 누르기 전에 상황을 보여준다 */}
        {(() => {
          const d = diagnoseRoster(attendees, meeting.courts, roundTypeOf(1));
          if (attendees.length === 0) return null;
          const full = d.strictCourts >= meeting.courts;
          const tone = !d.canPlayMixed ? C.danger : full ? C.green2 : '#a16207';
          return (
            <View style={{ marginTop: 8, backgroundColor: '#fafaf9', borderRadius: 10, padding: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: tone }}>
                {!d.canPlayMixed
                  ? `⚠ 인원 부족 — 1면 진행에 ${describeShortage(d.needForFirstCourt)} 더 필요`
                  : full
                    ? `✓ ${meeting.courts}면 모두 잡복 없이 편성 가능`
                    : `△ 잡복 없이 ${d.strictCourts}면만 가능 (${meeting.courts}면 사용하려면 ${describeShortage(d.needForFullStrict)} 추가)`}
              </Text>
              {d.canPlayMixed && !full && (
                <Text style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>
                  잡복을 허용하면 {d.mixedCourts}면까지 사용 가능합니다 (생성 시 확인창)
                </Text>
              )}
            </View>
          );
        })()}
        {(() => {
          const present = new Set(attendees.map((p) => p.id));
          const c = (pairs?.couples || []).filter(([a, b]) => present.has(a) && present.has(b)).length;
          const f = (pairs?.fixedPairs || []).filter(([a, b]) => present.has(a) && present.has(b)).length;
          if (!c && !f) return null;
          return (
            <Text style={{ fontSize: 10, color: C.green2, marginTop: 2 }}>
              적용 제약: {c ? `커플 ${c}쌍(출전 타임 동기화)` : ''}{c && f ? ' · ' : ''}{f ? `고정 페어 ${f}조(같은 팀)` : ''}
            </Text>
          );
        })()}
        {isAdmin && <View style={{ marginTop: 12 }}><Btn full onPress={gen}>{meeting.matches?.length ? '대진 재생성' : '자동 대진 생성'}</Btn></View>}
      </Card>

      {/* 타임별 경기 유형 — 기본값은 클럽 설정(현재: 해당 유형), 타임마다 개별 변경 가능 */}
      {isAdmin && (
        <>
          <SectionTitle right={
            <Chip tone={(meeting.skillBalance ?? cfg.skillBalance) ? 'green' : 'outline'}
              onPress={() => updateMeeting(clubId, meeting.id, { skillBalance: !(meeting.skillBalance ?? cfg.skillBalance) })}>
              {(meeting.skillBalance ?? cfg.skillBalance) ? '✓ 실력매칭' : '실력매칭 OFF'}
            </Chip>
          }>
            타임별 경기 유형
          </SectionTitle>
          <Card>
            <Text style={{ fontSize: 10, color: C.faint, marginBottom: 8 }}>
              기본값: {ROUND_TYPES.find((t) => t.key === cfg.defaultRoundType)?.name || '자동'}
              {'  '}(더보기 → 대진 설정에서 변경) · 아래에서 타임마다 다르게 지정할 수 있습니다
            </Text>
            {Array.from({ length: meeting.rounds || 0 }, (_, i) => i + 1).map((r) => (
              <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderTopWidth: r > 1 ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                <Text style={{ width: 48, fontSize: 12, fontWeight: '800', color: C.ink }}>{r}타임</Text>
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {ROUND_TYPES.map((t) => (
                    <Chip key={t.key} tone={roundTypeOf(r) === t.key ? 'green' : 'outline'}
                      onPress={() => setRoundType(r, t.key)}>{t.name}</Chip>
                  ))}
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
      <SectionTitle right={<Chip tone="outline" onPress={() => setShowRules(!showRules)}>{showRules ? '접기' : '펼치기'}</Chip>}>
        편성 기준 우선순위
      </SectionTitle>
    </View>
  );

  const Footer = (
    <View>
      {showRules && (
        <Text style={{ fontSize: 10, color: C.faint, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8 }}>
          위에 있을수록 가중치가 큽니다. 항목을 길게 눌러 드래그로 순서를 바꾼 뒤 "대진 재생성"을 누르세요. 순서는 저장됩니다.
        </Text>
      )}

      {isAdmin && (
        <>
          <SectionTitle>휴식 우선점수 (지난주 많이 쉰 사람 우대)</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {attendees.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fafaf9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600' }}>{p.name}</Text>
                  <Pressable onPress={() => changeRest(p.id, -1)} style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '900' }}>−</Text></Pressable>
                  <Text style={{ fontSize: 12, fontWeight: '900', width: 14, textAlign: 'center', color: restScores[p.id] ? C.green2 : '#d6d3d1' }}>{restScores[p.id] || 0}</Text>
                  <Pressable onPress={() => changeRest(p.id, 1)} style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '900' }}>＋</Text></Pressable>
                </View>
              ))}
              {attendees.length === 0 && <Text style={{ fontSize: 12, color: C.faint }}>참석 확정자가 없습니다.</Text>}
            </View>
          </Card>
        </>
      )}

      {rounds.map((r) => (
        <View key={r}>
          <SectionTitle>ROUND {r}</SectionTitle>
          {meeting.matches.filter((m) => m.round === r).map((m) => {
            const aWin = m.score && m.score.a > m.score.b;
            const bWin = m.score && m.score.b > m.score.a;
            return (
              <Card key={m.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Chip tone="lime">코트 {m.court}</Chip>
                    {m.type && <Chip tone={m.type === '혼복' ? 'green' : 'default'}>{m.type}</Chip>}
                  </View>
                  {m.score ? (
                    <Text style={{ fontWeight: '900', color: C.green }}>{m.score.a} : {m.score.b}</Text>
                  ) : isAdmin ? (
                    <Btn small tone="ghost" onPress={() => { setEditing(m.id); setSc({ a: '', b: '' }); }}>스코어 입력</Btn>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, opacity: m.score && !aWin ? 0.5 : 1 }}>
                    {m.teamA.map((id) => <Avatar key={id} id={id} nameOf={nameOf} members={members} />)}
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: C.faint }}>VS</Text>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', opacity: m.score && !bWin ? 0.5 : 1 }}>
                    {m.teamB.map((id) => <Avatar key={id} id={id} nameOf={nameOf} members={members} />)}
                  </View>
                </View>
                {editing === m.id && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Field placeholder="A팀" keyboardType="number-pad" value={sc.a} onChangeText={(t) => setSc({ ...sc, a: t })} style={{ flex: 1 }} />
                    <Text style={{ fontWeight: '900', color: C.faint }}>:</Text>
                    <Field placeholder="B팀" keyboardType="number-pad" value={sc.b} onChangeText={(t) => setSc({ ...sc, b: t })} style={{ flex: 1 }} />
                    <Btn small onPress={() => saveSc(m.id)}>저장</Btn>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ))}

      {meeting.matches?.length > 0 && (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.sub, marginBottom: 6 }}>인당 배정 경기 수</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {attendees.map((p) => <Chip key={p.id} tone="outline">{p.name} {gameCount[p.id] || 0}</Chip>)}
          </View>
          <Text style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>이 화면을 캡처해 카톡방에 공유하세요 (실서비스: 이미지 자동 생성)</Text>
        </Card>
      )}
      <View style={{ height: 40 }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <DraggableFlatList
        data={showRules ? rules : []}
        keyExtractor={(item) => item.key}
        onDragEnd={({ data }) => { if (isAdmin) setRules(clubId, data.map((r) => r.key)); }}
        renderItem={renderRule}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        contentContainerStyle={{ padding: 16 }}
        activationDistance={12}
      />
      {toast && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, maxWidth: 320 }}>
          <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
