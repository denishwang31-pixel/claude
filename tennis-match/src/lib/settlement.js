/* ============================================================
   결산 — 총회 회계보고 자료를 자동으로 만든다.

   총무 최대 스트레스 이벤트는 연말 총회의 회계보고다. 1년 치 엑셀을
   뒤져서 만들고, 총회장에서 회원들 앞에서 검증받는다. 그 자료가 앱 안에
   이미 다 있는데 손으로 다시 만들 이유가 없다.

   여기서는 숫자만 만든다. 화면에 어떻게 그릴지는 SettlementScreen 이,
   내보내기(HTML/공유)는 그 화면이 담당한다.
   ============================================================ */

const num = (v) => Number(v) || 0;
export const won = (n) => `${num(n).toLocaleString()}원`;

/** '2026-08-01' → '2026-08' / '2026-08' → '2026-08' */
const monthOf = (d) => String(d || '').slice(0, 7);
const yearOf = (d) => String(d || '').slice(0, 4);

/**
 * 한 해(또는 한 달)의 결산을 집계한다.
 *
 * @param period  '2026' (연간) 또는 '2026-08' (월간)
 * @param fees    [{ id: '2026-08', paid: {memberId:true}, amount: 30000 }]
 *                (id 가 기간 키. 월납은 'YYYY-MM', 연납은 'YYYY')
 * @param expenses[{ date, category, amount, memo, venueId }]
 * @param members [{ id, name, status }]
 * @param opts.carryOver 이월금 (전년도에서 넘어온 잔액)
 * @param opts.extraIncome [{ label, amount }] 게스트비·대회비 등 수기 수입
 */
