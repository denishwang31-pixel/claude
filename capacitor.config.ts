import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor 설정. `npx cap add ios/android` 및 `npx cap sync`가 이 파일을 읽는다.
// appId(번들 ID)는 전 세계 유일해야 하며 스토어 등록 후에는 변경 불가하므로 신중히 정한다.
const config: CapacitorConfig = {
  appId: "com.yourname.budget", // TODO: 본인 소유 도메인/깃헙 기준으로 변경 (예: io.github.<id>.budget)
  appName: "우리집 가계부",
  webDir: "dist/public", // vite.config.ts 의 build.outDir 와 일치
  server: {
    // 안드로이드에서 앱 출처를 https 로 두어 secure 쿠키/혼합콘텐츠 문제를 줄인다.
    androidScheme: "https",
  },
  ios: {
    // 스크롤 시 상단/하단 여백 튐 방지 (선택)
    contentInset: "always",
  },
};

export default config;
