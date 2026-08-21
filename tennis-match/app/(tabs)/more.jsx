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
import {
  subJoinRequests, subFeeAliases, subDunningLog, subExpenses,
  subHandoverHistory, loadAllFees, subFeeClaims, subDuesPools,
} from '../../src/lib/firestore';
import { JOIN_STATUS, normalizeRole, SCREEN } from '../../src/lib/constants';
import { Board, Guest, Courts } from '../../src/components/MoreScreens';
import { Members } from '../../src/components/MembersScreen';
import { Fees } from '../../src/components/FeesScreen';
import { Reconcile } from '../../src/components/ReconcileScreen';
import { Dunning } from '../../src/components/DunningScreen';
import { Settlement } from '../../src/components/SettlementScreen';
import { Handover } from '../../src/components/HandoverScreen';
import { MyFees } from '../../src/components/MyFeesScreen';
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
import { ClubMatchScreen } from '../../src/components/ClubMatchScreen';
import { CoachScreen } from '../../src/components/CoachScreen';
import { CoachReviewScreen } from '../../src/components/CoachReviewScreen';
import { UpdateStatus } from '../../src/components/UpdateStatus';
import { NotifyStatus } from '../../src/components/NotifyStatus';
import { DeleteAccount } from '../../src/components/DeleteAccountScreen';
import { Legal } from '../../src/components/LegalScreen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Card, SectionTitle, Chip, Btn, ListRow, Badge } from '../../src/components/ui';
import { C, F } from '../../src/lib/theme';

/* 어디서 들어왔는지(from) → 뒤로가기가 갈 곳.
   진입점을 새로 만들 때 여기에 한 줄만 추가하면 된다. */
const FROM_ROUTES = {
  home: '/(tabs)',
  match: '/(tabs)/match',
  schedule: '/(tabs)/schedule',
  rank: '/(tabs)/rank',
};
const FROM_LABELS = {
  home: '홈', match: '대진', schedule: '일정', rank: '랭킹',
};

/* 메뉴 분류 — [키, 아이콘, 라벨, 부제, 권한]

   분류 기준은 "누구의 것인가"다.
     내 활동   나 개인의 기록·회비. 남과 공유되지 않는다.
     클럽 활동 회원이 함께 보는 것 — 대회·공지·채팅·회원 명단
     찾아보기  클럽 밖을 보는 것 — 게스트 모집(공개 게시판)·코트 검색
     클럽 운영 운영진만. 회비·지출은 여기 하나로 모았다(일회성 정산 포함).

   예전에는 '경기·기록'에 내 회비·정산·회원·코트 검색이 섞여 있었다.
   성격이 다 달라서 어디를 눌러야 할지 알 수 없었다. */
const MENU_GROUPS = [
  {
    title: '내 활동',
    staffOnly: false,
    items: [
      ['legal', 'settings', SCREEN.legal, '이용약관 · 개인정보처리방침'],
      ['myfees', 'fees', SCREEN.myfees, '납부 현황 확인 · 기록이 다르면 문의'],
      ['rank', 'rank', SCREEN.rank, null],
      ['ntrp', 'ntrp', SCREEN.ntrp, null],
    ],
  },
  {
    title: '클럽 활동',
    staffOnly: false,
    items: [
      ['tournament', 'tournament', SCREEN.tournament, 'KDK · 청백전 · 클럽 내 대회'],
      ['clubmatch', 'tournament', SCREEN.clubmatch, '상대 클럽을 검색해 초대하고 함께 진행'],
      ['polls', 'polls', SCREEN.polls, '회식·대회 참가 의사를 물어보세요'],
      ['board', 'board', SCREEN.board, null],
      ['chat', 'chat', SCREEN.chat, null],
      ['members', 'members', SCREEN.members, null],
    ],
  },
  {
    title: '찾아보기',
    staffOnly: false,
    items: [
      ['guest', 'guest', SCREEN.guest, '모든 클럽이 함께 보는 공개 게시판'],
      ['courts', 'courts', SCREEN.courts, '주변 공공·사설 테니스장 찾기'],
      ['coaches', 'ntrp', SCREEN.coaches, '지역별로 코치를 찾고 레슨 영상 보기'],
    ],
  },
  {
    /* 앱 운영자 전용. 클럽 운영진과는 다른 권한이라 묶음을 따로 둔다 —
       클럽 회장이 코치 광고비 장부를 볼 이유가 없다. */
    title: '앱 운영',
    appAdminOnly: true,
    items: [
      ['coachreview', 'ntrp', SCREEN.coachreview, '영상 승인 · 광고비 청구·수납'],
    ],
  },
  {
    title: '클럽 운영',
    staffOnly: true,
    items: [
      ['joinreq', 'joinreq', SCREEN.joinreq, '검색으로 들어온 신청을 승인'],
      ['invite', 'invite', SCREEN.invite, '초대코드·링크 보내기'],
      ['attendance', 'attendance', SCREEN.attendance, null],
      ['fees', 'fees', SCREEN.fees, '정기 회비 · 지출 · 일회성 정산', 'fees'],
      ['reconcile', 'fees', SCREEN.reconcile, '거래내역 붙여넣기 → 자동 확인', 'fees'],
      ['dunning', 'polls', SCREEN.dunning, '미납자에게 개별 발송', 'fees'],
      ['settlement', 'rank', SCREEN.settlement, '총회 자료 자동 생성', 'fees'],
      ['handover', 'members', SCREEN.handover, '권한만 넘기면 기록은 남습니다', 'fees'],
      ['venues', 'venues', SCREEN.venues, '우리 클럽이 정기적으로 쓰는 코트'],
      ['pairs', 'pairs', SCREEN.pairs, null],
      ['matchcfg', 'matchcfg', SCREEN.matchcfg, null],
      ['settings', 'settings', SCREEN.settings, null],
    ],
  },
];