export function settle(period, { fees = [], expenses = [], members = [], carryOver = 0, extraIncome = [] } = {}) {
  const inPeriod = (key) => String(key || '').startsWith(period);
  const activeMembers = members.filter((m) => !m.status || m.status === '활동');

  /* ---- 수입: 회비 ---- */
  const feeRows = fees.filter((f) => inPeriod(f.id));
  const feeIncome = feeRows.reduce(
    (t, f) => t + Object.values(f.paid || {}).filter(Boolean).length * num(f.amount),
    0,
  );

  /* ---- 수입: 그 밖 (게스트비·대회 등) ---- */
  const extraSum = extraIncome.reduce((t, x) => t + num(x.amount), 0);
  const income = feeIncome + extraSum;

  /* ---- 지출 ---- */
  const expRows = expenses.filter((e) => inPeriod(monthOf(e.date)) || inPeriod(yearOf(e.date)));
  const spent = expRows.reduce((t, e) => t + num(e.amount), 0);

  /* 항목별 지출 — 많은 순 */
  const byCategoryMap = {};
  expRows.forEach((e) => {
    const k = e.category || '기타';
    byCategoryMap[k] = (byCategoryMap[k] || 0) + num(e.amount);
  });
  const byCategory = Object.entries(byCategoryMap)
    .map(([category, amount]) => ({
      category,
      amount,
      ratio: spent ? amount / spent : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  /* ---- 월별 추이 ---- */
  const months = [...new Set([
    ...feeRows.map((f) => f.id),
    ...expRows.map((e) => monthOf(e.date)),
  ])].filter((m) => m.length === 7).sort();

  const monthly = months.map((m) => {
    const fee = feeRows.filter((f) => f.id === m)
      .reduce((t, f) => t + Object.values(f.paid || {}).filter(Boolean).length * num(f.amount), 0);
    const out = expRows.filter((e) => monthOf(e.date) === m)
      .reduce((t, e) => t + num(e.amount), 0);
    return { month: m, income: fee, spent: out, net: fee - out };
  });

  /* ---- 회원별 납부 명세 ---- */
  const periodKeys = feeRows.map((f) => f.id);
  const roster = activeMembers.map((m) => {
    const paidKeys = feeRows.filter((f) => f.paid?.[m.id]).map((f) => f.id);
    const unpaidKeys = periodKeys.filter((k) => !paidKeys.includes(k));
    const owed = unpaidKeys.reduce(
      (t, k) => t + num(feeRows.find((f) => f.id === k)?.amount), 0,
    );
    return {
      id: m.id,
      name: m.name,
      paidCount: paidKeys.length,
      totalCount: periodKeys.length,
      rate: periodKeys.length ? paidKeys.length / periodKeys.length : 0,
      unpaidKeys,
      owed,
    };
  }).sort((a, b) => a.rate - b.rate || String(a.name).localeCompare(String(b.name), 'ko'));

  const arrears = roster.filter((r) => r.owed > 0);

  return {
    period,
    income,
    feeIncome,
    extraIncome,
    extraSum,
    spent,
    net: income - spent,
    carryOver: num(carryOver),
    balance: num(carryOver) + income - spent,
    byCategory,
    monthly,
    roster,
    arrears,
    arrearsTotal: arrears.reduce((t, r) => t + r.owed, 0),
    expenseCount: expRows.length,
    memberCount: activeMembers.length,
    paidRate: roster.length
      ? roster.reduce((t, r) => t + r.rate, 0) / roster.length
      : 0,
  };
}

/** 전기 대비 증감 */
export function compare(current, previous) {
  if (!previous) return null;
  const diff = (a, b) => ({
    now: a, before: b, delta: a - b,
    pct: b ? (a - b) / Math.abs(b) : null,
  });
  return {
    income: diff(current.income, previous.income),
    spent: diff(current.spent, previous.spent),
    net: diff(current.net, previous.net),
  };
}

/** 전년도 기간 키 — '2026' → '2025', '2026-08' → '2025-08' */
export const previousPeriod = (period) => {
  const [y, m] = String(period).split('-');
  const py = String(Number(y) - 1);
  return m ? `${py}-${m}` : py;
};

/** 증감 표기 — "+12% (350,000원)" */
export const deltaText = (d) => {
  if (!d) return '';
  const sign = d.delta > 0 ? '+' : d.delta < 0 ? '−' : '';
  const pct = d.pct === null ? '' : ` ${sign}${Math.abs(Math.round(d.pct * 100))}%`;
  return `${pct} (${sign}${Math.abs(d.delta).toLocaleString()}원)`.trim();
};

/**
 * 총회 자료용 텍스트. 카톡·메일로 그대로 붙여넣을 수 있게 만든다.
 * (PDF 는 화면에서 HTML 로 출력한다 — 여기서는 어디에나 붙는 평문)
 */
export function toPlainText(s, clubName = '') {
  const L = [];
  L.push(`${clubName ? `${clubName} ` : ''}${s.period} 회계 보고`);
  L.push('='.repeat(28));
  L.push('');
  L.push('[수입]');
  L.push(`  회비        ${won(s.feeIncome)}`);
  s.extraIncome.forEach((x) => L.push(`  ${x.label}  ${won(x.amount)}`));
  L.push(`  수입 합계   ${won(s.income)}`);
  L.push('');
  L.push('[지출]');
  s.byCategory.forEach((c) =>
    L.push(`  ${c.category}  ${won(c.amount)} (${Math.round(c.ratio * 100)}%)`));
  L.push(`  지출 합계   ${won(s.spent)}`);
  L.push('');
  L.push('[수지]');
  if (s.carryOver) L.push(`  이월금      ${won(s.carryOver)}`);
  L.push(`  당기 수지   ${won(s.net)}`);
  L.push(`  기말 잔액   ${won(s.balance)}`);
  L.push('');
  L.push(`[납부] 회원 ${s.memberCount}명 · 평균 납부율 ${Math.round(s.paidRate * 100)}%`);
  if (s.arrears.length) {
    L.push(`  미납 ${s.arrears.length}명 · ${won(s.arrearsTotal)}`);
  } else {
    L.push('  미납 없음');
  }
  return L.join('\n');
}
