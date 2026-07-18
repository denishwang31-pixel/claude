import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTRPCClient } from "./lib/trpc";
import { enableScreenPrivacy } from "./lib/nativeSecurity";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthGate } from "./components/AuthGate";
import { AppUrlListener } from "./components/AppUrlListener";
import { BiometricGate } from "./components/BiometricGate";
import { Toaster } from "sonner";

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
      },
    },
  }));
  const [trpcClient] = useState(() => createTRPCClient());

  // 네이티브 앱 화면 보안(전환기 블러 / FLAG_SECURE) 활성화
  useEffect(() => { void enableScreenPrivacy(); }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ErrorBoundary>
            <AppUrlListener />
            <BiometricGate>
              <AuthGate />
            </BiometricGate>
          </ErrorBoundary>
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
