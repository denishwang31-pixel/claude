import React, { useState, useEffect, useRef } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW, formatDate } from "../../lib/format";
import { CategoryDropdown } from "../CategoryDropdown";
import { Button } from "../ui/button";
import { downloadTransactionsExcel } from "../../lib/downloadExcel";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { L1_LIST, L2_BY_L1, l3ListForL2, resolveCategoryFilter, signedPath } from "../../lib/categories";
import { DateRangeFilter } from "../DateRangeFilter";
import { DateParts, buildDateRange } from "../../lib/dateRange";

const PAGE_SIZE = 50;

const SEARCH_FIELDS = [
  { id: "content",      label: "내용" },
  { id: "category",     label: "카테고리(L1/L2/L3)" },
  { id: "dateRange",    label: "기간(날짜)" },
  { id: "amount_gte",   label: "금액 이상" },
  { id: "paymentMethod",label: "결제수단" },
  { id: "txType",       label: "타입" },
  { id: "date",         label: "월" },
] as const;

const EMPTY_DATE: DateParts = { y: "", m: "", d: "" };

type SearchField = typeof SEARCH_FIELDS[number]["id"];

export function TransactionsTab() {
  const [page, setPage] = useState(1);
  const [searchField, setSearchField] = useState<SearchField>("content");
  const [searchQuery, setSearchQuery] = useState("");
  // 카테고리 계단식 필터
  const [catL1, setCatL1] = useState("");
  const [catL2, setCatL2] = useState("");
  const [catL3, setCatL3] = useState("");
  // 기간 필터
  const [dateStart, setDateStart] = useState<DateParts>(EMPTY_DATE);
  const [dateEnd, setDateEnd] = useState<DateParts>(EMPTY_DATE);

  useEffect(() => { setPage(1); }, [searchField, searchQuery, catL1, catL2, catL3, dateStart, dateEnd]);

  const utils = trpc.useUtils();

  let filter: { field: string; query: string } | undefined;
  if (searchField === "category") {
    if (catL1 === "income") {
      // 수입은 부호 기반(양수 전체) — 카테고리 집합 불필요
      filter = { field: "categories", query: "income|" };
    } else {
      const cats = resolveCategoryFilter(catL1, catL2, catL3);
      filter = cats.length ? { field: "categories", query: `${catL1}|${cats.join(",")}` } : undefined;
    }
  } else if (searchField === "dateRange") {
    const range = buildDateRange(dateStart, dateEnd);
    filter = range ? { field: "dateRange", query: `${range.start}|${range.end}` } : undefined;
  } else if (searchQuery.trim()) {
    filter = { field: searchField, query: searchQuery.trim() };
  }

  const { data, isLoading } = trpc.budget.getTransactions.useQuery({ page, pageSize: PAGE_SIZE, filter });

  const memoMutation = trpc.budget.updateMemo.useMutation({
    onSuccess: () => utils.budget.getTransactions.invalidate(),
    onError: () => toast.error("메모 저장에 실패했습니다."),
  });

  const toggleMutation = trpc.budget.toggleExcluded.useMutation({
    onSuccess: () => {
      utils.budget.getTransactions.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getMonthlyStats.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getSavingsStats.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
    },
  });

  const clearExclMutation = trpc.budget.clearAllExclusions.useMutation({
    onSuccess: (res) => {
      utils.budget.getTransactions.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getMonthlyStats.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getSavingsStats.invalidate();
      utils.budget.getIncomeDistribution.invalidate();
      toast.success(`제외 ${res.cleared}건을 모두 해제했습니다.`);
    },
    onError: () => toast.error("제외 해제에 실패했습니다."),
  });

  const exportQuery = trpc.budget.getAllTransactionsForExport.useQuery(undefined, { enabled: false });

  async function handleExport() {
    const result = await exportQuery.refetch();
    if (result.data) {
      downloadTransactionsExcel(result.data.rows as any, result.data.excludedIds);
    }
  }

  const excludedSet = new Set(data?.excludedIds ?? []);
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm px-4 py-3 flex items-center gap-2 flex-wrap">
        <select
          value={searchField}
          onChange={(e) => { setSearchField(e.target.value as SearchField); setSearchQuery(""); setCatL1(""); setCatL2(""); setCatL3(""); setDateStart(EMPTY_DATE); setDateEnd(EMPTY_DATE); }}
          className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500"
        >
          {SEARCH_FIELDS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>

        {searchField === "category" ? (
          <div className="flex items-center gap-2 flex-wrap">
            {/* L1 */}
            <select
              value={catL1}
              onChange={(e) => { setCatL1(e.target.value); setCatL2(""); setCatL3(""); }}
              className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500"
            >
              <option value="">L1 전체</option>
              {L1_LIST.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            {/* L2 */}
            <select
              value={catL2}
              onChange={(e) => { setCatL2(e.target.value); setCatL3(""); }}
              disabled={!catL1}
              className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500 disabled:opacity-40"
            >
              <option value="">L2 전체</option>
              {(L2_BY_L1[catL1] ?? []).map((l2) => <option key={l2} value={l2}>{l2}</option>)}
            </select>
            {/* L3 */}
            <select
              value={catL3}
              onChange={(e) => setCatL3(e.target.value)}
              disabled={!catL2}
              className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500 disabled:opacity-40"
            >
              <option value="">L3 전체</option>
              {(catL1 && catL2 ? l3ListForL2(catL1, catL2) : []).map((l3) => <option key={l3} value={l3}>{l3}</option>)}
            </select>
            {(catL1 || catL2 || catL3) && (
              <button
                onClick={() => { setCatL1(""); setCatL2(""); setCatL3(""); }}
                className="text-cream-400 hover:text-cream-600 text-base leading-none px-0.5"
              >
                ✕
              </button>
            )}
          </div>
        ) : searchField === "dateRange" ? (
          <DateRangeFilter
            start={dateStart}
            end={dateEnd}
            onChange={(s, e) => { setDateStart(s); setDateEnd(e); }}
          />
        ) : searchField === "txType" ? (
          <select
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500"
          >
            <option value="">전체</option>
            <option value="수입">수입</option>
            <option value="지출">지출</option>
            <option value="이체">이체</option>
          </select>
        ) : searchField === "date" ? (
          <input
            type="month"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500"
          />
        ) : searchField === "amount_gte" ? (
          <input
            type="number"
            min="0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="최소 금액 (원)"
            className="border border-cream-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cream-500 w-44"
          />
        ) : (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`${SEARCH_FIELDS.find((f) => f.id === searchField)?.label} 검색...`}
            className="border border-cream-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cream-500 flex-1 min-w-[160px]"
          />
        )}

        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-cream-400 hover:text-cream-600 text-base leading-none px-0.5"
          >
            ✕
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-cream-500">
            {filter ? (
              <><span className="font-semibold text-cream-800">{data?.total ?? 0}</span>건 검색됨</>
            ) : (
              <>전체 <span className="font-semibold text-cream-800">{data?.total ?? 0}</span>건</>
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={() => clearExclMutation.mutate()} disabled={clearExclMutation.isPending}
            className="text-xs text-cream-500 hover:text-cream-700 whitespace-nowrap">
            {clearExclMutation.isPending ? "해제 중..." : "제외 전체 해제"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            엑셀 다운로드
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-cream-400">불러오는 중...</div>
        ) : !data?.rows.length ? (
          <div className="flex items-center justify-center h-40 text-cream-400">
            {filter ? "검색 결과가 없습니다." : "거래 내역이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream-50">
                <tr>
                  <th className="text-left px-4 py-3 text-cream-600 font-medium">날짜</th>
                  <th className="text-left px-4 py-3 text-cream-600 font-medium">내용</th>
                  <th className="text-left px-4 py-3 text-cream-600 font-medium">카테고리</th>
                  <th className="text-right px-4 py-3 text-cream-600 font-medium">금액</th>
                  <th className="text-center px-4 py-3 text-cream-600 font-medium">결제수단</th>
                  <th className="text-center px-4 py-3 text-cream-600 font-medium">타입</th>
                  <th className="text-center px-4 py-3 text-cream-600 font-medium">제외</th>
                  <th className="text-left px-4 py-3 text-cream-600 font-medium">메모</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const isExcluded = excludedSet.has(Number(row.id));
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-cream-100 hover:bg-cream-50 transition-colors",
                        isExcluded && "opacity-40"
                      )}
                    >
                      <td className="px-4 py-2.5 text-cream-500 whitespace-nowrap">
                        {formatDate(row.txDate as string)}
                      </td>
                      <td className="px-4 py-2.5 text-cream-800 max-w-[200px] truncate">
                        {row.content}
                      </td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const cat = ((row as any).effectiveCategory ?? row.customCategory ?? row.category) as string;
                          const { path, excluded } = signedPath(cat, Number(row.amount));
                          return (
                            <div className="flex flex-col gap-0.5">
                              <CategoryDropdown
                                transactionId={Number(row.id)}
                                currentCategory={cat}
                                content={row.content as string}
                                onChanged={() => {
                                  utils.budget.getTransactions.invalidate();
                                  utils.budget.getCategoryStats.invalidate();
                                }}
                              />
                              <span className={cn(
                                "text-[10px] whitespace-nowrap",
                                excluded ? "text-blue-400 italic" : "text-cream-400"
                              )}>{path}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className={cn(
                        "px-4 py-2.5 text-right font-medium tabular-nums",
                        Number(row.amount) > 0 ? "text-emerald-600" : "text-cream-800"
                      )}>
                        {Number(row.amount) > 0 ? "+" : "−"}{formatKRW(Math.abs(Number(row.amount)))}
                      </td>
                      <td className="px-4 py-2.5 text-center text-cream-500 text-xs whitespace-nowrap">
                        {(row.paymentMethod as string) ?? ""}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-xs",
                            row.txType === "수입"
                              ? "bg-emerald-100 text-emerald-700"
                              : row.txType === "이체"
                              ? "bg-blue-100 text-blue-600"
                              : "bg-orange-100 text-orange-600"
                          )}
                        >
                          {row.txType as string}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          className="accent-cream-700"
                          onChange={(e) =>
                            toggleMutation.mutate({
                              transactionIds: [Number(row.id)],
                              excluded: e.target.checked,
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <MemoCell
                          initial={(row.memo as string) ?? ""}
                          onCommit={(memo) => memoMutation.mutate({ transactionId: Number(row.id), memo })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← 이전
          </Button>
          <span className="text-sm text-cream-600">
            {page} / {totalPages} 페이지
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음 →
          </Button>
        </div>
      )}
    </div>
  );
}

function MemoCell({ initial, onCommit }: { initial: string; onCommit: (memo: string) => void }) {
  const [value, setValue] = useState(initial);
  const escaped = useRef(false);
  useEffect(() => { setValue(initial); }, [initial]);

  function commit() {
    if (escaped.current) { escaped.current = false; return; }
    const v = value.trim();
    if (v !== initial) onCommit(v);
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { escaped.current = true; setValue(initial); (e.target as HTMLInputElement).blur(); }
      }}
      title="Enter: 저장 · Esc: 취소"
      placeholder="메모..."
      className="w-36 rounded-md border border-cream-100 bg-cream-50/50 px-2 py-1 text-xs text-cream-700 placeholder:text-cream-300 focus:outline-none focus:border-cream-300 focus:bg-white transition-colors"
    />
  );
}
