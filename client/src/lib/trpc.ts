import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

// 앱(Capacitor)에서는 화면이 capacitor://localhost(앱 내부)에서 열리므로 상대경로
// "/trpc"가 서버로 가지 못한다. 앱 빌드 시 VITE_API_URL 로 서버 절대주소를 주입한다.
// (웹/개발 빌드에서는 비워두면 기존처럼 상대경로 + vite 프록시로 그대로 동작한다.)
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** 인증 등 tRPC 외 엔드포인트(/auth/*)용 절대 URL 헬퍼 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : "/" + path}`;
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: apiUrl("/trpc"),
        fetch(url, options) {
          // 서버/DB가 응답 없이 멈추는 경우(예: DB가 꺼져있고 방화벽이
          // 연결 시도를 그냥 흘려버리는 경우) 화면이 "처리 중..."에서
          // 영원히 멈추지 않도록 60초 후 자동으로 요청을 중단한다.
          const timeoutSignal = AbortSignal.timeout(60_000);
          const signal = options?.signal
            ? AbortSignal.any([options.signal, timeoutSignal])
            : timeoutSignal;
          return fetch(url, { ...options, signal, credentials: "include" });
        },
      }),
    ],
  });
}
