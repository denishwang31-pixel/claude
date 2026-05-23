import React from "react";
import { trpc } from "../lib/trpc";
import { formatKRW } from "../lib/format";
import { cn } from "../lib/utils";

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-cream-100 rounded-full overflow-hidden mt-1">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

const TYPE_CONFIG = {
  income:     { label: "수입",     color: "#10b981", bg: "bg-emerald-50",  border: "border-emerald-200", text: "text-emerald-700" },
  expense:    { label: "지출",     color: "#ef4444", bg: "bg-red-50",       border: "border-red-200",     text: "text-red-700" },
  savings:    { label: "저축",     color: "#3b82f6", bg: "bg-blue-50",      border: "border-blue-200",    text: "text-blue-700" },
  investment: { label: "투자",     color: "#8b5cf6", bg: "bg-violet-50",    border: "border-violet-200",  text: "text-violet-700" },
  remaining:  { label: "미분배",   color: "#94a3b8", bg: "bg-slate-50",     border: "border-slate-200",   text: "text-slate-600" },
};

export function IncomeDistributionPanel() {
  const { data, isLoading } = trpc.budget.getIncomeDistribution.useQuery();

  if (isLoading) {
    return <div className="animate-pulse h-48 bg-cream-100 rounded-xl" />;
  }

  if (!data) return null;

  const totalIncome = data.income.reduce((s, r) => s + r.total, 0);
  const totalExpenses = data.expenses.reduce((s, r) => s + r.total, 0);
  const totalSavings = data.savings.reduce((s, r) => s + r.total, 0);
  const totalInvestments = data.investments.reduce((s, r) => s + r.total, 0);
  const totalAllocated = totalExpenses + totalSavings + totalInvestments;
  const remaining = totalIncome - totalAllocated;

  if (totalIncome === 0 && totalAllocated === 0) return null;

  const pct = (n: number) => totalIncome > 0 ? (n / totalIncome) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
      <h3 className="font-serif text-base font-semibold text-cream-700 mb-5">수입 분배 현황</h3>

      <div className="space-y-4">
        {/* Income */}
        <Section
          title="수입"
          total={totalIncome}
          items={data.income}
          pct={100}
          cfg={TYPE_CONFIG.income}
          baseIncome={totalIncome}
        />

        {/* Expenses */}
        {totalExpenses > 0 && (
          <Section
            title="지출"
            total={totalExpenses}
            items={data.expenses}
            pct={pct(totalExpenses)}
            cfg={TYPE_CONFIG.expense}
            baseIncome={totalIncome}
          />
        )}

        {/* Savings */}
        {totalSavings > 0 && (
          <Section
            title="저축"
            total={totalSavings}
            items={data.savings}
            pct={pct(totalSavings)}
            cfg={TYPE_CONFIG.savings}
            baseIncome={totalIncome}
          />
        )}

        {/* Investments */}
        {totalInvestments > 0 && (
          <Section
            title="투자"
            total={totalInvestments}
            items={data.investments}
            pct={pct(totalInvestments)}
            cfg={TYPE_CONFIG.investment}
            baseIncome={totalIncome}
          />
        )}

        {/* Remaining */}
        {totalIncome > 0 && remaining > 0 && (
          <div className={cn("rounded-lg border px-4 py-2.5 flex items-center justify-between", TYPE_CONFIG.remaining.bg, TYPE_CONFIG.remaining.border)}>
            <span className={cn("text-sm font-medium", TYPE_CONFIG.remaining.text)}>미분배</span>
            <span className={cn("font-semibold tabular-nums text-sm", TYPE_CONFIG.remaining.text)}>
              {formatKRW(remaining)}
              <span className="font-normal text-xs ml-1.5 opacity-70">({pct(remaining).toFixed(1)}%)</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title, total, items, pct, cfg, baseIncome,
}: {
  title: string;
  total: number;
  items: { category: string; total: number; count: number }[];
  pct: number;
  cfg: typeof TYPE_CONFIG.income;
  baseIncome: number;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div className={cn("rounded-lg border overflow-hidden", cfg.border)}>
      {/* Header row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn("w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors", cfg.bg, "hover:opacity-90")}
      >
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold", cfg.text)}>{title}</span>
          {items.length > 0 && (
            <span className={cn("text-xs opacity-70", cfg.text)}>{items.length}개 항목</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className={cn("font-bold tabular-nums text-sm", cfg.text)}>{formatKRW(total)}</span>
            {baseIncome > 0 && title !== "수입" && (
              <span className={cn("text-xs font-normal ml-1.5 opacity-70", cfg.text)}>
                ({pct.toFixed(1)}%)
              </span>
            )}
          </div>
          <span className={cn("text-xs opacity-50", cfg.text)}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Bar */}
      {title !== "수입" && baseIncome > 0 && (
        <div className="px-4 pt-1 pb-2 bg-white">
          <Bar pct={pct} color={cfg.color} />
        </div>
      )}

      {/* Items */}
      {open && items.length > 0 && (
        <div className="bg-white border-t border-cream-100 divide-y divide-cream-50">
          {items.map((item) => {
            const itemPct = baseIncome > 0 ? (item.total / baseIncome) * 100 : 0;
            return (
              <div key={item.category} className="flex items-center justify-between px-5 py-2">
                <span className="text-sm text-cream-700">{item.category}</span>
                <div className="text-right">
                  <span className="text-sm tabular-nums font-medium text-cream-800">
                    {formatKRW(item.total)}
                  </span>
                  {baseIncome > 0 && (
                    <span className="text-xs text-cream-400 ml-1.5">{itemPct.toFixed(1)}%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
