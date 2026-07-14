import React from "react";
import { trpc } from "../lib/trpc";
import Home from "../pages/Home";
import Login from "../pages/Login";

/** 로그인 여부에 따라 로그인 화면 / 앱 화면을 전환한다. */
export function AuthGate() {
  const { data: user, isLoading } = trpc.budget.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <p className="text-cream-500 text-sm">불러오는 중…</p>
      </div>
    );
  }

  if (!user) return <Login />;
  return <Home />;
}
