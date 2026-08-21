/* 홈 — 오늘 필요한 것만 보여준다.

   구성 원칙 (v3)
     · 홈의 주인공은 "다음 모임" 하나. 그 아래로 매일 쓰는 4개(일정·대진표·
       채팅·게스트)만 바로가기로 둔다.
     · 대회·랭킹·NTRP 같은 나머지는 [더보기]에 묶고, 운영진 기능은
       "클럽 운영" 입구 하나로 모은다. 홈에 기능 18개를 늘어놓지 않는다.
     · 아이콘은 전부 벡터(Ionicons), 이모지 없음. */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '../_layout';
import { useBottomPad } from '../../src/hooks/useBottomPad';
import { useClub } from '../../src/hooks/useClub';
import { useVenueScope } from '../../src/hooks/useVenueScope';
import { computeStats } from '../../src/lib/matchmaking';
import { weatherFor } from '../../src/lib/weather';
import {
  updateMeeting, subGear, subJoinRequests, subServiceStats, setRsvp,
} from '../../src/lib/firestore';
import { dowName } from '../../src/lib/schedule';
import { canRsvpSelf, rsvpBlockReason } from '../../src/lib/scheduleView';
import {
  RSVP, viewModesFor, roleTone, JOIN_STATUS, screenRef,
} from '../../src/lib/constants';
import { AD_SLOTS } from '../../src/lib/ads';
import { AdBanner } from '../../src/components/AdBanner';
import { VenuePicker } from '../../src/components/VenuePicker';
import { UpdateBanner } from '../../src/components/UpdateBanner';
import { Icon } from '../../src/components/Icon';
import { useOptionSheet } from '../../src/components/native';
import {
  Card, SectionTitle, Chip, Btn, IconTile, StatCard, EmptyState, Badge,
} from '../../src/components/ui';
import { C, S, R, F, SHADOW } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

/* 클럽 운영 — 홈에 바로 펼치는 것은 "자주 하는 일"만.

   설정류(대진 설정 · 커플·페어 · 코트장 관리 · 클럽 설정)와 초대는
   한 번 정해 두면 잘 안 바뀐다. 홈에 두면 매일 보는 화면만 복잡해진다.
   그런 것은 [더보기] → 클럽 운영에 그대로 있다.

   [키, 라벨, 더보기 화면키, 권한] */
const MANAGE = [
  ['members', '회원', 'members'],
  ['joinreq', '가입 신청', 'joinreq'],
  ['attendance', '출석', 'attendance'],
  ['fees', '회비·지출', 'fees', 'fees'],
  ['reconcile', '입금 대사', 'reconcile', 'fees'],
  ['polls', '회비 알림', 'dunning', 'fees'],
];

/** 매일 쓰는 것만 바로가기로 — 나머지는 [더보기] */
const QUICK = [
  ['schedule', '일정', '/(tabs)/schedule'],
  ['match', '대진표', '/(tabs)/match'],
  ['chat', '채팅', { more: 'chat' }],
  ['guest', '게스트', { more: 'guest' }],
];

