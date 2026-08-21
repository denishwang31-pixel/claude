/* 총무 기능 테스트 — 독촉 규칙과 결산 집계 */
import {
  DUN_STAGE, DUN_STAGES, dueDateOf, daysBetween, stageFor,
  unpaidMembers, recipientsFor, messageFor, canSend, planAutoSend, periodLabel,
  summaryForManager,
} from '../src/lib/dunning.js';
import {
  settle, compare, previousPeriod, deltaText, toPlainText, won,
} from '../src/lib/settlement.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const MEMBERS = [
  { id: 'a', name: '김철수', status: '활동' },
  { id: 'b', name: '이영희', status: '활동' },
  { id: 'c', name: '박민수', status: '활동' },
  { id: 'd', name: '휴면회원', status: '휴면' },
  { id: 'e', name: '탈퇴회원', status: '탈퇴' },
];

console.log('[납부 기한]');
ok(dueDateOf('2026-08', 10) === '2026-08-10', '기본');
ok(dueDateOf('2026-02', 31) === '2026-02-28', '2월에 31일 → 말일로 보정');
ok(dueDateOf('2026-01', 0) === '2026-01-01', '0일 → 1일로 보정');
ok(daysBetween('2026-08-10', '2026-08-11') === 1, '하루 차이');
ok(daysBetween('2026-08-10', '2026-08-07') === -3, '3일 전');

console.log('[단계 선택]');
ok(stageFor('2026-08', '2026-08-07', 10)?.key === DUN_STAGE.PRE, 'D-3 사전 안내');
ok(stageFor('2026-08', '2026-08-11', 10)?.key === DUN_STAGE.FIRST, 'D+1 1차');
ok(stageFor('2026-08', '2026-08-15', 10)?.key === DUN_STAGE.SECOND, 'D+5 2차');
ok(stageFor('2026-08', '2026-08-20', 10)?.key === DUN_STAGE.FINAL, 'D+10 최종');
ok(stageFor('2026-08', '2026-08-13', 10) === null, '해당 없는 날은 안 보낸다');
ok(stageFor('2026-08', '2026-08-10', 10) === null, '기한 당일은 안 보낸다');

console.log('[규칙 1 — 총무 이름을 넣지 않는다]');
DUN_STAGES.forEach((s) => {
  const m = messageFor(s, {
    clubName: '테스트클럽', monthKey: '2026-08', amount: 30000,
    dueDate: '2026-08-10', account: '신한 110-123',
  });
  ok(!/총무|매니저/.test(m.title + m.body), `${s.label}: 총무 언급 없음`);
  ok(m.title.includes('테스트클럽'), `${s.label}: 클럽 이름으로 발신`);
  ok(m.body.includes('30,000원'), `${s.label}: 금액 표시`);
});

console.log('[규칙 2·3 — 미납자 본인에게만]');
{
  const paid = { a: true };
  const unpaid = unpaidMembers(MEMBERS, paid);
  ok(unpaid.length === 2, `활동 미납자 2명 (${unpaid.length})`);
  ok(!unpaid.some((m) => m.id === 'a'), '납부자는 제외');
  ok(!unpaid.some((m) => m.status === '휴면'), '휴면 회원은 독촉하지 않는다');
  ok(!unpaid.some((m) => m.status === '탈퇴'), '탈퇴 회원은 독촉하지 않는다');

  const pre = recipientsFor(DUN_STAGES[0], MEMBERS, paid);
  ok(pre.length === 3, `사전 안내는 활동 회원 전체 (${pre.length})`);
  const first = recipientsFor(DUN_STAGES[1], MEMBERS, paid);
  ok(first.length === 2, `1차는 미납자만 (${first.length})`);
  ok(first.every((m) => !paid[m.id]), '납부자에게 안 간다');
}

