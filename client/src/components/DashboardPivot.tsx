import React, { useMemo } from "react";
import { formatKRW, formatYearMonth } from "../lib/format";
import { cn } from "../lib/utils";

type PivotRow = { yearMonth: string; category: string; l1: "income" | "savings" | "expense"; total: number };

interface Props {
  pivotData: PivotRow[];
}

const L1_ORDER = ["income", "savings", "expense"] as const;
const L1_LABEL: Record<string, string> = { income: "수입", savings: "저축/투자", expense: "지출" };
const L1_COLOR: Record<string, string> = {
  income:  "text-gray-900 font-semibold",
  savings: "text-blue-600 font-semibold",
  expense: "text-red-500 font-semibold",
};
const L1_BG: Record<string, string> = {
  income:  "bg-gray-50",
  savings: "bg-blue-50",
  expense: "bg-red-50",
};

export function DashboardPivot({ pivotData }: Props) {
  const months = useMemo(() =>
    [...new Set(pivotData.map((r) => r.yearMonth))].sort(), [pivotData]);

  const { totals, categoryMap } = useMemo(() => {
    // totals per l1 per month
    const totals: Record<string, Record<string, number>> = {};
    // category → month → total
    const categoryMap: Record<string, { l1: string; byMonth: Record<string, number>; total: number }> = {};

    for (const r of pivotData) {
      if (!totals[r.l1]) totals[r.l1] = {};
      totals[r.l1][r.yearMonth] = (totals[r.l1][r.yearMonth] ?? 0) + r.total;

      if (!categoryMap[r.category]) categoryMap[r.category] = { l1: r.l1, byMonth: {}, total: 0 };
      categoryMap[r.category].byMonth[r.yearMonth] = (categoryMap[r.category].byMonth[r.yearMonth] ?? 0) + r.total;
      categoryMap[r.category].total += r.total;
    }
    return { totals, categoryMap };
  }, [pivotData]);

  // Group categories by l1, sorted by total desc
  const byL1 = useMemo(() => {
    const groups: Record<string, { category: string; byMonth: Record<string, number>; total: number }[]> = {};
    for (const [cat, data] of Object.entries(categoryMap)) {
      if (!groups[data.l1]) groups[data.l1] = [];
      groups[data.l1].push({ category: cat, byMonth: data.byMonth, total: data.total });
    }
    for (const l1 of Object.keys(groups)) {
      groups[l1].sort((a, b) => b.total - a.total);
    }
    return groups;
  }, [categoryMap]);

  if (!months.length) return null;

  const colWidth = `${Math.max(80, Math.floor(500 / months.length))}px`;

  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-cream-100">
        <h3 className="font-serif text-base font-semibold text-cream-700">월별 카테고리 현황</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left px-4 py-2.5 text-cream-600 font-medium sticky left-0 bg-cream-50 z-10 min-w-[130px]">항목</th>
              {months.map((m) => (
                <th key={m} className="text-right px-3 py-2.5 text-cream-600 font-medium whitespace-nowrap" style={{ minWidth: colWidth }}>
                  {formatYearMonth(m)}
                </th>
              ))}
              <th className="text-right px-4 py-2.5 text-cream-600 font-medium whitespace-nowrap">합계</th>
            </tr>
          </thead>
          <tbody>
            {L1_ORDER.map((l1) => {
              const l1Total = months.reduce((s, m) => s + (totals[l1]?.[m] ?? 0), 0);
              const cats = byL1[l1] ?? [];
              if (!l1Total && !cats.length) return null;
              return (
                <React.Fragment key={l1}>
                  {/* L1 summary row */}
                  <tr className={cn("border-b border-cream-100", L1_BG[l1])}>
                    <td className={cn("px-4 py-2 sticky left-0 z-10", L1_BG[l1], L1_COLOR[l1])}>
                      {L1_LABEL[l1]} 합계
                    </td>
                    {months.map((m) => (
                      <td key={m} className={cn("px-3 py-2 text-right tabular-nums", L1_COLOR[l1])}>
                        {totals[l1]?.[m] ? formatKRW(totals[l1][m]) : "-"}
                      </td>
                    ))}
                    <td className={cn("px-4 py-2 text-right tabular-nums", L1_COLOR[l1])}>
                      {formatKRW(l1Total)}
                    </td>
                  </tr>
                  {/* L2 category rows */}
                  {cats.map((cat) => (
                    <tr key={cat.category} className="border-b border-cream-50 hover:bg-cream-50">
                      <td className={cn("px-4 py-1.5 pl-7 sticky left-0 bg-white z-10", {
                        "text-gray-700": l1 === "income",
                        "text-blue-700": l1 === "savings",
                        "text-red-600": l1 === "expense",
                      })}>
                        {cat.category}
                      </td>
                      {months.map((m) => (
                        <td key={m} className="px-3 py-1.5 text-right tabular-nums text-cream-600">
                          {cat.byMonth[m] ? formatKRW(cat.byMonth[m]) : "-"}
                        </td>
                      ))}
                      <td className="px-4 py-1.5 text-right tabular-nums text-cream-700 font-medium">
                        {formatKRW(cat.total)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
