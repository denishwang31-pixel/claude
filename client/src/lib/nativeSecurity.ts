import { Capacitor } from "@capacitor/core";

// 네이티브 앱에서 화면 보안을 켠다:
//  - 앱 전환기(최근 앱) 미리보기 블러
//  - Android: FLAG_SECURE 로 스크린샷/화면녹화 차단
// 웹에서는 아무 것도 하지 않는다.
export async function enableScreenPrivacy(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PrivacyScreen } = await import("@capacitor-community/privacy-screen");
    await PrivacyScreen.enable();
  } catch {
    // 플러그인 미탑재/실패해도 앱 동작에는 영향 없음
  }
}
