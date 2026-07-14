import React, { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { parsePaymentSms } from "../lib/parseSms";
import { formatKRW } from "../lib/format";
import { EXPENSE_TREE } from "../lib/categories";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function SmsImportModal({ onClose, onSaved }: Props) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState<"동현" | "혜진" | "">("");
  const [category, setCategory] = useState("기타_기타");

  const parsed = useMemo(() => parsePaymentSms(text), [text]);

  const utils = trpc.useUtils();
  const addMutation = trpc.budget.addTransaction.useMutation({
    onSuccess: () => {
      utils.budget.getTransactions.invalidate();
      utils.budget.getKpiSummary.invalidate();
      utils.budget.getCategoryStats.invalidate();
      utils.budget.getSubscriptions.invalidate();
      toast.success("문자에서 거래를 추가했습니다.");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "추가에 실패했습니다."),
  });

  function submit() {
    if (!parsed) return toast.error("문자에서 결제 정보를 찾지 못했습니다.");
    if (!owner) return toast.error("소유자(동현/혜진)를 선택하세요.");
    addMutation.mutate({
      txDate: parsed.txDate,
      txTime: parsed.txTime ? `${parsed.txTime}:00`.slice(0, 8) : undefined,
      txType: parsed.txType,
      category: parsed.txType === "수입" ? "수입" : category,
      content: parsed.content,
      amount: parsed.txType === "지출" ? -parsed.amount : parsed.amount,
      paymentMethod: "카드",
      owner,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif text-lg font-bold text-cream-800">문자로 입력</h3>
          <button onClick={onClose} className="text-cream-400 hover:text-cream-700 text-xl">×</button>
        </div>
        <p className="text-xs text-cream-500 mb-2">
          카드 승인/은행 입출금 문자를 붙여넣으면 자동으로 금액·날짜·가맹점을 인식합니다.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예) [Web발신] 신한카드 승인 12,000원 06/15 14:30 스타벅스강남점"
          rows={4}
          className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cream-500"
        />

        {text.trim() && (
          <div className="mt-3 rounded-lg border border-cream-200 bg-cream-50 p-3 text-sm">
            {parsed ? (
              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-cream-500">금액</span>
                  <b className={parsed.txType === "지출" ? "text-red-600" : "text-emerald-600"}>
                    {parsed.txType} {formatKRW(parsed.amount)}
                  </b></div>
                <div className="flex justify-between"><span className="text-cream-500">날짜</span><span>{parsed.txDate} {parsed.txTime}</span></div>
                <div className="flex justify-between"><span className="text-cream-500">가맹점</span><span className="font-medium">{parsed.content}</span></div>
                {parsed.issuer && <div className="flex justify-between"><span className="text-cream-500">카드/은행</span><span>{parsed.issuer}</span></div>}
              </div>
            ) : (
              <span className="text-red-500">결제 정보를 인식하지 못했습니다. 문자 전체를 붙여넣어 주세요.</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-cream-500 mb-1 block">소유자</label>
            <div className="flex rounded-lg border border-cream-200 overflow-hidden">
              {(["동현", "혜진"] as const).map((o) => (
                <button key={o} onClick={() => setOwner(o)}
                  className={`flex-1 px-3 py-1.5 text-sm ${owner === o ? "bg-cream-700 text-white" : "text-cream-600"}`}>{o}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-cream-500 mb-1 block">카테고리 (지출)</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              disabled={parsed?.txType === "수입"}
              className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-sm disabled:opacity-50">
              {EXPENSE_TREE.map((g) => (
                <optgroup key={g.l2} label={g.l2}>
                  {g.items.map((it) => <option key={it.key} value={it.key}>{it.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-cream-200 text-sm text-cream-600 hover:bg-cream-100">취소</button>
          <button onClick={submit} disabled={!parsed || addMutation.isPending}
            className="px-4 py-2 rounded-lg bg-cream-700 text-white text-sm font-semibold hover:bg-cream-800 disabled:opacity-60">추가</button>
        </div>
      </div>
    </div>
  );
}
