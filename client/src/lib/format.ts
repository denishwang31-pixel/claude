export function formatKRW(amount: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatYearMonth(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}

export const CATEGORY_COLORS: Record<string, string> = {
  식비: "#E07B54",
  교통: "#5B8FF9",
  쇼핑: "#5AD8A6",
  의료: "#F6BD16",
  문화: "#E86452",
  교육: "#6DC8EC",
  카페: "#CDDDFD",
  여행: "#FF9D4D",
  구독: "#B07D62",
  통신: "#7B7BCA",
  주거: "#A0C4FF",
  저축: "#52C41A",
  투자: "#13A8A8",
  금융: "#FA8C16",
  기타: "#BFBFBF",
  수입: "#73D13D",
};

export function getCategoryColor(category: string, index = 0): string {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  const palette = [
    "#5B8FF9", "#5AD8A6", "#F6BD16", "#E07B54", "#6DC8EC",
    "#FF9D4D", "#B07D62", "#7B7BCA", "#E86452", "#CDDDFD",
    "#A0C4FF", "#52C41A", "#13A8A8", "#FA8C16", "#BFBFBF",
  ];
  return palette[index % palette.length];
}
