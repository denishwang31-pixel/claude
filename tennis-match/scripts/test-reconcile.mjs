/* 입금 대사 테스트 — 돈 문제라 자동 확정은 확실할 때만 되어야 한다. */
import {
  toJamo, editDistance, cleanName, nameScore, toDate,
  parseStatement, matchRow, reconcile, learnAlias, MATCH,
} from '../src/lib/reconcile.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

console.log('[한글 자모 분해]');
ok(toJamo('강') === 'ㄱㅏㅇ', '받침 있는 글자');
ok(toJamo('가') === 'ㄱㅏ', '받침 없는 글자');
ok(toJamo('김철수').length === 8, '이름 전체 분해');
ok(toJamo('abc') === 'abc', '한글이 아니면 그대로');
ok(toJamo('') === '', '빈 문자열');

console.log('[이름 정리]');
ok(cleanName('홍길동외1') === '홍길동', '"외1" 제거');
ok(cleanName('홍길동 외 2명') === '홍길동', '"외 2명" 제거');
ok(cleanName('홍길동(부인)') === '홍길동', '괄호 설명 제거');
ok(cleanName(' 홍 길 동 ') === '홍길동', '공백 제거');

console.log('[이름 유사도]');
ok(nameScore('김철수', '김철수') === 1, '완전 일치 = 1');
ok(nameScore('황동현외1', '황동현') === 1, '"외1"은 같은 사람');
ok(nameScore('김철수', '김철') > 0.8, '절삭된 이름은 높은 점수');
ok(nameScore('김민서', '김민써') > 0.6, '받침 하나 차이는 유사');
ok(nameScore('김철수', '박영희') < 0.5, '완전히 다른 이름은 낮음');
ok(nameScore('김철수', '') === 0, '빈 이름은 0');
ok(nameScore('이', '이철수') < 0.5, '한 글자로는 단정하지 않는다');

console.log('[날짜 파싱]');
ok(toDate('2026-08-01') === '2026-08-01', 'YYYY-MM-DD');
ok(toDate('2026.08.01') === '2026-08-01', 'YYYY.MM.DD');
ok(toDate('08/01', 2026) === '2026-08-01', 'MM/DD + 기준연도');
ok(toDate('20260801') === '2026-08-01', 'YYYYMMDD');
ok(toDate('내용없음') === '', '날짜가 없으면 빈 문자열');

console.log('[거래내역 파싱 — 은행별 형태]');
{
  const 신한 = `2026-08-01\t30,000\t김철수\t1,250,000
2026-08-02\t30,000\t이영희\t1,280,000`;
  const r = parseStatement(신한);
  ok(r.length === 2, `탭 구분 2줄 (${r.length})`);
  ok(r[0].amount === 30000, `금액 30000 (${r[0].amount})`);
  ok(r[0].name === '김철수', `이름 김철수 (${r[0].name})`);
  ok(r[0].date === '2026-08-01', '날짜');
}
{
  const 국민 = `08.01 입금 30,000 김철수
08.02 입금 30,000 이영희`;
  const r = parseStatement(국민, { baseYear: 2026 });
  ok(r.length === 2, `연도 없는 형식 2줄 (${r.length})`);
  ok(r[0].name === '김철수', `이름 (${r[0].name})`);
  ok(r[0].date === '2026-08-01', `기준연도 적용 (${r[0].date})`);
}
{
  const 머리글 = `거래일시\t적요\t입금액\t출금액\t잔액
2026-08-01\t김철수\t30,000\t\t1,250,000`;
  const r = parseStatement(머리글);
  ok(r.length === 1, `표 머리글은 건너뛴다 (${r.length})`);
}
{
  const 출금섞임 = `2026-08-01 입금 30,000 김철수
2026-08-03 카드결제 55,000 코트대관
2026-08-05 입금 30,000 이영희`;
  const r = parseStatement(출금섞임);
  ok(r.length === 2, `출금 줄은 제외 (${r.length})`);
  ok(!r.some((x) => x.name === '코트대관'), '카드결제가 안 섞인다');
}
{
  ok(parseStatement('').length === 0, '빈 입력은 0건');
  ok(parseStatement('아무 의미 없는 글').length === 0, '거래내역이 아니면 0건');
}

