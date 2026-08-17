/* 일회성 정산 테스트 — 돈이라 합계가 1원도 어긋나면 안 된다 */
import {
  SPLIT, SPLIT_MODES, POOL_CATEGORIES, computeShares, poolSummary,
  requestMessage, shareText, blankPool, validatePool, won,
  groupPools, memberBreakdown,
} from '../src/lib/duespool.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const M = {
  a: { name: '김철수' }, b: { name: '이영희' },
  c: { name: '박민수' }, d: { name: '최수아' },
};
const sum = (o) => Object.values(o).reduce((t, v) => t + v, 0);

console.log('[1/N — 나머지 원까지 정확히]');
{
  const p = { splitMode: SPLIT.EQUAL, total: 120000, participants: ['a', 'b', 'c', 'd'] };
  const r = computeShares(p);
  ok(sum(r.shares) === 120000, `합계가 총액과 일치 (${sum(r.shares)})`);
  ok(Object.values(r.shares).every((v) => v === 30000), '4명 균등 30,000원');
}
{
  // 3명이 10,000원 → 3,334 / 3,333 / 3,333 = 10,000
  const p = { splitMode: SPLIT.EQUAL, total: 10000, participants: ['a', 'b', 'c'] };
  const r = computeShares(p);
  ok(sum(r.shares) === 10000, `나머지 원이 사라지지 않는다 (${sum(r.shares)})`);
  ok(r.remainder === 1, `나머지 1원 (${r.remainder})`);
  const vals = Object.values(r.shares).sort();
  ok(vals[vals.length - 1] - vals[0] === 1, '차이는 최대 1원');
}
{
  // 7명이 100,000원
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const r = computeShares({ splitMode: SPLIT.EQUAL, total: 100000, participants: ids });
  ok(sum(r.shares) === 100000, `7명 100,000원 정확 (${sum(r.shares)})`);
}
{
  // 나누어떨어지는 경우엔 나머지가 없다
  const r = computeShares({ splitMode: SPLIT.EQUAL, total: 90000, participants: ['a', 'b', 'c'] });
  ok(r.remainder === 0 && sum(r.shares) === 90000, '나누어떨어지면 나머지 0');
}

console.log('[1인당 정액 — 대회 참가비]');
{
  const r = computeShares({ splitMode: SPLIT.FIXED, perPerson: 20000, participants: ['a', 'b', 'c'] });
  ok(Object.values(r.shares).every((v) => v === 20000), '전원 20,000원');
  ok(r.total === 60000, `총액은 인원 × 정액 (${r.total})`);
}

console.log('[개인별 지정 — 사람마다 다른 금액]');
{
  const p = {
    splitMode: SPLIT.CUSTOM, participants: ['a', 'b', 'c'],
    custom: { a: 50000, b: 30000, c: 20000 },
  };
  const r = computeShares(p);
  ok(r.shares.a === 50000 && r.shares.c === 20000, '지정 금액 그대로');
  ok(r.total === 100000, `총액은 합산 (${r.total})`);
}

console.log('[예외]')
{
  ok(computeShares({}).total === 0, '빈 입력 안전');
  ok(Object.keys(computeShares({ participants: [] }).shares).length === 0, '참여자 0명');
  const dup = computeShares({ splitMode: SPLIT.EQUAL, total: 60000, participants: ['a', 'a', 'b'] });
  ok(Object.keys(dup.shares).length === 2, '중복 참여자는 한 번만');
  ok(sum(dup.shares) === 60000, '중복 제거 후에도 합계 정확');
  const neg = computeShares({ splitMode: SPLIT.FIXED, perPerson: -100, participants: ['a'] });
  ok(neg.shares.a === 0, '음수 금액은 0으로');
}

