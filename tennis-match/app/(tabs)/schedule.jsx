/* 일정 / RSVP — 캘린더·시간 선택, 정기 모임 반복 등록, 참석 체크 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { weatherFor } from '../../src/lib/weather';
import { setRsvp, addMeeting, addMeetingsBatch, updateMeeting } from '../../src/lib/firestore';
import {
  DEFAULT_SETTINGS, roundsFromSettings, describeSettings,
  REPEAT_TYPES, expandRecurrence, dowName,
} from '../../src/lib/schedule';
import { RSVP } from '../../src/lib/constants';
import { DateField, TimeField, Label } from '../../src/components/pickers';
import { Card, SectionTitle, Btn, Field, Avatar, Chip } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Schedule() {
  const { clubId, me, viewMode } = useApp();
  const insets = useSafeAreaInsets();
  const { club, members, meetings, venues, isAdmin, nameOf } = useClub(clubId, me, { viewMode });
  const settings = { ...DEFAULT_SETTINGS, ...(club?.settings || {}) };
  const [nd, setNd] = useState(null);
  const [open, setOpen] = useState(false);   // 등록 폼 펼침
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const blank = () => ({
    date: '', time: settings.startTime, place: '',
    courts: String(settings.courts),
    rounds: String(roundsFromSettings(settings)),
    venueId: null,
    repeat: 'none',
    until: '',
  });
  useEffect(() => { if (club && !nd) setNd(blank()); }, [club]);

  const pickVenue = (v) => {
    if (!v) return setNd({ ...nd, venueId: null });
    setNd({
      ...nd, venueId: v.id, place: v.name, time: v.startTime,
      courts: String(v.courts), rounds: String(roundsFromSettings(v)),
    });
  };

  const upcoming = meetings.filter((m) => m.date >= today());
  const RSVP_OPTS = [[RSVP.YES, '참석'], [RSVP.MAYBE, '미정'], [RSVP.NO, '불참']];

  /* 등록 — 반복이면 기한까지 한 번에 생성 */
  const submit = () => {
    if (!nd.date) return flash('날짜를 선택하세요');
    const base = {
      time: nd.time, place: nd.place,
      courts: Math.max(1, +nd.courts || 1),
      rounds: Math.max(1, +nd.rounds || 1),
      venueId: nd.venueId || null,
    };
    if (nd.repeat === 'none') {
      addMeeting(clubId, { ...base, date: nd.date });
      setNd(blank()); setOpen(false);
      return flash('모임 등록 완료');
    }
    if (!nd.until) return flash('반복 종료일(기한)을 선택하세요');
    const dates = expandRecurrence(nd.date, nd.until, nd.repeat);
    if (!dates.length) return flash('생성할 날짜가 없습니다. 기한을 확인하세요');
    Alert.alert(
      '정기 모임 등록',
      `${REPEAT_TYPES.find((r) => r.key === nd.repeat)?.name} · ${dowName(nd.date)}요일 ${nd.time}\n`
      + `${dates[0]} ~ ${dates[dates.length - 1]}\n\n총 ${dates.length}개의 모임을 한 번에 등록합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: `${dates.length}개 등록`,
          onPress: async () => {
            await addMeetingsBatch(clubId, dates.map((d) => ({ ...base, date: d, recurring: nd.repeat })));
            setNd(blank()); setOpen(false);
            flash(`정기 모임 ${dates.length}개 등록 완료`);
          },
        },
      ],
    );
  };

  const preview = nd && nd.repeat !== 'none' && nd.date && nd.until
    ? expandRecurrence(nd.date, nd.until, nd.repeat) : [];

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
                    {mt.date}({dowName(mt.date)}) {mt.time} {mt.canceled ? '· 우천취소' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                    {mt.place} · 코트 {mt.courts}면 · {mt.rounds}타임
                    {mt.recurring ? ' · 정기' : ''}
                  </Text>
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
                      <Pressable key={v} onPress={() => { setRsvp(clubId, mt.id, me, v); flash(`${mt.date} ${label} 처리`); }}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: mine === v ? C.green : '#f5f5f4' }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: mine === v ? C.lime : C.sub }}>{label} {counts[v] || 0}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {Object.entries(mt.rsvp || {}).filter(([, v]) => v === RSVP.YES).map(([id]) => (
                      <Avatar key={id} id={id} nameOf={nameOf} members={members} />
                    ))}
                    {(mt.guests || []).map((g) => (
                      <Avatar key={g.uid || g.name} id={'g:' + (g.uid || g.name)} nameOf={nameOf} members={members} />
                    ))}
                  </View>

                  {/* 운영진: 다른 회원 참석을 대신 체크(테스트·현장 대응용) */}
                  {isAdmin && (
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#f5f5f4', paddingTop: 8 }}>
                      <Text style={{ fontSize: 10, color: C.faint, marginBottom: 6 }}>
                        운영진: 이름을 눌러 참석 여부를 대신 처리 (참석 ↔ 불참)
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {members.map((m) => {
                          const v = mt.rsvp?.[m.id];
                          const on = v === RSVP.YES;
                          return (
                            <Pressable key={m.id}
                              onPress={() => setRsvp(clubId, mt.id, m.id, on ? RSVP.NO : RSVP.YES)}
                              style={{
                                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                                backgroundColor: on ? C.green : v === RSVP.NO ? '#fee2e2' : '#f5f5f4',
                              }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: on ? C.lime : v === RSVP.NO ? '#b91c1c' : C.sub }}>
                                {m.name}{on ? ' ✓' : ''}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <Btn small tone="ghost" onPress={() => {
                          const map = {};
                          members.forEach((m) => { map[m.id] = RSVP.YES; });
                          updateMeeting(clubId, mt.id, { rsvp: map });
                          flash('전원 참석 처리');
                        }}>전원 참석</Btn>
                        <Btn small tone="ghost" onPress={() => { updateMeeting(clubId, mt.id, { rsvp: {} }); flash('참석 초기화'); }}>초기화</Btn>
                        <Btn small tone="danger" onPress={() => { updateMeeting(clubId, mt.id, { canceled: true }); flash('모임 취소됨'); }}>모임 취소</Btn>
                      </View>
                    </View>
                  )}
                </>
              )}
            </Card>
          );
        })}
        {upcoming.length === 0 && <Card><Text style={{ color: C.sub }}>예정된 모임이 없습니다.</Text></Card>}

        {isAdmin && nd && (
          <>
            <SectionTitle right={
              <Chip tone={open ? 'green' : 'outline'} onPress={() => setOpen(!open)}>
                {open ? '닫기' : '+ 새 모임'}
              </Chip>
            }>
              새 모임 등록
            </SectionTitle>

            {open && (
              <Card>
                <Text style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>
                  클럽 기본: {describeSettings(settings)}
                </Text>

                {venues.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Label hint="선택하면 면수·시간이 자동 입력됩니다">코트장</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Chip tone={!nd.venueId ? 'green' : 'outline'} onPress={() => pickVenue(null)}>직접 입력</Chip>
                      {venues.map((v) => (
                        <Chip key={v.id} tone={nd.venueId === v.id ? 'green' : 'outline'} onPress={() => pickVenue(v)}>
                          {v.name} ({v.courts}면)
                        </Chip>
                      ))}
                    </View>
                  </View>
                )}

                <Label hint="📅 를 누르면 캘린더">날짜</Label>
                <DateField value={nd.date} onChange={(v) => setNd({ ...nd, date: v })} minDate={today()} />

                <View style={{ marginTop: 12 }}>
                  <Label hint="🕐 를 누르면 시간 목록">시작 시간</Label>
                  <TimeField value={nd.time} onChange={(v) => setNd({ ...nd, time: v })} />
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Label>코트 면수</Label>
                    <Field keyboardType="number-pad" value={nd.courts} onChangeText={(t) => setNd({ ...nd, courts: t })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label>타임(라운드) 수</Label>
                    <Field keyboardType="number-pad" value={nd.rounds} onChangeText={(t) => setNd({ ...nd, rounds: t })} />
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Label>장소</Label>
                  <Field placeholder="예: 올림픽공원 테니스장" value={nd.place} onChangeText={(t) => setNd({ ...nd, place: t })} />
                </View>

                <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#f5f5f4', paddingTop: 12 }}>
                  <Label hint="정기 모임이면 기한까지 한 번에 등록">반복</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {REPEAT_TYPES.map((r) => (
                      <Chip key={r.key} tone={nd.repeat === r.key ? 'green' : 'outline'}
                        onPress={() => setNd({ ...nd, repeat: r.key })}>{r.name}</Chip>
                    ))}
                  </View>

                  {nd.repeat !== 'none' && (
                    <View style={{ marginTop: 10 }}>
                      <Label hint="이 날짜까지 반복 생성">반복 종료일(기한)</Label>
                      <DateField value={nd.until} onChange={(v) => setNd({ ...nd, until: v })} minDate={nd.date || today()} />
                      {preview.length > 0 && (
                        <View style={{ backgroundColor: '#ecfccb', borderRadius: 10, padding: 10, marginTop: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: C.ink }}>
                            {dowName(nd.date)}요일 {nd.time} · 총 {preview.length}회 생성
                          </Text>
                          <Text style={{ fontSize: 11, color: C.green2, marginTop: 4 }}>
                            {preview.slice(0, 4).join(' · ')}{preview.length > 4 ? ` … ${preview[preview.length - 1]}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <View style={{ marginTop: 16 }}>
                  <Btn full disabled={!nd.date} onPress={submit}>
                    {nd.repeat === 'none' ? '모임 등록' : `정기 모임 등록${preview.length ? ` (${preview.length}회)` : ''}`}
                  </Btn>
                </View>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {toast && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, maxWidth: 340 }}>
          <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
