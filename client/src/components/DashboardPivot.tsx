import React, { useMemo, useState } from "react";
import { formatKRW, formatYearMonth } from "../lib/format";
import { getL2, L2_ORDER } from "../lib/categories";
import { cn } from "../lib/utils";

type PivotRow = { yearMonth: string; category: string; l1: "income" | "savings" | "expense"; total: number };

interface Props {
  pivotData: PivotRow[];
}

const L1_ORDER = ["income", "savings", "expense"] as const;
const L1_LABEL: Record<string, string> = { income: "수입", savings: "저축/투자", expense: "지출" };
const L1_TEXT: Record<string, string> = {
  income:  "text-gray-900 font-semibold",
  savings: "text-blue-600 font-semibold",
  expense: "text-red-500 font-semibold",
};
const L1_BG: Record<string, string> = {
  income:  "bg-gray-50",
  savings: "bg-blue-50",
  expense: "bg-red-50",
};
const L2_TEXT: Record<string, string> = {
  income:  "text-gray-700",
  savings: "text-blue-700",
  expense: "text-red-600",
};

export function DashboardPivot({ pivotData }: Props) {
  const [openL1, setOpenL1] = useState<Set<string>>(new Set());
  const [openL2, setOpenL2] = useState<Set<string>>(new Set());

  const months = useMemo(
    () => [...new Set(pivotData.map((r) => r.yearMonth))].sort(),
    [pivotData]
  );

  const { l1Tot, l2Tot, l3Tot } = useMemo(() => {
    const l1Tot: Record<string, Record<string, number>> = {};
    const l2Tot: Record<string, Record<string, Record<string, number>>> = {};
    const l3Tot: Record<string, Record<string, Record<string, Record<string, number>>>> = {};

    for (const r of pivotData) {
      const l2 = getL2(r.category, r.l1);

      if (!l1Tot[r.l1]) l1Tot[r.l1] = {};
      l1Tot[r.l1][r.yearMonth] = (l1Tot[r.l1][r.yearMonth] ?? 0) + r.total;

      if (!l2Tot[r.l1]) l2Tot[r.l1] = {};
      if (!l2Tot[r.l1][l2]) l2Tot[r.l1][l2] = {};
      l2Tot[r.l1][l2][r.yearMonth] = (l2Tot[r.l1][l2][r.yearMonth] ?? 0) + r.total;

      if (!l3Tot[r.l1]) l3Tot[r.l1] = {};
      if (!l3Tot[r.l1][l2]) l3Tot[r.l1][l2] = {};
      if (!l3Tot[r.l1][l2][r.category]) l3Tot[r.l1][l2][r.category] = {};
      l3Tot[r.l1][l2][r.category][r.yearMonth] = r.total;
    }
    return { l1Tot, l2Tot, l3Tot };
  }, [pivotData]);

  if (!months.length) return null;

  const colW = `${Math.max(80, Math.floor(500 / months.length))}px`;

  function toggleL1(l1: string) {
    const next = new Set(openL1);
    next.has(l1) ? next.delete(l1) : next.add(l1);
    setOpenL1(next);
  }

  function toggleL2(key: string) {
    const next = new Set(openL2);
    next.has(key) ? next.delete(key) : next.add(key);
    setOpenL2(next);
  }

  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-cream-100 flex items-center justify-between">
        <h3 className="font-serif text-base font-semibold text-cream-700">월별 카테고리 현황</h3>
        <span className="text-xs text-cream-400">▶ 클릭하면 상세 펼치기</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left px-4 py-2.5 text-cream-600 font-medium sticky left-0 bg-cream-50 z-10 min-w-[170px]">항목</th>
              {months.map((m) => (
                <th key={m} className="text-right px-3 py-2.5 text-cream-600 font-medium whitespace-nowrap" style={{ minWidth: colW }}>
                  {formatYearMonth(m)}
                </th>
              ))}
              <th className="text-right px-4 py-2.5 text-cream-600 font-medium whitespace-nowrap">합계</th>
            </tr>
          </thead>
          <tbody>
            {L1_ORDER.map((l1) => {
              const l1MonthMap = l1Tot[l1] ?? {};
              const l1Grand = months.reduce((s, m) => s + (l1MonthMap[m] ?? 0), 0);
              if (!l1Grand) return null;

              const l2Groups = (L2_ORDER[l1] ?? []).filter((l2) => l2Tot[l1]?.[l2]);
              const isL1Open = openL1.has(l1);

              return (
                <React.Fragment key={l1}>
                  {/* L1 row */}
                  <tr
                    className={cn("border-b border-cream-100 cursor-pointer select-none", L1_BG[l1])}
                    onClick={() => toggleL1(l1)}
                  >
                    <td className={cn("px-4 py-2.5 sticky left-0 z-10", L1_BG[l1], L1_TEXT[l1])}>
                      <span className="mr-1.5 text-xs opacity-60">{isL1Open ? "▼" : "▶"}</span>
                      {L1_LABEL[l1]} 합계
                    </td>
                    {months.map((m) => (
                      <td key={m} className={cn("px-3 py-2.5 text-right tabular-nums", L1_TEXT[l1])}>
                        {l1MonthMap[m] ? formatKRW(l1MonthMap[m]) : "-"}
                      </td>
                    ))}
                    <td className={cn("px-4 py-2.5 text-right tabular-nums", L1_TEXT[l1])}>
                      {formatKRW(l1Grand)}
                    </td>
                  </tr>

                  {/* L2 rows */}
                  {isL1Open && l2Groups.map((l2) => {
                    const l2MonthMap = l2Tot[l1][l2] ?? {};
                    const l2Grand = months.reduce((s, m) => s + (l2MonthMap[m] ?? 0), 0);
                    const l2Key = `${l1}:${l2}`;
                    const isL2Open = openL2.has(l2Key);
                    const l3Cats = Object.keys(l3Tot[l1]?.[l2] ?? {});

                    return (
                      <React.Fragment key={l2Key}>
                        <tr
                          className="border-b border-cream-50 cursor-pointer select-none hover:bg-cream-50"
                          onClick={() => toggleL2(l2Key)}
                        >
                          <td className={cn("px-4 py-2 pl-9 sticky left-0 bg-white z-10 font-medium", L2_TEXT[l1])}>
                            <span className="mr-1.5 text-xs opacity-50">{isL2Open ? "▼" : "▶"}</span>
                            {l2}
                          </td>
                          {months.map((m) => (
                            <td key={m} className="px-3 py-2 text-right tabular-nums text-cream-600">
                              {l2MonthMap[m] ? formatKRW(l2MonthMap[m]) : "-"}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right tabular-nums text-cream-700 font-medium">
                            {formatKRW(l2Grand)}
                          </td>
                        </tr>

                        {/* L3 rows */}
                        {isL2Open && l3Cats.map((l3) => {
                          const l3MonthMap = l3Tot[l1][l2][l3] ?? {};
                          const l3Grand = months.reduce((s, m) => s + (l3MonthMap[m] ?? 0), 0);
                          return (
                            <tr key={l3} className="border-b border-cream-50">
                              <td className="px-4 py-1.5 pl-16 sticky left-0 bg-white z-10 text-cream-400 text-xs">
                                {l3}
                              </td>
                              {months.map((m) => (
                                <td key={m} className="px-3 py-1.5 text-right tabular-nums text-cream-400 text-xs">
                                  {l3MonthMap[m] ? formatKRW(l3MonthMap[m]) : "-"}
                                </td>
                              ))}
                              <td className="px-4 py-1.5 text-right tabular-nums text-cream-500 text-xs">
                                {formatKRW(l3Grand)}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
