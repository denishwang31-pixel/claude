/* 하단 탭 네비게이션 + 푸시 토큰 등록(PHASE 3)
   탭: 홈 · 일정 · 대진 · 용품 · 원포인트 · 더보기 (랭킹은 더보기 안으로) */
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useApp } from '../_layout';
import { registerPushToken } from '../../src/lib/notifications';
import { C } from '../../src/lib/theme';

const icon = (emoji) => ({ focused }) => (
  <Text style={{ fontSize: 17, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
);

export default function TabsLayout() {
  const { clubId, me } = useApp() || {};

  // 로그인+클럽 확정 후 1회 푸시 토큰 등록
  useEffect(() => {
    if (clubId && me) registerPushToken(clubId, me);
  }, [clubId, me]);

  return (
    <Tabs
      /* 안드로이드 뒤로가기: 마지막에 있던 탭으로 되돌아간다.
         (기본값 firstRoute 는 어느 탭에 있든 홈으로만 가서 되돌아가기가 끊긴다) */
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.faint,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="schedule" options={{ title: '일정', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="match" options={{ title: '대진', tabBarIcon: icon('🎾') }} />
      <Tabs.Screen name="gear" options={{ title: '용품', tabBarIcon: icon('🛍') }} />
      <Tabs.Screen name="tips" options={{ title: '원포인트', tabBarIcon: icon('🎯') }} />
      <Tabs.Screen name="more" options={{ title: '더보기', tabBarIcon: icon('☰') }} />
      {/* 랭킹은 더보기 메뉴에서 진입 (하단 탭 과밀 방지) */}
      <Tabs.Screen name="rank" options={{ href: null }} />
    </Tabs>
  );
}
