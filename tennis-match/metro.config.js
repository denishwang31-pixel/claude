/* ============================================================
   Metro 설정 — Expo SDK 54

   ⚠️ package.json "exports" 해석을 끈다(SDK 53 부터 기본으로 켜짐).
      Firebase JS SDK(10.x)는 이게 켜져 있으면 firebase/app 과 @firebase/auth 가
      서로 다른 사본(esm / cjs)으로 들어와 "Component auth has not been registered yet"
      으로 앱이 시작하자마자 죽거나, 로그인 유지(getReactNativePersistence)가 빠진다.
      SDK 51 때와 같은 방식(package.json 의 react-native 필드)으로 고른다.
   ⚠️ 2026-10-04 firebase 10 → 12 로 올림(Firestore 내부 고장 버그 — src/lib/crashReport.js 머리말).
      이 설정 그대로 번들을 만들어 확인했다: @firebase/app 사본 하나, 인증은 React Native 판
      (registerAuth "ReactNative", getReactNativePersistence 있음).
   ============================================================ */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
