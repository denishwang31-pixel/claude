import React, { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW, formatYearMonth, getCategoryColor } from "../../lib/format";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";
import { TrendLineChart } from "../charts/TrendLineChart";
import { CategoryDetailModal } from "../CategoryDetailModal";
import { cn } from "../../lib/utils";

interface Props {
  includeTransfer: boolean;
  excludedCategories: string[];
}

export function MonthlySummaryTab({ includeTransfer, excludedCategories }: Props) {
  const [selectedYearMonth, setSelectedYearMonth] = useState<string | null>(null);
  const [detailCategory, setDetailCategory] = useState<string | null>(null);

  const { data: monthly, isLoading } = trpc.budget.getMonthlyStats.useQuery({
    includeTransfer,
    excludedCategories,
  });

  const { data: pivot } = trpc.budget.getPivotData.useQuery({
    includeTransfer,
    excludedCategories,
  });

  const { data: monthCatStats, isLoading: loadingCatStats } = trpc.budget.getCategoryStats.useQuery(
    { includeTransfer, excludedCategories, yearMonth: selectedYearMonth! },
    { enabled: !!selectedYearMonth }
  );

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

  // Build trend chart data (top 6 categories by total)
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
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-1">월별 요약</h3>
        <p className="text-xs text-cream-400 mb-4">월을 클릭하면 해당 월의 카테고리별 내역을 볼 수 있습니다.</p>
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
              const isSelected = selectedYearMonth === row.yearMonth;
              return (
                <tr
                  key={row.yearMonth}
                  onClick={() => setSelectedYearMonth(isSelected ? null : row.yearMonth)}
                  className={cn(
                    "border-b border-cream-100 cursor-pointer transition-colors",
                    isSelected
                      ? "bg-cream-100 hover:bg-cream-100"
                      : "hover:bg-cream-50"
                  )}
                >
                  <td className="px-4 py-2.5 font-medium text-cream-700 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-xs transition-transform",
                        isSelected ? "rotate-90" : ""
                      )}
                    >
                      ▶
                    </span>
                    {formatYearMonth(row.yearMonth)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                    {row.income ? formatKRW(row.income) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-500">
                    {row.expense ? formatKRW(row.expense) : "-"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums font-semibold",
                      balance >= 0 ? "text-emerald-600" : "text-red-500"
                    )}
                  >
                    {formatKRW(balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Monthly category breakdown */}
      {selectedYearMonth && (
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-1">
            {formatYearMonth(selectedYearMonth)} · 카테고리별 지출
          </h3>
          <p className="text-xs text-cream-400 mb-4">카테고리를 클릭하면 상세 내역을 볼 수 있습니다.</p>

          {loadingCatStats ? (
            <div className="flex items-center justify-center h-24 text-cream-400">불러오는 중...</div>
          ) : !monthCatStats?.length ? (
            <div className="flex items-center justify-center h-24 text-cream-400">내역이 없습니다.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  <th className="text-left px-4 py-2 text-cream-600 font-medium">카테고리</th>
                  <th className="text-right px-4 py-2 text-cream-600 font-medium">건수</th>
                  <th className="text-right px-4 py-2 text-cream-600 font-medium">합계</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {monthCatStats.map((cat, i) => (
                  <tr
                    key={cat.category}
                    onClick={() => setDetailCategory(cat.category)}
                    className="border-b border-cream-100 hover:bg-cream-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getCategoryColor(cat.category, i) }}
                      />
                      <span className="text-cream-800">{cat.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-cream-500">
                      {cat.count}건
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-cream-800">
                      {formatKRW(cat.total)}
                    </td>
                    <td className="px-4 py-2.5 text-cream-400 text-xs text-right">상세 →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Category detail modal */}
      {detailCategory && (
        <CategoryDetailModal
          category={detailCategory}
          yearMonth={selectedYearMonth ?? undefined}
          onClose={() => setDetailCategory(null)}
        />
      )}
    </div>
  );
}
