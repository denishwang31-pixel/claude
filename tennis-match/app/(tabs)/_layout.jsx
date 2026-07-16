/* 5탭 네비게이션 (expo-router Tabs) */
import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { C } from '../../src/lib/theme';

const icon = (emoji) => ({ color }) => (
  <Text style={{ fontSize: 18, opacity: color === C.green ? 1 : 0.5 }}>{emoji}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.faint,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="schedule" options={{ title: '일정', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="match" options={{ title: '대진', tabBarIcon: icon('🎾') }} />
      <Tabs.Screen name="rank" options={{ title: '랭킹', tabBarIcon: icon('🏆') }} />
      <Tabs.Screen name="more" options={{ title: '더보기', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