console.log('[납부 현황]');
{
  const p = {
    splitMode: SPLIT.EQUAL, total: 120000, participants: ['a', 'b', 'c', 'd'],
    paid: { a: true, b: true },
  };
  const s = poolSummary(p, M);
  ok(s.count === 4 && s.paidCount === 2, `2/4 납부 (${s.paidCount}/${s.count})`);
  ok(s.collected === 60000, `걷힌 금액 60,000 (${s.collected})`);
  ok(s.outstanding === 60000, `남은 금액 60,000 (${s.outstanding})`);
  ok(s.unpaid.length === 2, '미납 2명');
  ok(!s.unpaid.some((r) => r.id === 'a'), '납부자는 미납 목록에 없다');
  ok(!s.rows[0].paid, '미납자가 위로 정렬');
  ok(!s.done, '전원 납부 전에는 완료 아님');
  ok(s.collected + s.outstanding === s.total, '걷힌 것 + 남은 것 = 총액');
}
{
  const all = poolSummary({
    splitMode: SPLIT.EQUAL, total: 30000, participants: ['a', 'b', 'c'],
    paid: { a: true, b: true, c: true },
  }, M);
  ok(all.done && all.outstanding === 0, '전원 납부 시 완료');
}

console.log('[송금 요청 문구 — 총무 이름을 넣지 않는다]');
{
  const p = { title: '9월 회식', dueDate: '2026-09-20', memo: '고기집' };
  const msg = requestMessage(p, 25000, { clubName: '테스트클럽', account: '신한 110-123' });
  ok(msg.title.includes('테스트클럽'), '클럽 이름으로 발신');
  ok(!/총무/.test(msg.title + msg.body), '총무 개인 언급 없음');
  ok(msg.body.includes('25,000원'), '금액 포함');
  ok(msg.body.includes('2026-09-20'), '기한 포함');
  ok(msg.body.includes('신한 110-123'), '계좌 포함');
}

console.log('[단체 공유문]');
{
  const p = {
    title: '9월 회식', date: '2026-09-15', dueDate: '2026-09-20',
    splitMode: SPLIT.EQUAL, total: 120000, participants: ['a', 'b', 'c', 'd'],
    paid: { a: true },
  };
  const t = shareText(p, M, { clubName: '테스트클럽', account: '신한 110' });
  ok(t.includes('9월 회식') && t.includes('테스트클럽'), '제목');
  ok(t.includes('김철수') && t.includes('최수아'), '전원 표시');
  ok(t.includes('30,000원'), '개인별 금액');
  ok(t.includes('✓ 김철수'), '납부자 표시');
  ok(t.split('\n').length > 6, '여러 줄');
}

console.log('[검증]');
{
  ok(validatePool({ title: '', participants: ['a'] }).length > 0, '이름 없으면 거부');
  ok(validatePool({ title: '회식', participants: [] }).length > 0, '참여자 없으면 거부');
  ok(validatePool({ title: '회식', participants: ['a'], splitMode: SPLIT.EQUAL, total: 0 }).length > 0,
    '총액 0이면 거부');
  ok(validatePool({ title: '대회', participants: ['a'], splitMode: SPLIT.FIXED, perPerson: 0 }).length > 0,
    '정액 0이면 거부');
  ok(validatePool({
    title: '회식', participants: ['a'], splitMode: SPLIT.EQUAL, total: 30000,
  }) === '', '정상 입력은 통과');
  const b = blankPool('2026-09-01');
  ok(b.date === '2026-09-01' && b.splitMode === SPLIT.EQUAL, '기본값');
  ok(SPLIT_MODES.length === 3 && POOL_CATEGORIES.length > 0, '선택지 정의됨');
  ok(won(30000) === '30,000원', '금액 표기');
}

