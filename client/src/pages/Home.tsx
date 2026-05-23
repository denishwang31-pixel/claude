import React, { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { formatKRW } from "../lib/format";
import { KpiCard } from "../components/KpiCard";
import { UploadZone } from "../components/UploadZone";
import { FilterPanel } from "../components/FilterPanel";
import { CategoryTab } from "../components/tabs/CategoryTab";
import { MonthlySummaryTab } from "../components/tabs/MonthlySummaryTab";
import { MappingRulesTab } from "../components/tabs/MappingRulesTab";
import { TransactionsTab } from "../components/tabs/TransactionsTab";
import { IncomeDistributionPanel } from "../components/IncomeDistributionPanel";
import { useTheme } from "../contexts/ThemeContext";

type Tab = "dashboard" | "monthly" | "category" | "transactions" | "mapping";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "monthly", label: "월별 요약" },
  { id: "category", label: "카테고리별" },
  { id: "transactions", label: "전체 내역" },
  { id: "mapping", label: "매핑 규칙" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [includeTransfer, setIncludeTransfer] = useState(false);
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const { theme, toggleTheme } = useTheme();

  const utils = trpc.useUtils();
  const { data: settings } = trpc.budget.getSettings.useQuery();
  const saveSettingsMutation = trpc.budget.saveSettings.useMutation();

  const { data: kpi, isLoading: kpiLoading } = trpc.budget.getKpiSummary.useQuery({
    includeTransfer,
    excludedCategories,
  });

  // Load saved settings on mount
  useEffect(() => {
    if (settings) {
      setIncludeTransfer(settings.includeTransfer);
      setExcludedCategories(settings.excludedCategories);
    }
  }, [settings]);

  function handleIncludeTransferChange(v: boolean) {
    setIncludeTransfer(v);
    saveSettingsMutation.mutate({ includeTransfer: v, excludedCategories });
  }

  function handleExcludedCategoriesChange(cats: string[]) {
    setExcludedCategories(cats);
    saveSettingsMutation.mutate({ includeTransfer, excludedCategories: cats });
  }

  function onUploadSuccess() {
    utils.budget.getKpiSummary.invalidate();
    utils.budget.getMonthlyStats.invalidate();
    utils.budget.getCategoryStats.invalidate();
    utils.budget.getPivotData.invalidate();
    utils.budget.getSavingsStats.invalidate();
    utils.budget.getTransactions.invalidate();
    utils.budget.getIncomeDistribution.invalidate();
  }

  const avgMonthly =
    kpi && kpi.monthCount > 0 ? kpi.totalExpense / kpi.monthCount : 0;

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="bg-white border-b border-cream-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
          <h1 className="font-serif text-xl font-bold text-cream-800">가계부 대시보드</h1>
          <button
            onClick={toggleTheme}
            className="text-cream-500 hover:text-cream-700 text-lg transition-colors"
            title="테마 전환"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>

        {/* Tab bar */}
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto pb-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-cream-700 text-cream-800"
                    : "border-transparent text-cream-500 hover:text-cream-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Upload zone — always visible on dashboard */}
        {activeTab === "dashboard" && (
          <UploadZone onSuccess={onUploadSuccess} />
        )}

        {/* Filter panel — visible on data tabs */}
        {(activeTab === "dashboard" || activeTab === "monthly" || activeTab === "category") && (
          <FilterPanel
            includeTransfer={includeTransfer}
            excludedCategories={excludedCategories}
            onIncludeTransferChange={handleIncludeTransferChange}
            onExcludedCategoriesChange={handleExcludedCategoriesChange}
          />
        )}

        {/* Dashboard tab: KPI cards */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 지출"
              value={kpiLoading ? "..." : formatKRW(kpi?.totalExpense ?? 0)}
              subtitle={`${kpi?.monthCount ?? 0}개월 합산`}
              icon="💸"
            />
            <KpiCard
              title="월 평균 지출"
              value={kpiLoading ? "..." : formatKRW(avgMonthly)}
              subtitle="지출 / 월 수"
              icon="📅"
            />
            <KpiCard
              title="총 수입"
              value={kpiLoading ? "..." : formatKRW(kpi?.totalIncome ?? 0)}
              subtitle={`${kpi?.monthCount ?? 0}개월 합산`}
              icon="💰"
            />
            <KpiCard
              title="순자산 증감"
              value={
                kpiLoading
                  ? "..."
                  : formatKRW((kpi?.totalIncome ?? 0) - (kpi?.totalExpense ?? 0))
              }
              subtitle="수입 - 지출"
              icon="📈"
            />
          </div>
        )}

        {/* Dashboard: Income Distribution Panel */}
        {activeTab === "dashboard" && (
          <IncomeDistributionPanel />
        )}

        {/* Tab content */}
        {activeTab === "dashboard" && (
          <CategoryTab
            includeTransfer={includeTransfer}
            excludedCategories={excludedCategories}
          />
        )}
        {activeTab === "monthly" && (
          <MonthlySummaryTab
            includeTransfer={includeTransfer}
            excludedCategories={excludedCategories}
          />
        )}
        {activeTab === "category" && (
          <CategoryTab
            includeTransfer={includeTransfer}
            excludedCategories={excludedCategories}
          />
        )}
        {activeTab === "transactions" && <TransactionsTab />}
        {activeTab === "mapping" && <MappingRulesTab />}
      </main>
    </div>
  );
}
