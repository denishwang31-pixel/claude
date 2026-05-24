import React, { useState, useMemo } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW } from "../../lib/format";
import { CategoryDetailModal } from "../CategoryDetailModal";
import { cn } from "../../lib/utils";
import { getL2, L2_ORDER, L2_COLOR } from "../../lib/categories";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  includeTransfer: boolean;
  excludedCategories: string[];
}

type L1Filter = "all" | "income" | "savings" | "expense";

const L1_TABS: { id: L1Filter; label: string }[] = [
  { id: "all",     label: "전체" },
  { id: "income",  label: "수입" },
  { id: "savings", label: "저축/투자" },
  { id: "expense", label: "지출" },
];

const L1_TEXT: Record<string, string> = {
  income:  "text-gray-900",
  savings: "text-blue-600",
  expense: "text-red-500",
};

export function CategoryTab({ includeTransfer, excludedCategories }: Props) {
  const [l1Filter, setL1Filter] = useState<L1Filter>("expense");
  const [expandedL2, setExpandedL2] = useState<string | null>(null);
  const [selectedL3, setSelectedL3] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: catStats, isLoading, error } = trpc.budget.getCategoryStats.useQuery({
    includeTransfer, excludedCategories,
  });

  // L3 merchant data for selectedL3
  const { data: l3Data, isLoading: l3Loading } = trpc.budget.getL3Stats.useQuery(
    { category: selectedL3! },
    { enabled: !!selectedL3 && !showModal }
  );

  // Build L2 groups from L3 catStats
  const { l2Groups, l3ByL2 } = useMemo(() => {
    const rows = (catStats ?? []) as { category: string; l1: string; total: number; count: number }[];
    const filtered = l1Filter === "all" ? rows : rows.filter((r) => r.l1 === l1Filter);

    const l2Map: Record<string, { l1: string; total: number; count: number }> = {};
    const l3Map: Record<string, { category: string; l1: string; total: number; count: number }[]> = {};

    for (const r of filtered) {
      const l2 = getL2(r.category, r.l1);
      if (!l2Map[l2]) l2Map[l2] = { l1: r.l1, total: 0, count: 0 };
      l2Map[l2].total += r.total;
      l2Map[l2].count += r.count;
      if (!l3Map[l2]) l3Map[l2] = [];
      l3Map[l2].push({ category: r.category, l1: r.l1, total: r.total, count: r.count });
    }

    // Sort L2 groups by defined order, then by total desc for unknowns
    const ordered: string[] = [];
    const allL2Orders = Object.values(L2_ORDER).flat();
    for (const l2 of allL2Orders) {
      if (l2Map[l2]) ordered.push(l2);
    }
    for (const l2 of Object.keys(l2Map)) {
      if (!ordered.includes(l2)) ordered.push(l2);
    }

    const l2Groups = ordered.map((l2) => ({ l2, ...l2Map[l2] }));
    return { l2Groups, l3ByL2: l3Map };
  }, [catStats, l1Filter]);

  const grandTotal = useMemo(() => l2Groups.reduce((s, r) => s + r.total, 0), [l2Groups]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-20 bg-cream-100 rounded-xl" />)}
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
      </div>
    );
  }

  function toggleL2(l2: string) {
    if (expandedL2 === l2) {
      setExpandedL2(null);
      setSelectedL3(null);
    } else {
      setExpandedL2(l2);
      setSelectedL3(null);
    }
  }

  function selectL3(cat: string) {
    setSelectedL3(selectedL3 === cat ? null : cat);
  }

  // Pie data: L2 groups
  const pieData = l2Groups.map((g) => ({
    name: g.l2,
    value: g.total,
    color: L2_COLOR[g.l2] ?? "#BFBFBF",
  }));

  return (
    <div className="space-y-6">
      {/* L1 Filter tabs */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm px-4 py-2 flex gap-1">
        {L1_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setL1Filter(tab.id); setExpandedL2(null); setSelectedL3(null); }}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              l1Filter === tab.id
                ? "bg-cream-700 text-white"
                : "text-cream-500 hover:text-cream-700 hover:bg-cream-50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pie + L2 list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie */}
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">분류별 비율</h3>
          {pieData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={110} innerRadius={55} paddingAngle={2}
                  label={({ name, percent }) => percent > 0.04 ? `${name} ${(percent*100).toFixed(0)}%` : ""}
                  labelLine={false}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatKRW(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-cream-400 text-sm">데이터 없음</div>
          )}
        </div>

        {/* L2 list */}
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">분류별 합계</h3>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {l2Groups.map((g) => {
              const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0;
              const color = L2_COLOR[g.l2] ?? "#BFBFBF";
              const isExpanded = expandedL2 === g.l2;
              return (
                <div key={g.l2}>
                  <button
                    onClick={() => toggleL2(g.l2)}
                    className={cn(
                      "w-full text-left rounded-lg px-2 py-1.5 transition-colors",
                      isExpanded ? "bg-cream-100" : "hover:bg-cream-50"
                    )}
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs opacity-50">{isExpanded ? "▼" : "▶"}</span>
                        <span className="font-medium" style={{ color }}>{g.l2}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-cream-400 text-xs">{g.count}건</span>
                        <span className="font-semibold tabular-nums" style={{ color }}>
                          {formatKRW(g.total)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-cream-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </button>

                  {/* L3 sub-rows */}
                  {isExpanded && (
                    <div className="ml-5 mt-1 mb-1 space-y-0.5 border-l-2 border-cream-100 pl-3">
                      {(l3ByL2[g.l2] ?? []).sort((a, b) => b.total - a.total).map((l3row) => {
                        const l3pct = g.total > 0 ? (l3row.total / g.total) * 100 : 0;
                        const isL3Sel = selectedL3 === l3row.category;
                        return (
                          <div key={l3row.category}>
                            <button
                              onClick={() => selectL3(l3row.category)}
                              className={cn(
                                "w-full text-left rounded px-2 py-1 text-xs transition-colors",
                                isL3Sel ? "bg-cream-100" : "hover:bg-cream-50"
                              )}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="opacity-40">{isL3Sel ? "▼" : "▶"}</span>
                                  <span className={cn("font-medium", L1_TEXT[l3row.l1] ?? "text-cream-700")}>
                                    {l3row.category}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-cream-400">{l3row.count}건</span>
                                  <span className={cn("font-semibold tabular-nums", L1_TEXT[l3row.l1] ?? "text-cream-700")}>
                                    {formatKRW(l3row.total)}
                                  </span>
                                </div>
                              </div>
                              <div className="h-1 bg-cream-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full"
                                  style={{ width: `${l3pct}%`, backgroundColor: color }} />
                              </div>
                            </button>

                            {/* L4 merchants */}
                            {isL3Sel && (
                              <div className="ml-4 mt-1 mb-1 border-l border-cream-100 pl-2 space-y-0.5">
                                {l3Loading ? (
                                  <div className="text-cream-400 text-xs py-1">불러오는 중...</div>
                                ) : !l3Data?.length ? (
                                  <div className="text-cream-400 text-xs py-1">내역 없음</div>
                                ) : (
                                  <>
                                    {l3Data.map((item) => (
                                      <div key={item.content}
                                        className="flex items-center justify-between py-0.5 text-xs text-cream-600">
                                        <span className="truncate max-w-[160px]">{item.content}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                                          <span className="text-cream-400">{item.count}건</span>
                                          <span className="font-medium tabular-nums">{formatKRW(item.total)}</span>
                                        </div>
                                      </div>
                                    ))}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                                      className="text-xs text-cream-400 hover:text-cream-700 underline mt-1"
                                    >
                                      전체 거래 보기 →
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selectedL3 && showModal && (
        <CategoryDetailModal
          category={selectedL3}
          onClose={() => { setShowModal(false); }}
        />
      )}
    </div>
  );
}
