import React, { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { EXPENSE_TREE, categoryDisplay, categoryFull } from "../lib/categories";

// L1 › L2 별로 묶은 카테고리(L3 키+표시명) — 드롭다운에 계층이 보이도록
const CATEGORY_GROUPS: { l1: string; l2: string; items: { key: string; label: string }[] }[] = [
  ...EXPENSE_TREE.map((g) => ({ l1: "지출", l2: g.l2, items: g.items })),
  { l1: "저축/투자", l2: "저축", items: [{ key: "저축", label: "저축" }] },
  { l1: "저축/투자", l2: "투자", items: [{ key: "투자", label: "투자" }] },
  { l1: "수입", l2: "수입", items: [{ key: "수입", label: "수입" }] },
];

interface CategoryDropdownProps {
  transactionId: number;
  currentCategory: string;
  content: string;
  onChanged?: () => void;
}

export function CategoryDropdown({
  transactionId,
  currentCategory,
  content,
  onChanged,
}: CategoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [applyToSame, setApplyToSame] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const updateMutation = trpc.budget.updateCategory.useMutation({
    onSuccess: () => {
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getCategoryTransactions.invalidate();
      utils.budget.getMonthlyStats.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getSavingsStats.invalidate();
      utils.budget.getTransactions.invalidate();
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      onChanged?.();
      toast.success("카테고리가 변경되었습니다.");
    },
    onError: () => toast.error("카테고리 변경에 실패했습니다."),
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function select(cat: string) {
    if (cat === currentCategory) { setOpen(false); return; }
    updateMutation.mutate({
      transactionId,
      newCategory: cat,
      saveAsRule,
      applyToSame,
      keyword: content,
      isExact: true,
    });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
          "bg-cream-100 text-cream-700 hover:bg-cream-200 border border-cream-300"
        )}
        disabled={updateMutation.isPending}
      >
        {categoryFull(currentCategory)}
        <span className="text-cream-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-52 bg-white border border-cream-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-cream-100 space-y-1.5">
            <div className="px-1 text-[10px] font-medium text-cream-400 uppercase tracking-wide">적용 범위</div>
            <label className="flex items-start gap-2 text-xs text-cream-600 cursor-pointer px-1">
              <input
                type="checkbox"
                checked={applyToSame}
                onChange={(e) => setApplyToSame(e.target.checked)}
                className="accent-cream-700 mt-0.5"
              />
              <span>
                같은 내역 전체 변경
                <span className="block text-[10px] text-cream-400">「{content.length > 14 ? content.slice(0, 14) + "…" : content}」 거래 모두</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-cream-600 cursor-pointer px-1">
              <input
                type="checkbox"
                checked={saveAsRule}
                onChange={(e) => setSaveAsRule(e.target.checked)}
                className="accent-cream-700 mt-0.5"
              />
              <span>
                매핑 규칙에 저장
                <span className="block text-[10px] text-cream-400">앞으로 업로드되는 거래에도 자동 적용</span>
              </span>
            </label>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {CATEGORY_GROUPS.map((g) => (
              <div key={`${g.l1}-${g.l2}`} className="mb-1">
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium text-cream-400 uppercase tracking-wide">
                  {g.l1} › {g.l2}
                </div>
                {g.items.map((it) => (
                  <button
                    key={it.key}
                    onClick={() => select(it.key)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                      it.key === currentCategory
                        ? "bg-cream-200 text-cream-900 font-medium"
                        : "hover:bg-cream-50 text-cream-700"
                    )}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