console.log('[이벤트 묶음 — 한 행사에 정산 여러 건]');
{
  /* 가을 캠프: 숙박비(전원 4명) + 회식(3명만) + 렌트카(2명만) */
  const pools = [
    {
      id: 'i1', groupId: 'camp', groupTitle: '가을 캠프', title: '숙박비', date: '2026-10-01',
      splitMode: SPLIT.EQUAL, total: 400000, participants: ['a', 'b', 'c', 'd'],
      paid: { a: true },
    },
    {
      id: 'i2', groupId: 'camp', title: '저녁 회식', date: '2026-10-02',
      splitMode: SPLIT.EQUAL, total: 150000, participants: ['a', 'b', 'c'],
      paid: { a: true },
    },
    {
      id: 'i3', groupId: 'camp', title: '렌트카', date: '2026-10-01',
      splitMode: SPLIT.FIXED, perPerson: 30000, participants: ['a', 'b'],
      paid: {},
    },
    /* 묶이지 않은 별개 정산 */
    { id: 'i4', title: '9월 회식', date: '2026-09-15',
      splitMode: SPLIT.EQUAL, total: 60000, participants: ['a', 'b'], paid: {} },
  ];
  const gs = groupPools(pools, M);
  ok(gs.length === 2, `이벤트 2개로 묶인다 (${gs.length})`);

  const camp = gs.find((g) => g.groupId === 'camp');
  ok(camp.title === '가을 캠프', 'groupTitle 이 묶음 제목');
  ok(camp.itemCount === 3, `정산 3건 (${camp.itemCount})`);
  ok(camp.total === 400000 + 150000 + 60000, `이벤트 총액 (${camp.total})`);
  ok(camp.memberCount === 4, `참여자 합집합 4명 (${camp.memberCount})`);

  /* a: 숙박 100,000 + 회식 50,000 + 렌트카 30,000 = 180,000 (숙박·회식만 납부) */
  const a = camp.rows.find((r) => r.id === 'a');
  ok(a.due === 180000, `a 총 청구 180,000 (${a.due})`);
  ok(a.paid === 150000, `a 납부 150,000 (${a.paid})`);
  ok(a.outstanding === 30000, `a 미납 30,000 (${a.outstanding})`);
  ok(!a.done, 'a 는 아직 완납 아님');

  /* d: 숙박비만 참여 */
  const d = camp.rows.find((r) => r.id === 'd');
  ok(d.due === 100000, `d 는 숙박비만 100,000 (${d.due})`);

  ok(camp.collected === 150000, `걷힌 금액 (${camp.collected})`);
  ok(camp.collected + camp.outstanding === camp.total, '걷힘 + 남음 = 총액');
  ok(!camp.done, '미납이 있으면 완료 아님');
  ok(camp.rows[0].done === false, '미납자가 위로 정렬');

  /* 묶이지 않은 정산도 이벤트 하나로 다뤄진다 */
  const solo = gs.find((g) => g.groupId === 'i4');
  ok(solo.itemCount === 1 && solo.title === '9월 회식', '단독 정산도 이벤트로 취급');

  ok(gs[0].date >= gs[1].date, '최근 이벤트가 앞');
}

console.log('[회원별 항목 내역]');
{
  const pools = [
    { id: 'i1', groupId: 'g', groupTitle: 'MT', title: '숙박', date: '2026-10-01',
      splitMode: SPLIT.EQUAL, total: 90000, participants: ['a', 'b', 'c'], paid: { a: true } },
    { id: 'i2', groupId: 'g', title: '고기', date: '2026-10-01',
      splitMode: SPLIT.EQUAL, total: 60000, participants: ['a', 'b'], paid: {} },
  ];
  const g = groupPools(pools, M)[0];
  const br = memberBreakdown(g, 'a');
  ok(br.items.length === 2, `a 는 2건 (${br.items.length})`);
  ok(br.due === 60000, `a 합계 60,000 (${br.due})`);
  ok(br.paid === 30000, `a 납부 30,000 (${br.paid})`);
  ok(br.outstanding === 30000, `a 미납 30,000 (${br.outstanding})`);

  const c = memberBreakdown(g, 'c');
  ok(c.items.length === 1, 'c 는 숙박만');
  ok(c.due === 30000, `c 합계 30,000 (${c.due})`);

  const none = memberBreakdown(g, 'zzz');
  ok(none.items.length === 0 && none.due === 0, '참여 안 한 사람은 0');
  ok(memberBreakdown(null, 'a').due === 0, '빈 이벤트 안전');
}

console.log(`\n일회성 정산 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
