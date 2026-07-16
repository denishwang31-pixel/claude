/* 루트 레이아웃 — 실제 Firebase Auth 연동 (PHASE 2).
   로그인 상태·소속 clubId 에 따라 로그인/온보딩/탭으로 라우팅. */
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
        <AppCtx.Provider value={session}>
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
