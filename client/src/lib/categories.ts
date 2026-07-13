// ── 지출 카테고리 체계 (L2 대분류 → L3 소분류) ─────────────────
// 사람별(서준·재이·동현·혜진)·기타처럼 이름이 여러 대분류에 겹치는 소분류는
// 내부적으로 "L2_이름" 형태의 고유 키로 저장하고, 화면에는 이름만(또는 "L2 · 이름") 보여준다.
// (income/savings 체계는 그대로 유지 — 여기서 손대지 않는다.)

export interface L3Item { key: string; label: string }

export const EXPENSE_TREE: { l2: string; items: L3Item[] }[] = [
  { l2: "생활비",    items: [
    { key: "식비", label: "식비" },
    { key: "쇼핑", label: "쇼핑" },
    { key: "외식&배달", label: "외식&배달" },
    { key: "카페", label: "카페" },
    { key: "생활비_기타", label: "기타" },
  ]},
  { l2: "교통/통신", items: [
    { key: "통신비", label: "통신비" },
    { key: "구독비", label: "구독비" },
    { key: "교통비", label: "교통비" },
    { key: "차량유지비", label: "차량유지비" },
  ]},
  { l2: "교육",      items: [
    { key: "교육_서준", label: "서준" },
    { key: "교육_재이", label: "재이" },
    { key: "교육_동현", label: "동현" },
    { key: "교육_혜진", label: "혜진" },
    { key: "교육_미지정", label: "미지정" },
  ]},
  { l2: "여가/문화", items: [
    { key: "여행&문화생활", label: "여행&문화생활" },
    { key: "미용", label: "미용" },
    { key: "운동", label: "운동" },
    { key: "여가_기타", label: "기타" },
  ]},
  { l2: "병원",      items: [
    { key: "병원_서준", label: "서준" },
    { key: "병원_재이", label: "재이" },
    { key: "병원_동현", label: "동현" },
    { key: "병원_혜진", label: "혜진" },
    { key: "병원_미지정", label: "미지정" },
  ]},
  { l2: "보험",      items: [
    { key: "보험_동현", label: "동현" },
    { key: "보험_혜진", label: "혜진" },
    { key: "보험_서준", label: "서준" },
    { key: "보험_재이", label: "재이" },
    { key: "보험_미지정", label: "미지정" },
  ]},
  { l2: "경조사",    items: [
    { key: "경조사", label: "경조사" },
  ]},
  { l2: "주거",      items: [
    { key: "월세", label: "월세" },
    { key: "공과금", label: "공과금" },
    { key: "대출이자", label: "대출이자" },
  ]},
  { l2: "개인 용돈", items: [
    { key: "용돈_동현", label: "동현" },
    { key: "용돈_혜진", label: "혜진" },
    { key: "용돈_미지정", label: "미지정" },
  ]},
  { l2: "기타",      items: [
    { key: "세금", label: "세금" },
    { key: "기타_기타", label: "기타" },
  ]},
];

// ── 수입 소분류 (L2='수입' 고정) ── '수입'은 미분류 겸용 fallback
export const INCOME_L3: L3Item[] = [
  { key: "근로소득", label: "근로소득" },
  { key: "수당", label: "수당" },
  { key: "부가소득", label: "부가소득" },
  { key: "수입", label: "수입(미분류)" },
];
const INCOME_SET = new Set(INCOME_L3.map((it) => it.key));
const INCOME_LABEL: Record<string, string> = Object.fromEntries(INCOME_L3.map((it) => [it.key, it.label]));

// 파생 맵
const EXPENSE_L2: Record<string, string> = {};
const EXPENSE_LABEL: Record<string, string> = {};
const EXPENSE_L2_ORDER: string[] = [];
for (const g of EXPENSE_TREE) {
  EXPENSE_L2_ORDER.push(g.l2);
  for (const it of g.items) { EXPENSE_L2[it.key] = g.l2; EXPENSE_LABEL[it.key] = it.label; }
}

const SAVINGS_L2: Record<string, string> = {
  "장기저축": "저축", "단기저축": "저축",
  "저축": "저축", "청약": "저축", "적금": "저축", "예금": "저축", "CMA": "저축",
  "투자": "투자", "ETF": "투자", "주식": "투자", "펀드": "투자", "ISA": "투자", "IRP": "투자",
};
const SAVINGS_LABEL: Record<string, string> = { "장기저축": "장기 저축", "단기저축": "단기 저축" };

export function getL2(category: string, l1: string): string {
  if (l1 === "income") return "수입";
  if (l1 === "savings") return SAVINGS_L2[category] ?? "저축/투자";
  return EXPENSE_L2[category] ?? "기타";
}

/** 카테고리(L3 키)명으로 L1 추론 */
export function getL1(category: string): "income" | "savings" | "expense" {
  if (INCOME_SET.has(category)) return "income";
  if (category in SAVINGS_L2) return "savings";
  return "expense";
}

