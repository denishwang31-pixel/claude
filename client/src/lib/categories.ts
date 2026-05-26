/** L3(현재 카테고리) → L2 그룹 매핑 */
const EXPENSE_L2: Record<string, string> = {
  "식비": "생활",
  "외식": "생활",
  "배달음식": "생활",
  "카페": "생활",
  "쇼핑": "생활",
  "생활용품": "생활",
  "주거": "생활",
  "교통": "교통/통신",
  "통신": "교통/통신",
  "구독": "교통/통신",
  "문화": "여가/문화",
  "교육": "여가/문화",
  "여행": "여가/문화",
  "미용": "여가/문화",
  "의료": "건강",
  "건강": "건강",
  "금융": "금융",
  "세금": "기타",
  "기타": "기타",
};

const SAVINGS_L2: Record<string, string> = {
  "저축": "저축", "청약": "저축", "적금": "저축", "예금": "저축", "CMA": "저축",
  "투자": "투자", "ETF": "투자", "주식": "투자", "펀드": "투자", "ISA": "투자", "IRP": "투자",
};

export function getL2(category: string, l1: string): string {
  if (l1 === "income") return "수입";
  if (l1 === "savings") return SAVINGS_L2[category] ?? "저축/투자";
  return EXPENSE_L2[category] ?? "기타";
}

/** 카테고리(L3)명으로 L1 추론 */
export function getL1(category: string): "income" | "savings" | "expense" {
  if (category === "수입") return "income";
  if (category in SAVINGS_L2) return "savings";
  return "expense";
}

const L1_LABEL: Record<string, string> = { income: "수입", savings: "저축/투자", expense: "지출" };
/** "지출 › 생활 › 식비" 형태의 L1/L2/L3 경로 문자열 */
export function categoryPath(category: string): { l1: string; l2: string; l3: string; label: string } {
  const l1 = getL1(category);
  const l2 = getL2(category, l1);
  return { l1, l2, l3: category, label: `${L1_LABEL[l1]} › ${l2} › ${category}` };
}

export function isSavingsCategory(category: string): boolean {
  return category in SAVINGS_L2;
}

/** 금액 부호 기반 L1/L2/L3 전체 경로 (양수=수입, 저축카테고리 출금=저축, 그 외 출금=지출, 이체=제외) */
export function signedPath(category: string, amount: number): { l1Label: string; l2: string; l3: string; path: string } {
  let l1Label: string, l2: string;
  if (category === "이체") { l1Label = "이체"; l2 = "제외"; }
  else if (amount > 0) { l1Label = "수입"; l2 = "수입"; }
  else if (isSavingsCategory(category)) { l1Label = "저축/투자"; l2 = getL2(category, "savings"); }
  else { l1Label = "지출"; l2 = getL2(category, "expense"); }
  // L1 › L2 › L3 경로 — 연속 중복은 제거 (예: 수입›수입›수입 → 수입)
  const parts = category === "이체" ? [l1Label, l2] : [l1Label, l2, category];
  const path = parts.filter((p, i) => i === 0 || p !== parts[i - 1]).join(" › ");
  return { l1Label, l2, l3: category, path };
}

export const L2_ORDER: Record<string, string[]> = {
  income:  ["수입"],
  savings: ["저축", "투자", "저축/투자"],
  expense: ["생활", "교통/통신", "여가/문화", "건강", "금융", "기타"],
};

/** 거래 필터용 L1 목록 */
export const L1_LIST: { id: string; label: string }[] = [
  { id: "expense", label: "지출" },
  { id: "savings", label: "저축/투자" },
  { id: "income",  label: "수입" },
];

/** L1 → L2 그룹 (필터 드롭다운용, fallback 버킷 제외) */
export const L2_BY_L1: Record<string, string[]> = {
  expense: ["생활", "교통/통신", "여가/문화", "건강", "금융", "기타"],
  savings: ["저축", "투자"],
  income:  ["수입"],
};

/** 특정 L1 + L2 그룹에 속한 L3(카테고리) 목록 */
export function l3ListForL2(l1: string, l2: string): string[] {
  if (l1 === "income") return ["수입"];
  const map = l1 === "savings" ? SAVINGS_L2 : EXPENSE_L2;
  return Object.keys(map).filter((k) => map[k] === l2);
}

/** 특정 L1에 속한 모든 L3(카테고리) 목록 */
export function l3ListForL1(l1: string): string[] {
  if (l1 === "income") return ["수입"];
  const map = l1 === "savings" ? SAVINGS_L2 : EXPENSE_L2;
  return Object.keys(map);
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
  "생활":       "#DC2626",
  "교통/통신":  "#F97316",
  "여가/문화":  "#EF4444",
  "건강":       "#FB923C",
  "금융":       "#A855F7",
  "기타":       "#D1D5DB",
  // 저축 L2
  "저축":       "#2563EB",
  "투자":       "#1D4ED8",
  "저축/투자":  "#3B82F6",
  // 수입 L2
  "수입":       "#374151",
};
