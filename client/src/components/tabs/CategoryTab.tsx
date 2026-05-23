import React, { useState } from "react";

interface CatRow { category: string; total: number; count: number }
import { trpc } from "../../lib/trpc";
import { formatKRW, formatYearMonth } from "../../lib/format";
import { CategoryPieChart } from "../charts/CategoryPieChart";
import { CategoryDetailModal } from "../CategoryDetailModal";
import { SavingsSection } from "../SavingsSection";

interface Props {
  includeTransfer: boolean;
  excludedCategories: string[];
}

export function CategoryTab({ includeTransfer, excludedCategories }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: catStats, isLoading, error } = trpc.budget.getCategoryStats.useQuery({
    includeTransfer,
    excludedCategories,
  });

  const { data: pivotData } = trpc.budget.getPivotData.useQuery({
    includeTransfer,
    excludedCategories,
  });

  // Build pivot table: { category → { yearMonth → total } }
  const pivotMap = new Map<string, Map<string, number>>();
  const allMonths = new Set<string>();
  for (const row of pivotData ?? []) {
    allMonths.add(row.yearMonth);
    if (!pivotMap.has(row.category)) pivotMap.set(row.category, new Map());
    pivotMap.get(row.category)!.set(row.yearMonth, row.total);
  }
  const months = Array.from(allMonths).sort();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-20 bg-cream-100 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-400 gap-3">
        <span className="text-4xl">⚠️</span>
        <p className="font-medium">카테고리 데이터 오류</p>
        <p className="text-sm text-red-300">{error.message}</p>
      </div>
    );
  }

  if (!catStats?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-cream-400 gap-3">
        <span className="text-4xl">📂</span>
        <p>카테고리 데이터가 없습니다.</p>
        <p className="text-sm">엑셀 파일을 업로드하면 카테고리별 분석이 표시됩니다.</p>
      </div>
    );
  }

  const rows = catStats as CatRow[];
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      {/* Pie + Table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">카테고리 비율</h3>
          <CategoryPieChart data={catStats} />
        </div>

        {/* Category table */}
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">카테고리별 합계</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {rows.map((row) => {
              const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
              return (
                <button
                  key={row.category}
                  onClick={() => setSelectedCategory(row.category)}
                  className="w-full text-left hover:bg-cream-50 rounded-lg px-2 py-1.5 transition-colors group"
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-cream-700 group-hover:text-cream-900 font-medium">
                      {row.category}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-cream-400 text-xs">{row.count}건</span>
                      <span className="font-semibold tabular-nums text-cream-800">
                        {formatKRW(row.total)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-cream-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cream-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Savings section */}
      <SavingsSection />

      {/* Pivot table */}
      {months.length > 0 && (
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5 overflow-x-auto">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">월별 × 카테고리 피벗</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-cream-50">
                <th className="text-left px-3 py-2 text-cream-600 font-medium sticky left-0 bg-cream-50 z-10 border-b border-cream-200">
                  카테고리
                </th>
                {months.map((m) => (
                  <th key={m} className="text-right px-3 py-2 text-cream-600 font-medium whitespace-nowrap border-b border-cream-200">
                    {formatYearMonth(m)}
                  </th>
                ))}
                <th className="text-right px-3 py-2 text-cream-600 font-medium border-b border-cream-200">합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const monthMap = pivotMap.get(row.category);
                return (
                  <tr key={row.category} className="border-b border-cream-100 hover:bg-cream-50">
                    <td className="px-3 py-2 font-medium text-cream-700 sticky left-0 bg-white z-10">
                      <button
                        onClick={() => setSelectedCategory(row.category)}
                        className="hover:underline"
                      >
                        {row.category}
                      </button>
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-3 py-2 text-right tabular-nums text-cream-600">
                        {monthMap?.get(m) ? formatKRW(monthMap.get(m)!) : "-"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-cream-800">
                      {formatKRW(row.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selectedCategory && (
        <CategoryDetailModal
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
        />
      )}
    </div>
  );
}
