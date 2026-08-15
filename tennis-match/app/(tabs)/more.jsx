/* 더보기 허브 — 메뉴 진입 + 초대/가입신청/새 클럽/로그아웃
   회비·대진설정 등 운영 메뉴는 운영진에게만 보입니다.
   서브화면을 열면 안드로이드 뒤로가기와 화면 안 [‹ 뒤로] 가 같은 동작을 합니다. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useApp } from '../_layout';
import { useBottomPad } from '../../src/hooks/useBottomPad';
import { useClub } from '../../src/hooks/useClub';
import { useBackHandler } from '../../src/hooks/useBackHandler';
import { computeStats } from '../../src/lib/matchmaking';
import { logout } from '../../src/lib/auth';
import { subJoinRequests } from '../../src/lib/firestore';
import { JOIN_STATUS, normalizeRole } from '../../src/lib/constants';
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
import { JoinRequests } from '../../src/components/JoinRequestsScreen';
import { Invite } from '../../src/components/InviteScreen';
import { Polls } from '../../src/components/PollScreen';
import { Chat } from '../../src/components/ChatScreen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Card, SectionTitle, Chip, Btn, ListRow, Badge } from '../../src/components/ui';
import { C, F } from '../../src/lib/theme';

/** 그룹 → [키, 아이콘, 라벨, 부제] — 운영 기능은 "클럽 운영" 한 묶음으로 */
const MENU_GROUPS = [
  {
    title: '커뮤니티',
    staffOnly: false,
    items: [
      ['guest', 'guest', '게스트 모집', '모든 클럽이 함께 보는 공개 게시판'],
      ['chat', 'chat', '클럽 채팅', null],
      ['polls', 'polls', '참가투표', '회식·대회 참가 의사를 물어보세요'],
      ['board', 'board', '공지·자유글', null],
    ],
  },
  {
    title: '경기·기록',
    staffOnly: false,
    items: [
      ['tournament', 'tournament', '대회', 'KDK · 청백전 · 클럽 교류전'],
      ['rank', 'rank', '랭킹·기록', null],
      ['ntrp', 'ntrp', 'NTRP 등급', null],
      ['members', 'members', '회원', null],
      ['courts', 'courts', '코트 검색', '주변 공공·사설 테니스장 찾기'],
    ],
  },
  {
    title: '클럽 운영',
    staffOnly: true,
    items: [
      ['joinreq', 'joinreq', '가입 신청', '검색으로 들어온 신청을 승인'],
      ['invite', 'invite', '클럽 초대', '초대코드·링크 보내기'],
      ['attendance', 'attendance', '출석', null],
      ['fees', 'fees', '회비·지출', '회장·총무만', 'fees'],
      ['pairs', 'pairs', '커플·고정 페어', null],
      ['venues', 'venues', '코트장 관리', '우리 클럽이 정기적으로 쓰는 코트'],
      ['matchcfg', 'matchcfg', '대진 설정', null],
      ['settings', 'settings', '클럽 설정', null],
    ],
  },
];

/** 서브화면 제목 검색용 평탄화 */
const MENU_FLAT = MENU_GROUPS.flatMap((g) => g.items.map(([k, , label]) => [k, label]));

