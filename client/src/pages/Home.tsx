import React, { useState, useEffect } from "react";
import { trpc, apiUrl } from "../lib/trpc";
import { formatKRW } from "../lib/format";
import { KpiCard } from "../components/KpiCard";
import { UploadZone } from "../components/UploadZone";
import { FilterPanel } from "../components/FilterPanel";
import { DashboardPieSection } from "../components/DashboardPieSection";
import { DashboardPivot } from "../components/DashboardPivot";
import { CategoryTab } from "../components/tabs/CategoryTab";
import { MonthlySummaryTab } from "../components/tabs/MonthlySummaryTab";
import { MappingRulesTab } from "../components/tabs/MappingRulesTab";
import { BudgetTab } from "../components/tabs/BudgetTab";
import { SubscriptionTab } from "../components/tabs/SubscriptionTab";
import { AccountsTab } from "../components/tabs/AccountsTab";
import { FamilyTab } from "../components/tabs/FamilyTab";
import { ReportPanel } from "../components/ReportPanel";
import { SmsImportModal } from "../components/SmsImportModal";
import { AppHeader } from "../components/AppHeader";
import { notifyBudgetAlerts } from "../lib/budgetNotify";
import { isBiometricLockEnabled, setBiometricLockEnabled } from "../components/BiometricGate";
import { TransactionsTab } from "../components/tabs/TransactionsTab";
import { useTheme } from "../contexts/ThemeContext";
import { UsageGuide } from "../components/UsageGuide";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { DateParts, buildDateRange } from "../lib/dateRange";
import { toast } from "sonner";

const EMPTY_DATE: DateParts = { y: "", m: "", d: "" };

