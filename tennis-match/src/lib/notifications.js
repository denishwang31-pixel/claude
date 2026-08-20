/* ============================================================
   푸시 알림 (클라이언트)
   - Expo push token 수집 → members/{uid}.pushToken 저장
   - 발송은 Cloud Functions(functions/index.js)가 Expo Push API 로 수행

   왜 실패 사유를 돌려주는가
     예전에는 어디서 막히든 그냥 null 을 돌려주고 console.warn 만 남겼다.
     그런데 스토어/APK 로 설치한 앱에서는 그 로그를 볼 방법이 없다.
     그래서 "알림이 안 와요"를 마주해도 원인이 권한인지, 토큰 발급인지,
     저장 권한인지 알 수가 없었다. 실제로 그 상태로 몇 주가 흘렀다.

     이제는 { ok, reason, detail, token } 을 돌려주고, [더보기]의 알림 상태
     화면이 그걸 그대로 보여 준다. 화면에서 바로 원인을 읽을 수 있다.
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

/** 막힌 자리마다 이름을 붙인다. 화면이 이 값을 보고 안내 문구를 고른다. */
export const PUSH_FAIL = {
  SIMULATOR: 'simulator',       // 에뮬레이터·시뮬레이터
  PERMISSION: 'permission',     // 사용자가 알림 권한을 거부
  NO_PROJECT_ID: 'noProjectId', // app.json 의 extra.eas.projectId 없음
  TOKEN: 'token',               // 토큰 발급 실패 — 안드로이드는 대개 FCM 미설정
  SAVE: 'save',                 // 토큰은 받았는데 Firestore 저장 실패
  NO_CLUB: 'noClub',            // 아직 클럽이 없다(둘러보기 중)
};

export const PUSH_FAIL_LABEL = {
  [PUSH_FAIL.SIMULATOR]: '에뮬레이터에서는 푸시를 받을 수 없습니다. 실제 기기로 확인하세요.',
  [PUSH_FAIL.PERMISSION]: '알림 권한이 거부되어 있습니다. 휴대폰 설정 → 앱 → 알림에서 켜 주세요.',
  [PUSH_FAIL.NO_PROJECT_ID]: 'app.json 에 extra.eas.projectId 가 없습니다. `eas init` 실행이 필요합니다.',
  [PUSH_FAIL.TOKEN]:
    '푸시 토큰을 받지 못했습니다. 안드로이드는 FCM 설정(google-services.json)이 '
    + '있어야 토큰이 나옵니다. 아래 자세한 내용을 확인하세요.',
  [PUSH_FAIL.SAVE]: '토큰은 받았지만 저장에 실패했습니다. 로그인 상태와 클럽 소속을 확인하세요.',
  [PUSH_FAIL.NO_CLUB]: '클럽에 속해야 알림을 받을 수 있습니다.',
};

/**
 * 권한 요청 → 토큰 발급 → Firestore 저장.
 * 실패해도 앱 흐름은 막지 않는다. 대신 어디서 막혔는지 돌려준다.
 *
 * @returns {{ok: boolean, reason?: string, detail?: string, token?: string}}
 */
export async function registerPushToken(clubId, uid) {
  if (!Device.isDevice) return { ok: false, reason: PUSH_FAIL.SIMULATOR };

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: '클럽 알림',
        importance: Notifications.AndroidImportance.HIGH,
      });
    } catch (e) { /* 채널 생성 실패는 치명적이지 않다 — 계속 진행 */ }
  }

  /* 1) 권한 */
  let granted;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    granted = status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status;
    }
  } catch (e) {
    return { ok: false, reason: PUSH_FAIL.PERMISSION, detail: e?.message || String(e) };
  }
  if (granted !== 'granted') {
    return { ok: false, reason: PUSH_FAIL.PERMISSION, detail: `권한 상태: ${granted}` };
  }

  /* 2) 토큰 발급 */
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[알림] app.json 에 extra.eas.projectId 가 없습니다.');
    return { ok: false, reason: PUSH_FAIL.NO_PROJECT_ID };
  }

  let token;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    token = res?.data;
  } catch (e) {
    /* 안드로이드에서 여기 걸리는 이유는 거의 항상 FCM 미설정이다.
       이 앱은 Firebase "웹" SDK 를 쓰는데, 그건 네이티브 FirebaseApp 을
       초기화하지 않는다. expo-notifications 의 안드로이드 푸시는 네이티브
       FCM 을 쓰므로 google-services.json 이 빌드에 들어가 있어야 한다. */
    console.warn('[알림] 푸시 토큰 발급 실패:', e?.message || e);
    return { ok: false, reason: PUSH_FAIL.TOKEN, detail: e?.message || String(e) };
  }
  if (!token) return { ok: false, reason: PUSH_FAIL.TOKEN, detail: '토큰이 비어 있습니다' };

  /* 3) 저장 */
  if (!clubId || !uid) return { ok: false, reason: PUSH_FAIL.NO_CLUB, token };
  try {
    await savePushToken(clubId, uid, token);
  } catch (e) {
    console.warn('[알림] 푸시 토큰 저장 실패:', e?.message || e);
    return { ok: false, reason: PUSH_FAIL.SAVE, detail: e?.message || String(e), token };
  }

  return { ok: true, token };
}

/** 지금 권한이 어떤 상태인지만 (요청 창을 띄우지 않는다) */
export async function pushPermissionStatus() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch (e) {
    return 'unknown';
  }
}