console.log('[규칙 4 — 최종 단계는 자동 발송 금지]');
{
  const finalStage = DUN_STAGES.find((s) => s.key === DUN_STAGE.FINAL);
  ok(finalStage.auto === false, '최종 단계는 auto=false');
  const plan = planAutoSend({
    clubName: 'C', monthKey: '2026-08', today: '2026-08-20', dueDay: 10,
    amount: 30000, members: MEMBERS, paidMap: {}, sent: {},
  });
  ok(plan.recipients.length === 0, '자동 발송 대상 없음');
  ok(plan.needsApproval === true, '총무 승인 필요로 표시');
}

console.log('[규칙 5 — 같은 단계는 한 번만]');
{
  const stage = DUN_STAGES.find((s) => s.key === DUN_STAGE.FIRST);
  ok(canSend(stage, '2026-08', {}).ok, '처음은 보낼 수 있다');
  const sent = { '2026-08': { first: '2026-08-11' } };
  ok(!canSend(stage, '2026-08', sent).ok, '이미 보냈으면 막힌다');
  ok(canSend(stage, '2026-09', sent).ok, '다음 달은 다시 보낼 수 있다');
  const plan = planAutoSend({
    clubName: 'C', monthKey: '2026-08', today: '2026-08-11', dueDay: 10,
    amount: 30000, members: MEMBERS, paidMap: {}, sent,
  });
  ok(plan.recipients.length === 0, '중복 발송 계획이 서지 않는다');
}

console.log('[자동 발송 계획]');
{
  const plan = planAutoSend({
    clubName: '테스트클럽', monthKey: '2026-08', today: '2026-08-11', dueDay: 10,
    amount: 30000, members: MEMBERS, paidMap: { a: true }, sent: {}, account: '신한 110',
  });
  ok(plan.stage.key === DUN_STAGE.FIRST, '1차 단계');
  ok(plan.recipients.length === 2, `미납자 2명에게 (${plan.recipients.length})`);
  ok(plan.message.body.includes('30,000원'), '금액 포함');
  ok(plan.message.body.includes('신한 110'), '입금 계좌 안내 포함');
}
{
  const plan = planAutoSend({
    clubName: 'C', monthKey: '2026-08', today: '2026-08-11', dueDay: 10,
    amount: 30000, members: MEMBERS, paidMap: { a: true, b: true, c: true }, sent: {},
  });
  ok(plan.recipients.length === 0, '전원 납부면 아무도 안 받는다');
}

