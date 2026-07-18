import React from "react";

export interface HeaderTab {
  id: string;
  label: string;
}

interface Props {
  tabs: HeaderTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  showDashboardActions: boolean;
  onUploadToggle: () => void;
  onSmsOpen: () => void;
  ownerFilter: "" | "동현" | "혜진";
  onOwnerChange: (o: "" | "동현" | "혜진") => void;
  onDiagnostics: () => void;
  theme: string;
  onToggleTheme: () => void;
  lockOn: boolean;
  onToggleLock: () => void;
  onLogout: () => void;
}

const btn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-cream-200 text-cream-600 hover:bg-cream-100 transition-colors";

export function AppHeader(p: Props) {
  return (
    <header className="bg-white border-b border-cream-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <h1 className="font-serif text-xl font-bold text-cream-800">가계부 대시보드</h1>
        <div className="flex items-center gap-3">
          {p.showDashboardActions && (
            <>
              <button onClick={p.onUploadToggle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-cream-700 text-white hover:bg-cream-800 transition-colors">
                <span>+</span><span>데이터 업로드</span>
              </button>
              <button onClick={p.onSmsOpen} className={btn} title="결제 문자를 붙여넣어 빠르게 입력">
                <span>💬</span><span>문자 입력</span>
              </button>
            </>
          )}
          {/* 소유자 필터 (모든 화면에 적용) */}
          <div className="flex items-center rounded-lg border border-cream-200 overflow-hidden">
            {([["", "전체"], ["동현", "동현"], ["혜진", "혜진"]] as const).map(([val, label]) => (
              <button
                key={label}
                onClick={() => p.onOwnerChange(val as "" | "동현" | "혜진")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  p.ownerFilter === val ? "bg-cream-700 text-white" : "text-cream-500 hover:bg-cream-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={p.onDiagnostics} className={btn} title="시스템 진단 (속도/규칙 수 확인)">
            <span>🔧</span><span>진단</span>
          </button>
          <button
            onClick={p.onToggleTheme}
            className={btn}
            title="테마 전환"
            aria-label={p.theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"}
          >
            <span>{p.theme === "light" ? "🌙" : "☀️"}</span>
            <span>{p.theme === "light" ? "다크 모드" : "라이트 모드"}</span>
          </button>
          <button
            onClick={p.onToggleLock}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              p.lockOn ? "border-cream-700 bg-cream-700 text-white" : "border-cream-200 text-cream-600 hover:bg-cream-100"
            }`}
            title="앱 생체 잠금 (Face ID/지문) — 앱에서만 동작"
          >
            <span>{p.lockOn ? "🔒" : "🔓"}</span><span>잠금</span>
          </button>
          <button onClick={p.onLogout} className={btn} title="로그아웃">
            <span>로그아웃</span>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex gap-1 overflow-x-auto pb-0">
          {p.tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => p.onTabChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                p.activeTab === tab.id ? "border-cream-700 text-cream-800" : "border-transparent text-cream-500 hover:text-cream-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
