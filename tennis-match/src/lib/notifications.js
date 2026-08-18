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

    /* projectId 가 없으면 토큰 발급 자체가 안 된다.
       app.json 의 extra.eas.projectId 는 `eas init` / `eas update:configure`
       가 넣어 준다. 없으면 아래 호출이 예외를 던지고, 그러면 이 앱의 알림이
       전부 조용히 죽는다 — 회비 독촉도, 참석 투표 요청도, 교류전 초대도.
       서버는 멀쩡히 보내는데 받을 토큰이 저장되지 않아 아무도 못 받는다. */
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        '[알림] app.json 에 extra.eas.projectId 가 없습니다. 푸시 토큰을 받지 못하면 '
        + '모든 알림이 발송되지 않습니다. `eas init` 또는 `eas update:configure` 실행 필요.',
      );
    }
    const tokenRes = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenRes.data;

    if (token && clubId && uid) await savePushToken(clubId, uid, token);
    return token;
  } catch (e) {
    /* 알림 실패가 앱 흐름을 막아서는 안 된다. 다만 조용히 삼키면
       "알림이 안 와요"를 몇 주 뒤에 원인 없이 마주하게 된다. */
    console.warn('[알림] 푸시 토큰 등록 실패:', e?.message || e);
    return null;
  }
}
