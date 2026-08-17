/* 일정 / RSVP — 캘린더·시간 선택, 정기 모임 반복 등록, 참석 체크 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../_layout';
import { useBottomPad } from '../../src/hooks/useBottomPad';
import { useClub } from '../../src/hooks/useClub';
import { useVenueScope } from '../../src/hooks/useVenueScope';
import { useBackHandler } from '../../src/hooks/useBackHandler';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { weatherFor } from '../../src/lib/weather';
import {
  setRsvp, addMeeting, addMeetingsBatch, updateMeeting, updateMeetingsFrom,
  deleteMeeting, subGear,
} from '../../src/lib/firestore';
import { AD_SLOTS } from '../../src/lib/ads';
import { AdBanner } from '../../src/components/AdBanner';
import {
  DEFAULT_SETTINGS, roundsFromSettings, describeSettings,
  REPEAT_TYPES, expandRecurrence, dowName,
} from '../../src/lib/schedule';
import { RSVP, SURFACES, END_SCORES } from '../../src/lib/constants';
import { DateField, TimeField, Label } from '../../src/components/pickers';
import { VenuePicker } from '../../src/components/VenuePicker';
import { Icon } from '../../src/components/Icon';
import { AppButton, Fab, useOptionSheet } from '../../src/components/native';
import {
  Card, SectionTitle, Btn, Field, Avatar, Chip, CheckRow, EmptyState,
} from '../../src/components/ui';
import { C, S, R, F } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Schedule() {
  const { clubId, me, viewMode } = useApp();
  const bottomPad = useBottomPad();
  const router = useRouter();
  const { club, members, meetings, venues, isAdmin, scopeVenues, nameOf, tournaments } =
    useClub(clubId, me, { viewMode });
  const { venueId, setVenueId } = useVenueScope(scopeVenues);
  const settings = { ...DEFAULT_SETTINGS, ...(club?.settings || {}) };
  const [nd, setNd] = useState(null);
  const [open, setOpen] = useState(false);   // 등록 폼 펼침
  const [editing, setEditing] = useState(null);  // 수정 중인 모임
  const [toast, setToast] = useState(null);
  const [ads, setAds] = useState([]);
  const sheet = useOptionSheet();
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  useEffect(() => subGear(setAds), []);

  /* 보고 있는 코트장은 앱 상태(useApp)에서 온다 — 홈에서 고른 값이 그대로다.
     라우터 파라미터로 넘기던 것을 옮긴 이유는 app/_layout.jsx 주석 참고. */

  const blank = () => ({
    date: '', time: settings.startTime, place: '',
    courts: String(settings.courts),
    rounds: String(roundsFromSettings(settings)),
    venueId: null,
    surface: '',
    endScore: 6,
    ranked: true,          // 랭킹 반영 여부
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

  const scopeIds = scopeVenues.map((v) => v.id);
  const upcoming = meetings
    .filter((m) => m.date >= today())
    .filter((m) => (!m.venueId ? true : scopeIds.includes(m.venueId)))
    .filter((m) => (venueId ? m.venueId === venueId : true));
  const RSVP_OPTS = [[RSVP.YES, '참석'], [RSVP.MAYBE, '미정'], [RSVP.NO, '불참']];

  const closeForm = () => { setOpen(false); setEditing(null); };

  /* 대회는 단발성 이벤트라 정기 모임 목록에 섞이면 묻힌다 — 위에 따로 */
  const upcomingTournaments = (tournaments || [])
    .filter((t) => t.status !== 'done' && (!t.date || t.date >= today()))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  /* 안드로이드 뒤로 = 등록 폼이 열려 있으면 폼부터 닫는다.

     예전에는 여기서 코트 선택도 풀었는데(전체 코트로 되돌림), 그러면
     "뒤로가기를 눌렀더니 홈이 아니라 전체 일정이 나온다"가 된다.
     코트 선택은 홈에서 바꾸는 것이므로 뒤로가기가 건드리지 않는다. */
  useBackHandler(() => {
    if (open) { closeForm(); return true; }
    return false;
  });

  /* ---------- 모임 수정 ----------
     "어느 날부터 면수·시간이 달라졌다"는 상황이 흔한데, 지금까진 취소하고
     다시 만드는 수밖에 없었다(지난 기록까지 날아간다). 그래서
       · 이 모임만 수정
       · 이 날짜 이후 같은 코트장 일정 전부 수정
     두 갈래를 준다. */
  const startEdit = (mt) => {
    setEditing(mt);
    setNd({
      date: mt.date,
      time: mt.time || settings.startTime,
      place: mt.place || '',
      courts: String(mt.courts ?? settings.courts),
      rounds: String(mt.rounds ?? roundsFromSettings(settings)),
      venueId: mt.venueId || null,
      surface: mt.surface || '',
      endScore: mt.endScore || 6,
      ranked: mt.ranked !== false,
      repeat: 'none',
      until: '',
    });
    setOpen(true);
  };

  const editPatch = () => ({
    time: nd.time,
    place: nd.place,
    courts: Math.max(1, +nd.courts || 1),
    rounds: Math.max(1, +nd.rounds || 1),
    venueId: nd.venueId || null,
    surface: nd.surface || '',
    endScore: nd.endScore || 6,
    ranked: nd.ranked !== false,
  });

  const saveEditOne = async () => {
    await updateMeeting(clubId, editing.id, { ...editPatch(), date: nd.date });
    setOpen(false); setEditing(null); setNd(blank());
    flash('이 모임만 수정했습니다');
  };

  const saveEditForward = () => {
    const patch = editPatch();          // 날짜는 옮기지 않는다 — 이후 일정의 날짜는 그대로
    const label = editing.venueId
      ? `${venues.find((v) => v.id === editing.venueId)?.name || '이 코트장'} 일정`
      : '코트장 미지정 일정';
    Alert.alert(
      '이후 일정 일괄 수정',
      `${editing.date}부터의 ${label}에 이번 변경(면수·시간·타임 등)을 적용합니다.\n`
      + '지난 일정과 이미 기록된 참석·대진은 그대로 남습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '적용',
          onPress: async () => {
            const n = await updateMeetingsFrom(clubId, editing.date, patch, { venueId: editing.venueId || null });
            setOpen(false); setEditing(null); setNd(blank());
            flash(`${n}건의 일정을 수정했습니다`);
          },
        },
      ],
    );
  };

  /* 모임 카드의 ⋯ 메뉴 */
  const meetingMenu = (mt) => sheet.open({
    title: `${mt.date} ${mt.time || ''}`,
    options: [
      { key: 'edit', label: '이 모임 수정', icon: '✏️' },
      { key: 'cancel', label: mt.canceled ? '취소 해제' : '우천/사정 취소', icon: '🌧' },
      { key: 'delete', label: '모임 삭제', icon: '🗑', destructive: true },
    ],
    destructiveIndex: 2,
    onSelect: (o) => {
      if (o.key === 'edit') return startEdit(mt);
      if (o.key === 'cancel') {
        updateMeeting(clubId, mt.id, { canceled: !mt.canceled });
        return flash(mt.canceled ? '취소를 해제했습니다' : '모임을 취소했습니다');
      }
      return Alert.alert('모임 삭제',
        '이 모임과 기록된 참석·대진이 함께 지워집니다. 되돌릴 수 없습니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => { deleteMeeting(clubId, mt.id); flash('삭제했습니다'); },
          },
        ]);
    },
  });

  /* 등록 — 반복이면 기한까지 한 번에 생성 */
  const submit = () => {
    if (!nd.date) return flash('날짜를 선택하세요');
    const base = {
      time: nd.time, place: nd.place,
      courts: Math.max(1, +nd.courts || 1),
      rounds: Math.max(1, +nd.rounds || 1),
      venueId: nd.venueId || null,
      surface: nd.surface || '',
      endScore: nd.endScore || 6,
      ranked: nd.ranked !== false,
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
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="일정"
        subtitle={`${venueId ? (venues.find((v) => v.id === venueId)?.name || '') : club?.name || '테니스클럽'} · 예정 ${upcoming.length}건`}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
        {/* 코트장 필터 — 여러 곳을 운영하는 클럽 */}
        {scopeVenues.length > 1 && (
          <View style={{ marginBottom: S.md, zIndex: 20 }}>
            <VenuePicker venues={scopeVenues} value={venueId} onChange={setVenueId} />
          </View>
        )}

        <AdBanner ads={ads} slot={AD_SLOTS.SCHEDULE} variant="strip" style={{ marginBottom: S.md }} />

        {/* 대회 — 정기 모임과 성격이 달라 목록 맨 위에 따로 둔다 */}
        {upcomingTournaments.length > 0 && (
          <>
            <SectionTitle>대회</SectionTitle>
            {upcomingTournaments.map((t) => (
              <Card key={t.id} style={{ marginBottom: 10, borderColor: C.green, borderWidth: 1 }}
                onPress={() => router.push({ pathname: '/(tabs)/more', params: { open: 'tournament' } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="tournament" size={19} color={C.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 14 }}>{t.name || '클럽 대회'}</Text>
                    <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                      {t.date || '날짜 미정'}{t.date ? `(${dowName(t.date)})` : ''}
                      {t.courts ? ` · ${t.courts}면` : ''}
                      {t.roster?.length ? ` · 참가 ${t.roster.length}명` : ''}
                    </Text>
                  </View>
                  <Icon name="forward" size={15} color={C.faint} />
                </View>
              </Card>
            ))}
            <SectionTitle>정기 모임</SectionTitle>
          </>
        )}

        {upcoming.map((mt) => {
          const w = weatherFor(mt.date, mt.forecast);
          const counts = { yes: 0, no: 0, maybe: 0 };
          Object.values(mt.rsvp || {}).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
          const mine = mt.rsvp?.[me];
          return (
            <Card key={mt.id} style={{ marginBottom: 12, opacity: mt.canceled ? 0.5 : 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15 }}>
                    {mt.date}({dowName(mt.date)}) {mt.time} {mt.canceled ? '· 우천취소' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                    {mt.place} · 코트 {mt.courts}면 · {mt.rounds}타임
                    {mt.surface ? ` · ${mt.surface}` : ''}
                    {mt.endScore ? ` · ${mt.endScore}게임` : ''}
                    {mt.ranked === false ? ' · 랭킹 미반영' : ''}
                    {mt.recurring ? ' · 정기' : ''}
                  </Text>
                </View>
                {w && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 22 }}>{w.icon}</Text>
                    <Text style={{ fontSize: 11, color: C.sub }}>{w.temp}°/{w.rain}%</Text>
                  </View>
                )}
                {isAdmin && (
                  <Pressable onPress={() => meetingMenu(mt)} hitSlop={10}
                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                    <Text style={{ fontSize: 18, color: C.faint }}>⋯</Text>
                  </Pressable>
                )}
              </View>

              {!mt.canceled && (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    {RSVP_OPTS.map(([v, label]) => (
                      <Pressable key={v} onPress={() => { setRsvp(clubId, mt.id, me, v); flash(`${mt.date} ${label} 처리`); }}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: mine === v ? C.green : '#f5f5f4' }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: mine === v ? '#fff' : C.sub }}>{label} {counts[v] || 0}</Text>
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
                              <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : v === RSVP.NO ? '#b91c1c' : C.sub }}>
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
                      </View>
                    </View>
                  )}
                </>
              )}
            </Card>
          );
        })}
        {upcoming.length === 0 && (
          <EmptyState
            icon="📅"
            title={venueId ? '이 코트장에 예정된 모임이 없습니다' : '예정된 모임이 없습니다'}
            body={isAdmin
              ? '오른쪽 아래 [＋ 새 모임] 버튼으로 등록하세요. 정기 모임이면 기한까지 한 번에 만들 수 있습니다.'
              : '운영진이 일정을 등록하면 여기에 표시됩니다.'}
          />
        )}

      </ScrollView>


      {/* 새 모임 / 모임 수정 — 팝업.

         예전에는 이 폼을 목록 아래에 펼쳤다. [＋ 새 모임]을 눌러도
         화면에는 여전히 목록이 보이고 폼은 한참 아래에 있어서
         "버튼을 눌렀는데 등록할 데가 없다"가 됐다. 팝업으로 바꿔
         누르는 즉시 입력 화면이 뜨게 한다. */}
      <Modal
        visible={!!open && !!nd}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            maxHeight: '92%', paddingTop: 6,
          }}>
            {/* 손잡이 */}
            <View style={{
              width: 38, height: 4, borderRadius: 2, backgroundColor: C.border,
              alignSelf: 'center', marginBottom: 8,
            }} />
            <View style={{
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg,
              paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border,
            }}>
              <Text style={[F.h3, { flex: 1 }]}>{editing ? '모임 수정' : '새 모임 등록'}</Text>
              <Pressable onPress={closeForm} hitSlop={10}>
                <Text style={{ fontSize: 13, color: C.sub, fontWeight: '700' }}>닫기</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              {!!nd && (<>
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

                <Label>날짜</Label>
                <DateField value={nd.date} onChange={(v) => setNd({ ...nd, date: v })} minDate={today()} />

                <View style={{ marginTop: 12 }}>
                  <Label>시작 시간</Label>
                  <TimeField value={nd.time} onChange={(v) => setNd({ ...nd, time: v })} />
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Label hint="선택">코트 표면</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {SURFACES.map((s) => (
                        <Chip key={s} tone={nd.surface === s ? 'green' : 'outline'}
                          onPress={() => setNd({ ...nd, surface: nd.surface === s ? '' : s })}>{s}</Chip>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Label hint="한 경기를 몇 게임까지 하는지">경기 종료 점수</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {END_SCORES.map((sc) => (
                      <Chip key={sc} tone={nd.endScore === sc ? 'green' : 'outline'}
                        onPress={() => setNd({ ...nd, endScore: sc })}>{sc}게임</Chip>
                    ))}
                  </View>
                </View>

                <View style={{ marginTop: 14 }}>
                  <CheckRow
                    checked={nd.ranked !== false}
                    onToggle={() => setNd({ ...nd, ranked: nd.ranked === false })}
                    label="랭킹에 반영"
                    hint="끄면 이 모임의 경기 결과가 클럽 랭킹·전적에 들어가지 않습니다. 친선 경기나 연습 모임에 쓰세요."
                  />
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

                {!editing && (
                <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
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
                )}

                {editing ? (
                  <View style={{ marginTop: S.lg, gap: 8 }}>
                    <AppButton full onPress={saveEditOne}>이 모임만 수정</AppButton>
                    <AppButton full variant="tonal" onPress={saveEditForward}>
                      {editing.date} 이후 일정 전부 수정
                    </AppButton>
                    <Text style={{ fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 16 }}>
                      "이후 일정 전부"는 같은 코트장의 {editing.date} 이후 모임에만 적용됩니다.
                      지난 일정과 이미 기록된 참석·대진은 건드리지 않습니다.
                    </Text>
                    <AppButton full variant="text"
                      onPress={() => { setOpen(false); setEditing(null); setNd(blank()); }}>취소</AppButton>
                  </View>
                ) : (
                  <View style={{ marginTop: S.lg }}>
                    <AppButton full disabled={!nd.date} onPress={submit}>
                      {nd.repeat === 'none' ? '모임 등록' : `정기 모임 등록${preview.length ? ` (${preview.length}회)` : ''}`}
                    </AppButton>
                  </View>
                )}
              </>)}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 새 모임 — 목록 맨 아래가 아니라 항상 손 닿는 자리에 */}
      {isAdmin && (
        <Fab icon="＋" label="새 모임" onPress={() => {
          setEditing(null);
          setNd({ ...blank(), venueId: venueId || null });
          setOpen(true);
        }} />
      )}

      {sheet.node}

      {toast && (
        <View style={{
          position: 'absolute', bottom: 96, alignSelf: 'center', backgroundColor: C.ink,
          paddingHorizontal: 16, paddingVertical: 11, borderRadius: R.md, maxWidth: 340,
        }}>
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