export default function More() {
  const { clubId, me, viewMode, resetOnboarding } = useApp();
  const bottomPad = useBottomPad();
  const router = useRouter();
  const params = useLocalSearchParams();
  const navigation = useNavigation();
  const [sub, setSub] = useState(null);

  /* 홈에서 바로 들어온 경우(예: 홈 → 채팅) 해당 화면을 연다. 'manage' 는 루트 목록.

     open 값은 한 번 쓰고 즉시 비운다. 남겨 두면
       (1) 탭을 떠났다 돌아와도 그 화면이 계속 열려 있고,
       (2) 같은 화면을 다시 열려 해도 값이 안 바뀌어 effect 가 안 돈다. */
  useEffect(() => {
    if (!params?.open) return;
    const k = String(params.open);
    setSub(k === 'manage' ? null : k);
    router.setParams({ open: '' });
  }, [params?.open]);

  /* 하단 [더보기] 탭을 누르면 언제나 메뉴 목록으로 — 마지막으로 봤던
     서브화면(채팅 등)이 열리면 "더보기를 눌렀는데 채팅이 뜬다"가 된다. */
  useEffect(() => navigation.addListener?.('tabPress', () => {
    setSub(null);
    router.setParams({ open: '' });
  }), [navigation]);
  const [feeMonth, setFeeMonth] = useState(new Date().toISOString().slice(0, 7));
  const [toast, setToast] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const {
    club, members, meetings, posts, guestPosts, courts, fee, pairs, tournaments,
    venues, matchConfig, rules, polls, meVal, isAdmin, canAppoint, nameOf,
    seeFees, seeAllVenues, myLeadVenues,
  } = useClub(clubId, me, { feeMonth, viewMode });
  const { stats } = useMemo(() => computeStats(members, meetings), [members, meetings]);

  /* 대기 중인 가입 신청 건수 — 메뉴에 배지로 표시 */
  useEffect(() => {
    if (!clubId || !isAdmin) { setPendingCount(0); return undefined; }
    const unsub = subJoinRequests(clubId, (list) =>
      setPendingCount(list.filter((r) => r.status === JOIN_STATUS.PENDING).length));
    return () => unsub && unsub();
  }, [clubId, isAdmin]);

  /* 안드로이드 하드웨어 뒤로 = 화면 안 [‹ 뒤로] 와 동일 동작 */
  const goBack = () => setSub(null);
  useBackHandler(() => {
    if (sub) { goBack(); return true; }
    return false; // 최상위에서는 OS 기본 동작(앱 종료)
  });

  const title = MENU_FLAT.find(([k]) => k === sub)?.[1] || '더보기';

  const renderSub = () => {
    switch (sub) {
      case 'tournament': return <Tournaments {...{ clubId, members, tournaments, isAdmin, flash }} />;
      case 'ntrp': return <Ntrp {...{ clubId, members, me, meVal, isAdmin, flash }} />;
      case 'attendance': return <Attendance {...{ clubId, members, meetings, isAdmin, flash }} />;
      case 'pairs': return <Pairs {...{ clubId, members, pairs, isAdmin, flash }} />;
      case 'settings': return (
        <ClubSettings
          {...{ clubId, club, venues, members, isAdmin, flash }}
          onOpenVenues={() => setSub('venues')}
          onOpenMatchConfig={() => setSub('matchcfg')}
        />
      );
      case 'venues': return <Venues {...{ clubId, club, venues, members, isAdmin, flash }} />;
      case 'matchcfg': return <MatchConfig {...{ clubId, matchConfig, rules, isAdmin, flash }} />;
      case 'fees': return (
        <Fees {...{
          clubId, club, members, fee, feeMonth, setFeeMonth, isAdmin, flash,
          venues, seeFees, seeAllVenues, myLeadVenues,
        }} />
      );
      case 'board': return <Board {...{ clubId, posts, meVal, me, isAdmin, flash }} />;
      case 'guest': return <Guest {...{ clubId, club, guestPosts, meetings, venues, me, meVal, isAdmin, flash }} />;
      case 'courts': return <Courts {...{ clubId, courts, isAdmin, flash }} />;
      case 'members': return <Members {...{ clubId, members, venues, stats, me, isAdmin, canAppoint, flash }} />;
      case 'joinreq': return <JoinRequests {...{ clubId, club, members, isAdmin, flash }} />;
      case 'invite': return <Invite {...{ clubId, club, members, isAdmin, flash }} />;
      case 'polls': return <Polls {...{ clubId, polls, members, me, isAdmin, flash }} />;
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

  const findClub = () => { resetOnboarding?.(); router.push('/onboarding'); };

  /* ---------- 클럽에 아직 속하지 않은 상태(둘러보기) ---------- */
  if (!clubId) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="더보기" subtitle="클럽 없이 둘러보는 중" />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
          <Card style={{ backgroundColor: C.ink }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>아직 클럽에 속해 있지 않습니다</Text>
            <Text style={{ color: C.lime2, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
              클럽에 들어가면 일정·대진표·회비·랭킹을 함께 쓸 수 있습니다.
              지금은 게스트 모집 게시판과 용품만 볼 수 있어요.
            </Text>
          </Card>

          <View style={{ marginTop: 12, gap: 8 }}>
            <Btn full onPress={findClub}>클럽 찾아 가입 신청</Btn>
            <Btn full tone="ghost" onPress={() => router.push('/onboarding?mode=create')}>새 클럽 만들기</Btn>
          </View>

          <Card style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
              초대코드나 초대 링크를 받으셨나요?{'\n'}
              링크를 누르면 바로 가입되고, 코드는 [클럽 찾기] 검색창에 그대로 넣으면 됩니다.
            </Text>
          </Card>

          <View style={{ marginTop: 28, alignItems: 'center' }}>
            <Pressable onPress={logout}>
              <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>로그아웃</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* 채팅은 입력창이 화면 하단에 붙어야 해서 스크롤뷰 밖에서 전체 높이로 그린다 */
  if (sub === 'chat') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader
          title="클럽 채팅"
          subtitle={`${club?.name || ''} · 회원 ${members.length}명`}
          onBack={goBack}
          backLabel="더보기"
        />
        <Chat {...{ clubId, me, meVal, members, isAdmin, flash }} />
        {toast && (
          <View style={{
            position: 'absolute', bottom: 84, alignSelf: 'center', backgroundColor: C.ink,
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
          }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{toast}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title={title}
        onBack={sub ? goBack : undefined}
        backLabel="더보기"
        right={!sub && viewMode ? (
          <Chip tone="soft">
            {viewMode === 'staff' ? '운영진 모드' : viewMode === 'lead' ? '리드 모드' : '회원 모드'}
          </Chip>
        ) : null}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
        {!sub ? (
          <>
            {MENU_GROUPS.filter((g) => !g.staffOnly || isAdmin).map((g) => (
              <View key={g.title}>
                <SectionTitle>{g.title}</SectionTitle>
                <Card style={{ paddingVertical: 4 }}>
                  {g.items
                    .filter(([, , , , gate]) => gate !== 'fees' || seeFees)
                    .map(([k, icon, label, subLabel], i) => (
                      <ListRow
                        key={k}
                        first={i === 0}
                        icon={icon}
                        label={label}
                        sub={subLabel}
                        right={k === 'joinreq' && pendingCount > 0 ? <Badge count={pendingCount} /> : null}
                        onPress={() => (k === 'rank' ? router.push('/(tabs)/rank') : setSub(k))}
                      />
                    ))}
                </Card>
              </View>
            ))}

            <SectionTitle>내 클럽</SectionTitle>
            <Card>
              <Text style={F.bodyBold}>{club?.name || '테니스클럽'}</Text>
              <Text style={[F.caption, { marginTop: 2 }]}>
                내 역할 {normalizeRole(meVal?.role)} · 회원 {members.length}명
              </Text>
              <View style={{ marginTop: 12, gap: 8 }}>
                <Btn full tone="ghost" onPress={newClub}>새 클럽 만들기</Btn>
                <Btn full tone="ghost" onPress={findClub}>다른 클럽 찾기</Btn>
              </View>
              <Text style={[F.caption, { marginTop: 8 }]}>
                초대코드를 받았다면 [다른 클럽 찾기] 검색창에 코드를 그대로 넣으세요.
              </Text>
            </Card>

            <View style={{ marginTop: 24, alignItems: 'center' }}>
              <Pressable onPress={logout}><Text style={{ color: C.danger, fontSize: 13, fontWeight: '600' }}>로그아웃</Text></Pressable>
              <Text style={{ color: C.faint, fontSize: 11, marginTop: 8 }}>{meVal?.name} · {meVal?.role}</Text>
            </View>
          </>
        ) : renderSub()}
      </ScrollView>

      {toast && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, maxWidth: 340 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
