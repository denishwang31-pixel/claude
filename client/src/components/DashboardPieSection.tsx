import React, { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatKRW } from "../lib/format";
import { getL2, L2_ORDER, L2_COLOR } from "../lib/categories";

type CatRow = { category: string; l1: "income" | "savings" | "expense"; total: number; count: number };

interface Props {
  catStats: CatRow[];
  isLoading?: boolean;
}

const L1_SPLIT_COLOR = { savings: "#2563EB", expense: "#EF4444" };

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={13} fontWeight="700">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function DashboardPieSection({ catStats, isLoading }: Props) {
  const { splitData, l2Data } = useMemo(() => {
    let savingsTotal = 0;
    let expenseTotal = 0;
    const l2Map: Record<string, number> = {};

    for (const r of catStats) {
      if (r.l1 === "income") continue;
      const l2 = getL2(r.category, r.l1);
      l2Map[l2] = (l2Map[l2] ?? 0) + r.total;
      if (r.l1 === "savings") savingsTotal += r.total;
      else expenseTotal += r.total;
    }

    const splitData = [
      { name: "저축/투자", value: savingsTotal, color: L1_SPLIT_COLOR.savings },
      { name: "지출",     value: expenseTotal, color: L1_SPLIT_COLOR.expense },
    ].filter(d => d.value > 0);

    const allL2 = [...L2_ORDER.savings, ...L2_ORDER.expense];
    const l2Data = allL2
      .filter(l2 => l2Map[l2] > 0)
      .map(l2 => ({ name: l2, value: l2Map[l2], color: L2_COLOR[l2] ?? "#BFBFBF" }));

    return { splitData, l2Data };
  }, [catStats]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => <div key={i} className="animate-pulse h-64 bg-cream-100 rounded-xl" />)}
      </div>
    );
  }
  if (!catStats.length) return null;

  const splitTotal = splitData.reduce((s, r) => s + r.value, 0);
  const l2Total = l2Data.reduce((s, r) => s + r.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 저축/투자 vs 지출 */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">저축·투자 vs 지출 비율</h3>
        <div className="flex items-center gap-5">
          <div style={{ width: 170, height: 190 }} className="flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={splitData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={82} innerRadius={44}
                  paddingAngle={3} labelLine={false} label={PieLabel}>
                  {splitData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatKRW(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-4">
            {splitData.map((entry) => {
              const pct = splitTotal > 0 ? (entry.value / splitTotal) * 100 : 0;
              return (
                <div key={entry.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="font-semibold text-sm" style={{ color: entry.color }}>{entry.name}</span>
                    </div>
                    <span className="text-xl font-bold tabular-nums" style={{ color: entry.color }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-sm tabular-nums text-cream-600 text-right">
                    {formatKRW(entry.value)}
                  </div>
                  <div className="mt-1 h-2 bg-cream-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: entry.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* L2 카테고리 분류 */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">분류별 비율</h3>
        <div className="flex items-center gap-5">
          <div style={{ width: 170, height: 190 }} className="flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={l2Data} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={82} innerRadius={44}
                  paddingAngle={2} labelLine={false} label={PieLabel}>
                  {l2Data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatKRW(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[200px] pr-1">
            {l2Data.map((entry) => {
              const pct = l2Total > 0 ? (entry.value / l2Total) * 100 : 0;
              return (
                <div key={entry.name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: entry.color }} />
                      <span className="text-xs font-medium text-cream-700">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tabular-nums" style={{ color: entry.color }}>
                        {pct.toFixed(0)}%
                      </span>
                      <span className="text-xs tabular-nums text-cream-500">{formatKRW(entry.value)}</span>
                    </div>
                  </div>
                  <div className="h-1 bg-cream-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: entry.color }} />
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
