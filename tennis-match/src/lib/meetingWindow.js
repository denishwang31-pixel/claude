/* ============================================================
   모임을 얼마나 들고 있을 것인가

   문제
     지금까지 앱은 클럽의 모임을 전부 실시간 구독했다. 주 2회 × 2년이면
     200건이 넘고, 앱을 켤 때마다 전부 읽는다. 코트장 세 곳이면 600건이다.
     읽기 비용도 비용이지만 첫 화면이 열리는 데서 걸린다.

   ⚠️ 그냥 자르면 안 되는 이유
     모임은 일정에만 쓰이지 않는다. 랭킹·출석률·인수인계 자료가 모두
     과거 모임에서 나온다. 구독을 최근 1년으로 자르면 재작년 랭킹이
     조용히 0이 된다 — 화면에는 숫자가 멀쩡히 떠 있어서 아무도
     "잘렸다"고 생각하지 않는다. 이게 성능 개선 중 제일 흔한 사고다.

   그래서 두 갈래로 나눈다
     실시간 창(window)  최근 N개월 + 미래 전부. 일정·대진·홈이 쓴다.
                        참석 투표가 실시간으로 바뀌어야 하는 범위다.
     과거 조회          그보다 오래된 것은 필요할 때 한 번만 읽는다.
                        이미 끝난 경기라 실시간일 이유가 없다.

     그리고 화면은 "지금 무엇을 보고 있는지"를 말해야 한다. 창 밖의
     기간을 보려 하면 불러오고, 불러오는 동안 그렇다고 알린다.
   ============================================================ */

/** 실시간으로 들고 있을 과거 개월 수. 12개월이면 작년 같은 달까지 보인다. */
export const WINDOW_MONTHS = 12;

const pad2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' 에서 개월 수를 뺀 날짜. 말일 보정 포함. */
export function shiftMonths(date, delta) {
  const s = String(date || '');
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!y || !m || !d) return '';
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  /* 3월 31일에서 한 달을 빼면 2월 31일이 된다. 말일로 당긴다. */
  const last = new Date(ny, nm, 0).getDate();
  return `${ny}-${pad2(nm)}-${pad2(Math.min(d, last))}`;
}

/**
 * 실시간 구독의 시작 날짜.
 * @returns 'YYYY-MM-DD' — 이 날짜 이후 모임만 구독한다
 */
export function windowStart(today, months = WINDOW_MONTHS) {
  return shiftMonths(today, -Math.max(1, months));
}

/**
 * 이 기간을 실시간 창이 이미 덮고 있는가.
 * 덮고 있으면 따로 읽을 필요가 없다 — 같은 것을 두 번 읽으면
 * 비용만 늘고 화면에는 아무 차이가 없다.
 */
export function coveredByWindow(from, today, months = WINDOW_MONTHS) {
  if (!from) return false;
  return from >= windowStart(today, months);
}

/** 어떤 해의 시작·끝 ('2025' → 2025-01-01 ~ 2025-12-31) */
export const yearRange = (year) => ({
  from: `${year}-01-01`,
  to: `${year}-12-31`,
});

/**
 * 실시간 창과 따로 불러온 과거를 합친다.
 *
 * ⚠️ 겹치는 부분이 반드시 생긴다. 올해를 조회하면 창과 겹친다.
 *    id 로 덮어써야 한다 — 그냥 이어 붙이면 같은 모임이 두 번 세어져
 *    출석률과 승수가 부풀려진다. 그리고 실시간 쪽이 최신이므로
 *    실시간 값이 이긴다.
 */
export function mergeMeetings(live, loaded) {
  const map = new Map();
  (loaded || []).forEach((m) => { if (m && m.id) map.set(m.id, m); });
  (live || []).forEach((m) => { if (m && m.id) map.set(m.id, m); });
  return [...map.values()].sort(
    (a, b) => String(a.date || '').localeCompare(String(b.date || '')),
  );
}

/**
 * 지금 화면이 어떤 상태인지 한 줄로.
 * 아무 말도 없이 숫자만 바뀌면 "왜 작년 기록이 0이지"가 된다.
 */
export function windowNote({ year, today, months = WINDOW_MONTHS, loading = false, loaded = false }) {
  if (!year) return '';
  const start = windowStart(today, months);
  const { from } = yearRange(year);
  if (coveredByWindow(from, today, months)) return '';
  if (loading) return `${year}년 기록을 불러오는 중입니다…`;
  if (loaded) return `${year}년 기록을 불러왔습니다`;
  return `${start.slice(0, 7)} 이전 기록은 눌러야 불러옵니다`;
}

export default {
  WINDOW_MONTHS, shiftMonths, windowStart, coveredByWindow,
  yearRange, mergeMeetings, windowNote,
};