console.log('[결산 집계]');
const FEES = [
  { id: '2026-01', amount: 30000, paid: { a: true, b: true, c: true } },
  { id: '2026-02', amount: 30000, paid: { a: true, b: true } },
  { id: '2026-03', amount: 30000, paid: { a: true } },
  { id: '2025-12', amount: 30000, paid: { a: true, b: true, c: true } },  // 전년
];
const EXPENSES = [
  { date: '2026-01-05', category: '코트 대관', amount: 120000 },
  { date: '2026-02-10', category: '코트 대관', amount: 120000 },
  { date: '2026-02-15', category: '공·소모품', amount: 40000 },
  { date: '2026-03-20', category: '회식', amount: 200000 },
  { date: '2025-11-01', category: '코트 대관', amount: 100000 },  // 전년
];
{
  const s = settle('2026', {
    fees: FEES, expenses: EXPENSES, members: MEMBERS,
    carryOver: 500000,
    extraIncome: [{ label: '게스트비', amount: 60000 }],
  });
  ok(s.feeIncome === 180000, `회비 수입 180,000 (${s.feeIncome})`);
  ok(s.extraSum === 60000, '기타 수입 합산');
  ok(s.income === 240000, `수입 합계 240,000 (${s.income})`);
  ok(s.spent === 480000, `지출 480,000 (${s.spent})`);
  ok(s.net === -240000, `당기 수지 (${s.net})`);
  ok(s.balance === 260000, `이월금 포함 잔액 260,000 (${s.balance})`);
  ok(!s.monthly.some((m) => m.month.startsWith('2025')), '전년 데이터가 안 섞인다');

  ok(s.byCategory[0].category === '코트 대관', '지출 1위는 코트 대관');
  ok(s.byCategory[0].amount === 240000, '코트 대관 합산');
  ok(Math.abs(s.byCategory.reduce((t, c) => t + c.ratio, 0) - 1) < 0.001, '비율 합 100%');

  ok(s.monthly.length === 3, `월별 3개월 (${s.monthly.length})`);
  ok(s.monthly[0].month === '2026-01', '월 정렬');

  const kim = s.roster.find((r) => r.name === '김철수');
  ok(kim.paidCount === 3 && kim.rate === 1, '김철수 전액 납부');
  ok(kim.owed === 0, '김철수 미납 0');
  const park = s.roster.find((r) => r.name === '박민수');
  ok(park.paidCount === 1, '박민수 1회 납부');
  ok(park.owed === 60000, `박민수 미납 60,000 (${park.owed})`);
  ok(s.roster[0].rate <= s.roster[s.roster.length - 1].rate, '납부율 낮은 순 정렬');
  ok(!s.roster.some((r) => r.name === '탈퇴회원'), '탈퇴 회원은 명세에서 제외');
  ok(s.arrearsTotal === 90000, `미납 총액 90,000 (${s.arrearsTotal})`);
}
{
  const s = settle('2026-02', { fees: FEES, expenses: EXPENSES, members: MEMBERS });
  ok(s.feeIncome === 60000, `2월만 집계 (${s.feeIncome})`);
  ok(s.spent === 160000, `2월 지출 (${s.spent})`);
}
{
  const empty = settle('2030', { fees: [], expenses: [], members: MEMBERS });
  ok(empty.income === 0 && empty.spent === 0, '데이터 없는 기간도 안전');
  ok(empty.byCategory.length === 0, '빈 항목');
  ok(empty.paidRate === 0, '납부율 0');
}

console.log('[전기 대비]');
{
  ok(previousPeriod('2026') === '2025', '연간 전기');
  ok(previousPeriod('2026-08') === '2025-08', '월간 전기');
  const cur = settle('2026', { fees: FEES, expenses: EXPENSES, members: MEMBERS });
  const prev = settle('2025', { fees: FEES, expenses: EXPENSES, members: MEMBERS });
  const c = compare(cur, prev);
  ok(c.income.now === cur.income && c.income.before === prev.income, '수입 비교');
  ok(c.spent.delta === cur.spent - prev.spent, '지출 증감');
  ok(compare(cur, null) === null, '전기 자료 없으면 null');
  ok(deltaText(c.income).length > 0, '증감 문구 생성');
}

console.log('[총회 자료 텍스트]');
{
  const s = settle('2026', {
    fees: FEES, expenses: EXPENSES, members: MEMBERS, carryOver: 500000,
    extraIncome: [{ label: '게스트비', amount: 60000 }],
  });
  const t = toPlainText(s, '테스트클럽');
  ok(t.includes('테스트클럽'), '클럽 이름');
  ok(t.includes('[수입]') && t.includes('[지출]') && t.includes('[수지]'), '항목 구성');
  ok(t.includes('코트 대관'), '지출 항목 포함');
  ok(t.includes('240,000원'), '금액 포맷');
  ok(t.split('\n').length > 10, '여러 줄 보고서');
  ok(won(30000) === '30,000원', '금액 표기');
  ok(periodLabel('2026-08') === '8월' && periodLabel('2026') === '2026년', '기간 표기');
}

/* 실제 앱에서는 필드가 비어 있거나 타입이 어긋난 문서가 섞여 들어온다.
   결산 화면이 그걸로 죽으면 총무는 총회 직전에 앱을 못 쓴다. */
