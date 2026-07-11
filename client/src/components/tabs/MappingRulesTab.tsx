import React, { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { L2_BY_L1, l3ListForL2, L2_COLOR, l3ListForL1, categoryDisplay, categoryFull } from "../../lib/categories";

const HIERARCHY: { l1: string; color: string }[] = [
  { l1: "income", color: "text-gray-800" },
  { l1: "savings", color: "text-blue-600" },
  { l1: "expense", color: "text-red-500" },
];
const L1_NAME: Record<string, string> = { income: "수입", savings: "저축/투자", expense: "지출" };

function HierarchyOverview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left text-sm font-semibold text-cream-700">
        <span>분류 체계 <span className="font-normal text-cream-400 text-xs ml-1">L1 › L2 › L3</span></span>
        <span className="text-xs opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3">
          {HIERARCHY.map(({ l1, color }) => (
            <div key={l1}>
              <div className={cn("text-sm font-bold mb-1", color)}>{L1_NAME[l1]}</div>
              <div className="space-y-1 pl-3 border-l-2 border-cream-100">
                {(L2_BY_L1[l1] ?? []).map((l2) => (
                  <div key={l2} className="flex items-start gap-2 text-xs">
                    <span className="font-medium text-cream-600 min-w-[64px] inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: L2_COLOR[l2] ?? "#ccc" }} />
                      {l2}
                    </span>
                    <span className="text-cream-400">{l3ListForL2(l1, l2).map(categoryDisplay).join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Rule {
  id: number;
  keyword: string;
  category: string;
  isExact: boolean;
  ruleType: string;
  isActive: boolean;
  createdAt: unknown;
}

const EXPENSE_CATS = l3ListForL1("expense");
const INCOME_CATS = ["급여", "상여금", "이자수입", "부업수입", "기타수입"];
const SAVINGS_CATS_LIST = ["청약", "적금", "저축", "예금", "CMA"];
const INVEST_CATS_LIST = ["ETF", "주식", "펀드", "ISA", "IRP", "투자"];

const TYPE_STYLES: Record<string, { badge: string; header: string; border: string }> = {
  income:     { badge: "bg-emerald-100 text-emerald-700", header: "bg-emerald-50 text-emerald-800", border: "border-emerald-200" },
  savings:    { badge: "bg-blue-100 text-blue-700",       header: "bg-blue-50 text-blue-800",       border: "border-blue-200" },
  investment: { badge: "bg-violet-100 text-violet-700",   header: "bg-violet-50 text-violet-800",   border: "border-violet-200" },
  expense:    { badge: "bg-cream-100 text-cream-700",     header: "bg-cream-50 text-cream-700",     border: "border-cream-200" },
};

function AddRuleForm({ ruleType, categories }: { ruleType: string; categories: string[] }) {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [isExact, setIsExact] = useState(false);

  const utils = trpc.useUtils();
  const addMutation = trpc.budget.addCategoryRule.useMutation({
    onSuccess: () => {
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getSavingsStats.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      setKeyword("");
      toast.success("규칙이 추가되었습니다. 기존 내역에 즉시 반영됩니다.");
    },
    onError: () => toast.error("규칙 추가에 실패했습니다."),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!keyword.trim()) { toast.error("키워드를 입력하세요."); return; } addMutation.mutate({ keyword: keyword.trim(), category, isExact, ruleType }); }}
      className="flex flex-wrap gap-2 items-end pt-3 border-t border-cream-100"
    >
      <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
        <label className="text-xs text-cream-500">키워드</label>
        <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="예: 스타벅스"
          className="border border-cream-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cream-500" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-cream-500">카테고리</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="border border-cream-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cream-500">
          {categories.map((c) => <option key={c} value={c}>{categoryFull(c)}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-cream-500">방식</label>
        <label className="flex items-center gap-2 border border-cream-300 rounded-lg px-3 py-1.5 text-sm cursor-pointer hover:bg-cream-50">
          <input type="checkbox" checked={isExact} onChange={(e) => setIsExact(e.target.checked)} className="accent-cream-700" />
          완전일치
        </label>
      </div>
      <Button type="submit" size="sm" disabled={addMutation.isPending}>추가</Button>
    </form>
  );
}

function RulesSection({ title, ruleType, rules }: { title: string; ruleType: string; rules: Rule[] }) {
  const [open, setOpen] = useState(true);
  const style = TYPE_STYLES[ruleType] ?? TYPE_STYLES.expense;
  const cats = ruleType === "income" ? INCOME_CATS : ruleType === "savings" ? SAVINGS_CATS_LIST : ruleType === "investment" ? INVEST_CATS_LIST : EXPENSE_CATS;

  const utils = trpc.useUtils();

  const deleteMutation = trpc.budget.deleteCategoryRule.useMutation({
    onSuccess: () => {
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      toast.success("규칙이 삭제되었습니다.");
    },
  });

  const activeMutation = trpc.budget.updateRuleActive.useMutation({
    onSuccess: () => {
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
    },
  });

  return (
    <div className={cn("rounded-xl border overflow-hidden", style.border)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn("w-full flex items-center justify-between px-5 py-3 text-left text-sm font-semibold", style.header)}
      >
        <span>{title} 규칙 <span className="font-normal opacity-60 text-xs ml-1">{rules.length}개</span></span>
        <span className="text-xs opacity-50">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="bg-white px-5 pb-4">
          {rules.length > 0 && (
            <table className="w-full text-sm border-collapse mb-1 mt-2">
              <thead>
                <tr className="border-b border-cream-100 text-xs text-cream-500">
                  <th className="text-left py-1.5 font-medium w-7">활성</th>
                  <th className="text-left py-1.5 font-medium pl-1">키워드</th>
                  <th className="text-left py-1.5 font-medium">카테고리</th>
                  <th className="text-center py-1.5 font-medium">방식</th>
                  <th className="text-right py-1.5 font-medium">삭제</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className={cn("border-b border-cream-50 transition-opacity", !rule.isActive && "opacity-40")}>
                    <td className="py-2">
                      <input type="checkbox" checked={rule.isActive} className="accent-cream-700 cursor-pointer"
                        onChange={(e) => activeMutation.mutate({ ruleId: rule.id, isActive: e.target.checked })} />
                    </td>
                    <td className="py-2 pl-1 font-medium text-cream-800">{rule.keyword}</td>
                    <td className="py-2">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs", style.badge)}>{categoryFull(rule.category)}</span>
                    </td>
                    <td className="py-2 text-center">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs", rule.isExact ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600")}>
                        {rule.isExact ? "완전일치" : "포함"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => deleteMutation.mutate({ ruleId: rule.id })} disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-600 text-xs transition-colors disabled:opacity-50">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <AddRuleForm ruleType={ruleType} categories={cats} />
        </div>
      )}
    </div>
  );
}

export function MappingRulesTab() {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.budget.getCategoryRules.useQuery();

  const seedMutation = trpc.budget.seedDefaultRules.useMutation({
    onSuccess: (res) => {
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      toast.success(`기본 규칙 ${res.count}개가 추가되었습니다.`);
    },
    onError: () => toast.error("기본 규칙 추가에 실패했습니다."),
  });

  const generateMutation = trpc.budget.generateRulesFromTransactions.useMutation({
    onSuccess: (res) => {
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      toast.success(`거래내역에서 규칙 ${res.count}개를 생성했습니다.`);
    },
    onError: () => toast.error("규칙 자동 생성에 실패했습니다."),
  });

  const applyAllMutation = trpc.budget.applyRulesToAll.useMutation({
    onSuccess: (res) => {
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getMonthlyStats.invalidate();
      utils.budget.getTransactions.invalidate();
      utils.budget.getSavingsStats.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      if (res.count > 0) {
        toast.success(`${res.count}건의 거래에 규칙을 적용했습니다.`);
      } else {
        toast.info("매칭되는 거래가 없습니다. 규칙 키워드를 확인하세요.");
      }
    },
    onError: () => toast.error("재분류에 실패했습니다."),
  });

  const typedRules = (rules ?? []) as Rule[];
  const filtered = search
    ? typedRules.filter((r) => r.keyword.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase()))
    : typedRules;

  const byType = {
    income:     filtered.filter((r) => r.ruleType === "income"),
    savings:    filtered.filter((r) => r.ruleType === "savings"),
    investment: filtered.filter((r) => r.ruleType === "investment"),
    expense:    filtered.filter((r) => !["income", "savings", "investment"].includes(r.ruleType)),
  };

  return (
    <div className="space-y-4">
      {/* 전체 분류 체계 */}
      <HierarchyOverview />

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-serif text-base font-semibold text-cream-700">매핑 규칙</h3>
          <span className="text-sm text-cream-400">{typedRules.length}개</span>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="키워드/카테고리 검색..."
            className="border border-cream-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cream-500 w-44" />
          <Button variant="ghost" size="sm" onClick={() => applyAllMutation.mutate()} disabled={applyAllMutation.isPending}
            className="whitespace-nowrap text-xs text-emerald-600 hover:text-emerald-700 font-semibold">
            {applyAllMutation.isPending ? "적용 중..." : "전체 거래 규칙 재적용"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="whitespace-nowrap text-xs text-blue-600 hover:text-blue-700">
            {generateMutation.isPending ? "생성 중..." : "거래내역에서 자동 생성"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="whitespace-nowrap text-xs">
            {seedMutation.isPending ? "추가 중..." : "기본 규칙 불러오기"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-cream-400 px-1">
        체크박스를 해제하면 해당 규칙이 비활성화됩니다. <strong className="text-cream-600">기본 규칙 불러오기</strong> → <strong className="text-emerald-600">전체 거래 규칙 재적용</strong> 순서로 실행하면 기존 분류를 포함한 모든 내역에 새 규칙이 적용됩니다.
      </p>

      {isLoading ? (
        <div className="animate-pulse h-32 bg-cream-100 rounded-xl" />
      ) : (
        <div className="space-y-3">
          <RulesSection title="수입" ruleType="income"     rules={byType.income} />
          <RulesSection title="저축" ruleType="savings"    rules={byType.savings} />
          <RulesSection title="투자" ruleType="investment" rules={byType.investment} />
          <RulesSection title="지출" ruleType="expense"    rules={byType.expense} />
        </div>
      )}
    </div>
  );
}
