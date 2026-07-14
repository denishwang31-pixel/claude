import React, { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { formatKRW } from "../lib/format";
import { categoryDisplay } from "../lib/categories";

type Period = "week" | "month";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 현재/직전 기간의 날짜 범위를 로컬 기준으로 계산 */
function ranges(period: Period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === "week") {
    const curEnd = new Date(today);
    const curStart = new Date(today); curStart.setDate(curStart.getDate() - 6);
    const prevEnd = new Date(curStart); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6);
    return { curStart: ymd(curStart), curEnd: ymd(curEnd), prevStart: ymd(prevStart), prevEnd: ymd(prevEnd) };
  }
  // month: 이번 달 1일~오늘 vs 지난 달 1일~같은 날짜(공정 비교)
  const curStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const curEnd = new Date(today);
  const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  return { curStart: ymd(curStart), curEnd: ymd(curEnd), prevStart: ymd(prevStart), prevEnd: ymd(prevEnd) };
}

export function ReportPanel() {
  const [period, setPeriod] = useState<Period>("week");
  const r = useMemo(() => ranges(period), [period]);
  const { data, isLoading } = trpc.budget.getReport.useQuery(r);

  const delta = useMemo(() => {
    if (!data || data.prevExpense <= 0) return null;
    return Math.round(((data.curExpense - data.prevExpense) / data.prevExpense) * 100);
  }, [data]);

  return (
    <div className="bg-white border border-cream-200 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-base font-bold text-cream-800">
          {period === "week" ? "주간" : "월간"} 리포트
        </h3>
        <div className="flex rounded-lg border border-cream-200 overflow-hidden text-sm">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 font-medium transition-colors ${
                period === p ? "bg-cream-700 text-white" : "text-cream-500 hover:bg-cream-100"
              }`}
            >
              {p === "week" ? "이번 주" : "이번 달"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-cream-400 text-sm">불러오는 중…</p>
      ) : !data ? (
        <p className="text-cream-400 text-sm">데이터가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-cream-500">지출</div>
            <div className="text-2xl font-bold text-cream-800">{formatKRW(data.curExpense)}</div>
            {delta !== null && (
              <div className={`text-xs mt-0.5 font-medium ${delta > 0 ? "text-red-500" : "text-emerald-600"}`}>
                {delta > 0 ? "▲" : "▼"} 지난 {period === "week" ? "주" : "달"} 대비 {Math.abs(delta)}%
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-cream-500">수입</div>
            <div className="text-2xl font-bold text-cream-800">{formatKRW(data.curIncome)}</div>
          </div>
          <div>
            <div className="text-xs text-cream-500">주요 지출</div>
            <div className="mt-1 space-y-0.5">
              {data.topCategories.length === 0 ? (
                <span className="text-sm text-cream-400">없음</span>
              ) : (
                data.topCategories.slice(0, 3).map((c) => (
                  <div key={c.category} className="flex justify-between text-xs">
                    <span className="text-cream-600">{categoryDisplay(c.category)}</span>
                    <span className="text-cream-800 font-medium">{formatKRW(c.total)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
