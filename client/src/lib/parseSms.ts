// 카드 승인/은행 입출금 문자(SMS)를 파싱해 거래 정보를 추출한다.
// (iOS는 앱이 문자를 못 읽으므로 "붙여넣기" 입력에 사용, Android는 향후
//  네이티브 SMS 리스너가 이 파서에 원문을 넘겨주면 자동 입력이 된다.)
import { resolveYearlessDate } from "./parseExcel";

export interface ParsedSms {
  txDate: string;      // YYYY-MM-DD
  txTime: string;      // HH:MM (없으면 "")
  amount: number;      // 양수(원 단위)
  txType: "수입" | "지출";
  content: string;     // 가맹점/적요
  issuer: string;      // 카드사/은행 (예: 신한카드)
  raw: string;
}

const ISSUERS = [
  "신한카드", "삼성카드", "현대카드", "국민카드", "KB국민", "롯데카드", "우리카드",
  "하나카드", "농협카드", "비씨카드", "BC카드", "씨티카드", "카카오뱅크", "카카오페이",
  "토스", "네이버페이", "페이코", "신한은행", "국민은행", "우리은행", "하나은행",
  "농협은행", "기업은행", "새마을", "케이뱅크",
];

function pad2(n: string | number) { return String(n).padStart(2, "0"); }

/** 결제 문자 1건을 파싱. 인식 실패 시 null. */
export function parsePaymentSms(text: string): ParsedSms | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const flat = raw.replace(/\s+/g, " ");

  // 금액: "12,000원" 형태 중 가장 큰 값(잔액 등과 섞일 수 있어 최댓값 선호는 위험 →
  // 승인/출금 문맥의 첫 금액을 우선, 없으면 첫 금액)
  const amounts = [...flat.matchAll(/([\d]{1,3}(?:,\d{3})+|\d+)\s*원/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (amounts.length === 0) return null;
  const amount = amounts[0];
  if (!amount || amount <= 0) return null;

  // 유형
  const isCancel = /취소/.test(flat);
  const isIncome = /입금|급여|이체입금/.test(flat) && !/출금/.test(flat);
  const txType: "수입" | "지출" = isIncome ? "수입" : "지출";

  // 날짜: YY/MM/DD, YYYY.MM.DD, MM/DD, MM월 DD일
  let txDate = "";
  let m =
    flat.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/) ||
    flat.match(/(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    txDate = `${y}-${pad2(m[2])}-${pad2(m[3])}`;
  } else if ((m = flat.match(/(\d{1,2})[.\-/월\s]+(\d{1,2})\s*일?/))) {
    txDate = resolveYearlessDate(Number(m[1]), Number(m[2]));
  } else {
    txDate = new Date().toISOString().slice(0, 10); // 못 찾으면 오늘
  }

  // 시간: HH:MM
  const tm = flat.match(/(\d{1,2}):(\d{2})/);
  const txTime = tm ? `${pad2(tm[1])}:${tm[2]}` : "";

  // 카드사/은행
  const issuer = ISSUERS.find((i) => flat.includes(i)) ?? "";

  // 가맹점/내용 추정: 잡음(날짜·시간·금액·상태어·잔액·이름표시)을 제거하고
  // 남은 마지막 의미 토큰을 가맹점으로 본다(문자는 대개 가맹점이 끝에 옴).
  const cleaned = flat
    .replace(/\[.*?\]/g, " ")                       // [Web발신] 등 대괄호
    .replace(/\(\d+\)/g, " ")                        // (1234) 카드 뒤 4자리
    .replace(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g, " ") // 날짜 YYYY.MM.DD
    .replace(/\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}/g, " ") // 날짜 YY.MM.DD
    .replace(/\d{1,2}[.\-/]\d{1,2}/g, " ")            // 날짜 MM/DD
    .replace(/\d{1,2}[:.]\d{2}/g, " ")                // 시간
    .replace(/[\d,]+\s*원/g, " ")                     // 금액
    .replace(/(잔액|누적|할부|일시불|승인|출금|입금|사용|이체|취소)/g, " ")
    .trim();
  const toks = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/님$/, ""))
    .filter((t) => t && !/^\d+$/.test(t) && t.length > 1 && !ISSUERS.some((i) => i.includes(t) || t.includes(i)));
  let content = toks[toks.length - 1] ?? "";
  if (!content) content = issuer || "문자입력";
  if (isCancel) content = `[취소] ${content}`;

  return { txDate, txTime, amount, txType, content, issuer, raw };
}
