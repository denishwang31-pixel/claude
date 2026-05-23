import React, { useState } from "react";
import { cn } from "../lib/utils";

const EXPENSE_CATEGORIES = [
  "식비", "카페", "교통", "쇼핑", "의료", "문화", "교육", "여행",
  "구독", "통신", "주거", "금융", "기타",
];

interface FilterPanelProps {
  includeTransfer: boolean;
  excludedCategories: string[];
  onIncludeTransferChange: (v: boolean) => void;
  onExcludedCategoriesChange: (cats: string[]) => void;
}

export function FilterPanel({
  includeTransfer,
  excludedCategories,
  onIncludeTransferChange,
  onExcludedCategoriesChange,
}: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  function toggleCategory(cat: string) {
    if (excludedCategories.includes(cat)) {
      onExcludedCategoriesChange(excludedCategories.filter((c) => c !== cat));
    } else {
      onExcludedCategoriesChange([...excludedCategories, cat]);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-cream-700 hover:bg-cream-50 transition-colors"
      >
        <span>필터 설정</span>
        <span
          className={cn(
            "transition-transform duration-200",
            open ? "rotate-180" : ""
          )}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-cream-100 pt-3 space-y-4">
          <label className="flex items-center gap-3 text-sm text-cream-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTransfer}
              onChange={(e) => onIncludeTransferChange(e.target.checked)}
              className="accent-cream-700 w-4 h-4"
            />
            이체 항목 포함 (내계좌이체, 카드대금 등)
          </label>

          <div>
            <p className="text-xs font-medium text-cream-500 mb-2">제외할 카테고리</p>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((cat) => {
                const excluded = excludedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      excluded
                        ? "bg-cream-700 text-white border-cream-700"
                        : "bg-white text-cream-600 border-cream-300 hover:border-cream-500"
                    )}
                  >
                    {excluded ? "✓ " : ""}{cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
