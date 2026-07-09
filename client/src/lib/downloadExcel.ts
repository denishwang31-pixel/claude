import * as XLSX from "xlsx";
import { signedPath } from "./categories";

interface TransactionRow {
  id: number;
  txDate: string;
  txTime: string;
  txType: string;
  category: string;
  subCategory?: string | null;
  effectiveCategory?: string | null;
  content: string;
  amount: number | string;
  currency: string;
  paymentMethod?: string | null;
  memo?: string | null;
  customCategory?: string | null;
  dedupHash?: string;
}

export function downloadTransactionsExcel(
  rows: TransactionRow[],
  excludedIds: number[],
  filename = "가계부_내역.xlsx"
) {
  const excludedSet = new Set(excludedIds);

  const data = rows.map((r) => {
    // 대시보드와 동일한 유효 카테고리
    const eff = (r.effectiveCategory ?? r.customCategory ?? r.category) as string;
    const amt = Number(r.amount); // 문자열("1000000.00") → 숫자
    const { l1Label, l2, l3 } = signedPath(eff, amt);
    return {
      날짜: r.txDate,
      시간: r.txTime,
      타입: r.txType,
      대분류: eff,               // 앱 카테고리(대시보드와 일치)
      원래분류: r.category,      // 뱅크샐러드 원본 대분류
      소분류: r.subCategory ?? "",
      L1: l1Label,               // 수입 / 저축·투자 / 지출 / 집계제외
      L2: l2,
      L3: l3,
      내용: r.content,
      금액: amt,                 // 숫자
      화폐: r.currency,
      결제수단: r.paymentMethod ?? "",
      메모: r.memo ?? "",
      제외여부: excludedSet.has(r.id) ? "제외" : "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  // 금액 열을 확실히 숫자 셀 + 천단위 숫자 서식으로 지정 (엑셀에서 합계/계산 가능)
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    let amountCol = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
      if (header && header.v === "금액") { amountCol = c; break; }
    }
    if (amountCol >= 0) {
      for (let rr = range.s.r + 1; rr <= range.e.r; rr++) {
        const addr = XLSX.utils.encode_cell({ r: rr, c: amountCol });
        const cell = ws[addr];
        if (cell && cell.v !== "" && cell.v != null) {
          cell.t = "n";              // 숫자 타입
          cell.v = Number(cell.v);   // 혹시 문자열이면 숫자로
          cell.z = "#,##0";          // 천단위 서식
        }
      }
    }
  }

  // 열 너비(보기 편하게)
  ws["!cols"] = [
    { wch: 11 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 24 }, { wch: 13 }, { wch: 6 },
    { wch: 20 }, { wch: 16 }, { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "가계부 내역");
  XLSX.writeFile(wb, filename);
}
