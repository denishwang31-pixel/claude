import React, { useRef, useState } from "react";
import { cn } from "../lib/utils";
import { parseBanksaladExcel } from "../lib/parseExcel";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";

interface UploadZoneProps {
  onSuccess?: () => void;
}

export function UploadZone({ onSuccess }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [owner, setOwner] = useState<"동현" | "혜진" | "">("");
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const uploadMutation = trpc.budget.uploadTransactions.useMutation();

  const deleteMutation = trpc.budget.deleteAllTransactions.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.deleted}건의 거래가 삭제되었습니다.`);
      setConfirmDelete(false);
      onSuccess?.();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "삭제 중 오류가 발생했습니다.");
    },
  });

  const resetMutation = trpc.budget.resetAllData.useMutation({
    onSuccess: (res) => {
      toast.success(`전체 리셋 완료 — 거래 ${res.transactions}건, 매핑규칙 ${res.rules}개 삭제`);
      setConfirmReset(false);
      utils.budget.getCategoryRules.invalidate();
      utils.budget.getSettings.invalidate();
      onSuccess?.();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "리셋 중 오류가 발생했습니다.");
    },
  });

  const { data: txData } = trpc.budget.getTransactions.useQuery({ page: 1, pageSize: 1 });
  const totalCount = txData?.total ?? 0;

  async function handleFile(file: File) {
    if (!owner) {
      toast.error("먼저 소유자(동현/혜진)를 선택해주세요.");
      return;
    }
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
      return;
    }

    setLoading(true);
    try {
      const rows = await parseBanksaladExcel(file);
      if (rows.length === 0) {
        toast.error("파싱된 데이터가 없습니다. 뱅크샐러드 가계부 내역 파일인지 확인해주세요.");
        return;
      }

      const CHUNK = 200;
      let totalInserted = 0;
      let totalSkipped = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const result = await uploadMutation.mutateAsync({ rows: chunk, owner });
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
      }

      toast.success(`${owner} 데이터 ${totalInserted}건 업로드 완료 (중복 ${totalSkipped}건 제외)`);
      onSuccess?.();
    } catch (err: any) {
      console.error(err);
      const isTimeout = err?.name === "AbortError" || err?.name === "TimeoutError";
      toast.error(
        isTimeout
          ? "서버 응답이 없어 업로드를 중단했습니다. PostgreSQL 서비스가 켜져 있는지 확인 후 다시 시도해주세요."
          : err?.message ?? "업로드 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-3">
      {/* 소유자 선택 */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-cream-200 rounded-xl">
        <span className="text-sm font-medium text-cream-700">이 파일의 소유자</span>
        <div className="flex gap-1">
          {(["동현", "혜진"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOwner(o)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                owner === o
                  ? "bg-cream-700 text-white"
                  : "bg-cream-50 text-cream-500 hover:bg-cream-100 border border-cream-200"
              )}
            >
              {o}
            </button>
          ))}
        </div>
        {!owner && <span className="text-xs text-red-400">← 선택해야 업로드할 수 있어요</span>}
      </div>

      {/* Upload drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center transition-all",
          !owner
            ? "border-cream-200 opacity-50 cursor-not-allowed"
            : dragging
            ? "border-cream-600 bg-cream-100 cursor-pointer"
            : "border-cream-300 hover:border-cream-500 hover:bg-cream-50 cursor-pointer",
          loading && "opacity-60 pointer-events-none"
        )}
        onDragOver={(e) => { e.preventDefault(); if (owner) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => owner && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl">📊</div>
          {loading ? (
            <p className="text-cream-700 font-medium">처리 중...</p>
          ) : (
            <>
              <p className="text-cream-700 font-medium">
                {owner
                  ? `${owner}의 뱅크샐러드 엑셀 파일을 드래그하거나 클릭하여 업로드`
                  : "위에서 소유자를 먼저 선택하세요"}
              </p>
              <p className="text-cream-500 text-sm">.xlsx / .xls 파일 지원</p>
            </>
          )}
        </div>
      </div>

      {/* Data management bar */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-cream-50 border border-cream-200 rounded-xl text-sm flex-wrap gap-2">
          <span className="text-cream-600">
            현재 저장된 내역: <span className="font-semibold text-cream-800">{totalCount.toLocaleString()}건</span>
          </span>

          <div className="flex items-center gap-3 flex-wrap">
            {/* 거래 전체 삭제 (규칙·설정은 유지) */}
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-red-600 font-medium text-xs">거래만 전체 삭제할까요?</span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleteMutation.isPending ? "삭제 중..." : "삭제"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1 bg-cream-200 text-cream-700 rounded-md text-xs hover:bg-cream-300 transition-colors"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setConfirmDelete(true); setConfirmReset(false); }}
                className="text-xs text-red-400 hover:text-red-600 hover:underline transition-colors"
              >
                거래 전체 삭제
              </button>
            )}

            {/* 전체 리셋 (거래+규칙+설정 모두) */}
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-red-600 font-medium text-xs">
                  거래·매핑규칙·설정을 모두 삭제합니다. 되돌릴 수 없어요!
                </span>
                <button
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending}
                  className="px-3 py-1 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {resetMutation.isPending ? "리셋 중..." : "전체 리셋 실행"}
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1 bg-cream-200 text-cream-700 rounded-md text-xs hover:bg-cream-300 transition-colors"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setConfirmReset(true); setConfirmDelete(false); }}
                className="px-3 py-1 rounded-md text-xs font-medium bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition-colors"
              >
                🔄 데이터 리셋
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