type Tab = "dashboard" | "monthly" | "category" | "transactions" | "mapping" | "budget" | "subscription" | "accounts" | "family";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard",    label: "대시보드" },
  { id: "monthly",      label: "월별 요약" },
  { id: "category",     label: "카테고리별" },
  { id: "transactions", label: "전체 내역" },
  { id: "budget",       label: "예산" },
  { id: "subscription", label: "구독" },
  { id: "accounts",     label: "계좌" },
  { id: "family",       label: "가족" },
  { id: "mapping",      label: "매핑 규칙" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [includeTransfer, setIncludeTransfer] = useState(false);
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const [dashboardMemos, setDashboardMemos] = useState<Record<string, string>>({});
  const [showUpload, setShowUpload] = useState(false);
  const [diag, setDiag] = useState<null | { loading: boolean; result?: any; error?: string; elapsed?: number }>(null);
  // 대시보드 기간 필터 (월별 요약에는 적용 안 함)
  const [dashStart, setDashStart] = useState<DateParts>(EMPTY_DATE);
  const [dashEnd, setDashEnd] = useState<DateParts>(EMPTY_DATE);
  // 전역 소유자 필터 ('' = 전체) — 모든 화면의 데이터에 적용
  const [ownerFilter, setOwnerFilter] = useState<"" | "동현" | "혜진">("");
  const { theme, toggleTheme } = useTheme();
  const [lockOn, setLockOn] = useState(isBiometricLockEnabled());
  const [showSms, setShowSms] = useState(false);

  const dashRange = buildDateRange(dashStart, dashEnd);
  const dateParams = dashRange ? { dateStart: dashRange.start, dateEnd: dashRange.end } : {};
  const ownerParam = ownerFilter ? { owner: ownerFilter } : {};

  const utils = trpc.useUtils();
  const { data: settings } = trpc.budget.getSettings.useQuery();
  const saveSettingsMutation = trpc.budget.saveSettings.useMutation();
  const saveMemosMutation = trpc.budget.saveDashboardMemos.useMutation({
    onError: () => toast.error("메모 저장에 실패했습니다. 다시 시도해주세요."),
  });

  const { data: kpi, isLoading: kpiLoading } = trpc.budget.getKpiSummary.useQuery({
    includeTransfer,
    excludedCategories,
    ...dateParams,
    ...ownerParam,
  });

  const { data: catStats, isLoading: catLoading } = trpc.budget.getCategoryStats.useQuery({
    includeTransfer,
    excludedCategories,
    ...dateParams,
    ...ownerParam,
  });

  const { data: pivotData } = trpc.budget.getPivotData.useQuery({
    includeTransfer,
    excludedCategories,
    ...dateParams,
    ...ownerParam,
  });

  useEffect(() => {
    if (settings) {
      setIncludeTransfer(settings.includeTransfer);
      setExcludedCategories(settings.excludedCategories);
      setDashboardMemos(settings.dashboardMemos ?? {});
    }
  }, [settings]);

  async function runDiagnostics() {
    setDiag({ loading: true });
    const start = Date.now();
    try {
      const result = await utils.budget.diagnostics.fetch();
      setDiag({ loading: false, result, elapsed: Date.now() - start });
    } catch (e: any) {
      setDiag({ loading: false, error: e?.message ?? "진단 실패", elapsed: Date.now() - start });
    }
  }

  function handleMemoCommit(key: string, value: string) {
    const next = { ...dashboardMemos, [key]: value };
    setDashboardMemos(next);
    saveMemosMutation.mutate({ memos: next });
  }

  function handleIncludeTransferChange(v: boolean) {
    setIncludeTransfer(v);
    saveSettingsMutation.mutate({ includeTransfer: v, excludedCategories });
  }

  function handleExcludedCategoriesChange(cats: string[]) {
    setExcludedCategories(cats);
    saveSettingsMutation.mutate({ includeTransfer, excludedCategories: cats });
  }

  // ── 예산 임계치 알림 ─────────────────────────────────────────
  const checkAlertsMutation = trpc.budget.checkBudgetAlerts.useMutation();
  function runBudgetAlertCheck() {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    checkAlertsMutation.mutate(
      { yearMonth },
      { onSuccess: (alerts) => { if (alerts?.length) notifyBudgetAlerts(alerts); } }
    );
  }
  // 앱 진입 시 1회 확인
  useEffect(() => { runBudgetAlertCheck(); /* eslint-disable-line */ }, []);

  function onUploadSuccess() {
    utils.budget.getKpiSummary.invalidate();
    utils.budget.getMonthlyStats.invalidate();
    utils.budget.getCategoryStats.invalidate();
    utils.budget.getPivotData.invalidate();
    utils.budget.getSavingsStats.invalidate();
    utils.budget.getTransactions.invalidate();
    utils.budget.getIncomeDistribution.invalidate();
    utils.budget.getBudgets.invalidate();
    setShowUpload(false);
    // 새 지출이 반영됐으니 임계치 재확인
    runBudgetAlertCheck();
  }

  // 순자산 증감 = 수입 − 지출 (저축·투자는 소비가 아니라 자산 이동이므로 빼지 않음).
  // 잔여 현금 = 그 중 저축/투자로 넣지 않고 통장에 남은 여윳돈 (= 수입 − 지출 − 저축).
  const netWorth = (kpi?.totalIncome ?? 0) - (kpi?.totalExpense ?? 0);
  const leftoverCash = netWorth - (kpi?.totalSavings ?? 0);

  return (
    <div className="min-h-screen bg-cream-50">
      <AppHeader
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as Tab)}
        showDashboardActions={activeTab === "dashboard"}
        onUploadToggle={() => setShowUpload((v) => !v)}
        onSmsOpen={() => setShowSms(true)}
        ownerFilter={ownerFilter}
        onOwnerChange={setOwnerFilter}
        onDiagnostics={runDiagnostics}
        theme={theme}
        onToggleTheme={toggleTheme}
        lockOn={lockOn}
        onToggleLock={() => {
          const next = !lockOn;
          setBiometricLockEnabled(next);
          setLockOn(next);
          toast.success(next ? "앱 생체 잠금을 켰습니다 (앱에서 적용)" : "앱 잠금을 껐습니다");
        }}
        onLogout={async () => {
          await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include" });
          await utils.budget.me.invalidate();
        }}
      />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Upload zone — collapsible on dashboard */}
        {activeTab === "dashboard" && showUpload && (
          <UploadZone onSuccess={onUploadSuccess} />
        )}

        {showSms && <SmsImportModal onClose={() => setShowSms(false)} onSaved={onUploadSuccess} />}

        {/* Filter panel — monthly & category tabs only */}
        {(activeTab === "monthly" || activeTab === "category") && (
          <FilterPanel
            includeTransfer={includeTransfer}
            excludedCategories={excludedCategories}
            onIncludeTransferChange={handleIncludeTransferChange}
            onExcludedCategoriesChange={handleExcludedCategoriesChange}
          />
        )}

        {/* ── Dashboard ── */}
        {activeTab === "dashboard" && (
          <>
            {/* 주간/월간 리포트 */}
            <ReportPanel />

            {/* 기간 필터 */}
            <div className="bg-white rounded-xl border border-cream-200 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-cream-600">기간</span>
              <DateRangeFilter
                start={dashStart}
                end={dashEnd}
                onChange={(s, e) => { setDashStart(s); setDashEnd(e); }}
              />
              {!dashRange && <span className="text-xs text-cream-400">전체 기간 (년만 입력하면 그 해 전체)</span>}
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="총 수입"
                value={kpiLoading ? "..." : formatKRW(kpi?.totalIncome ?? 0)}
                subtitle={`${kpi?.monthCount ?? 0}개월 합산`}
                icon="💰"
                valueClass="text-gray-900"
                memo={dashboardMemos.income}
                onMemoCommit={(v) => handleMemoCommit("income", v)}
              />
              <KpiCard
                title="총 저축/투자"
                value={kpiLoading ? "..." : formatKRW(kpi?.totalSavings ?? 0)}
                subtitle="저축·투자 합산"
                icon="💙"
                valueClass="text-blue-600"
                memo={dashboardMemos.savings}
                onMemoCommit={(v) => handleMemoCommit("savings", v)}
              />
              <KpiCard
                title="총 지출"
                value={kpiLoading ? "..." : formatKRW(kpi?.totalExpense ?? 0)}
                subtitle={`${kpi?.monthCount ?? 0}개월 합산`}
                icon="💸"
                valueClass="text-red-500"
                memo={dashboardMemos.expense}
                onMemoCommit={(v) => handleMemoCommit("expense", v)}
              />
              <KpiCard
                title="순자산 증감"
                value={kpiLoading ? "..." : formatKRW(netWorth)}
                subtitle={kpiLoading ? "수입 − 지출" : `수입−지출 (저축 포함) · 잔여현금 ${formatKRW(leftoverCash)}`}
                icon="📈"
                memo={dashboardMemos.netAsset}
                onMemoCommit={(v) => handleMemoCommit("netAsset", v)}
              />
            </div>

            {/* Dual pie charts */}
            <DashboardPieSection
              catStats={(catStats ?? []) as any}
              isLoading={catLoading}
            />

            {/* Monthly pivot */}
            {pivotData && pivotData.length > 0 && (
              <DashboardPivot pivotData={pivotData as any} />
            )}

            {/* Usage guide */}
            <UsageGuide />
          </>
        )}

        {/* ── Other tabs ── */}
        {activeTab === "monthly" && (
          <MonthlySummaryTab
            includeTransfer={includeTransfer}
            excludedCategories={excludedCategories}
            owner={ownerFilter}
          />
        )}
        {activeTab === "category" && (
          <CategoryTab
            includeTransfer={includeTransfer}
            excludedCategories={excludedCategories}
            owner={ownerFilter}
          />
        )}
        {activeTab === "transactions" && <TransactionsTab owner={ownerFilter} />}
        {activeTab === "budget" && <BudgetTab />}
        {activeTab === "subscription" && <SubscriptionTab />}
        {activeTab === "accounts" && <AccountsTab />}
        {activeTab === "family" && <FamilyTab />}
        {activeTab === "mapping" && <MappingRulesTab />}
      </main>

      {/* 진단 결과 모달 */}
      {diag && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !diag.loading && setDiag(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-cream-200 w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-bold text-cream-800">🔧 시스템 진단</h2>
              {!diag.loading && (
                <button onClick={() => setDiag(null)} className="text-cream-400 hover:text-cream-700 text-xl">×</button>
              )}
            </div>

            {diag.loading && (
              <p className="text-cream-600 text-sm py-6 text-center">측정 중... (최대 60초)</p>
            )}

            {diag.error && (
              <div className="text-sm space-y-2">
                <p className="text-red-600 font-medium">❌ 서버 응답 실패 ({((diag.elapsed ?? 0) / 1000).toFixed(1)}초 후)</p>
                <p className="text-cream-600 break-words">{diag.error}</p>
                <p className="text-cream-500 text-xs">
                  → 요청이 서버까지 도달하지 못했거나 서버가 멈춘 상태입니다. PostgreSQL 서비스가 켜져 있는지 확인해주세요.
                </p>
              </div>
            )}

            {diag.result && (
              <div className="text-sm space-y-3">
                <div className="flex justify-between border-b border-cream-100 pb-1.5">
                  <span className="text-cream-500">코드 버전</span>
                  <span className="font-mono font-medium text-cream-800">{diag.result.version}</span>
                </div>
                <div className="flex justify-between border-b border-cream-100 pb-1.5">
                  <span className="text-cream-500">DB 연결</span>
                  <span className={diag.result.dbConnected ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                    {diag.result.dbConnected ? "정상" : "실패"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-cream-100 pb-1.5">
                  <span className="text-cream-500">저장된 거래 수</span>
                  <span className="font-medium text-cream-800">{diag.result.txCount.toLocaleString()}건</span>
                </div>
                <div className="flex justify-between border-b border-cream-100 pb-1.5">
                  <span className="text-cream-500">매핑 규칙 수</span>
                  <span className={`font-medium ${diag.result.ruleCount > 2000 ? "text-red-600" : "text-cream-800"}`}>
                    {diag.result.ruleCount.toLocaleString()}개{diag.result.ruleCount > 2000 ? " ⚠️ 많음" : ""}
                  </span>
                </div>
                <div className="pt-1">
                  <p className="text-cream-500 mb-1.5">기능별 응답 속도</p>
                  {Object.entries(diag.result.timings as Record<string, number>).map(([k, ms]) => (
                    <div key={k} className="flex justify-between py-0.5">
                      <span className="font-mono text-xs text-cream-600">{k}</span>
                      <span className={`font-mono text-xs font-medium ${ms >= 3000 ? "text-red-600" : ms >= 1000 ? "text-amber-600" : "text-emerald-600"}`}>
                        {(ms / 1000).toFixed(2)}초{ms >= 3000 ? " 느림!" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-cream-400 text-xs pt-2 border-t border-cream-100">
                  이 화면을 캡처해서 보내주시면 원인을 바로 확인할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
