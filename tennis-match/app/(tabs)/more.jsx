/* 더보기 허브 (FIX-02) — 회비/게시판/게스트/코트/회원 + 초대코드/로그아웃 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { computeStats } from '../../src/lib/matchmaking';
import { logout } from '../../src/lib/auth';
import { Board, Guest, Courts, Members } from '../../src/components/MoreScreens';
import { Fees } from '../../src/components/FeesScreen';
import { Ntrp } from '../../src/components/NtrpScreen';
import { Tournaments } from '../../src/components/TournamentScreen';
import { Attendance } from '../../src/components/AttendanceScreen';
import { Pairs } from '../../src/components/PairsScreen';
import { ClubSettings } from '../../src/components/ClubSettingsScreen';
import { Venues } from '../../src/components/VenuesScreen';
import { MatchConfig } from '../../src/components/MatchConfigScreen';
import { Card, SectionTitle, Chip } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const MENU = [
  ['tournament', '🏆 대회'], ['ntrp', '📊 NTRP 등급'], ['attendance', '✅ 출석'],
  ['pairs', '💑 커플·고정 페어'], ['fees', '💳 회비'], ['board', '📋 게시판'],
  ['guest', '🎾 게스트 모집'], ['courts', '📍 코트 검색'], ['members', '👥 회원'], ['venues', '🏟 코트장 관리'], ['matchcfg', '🎯 대진 설정'], ['settings', '⚙️ 클럽 설정'],
];

export default function More() {
  const { clubId, me } = useApp();
  const insets = useSafeAreaInsets();
  const [sub, setSub] = useState(null);
  const [feeMonth, setFeeMonth] = useState(new Date().toISOString().slice(0, 7));
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const { club, members, meetings, posts, guestPosts, courts, fee, pairs, tournaments,
          venues, matchConfig, rules, meVal, isAdmin, nameOf } =
    useClub(clubId, me, { feeMonth });
  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);

  const title = MENU.find(([k]) => k === sub)?.[1] || '더보기';

  const renderSub = () => {
    switch (sub) {
      case 'tournament': return <Tournaments {...{ clubId, members, tournaments, isAdmin, flash }} />;
      case 'ntrp': return <Ntrp {...{ clubId, members, me, meVal, isAdmin, flash }} />;
      case 'attendance': return <Attendance {...{ clubId, members, meetings, isAdmin, flash }} />;
      case 'pairs': return <Pairs {...{ clubId, members, pairs, isAdmin, flash }} />;
      case 'settings': return <ClubSettings {...{ clubId, club, isAdmin, flash }} />;
      case 'venues': return <Venues {...{ clubId, club, venues, members, isAdmin, flash }} />;
      case 'matchcfg': return <MatchConfig {...{ clubId, matchConfig, rules, isAdmin, flash }} />;
      case 'fees': return <Fees {...{ clubId, club, members, fee, feeMonth, setFeeMonth, isAdmin, flash }} />;
      case 'board': return <Board {...{ clubId, posts, meVal, me, isAdmin, flash }} />;
      case 'guest': return <Guest {...{ clubId, club, guestPosts, meetings, members, me, meVal, isAdmin, nameOf, flash }} />;
      case 'courts': return <Courts {...{ clubId, courts, isAdmin, flash }} />;
      case 'members': return <Members {...{ clubId, members, stats, me, isAdmin, nameOf, flash }} />;
      default: return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: C.ink, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {sub && <Pressable onPress={() => setSub(null)}><Text style={{ color: C.lime, fontSize: 16 }}>‹ </Text></Pressable>}
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {!sub ? (
          <>
            <Card>
              {MENU.map(([k, label], i) => (
                <Pressable key={k} onPress={() => setSub(k)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#f5f5f4' }}>
                  <Text style={{ fontSize: 15, fontWeight: '600' }}>{label}</Text>
                  <Text style={{ color: C.faint }}>›</Text>
                </Pressable>
              ))}
            </Card>

            {isAdmin && club?.inviteCode && (
              <>
                <SectionTitle>클럽 초대코드</SectionTitle>
                <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: 3, color: C.ink }}>{club.inviteCode}</Text>
                  <Chip tone="outline">회원에게 공유</Chip>
                </Card>
              </>
            )}

            <View style={{ marginTop: 24, alignItems: 'center' }}>
              <Pressable onPress={logout}><Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>로그아웃</Text></Pressable>
              <Text style={{ color: C.faint, fontSize: 11, marginTop: 8 }}>{meVal?.name} · {meVal?.role}</Text>
            </View>
          </>
        ) : renderSub()}
      </ScrollView>

      {toast && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, maxWidth: 340 }}>
          <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
