/* 일정 / RSVP — 캘린더·시간 선택, 정기 모임 반복 등록, 참석 체크 */
import React, { useState, useEffect, useMemo } from 'react';
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
  deleteMeeting, deleteMeetingsBulk, subGear, requestRsvp,
  applyToTournament, cancelTournamentApply,
} from '../../src/lib/firestore';
import {
  KIND, KINDS, buildAgenda, filterAgenda, countByKind, canApply,
  shiftMonth as shiftAgendaMonth,
} from '../../src/lib/agenda';
import {
  AgendaControls, CalendarView, TournamentCard, GuestCard, DayList,
} from '../../src/components/AgendaViews';
import {
  normalizeAsk, pendingVoters, askDateFor,
} from '../../src/lib/rsvpAsk';
import {
  visibleMeetings, groupByMonth, membersForMeeting, canRsvpSelf,
  rsvpBlockReason, rsvpSummary, MONTH_STEP,
} from '../../src/lib/scheduleView';
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
  const {
    club, members, meetings, venues, isAdmin, scopeVenues, nameOf,
    tournaments, guestPosts, meVal,
  } = useClub(clubId, me, { viewMode });
  const { venueId, setVenueId } = useVenueScope(scopeVenues);
  const settings = { ...DEFAULT_SETTINGS, ...(club?.settings || {}) };
  const [nd, setNd] = useState(null);
  const [open, setOpen] = useState(false);   // 등록 폼 펼침
  const [editing, setEditing] = useState(null);  // 수정 중인 모임
  const [expanded, setExpanded] = useState(null);   // 명단을 펼친 모임
  const [toast, setToast] = useState(null);
  const [ads, setAds] = useState([]);
  /* 목록 ↔ 달력. 기본은 목록 — 지금까지 쓰던 화면이 그대로 열려야 한다.
     달력은 "이번 달에 뭐가 몇 개 있나"를 볼 때 넘어가는 곳이다. */
  const [view, setView] = useState('list');
  const [kinds, setKinds] = useState(KINDS.map((k) => k.key));
  const [calMonth, setCalMonth] = useState(() => today().slice(0, 7));
  const [pickedDate, setPickedDate] = useState(null);
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

  const scopeIds = useMemo(() => scopeVenues.map((v) => v.id), [scopeVenues]);

  /* 이번 달만 먼저 보여주고 [더보기]로 3개월씩 늘린다.
     예전에는 예정된 모임을 전부 그렸다. 일정이 100건 쌓이면 화면이
     열리는 데서 걸린다 — 스크롤이 아니라 첫 렌더가 문제였다. */
  const [months, setMonths] = useState(1);
  const { items: upcoming, hidden, hasMore } = useMemo(
    () => visibleMeetings(meetings, {
      today: today(), months, venueId, scopeIds,
    }),
    [meetings, months, venueId, scopeIds],
  );
  const byMonth = useMemo(() => groupByMonth(upcoming), [upcoming]);

  /* 코트장을 바꾸면 다시 이번 달부터 — 다른 코트를 골랐는데 6개월치가
     펼쳐진 채로 있으면 그것대로 무겁다 */
  useEffect(() => { setMonths(1); }, [venueId]);

  const RSVP_OPTS = [[RSVP.YES, '참석'], [RSVP.MAYBE, '미정'], [RSVP.NO, '불참']];

  const venueNameOf = (mt) => venues.find((v) => v.id === mt?.venueId)?.name || '';

  /* ---------- 참석 투표 요청 ----------
     아직 답하지 않은 사람에게만, 그리고 그 코트장 사람에게만 보낸다.
     회원이 200명이면 화요일 염곡에 나오는 사람에게 목요일 수도공고
     투표를 보내는 것은 스팸이다. */
  const askCfg = normalizeAsk(club?.settings?.rsvpAsk);
  const askRsvp = (mt) => {
    const target = membersForMeeting(members, mt);
    const pending = pendingVoters(target, mt);
    const where = venueNameOf(mt);
    if (!pending.length) return flash('대상자가 모두 답했습니다');
    Alert.alert(
      '참석 투표 요청',
      `${where ? `${where} · ` : ''}대상 ${target.length}명 중 `
      + `아직 답하지 않은 ${pending.length}명에게만 보냅니다.\n\n`
      + `${pending.slice(0, 8).map((m) => m.name).join(', ')}`
      + `${pending.length > 8 ? ` 외 ${pending.length - 8}명` : ''}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: `${pending.length}명에게 보내기`,
          onPress: async () => {
            await requestRsvp(clubId, mt.id, me, pending.map((m) => m.id));
            flash(`${pending.length}명에게 투표 요청을 보냈습니다`);
          },
        },
      ],
    );
  };

  /* 일정 일괄 정리 — 잘못 만든 정기 일정 수십 건을 하나씩 지울 수는 없다.
     회원·회비·대회는 건드리지 않는다. */
  const bulkMenu = () => sheet.open({
    title: '일정 정리',
    options: [
      { key: 'past', label: '지난 일정 삭제', icon: '🧹' },
      { key: 'future', label: '예정 일정 삭제', icon: '📅' },
      { key: 'all', label: '일정 전체 삭제', icon: '🗑', destructive: true },
    ],
    destructiveIndex: 2,
    onSelect: (o) => {
      const label = { past: '지난 일정', future: '예정 일정', all: '모든 일정' }[o.key];
      const where = venueId ? (venues.find((v) => v.id === venueId)?.name || '') : '';
      Alert.alert(
        `${label} 삭제`,
        `${where ? `${where}의 ` : ''}${label}을 지웁니다.\n`
        + '참석 기록과 대진표도 함께 사라지며 되돌릴 수 없습니다.\n\n'
        + '회원·회비·대회 기록은 그대로 남습니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: async () => {
              try {
                const n = await deleteMeetingsBulk(clubId, { scope: o.key, venueId });
                flash(`${n}건을 삭제했습니다`);
              } catch (e) {
                flash('삭제에 실패했습니다');
              }
            },
          },
        ],
      );
    },
  });

  const closeForm = () => { setOpen(false); setEditing(null); };

  /* ---------- 우리 모임 · 대회 · 게스트 모집을 한 줄로 ----------

     예전에는 대회가 [더보기] 안에 있었고, 게스트 모집은 또 다른 메뉴에
     있었다. 그런데 회원이 궁금한 것은 "이번 주 토요일에 뭐가 있지?"
     하나다. 흩어져 있으면 대회가 열린 줄도 모르고 지나간다 — 대회는
     신청 기간이 짧아서 한 번 놓치면 끝이다.

     대회를 별도 메뉴로 두지 않은 이유는 src/lib/agenda.js 머리말 참고. */
  const agendaAll = useMemo(() => buildAgenda(
    { meetings, tournaments, guestPosts },
    {
      today: today(), me, clubId, isAdmin,
      venueName: (id) => venues.find((v) => v.id === id)?.name || '',
    },
  ), [meetings, tournaments, guestPosts, me, clubId, isAdmin, venues]);

  const agenda = useMemo(
    () => filterAgenda(agendaAll, { kinds, venueId, scopeIds }),
    [agendaAll, kinds, venueId, scopeIds],
  );
  const counts = useMemo(
    () => countByKind(filterAgenda(agendaAll, { venueId, scopeIds })),
    [agendaAll, venueId, scopeIds],
  );

  /* 목록 보기에서는 지난 것을 빼고 가까운 순서로. 달력 보기는 그 달
     전체를 보여 준다 — 지난 주에 무엇이 있었는지도 달력에서는 정보다. */
  const upcomingAgenda = useMemo(
    () => agenda.filter((it) => it.kind !== KIND.MEETING && (!it.date || it.date >= today())),
    [agenda],
  );
  const dayItems = useMemo(
    () => (pickedDate ? agenda.filter((it) => it.date === pickedDate) : []),
    [agenda, pickedDate],
  );

  /* ---------- 대회 참가 신청 ----------
     현황이 보여야 신청을 한다. 그래서 카드에서 바로 누른다 — 대회
     화면까지 들어가야 신청할 수 있으면 그 화면을 여는 사람만 신청한다. */
  const applyTo = (item) => {
    const gate = canApply(item.raw, me, today());
    if (!gate.ok) return flash(gate.reason);
    if (!meVal) return flash('프로필을 먼저 등록하세요');
    const fee = Number(item.raw?.signup?.fee) || 0;
    return Alert.alert(
      '대회 참가 신청',
      `${item.title}\n${item.date ? `${item.date} ` : ''}${item.sub}`
      + (fee ? `\n\n참가비 ${fee.toLocaleString()}원 — 운영진이 안내합니다.` : ''),
      [
        { text: '취소', style: 'cancel' },
        {
          text: '신청',
          onPress: async () => {
            try {
              await applyToTournament(clubId, item.id, me, meVal);
              flash('참가 신청을 보냈습니다');
            } catch (e) { flash('신청하지 못했습니다'); }
          },
        },
      ],
    );
  };

  const cancelApply = (item) => Alert.alert(
    '신청 취소', `${item.title} 참가 신청을 취소할까요?`,
    [
      { text: '아니요', style: 'cancel' },
      {
        text: '취소하기',
        style: 'destructive',
        onPress: async () => {
          await cancelTournamentApply(clubId, item.id, me);
          flash('신청을 취소했습니다');
        },
      },
    ],
  );

  const openTournament = () => router.push({
    pathname: '/(tabs)/more', params: { open: 'tournament', from: 'schedule' },
  });
  const openGuest = () => router.push({
    pathname: '/(tabs)/more', params: { open: 'guest', from: 'schedule' },
  });


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

  /* 모임 카드 하나.

     함수로 빼 둔 이유: 목록 보기와 달력 보기가 같은 카드를 그린다.
     달력에서 날짜를 누르면 그날 모임이 아래에 뜨는데, 거기에 다른
     모양의 카드가 나오면 같은 모임인지 알아보기 어렵다. 그리고
     참석 투표 같은 것을 두 벌 관리하게 된다. */
  const meetingCard = (mt) => {
            const w = weatherFor(mt.date, mt.forecast);
            const sum = rsvpSummary(members, mt);
            const mine = mt.rsvp?.[me];
            const canMine = canRsvpSelf(meVal, mt);
            const blocked = rsvpBlockReason(meVal, mt, venueNameOf(mt));
            const isOpen = expanded === mt.id;
            return (
              <Card key={mt.id} style={{ marginBottom: 10, opacity: mt.canceled ? 0.5 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 15 }}>
                      {Number(mt.date.slice(5, 7))}/{Number(mt.date.slice(8, 10))}({dowName(mt.date)}) {mt.time}
                      {mt.canceled ? ' · 우천취소' : ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                      {venueNameOf(mt) || mt.place || '장소 미정'} · 코트 {mt.courts}면 · {mt.rounds}타임
                      {mt.recurring ? ' · 정기' : ''}
                    </Text>
                  </View>
                  {w && (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 20 }}>{w.icon}</Text>
                      <Text style={{ fontSize: 10, color: C.sub }}>{w.temp}°/{w.rain}%</Text>
                    </View>
                  )}
                  {isAdmin && (
                    <Pressable onPress={() => meetingMenu(mt)} hitSlop={10}
                      style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18, color: C.faint }}>⋯</Text>
                    </Pressable>
                  )}
                </View>

                {!mt.canceled && (
                  <>
                    {/* 내 참석 — 내가 속한 코트장의 모임에서만 누른다.
                       운영진은 모든 코트를 보지만, 안 나가는 코트에 자기
                       참석을 넣으면 그 코트 대진에 잡히고 당일에 빈다. */}
                    {canMine ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        {RSVP_OPTS.map(([v, label]) => (
                          <Pressable key={v}
                            onPress={() => { setRsvp(clubId, mt.id, me, v, me); flash(`${label} 처리`); }}
                            style={{
                              flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
                              backgroundColor: mine === v ? C.green : '#f5f5f4',
                            }}>
                            <Text style={{ fontWeight: '700', fontSize: 13, color: mine === v ? '#fff' : C.sub }}>
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : !!blocked && (
                      <Text style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>{blocked}</Text>
                    )}

                    {/* 현황 한 줄 — 명단을 안 그려도 상태를 안다 */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      <Chip tone="green">참석 {sum.going}</Chip>
                      <Chip tone="default">불참 {sum.no}</Chip>
                      {sum.none > 0 && <Chip tone="warn">미응답 {sum.none}</Chip>}
                      <View style={{ flex: 1 }} />
                      <Pressable onPress={() => setExpanded(isOpen ? null : mt.id)} hitSlop={8}>
                        <Text style={{ fontSize: 11.5, color: C.green, fontWeight: '700' }}>
                          {isOpen ? '접기' : '명단'}
                        </Text>
                      </Pressable>
                    </View>

                    {/* 펼쳤을 때만 사람을 그린다.
                       예전에는 모임마다 회원 전원 칩을 그렸다. 모임 100건 ×
                       회원 200명이면 칩 2만 개고, 화면이 열리는 데서 걸린다. */}
                    {isOpen && (
                      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#f5f5f4', paddingTop: 10 }}>
                        <Text style={{ fontSize: 10.5, color: C.faint, marginBottom: 6 }}>
                          대상 {sum.target}명
                          {venueNameOf(mt) ? ` · ${venueNameOf(mt)} 소속` : ' · 전체'}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {Object.entries(mt.rsvp || {}).filter(([, v]) => v === RSVP.YES).map(([id]) => (
                            <Avatar key={id} id={id} nameOf={nameOf} members={members} />
                          ))}
                          {(mt.guests || []).map((g) => (
                            <Avatar key={g.uid || g.name} id={'g:' + (g.uid || g.name)} nameOf={nameOf} members={members} />
                          ))}
                          {sum.going === 0 && (
                            <Text style={{ fontSize: 11.5, color: C.faint }}>아직 참석자가 없습니다.</Text>
                          )}
                        </View>

                        {isAdmin && (
                          <View style={{ marginTop: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 10.5, color: C.faint }}>
                                  {askCfg.enabled && askDateFor(mt, askCfg)
                                    ? `자동 요청 ${askDateFor(mt, askCfg)} ${askCfg.time}`
                                    : '자동 요청 꺼짐'}
                                  {mt.rsvpAsk?.count ? ` · ${mt.rsvpAsk.count}회 발송` : ''}
                                </Text>
                              </View>
                              <Btn small tone={sum.none ? 'primary' : 'ghost'} onPress={() => askRsvp(mt)}>
                                투표 요청
                              </Btn>
                            </View>

                            <Text style={{ fontSize: 10, color: C.faint, marginTop: 10, marginBottom: 6 }}>
                              이름을 눌러 대신 처리 (참석 ↔ 불참)
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                              {membersForMeeting(members, mt).map((m) => {
                                const v = mt.rsvp?.[m.id];
                                const on = v === RSVP.YES;
                                return (
                                  <Pressable key={m.id}
                                    onPress={() => setRsvp(clubId, mt.id, m.id, on ? RSVP.NO : RSVP.YES, me)}
                                    style={{
                                      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                                      backgroundColor: on ? C.green : v === RSVP.NO ? '#fee2e2' : '#f5f5f4',
                                    }}>
                                    <Text style={{
                                      fontSize: 11, fontWeight: '700',
                                      color: on ? '#fff' : v === RSVP.NO ? '#b91c1c' : C.sub,
                                    }}>
                                      {m.name}{on ? ' ✓' : ''}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                              {/* 일괄 처리는 이 모임 대상자에게만. rsvpBy 도 같이 덮는다 —
                                 안 그러면 운영진이 누른 변경이 "회원이 마음을 바꿨다"로
                                 읽혀 운영진에게 알림이 되돌아온다. */}
                              <Btn small tone="ghost" onPress={() => {
                                const map = { ...(mt.rsvp || {}) };
                                const by = { ...(mt.rsvpBy || {}) };
                                membersForMeeting(members, mt).forEach((m) => {
                                  map[m.id] = RSVP.YES; by[m.id] = me;
                                });
                                updateMeeting(clubId, mt.id, { rsvp: map, rsvpBy: by });
                                flash('대상자 전원 참석 처리');
                              }}>전원 참석</Btn>
                              <Btn small tone="ghost" onPress={() => {
                                updateMeeting(clubId, mt.id, { rsvp: {}, rsvpBy: {} });
                                flash('참석 초기화');
                              }}>초기화</Btn>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </>
                )}
              </Card>
            );
  };

  /* 종류가 섞인 목록을 그린다. 모임은 원래 카드를 그대로 쓴다 —
     달력에서 눌렀을 때 다른 모양이 나오면 같은 모임인지 알기 어렵다. */
  const agendaItem = (it) => {
    if (it.kind === KIND.MEETING) return meetingCard(it.raw);
    if (it.kind === KIND.TOURNAMENT) {
      return (
        <TournamentCard key={it.key} item={it} today={today()} onOpen={openTournament}
          apply={() => applyTo(it)} cancel={() => cancelApply(it)} />
      );
    }
    return <GuestCard key={it.key} item={it} today={today()} onOpen={openGuest} />;
  };

  const preview = nd && nd.repeat !== 'none' && nd.date && nd.until
    ? expandRecurrence(nd.date, nd.until, nd.repeat) : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="일정"
        subtitle={`${venueId ? (venues.find((v) => v.id === venueId)?.name || '') : club?.name || '테니스클럽'} · 예정 ${upcoming.length + hidden}건`}
        right={isAdmin ? (
          <Pressable onPress={bulkMenu} hitSlop={10}>
            <Text style={{ fontSize: 12.5, color: C.sub, fontWeight: '700' }}>정리</Text>
          </Pressable>
        ) : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
        {/* 코트장 필터 — 여러 곳을 운영하는 클럽 */}
        {scopeVenues.length > 1 && (
          <View style={{ marginBottom: S.md, zIndex: 20 }}>
            <VenuePicker venues={scopeVenues} value={venueId} onChange={setVenueId} />
          </View>
        )}

        <AdBanner ads={ads} slot={AD_SLOTS.SCHEDULE} variant="strip" style={{ marginBottom: S.md }} />

        {/* 보기 전환(목록/달력)과 종류 거르기 */}
        <AgendaControls
          view={view} setView={(v) => { setView(v); setPickedDate(null); }}
          kinds={kinds} setKinds={setKinds} counts={counts}
          monthKey={calMonth}
          onShiftMonth={(d) => { setCalMonth(shiftAgendaMonth(calMonth, d)); setPickedDate(null); }}
        />

        {view === 'calendar' ? (
          <>
            <CalendarView
              monthKey={calMonth} items={agenda} today={today()}
              selected={pickedDate} onSelect={setPickedDate}
            />
            {!pickedDate && (
              <Text style={{
                fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 10,
              }}>
                날짜를 누르면 그날 일정이 아래에 나옵니다
              </Text>
            )}
            <DayList date={pickedDate} items={dayItems} today={today()} renderItem={agendaItem} />
          </>
        ) : (
          <>
            {/* 대회·게스트 모집 — 날짜가 정해진 단발 일정이라 위에 모아 둔다.
               정기 모임 사이에 섞이면 묻히고, 대회는 놓치면 끝이다. */}
            {upcomingAgenda.length > 0 && (
              <>
                <SectionTitle hint="신청 현황이 함께 보입니다">대회 · 게스트 모집</SectionTitle>
                {upcomingAgenda.map(agendaItem)}
                {kinds.includes(KIND.MEETING) && <SectionTitle>정기 모임</SectionTitle>}
              </>
            )}

            {kinds.includes(KIND.MEETING) && (
              <>
                {byMonth.map((grp) => (
                  <View key={grp.key}>
                    <SectionTitle right={
                      <Text style={{ fontSize: 11, color: C.faint }}>{grp.items.length}건</Text>
                    }>{grp.label}</SectionTitle>

                    {grp.items.map(meetingCard)}
                  </View>
                ))}

                {/* 더보기 — 이번 달만 먼저 보여준 이유를 같이 적는다 */}
                {hasMore && (
                  <Btn full tone="ghost" onPress={() => setMonths(months + MONTH_STEP)}>
                    {`3개월 더 보기 (${hidden}건 더 있음)`}
                  </Btn>
                )}
                {!hasMore && months > 1 && upcoming.length > 0 && (
                  <Text style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 4 }}>
                    예정된 일정을 모두 표시했습니다
                  </Text>
                )}
              </>
            )}

            {upcoming.length === 0 && upcomingAgenda.length === 0 && (
              <EmptyState
                icon="📅"
                title={venueId ? '이 코트장에 예정된 일정이 없습니다' : '예정된 일정이 없습니다'}
                body={isAdmin
                  ? '오른쪽 아래 [＋ 새 모임] 버튼으로 등록하세요. 정기 모임이면 기한까지 한 번에 만들 수 있습니다.'
                  : '운영진이 일정을 등록하면 여기에 표시됩니다.'}
              />
            )}
          </>
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
