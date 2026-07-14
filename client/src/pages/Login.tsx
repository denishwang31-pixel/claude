import React, { useState } from "react";
import { trpc, apiUrl } from "../lib/trpc";
import { toast } from "sonner";

type Mode = "login" | "register";

const SOCIALS: { id: string; label: string; bg: string; fg: string }[] = [
  { id: "kakao",  label: "카카오로 계속하기", bg: "#FEE500", fg: "#191600" },
  { id: "naver",  label: "네이버로 계속하기", bg: "#03C75A", fg: "#ffffff" },
  { id: "google", label: "Google로 계속하기", bg: "#ffffff", fg: "#1f1f1f" },
];

export default function Login() {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/auth/${mode}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          mode === "register" ? { email, password, name } : { email, password }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "요청에 실패했습니다.");
        return;
      }
      // 세션이 생겼으니 로그인 상태를 다시 조회 → 앱 화면으로 전환
      await utils.budget.me.invalidate();
    } catch {
      toast.error("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  function social(id: string) {
    // 소셜 로그인은 서버가 제공자로 리다이렉트하므로 전체 페이지 이동으로 처리
    window.location.href = apiUrl(`/auth/${id}`);
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-cream-200 p-7">
        <div className="text-center mb-6">
          <h1 className="font-serif text-2xl font-bold text-cream-800">우리집 가계부</h1>
          <p className="text-sm text-cream-500 mt-1">
            {mode === "login" ? "로그인하고 시작하세요" : "새 계정을 만드세요"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="이름 (선택)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-cream-200 text-sm focus:outline-none focus:ring-2 focus:ring-cream-400"
            />
          )}
          <input
            type="email"
            required
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full px-3 py-2.5 rounded-lg border border-cream-200 text-sm focus:outline-none focus:ring-2 focus:ring-cream-400"
          />
          <input
            type="password"
            required
            placeholder={mode === "register" ? "비밀번호 (8자 이상)" : "비밀번호"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="w-full px-3 py-2.5 rounded-lg border border-cream-200 text-sm focus:outline-none focus:ring-2 focus:ring-cream-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-cream-700 text-white text-sm font-semibold hover:bg-cream-800 transition-colors disabled:opacity-60"
          >
            {loading ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        <div className="text-center mt-3">
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-sm text-cream-600 hover:text-cream-800 underline underline-offset-2"
          >
            {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
          </button>
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-cream-200" />
          <span className="text-xs text-cream-400">또는</span>
          <div className="flex-1 h-px bg-cream-200" />
        </div>

        <div className="space-y-2">
          {SOCIALS.map((s) => (
            <button
              key={s.id}
              onClick={() => social(s.id)}
              style={{ backgroundColor: s.bg, color: s.fg }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold border border-cream-200 hover:brightness-95 transition"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