console.log('[매칭 — 자동 확정은 확실할 때만]');
const MEMBERS = [
  { id: 'a', name: '김철수' }, { id: 'b', name: '이영희' },
  { id: 'c', name: '박민수' }, { id: 'd', name: '김철수' },  // 동명이인
];
const SOLO = MEMBERS.slice(0, 3);
{
  const m = matchRow({ name: '김철수', amount: 30000 }, SOLO, { amount: 30000 });
  ok(m.kind === MATCH.AUTO, '이름·금액 일치 → 자동');
  ok(m.memberId === 'a', '올바른 회원');
}
{
  const m = matchRow({ name: '김철수', amount: 30000 }, MEMBERS, { amount: 30000 });
  ok(m.kind === MATCH.SUGGEST, '동명이인이면 자동 확정하지 않는다');
  ok(m.candidates.length >= 2, '두 후보를 모두 제시한다');
}
{
  const m = matchRow({ name: '김철', amount: 30000 }, SOLO, { amount: 30000 });
  ok(m.kind !== MATCH.NONE, '절삭된 이름도 후보를 찾는다');
  ok(m.memberId === 'a', '절삭 이름 → 김철수');
}
{
  const m = matchRow({ name: '전혀다른사람', amount: 30000 }, SOLO, { amount: 30000 });
  ok(m.kind === MATCH.NONE, '모르는 이름은 후보 없음');
  ok(m.memberId === null, '임의로 맞히지 않는다');
}
{
  // 이미 납부한 사람은 순위를 낮춘다
  const unpaid = new Set(['b', 'c']);
  const m = matchRow({ name: '김철수', amount: 30000 }, SOLO, { amount: 30000, unpaid });
  ok(m.kind === MATCH.SUGGEST, '이미 낸 사람은 자동 확정하지 않는다');
}
{
  const aliases = { 김철수부인: 'a' };
  const m = matchRow({ name: '김철수부인', amount: 30000 }, SOLO, { amount: 30000, aliases });
  ok(m.kind === MATCH.AUTO && m.memberId === 'a', '별칭은 즉시 확정');
  ok(m.byAlias === true, '별칭으로 맞춘 것임을 표시');
}

console.log('[전체 대사]');
{
  const text = `2026-08-01\t30,000\t김철수\t1,250,000
2026-08-02\t30,000\t이영희\t1,280,000
2026-08-03\t30,000\t알수없는이름\t1,310,000`;
  const r = reconcile(text, SOLO, { amount: 30000, paid: {} });
  ok(r.rows.length === 3, `3줄 처리 (${r.rows.length})`);
  ok(r.summary.matched === 2, `자동 매칭 2건 (${r.summary.matched})`);
  ok(r.summary.unknown === 1, `미확인 1건 (${r.summary.unknown})`);
  ok(r.autoPaid.a && r.autoPaid.b, '두 명 자동 납부 처리');
  ok(!r.autoPaid.c, '박민수는 처리되지 않는다');
  ok(r.summary.amountSum === 90000, `합계 90000 (${r.summary.amountSum})`);
}
{
  // 같은 사람이 두 줄에 매칭되면 두 번째는 확정하지 않는다
  const text = `2026-08-01\t30,000\t김철수\t1,250,000
2026-08-15\t30,000\t김철수\t1,280,000`;
  const r = reconcile(text, SOLO, { amount: 30000, paid: {} });
  ok(Object.keys(r.autoPaid).length === 1, '중복 입금은 한 번만 확정');
  ok(r.rows[1].match.duplicate === true, '두 번째 줄은 중복으로 표시');
}
{
  // 이미 낸 사람은 다시 자동 체크되지 않는다
  const text = '2026-08-01\t30,000\t김철수\t1,250,000';
  const r = reconcile(text, SOLO, { amount: 30000, paid: { a: true } });
  ok(r.summary.matched === 0, '납부 완료자는 자동 확정 안 함');
}
{
  const r = reconcile('', SOLO, { amount: 30000, paid: {} });
  ok(r.rows.length === 0 && r.summary.total === 0, '빈 입력 안전 처리');
}

console.log('[별칭 학습]');
{
  let aliases = {};
  aliases = learnAlias(aliases, '김철수부인', 'a');
  ok(aliases['김철수부인'] === 'a', '별칭 저장');
  const m = matchRow({ name: '김철수부인', amount: 30000 }, SOLO, { aliases });
  ok(m.memberId === 'a', '다음부터 자동으로 붙는다');
  ok(learnAlias(aliases, '', 'a') === aliases, '빈 이름은 저장하지 않는다');
  ok(learnAlias(aliases, '홍길동', null) === aliases, '회원 미지정은 저장하지 않는다');
  // "외1" 같은 군더더기는 정리된 형태로 저장돼야 다음에도 맞는다
  const a2 = learnAlias({}, '황동현외1', 'a');
  ok(a2['황동현'] === 'a', '정리된 이름으로 저장');
}

console.log(`\n입금 대사 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
