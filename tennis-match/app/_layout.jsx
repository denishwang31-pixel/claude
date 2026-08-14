/* 루트 레이아웃 — Firebase Auth 연동 + 라우팅 가드
   + 운영진/회원 "보기 모드" 전환(테스트·체험용) */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { subAuth, getMyClubId } from '../src/lib/auth';
import { C } from '../src/lib/theme';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function RootLayout() {
  const [session, setSession] = useState({ uid: null, clubId: null, me: null });
  const [loading, setLoading] = useState(true);
  /** 보기 모드: null = 실제 역할 그대로 / 'staff' = 운영진처럼 / 'member' = 일반 회원처럼
   *  (운영진이 회원 화면을 확인하거나, 테스트할 때 사용) */
  const [viewMode, setViewMode] = useState(null);
  const router = useRouter();
  const segments = useSegments();

  // 인증 상태 구독 → uid, 소속 clubId 해석
  useEffect(() => {
    const unsub = subAuth(async (uid) => {
      if (!uid) { setSession({ uid: null, clubId: null, me: null }); setLoading(false); return; }
      const clubId = await getMyClubId(uid);
      setSession({ uid, clubId, me: uid }); // me(memberId) = uid
      setLoading(false);
    });
    return unsub;
  }, []);

  // 라우팅 가드
  useEffect(() => {
    if (loading) return;
    const inAuthFlow = segments[0] === 'login' || segments[0] === 'onboarding';
    if (!session.uid && segments[0] !== 'login') router.replace('/login');
    else if (session.uid && !session.clubId && segments[0] !== 'onboarding') router.replace('/onboarding');
    else if (session.uid && session.clubId && inAuthFlow) router.replace('/(tabs)');
  }, [loading, session, segments]);

  /** 클럽을 새로 만들거나 옮길 때 호출 */
  const switchClub = (clubId) => setSession((s) => ({ ...s, clubId }));

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
        <AppCtx.Provider value={{ ...session, viewMode, setViewMode, switchClub }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AppCtx.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
