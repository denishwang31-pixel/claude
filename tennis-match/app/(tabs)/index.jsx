/* 홈 — 다음 모임 + 전체 기능 바로가기(아이콘 그리드) + 코트 현황

   구성을 바꾼 이유
     예전 홈은 "다음 모임 · 공지 · 랭킹"만 세로로 늘어놔서, 나머지 기능이
     전부 [더보기] 안에 숨어 있었다. 회원이 무엇을 할 수 있는지 화면에서
     알 수가 없다. 그래서 홈 한 장에 전체 기능을 아이콘으로 펼치고,
     운영진 전용 기능만 걸러서 보여준다. */
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
import { RSVP, VIEW_MODES, JOIN_STATUS } from '../../src/lib/constants';
import { AD_SLOTS } from '../../src/lib/ads';
import { AdBanner } from '../../src/components/AdBanner';
import { VenuePicker } from '../../src/components/VenuePicker';
import {
  Card, SectionTitle, Chip, Btn, IconTile, StatCard, EmptyState, Badge,
} from '../../src/components/ui';
import { C, S, R, F, SHADOW } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

/** 홈 아이콘 그리드 — [키, 아이콘, 라벨, 운영진전용, 이동경로] */
const TILES = [
  ['schedule', '📅', '일정', false, '/(tabs)/schedule'],
  ['match', '🎾', '대진표', false, '/(tabs)/match'],
  ['guest', '🙋', '게스트 모집', false, { more: 'guest' }],
  ['chat', '💬', '채팅', false, { more: 'chat' }],
  ['polls', '🗳', '참가투표', false, { more: 'polls' }],
  ['rank', '📈', '랭킹', false, '/(tabs)/rank'],
  ['tournament', '🏆', '대회', false, { more: 'tournament' }],
  ['ntrp', '📊', 'NTRP', false, { more: 'ntrp' }],
  ['members', '👥', '회원', false, { more: 'members' }],
  ['board', '📢', '공지', false, { more: 'board' }],
  ['tips', '🎯', '원포인트', false, '/(tabs)/tips'],
  ['courts', '📍', '코트 검색', false, { more: 'courts' }],
  ['joinreq', '✅', '가입 승인', true, { more: 'joinreq' }],
  ['fees', '💳', '회비·지출', true, { more: 'fees' }],
  ['attendance', '🗓', '출석', true, { more: 'attendance' }],
  ['venues', '🏟', '코트장', true, { more: 'venues' }],
  ['matchcfg', '⚙️', '대진 설정', true, { more: 'matchcfg' }],
  ['invite', '✉️', '클럽 초대', true, { more: 'invite' }],
];

