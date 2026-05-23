import * as XLSX from "xlsx";
import { createHash } from "./hash";

export interface ParsedRow {
  txDate: string;
  txTime: string;
  txType: string;
  category: string;
  subCategory: string;
  content: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  memo: string;
  dedupHash: string;
}

export async function parseBanksaladExcel(file: File): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames.find((n) => n.includes("가계부 내역")) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("'가계부 내역' 시트를 찾을 수 없습니다.");

  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const result: ParsedRow[] = [];

  for (const row of rawData) {
    // Banksalad columns: 날짜, 시간, 타입, 대분류, 소분류, 내용, 금액, 화폐, 결제수단, 메모
    const rawDate = row["날짜"] ?? row["date"] ?? "";
    const txDate = rawDate instanceof Date
      ? rawDate.toISOString().split("T")[0]
      : String(rawDate).trim();
    const rawTime = row["시간"] ?? row["time"] ?? "";
    const txTime = rawTime instanceof Date
      ? rawTime.toTimeString().slice(0, 8)
      : String(rawTime).trim().slice(0, 8);
    const txType = String(row["타입"] ?? row["type"] ?? "").trim();
    const category = String(row["대분류"] ?? row["category"] ?? "").trim();
    const subCategory = String(row["소분류"] ?? row["subCategory"] ?? "").trim();
    const content = String(row["내용"] ?? row["content"] ?? "").trim();
    const rawAmount = row["금액"] ?? row["amount"] ?? 0;
    const amount = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount).replace(/,/g, "")) || 0;
    const currency = String(row["화폐"] ?? row["currency"] ?? "KRW").trim();
    const paymentMethod = String(row["결제수단"] ?? row["paymentMethod"] ?? "").trim();
    const memo = String(row["메모"] ?? row["memo"] ?? "").trim();

    if (!txDate || !content) continue;

    const dedupHash = await createHash(`${txDate}|${txTime}|${content}|${amount}`);

    result.push({
      txDate,
      txTime,
      txType,
      category,
      subCategory,
      content,
      amount,
      currency,
      paymentMethod,
      memo,
      dedupHash,
    });
  }

  return result;
}
