import React, { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW } from "../../lib/format";
import { EXPENSE_TREE, categoryDisplay, categoryFull } from "../../lib/categories";
import { toast } from "sonner";

/** 현재 달 'YYYY-MM' (로컬 기준) */
function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function barColor(percent: number): string {
  if (percent >= 100) return "#DC2626"; // red
  if (percent >= 90) return "#EA580C"; // orange-red
  if (percent >= 80) return "#F59E0B"; // amber
  if (percent >= 50) return "#EAB308"; // yellow
  return "#16A34A"; // green
}

export function BudgetTab() {
  const yearMonth = useMemo(currentYearMonth, []);
  const utils = trpc.useUtils();
  const { data: budgets, isLoading } = trpc.budget.getBudgets.useQuery({ yearMonth });

  const [newCat, setNewCat] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const setMutation = trpc.budget.setBudget.useMutation({
    onSuccess: () => utils.budget.getBudgets.invalidate(),
    onError: () => toast.error("예산 저장에 실패했습니다."),
  });
  const deleteMutation = trpc.budget.deleteBudget.useMutation({
    onSuccess: () => utils.budget.getBudgets.invalidate(),
  });

  // 이미 예산이 설정된 카테고리는 추가 선택지에서 제외
  const usedCats = new Set((budgets ?? []).map((b) => b.category));

  function addBudget() {
    const amount = Number(newAmount.replace(/[^0-9]/g, ""));
    if (!newCat) return toast.error("카테고리를 선택하세요.");
    if (!amount || amount <= 0) return toast.error("목표 금액을 입력하세요.");
    setMutation.mutate({ category: newCat, targetAmount: amount });
    setNewCat("");
    setNewAmount("");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-serif text-lg font-bold text-cream-800">
          이번 달 예산 목표 <span className="text-cream-400 text-sm font-normal">({yearMonth})</span>
        </h2>
        <p className="text-sm text-cream-500 mt-1">
          카테고리별 월 목표를 정하면 50% · 80% · 90% · 100% 도달 시 알림을 보냅니다.
        </p>
      </div>

      {/* 새 예산 추가 */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-cream-200 rounded-xl p-3">
        <select
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          className="px-3 py-2 rounded-lg border border-cream-200 text-sm bg-white min-w-[9rem]"
        >
          <option value="">카테고리 선택</option>
          {EXPENSE_TREE.map((g) => (
            <optgroup key={g.l2} label={g.l2}>
              {g.items
                .filter((it) => !usedCats.has(it.key))
                .map((it) => (
                  <option key={it.key} value={it.key}>
                    {it.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          placeholder="목표 금액 (원)"
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          className="px-3 py-2 rounded-lg border border-cream-200 text-sm flex-1 min-w-[8rem]"
        />
        <button
          onClick={addBudget}
          disabled={setMutation.isPending}
          className="px-4 py-2 rounded-lg bg-cream-700 text-white text-sm font-semibold hover:bg-cream-800 disabled:opacity-60"
        >
          추가
        </button>
      </div>

      {/* 예산 목록 + 진행률 */}
      {isLoading ? (
        <p className="text-cream-500 text-sm">불러오는 중…</p>
      ) : (budgets ?? []).length === 0 ? (
        <p className="text-cream-500 text-sm py-8 text-center">
          아직 설정한 예산이 없습니다. 위에서 카테고리와 목표 금액을 추가해보세요.
        </p>
      ) : (
        <div className="space-y-3">
          {(budgets ?? []).map((b) => {
            const pct = Math.min(b.percent, 100);
            const color = barColor(b.percent);
            return (
              <div key={b.category} className="bg-white border border-cream-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-cream-800 text-sm">{categoryFull(b.category)}</span>
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{ color, backgroundColor: `${color}22` }}
                    >
                      {b.percent}%
                    </span>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate({ category: b.category })}
                    className="text-xs text-cream-400 hover:text-red-500"
                    title="예산 삭제"
                  >
                    삭제
                  </button>
                </div>
                <div className="h-2.5 rounded-full bg-cream-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <div className="flex justify-between text-xs text-cream-500 mt-1.5">
                  <span>{formatKRW(b.spent)} 사용</span>
                  <span>목표 {formatKRW(b.target)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