console.log('[결산 — 이상한 데이터에도 죽지 않는다]');
{
  const cases = [
    ['빈 클럽', { fees: [], expenses: [], members: [] }],
    ['fees 에 amount 없음', { fees: [{ id: '2026-01', paid: { a: true } }], expenses: [], members: [{ id: 'a', name: '김' }] }],
    ['paid 가 null', { fees: [{ id: '2026-01', amount: 30000, paid: null }], expenses: [], members: [] }],
    ['지출 date 없음', { fees: [], expenses: [{ category: '기타', amount: 5000 }], members: [] }],
    ['지출 amount 가 문자열', { fees: [], expenses: [{ date: '2026-01-01', category: 'x', amount: '5000' }], members: [] }],
    ['회원 이름 없음', { fees: [{ id: '2026-01', amount: 1, paid: {} }], expenses: [], members: [{ id: 'a' }] }],
    ['연납(id 가 연도)', { fees: [{ id: '2026', amount: 300000, paid: { a: true } }], expenses: [], members: [{ id: 'a', name: '김' }] }],
    ['이월금이 문자열', { fees: [], expenses: [], members: [], carryOver: '500000' }],
    ['수기 수입에 금액 없음', { fees: [], expenses: [], members: [], extraIncome: [{ label: 'x' }] }],
    ['필드 자체가 undefined', { fees: undefined, expenses: undefined, members: undefined }],
  ];
  cases.forEach(([name, data]) => {
    let good = false;
    try {
      const cur = settle('2026', data);
      const before = settle(previousPeriod('2026'), data);
      deltaText(compare(cur, before)?.income);
      const text = toPlainText(cur, '테스트클럽');
      good = [cur.income, cur.spent, cur.balance, cur.net, cur.paidRate]
        .every((n) => Number.isFinite(n)) && typeof text === 'string';
    } catch (e) { good = false; }
    ok(good, `${name}: 계산이 끝나고 숫자가 유효하다`);
  });
}

/* ============================================================
   앱 ↔ 서버 사본 대조

   firebase deploy 는 functions/ 만 올리므로 서버는 src/lib 를 읽을 수
   없고, 독촉 로직이 두 벌 존재할 수밖에 없다.

   대조가 없던 동안 실제로 어긋나 있었다 — 앱은 최종 단계에 "사정이
   있으시면 운영진에게 알려 주세요"를 쓰는데, 서버는 2차 문구를 그대로
   다시 보내고 있었다. 돈 얘기라 어긋나도 아무도 모른다.
   ============================================================ */
