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
import { useClub } from '../../src/hooks/useClub';
import { computeStats } from '../../src/lib/matchmaking';
import { weatherFor } from '../../src/lib/weather';
import {
  updateMeeting, subGear, subJoinRequests, subServiceStats,
} from '../../src/lib/firestore';
import { dowName } from '../../src/lib/schedule';
import { RSVP, viewModesFor, roleTone, JOIN_STATUS } from '../../src/lib/constants';
import { AD_SLOTS } from '../../src/lib/ads';
import { AdBanner } from '../../src/components/AdBanner';
import { VenuePicker } from '../../src/components/VenuePicker';
import { Icon } from '../../src/components/Icon';
import { useOptionSheet } from '../../src/components/native';
import {
  Card, SectionTitle, Chip, Btn, IconTile, StatCard, EmptyState, Badge,
} from '../../src/components/ui';
import { C, S, R, F, SHADOW } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

/** 매일 쓰는 것만 바로가기로 — 나머지는 [더보기] */
const QUICK = [
  ['schedule', '일정', '/(tabs)/schedule'],
  ['match', '대진표', '/(tabs)/match'],
  ['chat', '채팅', { more: 'chat' }],
  ['guest', '게스트', { more: 'guest' }],
];

export default function Home() {
  const { clubId, me, viewMode, setViewMode, resetOnboarding } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    club, members, meetings, posts, guestPosts, venues, meVal,
    isAdmin, realStaff, scopeVenues, seeAllVenues, realRole,
  } = useClub(clubId, me, { viewMode });

  const [venueId, setVenueId] = useState(null);
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

  const meeting = visible[0];
  const w = meeting ? weatherFor(meeting.date, meeting.forecast) : null;
  const yes = meeting
    ? Object.values(meeting.rsvp || {}).filter((v) => v === RSVP.YES).length + (meeting.guests?.length || 0) : 0;

  const myStat = stats[me];
  const venueName = (id) => venues.find((v) => v.id === id)?.name;

  /* 홈에서 고른 코트를 다음 화면까지 끌고 간다.
     예전엔 코트를 골라도 일정·대진표는 전체 코트를 보여줘 선택이 무의미했다. */
  const go = (target) => {
    if (typeof target === 'string') {
      const carries = target.includes('schedule') || target.includes('match');
      return router.push(carries && venueId ? { pathname: target, params: { venueId } } : target);
    }
    return router.push({ pathname: '/(tabs)/more', params: { open: target.more } });
  };

  /* 코트를 고르지 않았고 코트장이 여러 곳이면, 어느 코트를 볼지 먼저 묻는다 */
  const goScoped = (path) => {
    if (venueId || scopeVenues.length < 2) return go(path);
    return sheet.open({
      title: path.includes('schedule') ? '어느 코트 일정을 볼까요?' : '어느 코트 대진표를 볼까요?',
      options: [
        { key: 'all', label: '전체 코트' },
        ...scopeVenues.map((v) => ({ key: v.id, label: `${v.name} · ${v.startTime || ''}` })),
      ],
      onSelect: (o) => router.push(
        o.key === 'all' ? path : { pathname: path, params: { venueId: o.key } },
      ),
    });
  };

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
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }}>
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

        {/* 보기 모드 — 운영 담당에게만. 나보다 위 역할은 미리볼 수 없다 */}
        {realStaff && myViewModes.length > 1 && (
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

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }}>
        {/* 코트장 드롭다운 — 여기서 고른 코트가 일정·대진표까지 이어진다 */}
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
          onPress={() => meeting && router.push({ pathname: '/(tabs)/match', params: { meetingId: meeting.id } })}
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

        {/* 바로가기 — 매일 쓰는 4개만 */}
        <Card style={{ marginTop: S.md, paddingVertical: S.lg }}>
          <View style={{ flexDirection: 'row' }}>
            {QUICK.map(([key, label, target]) => (
              <IconTile key={key} icon={key} label={label} width="25%"
                onPress={() => (typeof target === 'string' ? goScoped(target) : go(target))} />
            ))}
          </View>
        </Card>

        {/* 운영진: 가입 신청 대기 */}
        {isAdmin && pendingJoins > 0 && (
          <Card style={{ marginTop: S.md }} onPress={() => go({ more: 'joinreq' })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="joinreq" size={20} color={C.green} />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={F.bodyBold}>가입 신청 대기</Text>
                <Badge count={pendingJoins} />
              </View>
              <Chip tone="green">승인하기</Chip>
            </View>
          </Card>
        )}

        {/* 운영진: 관리 기능 입구 — 낱개로 펼치지 않고 하나로 묶는다 */}
        {isAdmin && (
          <Card style={{ marginTop: S.md }} onPress={() => go({ more: 'manage' })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 38, height: 38, borderRadius: R.md, backgroundColor: C.greenSoft,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="manage" size={19} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={F.bodyBold}>클럽 운영</Text>
                <Text style={[F.caption, { marginTop: 2 }]}>
                  회원 · 회비 · 출석 · 코트장 · 대진 설정 · 초대
                </Text>
              </View>
              <Icon name="forward" size={16} color={C.faint} />
            </View>
          </Card>
        )}

        {/* 운영진/리드: 전체 코트 일정 */}
        {isAdmin && visible.length > 0 && (
          <>
            <SectionTitle right={<Chip tone="outline">{visible.length}건</Chip>}>
              {seeAllVenues ? '전체 코트 일정' : '담당 코트 일정'}
            </SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {visible.slice(0, 6).map((m, i) => {
                const cnt = Object.values(m.rsvp || {}).filter((v) => v === RSVP.YES).length + (m.guests?.length || 0);
                // 단식 모임은 코트당 2명이 정원이다
                const per = m.playMode === 'singles' ? 2 : 4;
                const enough = cnt >= (m.courts || 1) * per;
                return (
                  <Pressable key={m.id}
                    onPress={() => router.push({ pathname: '/(tabs)/match', params: { meetingId: m.id } })}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: C.border,
                      opacity: pressed ? 0.6 : 1,
                    })}>
                    <View style={{ flex: 1 }}>
                      <Text style={F.bodyBold}>
                        {m.date.slice(5).replace('-', '.')} ({dowName(m.date)}) {m.time}
                      </Text>
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
                );
              })}
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
                  아직 지정된 그룹이 없습니다. 운영진이 [회원] 화면에서 소속 코트장을 지정하면
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
