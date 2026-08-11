/* 일정 / RSVP */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { weatherFor } from '../../src/lib/weather';
import { setRsvp, addMeeting } from '../../src/lib/firestore';
import { DEFAULT_SETTINGS, roundsFromSettings, describeSettings } from '../../src/lib/schedule';
import { Card, SectionTitle, Btn, Field, Avatar, Chip } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Schedule() {
  const { clubId, me } = useApp();
  const insets = useSafeAreaInsets();
  const { club, members, meetings, isAdmin, nameOf } = useClub(clubId, me);
  const settings = { ...DEFAULT_SETTINGS, ...(club?.settings || {}) };
  const [nd, setNd] = useState(null); // 클럽 설정 로드 후 초기화
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const blank = () => ({
    date: '',
    time: settings.startTime,
    place: club?.settings?.defaultPlace || '',
    courts: String(settings.courts),
    rounds: String(roundsFromSettings(settings)),
  });
  // 클럽 설정이 로드되면 새 모임 입력값을 클럽 기본값으로 채운다
  useEffect(() => { if (club && !nd) setNd(blank()); }, [club]);

  const upcoming = meetings.filter((m) => m.date >= today());

  const RSVP_OPTS = [['yes', '참석'], ['maybe', '미정'], ['no', '불참']];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {upcoming.map((mt) => {
          const w = weatherFor(mt.date, mt.forecast);
          const counts = { yes: 0, no: 0, maybe: 0 };
          Object.values(mt.rsvp || {}).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
          const mine = mt.rsvp?.[me];
          return (
            <Card key={mt.id} style={{ marginBottom: 12, opacity: mt.canceled ? 0.5 : 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '900', fontSize: 15 }}>
                    {mt.date} {mt.time} {mt.canceled ? '· 우천취소' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{mt.place} · 코트 {mt.courts}면 · {mt.rounds}R</Text>
                </View>
                {w && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 22 }}>{w.icon}</Text>
                    <Text style={{ fontSize: 11, color: C.sub }}>{w.temp}°/{w.rain}%</Text>
                  </View>
                )}
              </View>

              {!mt.canceled && (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    {RSVP_OPTS.map(([v, label]) => (
                      <Pressable key={v} onPress={() => setRsvp(clubId, mt.id, me, v)}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: mine === v ? C.green : '#f5f5f4' }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: mine === v ? C.lime : C.sub }}>{label} {counts[v] || 0}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {Object.entries(mt.rsvp || {}).filter(([, v]) => v === 'yes').map(([id]) => <Avatar key={id} id={id} nameOf={nameOf} members={members} />)}
                    {(mt.guests || []).map((g) => <Avatar key={g.name} id={'g:' + g.name} nameOf={nameOf} members={members} />)}
                  </View>
                </>
              )}
            </Card>
          );
        })}
        {upcoming.length === 0 && <Card><Text style={{ color: C.sub }}>예정된 모임이 없습니다.</Text></Card>}

        {isAdmin && nd && (
          <>
            <SectionTitle right={<Chip tone="outline" onPress={() => setNd(blank())}>클럽 기본값</Chip>}>
              새 모임 등록
            </SectionTitle>
            <Card>
              <Text style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>
                클럽 설정: {describeSettings(settings)}  (더보기 → 클럽 설정에서 변경)
              </Text>
              <Field placeholder="날짜 (YYYY-MM-DD)" value={nd.date} onChangeText={(t) => setNd({ ...nd, date: t })} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Field placeholder="시간" value={nd.time} onChangeText={(t) => setNd({ ...nd, time: t })} style={{ flex: 1 }} />
                <Field placeholder="코트" keyboardType="number-pad" value={nd.courts} onChangeText={(t) => setNd({ ...nd, courts: t })} style={{ flex: 1 }} />
                <Field placeholder="타임" keyboardType="number-pad" value={nd.rounds} onChangeText={(t) => setNd({ ...nd, rounds: t })} style={{ flex: 1 }} />
              </View>
              <View style={{ marginTop: 8 }}>
                <Field placeholder="장소" value={nd.place} onChangeText={(t) => setNd({ ...nd, place: t })} />
              </View>
              <View style={{ marginTop: 8 }}>
                <Btn full disabled={!nd.date} onPress={() => {
                  addMeeting(clubId, {
                    date: nd.date, time: nd.time, place: nd.place,
                    courts: Math.max(1, +nd.courts || 1), rounds: Math.max(1, +nd.rounds || 1),
                  });
                  setNd(blank());
                  flash('모임 등록 + 전체 알림 발송');
                }}>모임 등록 + 전체 알림</Btn>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
      {toast && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}>
          <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