console.log('\n[앱 ↔ 서버 사본 대조]');
{
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const srv = require('../functions/dunning.js');

  const PAID = { a: true };
  const SENT = { '2026-08': { first: '2026-08-11' } };
  const MSG_ARG = {
    clubName: '염곡클럽', monthKey: '2026-08', amount: 30000,
    dueDate: '2026-08-10', account: '국민 123-456',
  };

  const CASES = {
    dueDateOf: [
      ['2026-08', 10], ['2026-02', 31], ['2028-02', 31], ['2026-08', 0],
      ['2026-08', 99], ['2026', 10], ['', 10], [null, 5],
    ],
    daysBetween: [
      ['2026-08-10', '2026-08-11'], ['2026-08-10', '2026-08-07'],
      ['2026-08-10', '2026-08-10'], ['2026-12-31', '2027-01-01'],
    ],
    stageFor: [
      ['2026-08', '2026-08-07', 10], ['2026-08', '2026-08-11', 10],
      ['2026-08', '2026-08-15', 10], ['2026-08', '2026-08-20', 10],
      ['2026-08', '2026-08-09', 10], ['2026-08', '2026-08-10', 10],
    ],
    unpaidMembers: [[MEMBERS, PAID], [MEMBERS, {}], [MEMBERS, { a: 1, b: 1, c: 1 }]],
    recipientsFor: [
      [DUN_STAGES[0], MEMBERS, PAID], [DUN_STAGES[1], MEMBERS, PAID],
      [DUN_STAGES[3], MEMBERS, PAID], [null, MEMBERS, PAID],
    ],
    periodLabel: [['2026-08'], ['2026'], [''], ['2026-01']],
    messageFor: [
      [DUN_STAGES[0], MSG_ARG], [DUN_STAGES[1], MSG_ARG],
      [DUN_STAGES[2], MSG_ARG], [DUN_STAGES[3], MSG_ARG],
      [null, MSG_ARG], [DUN_STAGES[1], { ...MSG_ARG, account: '' }],
    ],
    summaryForManager: [
      ['염곡클럽', '2026-08', [{ id: 'b' }, { id: 'c' }], 30000],
      ['염곡클럽', '2026-08', [], 30000],
      ['', '2026', [{ id: 'b' }], 0],
    ],
    canSend: [
      [DUN_STAGES[1], '2026-08', SENT], [DUN_STAGES[2], '2026-08', SENT],
      [null, '2026-08', SENT], [DUN_STAGES[1], '2026-09', SENT],
    ],
    planAutoSend: [
      [{ clubName: '염곡클럽', monthKey: '2026-08', today: '2026-08-11', dueDay: 10, amount: 30000, members: MEMBERS, paidMap: PAID, sent: {}, account: '국민 123' }],
      [{ clubName: '염곡클럽', monthKey: '2026-08', today: '2026-08-11', dueDay: 10, amount: 30000, members: MEMBERS, paidMap: PAID, sent: SENT, account: '' }],
      [{ clubName: '염곡클럽', monthKey: '2026-08', today: '2026-08-20', dueDay: 10, amount: 30000, members: MEMBERS, paidMap: PAID, sent: {}, account: '' }],
      [{ clubName: '염곡클럽', monthKey: '2026-08', today: '2026-08-07', dueDay: 10, amount: 30000, members: MEMBERS, paidMap: {}, sent: {}, account: '' }],
      [{ clubName: '염곡클럽', monthKey: '2026-08', today: '2026-08-03', dueDay: 10, amount: 30000, members: MEMBERS, paidMap: {}, sent: {}, account: '' }],
      [{ clubName: '염곡클럽', monthKey: '2026-08', today: '2026-08-11', dueDay: 10, amount: 30000, members: MEMBERS, paidMap: { a: 1, b: 1, c: 1 }, sent: {}, account: '' }],
    ],
  };

  const app = {
    dueDateOf, daysBetween, stageFor, unpaidMembers, recipientsFor,
    periodLabel, messageFor, summaryForManager, canSend, planAutoSend,
  };

  let compared = 0;
  Object.entries(CASES).forEach(([fn, argSets]) => {
    if (typeof srv[fn] !== 'function') { ok(false, `서버에 ${fn} 없음`); return; }
    argSets.forEach((args, i) => {
      compared += 1;
      ok(JSON.stringify(app[fn](...args)) === JSON.stringify(srv[fn](...args)),
        `${fn} #${i + 1} 앱=서버 (기대 ${JSON.stringify(app[fn](...args))}, 실제 ${JSON.stringify(srv[fn](...args))})`);
    });
  });

  /* 단계 표는 그 자체가 계약이다 — 하나만 어긋나도 발송일이 달라진다 */
  ok(JSON.stringify(DUN_STAGES) === JSON.stringify(srv.DUN_STAGES), '단계 표가 같다');
  ok(JSON.stringify(DUN_STAGE) === JSON.stringify(srv.DUN_STAGE), '단계 키가 같다');
  console.log(`  (사본 대조 ${compared}건)`);
}

/* ============================================================
   하이어라키도 사본이 둘이다

   매일 도는 독촉 작업이 "이 코트장은 얼마를, 누구에게, 어느 문서에"를
   판단한다. 앱과 서버가 다른 답을 내면 총무 화면에는 미납으로 보이는데
   알림은 안 가거나(또는 그 반대), 발송 기록이 다른 문서에 쌓여 같은
   단계가 두 번 나간다. 둘 다 아무도 눈치채지 못한 채 벌어진다.
   ============================================================ */
