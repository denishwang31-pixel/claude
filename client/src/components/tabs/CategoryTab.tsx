import React, { useState, useMemo } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW } from "../../lib/format";
import { CategoryPieChart } from "../charts/CategoryPieChart";
import { CategoryDetailModal } from "../CategoryDetailModal";
import { cn } from "../../lib/utils";

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

const L1_COLOR: Record<string, string> = { income: "#111827", savings: "#2563EB", expense: "#EF4444" };
const L1_TEXT: Record<string, string> = {
  income:  "text-gray-900",
  savings: "text-blue-600",
  expense: "text-red-500",
};
const L1_BAR: Record<string, string> = {
  income:  "bg-gray-800",
  savings: "bg-blue-500",
  expense: "bg-red-500",
};

export function CategoryTab({ includeTransfer, excludedCategories }: Props) {
  const [l1Filter, setL1Filter] = useState<L1Filter>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const { data: catStats, isLoading, error } = trpc.budget.getCategoryStats.useQuery({
    includeTransfer,
    excludedCategories,
  });

  const { data: l3Data, isLoading: l3Loading } = trpc.budget.getL3Stats.useQuery(
    { category: selectedCategory! },
    { enabled: !!selectedCategory && !showDetailModal }
  );

  const filtered = useMemo(() => {
    if (!catStats) return [];
    return l1Filter === "all"
      ? catStats
      : catStats.filter((r: any) => r.l1 === l1Filter);
  }, [catStats, l1Filter]);

  const grandTotal = useMemo(
    () => filtered.reduce((s: number, r: any) => s + r.total, 0),
    [filtered]
  );

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

  return (
    <div className="space-y-6">
      {/* L1 Filter tabs */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm px-4 py-2 flex gap-1">
        {L1_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setL1Filter(tab.id); setSelectedCategory(null); }}
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

      {/* Pie + Category list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">카테고리 비율</h3>
          <CategoryPieChart data={filtered} />
        </div>

        {/* Category list */}
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">카테고리별 합계</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {filtered.map((row: any) => {
              const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
              const isSelected = selectedCategory === row.category;
              return (
                <button
                  key={row.category}
                  onClick={() => setSelectedCategory(isSelected ? null : row.category)}
                  className={cn(
                    "w-full text-left rounded-lg px-2 py-1.5 transition-colors group",
                    isSelected ? "bg-cream-100" : "hover:bg-cream-50"
                  )}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={cn("font-medium", L1_TEXT[row.l1] ?? "text-cream-700")}>
                      {row.category}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-cream-400 text-xs">{row.count}건</span>
                      <span className={cn("font-semibold tabular-nums", L1_TEXT[row.l1] ?? "text-cream-800")}>
                        {formatKRW(row.total)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-cream-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", L1_BAR[row.l1] ?? "bg-cream-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* L3 Drill-down panel */}
      {selectedCategory && !showDetailModal && (
        <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="font-serif text-base font-semibold text-cream-700">
                {selectedCategory} — 상세 내역
              </h3>
              <button
                onClick={() => setShowDetailModal(true)}
                className="text-xs text-cream-500 hover:text-cream-700 underline"
              >
                전체 거래 보기
              </button>
            </div>
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-cream-400 hover:text-cream-700 text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {l3Loading ? (
            <div className="text-cream-400 text-sm py-4 text-center">불러오는 중...</div>
          ) : !l3Data?.length ? (
            <div className="text-cream-400 text-sm py-4 text-center">내역이 없습니다.</div>
          ) : (
            <div className="space-y-1.5">
              {(() => {
                const l3Total = l3Data.reduce((s, r) => s + r.total, 0);
                return l3Data.map((item) => {
                  const pct = l3Total > 0 ? (item.total / l3Total) * 100 : 0;
                  const l1 = (catStats?.find((r: any) => r.category === selectedCategory) as any)?.l1 ?? "expense";
                  return (
                    <div key={item.content} className="flex items-center gap-3 py-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm mb-0.5">
                          <span className="text-cream-700 truncate max-w-[260px]">{item.content}</span>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                            <span className="text-cream-400 text-xs">{item.count}건</span>
                            <span className={cn("font-semibold tabular-nums text-sm", L1_TEXT[l1] ?? "text-cream-800")}>
                              {formatKRW(item.total)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1 bg-cream-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: L1_COLOR[l1] ?? "#9CA3AF" }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      {selectedCategory && showDetailModal && (
        <CategoryDetailModal
          category={selectedCategory}
          onClose={() => { setShowDetailModal(false); setSelectedCategory(null); }}
        />
      )}
    </div>
  );
}