/** 내부 키 → 짧은 표시명 (예: "교육_서준" → "서준") */
export function categoryDisplay(key: string): string {
  if (key in EXPENSE_LABEL) return EXPENSE_LABEL[key];
  if (key in INCOME_LABEL) return INCOME_LABEL[key];
  if (key in SAVINGS_LABEL) return SAVINGS_LABEL[key];
  return key;
}
/** 내부 키 → 대분류 포함 표시명 (겹치는 소분류 구분용, 예: "교육_서준" → "교육 · 서준") */
export function categoryFull(key: string): string {
  const i = key.indexOf("_");
  if (i >= 0) return key.slice(0, i) + " · " + key.slice(i + 1);
  return key;
}

const L1_LABEL: Record<string, string> = { income: "수입", savings: "저축/투자", expense: "지출" };
/** "지출 › 생활비 › 식비" 형태의 L1/L2/L3 경로 문자열 */
export function categoryPath(category: string): { l1: string; l2: string; l3: string; label: string } {
  const l1 = getL1(category);
  const l2 = getL2(category, l1);
  return { l1, l2, l3: categoryDisplay(category), label: `${L1_LABEL[l1]} › ${l2} › ${categoryDisplay(category)}` };
}

export function isSavingsCategory(category: string): boolean {
  return category in SAVINGS_L2;
}

/** 이체성 카테고리(집계 제외 대상) — 서버 bankSaladMapSQL/TRANSFER_CATS와 일치 */
const TRANSFER_CATEGORIES = ["이체", "내계좌이체", "카드대금", "현금", "미분류"];
export function isTransferCategory(category: string): boolean {
  return TRANSFER_CATEGORIES.includes(category);
}

/** L1/L2/L3 전체 경로.
 *  L1은 정의된 3개(수입/저축·투자/지출)만 사용한다. 이체성 거래는 '집계제외' 버킷으로 별도 표기. */
export function signedPath(category: string, amount: number): { l1Label: string; l2: string; l3: string; path: string; excluded: boolean } {
  let l1Label: string, l2: string;
  const isTransfer = isTransferCategory(category);
  if (isTransfer) { l1Label = "집계제외"; l2 = "이체"; }
  else if (isSavingsCategory(category)) { l1Label = "저축/투자"; l2 = getL2(category, "savings"); }
  else if (category === "수입" || amount > 0) { l1Label = "수입"; l2 = "수입"; }
  else { l1Label = "지출"; l2 = getL2(category, "expense"); }
  const l3 = categoryDisplay(category);
  const parts = isTransfer ? [l1Label, l2] : [l1Label, l2, l3];
  const path = parts.filter((p, i) => i === 0 || p !== parts[i - 1]).join(" › ");
  return { l1Label, l2, l3, path, excluded: isTransfer };
}

export const L2_ORDER: Record<string, string[]> = {
  income:  ["수입"],
  savings: ["저축", "투자", "저축/투자"],
  expense: EXPENSE_L2_ORDER,
};

/** 거래 필터용 L1 목록 */
export const L1_LIST: { id: string; label: string }[] = [
  { id: "expense", label: "지출" },
  { id: "savings", label: "저축/투자" },
  { id: "income",  label: "수입" },
];

/** L1 → L2 그룹 (필터 드롭다운용) */
export const L2_BY_L1: Record<string, string[]> = {
  expense: EXPENSE_L2_ORDER,
  savings: ["저축", "투자"],
  income:  ["수입"],
};

/** 특정 L1 + L2 그룹에 속한 L3(카테고리 키) 목록 */
export function l3ListForL2(l1: string, l2: string): string[] {
  if (l1 === "income") return INCOME_L3.map((it) => it.key);
  if (l1 === "savings") return Object.keys(SAVINGS_L2).filter((k) => SAVINGS_L2[k] === l2);
  const g = EXPENSE_TREE.find((x) => x.l2 === l2);
  return g ? g.items.map((it) => it.key) : [];
}

/** 특정 L1에 속한 모든 L3(카테고리 키) 목록 */
export function l3ListForL1(l1: string): string[] {
  if (l1 === "income") return INCOME_L3.map((it) => it.key);
  if (l1 === "savings") return Object.keys(SAVINGS_L2);
  return EXPENSE_TREE.flatMap((g) => g.items.map((it) => it.key));
}

/** L1/L2/L3 선택을 effectiveCategory 필터 집합으로 변환 */
export function resolveCategoryFilter(l1: string, l2: string, l3: string): string[] {
  if (l3) return [l3];
  if (l2) return l3ListForL2(l1, l2);
  if (l1) return l3ListForL1(l1);
  return [];
}

/** L2 그룹별 색상 */
export const L2_COLOR: Record<string, string> = {
  // 지출 L2
  "생활비":     "#DC2626",
  "교통/통신":  "#F97316",
  "교육":       "#0EA5E9",
  "여가/문화":  "#EF4444",
  "병원":       "#FB923C",
  "보험":       "#8B5CF6",
  "경조사":     "#EC4899",
  "주거":       "#14B8A6",
  "기타":       "#D1D5DB",
  // 저축 L2
  "저축":       "#2563EB",
  "투자":       "#1D4ED8",
  "저축/투자":  "#3B82F6",
  // 수입 L2
  "수입":       "#374151",
};
