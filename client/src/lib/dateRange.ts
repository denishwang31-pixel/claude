// 부분 날짜(년만 / 년+월 / 년+월+일) 기간을 실제 시작~종료 날짜로 확장한다.
// - 시작: 지정한 단위의 '처음'   (년만 → 1/1, 년월 → 그 달 1일, 년월일 → 그 날)
// - 종료: 지정한 단위의 '끝'     (년만 → 12/31, 년월 → 그 달 말일, 년월일 → 그 날)
// 예) 2025~2025          → 2025-01-01 ~ 2025-12-31 (2025년 전체)
//     2025.7 ~ 2025.8    → 2025-07-01 ~ 2025-08-31 (7·8월)

export interface DateParts { y: string; m: string; d: string }

const pad2 = (n: number) => String(n).padStart(2, "0");
const lastDayOfMonth = (y: number, m: number) => new Date(y, m, 0).getDate(); // m: 1-12

function toInt(s: string): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 시작 경계 (지정 단위의 처음). 년이 없으면 null. */
export function startBoundary(p: DateParts): string | null {
  const y = toInt(p.y);
  if (y === null) return null;
  const m = toInt(p.m);
  const d = toInt(p.d);
  const mm = m && m >= 1 && m <= 12 ? m : 1;
  const dd = d && d >= 1 && d <= 31 ? d : 1;
  return `${y}-${pad2(mm)}-${pad2(dd)}`;
}

/** 종료 경계 (지정 단위의 끝). 년이 없으면 null. */
export function endBoundary(p: DateParts): string | null {
  const y = toInt(p.y);
  if (y === null) return null;
  const m = toInt(p.m);
  const d = toInt(p.d);
  if (m && m >= 1 && m <= 12) {
    if (d && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
    return `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`; // 그 달 말일
  }
  return `${y}-12-31`; // 그 해 마지막 날
}

/** 시작/종료 파트로부터 실제 기간(start~end)을 만든다.
 *  한쪽만 입력하면 그쪽 기준으로 채운다. 둘 다 비면 null. */
export function buildDateRange(start: DateParts, end: DateParts): { start: string; end: string } | null {
  let s = startBoundary(start);
  let e = endBoundary(end);
  // 한쪽만 입력한 경우 다른 쪽을 같은 기준으로 보완
  if (s && !e) e = endBoundary(start);
  if (!s && e) s = startBoundary(end);
  if (!s || !e) return null;
  // 뒤집힌 경우 자동 정렬
  if (s > e) { const t = s; s = e; e = t; }
  return { start: s, end: e };
}

/** 사람이 읽는 요약 라벨 */
export function rangeLabel(r: { start: string; end: string } | null): string {
  if (!r) return "";
  return `${r.start} ~ ${r.end}`;
}
