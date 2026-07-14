import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { trpc } from "../lib/trpc";

// 네이티브 앱(Capacitor)에서 소셜/Apple 로그인 후 서버가 딥링크
// (예: budgetapp://auth-success)로 돌려보내면, 이 리스너가 그 복귀를 감지해
// 로그인 상태를 다시 조회한다. 웹에서는 아무 일도 하지 않는다.
export function AppUrlListener() {
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener("appUrlOpen", (event) => {
      // 어떤 딥링크로 돌아오든 세션이 바뀌었을 수 있으니 로그인 상태를 갱신.
      if (event.url.includes("auth")) {
        utils.budget.me.invalidate();
      }
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [utils]);

  return null;
}
