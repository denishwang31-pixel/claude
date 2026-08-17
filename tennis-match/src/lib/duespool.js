/* ============================================================
   일회성 정산 — 대회 참가비·캠프·회식처럼 그때그때 생기는 돈.

   정기 회비와 다른 점
     정기 회비는 "모두가 같은 금액을 매달". 일회성은 "참여한 사람만,
     경우에 따라 다른 금액을 한 번". 그래서 같은 화면에서 다루면
     둘 다 엉킨다. 별도 문서(duesPools)로 분리한다.

   나누는 방식 세 가지 — 실제 동호회에서 쓰는 것만 담았다
     EQUAL   총액을 인원수로 나눈다 (회식 더치페이)
     FIXED   1인당 금액이 정해져 있다 (대회 참가비 1인 2만원)
     CUSTOM  사람마다 금액이 다르다 (술 마신 사람 더 내기, 부분 참가)

   나머지 원 처리
     3명이 10,000원을 나누면 3,333원씩이고 1원이 남는다. 그 1원을
     누가 낼지 정하지 않으면 총액이 안 맞는다. 앞사람부터 1원씩 더
     붙여서 합계가 정확히 총액이 되게 한다.
   ============================================================ */

export const SPLIT = {
  EQUAL: 'equal',    // 총액 ÷ 인원
  FIXED: 'fixed',    // 1인당 정액
  CUSTOM: 'custom',  // 개인별 지정
};

export const SPLIT_MODES = [
  { key: SPLIT.EQUAL, label: '1/N', hint: '총액을 참여 인원으로 나눕니다 (회식 등)' },
  { key: SPLIT.FIXED, label: '1인당 정액', hint: '한 사람당 낼 금액이 정해진 경우 (대회 참가비 등)' },
  { key: SPLIT.CUSTOM, label: '개인별 지정', hint: '사람마다 금액이 다른 경우' },
];

/** 일회성 정산 분류 */
export const POOL_CATEGORIES = ['대회', '캠프·MT', '회식', '레슨', '용품', '기타'];

const num = (v) => Math.max(0, Math.round(Number(v) || 0));
export const won = (n) => `${num(n).toLocaleString()}원`;

/**
 * 참여자별로 내야 할 금액을 계산한다.
 *
 * @param pool {
 *   splitMode, total, perPerson,
 *   participants: [memberId],
 *   custom: { memberId: 금액 },   // CUSTOM 일 때
 * }
 * @returns { shares: {memberId: 금액}, total, perPerson, remainder }
 */
export function computeShares(pool = {}) {
  const ids = [...new Set(pool.participants || [])];
  const mode = pool.splitMode || SPLIT.EQUAL;
  const shares = {};

  if (!ids.length) return { shares, total: 0, perPerson: 0, remainder: 0 };

  if (mode === SPLIT.FIXED) {
    const each = num(pool.perPerson);
    ids.forEach((id) => { shares[id] = each; });
    return { shares, total: each * ids.length, perPerson: each, remainder: 0 };
  }

  if (mode === SPLIT.CUSTOM) {
    let sum = 0;
    ids.forEach((id) => {
      const v = num((pool.custom || {})[id]);
      shares[id] = v;
      sum += v;
    });
    return { shares, total: sum, perPerson: ids.length ? Math.round(sum / ids.length) : 0, remainder: 0 };
  }

  /* EQUAL — 나머지 원은 앞사람부터 1원씩 더 낸다.
     그래야 합계가 총액과 정확히 맞는다. */
  const total = num(pool.total);
  const base = Math.floor(total / ids.length);
  const remainder = total - base * ids.length;
  ids.forEach((id, i) => { shares[id] = base + (i < remainder ? 1 : 0); });
  return { shares, total, perPerson: base, remainder };
}

/** 납부 현황 요약 */
export function poolSummary(pool = {}, membersById = {}) {
  const { shares, total } = computeShares(pool);
  const paid = pool.paid || {};
  const ids = Object.keys(shares);

  const rows = ids.map((id) => ({
    id,
    name: membersById[id]?.name || '(탈퇴)',
    amount: shares[id],
    paid: !!paid[id],
  })).sort((a, b) => Number(a.paid) - Number(b.paid)
    || String(a.name).localeCompare(String(b.name), 'ko'));

  const collected = rows.filter((r) => r.paid).reduce((t, r) => t + r.amount, 0);
  const unpaidRows = rows.filter((r) => !r.paid);

  return {
    rows,
    unpaid: unpaidRows,
    total,
    collected,
    outstanding: total - collected,
    paidCount: rows.length - unpaidRows.length,
    count: rows.length,
    done: rows.length > 0 && unpaidRows.length === 0,
  };
}

/**
 * 송금 요청 문구. 개인에게 개별로 보낼 때 쓴다.
 * 정기 회비 독촉과 같은 원칙 — 총무 개인 이름을 넣지 않는다.
 */
export function requestMessage(pool, amount, { clubName, account } = {}) {
  const club = clubName || '클럽';
  const title = `${club} ${pool.title || '정산'}`;
  const due = pool.dueDate ? `\n납부 기한: ${pool.dueDate}` : '';
  const acc = account ? `\n입금: ${account}` : '';
  const memo = pool.memo ? `\n${pool.memo}` : '';
  return {
    title,
    body: `${pool.title || '정산'} ${won(amount)}${memo}${due}${acc}`,
  };
}

/** 단체방에 한 번에 붙여넣을 안내문 — 개인별 금액이 다를 때 유용하다 */
export function shareText(pool, membersById = {}, { clubName, account } = {}) {
  const s = poolSummary(pool, membersById);
  const L = [];
  L.push(`[${clubName || '클럽'}] ${pool.title || '정산'}`);
  if (pool.date) L.push(`일자: ${pool.date}`);
  L.push(`총액: ${won(s.total)} · ${s.count}명`);
  if (pool.memo) L.push(pool.memo);
  L.push('');
  s.rows.forEach((r) => L.push(`${r.paid ? '✓' : '·'} ${r.name}  ${won(r.amount)}`));
  L.push('');
  if (pool.dueDate) L.push(`납부 기한: ${pool.dueDate}`);
  if (account) L.push(`입금: ${account}`);
  return L.join('\n');
}

/** 새 정산 기본값 */
export const blankPool = (date = new Date().toISOString().slice(0, 10)) => ({
  title: '',
  category: POOL_CATEGORIES[0],
  date,
  dueDate: '',
  splitMode: SPLIT.EQUAL,
  total: '',
  perPerson: '',
  participants: [],
  custom: {},
  paid: {},
  memo: '',
  closed: false,
});

/** 저장 전 검증 — 사람이 실수하기 쉬운 지점만 막는다 */
export function validatePool(pool) {
  if (!String(pool.title || '').trim()) return '정산 이름을 입력하세요';
  if (!(pool.participants || []).length) return '참여자를 한 명 이상 고르세요';
  if (pool.splitMode === SPLIT.EQUAL && num(pool.total) <= 0) return '총액을 입력하세요';
  if (pool.splitMode === SPLIT.FIXED && num(pool.perPerson) <= 0) return '1인당 금액을 입력하세요';
  if (pool.splitMode === SPLIT.CUSTOM) {
    const { total } = computeShares(pool);
    if (total <= 0) return '개인별 금액을 입력하세요';
  }
  return '';
}
