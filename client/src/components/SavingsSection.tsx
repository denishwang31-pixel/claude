import React from "react";
import { trpc } from "../lib/trpc";
import { formatKRW } from "../lib/format";

export function SavingsSection() {
  const { data, isLoading } = trpc.budget.getSavingsStats.useQuery();

  if (isLoading) return <div className="animate-pulse h-32 bg-cream-100 rounded-xl" />;
  if (!data || data.items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
      <h3 className="font-serif text-lg font-semibold text-cream-800 mb-4">
        저축 · 투자 현황
        <span className="text-sm font-sans font-normal text-cream-500 ml-2">
          합계 {formatKRW(data.grandTotal)}
        </span>
      </h3>

      <div className="space-y-3">
        {data.items.map((item) => {
          const pct = data.grandTotal > 0 ? (item.total / data.grandTotal) * 100 : 0;
          return (
            <div key={`${item.content}-${item.category}`}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      item.category === "저축"
                        ? "px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700"
                        : "px-1.5 py-0.5 rounded text-xs bg-teal-100 text-teal-700"
                    }
                  >
                    {item.category}
                  </span>
                  <span className="text-cream-700 truncate max-w-[180px]">{item.content}</span>
                  <span className="text-cream-400 text-xs">{item.count}회</span>
                </div>
                <span className="font-medium text-cream-800 tabular-nums">
                  {formatKRW(item.total)}
                </span>
              </div>
              <div className="h-1.5 bg-cream-100 rounded-full overflow-hidden">
                <div
                  className={
                    item.category === "저축" ? "h-full bg-emerald-400 rounded-full" : "h-full bg-teal-400 rounded-full"
                  }
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
