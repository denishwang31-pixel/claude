/* 홈 — 총무 대시보드. useClub 실시간 데이터 기반. */
import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { computeStats } from '../../src/lib/matchmaking';
import { weatherFor } from '../../src/lib/weather';
import { updateMeeting } from '../../src/lib/firestore';
import { Card, SectionTitle, Chip, Btn } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
const monthKey = () => today().slice(0, 7);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function Home() {
  const { clubId, me } = useApp();
  const insets = useSafeAreaInsets();
  const { club, members, meetings, posts, guestPosts, meVal, isAdmin, nameOf } = useClub(clubId, me);
  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);
  const meeting = meetings.filter((m) => !m.canceled && m.date >= today())[0];

  const w = meeting ? weatherFor(meeting.date, meeting.forecast) : null;
  const yes = meeting ? Object.values(meeting.rsvp || {}).filter((v) => v === 'yes').length + (meeting.guests?.length || 0) : 0;
  const pendingGuests = guestPosts.reduce((n, p) => n + (p.applicants || []).filter((a) => a.status === 'applied').length, 0);

  const rankTop = Object.entries(stats)
    .filter(([id]) => !id.startsWith('g:'))
    .map(([id, s]) => ({ id, ...s, wr: s.games ? s.wins / s.games : 0 }))
    .sort((a, b) => b.wins - a.wins || b.wr - a.wr)
    .slice(0, 3);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 헤더 */}
      <View style={{ backgroundColor: C.ink, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>🎾 {club?.name || '테니스클럽'}</Text>
          <Text style={{ color: '#6ee7b7', fontSize: 11 }}>{meVal?.name} · {meVal?.role}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ backgroundColor: C.ink, borderColor: C.green }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: C.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>NEXT MATCH</Text>
              {meeting ? (
                <>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 4 }}>
                    {meeting.date} ({DOW[new Date(meeting.date).getDay()]}) {meeting.time}
                  </Text>
                  <Text style={{ color: '#a7f3d0', fontSize: 12, marginTop: 2 }}>{meeting.place} · 코트 {meeting.courts}면</Text>
                </>
              ) : <Text style={{ color: '#fff', marginTop: 4 }}>예정된 모임이 없습니다</Text>}
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

        {isAdmin && meeting && (
          <>
            <SectionTitle>총무 원클릭 플로우</SectionTitle>
            <Card>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn small tone="ghost">① 참석 마감</Btn>
                <Btn small tone="primary">② 대진 생성</Btn>
                <Btn small tone="lime">③ 공유</Btn>
              </View>
            </Card>
          </>
        )}

        {isAdmin && pendingGuests > 0 && (
          <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>게스트 신청 대기 {pendingGuests}건</Text>
            <Chip tone="lime">확인</Chip>
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
