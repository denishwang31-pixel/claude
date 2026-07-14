import React from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW } from "../../lib/format";
import { toast } from "sonner";

export function AccountsTab() {
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.budget.getAccounts.useQuery();

  const setHidden = trpc.budget.setAccountHidden.useMutation({
    onSuccess: () => {
      // 숨김 변경은 모든 집계에 영향 → 관련 쿼리 갱신
      utils.budget.getAccounts.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getMonthlyStats.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getTransactions.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      utils.budget.getSavingsStats.invalidate();
      utils.budget.getSubscriptions.invalidate();
      utils.budget.getBudgets.invalidate();
    },
    onError: () => toast.error("변경에 실패했습니다."),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-serif text-lg font-bold text-cream-800">계좌 · 카드 관리</h2>
        <p className="text-sm text-cream-500 mt-1">
          숨긴 카드/계좌는 대시보드·통계·내역·예산 등 <b>모든 화면의 집계에서 제외</b>됩니다.
          (비상금 통장, 개인 카드 등을 가계부에서 빼고 싶을 때)
        </p>
      </div>

      {isLoading ? (
        <p className="text-cream-500 text-sm">불러오는 중…</p>
      ) : (accounts ?? []).length === 0 ? (
        <p className="text-cream-500 text-sm py-8 text-center">
          결제수단 정보가 없습니다. 거래를 업로드하면 카드/계좌 목록이 표시됩니다.
        </p>
      ) : (
        <div className="space-y-2">
          {(accounts ?? []).map((a) => (
            <div
              key={a.paymentMethod}
              className={`bg-white border rounded-xl p-4 flex items-center justify-between gap-3 ${
                a.hidden ? "border-cream-200 opacity-60" : "border-cream-200"
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold text-cream-800 text-sm truncate">
                  {a.paymentMethod} {a.hidden && <span className="text-xs text-red-500">(숨김)</span>}
                </div>
                <div className="text-xs text-cream-500 mt-0.5">
                  {a.count.toLocaleString()}건 · 합계 {formatKRW(a.total)}
                </div>
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
                <span className="text-xs text-cream-500">{a.hidden ? "숨김" : "표시"}</span>
                <input
                  type="checkbox"
                  checked={!a.hidden}
                  disabled={setHidden.isPending}
                  onChange={(e) => setHidden.mutate({ paymentMethod: a.paymentMethod, hidden: !e.target.checked })}
                  className="w-5 h-5 accent-cream-700"
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