export default function Home() {
  const { clubId, me, viewMode, setViewMode, resetOnboarding } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    club, members, meetings, posts, guestPosts, venues, meVal,
    isAdmin, realStaff, scopeVenues, nameOf,
  } = useClub(clubId, me, { viewMode });

  const [venueId, setVenueId] = useState(null);
  const [ads, setAds] = useState([]);
  const [pendingJoins, setPendingJoins] = useState(0);
  const [svc, setSvc] = useState(null);   // 서비스 전체 현황

  useEffect(() => subServiceStats(setSvc), []);

  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);

  useEffect(() => subGear(setAds), []);
  useEffect(() => {
    if (!clubId || !isAdmin) { setPendingJoins(0); return undefined; }
    const unsub = subJoinRequests(clubId, (list) =>
      setPendingJoins(list.filter((r) => r.status === JOIN_STATUS.PENDING).length));
    return () => unsub && unsub();
  }, [clubId, isAdmin]);

  /* 보기 모드에 따라 노출 범위가 달라진다 */
  const scopeIds = useMemo(() => scopeVenues.map((v) => v.id), [scopeVenues]);
  const mode = viewMode || (realStaff ? 'staff' : 'member');
  const visible = useMemo(() => {
    const upcoming = meetings.filter((m) => !m.canceled && m.date >= today());
    const inScope = upcoming.filter((m) => {
      if (mode === 'staff') return true;
      const mineGroup = m.venueId ? scopeIds.includes(m.venueId) : scopeIds.length === 0;
      const asGuest = (m.guests || []).some((g) => g.uid === me);
      const invited = m.rsvp?.[me] !== undefined;
      return mineGroup || asGuest || invited;
    });
    const list = venueId ? inScope.filter((m) => m.venueId === venueId) : inScope;
    return [...list].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  }, [meetings, mode, scopeIds, venueId, me]);

  const meeting = visible[0];
  const w = meeting ? weatherFor(meeting.date, meeting.forecast) : null;
  const yes = meeting
    ? Object.values(meeting.rsvp || {}).filter((v) => v === RSVP.YES).length + (meeting.guests?.length || 0) : 0;

  const myStat = stats[me];
  const venueName = (id) => venues.find((v) => v.id === id)?.name;

  const go = (target) => {
    if (typeof target === 'string') router.push(target);
    else router.push({ pathname: '/(tabs)/more', params: { open: target.more } });
  };

  const tiles = TILES.filter(([, , , staffOnly]) => !staffOnly || isAdmin);

  /* ---------- 클럽 없이 둘러보는 중 ---------- */
  if (!clubId) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{
          backgroundColor: C.surface, paddingTop: insets.top + 8, paddingBottom: 12,
          paddingHorizontal: S.lg, borderBottomWidth: 1, borderBottomColor: C.border,
        }}>
          <Text style={F.h2}>🎾 테니스매치</Text>
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
          <Card style={{ marginTop: S.md }} onPress={() => router.push({ pathname: '/(tabs)/more', params: { open: 'guest' } })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={F.bodyBold}>🙋 게스트 모집 게시판</Text>
                <Text style={[F.caption, { marginTop: 2 }]}>
                  클럽 없이도 볼 수 있어요 · 공개 모집 {guestPosts.length}건
                </Text>
              </View>
              <Chip tone="soft">보러가기 →</Chip>
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
          <Text style={F.h2} numberOfLines={1}>🎾 {club?.name || '테니스클럽'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: C.sub }}>{meVal?.name}</Text>
            <Chip tone="soft">{meVal?.role || '회원'}</Chip>
          </View>
        </View>

        {/* 보기 모드 — 운영진에게만 */}
        {realStaff && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {VIEW_MODES.map(({ key: v, label }) => (
              <Pressable key={label} onPress={() => { setViewMode(v); setVenueId(null); }}
                style={{
                  paddingHorizontal: 11, paddingVertical: 6, borderRadius: R.pill,
                  backgroundColor: viewMode === v ? C.green : C.fill,
                }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: viewMode === v ? '#fff' : C.sub }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }}>
        {/* 코트장 드롭다운 */}
        {scopeVenues.length > 1 && (
          <View style={{ marginBottom: S.md, zIndex: 20 }}>
            <VenuePicker venues={scopeVenues} value={venueId} onChange={setVenueId} />
          </View>
        )}

        {/* 다음 모임 — 눌러서 대진표로 */}
        <Pressable disabled={!meeting}
          onPress={() => meeting && router.push({ pathname: '/(tabs)/match', params: { meetingId: meeting.id } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
          <View style={[{ backgroundColor: C.ink, borderRadius: R.xl, padding: S.lg }, SHADOW.md]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.lime, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                  {mode === 'staff' ? '다음 모임 · 전체 코트' : mode === 'lead' ? '다음 모임 · 담당 코트' : '내 다음 모임'}
                </Text>
                {meeting ? (
                  <>
                    <Text style={{ color: '#fff', fontSize: 19, fontWeight: '900', marginTop: 6, letterSpacing: -0.4 }}>
                      {meeting.date.slice(5).replace('-', '.')}({dowName(meeting.date)}) {meeting.time}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 3 }}>
                      {meeting.place || venueName(meeting.venueId) || '장소 미정'} · 코트 {meeting.courts}면
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: '#fff', marginTop: 6, fontSize: 14 }}>
                    {isAdmin ? '예정된 모임이 없습니다' : '참여 예정인 모임이 없습니다'}
                  </Text>
                )}
              </View>
              {w && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 30 }}>{w.icon}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>{w.temp}° · {w.rain}%</Text>
                </View>
              )}
            </View>

            {meeting && (
              <>
                <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.lg }}>
                  <StatCard tone="dark" value={yes} label="참석 확정" />
                  <StatCard tone="dark" value={meeting.matches?.length || 0} label="생성된 경기" />
                  <StatCard tone="dark" value={`${meeting.rounds || 0}T`} label="타임" />
                </View>
                <Text style={{ color: C.lime, fontSize: 11, marginTop: 10, textAlign: 'right', fontWeight: '700' }}>
                  눌러서 대진표 보기 →
                </Text>
              </>
            )}

            {w && w.rain >= 60 && isAdmin && meeting && (
              <View style={{
                marginTop: S.md, backgroundColor: 'rgba(225,29,72,0.18)', borderRadius: R.md,
                padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <Text style={{ color: '#fda4af', fontSize: 12 }}>🌧 우천 예보 — 취소 여부 결정</Text>
                <Btn small tone="danger" onPress={() => updateMeeting(clubId, meeting.id, { canceled: true })}>우천 취소</Btn>
              </View>
            )}
          </View>
        </Pressable>

        {/* 전체 기능 아이콘 그리드 */}
        <Card style={{ marginTop: S.lg, paddingVertical: S.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: S.lg }}>
            {tiles.map(([key, icon, label, , target]) => (
              <IconTile
                key={key}
                icon={icon}
                label={label}
                width="25%"
                badge={key === 'joinreq' ? pendingJoins : 0}
                onPress={() => go(target)}
              />
            ))}
          </View>
        </Card>

        {/* 광고 */}
        <AdBanner ads={ads} slot={AD_SLOTS.HOME} />

        {/* 가입 신청 대기 */}
        {isAdmin && pendingJoins > 0 && (
          <Card style={{ marginTop: S.md }} onPress={() => go({ more: 'joinreq' })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={F.bodyBold}>🙋 가입 신청 대기</Text>
                <Badge count={pendingJoins} />
              </View>
              <Chip tone="green">승인하기 →</Chip>
            </View>
          </Card>
        )}

        {/* 운영진: 전체 코트 현황 */}
        {isAdmin && visible.length > 0 && (
          <>
            <SectionTitle right={<Chip tone="outline">{visible.length}건</Chip>}>
              {mode === 'lead' ? '담당 코트 일정' : '전체 코트 일정'}
            </SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {visible.slice(0, 6).map((m, i) => {
                const cnt = Object.values(m.rsvp || {}).filter((v) => v === RSVP.YES).length + (m.guests?.length || 0);
                const enough = cnt >= (m.courts || 1) * 4;
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
                        {m.date.slice(5).replace('-', '.')}({dowName(m.date)}) {m.time}
                      </Text>
                      <Text style={[F.caption, { marginTop: 2 }]}>
                        {m.place || venueName(m.venueId) || '장소 미정'} · {m.courts}면 · {m.rounds}타임
                        {m.matches?.length ? ' · 대진 완료' : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Chip tone={enough ? 'green' : 'warn'}>참석 {cnt}</Chip>
                      <Text style={{ color: C.faint, fontSize: 15 }}>›</Text>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          </>
        )}

        {/* 회원/리드: 내 코트 안내 */}
        {mode !== 'staff' && (
          <>
            <SectionTitle>{mode === 'lead' ? '내가 담당하는 코트' : '내 정기 운동 그룹'}</SectionTitle>
            <Card>
              {scopeVenues.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {scopeVenues.map((v) => <Chip key={v.id} tone="soft">{v.name} {v.startTime}</Chip>)}
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
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
            <SectionTitle right={<Chip tone="outline" onPress={() => router.push('/(tabs)/rank')}>자세히 →</Chip>}>
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
        <SectionTitle right={<Chip tone="outline" onPress={() => go({ more: 'board' })}>전체 →</Chip>}>
          공지사항
        </SectionTitle>
        {posts.filter((p) => p.type === 'notice').slice(0, 2).map((p) => (
          <Card key={p.id} style={{ marginBottom: S.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {p.pinned && <Chip tone="lime">📌 고정</Chip>}
              <Text style={F.bodyBold} numberOfLines={1}>{p.title}</Text>
            </View>
            <Text numberOfLines={2} style={{ color: C.sub, fontSize: 12.5, marginTop: 5, lineHeight: 18 }}>{p.body}</Text>
          </Card>
        ))}
        {posts.filter((p) => p.type === 'notice').length === 0 && (
          <Card><Text style={{ fontSize: 12, color: C.faint }}>등록된 공지가 없습니다.</Text></Card>
        )}
      </ScrollView>
    </View>
  );
}
