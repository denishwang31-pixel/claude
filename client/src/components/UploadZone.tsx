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
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.budget.uploadTransactions.useMutation();
  const deleteMutation = trpc.budget.deleteAllTransactions.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.deleted}건의 데이터가 삭제되었습니다.`);
      setConfirmDelete(false);
      onSuccess?.();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "삭제 중 오류가 발생했습니다.");
    },
  });

  const { data: txData } = trpc.budget.getTransactions.useQuery({ page: 1, pageSize: 1 });
  const totalCount = txData?.total ?? 0;

  async function handleFile(file: File) {
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
        const result = await uploadMutation.mutateAsync({ rows: chunk });
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
      }

      toast.success(`${totalInserted}건 업로드 완료 (중복 ${totalSkipped}건 제외)`);
      onSuccess?.();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "업로드 중 오류가 발생했습니다.");
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
      {/* Upload drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all",
          dragging
            ? "border-cream-600 bg-cream-100"
            : "border-cream-300 hover:border-cream-500 hover:bg-cream-50",
          loading && "opacity-60 pointer-events-none"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl">📊</div>
          {loading ? (
            <p className="text-cream-700 font-medium">처리 중...</p>
          ) : (
            <>
              <p className="text-cream-700 font-medium">
                뱅크샐러드 엑셀 파일을 드래그하거나 클릭하여 업로드
              </p>
              <p className="text-cream-500 text-sm">.xlsx / .xls 파일 지원</p>
            </>
          )}
        </div>
      </div>

      {/* Data management bar */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-cream-50 border border-cream-200 rounded-xl text-sm">
          <span className="text-cream-600">
            현재 저장된 내역: <span className="font-semibold text-cream-800">{totalCount.toLocaleString()}건</span>
          </span>

          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-red-600 font-medium text-xs">전체 삭제할까요?</span>
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
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-400 hover:text-red-600 hover:underline transition-colors"
            >
              전체 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
