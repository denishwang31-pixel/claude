import React, { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatKRW } from "../lib/format";

type CatRow = { category: string; l1: "income" | "savings" | "expense"; total: number; count: number };

interface Props {
  catStats: CatRow[];
  isLoading?: boolean;
}

const L1_ORDER = ["income", "savings", "expense"] as const;
const L1_LABEL: Record<string, string> = { income: "수입", savings: "저축/투자", expense: "지출" };
const L1_COLOR: Record<string, string> = { income: "#111827", savings: "#2563EB", expense: "#EF4444" };
const L1_TEXT: Record<string, string> = {
  income: "text-gray-900 font-semibold",
  savings: "text-blue-600 font-semibold",
  expense: "text-red-500 font-semibold",
};

const L2_PALETTES: Record<string, string[]> = {
  income:  ["#111827", "#374151", "#4B5563", "#6B7280", "#9CA3AF"],
  savings: ["#1E40AF", "#2563EB", "#3B82F6", "#60A5FA", "#93C5FD"],
  expense: ["#B91C1C", "#DC2626", "#EF4444", "#F87171", "#FCA5A5"],
};

export function DashboardPieSection({ catStats, isLoading }: Props) {
  const { l1Data, l2Colors } = useMemo(() => {
    const l1Map: Record<string, number> = {};
    for (const r of catStats) l1Map[r.l1] = (l1Map[r.l1] ?? 0) + r.total;

    const l1Data = L1_ORDER
      .filter((l1) => (l1Map[l1] ?? 0) > 0)
      .map((l1) => ({ name: L1_LABEL[l1], value: l1Map[l1], l1 }));

    const counters: Record<string, number> = {};
    const l2Colors = catStats.map((r) => {
      const idx = counters[r.l1] ?? 0;
      counters[r.l1] = idx + 1;
      const pal = L2_PALETTES[r.l1];
      return pal[idx % pal.length];
    });

    return { l1Data, l2Colors };
  }, [catStats]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => <div key={i} className="animate-pulse h-64 bg-cream-100 rounded-xl" />)}
      </div>
    );
  }
  if (!catStats.length) return null;

  const l1Total = l1Data.reduce((s, r) => s + r.value, 0);
  const l2Total = catStats.reduce((s, r) => s + r.total, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* L1 Pie */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">수입 / 저축·투자 / 지출 비율</h3>
        <div className="flex gap-5 items-center">
          <div className="flex-shrink-0" style={{ width: 170, height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={l1Data} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={80} innerRadius={42} paddingAngle={3}>
                  {l1Data.map((entry) => (
                    <Cell key={entry.l1} fill={L1_COLOR[entry.l1]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatKRW(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-3">
            {l1Data.map((entry) => {
              const pct = l1Total > 0 ? (entry.value / l1Total) * 100 : 0;
              return (
                <div key={entry.l1}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={L1_TEXT[entry.l1]}>{entry.name}</span>
                    <span className="tabular-nums font-semibold text-cream-800">{formatKRW(entry.value)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-cream-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: L1_COLOR[entry.l1] }} />
                    </div>
                    <span className="text-xs text-cream-400 w-9 text-right">{pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* L2 Pie */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">카테고리별 비율</h3>
        <div className="flex gap-5 items-center">
          <div className="flex-shrink-0" style={{ width: 170, height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catStats} dataKey="total" nameKey="category" cx="50%" cy="50%"
                  outerRadius={80} innerRadius={42} paddingAngle={2}>
                  {catStats.map((_, i) => (
                    <Cell key={i} fill={l2Colors[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatKRW(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[190px] pr-1">
            {catStats.map((row, i) => {
              const pct = l2Total > 0 ? (row.total / l2Total) * 100 : 0;
              if (pct < 0.5) return null;
              return (
                <div key={row.category}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-cream-700">{row.category}</span>
                    <span className="text-xs tabular-nums text-cream-600">{formatKRW(row.total)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 bg-cream-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: l2Colors[i] }} />
                    </div>
                    <span className="text-xs text-cream-400 w-7 text-right">{pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
