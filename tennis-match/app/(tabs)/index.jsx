/* 홈 — 운영진: 전체 코트 현황 / 회원: 내가 속한 코트장(그룹) + 게스트 확정 일정만 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { computeStats } from '../../src/lib/matchmaking';
import { weatherFor } from '../../src/lib/weather';
import { updateMeeting, subGear } from '../../src/lib/firestore';
import { dowName } from '../../src/lib/schedule';
import { RSVP, isStaffRole } from '../../src/lib/constants';
import { AdBanner } from '../../src/components/AdBanner';
import { Card, SectionTitle, Chip, Btn } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const { clubId, me, viewMode, setViewMode } = useApp();
  const insets = useSafeAreaInsets();
  const { club, members, meetings, posts, guestPosts, venues, meVal, isAdmin, realStaff, nameOf } =
    useClub(clubId, me, { viewMode });
  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);
  const [ads, setAds] = useState([]);
  useEffect(() => { if (!clubId) return undefined; return subGear(clubId, setAds); }, [clubId]);

  /* 내가 볼 수 있는 모임 —
     운영진: 전체 / 회원: 내 소속 코트장(그룹) + 내가 게스트로 확정된 모임 */
  const myVenueIds = meVal?.venueIds || [];
  const visible = useMemo(() => {
    const upcoming = meetings.filter((m) => !m.canceled && m.date >= today());
    if (isAdmin) return upcoming;
    return upcoming.filter((m) => {
      const mineGroup = m.venueId ? myVenueIds.includes(m.venueId) : myVenueIds.length === 0;
      const asGuest = (m.guests || []).some((g) => g.uid === me);
      const invited = m.rsvp?.[me] !== undefined; // 이미 참석 의사를 밝힌 모임
      return mineGroup || asGuest || invited;
    });
  }, [meetings, isAdmin, myVenueIds, me]);

  const meeting = visible[0];
  const w = meeting ? weatherFor(meeting.date, meeting.forecast) : null;
  const yes = meeting
    ? Object.values(meeting.rsvp || {}).filter((v) => v === RSVP.YES).length + (meeting.guests?.length || 0) : 0;
  const pendingGuests = guestPosts.reduce((n, p) => n + (p.applicants || []).filter((a) => a.status === 'applied').length, 0);

  const rankTop = Object.entries(stats)
    .filter(([id]) => !id.startsWith('g:'))
    .map(([id, s]) => ({ id, ...s, wr: s.games ? s.wins / s.games : 0 }))
    .sort((a, b) => b.wins - a.wins || b.wr - a.wr)
    .slice(0, 3);

  const venueName = (id) => venues.find((v) => v.id === id)?.name;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 헤더 */}
      <View style={{ backgroundColor: C.ink, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>🎾 {club?.name || '테니스클럽'}</Text>
          <Text style={{ color: '#6ee7b7', fontSize: 11 }}>{meVal?.name} · {meVal?.role}</Text>
        </View>

        {/* 보기 모드 전환 — 운영진만 노출(회원 화면이 어떻게 보이는지 확인·테스트용) */}
        {realStaff && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {[[null, '내 역할'], ['staff', '운영진 모드'], ['member', '회원 모드']].map(([v, label]) => (
              <Pressable key={label} onPress={() => setViewMode(v)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                  backgroundColor: viewMode === v ? C.lime : 'rgba(255,255,255,0.12)',
                }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: viewMode === v ? C.ink : '#a7f3d0' }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Card style={{ backgroundColor: C.ink, borderColor: C.green }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>
                {isAdmin ? '다음 모임 (전체)' : '내 다음 모임'}
              </Text>
              {meeting ? (
                <>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 4 }}>
                    {meeting.date}({dowName(meeting.date)}) {meeting.time}
                  </Text>
                  <Text style={{ color: '#a7f3d0', fontSize: 12, marginTop: 2 }}>
                    {meeting.place || venueName(meeting.venueId) || '장소 미정'} · 코트 {meeting.courts}면
                  </Text>
                </>
              ) : (
                <Text style={{ color: '#fff', marginTop: 4, fontSize: 13 }}>
                  {isAdmin ? '예정된 모임이 없습니다' : '참여 예정인 모임이 없습니다'}
                </Text>
              )}
            </View>
            {w && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 30 }}>{w.icon}</Text>
                <Text style={{ color: '#a7f3d0', fontSize: 11 }}>{w.temp}° · 강수 {w.rain}%</Text>
              </View>
            )}
          </View>

          {meeting && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {[['참석 확정', yes], ['생성된 경기', meeting.matches?.length || 0]].map(([label, v]) => (
                <View key={label} style={{ flex: 1, backgroundColor: C.green, borderRadius: 12, padding: 8, alignItems: 'center' }}>
                  <Text style={{ color: C.lime, fontSize: 18, fontWeight: '900' }}>{v}</Text>
                  <Text style={{ color: '#6ee7b7', fontSize: 10 }}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          {w && w.rain >= 60 && isAdmin && meeting && (
            <View style={{ marginTop: 12, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: '#fca5a5', fontSize: 12 }}>🌧 우천 예보 — 취소 여부 결정</Text>
              <Btn small tone="danger" onPress={() => updateMeeting(clubId, meeting.id, { canceled: true })}>우천 취소</Btn>
            </View>
          )}
        </Card>

        {/* 광고 배너 */}
        <AdBanner ads={ads} />

        {/* 운영진: 전체 코트 현황 */}
        {isAdmin && visible.length > 0 && (
          <>
            <SectionTitle>전체 코트 현황 ({visible.length}건)</SectionTitle>
            <Card>
              {visible.slice(0, 6).map((m, i) => {
                const cnt = Object.values(m.rsvp || {}).filter((v) => v === RSVP.YES).length + (m.guests?.length || 0);
                return (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700' }}>
                        {m.date}({dowName(m.date)}) {m.time}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.faint }}>
                        {m.place || venueName(m.venueId) || '장소 미정'} · {m.courts}면 · {m.rounds}타임
                      </Text>
                    </View>
                    <Chip tone={cnt >= m.courts * 4 ? 'green' : 'outline'}>참석 {cnt}</Chip>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {/* 회원: 내 그룹 안내 */}
        {!isAdmin && (
          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 4 }}>내 정기 운동 그룹</Text>
            {myVenueIds.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {myVenueIds.map((id) => <Chip key={id} tone="green">{venueName(id) || '코트장'}</Chip>)}
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: C.faint }}>
                아직 지정된 그룹이 없습니다. 운영진이 [회원] 화면에서 소속 코트장을 지정하면
                그 그룹의 일정만 표시됩니다.
              </Text>
            )}
          </Card>
        )}

        {isAdmin && pendingGuests > 0 && (
          <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>게스트 신청 대기 {pendingGuests}건</Text>
            <Chip tone="lime">더보기 → 게스트</Chip>
          </Card>
        )}

        <SectionTitle>공지사항</SectionTitle>
        {posts.filter((p) => p.type === 'notice').slice(0, 2).map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {p.pinned && <Chip tone="lime">📌 고정</Chip>}
              <Text style={{ fontWeight: '700', fontSize: 14 }}>{p.title}</Text>
            </View>
            <Text numberOfLines={2} style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>{p.body}</Text>
          </Card>
        ))}
        {posts.filter((p) => p.type === 'notice').length === 0 && (
          <Card><Text style={{ fontSize: 12, color: C.faint }}>등록된 공지가 없습니다.</Text></Card>
        )}

        <SectionTitle>이달의 랭킹 TOP 3</SectionTitle>
        <Card>
          {rankTop.map((s, i) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: i === 0 ? C.lime : '#e7e5e4', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: i === 0 ? C.ink : '#57534e' }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600' }}>{nameOf(s.id)}</Text>
              </View>
              <Text style={{ fontSize: 12, color: C.sub }}>{s.wins}승 {s.games - s.wins}패 · {Math.round(s.wr * 100)}%</Text>
            </View>
          ))}
          {rankTop.length === 0 && <Text style={{ fontSize: 12, color: C.faint, paddingVertical: 8 }}>아직 기록된 경기가 없습니다.</Text>}
        </Card>
      </ScrollView>
    </View>
  );
}
