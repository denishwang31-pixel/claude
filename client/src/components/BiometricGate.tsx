import React, { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

const LOCK_KEY = "biometricLock";
export function isBiometricLockEnabled(): boolean {
  return localStorage.getItem(LOCK_KEY) === "on";
}
export function setBiometricLockEnabled(on: boolean) {
  localStorage.setItem(LOCK_KEY, on ? "on" : "off");
}

/** 네이티브 앱에서 생체 인증(Face ID/지문)으로 앱을 잠근다.
 *  웹이거나 설정이 꺼져 있으면 그대로 통과한다. */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const native = Capacitor.isNativePlatform();
  const [locked, setLocked] = useState(native && isBiometricLockEnabled());
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    if (!native || !isBiometricLockEnabled()) {
      setLocked(false);
      return;
    }
    try {
      const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
      await BiometricAuth.authenticate({
        reason: "가계부 잠금 해제",
        cancelTitle: "취소",
        allowDeviceCredential: true, // 생체 실패 시 기기 PIN 허용
        iosFallbackTitle: "비밀번호 사용",
        androidTitle: "가계부 잠금",
        androidSubtitle: "생체 인증으로 잠금을 해제하세요",
      });
      setError(null);
      setLocked(false);
    } catch {
      setError("인증에 실패했습니다. 다시 시도해주세요.");
      setLocked(true);
    }
  }, [native]);

  // 최초 진입 시 인증 시도
  useEffect(() => {
    if (locked) void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 앱이 백그라운드 → 포그라운드로 돌아오면 다시 잠근다
  useEffect(() => {
    if (!native) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive && isBiometricLockEnabled()) {
          setLocked(true);
          void unlock();
        }
      });
      remove = () => handle.remove();
    })();
    return () => remove?.();
  }, [native, unlock]);

  if (!locked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center gap-4 px-6">
      <div className="text-5xl">🔒</div>
      <p className="text-cream-700 font-semibold">가계부가 잠겨 있습니다</p>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        onClick={() => void unlock()}
        className="px-5 py-2.5 rounded-lg bg-cream-700 text-white text-sm font-semibold hover:bg-cream-800"
      >
        잠금 해제
      </button>
    </div>
  );
}
