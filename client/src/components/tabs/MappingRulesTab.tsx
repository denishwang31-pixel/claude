import React, { useState } from "react";

interface Rule { id: number; keyword: string; category: string; isExact: boolean; createdAt: unknown }
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { toast } from "sonner";

const CATEGORIES = [
  "식비", "카페", "교통", "쇼핑", "의료", "문화", "교육", "여행",
  "구독", "통신", "주거", "저축", "투자", "금융", "수입", "기타",
];

export function MappingRulesTab() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [isExact, setIsExact] = useState(false);
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.budget.getCategoryRules.useQuery();

  const addMutation = trpc.budget.addCategoryRule.useMutation({
    onSuccess: () => {
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getTransactions.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getSavingsStats.invalidate();
      setKeyword("");
      toast.success("규칙이 추가되었습니다. 기존 내역에도 즉시 반영됩니다.");
    },
    onError: () => toast.error("규칙 추가에 실패했습니다."),
  });

  const deleteMutation = trpc.budget.deleteCategoryRule.useMutation({
    onSuccess: () => {
      utils.budget.getCategoryRules.invalidate();
      toast.success("규칙이 삭제되었습니다.");
    },
    onError: () => toast.error("규칙 삭제에 실패했습니다."),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) { toast.error("키워드를 입력하세요."); return; }
    addMutation.mutate({ keyword: keyword.trim(), category, isExact });
  }

  const typedRules = (rules ?? []) as Rule[];
  const filtered = typedRules.filter(
    (r) =>
      !search ||
      r.keyword.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Add rule form */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <h3 className="font-serif text-base font-semibold text-cream-700 mb-4">새 매핑 규칙 추가</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs text-cream-600 font-medium">키워드</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 스타벅스"
              className="border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cream-500 focus:ring-1 focus:ring-cream-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-cream-600 font-medium">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cream-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-cream-600 font-medium">매칭 방식</label>
            <label className="flex items-center gap-2 border border-cream-300 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-cream-50">
              <input
                type="checkbox"
                checked={isExact}
                onChange={(e) => setIsExact(e.target.checked)}
                className="accent-cream-700"
              />
              완전 일치
            </label>
          </div>

          <Button type="submit" disabled={addMutation.isPending}>
            {addMutation.isPending ? "추가 중..." : "규칙 추가"}
          </Button>
        </form>
        <p className="text-xs text-cream-400 mt-2">
          규칙 추가 시 기존 거래 내역에도 즉시 카테고리가 반영됩니다. (사용자가 직접 수정한 항목 제외)
        </p>
      </div>

      {/* Rules list */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="font-serif text-base font-semibold text-cream-700 shrink-0">
            매핑 규칙 목록
            <span className="text-sm font-sans font-normal text-cream-400 ml-2">
              {rules?.length ?? 0}개
            </span>
          </h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="키워드/카테고리 검색..."
            className="border border-cream-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cream-500 w-48"
          />
        </div>

        {isLoading ? (
          <div className="animate-pulse h-32 bg-cream-100 rounded-lg" />
        ) : !filtered.length ? (
          <div className="flex items-center justify-center h-24 text-cream-400 text-sm">
            {search ? "검색 결과가 없습니다." : "등록된 규칙이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  <th className="text-left px-4 py-2.5 text-cream-600 font-medium">키워드</th>
                  <th className="text-left px-4 py-2.5 text-cream-600 font-medium">카테고리</th>
                  <th className="text-center px-4 py-2.5 text-cream-600 font-medium">매칭</th>
                  <th className="text-right px-4 py-2.5 text-cream-600 font-medium">삭제</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rule: Rule) => (
                  <tr key={rule.id} className="border-b border-cream-100 hover:bg-cream-50">
                    <td className="px-4 py-2.5 font-medium text-cream-800">{rule.keyword}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 bg-cream-100 text-cream-700 rounded-full text-xs">
                        {rule.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs",
                          rule.isExact
                            ? "bg-blue-100 text-blue-600"
                            : "bg-amber-100 text-amber-600"
                        )}
                      >
                        {rule.isExact ? "완전 일치" : "포함"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => deleteMutation.mutate({ ruleId: rule.id })}
                        disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-600 text-xs transition-colors disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
