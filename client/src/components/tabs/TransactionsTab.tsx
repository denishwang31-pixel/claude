import React, { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW, formatDate } from "../../lib/format";
import { CategoryDropdown } from "../CategoryDropdown";
import { Button } from "../ui/button";
import { downloadTransactionsExcel } from "../../lib/downloadExcel";
import { cn } from "../../lib/utils";

const PAGE_SIZE = 50;

const SEARCH_FIELDS = [
  { id: "content",      label: "내용" },
  { id: "category",     label: "카테고리" },
  { id: "amount_gte",   label: "금액 이상" },
  { id: "paymentMethod",label: "결제수단" },
  { id: "txType",       label: "타입" },
  { id: "date",         label: "월" },
] as const;

type SearchField = typeof SEARCH_FIELDS[number]["id"];

export function TransactionsTab() {
  const [page, setPage] = useState(1);
  const [searchField, setSearchField] = useState<SearchField>("content");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { setPage(1); }, [searchField, searchQuery]);

  const utils = trpc.useUtils();
  const filter = searchQuery.trim() ? { field: searchField, query: searchQuery.trim() } : undefined;

  const { data, isLoading } = trpc.budget.getTransactions.useQuery({ page, pageSize: PAGE_SIZE, filter });

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
          onChange={(e) => { setSearchField(e.target.value as SearchField); setSearchQuery(""); }}
          className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500"
        >
          {SEARCH_FIELDS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>

        {searchField === "txType" ? (
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
                        {row.memo && (
                          <span className="text-cream-400 text-xs ml-1">({row.memo})</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <CategoryDropdown
                          transactionId={Number(row.id)}
                          currentCategory={(row.customCategory ?? row.category) as string}
                          content={row.content as string}
                          onChanged={() => {
                            utils.budget.getTransactions.invalidate();
                            utils.budget.getCategoryStats.invalidate();
                          }}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-cream-800">
                        {formatKRW(Math.abs(Number(row.amount)))}
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
