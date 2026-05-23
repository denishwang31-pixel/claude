import * as XLSX from "xlsx";

interface TransactionRow {
  id: number;
  txDate: string;
  txTime: string;
  txType: string;
  category: string;
  subCategory?: string | null;
  content: string;
  amount: number;
  currency: string;
  paymentMethod?: string | null;
  memo?: string | null;
  customCategory?: string | null;
  dedupHash: string;
}

export function downloadTransactionsExcel(
  rows: TransactionRow[],
  excludedIds: number[],
  filename = "가계부_내역.xlsx"
) {
  const excludedSet = new Set(excludedIds);

  const data = rows.map((r) => ({
    날짜: r.txDate,
    시간: r.txTime,
    타입: r.txType,
    대분류: r.customCategory ?? r.category,
    원래분류: r.category,
    소분류: r.subCategory ?? "",
    내용: r.content,
    금액: r.amount,
    화폐: r.currency,
    결제수단: r.paymentMethod ?? "",
    메모: r.memo ?? "",
    제외여부: excludedSet.has(r.id) ? "제외" : "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "가계부 내역");
  XLSX.writeFile(wb, filename);
}