export default function Home() {
  const { clubId, me, viewMode, setViewMode, isAppAdmin, resetOnboarding } = useApp();
  const bottomPad = useBottomPad();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    club, members, meetings, posts, guestPosts, venues, meVal,
    isAdmin, realStaff, scopeVenues, seeAllVenues, realRole, seeFees, tournaments,
  } = useClub(clubId, me, { viewMode });
  const { venueId, setVenueId } = useVenueScope(scopeVenues);

  const [ads, setAds] = useState([]);
  const [pendingJoins, setPendingJoins] = useState(0);
  const [svc, setSvc] = useState(null);
  const sheet = useOptionSheet();

  useEffect(() => subServiceStats(setSvc), []);
  useEffect(() => subGear(setAds), []);

  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);

  useEffect(() => {
    if (!clubId || !isAdmin) { setPendingJoins(0); return undefined; }
    const unsub = subJoinRequests(clubId, (list) =>
      setPendingJoins(list.filter((r) => r.status === JOIN_STATUS.PENDING).length));
    return () => unsub && unsub();
  }, [clubId, isAdmin]);

  /* 보기 모드에 따라 노출 범위가 달라진다 */
  const myViewModes = useMemo(() => viewModesFor(realRole), [realRole]);
  /* 역할이 내려가면 예전에 골라둔 보기 모드는 풀어 준다 */
  useEffect(() => {
    if (viewMode && !myViewModes.some((v) => v.key === viewMode)) setViewMode(null);
  }, [viewMode, myViewModes]);
  const scopeIds = useMemo(() => scopeVenues.map((v) => v.id), [scopeVenues]);
  const mode = viewMode || (realStaff ? 'staff' : 'member');
  const visible = useMemo(() => {
    const upcoming = meetings.filter((m) => !m.canceled && m.date >= today());
    const inScope = upcoming.filter((m) => {
      /* 회장·총무·운영진은 전 코트장의 일정을 본다. 리드는 맡은 코트장만 */
      if (seeAllVenues) return true;
      const mineGroup = m.venueId ? scopeIds.includes(m.venueId) : scopeIds.length === 0;
      const asGuest = (m.guests || []).some((g) => g.uid === me);
      const invited = m.rsvp?.[me] !== undefined;
      return mineGroup || asGuest || invited;
    });
    const list = venueId ? inScope.filter((m) => m.venueId === venueId) : inScope;
    return [...list].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  }, [meetings, seeAllVenues, scopeIds, venueId, me]);

  /* 홈은 앱을 열면 가장 먼저 그려지는 화면이다. 일정이 100건 쌓였다고
     홈이 느려지면 앱 전체가 느린 것처럼 느껴진다. 가까운 것만 보여주고
     나머지는 [일정] 탭으로 보낸다. */
  const HOME_LIMIT = 6;
  const homeList = visible.slice(0, HOME_LIMIT);
  const moreCount = visible.length - homeList.length;

  const meeting = visible[0];
  const w = meeting ? weatherFor(meeting.date, meeting.forecast) : null;
  const yes = meeting
    ? Object.values(meeting.rsvp || {}).filter((v) => v === RSVP.YES).length + (meeting.guests?.length || 0) : 0;

  /* 대회는 단발성 주요 이벤트다. [더보기] 안에 묻혀 있으면 아무도 못 본다.
     다음 모임 바로 아래에 둬서 접근성을 올린다. */
  const upcomingTournaments = useMemo(
    () => (tournaments || [])
      .filter((t) => t.status !== 'done' && (!t.date || t.date >= today()))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .slice(0, 3),
    [tournaments],
  );

  const myStat = stats[me];
  const venueName = (id) => venues.find((v) => v.id === id)?.name;

  /* 화면 이동.

     코트 선택은 라우터 파라미터로 넘기지 않는다. 파라미터로 넘기면
     "같은 화면 + 다른 파라미터"가 히스토리에 쌓여서, 뒤로가기가 홈이 아니라
     필터 없는 같은 화면으로 돌아간다. 코트는 앱 상태(useApp)에 있고
     일정·대진 화면이 그걸 직접 본다. */
  const go = (target) => {
    if (typeof target === 'string') return router.push(target);
    /* from: 'home' — 더보기 화면의 뒤로가기가 목록이 아니라 홈으로 가게 한다.
       홈에서 [회원]을 눌렀는데 뒤로가기가 더보기 목록으로 가면,
       가 본 적 없는 화면으로 돌아가는 셈이라 어색하다. */
    return router.push({
      pathname: '/(tabs)/more',
      params: { open: target.more, from: 'home' },
    });
  };

  /* 코트를 고르지 않았고 코트장이 여러 곳이면, 어느 코트를 볼지 먼저 묻는다.
     고른 값은 앱 상태에 저장되므로 홈의 드롭다운도 같이 바뀐다. */
  const goScoped = (path) => {
    if (venueId || scopeVenues.length < 2) return go(path);
    return sheet.open({
      title: path.includes('schedule') ? '어느 코트 일정을 볼까요?' : '어느 코트 대진표를 볼까요?',
      options: [
        { key: 'all', label: '전체 코트' },
        ...scopeVenues.map((v) => ({ key: v.id, label: `${v.name} · ${v.startTime || ''}` })),
      ],
      onSelect: (o) => {
        setVenueId(o.key === 'all' ? null : o.key);
        router.push(path);
      },
    });
  };

  /* 모임 하나를 콕 집어 대진으로.

     코트 범위는 건드리지 않는다. 홈에서 고른 코트가 곧 대진 화면의 범위이고
     (앱 상태를 공유하므로 그대로 따라간다), 홈이 '전체'면 대진도 전체다.
     여기서 몰래 코트를 바꾸면 돌아왔을 때 홈의 선택이 달라져 있어 혼란스럽다. */
  const goMeeting = (m) => (m
    ? router.push({ pathname: '/(tabs)/match', params: { meetingId: m.id } })
    : undefined);

  /* ---------- 클럽 없이 둘러보는 중 ---------- */
  if (!clubId) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{
          backgroundColor: C.surface, paddingTop: insets.top + 8, paddingBottom: 12,
          paddingHorizontal: S.lg, borderBottomWidth: 1, borderBottomColor: C.border,
        }}>
          <Text style={F.h2}>테니스매치</Text>
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>클럽 없이 둘러보는 중</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: bottomPad }}>
          <EmptyState
            title="클럽에 들어가면 시작됩니다"
            body={'일정·대진표·회비·랭킹은 클럽 단위로 운영됩니다.\n클럽을 찾아 가입 신청하거나 직접 만들어 보세요.'}
            action={(
              <View style={{ gap: S.sm }}>
                <Btn full onPress={() => { resetOnboarding?.(); router.push('/onboarding'); }}>클럽 찾기</Btn>
                <Btn full tone="ghost" onPress={() => router.push('/onboarding?mode=create')}>새 클럽 만들기</Btn>
              </View>
            )}
          />
          {!!svc && (svc.clubs > 0 || svc.members > 0) && (
            <Card style={{ marginTop: S.md }}>
              <Text style={[F.label, { marginBottom: 10 }]}>테니스매치와 함께하는 중</Text>
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <StatCard value={(svc.clubs || 0).toLocaleString()} label="클럽" />
                <StatCard value={(svc.members || 0).toLocaleString()} label="회원" />
                <StatCard value={(svc.matches || 0).toLocaleString()} label="누적 경기" />
              </View>
            </Card>
          )}
          <AdBanner ads={ads} slot={AD_SLOTS.HOME} />
          <Card style={{ marginTop: S.md }} onPress={() => go({ more: 'guest' })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="guest" size={20} color={C.green} />
              <View style={{ flex: 1 }}>
                <Text style={F.bodyBold}>게스트 모집 게시판</Text>
                <Text style={[F.caption, { marginTop: 2 }]}>
                  클럽 없이도 볼 수 있어요 · 공개 모집 {guestPosts.length}건
                </Text>
              </View>
              <Icon name="forward" size={16} color={C.faint} />
            </View>
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 헤더 */}
      <View style={{
        backgroundColor: C.surface, paddingTop: insets.top + 8, paddingBottom: 10,
        paddingHorizontal: S.lg, borderBottomWidth: 1, borderBottomColor: C.border,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={F.h2} numberOfLines={1}>{club?.name || '테니스클럽'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: C.sub }}>{meVal?.name}</Text>
            <Chip tone={roleTone(realRole)}>{realRole}</Chip>
          </View>
        </View>

        {/* 보기 모드 — 앱 운영자에게만 보인다.

            원래 내가 두 화면(운영진/회원)을 번갈아 확인하려고 넣은 장치다.
            실제 클럽 운영진이 보면 "내가 지금 운영진인가 회원인가"를 헷갈리고,
            모드를 바꿔 둔 채 잊으면 "메뉴가 사라졌다"고 하게 된다.
            기능이 아니라 개발 도구이므로 앱 운영자에게만 남긴다. */}
        {isAppAdmin && realStaff && myViewModes.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: 6, marginTop: 10 }}
          >
            {myViewModes.map(({ key: v, label }) => (
              <Pressable key={label} onPress={() => { setViewMode(v); setVenueId(null); }}
                style={{
                  paddingHorizontal: 11, paddingVertical: 6, borderRadius: R.pill,
                  backgroundColor: viewMode === v ? C.green : C.fill,
                }}>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: viewMode === v ? '#fff' : C.sub }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: bottomPad }}>
        {/* 코트장 드롭다운 — 여기서 고른 코트가 일정·대진표까지 이어진다 */}
        {/* 받아 놓은 업데이트가 있을 때만 뜬다. 평소엔 아무것도 안 그린다 */}
        <UpdateBanner />

        {scopeVenues.length > 1 && (
          <View style={{ marginBottom: S.md, zIndex: 20 }}>
            <VenuePicker venues={scopeVenues} value={venueId} onChange={setVenueId} />
            <Text style={[F.caption, { marginTop: 5 }]}>
              {venueId
                ? '아래 일정·대진표도 이 코트만 보여줍니다.'
                : '전체 코트 기준입니다. 일정·대진표를 누르면 코트를 고를 수 있습니다.'}
            </Text>
          </View>
        )}

        {/* 다음 모임 — 눌러서 대진표로 */}
        <Pressable disabled={!meeting}
          onPress={() => goMeeting(meeting)}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
          <View style={[{ backgroundColor: C.ink, borderRadius: R.xl, padding: S.xl }, SHADOW.md]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.lime, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.3 }}>
                  {seeAllVenues ? '다음 모임 · 전체 코트' : mode === 'lead' ? '다음 모임 · 담당 코트' : '내 다음 모임'}
                </Text>
                {meeting ? (
                  <>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 8, letterSpacing: -0.4 }}>
                      {meeting.date.slice(5).replace('-', '.')} ({dowName(meeting.date)}) {meeting.time}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.66)', fontSize: 12.5, marginTop: 4 }}>
                      {meeting.place || venueName(meeting.venueId) || '장소 미정'} · 코트 {meeting.courts}면
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: '#fff', marginTop: 8, fontSize: 14 }}>
                    {isAdmin ? '예정된 모임이 없습니다' : '참여 예정인 모임이 없습니다'}
                  </Text>
                )}
              </View>
              {w && (
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Icon name="weather" size={22} color={C.lime2} />
                  <Text style={{ color: 'rgba(255,255,255,0.66)', fontSize: 11 }}>{w.temp}° · {w.rain}%</Text>
                </View>
              )}
            </View>

            {meeting && (
              <>
                <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.lg }}>
                  <StatCard tone="dark" value={yes} label="참석 확정" />
                  <StatCard tone="dark" value={meeting.matches?.length || 0} label="생성된 경기" />
                  <StatCard tone="dark" value={`${meeting.rounds || 0}`} label="타임" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 12 }}>
                  <Text style={{ color: C.lime, fontSize: 12, fontWeight: '600' }}>대진표 보기</Text>
                  <Icon name="forward" size={13} color={C.lime} />
                </View>
              </>
            )}

            {w && w.rain >= 60 && isAdmin && meeting && (
              <View style={{
                marginTop: S.md, backgroundColor: 'rgba(214,69,93,0.16)', borderRadius: R.md,
                padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <Text style={{ color: '#F1A7B4', fontSize: 12 }}>우천 예보 — 취소 여부 결정</Text>
                <Btn small tone="danger" onPress={() => updateMeeting(clubId, meeting.id, { canceled: true })}>우천 취소</Btn>
              </View>
            )}
          </View>
        </Pressable>

        {/* 다가오는 대회 — 단발성이라 놓치기 쉽다. 다음 모임 바로 다음 자리 */}
        {upcomingTournaments.length > 0 && (
          <>
            <SectionTitle right={<Chip tone="outline">{upcomingTournaments.length}건</Chip>}>
              다가오는 대회
            </SectionTitle>
            {upcomingTournaments.map((t) => (
              <Card key={t.id} style={{ marginBottom: S.sm }}
                onPress={() => go({ more: 'tournament' })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: R.md, backgroundColor: C.greenSoft,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name="tournament" size={19} color={C.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={F.bodyBold} numberOfLines={1}>{t.name || '클럽 대회'}</Text>
                    <Text style={[F.caption, { marginTop: 2 }]}>
                      {t.date || '날짜 미정'}
                      {t.date ? ` (${dowName(t.date)})` : ''}
                      {t.courts ? ` · ${t.courts}면` : ''}
                      {t.roster?.length ? ` · ${t.roster.length}명` : ''}
                    </Text>
                  </View>
                  <Icon name="forward" size={16} color={C.faint} />
                </View>
              </Card>
            ))}
          </>
        )}

        {/* 바로가기 — 매일 쓰는 4개만 */}
        <Card style={{ marginTop: S.md, paddingVertical: S.lg }}>
          <View style={{ flexDirection: 'row' }}>
            {QUICK.map(([key, label, target]) => (
              <IconTile key={key} icon={key} label={label} width="25%"
                onPress={() => (typeof target === 'string' ? goScoped(target) : go(target))} />
            ))}
          </View>
        </Card>


        {/* 클럽 운영 — 예전에는 [더보기]로 넘기는 입구 하나였는데, 한 번 더
           들어가야 해서 손이 많이 갔다. 위 바로가기처럼 아이콘을 직접 펼친다. */}
        {isAdmin && (
          <>
            <SectionTitle>클럽 운영</SectionTitle>
            <Card style={{ paddingVertical: S.lg }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {MANAGE.filter(([, , , gate]) => gate !== 'fees' || seeFees)
                  .map(([key, label, target]) => (
                    <IconTile
                      key={key} icon={key} label={label} width="25%"
                      badge={key === 'joinreq' ? pendingJoins : 0}
                      onPress={() => go({ more: target })}
                    />
                  ))}
              </View>
              <Pressable
                onPress={() => router.push({
                  pathname: '/(tabs)/more', params: { open: 'manage', from: 'home' },
                })}
                style={({ pressed }) => ({ marginTop: S.md, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontSize: 11.5, color: C.green, fontWeight: '600' }}>
                  설정 · 초대 · 코트장 관리는 더보기에서 →
                </Text>
              </Pressable>
            </Card>
          </>
        )}

        {/* 예정 일정 — 회원도 여기서 참석 여부를 바로 정한다.

           예전에는 운영진에게만 목록을 보여 줬다. 회원은 일정을 보려면
           일정 탭으로, 참석 체크하러 또 들어가야 했다.
           홈에서 다 끝나야 한다:
             참석 확정 → 초록 강조
             불참     → 흐리게
             미정     → 그 자리에서 [참석] / [불참] 버튼 */}
        {visible.length > 0 && (
          <>
            <SectionTitle right={<Chip tone="outline">{visible.length}건</Chip>}>
              {seeAllVenues ? '예정 일정 · 전체 코트' : mode === 'lead' ? '예정 일정 · 담당 코트' : '내 예정 일정'}
            </SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {homeList.map((m, i) => {
                const cnt = Object.values(m.rsvp || {}).filter((v) => v === RSVP.YES).length + (m.guests?.length || 0);
                // 단식 모임은 코트당 2명이 정원이다
                const per = m.playMode === 'singles' ? 2 : 4;
                const enough = cnt >= (m.courts || 1) * per;
                const mine = m.rsvp?.[me];              // 내 참석 상태
                const going = mine === RSVP.YES;
                const notGoing = mine === RSVP.NO;
                return (
                  <View key={m.id} style={{
                    borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                    backgroundColor: going ? C.greenSoft : 'transparent',
                    borderRadius: going ? R.md : 0,
                    marginTop: i ? 0 : 0,
                    opacity: notGoing ? 0.45 : 1,
                  }}>
                    <Pressable
                      onPress={() => goMeeting(m)}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingVertical: 11, paddingHorizontal: going ? 10 : 0,
                        opacity: pressed ? 0.6 : 1,
                      })}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[F.bodyBold, going && { color: C.green }]}>
                            {m.date.slice(5).replace('-', '.')} ({dowName(m.date)}) {m.time}
                          </Text>
                          {going && <Chip tone="green">참석</Chip>}
                          {notGoing && <Chip tone="outline">불참</Chip>}
                        </View>
                        <Text style={[F.caption, { marginTop: 2 }]}>
                          {m.place || venueName(m.venueId) || '장소 미정'} · {m.courts}면 · {m.rounds}타임
                          {m.matches?.length ? ' · 대진 완료' : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Chip tone={enough ? 'soft' : 'warn'}>참석 {cnt}</Chip>
                        <Icon name="forward" size={14} color={C.faint} />
                      </View>
                    </Pressable>

                    {/* 아직 정하지 않았으면 여기서 바로 정한다.
                       단, 내가 속한 코트장의 모임에서만 — 운영진은 모든 코트를
                       보지만 안 나가는 코트에 참석을 넣으면 그 대진에 잡힌다. */}
                    {mine === undefined && canRsvpSelf(meVal, m) && (
                      <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 11 }}>
                        <Btn small onPress={() => setRsvp(clubId, m.id, me, RSVP.YES, me)}>참석</Btn>
                        <Btn small tone="ghost" onPress={() => setRsvp(clubId, m.id, me, RSVP.MAYBE, me)}>미정</Btn>
                        <Btn small tone="ghost" onPress={() => setRsvp(clubId, m.id, me, RSVP.NO, me)}>불참</Btn>
                      </View>
                    )}
                    {!canRsvpSelf(meVal, m) && mine === undefined && (
                      <Text style={{ fontSize: 10.5, color: C.faint, paddingBottom: 10 }}>
                        {rsvpBlockReason(meVal, m, venueName(m.venueId))}
                      </Text>
                    )}
                    {/* 이미 정했으면 조용히 바꿀 수 있게만 */}
                    {mine !== undefined && canRsvpSelf(meVal, m) && (
                      <Pressable
                        onPress={() => setRsvp(clubId, m.id, me, going ? RSVP.NO : RSVP.YES, me)}
                        style={{ paddingBottom: 10, paddingHorizontal: going ? 10 : 0 }}>
                        <Text style={{ fontSize: 11.5, color: C.faint }}>
                          {going ? '참석 취소' : notGoing ? '참석으로 바꾸기' : '미정 — 참석으로 바꾸기'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}

              {/* 가까운 것만 홈에 둔다 — 나머지는 일정 탭이 제자리다 */}
              {moreCount > 0 && (
                <Pressable
                  onPress={() => router.push('/(tabs)/schedule')}
                  style={{ paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>
                    일정 {moreCount}건 더 보기 →
                  </Text>
                </Pressable>
              )}
            </Card>
          </>
        )}

        {/* 회원/리드: 내 코트 안내 */}
        {!seeAllVenues && (
          <>
            <SectionTitle>{mode === 'lead' ? '내가 담당하는 코트' : '내 정기 운동 그룹'}</SectionTitle>
            <Card>
              {scopeVenues.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {scopeVenues.map((v) => <Chip key={v.id} tone="soft">{v.name} {v.startTime}</Chip>)}
                </View>
              ) : (
                <Text style={{ fontSize: 12.5, color: C.sub, lineHeight: 19 }}>
                  아직 지정된 그룹이 없습니다. 운영진이 {screenRef('members')}에서 소속 코트장을 지정하면
                  그 그룹의 일정만 표시됩니다.
                </Text>
              )}
            </Card>
          </>
        )}

        {/* 내 기록 */}
        {myStat?.games > 0 && (
          <>
            <SectionTitle right={<Chip tone="outline" onPress={() => router.push('/(tabs)/rank')}>자세히</Chip>}>
              내 기록
            </SectionTitle>
            <Card>
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <StatCard value={myStat.games} label="경기" />
                <StatCard value={myStat.wins} label="승" />
                <StatCard value={`${Math.round((myStat.wins / myStat.games) * 100)}%`} label="승률" />
              </View>
            </Card>
          </>
        )}

        {/* 공지 */}
        <SectionTitle right={<Chip tone="outline" onPress={() => go({ more: 'board' })}>전체</Chip>}>
          공지사항
        </SectionTitle>
        {posts.filter((p) => p.type === 'notice').slice(0, 2).map((p) => (
          <Card key={p.id} style={{ marginBottom: S.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {p.pinned && <Chip tone="soft">고정</Chip>}
              <Text style={F.bodyBold} numberOfLines={1}>{p.title}</Text>
            </View>
            <Text numberOfLines={2} style={{ color: C.sub, fontSize: 12.5, marginTop: 5, lineHeight: 18 }}>{p.body}</Text>
          </Card>
        ))}
        {posts.filter((p) => p.type === 'notice').length === 0 && (
          <Card><Text style={{ fontSize: 12, color: C.faint }}>등록된 공지가 없습니다.</Text></Card>
        )}

        {/* 광고 */}
        <AdBanner ads={ads} slot={AD_SLOTS.HOME} />
      </ScrollView>
      {sheet.node}
    </View>
  );
}
