import React, { useState } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW, formatDate } from "../../lib/format";
import { CategoryDropdown } from "../CategoryDropdown";
import { Button } from "../ui/button";
import { downloadTransactionsExcel } from "../../lib/downloadExcel";
import { cn } from "../../lib/utils";

const PAGE_SIZE = 50;

export function TransactionsTab() {
  const [page, setPage] = useState(1);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.budget.getTransactions.useQuery({ page, pageSize: PAGE_SIZE });
  const { data: exportData } = trpc.budget.getAllTransactionsForExport.useQuery(undefined, {
    enabled: false,
  });

  const toggleMutation = trpc.budget.toggleExcluded.useMutation({
    onSuccess: () => utils.budget.getTransactions.invalidate(),
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-cream-600">
          전체 <span className="font-semibold text-cream-800">{data?.total ?? 0}</span>건
        </p>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          엑셀 다운로드
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-cream-400">불러오는 중...</div>
        ) : !data?.rows.length ? (
          <div className="flex items-center justify-center h-40 text-cream-400">거래 내역이 없습니다.</div>
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
                  const isExcluded = excludedSet.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-cream-100 hover:bg-cream-50 transition-colors",
                        isExcluded && "opacity-40"
                      )}
                    >
                      <td className="px-4 py-2.5 text-cream-500 whitespace-nowrap">
                        {formatDate(row.txDate)}
                      </td>
                      <td className="px-4 py-2.5 text-cream-800 max-w-[200px] truncate">
                        {row.content}
                        {row.memo && (
                          <span className="text-cream-400 text-xs ml-1">({row.memo})</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <CategoryDropdown
                          transactionId={row.id}
                          currentCategory={row.customCategory ?? row.category}
                          content={row.content}
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
                        {row.paymentMethod ?? ""}
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
                          {row.txType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          className="accent-cream-700"
                          onChange={(e) =>
                            toggleMutation.mutate({
                              transactionIds: [row.id],
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

      {/* Pagination */}
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
