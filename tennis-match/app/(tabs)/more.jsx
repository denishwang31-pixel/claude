/* 더보기 허브 — 메뉴 진입 + 초대코드/새 클럽/로그아웃
   회비·대진설정 등 운영 메뉴는 운영진에게만 보입니다. */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '../_layout';
import { useClub } from '../../src/hooks/useClub';
import { computeStats } from '../../src/lib/matchmaking';
import { logout } from '../../src/lib/auth';
import { Board, Guest, Courts } from '../../src/components/MoreScreens';
import { Members } from '../../src/components/MembersScreen';
import { Fees } from '../../src/components/FeesScreen';
import { Ntrp } from '../../src/components/NtrpScreen';
import { Tournaments } from '../../src/components/TournamentScreen';
import { Attendance } from '../../src/components/AttendanceScreen';
import { Pairs } from '../../src/components/PairsScreen';
import { ClubSettings } from '../../src/components/ClubSettingsScreen';
import { Venues } from '../../src/components/VenuesScreen';
import { MatchConfig } from '../../src/components/MatchConfigScreen';
import { Card, SectionTitle, Chip, Btn } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

/** [키, 라벨, 운영진 전용 여부] */
const MENU = [
  ['guest', '🎾 게스트 모집 (공개 게시판)', false],
  ['tournament', '🏆 대회', false],
  ['rank', '📈 랭킹·기록', false],
  ['ntrp', '📊 NTRP 등급', false],
  ['board', '📢 클럽 공지·자유글', false],
  ['courts', '📍 코트 검색', false],
  ['members', '👥 회원', false],
  ['attendance', '✅ 출석', true],
  ['fees', '💳 회비·지출', true],
  ['pairs', '💑 커플·고정 페어', true],
  ['venues', '🏟 코트장 관리', true],
  ['matchcfg', '🎯 대진 설정', true],
  ['settings', '⚙️ 클럽 설정', true],
];

export default function More() {
  const { clubId, me, viewMode } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sub, setSub] = useState(null);
  const [feeMonth, setFeeMonth] = useState(new Date().toISOString().slice(0, 7));
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const {
    club, members, meetings, posts, guestPosts, courts, fee, pairs, tournaments,
    venues, matchConfig, rules, meVal, isAdmin, canAppoint, nameOf,
  } = useClub(clubId, me, { feeMonth, viewMode });
  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);

  const visibleMenu = MENU.filter(([, , staffOnly]) => !staffOnly || isAdmin);
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
      case 'guest': return <Guest {...{ clubId, club, guestPosts, meetings, venues, me, meVal, isAdmin, flash }} />;
      case 'courts': return <Courts {...{ clubId, courts, isAdmin, flash }} />;
      case 'members': return <Members {...{ clubId, members, venues, stats, me, isAdmin, canAppoint, flash }} />;
      default: return null;
    }
  };

  const newClub = () => {
    Alert.alert(
      '새 클럽 만들기',
      '새로운 클럽을 만들면 그 클럽의 회장이 됩니다.\n지금 클럽의 데이터는 그대로 남아 있고, 나중에 초대코드로 다시 참여할 수 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '계속', onPress: () => router.push('/onboarding?mode=create') },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: C.ink, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {sub && <Pressable onPress={() => setSub(null)}><Text style={{ color: C.lime, fontSize: 16 }}>‹ </Text></Pressable>}
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{title}</Text>
        {!sub && viewMode && (
          <View style={{ marginLeft: 'auto', backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.ink }}>
              {viewMode === 'staff' ? '운영진 모드' : viewMode === 'lead' ? '리드 모드' : '회원 모드'}
            </Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {!sub ? (
          <>
            {sub === 'rank' ? null : null}
            <Card>
              {visibleMenu.map(([k, label], i) => (
                <Pressable key={k}
                  onPress={() => (k === 'rank' ? router.push('/(tabs)/rank') : setSub(k))}
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

            <SectionTitle>클럽</SectionTitle>
            <Card>
              <Text style={{ fontSize: 13, fontWeight: '700' }}>{club?.name || '테니스클럽'}</Text>
              <Text style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                내 역할: {meVal?.role || '회원'} · 회원 {members.length}명
              </Text>
              <View style={{ marginTop: 12 }}>
                <Btn full tone="ghost" onPress={newClub}>+ 새 클럽 만들기</Btn>
              </View>
              <Text style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
                다른 클럽에 참여하려면 초대코드가 필요합니다.
              </Text>
            </Card>

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
