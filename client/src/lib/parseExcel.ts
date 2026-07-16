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

// ── 공통 유틸 ──────────────────────────────────────────────────
function pad2(n: string | number): string {
  return String(n).padStart(2, "0");
}
/** 연도 없는 MM/DD 를 해석: 올해로 두되, 결과가 오늘보다 미래면 작년으로.
 *  (1월에 12월 명세서를 넣었을 때 미래 날짜로 저장되는 것을 방지) */
export function resolveYearlessDate(mm: number, dd: number): string {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let y = now.getFullYear();
  if (new Date(y, mm - 1, dd).getTime() > now.getTime()) y -= 1;
  return `${y}-${pad2(mm)}-${pad2(dd)}`;
}
function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^0-9.\-]/g, "");
  return s ? parseFloat(s) : 0;
}
/** 다양한 날짜 표기를 YYYY-MM-DD 로 정규화 */
export function normalizeDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().split("T")[0];
  const s = String(v ?? "").trim();
  let m = s.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})$/); // MM/DD → 연도 추정
  if (m) return resolveYearlessDate(Number(m[1]), Number(m[2]));
  return "";
}
function extractTime(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toTimeString().slice(0, 8);
  const m = String(v ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${pad2(m[1])}:${m[2]}:${m[3] ?? "00"}` : "";
}

// ── 은행/카드사별 열 이름 별칭 (프리셋) ────────────────────────
// 어떤 파일이든 헤더 이름만 맞으면 자동 인식된다.
const FIELD_ALIASES: Record<string, string[]> = {
  date: ["날짜", "거래일시", "거래일자", "거래일", "이용일", "이용일자", "이용일시", "승인일시", "승인일자", "매출일자", "사용일", "거래 일자", "date"],
  time: ["시간", "거래시각", "승인시간", "time"],
  content: ["내용", "가맹점", "가맹점명", "적요", "이용하신곳", "사용처", "거래내용", "이용내역", "내역", "상호", "가맹점정보", "이용가맹점", "받는분/보내는분", "content"],
  amount: ["금액", "이용금액", "승인금액", "거래금액", "결제금액", "사용금액", "amount"],
  outAmount: ["출금", "출금액", "출금금액", "지급", "보내신금액", "출금(원)"],
  inAmount: ["입금", "입금액", "입금금액", "맡기신금액", "입금(원)"],
  type: ["타입", "구분", "입출금구분", "거래구분", "유형", "type"],
  category: ["대분류", "카테고리", "분류"],
  subCategory: ["소분류"],
  paymentMethod: ["결제수단", "카드", "카드명", "카드종류", "결제방법", "계좌", "은행", "카드구분"],
  memo: ["메모", "비고", "note", "memo"],
};

function matchField(header: string): string | null {
  const h = header.trim().replace(/\s+/g, "");
  // 1) 정확히 일치하는 별칭 우선 (예: "카드구분"→paymentMethod, "구분"의 부분일치보다 우선)
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => h === a.replace(/\s+/g, ""))) return field;
  }
  // 2) 부분 포함 (2글자 이상 별칭만)
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => { const c = a.replace(/\s+/g, ""); return c.length >= 2 && h.includes(c); })) return field;
  }
  return null;
}

async function buildRow(get: (f: string) => unknown, hasInOut: boolean): Promise<ParsedRow | null> {
  const txDate = normalizeDate(get("date"));
  const content = String(get("content") ?? "").trim();
  if (!txDate || !content) return null;

  let amount: number;
  let txType: string;
  if (hasInOut) {
    const inc = toNumber(get("inAmount"));
    const out = toNumber(get("outAmount"));
    amount = inc - out;
    txType = inc > 0 ? "수입" : "지출";
  } else {
    const a = toNumber(get("amount"));
    const t = String(get("type") ?? "");
    if (/입금|수입/.test(t)) { amount = Math.abs(a); txType = "수입"; }
    else if (/출금|지출|승인|결제|사용/.test(t)) { amount = -Math.abs(a); txType = "지출"; }
    else { amount = a < 0 ? a : -Math.abs(a); txType = amount < 0 ? "지출" : "수입"; } // 기본: 지출
  }

  const txTime = extractTime(get("time")) || extractTime(get("date"));
  const category = String(get("category") ?? "").trim();
  const subCategory = String(get("subCategory") ?? "").trim();
  const paymentMethod = String(get("paymentMethod") ?? "").trim();
  const memo = String(get("memo") ?? "").trim();
  const dedupHash = await createHash(`${txDate}|${txTime}|${content}|${amount}`);
  return { txDate, txTime, txType, category, subCategory, content, amount, currency: "KRW", paymentMethod, memo, dedupHash };
}

// ── 뱅크샐러드 시트 파서 (기존) ─────────────────────────────────
async function parseBanksaladSheet(sheet: XLSX.WorkSheet): Promise<ParsedRow[]> {
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const result: ParsedRow[] = [];
  for (const row of rawData) {
    const rawDate = row["날짜"] ?? row["date"] ?? "";
    const txDate = rawDate instanceof Date ? rawDate.toISOString().split("T")[0] : String(rawDate).trim();
    const rawTime = row["시간"] ?? row["time"] ?? "";
    const txTime = rawTime instanceof Date ? rawTime.toTimeString().slice(0, 8) : String(rawTime).trim().slice(0, 8);
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
    result.push({ txDate, txTime, txType, category, subCategory, content, amount, currency, paymentMethod, memo, dedupHash });
  }
  return result;
}

// ── 일반 은행/카드 파일 파서 (헤더 자동 매핑) ───────────────────
async function parseGenericSheet(sheet: XLSX.WorkSheet): Promise<ParsedRow[]> {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  // 헤더 행 탐색: 별칭에 가장 많이 맞는 행(상단 10줄 내)
  let headerIdx = -1, bestScore = 0, colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const row = aoa[i] ?? [];
    const map: Record<string, number> = {};
    let score = 0;
    row.forEach((cell, idx) => {
      const f = matchField(String(cell ?? ""));
      if (f && !(f in map)) { map[f] = idx; score++; }
    });
    if (score > bestScore) { bestScore = score; headerIdx = i; colMap = map; }
  }
  // 최소 날짜+내용(또는 금액)은 있어야 유효한 표로 인정
  if (headerIdx < 0 || !("date" in colMap) || !("content" in colMap)) return [];
  const hasInOut = "inAmount" in colMap || "outAmount" in colMap;
  if (!hasInOut && !("amount" in colMap)) return [];

  const result: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const get = (f: string) => (f in colMap ? row[colMap[f]] : "");
    const parsed = await buildRow(get, hasInOut);
    if (parsed) result.push(parsed);
  }
  return result;
}

// ── 진입점 ─────────────────────────────────────────────────────
/** 뱅크샐러드/일반 은행·카드 파일을 자동 판별해 파싱한다. */
export async function parseTransactionFile(file: File): Promise<{ rows: ParsedRow[]; format: string }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const bsName = workbook.SheetNames.find((n) => n.includes("가계부 내역"));
  if (bsName) {
    return { rows: await parseBanksaladSheet(workbook.Sheets[bsName]), format: "뱅크샐러드" };
  }
  // 일반 파일: 시트를 순회하며 인식되는 첫 시트 사용
  for (const name of workbook.SheetNames) {
    const rows = await parseGenericSheet(workbook.Sheets[name]);
    if (rows.length > 0) return { rows, format: "일반(자동매핑)" };
  }
  return { rows: [], format: "인식 실패" };
}

/** (하위호환) 뱅크샐러드 전용 진입점 — 자동 판별 진입점으로 위임. */
export async function parseBanksaladExcel(file: File): Promise<ParsedRow[]> {
  return (await parseTransactionFile(file)).rows;
}
