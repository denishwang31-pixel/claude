import React, { useMemo } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW, formatYearMonth } from "../../lib/format";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";
import { TrendLineChart } from "../charts/TrendLineChart";

interface Props {
  includeTransfer: boolean;
  excludedCategories: string[];
}

export function MonthlySummaryTab({ includeTransfer, excludedCategories }: Props) {
  const { data: monthly, isLoading } = trpc.budget.getMonthlyStats.useQuery({
    includeTransfer,
    excludedCategories,
  });

  const { data: pivot } = trpc.budget.getPivotData.useQuery({
    includeTransfer,
    excludedCategories,
  });

  // Merge income/expense into bar chart data
  const barData = useMemo(() => {
    if (!monthly) return [];
    const map = new Map<string, { income: number; expense: number }>();
    for (const r of monthly) {
      if (!map.has(r.yearMonth)) map.set(r.yearMonth, { income: 0, expense: 0 });
      const entry = map.get(r.yearMonth)!;
      if (r.txType === "수입") entry.income = r.total;
      else entry.expense = r.total;
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([yearMonth, vals]) => ({ yearMonth, ...vals }));
  }, [monthly]);

  // Build trend chart data (top 5 categories by total)
  const { trendData, topCats } = useMemo(() => {
    if (!pivot) return { trendData: [], topCats: [] };

    const catTotals = new Map<string, number>();
    for (const r of pivot) {
      catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.total);
    }
    const topCats = Array.from(catTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([cat]) => cat);

    const monthMap = new Map<string, Record<string, number>>();
    for (const r of pivot) {
      if (!topCats.includes(r.category)) continue;
      if (!monthMap.has(r.yearMonth)) monthMap.set(r.yearMonth, {});
      monthMap.get(r.yearMonth)![r.category] = r.total;
    }

    const trendData = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([yearMonth, cats]) => ({ yearMonth, ...cats }));

    return { trendData, topCats };
  }, [pivot]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse h-40 bg-cream-100 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">월별 수입 / 지출</h3>
        <MonthlyBarChart data={barData} />
      </div>

      {/* Trend chart */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">주요 카테고리 트렌드</h3>
        <TrendLineChart data={trendData} categories={topCats} />
      </div>

      {/* Monthly summary table */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5 overflow-x-auto">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">월별 요약</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left px-4 py-2 text-cream-600 font-medium">월</th>
              <th className="text-right px-4 py-2 text-cream-600 font-medium">수입</th>
              <th className="text-right px-4 py-2 text-cream-600 font-medium">지출</th>
              <th className="text-right px-4 py-2 text-cream-600 font-medium">잔액</th>
            </tr>
          </thead>
          <tbody>
            {barData.map((row) => {
              const balance = row.income - row.expense;
              return (
                <tr key={row.yearMonth} className="border-b border-cream-100 hover:bg-cream-50">
                  <td className="px-4 py-2.5 font-medium text-cream-700">
                    {formatYearMonth(row.yearMonth)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                    {row.income ? formatKRW(row.income) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-500">
                    {row.expense ? formatKRW(row.expense) : "-"}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                      balance >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {formatKRW(balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
