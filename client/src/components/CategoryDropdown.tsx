import React, { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { cn } from "../lib/utils";

// L1 › L2 별로 묶은 카테고리(L3) — 드롭다운에 계층이 보이도록
const CATEGORY_GROUPS: { l1: string; l2: string; cats: string[] }[] = [
  { l1: "지출", l2: "생활",      cats: ["식비", "외식", "배달음식", "카페", "쇼핑", "생활용품", "주거"] },
  { l1: "지출", l2: "교통/통신", cats: ["교통", "통신", "구독"] },
  { l1: "지출", l2: "여가/문화", cats: ["문화", "교육", "여행", "미용"] },
  { l1: "지출", l2: "건강",      cats: ["의료", "건강"] },
  { l1: "지출", l2: "기타",      cats: ["금융", "세금", "기타"] },
  { l1: "저축/투자", l2: "저축", cats: ["저축"] },
  { l1: "저축/투자", l2: "투자", cats: ["투자"] },
  { l1: "수입", l2: "수입",      cats: ["수입"] },
];
const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.cats);

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
        {currentCategory}
        <span className="text-cream-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-52 bg-white border border-cream-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-cream-100">
            <label className="flex items-center gap-2 text-xs text-cream-600 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsRule}
                onChange={(e) => setSaveAsRule(e.target.checked)}
                className="accent-cream-700"
              />
              매핑 규칙에 저장
            </label>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {CATEGORY_GROUPS.map((g) => (
              <div key={`${g.l1}-${g.l2}`} className="mb-1">
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium text-cream-400 uppercase tracking-wide">
                  {g.l1} › {g.l2}
                </div>
                {g.cats.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => select(cat)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                      cat === currentCategory
                        ? "bg-cream-200 text-cream-900 font-medium"
                        : "hover:bg-cream-50 text-cream-700"
                    )}
                  >
                    {cat}
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
