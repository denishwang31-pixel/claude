/* 회비 관리 현황판 계산 (src/lib/feeView.js) */
import { activeMembers, periodExpenses, feeSummary, periodTitle, won } from '../src/lib/feeView.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`);

const M = [
  { id: 'a', status: '활동' }, { id: 'b' }, { id: 'c', status: '활동' },
  { id: 'd', status: '휴면' }, { id: 'e', deleted: true },
];
console.log('[대상 회원]');
eq(activeMembers(M).map((m) => m.id), ['a', 'b', 'c'], '활동 회원만(상태 없음은 활동)');

console.log('[현황판 숫자]');
{
  const s = feeSummary({ members: M, paidMap: { a: true, d: true }, amount: 30000, expenses: [{ amount: 12000 }, { amount: '8000' }] });
  eq([s.total, s.paidN, s.unpaidN, s.pct], [3, 1, 2, 33], '납부 1 · 미납 2 (휴면은 안 셈)');
  eq(s.outstanding, 60000, '미수금 = 미납 × 회비');
  eq([s.income, s.spent, s.balance], [30000, 20000, 10000], '수입 · 지출 · 잔액');
  const z = feeSummary({ members: [], amount: 30000 });
  eq([z.pct, z.balance], [0, 0], '회원 없음');
  eq(feeSummary({ members: M, paidMap: { a: false, b: 0 }, amount: '30000' }).paidN, 0, '거짓 값은 미납');
}

console.log('[기간 지출]');
{
  const E = [
    { id: 1, date: '2026-09-03', amount: 1, venueId: 'v1' },
    { id: 2, date: '2026-09-20', amount: 1 },
    { id: 3, date: '2026-08-30', amount: 1, venueId: 'v1' },
    { id: 4, date: '2025-09-01', amount: 1 },
  ];
  eq(periodExpenses(E, '2026-09').map((e) => e.id), [2, 1], '그 달만, 최근 날짜 먼저');
  eq(periodExpenses(E, '2026').map((e) => e.id), [2, 1, 3], '연 단위');
  eq(periodExpenses(E, '2026-09', { venueId: 'v1' }).map((e) => e.id), [1], '코트장 거르기');
  eq(periodExpenses(E, '2026-09', { allowVenue: (v) => v === null }).map((e) => e.id), [2], '볼 수 있는 코트장만');
}

console.log('[표시]');
eq(periodTitle('2026-09'), '9월', '월');
eq(periodTitle('2026'), '2026년', '연');
eq(won(1234567), '1,234,567원', '금액');

console.log(`\n회비 현황판 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
