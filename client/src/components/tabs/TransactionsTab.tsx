import React, { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "../../lib/trpc";
import { formatKRW, formatDate } from "../../lib/format";
import { CategoryDropdown } from "../CategoryDropdown";
import { ColumnFilter, FilterOption } from "../ColumnFilter";
import { ManualEntryModal } from "../ManualEntryModal";
import { Button } from "../ui/button";
import { downloadTransactionsExcel } from "../../lib/downloadExcel";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { L1_LIST, L2_BY_L1, l3ListForL2, resolveCategoryFilter, signedPath, EXPENSE_TREE, INCOME_L3 } from "../../lib/categories";
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

// 카테고리 컬럼 필터 선택지 — L1 › L2 그룹으로 L3 나열
const CATEGORY_FILTER_OPTIONS: FilterOption[] = [
  ...EXPENSE_TREE.flatMap((g) =>
    g.items.map((it) => ({ value: it.key, label: it.label, group: `지출 › ${g.l2}` }))),
  { value: "장기저축", label: "장기 저축", group: "저축/투자" },
  { value: "단기저축", label: "단기 저축", group: "저축/투자" },
  { value: "저축", label: "저축(미분류)", group: "저축/투자" },
  { value: "투자", label: "투자", group: "저축/투자" },
  ...INCOME_L3.map((it) => ({ value: it.key, label: it.label, group: "수입" })),
];

interface Props {
  owner?: string; // ''(전체) | 동현 | 혜진 — 전역 소유자 필터
}

export function TransactionsTab({ owner }: Props) {
  const [page, setPage] = useState(1);
  const [searchField, setSearchField] = useState<SearchField>("content");
  const [searchQuery, setSearchQuery] = useState("");
  // 상단 검색: 카테고리 계단식 필터
  const [catL1, setCatL1] = useState("");
  const [catL2, setCatL2] = useState("");
  const [catL3, setCatL3] = useState("");
  // 상단 검색: 기간 필터
  const [dateStart, setDateStart] = useState<DateParts>(EMPTY_DATE);
  const [dateEnd, setDateEnd] = useState<DateParts>(EMPTY_DATE);
  // 컬럼(엑셀식) 필터 — 내용은 입력값/쿼리값 분리 + 디바운스
  // (글자마다 쿼리가 나가면 테이블이 로딩으로 교체되며 한글 조합이 끊기므로)
  const [colContent, setColContent] = useState("");
  const [colContentQ, setColContentQ] = useState("");
  const [colCats, setColCats] = useState<string[]>([]);
  const [colPMs, setColPMs] = useState<string[]>([]);
  const [colTypes, setColTypes] = useState<string[]>([]);
  // 수기 입력 모달
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setColContentQ(colContent.trim()), 350);
    return () => clearTimeout(t);
  }, [colContent]);

  useEffect(() => { setPage(1); }, [searchField, searchQuery, catL1, catL2, catL3, dateStart, dateEnd, colContentQ, colCats, colPMs, colTypes, owner]);

  const utils = trpc.useUtils();

  // ── 상단 검색 필터 ──
  let topFilter: { field: string; query: string } | undefined;
  if (searchField === "category") {
    if (catL1 === "income") {
      // L3 미선택 시 양수 전체, 선택 시 해당 수입 세분류만
      const cats = catL3 ? [catL3] : [];
      topFilter = { field: "categories", query: `income|${cats.join(",")}` };
    } else {
      const cats = resolveCategoryFilter(catL1, catL2, catL3);
      topFilter = cats.length ? { field: "categories", query: `${catL1}|${cats.join(",")}` } : undefined;
    }
  } else if (searchField === "dateRange") {
    const range = buildDateRange(dateStart, dateEnd);
    topFilter = range ? { field: "dateRange", query: `${range.start}|${range.end}` } : undefined;
  } else if (searchQuery.trim()) {
    topFilter = { field: searchField, query: searchQuery.trim() };
  }

  // ── 컬럼 필터 → filters 배열 (상단 검색과 AND 결합) ──
  const filters = useMemo(() => {
    const arr: { field: string; query: string }[] = [];
    if (topFilter) arr.push(topFilter);
    if (colContentQ) arr.push({ field: "content", query: colContentQ });
    if (colCats.length) arr.push({ field: "catIn", query: JSON.stringify(colCats) });
    if (colPMs.length) arr.push({ field: "pmIn", query: JSON.stringify(colPMs) });
    if (colTypes.length) arr.push({ field: "typeIn", query: JSON.stringify(colTypes) });
    return arr;
  }, [topFilter?.field, topFilter?.query, colContentQ, colCats, colPMs, colTypes]);

  const hasAnyFilter = filters.length > 0 || !!owner;

  const { data, isLoading } = trpc.budget.getTransactions.useQuery(
    { page, pageSize: PAGE_SIZE, filters, owner: owner || undefined },
    { placeholderData: (prev) => prev }
  );

  const { data: filterOptions } = trpc.budget.getFilterOptions.useQuery();

  function invalidateAll() {
    utils.budget.getTransactions.invalidate();
    utils.budget.getCategoryStats.invalidate();
    utils.budget.getMonthlyStats.invalidate();
    utils.budget.getPivotData.invalidate();
    utils.budget.getKpiSummary.invalidate();
    utils.budget.getSavingsStats.invalidate();
    utils.budget.getIncomeDistribution.invalidate();
  }

  const memoMutation = trpc.budget.updateMemo.useMutation({
    onSuccess: () => utils.budget.getTransactions.invalidate(),
    onError: () => toast.error("메모 저장에 실패했습니다."),
  });

  const toggleMutation = trpc.budget.toggleExcluded.useMutation({
    onSuccess: invalidateAll,
  });

  const bulkExcludeMutation = trpc.budget.setExcludedByFilters.useMutation({
    onSuccess: (res, vars) => {
      invalidateAll();
      toast.success(vars.excluded
        ? `${res.count}건을 집계에서 제외했습니다.`
        : `${res.count}건의 제외를 해제했습니다.`);
    },
    onError: () => toast.error("일괄 처리에 실패했습니다."),
  });

  const deleteMutation = trpc.budget.deleteTransaction.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("삭제되었습니다."); },
    onError: () => toast.error("삭제에 실패했습니다."),
  });

  const autoExclMutation = trpc.budget.runAutoExclusions.useMutation({
    onSuccess: (res) => {
      invalidateAll();
      toast.success(`자동 제외 검사 완료 — 상호이체 ${res.transferPairs}쌍, 카드취소 ${res.cardPairs}쌍 제외`);
    },
    onError: () => toast.error("자동 제외 검사에 실패했습니다."),
  });

  const clearExclMutation = trpc.budget.clearAllExclusions.useMutation({
    onSuccess: (res) => { invalidateAll(); toast.success(`제외 ${res.cleared}건을 모두 해제했습니다.`); },
    onError: () => toast.error("제외 해제에 실패했습니다."),
  });

  const exportQuery = trpc.budget.getAllTransactionsForExport.useQuery(undefined, { enabled: false });

  async function handleExport() {
    const result = await exportQuery.refetch();
    if (result.data) {
      downloadTransactionsExcel(result.data.rows as any, result.data.excludedIds);
    }
  }

  function handleDelete(id: number, content: string) {
    if (window.confirm(`「${content}」 거래를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) {
      deleteMutation.mutate({ transactionId: id });
    }
  }

  const excludedSet = new Set(data?.excludedIds ?? []);
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const pageRows = data?.rows ?? [];
  const allPageExcluded = pageRows.length > 0 && pageRows.every((r) => excludedSet.has(Number(r.id)));

  // 제외 헤더 체크박스: 현재 필터(검색결과 전체, 페이지 무관)에 일괄 적용
  function handleBulkExclude() {
    const total = data?.total ?? 0;
    if (total === 0) return;
    const excluded = !allPageExcluded;
    const msg = excluded
      ? `현재 검색된 ${total}건 전체를 집계에서 제외할까요?`
      : `현재 검색된 ${total}건 전체의 제외를 해제할까요?`;
    if (window.confirm(msg)) {
      bulkExcludeMutation.mutate({ filters, owner: owner || undefined, excluded });
    }
  }

  // 결제수단 필터 옵션 (실데이터 고유값)
  const pmOptions: FilterOption[] = (filterOptions?.paymentMethods ?? []).map((v) => ({ value: v, label: v }));
  const typeOptions: FilterOption[] = (filterOptions?.txTypes?.length
    ? filterOptions.txTypes : ["수입", "지출", "이체"]).map((v) => ({ value: v, label: v }));

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
            <select
              value={catL1}
              onChange={(e) => { setCatL1(e.target.value); setCatL2(""); setCatL3(""); }}
              className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500"
            >
              <option value="">L1 전체</option>
              {L1_LIST.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <select
              value={catL2}
              onChange={(e) => { setCatL2(e.target.value); setCatL3(""); }}
              disabled={!catL1}
              className="border border-cream-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cream-500 disabled:opacity-40"
            >
              <option value="">L2 전체</option>
              {(L2_BY_L1[catL1] ?? []).map((l2) => <option key={l2} value={l2}>{l2}</option>)}
            </select>
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

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="text-sm text-cream-500">
            {hasAnyFilter ? (
              <><span className="font-semibold text-cream-800">{data?.total ?? 0}</span>건 검색됨</>
            ) : (
              <>전체 <span className="font-semibold text-cream-800">{data?.total ?? 0}</span>건</>
            )}
          </span>
          <Button size="sm" onClick={() => setShowManual(true)} className="whitespace-nowrap">
            ✏️ 수기 입력
          </Button>
          <Button variant="ghost" size="sm" onClick={() => autoExclMutation.mutate()} disabled={autoExclMutation.isPending}
            className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap" title="상호이체 상쇄(±5분)·카드 취소 쌍을 찾아 자동으로 제외합니다">
            {autoExclMutation.isPending ? "검사 중..." : "🔍 자동 제외 검사"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => clearExclMutation.mutate()} disabled={clearExclMutation.isPending}
            className="text-xs text-cream-500 hover:text-cream-700 whitespace-nowrap">
            {clearExclMutation.isPending ? "해제 중..." : "제외 전체 해제"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            엑셀 다운로드
          </Button>
        </div>
      </div>

      {/* 활성 컬럼 필터 요약 */}
      {(colContent || colCats.length > 0 || colPMs.length > 0 || colTypes.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap text-xs px-1">
          <span className="text-cream-400">컬럼 필터:</span>
          {colContent && <span className="px-2 py-0.5 rounded-full bg-cream-100 text-cream-700">내용 "{colContent}"</span>}
          {colCats.length > 0 && <span className="px-2 py-0.5 rounded-full bg-cream-100 text-cream-700">카테고리 {colCats.length}개</span>}
          {colPMs.length > 0 && <span className="px-2 py-0.5 rounded-full bg-cream-100 text-cream-700">결제수단 {colPMs.length}개</span>}
          {colTypes.length > 0 && <span className="px-2 py-0.5 rounded-full bg-cream-100 text-cream-700">타입 {colTypes.length}개</span>}
          <button
            onClick={() => { setColContent(""); setColCats([]); setColPMs([]); setColTypes([]); }}
            className="text-red-400 hover:text-red-600 underline">모든 컬럼 필터 해제</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-cream-400">불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream-50">
                <tr>
                  <th className="text-left px-4 py-3 text-cream-600 font-medium whitespace-nowrap">날짜</th>
                  <th className="text-left px-4 py-3 text-cream-600 font-medium whitespace-nowrap">내용</th>
                  <th className="text-left px-4 py-3 text-cream-600 font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      카테고리
                      <ColumnFilter title="카테고리" options={CATEGORY_FILTER_OPTIONS} selected={colCats} onChange={setColCats} />
                    </div>
                  </th>
                  <th className="text-right px-4 py-3 text-cream-600 font-medium whitespace-nowrap">금액</th>
                  <th className="text-center px-3 py-3 text-cream-600 font-medium whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      결제수단
                      <ColumnFilter title="결제수단" options={pmOptions} selected={colPMs} onChange={setColPMs} />
                    </div>
                  </th>
                  <th className="text-center px-3 py-3 text-cream-600 font-medium whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      타입
                      <ColumnFilter title="타입" options={typeOptions} selected={colTypes} onChange={setColTypes} />
                    </div>
                  </th>
                  <th className="text-center px-3 py-3 text-cream-600 font-medium whitespace-nowrap">소유자</th>
                  <th className="text-center px-3 py-3 text-cream-600 font-medium whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>제외</span>
                      <input
                        type="checkbox"
                        checked={allPageExcluded}
                        onChange={handleBulkExclude}
                        disabled={bulkExcludeMutation.isPending || (data?.total ?? 0) === 0}
                        className="accent-cream-700 cursor-pointer"
                        title="검색결과 전체 제외/해제"
                      />
                    </div>
                  </th>
                  <th className="text-left px-3 py-3 text-cream-600 font-medium whitespace-nowrap">메모</th>
                  <th className="text-center px-3 py-3 text-cream-600 font-medium whitespace-nowrap">삭제</th>
                </tr>
                {/* 컬럼 필터 행 — 내용 텍스트 필터 */}
                <tr className="border-t border-cream-100">
                  <td className="px-4 py-1.5"></td>
                  <td className="px-4 py-1.5">
                    <input
                      type="text"
                      value={colContent}
                      onChange={(e) => setColContent(e.target.value)}
                      placeholder="내용 필터..."
                      className="w-full max-w-[180px] border border-cream-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-cream-400 bg-white"
                    />
                  </td>
                  <td colSpan={8}></td>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-cream-400">
                      {hasAnyFilter ? "검색 결과가 없습니다." : "거래 내역이 없습니다."}
                    </td>
                  </tr>
                ) : pageRows.map((row) => {
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
                      <td className="px-4 py-2.5 text-center text-xs text-cream-600 whitespace-nowrap">
                        {((row as any).owner as string) ?? ""}
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
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => handleDelete(Number(row.id), row.content as string)}
                          disabled={deleteMutation.isPending}
                          className="text-cream-300 hover:text-red-500 transition-colors text-base leading-none disabled:opacity-50"
                          title="이 거래 삭제"
                        >
                          🗑️
                        </button>
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

      {showManual && (
        <ManualEntryModal onClose={() => setShowManual(false)} onSaved={invalidateAll} />
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
