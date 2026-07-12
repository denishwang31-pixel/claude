import React, { useState } from "react";
import { trpc } from "../lib/trpc";
import { formatKRW, formatDate, formatYearMonth } from "../lib/format";
import { categoryFull } from "../lib/categories";
import { CategoryDropdown } from "./CategoryDropdown";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

interface Props {
  category: string;
  yearMonth?: string;
  dateStart?: string;
  dateEnd?: string;
  owner?: string;
  onClose: () => void;
}

const PAGE_SIZE = 30;

export function CategoryDetailModal({ category, yearMonth, dateStart, dateEnd, owner, onClose }: Props) {
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.budget.getCategoryTransactions.useQuery({
    category,
    page,
    pageSize: PAGE_SIZE,
    yearMonth,
    dateStart,
    dateEnd,
    owner: owner || undefined,
  });

  const toggleMutation = trpc.budget.toggleExcluded.useMutation({
    onSuccess: () => refetch(),
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200">
          <h2 className="font-serif text-xl font-semibold text-cream-800">
            {categoryFull(category)}
            {yearMonth && (
              <span className="text-sm font-sans font-normal text-cream-500 ml-2">
                · {formatYearMonth(yearMonth)}
              </span>
            )}
            {data && (
              <span className="text-sm font-sans font-normal text-cream-500 ml-2">
                · {data.total}건 · {formatKRW(data.rows.reduce((s: number, r: any) => s + Math.abs(Number(r.amount)), 0))}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-cream-400 hover:text-cream-700 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-cream-400">불러오는 중...</div>
          ) : !data?.rows.length ? (
            <div className="flex items-center justify-center h-40 text-cream-400">거래 내역이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-cream-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-cream-600 font-medium">날짜</th>
                  <th className="text-left px-4 py-2 text-cream-600 font-medium">내용</th>
                  <th className="text-left px-4 py-2 text-cream-600 font-medium">카테고리</th>
                  <th className="text-right px-4 py-2 text-cream-600 font-medium">금액</th>
                  <th className="text-center px-4 py-2 text-cream-600 font-medium">결제수단</th>
                  <th className="text-center px-4 py-2 text-cream-600 font-medium">제외</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row: any) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-t border-cream-100 hover:bg-cream-50 transition-colors",
                    )}
                  >
                    <td className="px-4 py-2.5 text-cream-500 whitespace-nowrap">
                      {formatDate(row.txDate)}
                    </td>
                    <td className="px-4 py-2.5 text-cream-800">
                      {row.content}
                      {row.memo && (
                        <span className="text-cream-400 text-xs ml-1">({row.memo})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <CategoryDropdown
                        transactionId={row.id}
                        currentCategory={row.effectiveCategory ?? row.customCategory ?? row.category}
                        content={row.content}
                        onChanged={() => refetch()}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-cream-800">
                      {formatKRW(Math.abs(Number(row.amount)))}
                    </td>
                    <td className="px-4 py-2.5 text-center text-cream-500 text-xs">
                      {row.paymentMethod ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
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
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-6 py-3 border-t border-cream-100">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </Button>
            <span className="text-sm text-cream-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