/** 서브화면 제목 검색용 평탄화 */
const MENU_FLAT = MENU_GROUPS.flatMap((g) => g.items.map(([k, , label]) => [k, label]));

export default function More() {
  const { clubId, me, viewMode, isAppAdmin, resetOnboarding, openOnboarding } = useApp();
  const bottomPad = useBottomPad();
  const router = useRouter();
  const params = useLocalSearchParams();
  const navigation = useNavigation();
  const [sub, setSub] = useState(null);

  /* 홈에서 바로 들어온 경우(예: 홈 → 채팅) 해당 화면을 연다. 'manage' 는 루트 목록.

     open 값은 한 번 쓰고 즉시 비운다. 남겨 두면
       (1) 탭을 떠났다 돌아와도 그 화면이 계속 열려 있고,
       (2) 같은 화면을 다시 열려 해도 값이 안 바뀌어 effect 가 안 돈다. */
  /* 어디서 이 화면을 열었는가. 뒤로가기가 갈 곳을 정한다.
     홈의 [회원]을 눌러 들어왔으면 뒤로가기는 홈으로 가야 한다.
     더보기 목록으로 돌아가면 "누른 적 없는 화면"으로 가는 셈이라 어색하다. */
  const [cameFrom, setCameFrom] = useState(null);

  useEffect(() => {
    if (!params?.open) return;
    const k = String(params.open);
    setSub(k === 'manage' ? null : k);
    setCameFrom(params?.from ? String(params.from) : null);
    router.setParams({ open: '', from: '' });
  }, [params?.open]);

  /* 하단 [더보기] 탭을 누르면 언제나 메뉴 목록으로 — 마지막으로 봤던
     서브화면(채팅 등)이 열리면 "더보기를 눌렀는데 채팅이 뜬다"가 된다. */
  useEffect(() => navigation.addListener?.('tabPress', () => {
    setSub(null);
    setCameFrom(null);
    router.setParams({ open: '', from: '' });
  }), [navigation]);
  const [feeMonth, setFeeMonth] = useState(new Date().toISOString().slice(0, 7));
  const [toast, setToast] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  /* 총무 도구용 자료 — 회비 메뉴를 볼 수 있는 사람만 구독한다 */
  const [feeAliases, setFeeAliases] = useState({});
  const [dunningLog, setDunningLog] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [allFees, setAllFees] = useState([]);
  const [handoverLog, setHandoverLog] = useState([]);
  const [feeClaims, setFeeClaims] = useState([]);
  const [duesPools, setDuesPools] = useState([]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const {
    club, members, meetings, posts, guestPosts, courts, fee, pairs, tournaments,
    venues, matchConfig, rules, polls, meVal, isAdmin, canAppoint, nameOf, realRole,
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

  /* 총무 도구 자료 구독 — 권한 없는 사람은 아예 읽지 않는다(규칙에서도 막힌다) */
  useEffect(() => {
    if (!clubId || !seeFees) {
      setFeeAliases({}); setDunningLog({}); setExpenses([]); setAllFees([]); setFeeClaims([]);
      return undefined;
    }
    const u1 = subFeeAliases(clubId, setFeeAliases);
    const u2 = subDunningLog(clubId, setDunningLog);
    const u3 = subExpenses(clubId, setExpenses);
    const u4 = subFeeClaims(clubId, setFeeClaims);
    loadAllFees(clubId).then(setAllFees).catch(() => setAllFees([]));
    return () => { u1 && u1(); u2 && u2(); u3 && u3(); u4 && u4(); };
  }, [clubId, seeFees]);

  useEffect(() => {
    if (!clubId) return undefined;
    return subHandoverHistory(clubId, setHandoverLog);
  }, [clubId]);

  /* 일회성 정산은 참여자 본인도 자기 몫을 알아야 하므로 회원 전체가 구독한다 */
  useEffect(() => {
    if (!clubId) return undefined;
    return subDuesPools(clubId, setDuesPools);
  }, [clubId]);

  /* 뒤로가기 — 들어온 곳으로 돌려보낸다.
     홈에서 왔으면 홈으로, 더보기 목록에서 열었으면 목록으로. */
  /* 들어온 곳으로 돌려보낸다.

     from 에 어느 탭에서 왔는지가 담겨 온다. 예전에는 'home' 만 처리해서
     대진 화면에서 [게스트 모집]으로 들어오면 뒤로가기가 더보기 목록으로
     갔다 — 가 본 적 없는 화면이라 어색하다.
     새 진입점을 만들 때 from 만 붙이면 뒤로가기는 자동으로 맞는다. */
  const goBack = () => {
    setSub(null);
    if (!cameFrom) return;              // 더보기 목록에서 열었으면 목록으로
    setCameFrom(null);
    router.replace(FROM_ROUTES[cameFrom] || '/(tabs)');
  };
  useBackHandler(() => {
    if (sub) { goBack(); return true; }
    return false; // 최상위에서는 OS 기본 동작(앱 종료)
  });

  const title = MENU_FLAT.find(([k]) => k === sub)?.[1] || '더보기';

  const renderSub = () => {
    switch (sub) {
      case 'tournament': return <Tournaments {...{ clubId, members, venues, tournaments, isAdmin, flash }} />;
      case 'clubmatch': return (
        <ClubMatchScreen
          {...{ clubId, me, members, isAdmin, flash }}
          clubName={club?.name || ''}
        />
      );
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
      case 'myfees': return <MyFees {...{ clubId, club, me, meVal, flash }} />;
      case 'reconcile': return (
        <Reconcile {...{
          clubId, club, members, fee, periodKey: feeMonth, aliases: feeAliases, flash,
          amount: fee.amount || club?.settings?.feeAmount || 30000,
        }} />
      );
      case 'dunning': return (
        <Dunning {...{
          clubId, club, members, fee, periodKey: feeMonth, sentLog: dunningLog, flash,
          amount: fee.amount || club?.settings?.feeAmount || 30000,
          isAdmin: seeFees, claims: feeClaims,
        }} />
      );
      case 'settlement': return (
        <Settlement {...{ clubId, club, members, expenses, flash, isAdmin: seeFees }} />
      );
      case 'handover': return (
        <Handover {...{
          clubId, club, members, meetings, fees: allFees, history: handoverLog,
          canAppoint, me, flash,
        }} />
      );
      case 'fees': return (
        <Fees {...{
          clubId, club, members, fee, feeMonth, setFeeMonth, isAdmin, flash,
          venues, seeFees, seeAllVenues, myLeadVenues, pools: duesPools,
        }} />
      );
      case 'board': return <Board {...{ clubId, posts, meVal, me, isAdmin, flash }} />;
      case 'guest': return (
        <Guest {...{
          clubId, club, guestPosts, meetings, venues, me, meVal, isAdmin, flash,
          draft: params?.draftMeetingId ? {
            meetingId: String(params.draftMeetingId),
            needM: Number(params.draftNeedM) || 0,
            needF: Number(params.draftNeedF) || 0,
            text: String(params.draftText || ''),
          } : null,
        }} />
      );
      case 'courts': return <Courts {...{ clubId, courts, isAdmin, flash }} />;
      case 'coaches': return <CoachScreen {...{ uid: me, flash }} />;
      case 'coachreview': return <CoachReviewScreen {...{ uid: me, flash }} />;
      case 'legal': return <Legal />;
      case 'deleteaccount': return <DeleteAccount {...{ clubId, me, members, flash }} />;
      case 'members': return <Members {...{ clubId, members, venues, stats, me, isAdmin, canAppoint, myRole: realRole, flash }} />;
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
        { text: '계속', onPress: () => { openOnboarding?.(); router.push('/onboarding?mode=create'); } },
      ],
    );
  };

  const findClub = () => { openOnboarding?.(); resetOnboarding?.(); router.push('/onboarding'); };

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
            <Btn full tone="ghost" onPress={() => { openOnboarding?.(); router.push('/onboarding?mode=create'); }}>새 클럽 만들기</Btn>
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
          subtitle={venues.length > 1
            ? `${club?.name || ''} · 전체 / 코트장별 채널`
            : `${club?.name || ''} · 회원 ${members.length}명`}
          onBack={goBack}
          backLabel={FROM_LABELS[cameFrom] || '더보기'}
        />
        <Chat {...{ clubId, me, meVal, members, venues, isAdmin, flash }} />
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
        backLabel={FROM_LABELS[cameFrom] || '더보기'}
        right={!sub && viewMode ? (
          <Chip tone="soft">
            {viewMode === 'staff' ? '운영진 모드' : viewMode === 'lead' ? '리드 모드' : '회원 모드'}
          </Chip>
        ) : null}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
        {!sub ? (
          <>
            {MENU_GROUPS
              .filter((g) => (!g.staffOnly || isAdmin) && (!g.appAdminOnly || isAppAdmin))
              .map((g) => (
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

            {/* 지금 어떤 버전이 돌고 있는지 — 이게 없으면 "업데이트했는데
               왜 그대로냐"의 원인을 구분할 수 없다 */}
            <SectionTitle>앱 정보</SectionTitle>
            <NotifyStatus {...{ clubId, me, flash }} />
            <UpdateStatus flash={flash} />

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
