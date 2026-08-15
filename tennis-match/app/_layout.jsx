/* 루트 레이아웃 — Firebase Auth 연동 + 라우팅 가드
   + 운영진/리드/회원 "보기 모드" 전환(테스트·체험용)

   라우팅 규칙
     로그인 안 됨                  → /login
     로그인됨 + 클럽 있음          → /(tabs)
     로그인됨 + 클럽 없음          → /onboarding
       단, "나중에 하기"를 누른 사용자는 클럽 없이도 /(tabs) 로 들어간다.
     초대 링크(tennismatch://join?code=…) → /join 이 코드를 받아 처리 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { subAuth, getMySession } from '../src/lib/auth';
import { checkAppAdmin } from '../src/lib/firestore';
import { C } from '../src/lib/theme';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const EMPTY = { uid: null, clubId: null, me: null, isAppAdmin: false, skipped: false, pendingClubId: null };

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
  const router = useRouter();
  const segments = useSegments();

  // 인증 상태 구독 → uid, 소속 clubId 해석
  useEffect(() => {
    const unsub = subAuth(async (uid) => {
      if (!uid) { setSession(EMPTY); setLoading(false); return; }
      const [s, appAdmin] = await Promise.all([getMySession(uid), checkAppAdmin(uid)]);
      setSession({
        uid, me: uid, // me(memberId) = uid
        clubId: s.clubId,
        pendingClubId: s.pendingClubId,
        skipped: s.skipped,
        isAppAdmin: appAdmin,
      });
      setLoading(false);
    });
    return unsub;
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
    // 클럽이 없고, 둘러보기도 선택하지 않았으면 온보딩으로
    if (!session.clubId && !session.skipped) {
      if (root !== 'onboarding') router.replace('/onboarding');
      return;
    }
    if (inAuthFlow) router.replace('/(tabs)');
  }, [loading, session, segments]);

  /** 클럽을 새로 만들거나 옮길 때 호출 */
  /* 클럽을 바꾸면 코트 선택도 초기화 — 다른 클럽의 코트장 id 가 남으면 안 된다 */
  const switchClub = (clubId) => {
    setVenueId(null);
    setSession((s) => ({ ...s, clubId, skipped: false, pendingClubId: null }));
  };
  /** 온보딩을 다시 밟게 한다(클럽 찾기/만들기 재진입) */
  const resetOnboarding = () => setSession((s) => ({ ...s, skipped: false }));

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
        <AppCtx.Provider value={{ ...session, viewMode, setViewMode, venueId, setVenueId, switchClub, resetOnboarding }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="join" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AppCtx.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
