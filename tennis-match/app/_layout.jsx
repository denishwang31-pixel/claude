/* 루트 레이아웃 — Firebase Auth 연동 + 라우팅 가드
   + 운영진/리드/회원 "보기 모드" 전환(테스트·체험용)

   라우팅 규칙
     로그인 안 됨                  → /login
     이메일 인증 전(새 비밀번호 계정) → /verify   (src/lib/verify.js)
     로그인됨 + 클럽 있음          → /(tabs)
     로그인됨 + 클럽 없음          → /onboarding
       단, "나중에 하기"를 누른 사용자는 클럽 없이도 /(tabs) 로 들어간다.
     초대 링크(tennismatch://join?code=…) → /join 이 코드를 받아 처리 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator, Linking, Alert, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { subAuth, getMySession } from '../src/lib/auth';
import { needsEmailVerify } from '../src/lib/verify';
import { checkAppAdmin } from '../src/lib/firestore';
import { C } from '../src/lib/theme';
import { handleLateSocialUrl, checkPendingSocial } from '../src/lib/socialSignIn';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const EMPTY = { uid: null, clubId: null, me: null, isAppAdmin: false, skipped: false, pendingClubId: null, needsVerify: false, email: '' };

export default function RootLayout() {
  const [session, setSession] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  /** 보기 모드: null = 실제 역할 그대로 / 'staff' | 'lead' | 'member' */
  const [viewMode, setViewMode] = useState(null);
  /* 지금 보고 있는 코트장. null = 전체.

     왜 라우터 파라미터가 아니라 여기에 두나
       예전에는 홈에서 /(tabs)/match?venueId=… 처럼 파라미터로 넘겼다.
       그런데 탭 화면은 파라미터만 다른 같은 화면이라, 뒤로가기를 누르면
       홈이 아니라 "파라미터 없는 같은 화면"(=전체 코트)으로 돌아갔다.
       또 파라미터가 라우트에 남아 있어서, 코트를 바꿔도 예전 코트가
       다시 뜨는 일이 있었다.
       코트 선택은 "지금 무엇을 보고 있는가"라는 앱 전체의 상태이므로
       보기 모드와 같은 자리에 둔다. 화면들은 전부 이 값 하나만 본다. */
  const [venueId, setVenueId] = useState(null);
  /* 이미 클럽이 있는 사람이 "다른 클럽 찾기"로 온보딩에 들어간 상태.
     이 표시가 없으면 라우팅 가드가 "클럽 있는데 왜 온보딩이지?" 하고
     즉시 홈으로 되돌려서, 버튼을 눌러도 홈으로 튕겼다. */
  const [onboardingIntent, setOnboardingIntent] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // 인증 상태 구독 → uid, 소속 clubId 해석
  useEffect(() => {
    const unsub = subAuth(async (uid, info) => {
      if (!uid) { setSession(EMPTY); setLoading(false); return; }
      /* 이메일 인증 전이면 클럽 정보도 읽지 않는다 — 인증 화면만 보여 준다 */
      if (needsEmailVerify(info)) {
        setSession({ ...EMPTY, uid, me: uid, needsVerify: true, email: info?.email || '' });
        setLoading(false);
        return;
      }
      const [s, appAdmin] = await Promise.all([getMySession(uid), checkAppAdmin(uid)]);
      setSession({
        uid, me: uid, // me(memberId) = uid
        clubId: s.clubId,
        pendingClubId: s.pendingClubId,
        skipped: s.skipped,
        isAppAdmin: appAdmin,
        needsVerify: false,
        email: info?.email || '',
      });
      setLoading(false);
    });
    return unsub;
  }, []);

  /* 카카오·네이버 로그인 결과가 로그인 창 밖으로 늦게 도착한 경우 — 여기서 로그인을 마친다.
     (카카오톡으로 넘어갔다 오면 로그인 창이 먼저 닫힌다. social.js matchLateReturn 참고)
     성공하면 위 인증 구독이 알아서 다음 화면으로 보낸다. 실패만 알린다. */
  useEffect(() => {
    const onUrl = async (url) => {
      try {
        const r = await handleLateSocialUrl(url);
        if (r && !r.ok && r.error) Alert.alert('로그인', r.error);
      } catch (e) { /* 로그인 화면에서 다시 시도하면 된다 */ }
    };
    Linking.getInitialURL().then((u) => u && onUrl(u)).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => onUrl(e?.url));
    /* 크롬에 멈춰 있다가 손으로 앱으로 돌아온 경우 — 서버에 맡겨 둔 결과를 한 번 찾는다 */
    const onActive = async (st) => {
      if (st !== 'active') return;
      try {
        const r = await checkPendingSocial();
        if (r && !r.ok && r.error) Alert.alert('로그인', r.error);
      } catch (e) { /* 다음에 다시 본다 */ }
    };
    const appSub = AppState.addEventListener('change', onActive);
    return () => { sub?.remove?.(); appSub?.remove?.(); };
  }, []);

  // 라우팅 가드
  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    const inAuthFlow = root === 'login' || root === 'onboarding';
    // /join 은 로그인 여부와 무관하게 화면 자체가 안내를 처리한다
    if (root === 'join') return;

    if (!session.uid) {
      if (root !== 'login') router.replace('/login');
      return;
    }
    if (session.needsVerify) {
      if (root !== 'verify') router.replace('/verify');
      return;
    }
    if (root === 'verify') { router.replace('/'); return; }
    // 클럽이 없고, 둘러보기도 선택하지 않았으면 온보딩으로
    if (!session.clubId && !session.skipped) {
      if (root !== 'onboarding') router.replace('/onboarding');
      return;
    }
    // 본인이 직접 들어간 온보딩은 내보내지 않는다
    if (root === 'onboarding' && onboardingIntent) return;
    if (inAuthFlow) router.replace('/(tabs)');
  }, [loading, session, segments, onboardingIntent]);

  /* 온보딩을 벗어나면 표시를 지운다 — 다음에 또 튕기지 않게 */
  useEffect(() => {
    if (onboardingIntent && segments[0] !== 'onboarding') setOnboardingIntent(false);
  }, [segments, onboardingIntent]);

  /** 클럽을 새로 만들거나 옮길 때 호출 */
  /* 클럽을 바꾸면 코트 선택도 초기화 — 다른 클럽의 코트장 id 가 남으면 안 된다 */
  const switchClub = (clubId) => {
    setVenueId(null);
    setOnboardingIntent(false);
    setSession((s) => ({ ...s, clubId, skipped: false, pendingClubId: null }));
  };
  /** 온보딩을 다시 밟게 한다(클럽 찾기/만들기 재진입) */
  const resetOnboarding = () => setSession((s) => ({ ...s, skipped: false }));
  /** 클럽이 있는 상태에서 클럽 찾기/만들기 화면을 여는 정식 통로 */
  const openOnboarding = () => setOnboardingIntent(true);
  /** 인증을 마쳤다 — 클럽 정보를 읽어 원래 길로 */
  const markVerified = async () => {
    const [s, appAdmin] = await Promise.all([getMySession(session.uid), checkAppAdmin(session.uid)]);
    setSession((x) => ({
      ...x, needsVerify: false, clubId: s.clubId, pendingClubId: s.pendingClubId, skipped: s.skipped, isAppAdmin: appAdmin,
    }));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.lime} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* 역할 미리보기(회장·총무·운영진·리드·회원으로 보기) 중에는 앱 관리자 기능을 모두 숨긴다 —
            그 역할 사람에게는 [대회 등록]·[지금 찾기] 같은 버튼이 없다. 미리보기 전환 줄만
            진짜 값(realAppAdmin)을 써서 "내 역할"로 되돌아올 수 있게 한다. */}
        <AppCtx.Provider value={{
          ...session, isAppAdmin: !!session.isAppAdmin && !viewMode, realAppAdmin: !!session.isAppAdmin,
          viewMode, setViewMode, venueId, setVenueId, switchClub, resetOnboarding, openOnboarding, markVerified,
        }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="verify" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="join" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AppCtx.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
