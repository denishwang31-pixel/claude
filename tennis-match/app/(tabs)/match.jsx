/* 대진 — VBA v5 엔진 + 우선순위 드래그 + 휴식점수 + 스코어 입력 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { generateMatchesV5, collectPastPairs } from '../../src/lib/matchmaking';
import { setRules, setRestScore, saveMatches } from '../../src/lib/firestore';
import { Card, SectionTitle, Chip, Btn, Field, Avatar } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Match() {
  const { clubId, me } = useApp();
  const insets = useSafeAreaInsets();
  const { members, meetings, rules, isAdmin, nameOf } = useClub(clubId, me);
  const [showRules, setShowRules] = useState(true);
  const [editing, setEditing] = useState(null);
  const [sc, setSc] = useState({ a: '', b: '' });
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const meeting = meetings.filter((m) => !m.canceled && m.date >= today())[0];

  const attendees = useMemo(() => {
    if (!meeting) return [];
    return [
      ...members.filter((m) => meeting.rsvp?.[m.id] === 'yes'),
      ...(meeting.guests || []).map((g) => ({ id: 'g:' + g.name, name: g.name, gender: g.gender, grade: g.grade })),
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

  const gen = () => {
    if (attendees.length < 4) return flash('참석자가 4명 이상이어야 합니다');
    const past = collectPastPairs(meetings, meeting.id);
    const matches = generateMatchesV5(attendees, meeting.courts, meeting.rounds, rules, past, restScores);
    if (!matches.length) return flash('현재 성비/인원으로는 편성 가능한 구성이 없습니다 (잡복 금지)');
    saveMatches(clubId, meeting.id, matches);
    flash(`${matches.length}경기 생성 (이전 페어 기록 반영)`);
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
        {isAdmin && <View style={{ marginTop: 12 }}><Btn full onPress={gen}>{meeting.matches?.length ? '대진 재생성' : '자동 대진 생성'}</Btn></View>}
      </Card>
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
