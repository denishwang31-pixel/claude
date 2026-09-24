/* ============================================================
   회비 관리 현황판 — 숫자 계산 (화면 밖 판단)

   현황판은 총무가 들어오자마자 보는 한 장이다. 납부·미납·미수금과
   이번 기간 수입·지출·잔액. 여기서 틀리면 돈이 틀린다 — 그래서 화면에서
   계산하지 않고 이 파일에서 하고 scripts/test-feeview.mjs 가 검사한다.
   ============================================================ */

/** 활동 회원만 센다(휴면·탈퇴는 회비 대상이 아니다) */
export const activeMembers = (members) =>
  (members || []).filter((m) => m && !m.deleted && (!m.status || m.status === '활동'));

/** 이 기간의 지출 — 기간('2026-09' 또는 '2026')으로 시작하는 날짜, 코트장 거르기 */
export function periodExpenses(expenses, periodKey, { venueId = null, allowVenue = null } = {}) {
  return (expenses || [])
    .filter((e) => String(e.date || '').startsWith(periodKey))
    .filter((e) => (venueId ? (e.venueId || null) === venueId : true))
    .filter((e) => (allowVenue ? allowVenue(e.venueId || null) : true))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/**
 * 현황판 숫자.
 * @param members 이 청구 단위의 회원(활동 여부는 여기서 거른다)
 * @param paidMap { 회원id: true }
 * @param amount  1인당 회비
 */
export function feeSummary({ members, paidMap = {}, amount = 0, expenses = [] }) {
  const act = activeMembers(members);
  const paidN = act.filter((m) => paidMap[m.id]).length;
  const unpaidN = act.length - paidN;
  const amt = Number(amount) || 0;
  const income = paidN * amt;
  const spent = (expenses || []).reduce((n, e) => n + (Number(e.amount) || 0), 0);
  return {
    total: act.length,
    paidN,
    unpaidN,
    pct: act.length ? Math.round((paidN / act.length) * 100) : 0,
    outstanding: unpaidN * amt,
    income,
    spent,
    balance: income - spent,
  };
}

/** '2026-09' → '9월', '2026' → '2026년' */
export const periodTitle = (periodKey) => {
  const [y, m] = String(periodKey || '').split('-');
  return m ? `${Number(m)}월` : `${y}년`;
};

export const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

export default { activeMembers, periodExpenses, feeSummary, periodTitle, won };
