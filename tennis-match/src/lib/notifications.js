/* ============================================================
   PHASE 3 — 푸시 알림 (클라이언트)
   - Expo push token 수집 → members/{uid}.pushToken 저장
   - 발송은 Cloud Functions(functions/index.js)가 Expo Push API 로 수행
   ⚠️ SDK 53+ Expo Go(안드로이드)는 원격 푸시 미지원 → dev build 필요
   ============================================================ */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { savePushToken } from './firestore';

// 포그라운드 수신 시에도 배너 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

/** 권한 요청 → 토큰 발급 → Firestore 저장. 실패해도 앱 흐름은 막지 않음 */
export async function registerPushToken(clubId, uid) {
  try {
    if (!Device.isDevice) return null; // 시뮬레이터는 푸시 불가

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '클럽 알림',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { status } = await Notifications.getPermissionsAsync();
    let final = status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      final = req.status;
    }
    if (final !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenRes = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenRes.data;

    if (token && clubId && uid) await savePushToken(clubId, uid, token);
    return token;
  } catch (e) {
    return null; // 알림 실패는 치명적이지 않음
  }
}
