import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/trpc",
        fetch(url, options) {
          // 서버/DB가 응답 없이 멈추는 경우(예: DB가 꺼져있고 방화벽이
          // 연결 시도를 그냥 흘려버리는 경우) 화면이 "처리 중..."에서
          // 영원히 멈추지 않도록 30초 후 자동으로 요청을 중단한다.
          const timeoutSignal = AbortSignal.timeout(30_000);
          const signal = options?.signal
            ? AbortSignal.any([options.signal, timeoutSignal])
            : timeoutSignal;
          return fetch(url, { ...options, signal, credentials: "include" });
        },
      }),
    ],
  });
}
