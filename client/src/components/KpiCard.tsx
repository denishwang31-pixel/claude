import React, { useState, useEffect, useRef } from "react";
import { cn } from "../lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: { value: number; label: string };
  className?: string;
  icon?: React.ReactNode;
  valueClass?: string;
  memo?: string;
  onMemoCommit?: (value: string) => void;
}

export function KpiCard({ title, value, subtitle, trend, className, icon, valueClass, memo, onMemoCommit }: KpiCardProps) {
  const [draft, setDraft] = useState(memo ?? "");
  const escaped = useRef(false);

  useEffect(() => { setDraft(memo ?? ""); }, [memo]);

  function commit() {
    if (escaped.current) { escaped.current = false; return; }
    const v = draft.trim();
    if (v !== (memo ?? "") && onMemoCommit) onMemoCommit(v);
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl p-5 shadow-sm border border-cream-200 flex flex-col gap-2",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-cream-600 font-medium">{title}</span>
        {icon && <span className="text-cream-400">{icon}</span>}
      </div>
      <div className={cn("text-2xl font-bold font-serif", valueClass ?? "text-cream-900")}>{value}</div>
      {subtitle && <div className="text-xs text-cream-500">{subtitle}</div>}
      {trend && (
        <div
          className={cn(
            "text-xs font-medium",
            trend.value >= 0 ? "text-red-500" : "text-emerald-600"
          )}
        >
          {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value).toFixed(1)}% {trend.label}
        </div>
      )}
      {onMemoCommit && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { escaped.current = true; setDraft(memo ?? ""); (e.target as HTMLTextAreaElement).blur(); }
          }}
          rows={2}
          placeholder="메모..."
          title="입력 후 바깥 클릭 시 저장 · Esc: 취소"
          className="mt-1 w-full resize-none rounded-lg border border-cream-100 bg-cream-50/50 px-2 py-1.5 text-xs text-cream-700 placeholder:text-cream-300 focus:outline-none focus:border-cream-300 focus:bg-white transition-colors"
        />
      )}
    </div>
  );
}
