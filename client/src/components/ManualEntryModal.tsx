import React, { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { EXPENSE_TREE } from "../lib/categories";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

// 카테고리 선택지 (optgroup): 지출 트리 + 저축/투자 + 수입
const CATEGORY_OPTGROUPS: { group: string; items: { key: string; label: string }[] }[] = [
  ...EXPENSE_TREE.map((g) => ({ group: `지출 › ${g.l2}`, items: g.items })),
  { group: "저축/투자", items: [{ key: "저축", label: "저축" }, { key: "투자", label: "투자" }] },
  { group: "수입", items: [{ key: "수입", label: "수입" }] },
];

/** 수기 입력 — 모든 항목을 직접 입력해 거래 1건을 추가한다. */
export function ManualEntryModal({ onClose, onSaved }: Props) {
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txTime, setTxTime] = useState("");
  const [txType, setTxType] = useState<"지출" | "수입">("지출");
  const [category, setCategory] = useState("식비");
  const [content, setContent] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"카드" | "이체" | "현금">("카드");
  const [owner, setOwner] = useState<"동현" | "혜진" | "">("");
  const [memo, setMemo] = useState("");

  const utils = trpc.useUtils();
  const addMutation = trpc.budget.addTransaction.useMutation({
    onSuccess: () => {
      utils.budget.getTransactions.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getPivotData.invalidate();
      utils.budget.getMonthlyStats.invalidate();
      utils.budget.getSavingsStats.invalidate();
      toast.success("거래가 추가되었습니다.");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "추가에 실패했습니다."),
  });

  function submit() {
    const amt = Math.abs(parseFloat(amount.replace(/,/g, "")));
    if (!txDate) return toast.error("날짜를 입력하세요.");
    if (!content.trim()) return toast.error("내용을 입력하세요.");
    if (!amt || isNaN(amt)) return toast.error("금액을 입력하세요.");
    if (!owner) return toast.error("소유자(동현/혜진)를 선택하세요.");
    addMutation.mutate({
      txDate,
      txTime: txTime ? `${txTime}:00`.slice(0, 8) : undefined,
      txType,
      category,
      content: content.trim(),
      amount: txType === "지출" ? -amt : amt,   // 지출=음수, 수입=양수
      paymentMethod,
      memo: memo.trim() || undefined,
      owner,
    });
  }

  const inputCls = "w-full border border-cream-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cream-500";
  const labelCls = "text-xs text-cream-500 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-cream-200 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-bold text-cream-800">✏️ 수기 입력 추가</h2>
          <button onClick={onClose} className="text-cream-400 hover:text-cream-700 text-xl">×</button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>날짜 *</label>
              <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>시간 (선택)</label>
              <input type="time" value={txTime} onChange={(e) => setTxTime(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>타입 *</label>
              <select value={txType} onChange={(e) => setTxType(e.target.value as "지출" | "수입")} className={inputCls}>
                <option value="지출">지출 (−)</option>
                <option value="수입">수입 (+)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>카테고리 *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {CATEGORY_OPTGROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((it) => <option key={it.key} value={it.key}>{it.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>내용 (상호/내역명) *</label>
            <input type="text" value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="예: 어린이집 특별활동비" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>금액 (원) * — 부호는 타입에 따라 자동 적용</label>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="예: 50000" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>결제수단 *</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} className={inputCls}>
                <option value="카드">카드</option>
                <option value="이체">이체</option>
                <option value="현금">현금</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>소유자 *</label>
              <select value={owner} onChange={(e) => setOwner(e.target.value as any)} className={inputCls}>
                <option value="">선택...</option>
                <option value="동현">동현</option>
                <option value="혜진">혜진</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>메모 (선택)</label>
            <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모..." className={inputCls} />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={submit} disabled={addMutation.isPending}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-cream-700 text-white hover:bg-cream-800 disabled:opacity-50 transition-colors">
              {addMutation.isPending ? "추가 중..." : "추가"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-cream-300 text-cream-600 hover:bg-cream-50 transition-colors">
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
