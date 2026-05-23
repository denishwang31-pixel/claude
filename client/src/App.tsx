import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTRPCClient } from "./lib/trpc";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/Home";
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

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ErrorBoundary>
            <Home />
          </ErrorBoundary>
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