console.log('\n[하이어라키 앱 ↔ 서버 사본 대조]');
{
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const srv = require('../functions/scope.js');
  const app = await import('../src/lib/scope.js');

  const CLUB_FLAT = { settings: { feeAmount: 30000, feeDueDay: 10 } };
  const CLUB_VENUE = {
    settings: {
      feeScope: 'venue', feeAmount: 30000, feeDueDay: 10, notify: { fee: true, guest: false },
    },
  };
  const VENUES = [
    { id: 'v1', name: '염곡' },
    { id: 'v2', name: '수도공고', feeAmount: 20000, feeDueDay: 25, notify: { fee: false } },
  ];
  const MEMBERS = [
    { id: 'a', venueIds: ['v1'], status: '활동' },
    { id: 'b', venueIds: ['v2'], status: '활동' },
    { id: 'c', status: '활동' },
    { id: 'd', venueIds: ['v1'], status: '탈퇴' },
  ];

  const CASES = {
    feeScopeOf: [[CLUB_FLAT], [CLUB_VENUE], [null], [{}]],
    feeRule: [
      [CLUB_FLAT, null], [CLUB_VENUE, VENUES[0]], [CLUB_VENUE, VENUES[1]],
      [null, null], [{ settings: { feeDueDay: 0 } }, null],
      [{ settings: { feeDueDay: 99 } }, null], [{ settings: { feeAmount: '이만원' } }, null],
      [{ settings: { feeAmount: 30000 } }, { feeAmount: 0 }],
    ],
    billingScopes: [
      [CLUB_FLAT, VENUES], [CLUB_VENUE, VENUES], [CLUB_VENUE, []], [null, null],
    ],
    feeDocKey: [['2026-08', null], ['2026-08', 'v1'], ['2026', null]],
    membersInScope: [
      [MEMBERS, null], [MEMBERS, 'v1'], [MEMBERS, 'v2'], [null, 'v1'],
    ],
    notifyRule: [
      [CLUB_VENUE, null, 'fee'], [CLUB_VENUE, VENUES[1], 'fee'],
      [CLUB_VENUE, VENUES[0], 'fee'], [CLUB_FLAT, null, 'guest'],
      [CLUB_VENUE, VENUES[1], 'notice'], [CLUB_FLAT, null, '없는종류'],
    ],
  };

  let n = 0;
  Object.entries(CASES).forEach(([fn, argSets]) => {
    if (typeof srv[fn] !== 'function') { ok(false, `서버 scope 에 ${fn} 없음`); return; }
    argSets.forEach((args, i) => {
      n += 1;
      const a = JSON.stringify(app[fn](...args));
      const b = JSON.stringify(srv[fn](...args));
      ok(a === b, `${fn} #${i + 1} 앱=서버 (앱 ${a} / 서버 ${b})`);
    });
  });

  /* 알림 종류 표 — 서버는 화면 문구를 안 옮기므로 뜻이 담긴 칸만 본다.
     audience 가 어긋나면 코트장별로 잘라야 할 알림이 전체로 나간다. */
  const strip = (k) => ({ key: k.key, audience: k.audience, def: k.def, force: k.force });
  ok(JSON.stringify(app.NOTIFY_KINDS.map(strip))
     === JSON.stringify(srv.NOTIFY_KINDS.map(strip)),
  '알림 종류 표(대상·기본값·강제)가 같다');
  ok(JSON.stringify(app.FEE_SCOPE) === JSON.stringify(srv.FEE_SCOPE), '청구 단위 키가 같다');
  console.log(`  (하이어라키 대조 ${n}건)`);
}

console.log(`\n총무 기능 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
