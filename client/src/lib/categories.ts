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
  "금융": "기타",
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

export const L2_ORDER: Record<string, string[]> = {
  income:  ["수입"],
  savings: ["저축", "투자", "저축/투자"],
  expense: ["생활", "교통/통신", "여가/문화", "건강", "기타"],
};

/** L2 그룹별 색상 */
export const L2_COLOR: Record<string, string> = {
  // 지출 L2
  "생활":       "#DC2626",
  "교통/통신":  "#F97316",
  "여가/문화":  "#EF4444",
  "건강":       "#FB923C",
  "기타":       "#D1D5DB",
  // 저축 L2
  "저축":       "#2563EB",
  "투자":       "#1D4ED8",
  "저축/투자":  "#3B82F6",
  // 수입 L2
  "수입":       "#374151",
};
