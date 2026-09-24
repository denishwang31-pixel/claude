/* 점수 보고 — 한 팀이 넣고 상대 팀이 확인한다.

   이 검사가 지켜야 할 것은 딱 셋이다. 하나라도 무너지면 기능이
   있으나 마나 하다.
     1. 넣은 본인은 확인할 수 없다
     2. 같은 팀 동료도 확인할 수 없다 (상대 팀만)
     3. 확정된 뒤에는 회원이 못 고친다 (운영진만)                      */
import {
  SCORE_STATE, isOfflineId, sideOf, otherSide, scoreStateOf, mergeScores,
  validScore, canReport, canConfirm, canEditFinal, hasConfirmer,
  makeReport, makeFinal, awaitingMyConfirm, myUnreported, progressOf,
  lineupOf, sameLineup, staleScoreIds, scoreOp, isAdminOverride,
  scorePushPlan, scorePushText, myRoundSlots, pickMyRound,
} from '../src/lib/scoreReport.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const srv = require('../functions/scoreReport.js');

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => {
  if (c) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${m}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (name, got, want) => ok(
  JSON.stringify(got) === JSON.stringify(want), name,
  `기대 ${JSON.stringify(want)} / 실제 ${JSON.stringify(got)}`,
);
const section = (s) => console.log(`\n[${s}]`);

/* 1타임 1코트: (u1,u2) vs (u3,u4). u5 는 이 경기에 없는 회원. */
const M = {
  id: 'r1c1', round: 1, court: 1, type: '남복',
  teamA: ['u1', 'u2'], teamB: ['u3', 'u4'],
};
/* 상대 팀이 전부 오프라인 등록인 경기 */
const M_OFF = {
  id: 'r1c2', round: 1, court: 2, type: '혼복',
  teamA: ['u1', 'u5'], teamB: ['local:aaa', 'g:손님'],
};
const empty = { scores: {}, finals: {} };

/* ---------- 기본 ---------- */
section('누가 어느 팀인가');
eq('앞팀', sideOf(M, 'u1'), 'A');
eq('뒷팀', sideOf(M, 'u3'), 'B');
eq('안 뛴 사람', sideOf(M, 'u5'), null);
eq('빈 값에도 안 죽는다', sideOf(null, 'u1'), null);
eq('반대 팀', [otherSide('A'), otherSide('B'), otherSide(null)], ['B', 'A', null]);

section('앱을 쓸 수 없는 사람');
ok(isOfflineId('local:abc'), '오프라인 등록 회원');
ok(isOfflineId('g:김손님'), '게스트');
ok(!isOfflineId('u1'), '앱 사용자는 아니다');

section('점수 값 검사');
ok(validScore(6, 3), '6:3 은 된다');
ok(!validScore(6, 6), '동점은 막는다 — 승패가 안 갈린다');
ok(!validScore('', 3), '빈 칸은 막는다');
ok(!validScore(-1, 3), '음수는 막는다');
ok(!validScore(1.5, 3), '소수는 막는다');
ok(!validScore(100, 3), '터무니없는 값은 막는다');

/* ---------- 상태 ---------- */
section('세 가지 상태');
eq('아무도 안 넣음', scoreStateOf(empty, 'r1c1'), SCORE_STATE.NONE);
const pending = { scores: { r1c1: makeReport({ a: 6, b: 3, uid: 'u1', side: 'A' }) }, finals: {} };
eq('한 팀이 넣음', scoreStateOf(pending, 'r1c1'), SCORE_STATE.PENDING);
const done = {
  scores: {},
  finals: { r1c1: makeFinal({ a: 6, b: 3, by: 'u1' }, 'u3') },
};
eq('확정됨', scoreStateOf(done, 'r1c1'), SCORE_STATE.FINAL);
/* 확정이 대기보다 세다 — 둘 다 있으면 확정으로 본다 */
eq('둘 다 있으면 확정',
  scoreStateOf({ scores: { r1c1: {} }, finals: { r1c1: { a: 6, b: 3 } } }, 'r1c1'),
  SCORE_STATE.FINAL);

/* ---------- 핵심 1·2: 누가 확인할 수 있나 ---------- */
section('확인은 상대 팀만 — 이 기능의 전부');
ok(!canConfirm(M, pending, 'u1', false), '넣은 본인은 확인 불가');
ok(!canConfirm(M, pending, 'u2', false),
  '같은 팀 동료도 확인 불가 — 한 팀이 두 번 말하는 것일 뿐이다');
ok(canConfirm(M, pending, 'u3', false), '상대 팀은 확인 가능');
ok(canConfirm(M, pending, 'u4', false), '상대 팀 다른 사람도 가능');
ok(!canConfirm(M, pending, 'u5', false), '안 뛴 회원은 확인 불가');
ok(canConfirm(M, pending, 'u5', true), '운영진은 대리 확인 가능');

/* ⚠️ 운영진이라도 자기가 넣은 것은 못 누른다. 이걸 허용하면
      운영진은 예전처럼 혼자 다 정할 수 있게 되어 규칙이 무너진다. */
const pendingByAdmin = {
  scores: { r1c1: makeReport({ a: 6, b: 3, uid: 'u9', side: 'A' }) }, finals: {},
};
ok(!canConfirm(M, pendingByAdmin, 'u9', true),
  '운영진도 자기가 넣은 것은 확인 불가');

ok(!canConfirm(M, empty, 'u3', false), '넣은 점수가 없으면 확인할 것도 없다');
ok(!canConfirm(M, done, 'u3', false), '이미 확정된 것은 다시 확인 불가');

section('상대 팀이 전부 오프라인이면');
ok(hasConfirmer(M, 'B'), '앱 쓰는 사람이 있으면 확인 가능');
ok(!hasConfirmer(M_OFF, 'B'), '오프라인·게스트뿐이면 눌러 줄 사람이 없다');
const pendOff = {
  scores: { r1c2: makeReport({ a: 6, b: 2, uid: 'u1', side: 'A' }) }, finals: {},
};
ok(!canConfirm(M_OFF, pendOff, 'local:aaa', false), '오프라인 회원은 확인 못 한다');
ok(canConfirm(M_OFF, pendOff, 'u9', true), '그래서 운영진이 대신 확정한다');

/* ---------- 핵심 3: 확정 후 ---------- */
section('확정된 뒤에는 운영진만');
ok(!canReport(M, done, 'u1', false), '뛴 사람도 확정된 점수는 못 고친다');
ok(!canReport(M, done, 'u3', false), '상대 팀도 못 고친다');
ok(canReport(M, done, 'u9', true), '운영진은 고칠 수 있다');
ok(canEditFinal(true) && !canEditFinal(false), '확정본 수정은 운영진만');

section('누가 넣을 수 있나');
ok(canReport(M, empty, 'u1', false), '뛴 사람은 넣을 수 있다');
ok(canReport(M, empty, 'u3', false), '상대 팀도 넣을 수 있다 — 먼저 본 사람이 넣는다');
ok(!canReport(M, empty, 'u5', false), '안 뛴 회원은 못 넣는다');
ok(canReport(M, empty, 'u5', true), '운영진은 넣을 수 있다');
ok(!canReport(M, empty, null, false), '로그인 안 했으면 못 넣는다');

/* ---------- 대진표에 합치기 ---------- */
section('확정된 점수만 대진표에 얹는다');
{
  const ms = [M, M_OFF];
  const merged = mergeScores(ms, { r1c1: { a: 6, b: 3 } });
  eq('확정된 경기에는 점수가 붙는다', merged[0].score, { a: 6, b: 3 });
  eq('안 붙은 경기는 그대로', merged[1].score, undefined);

  /* ⚠️ 확인 대기 중인 숫자가 섞이면 "아직 아무도 맞다고 한 적 없는
     점수"로 랭킹이 매겨진다. mergeScores 는 finals 만 본다. */
  const m2 = mergeScores(ms, undefined);
  eq('확정이 없으면 아무것도 안 붙는다', m2[0].score, undefined);

  eq('원본을 건드리지 않는다', M.score, undefined);
  eq('빈 입력에도 안 죽는다', mergeScores(null, null), []);
}

/* ---------- 화면에 띄울 목록 ---------- */
section('내가 할 일');
{
  const ms = [M, M_OFF];
  const st = {
    scores: {
      r1c1: makeReport({ a: 6, b: 3, uid: 'u1', side: 'A' }),
    },
    finals: {},
  };
  eq('u3 은 확인할 게 1건', awaitingMyConfirm(ms, st, 'u3', false).map((m) => m.id), ['r1c1']);
  eq('u1 은 확인할 게 없다 (본인이 넣음)', awaitingMyConfirm(ms, st, 'u1', false).length, 0);
  eq('u1 이 아직 안 넣은 내 경기', myUnreported(ms, st, 'u1').map((m) => m.id), ['r1c2']);
  /* ⚠️ u5 는 M_OFF 의 앞팀이라 '안 뛴 사람'이 아니다. 처음에 u5 로
     적었다가 검사가 잡았다 — 예시 명단을 안 보고 쓴 내 잘못이다. */
  eq('안 뛴 사람은 넣을 게 없다', myUnreported(ms, st, 'u7').length, 0);
}

section('진행 상황');
{
  const ms = [M, M_OFF, { id: 'r2c1', teamA: ['u1', 'u3'], teamB: ['u2', 'u4'] }];
  const st = {
    scores: { r1c2: makeReport({ a: 6, b: 1, uid: 'u1', side: 'A' }) },
    finals: { r1c1: makeFinal({ a: 6, b: 3, by: 'u1' }, 'u3') },
  };
  eq('3경기 중 1확정 1대기 1미입력', progressOf(ms, st), {
    total: 3, final: 1, pending: 1, none: 1,
  });
  eq('빈 입력', progressOf(null, null), { total: 0, final: 0, pending: 0, none: 0 });
}

section('기록 만들기');
{
  const r = makeReport({ a: '6', b: '3', uid: 'u1', side: 'A' });
  eq('숫자로 바꿔 담는다', [r.a, r.b], [6, 3]);
  eq('누가 넣었는지 남는다', [r.by, r.side], ['u1', 'A']);
  ok(typeof r.at === 'number', '시각이 남는다');

  const f = makeFinal(r, 'u3');
  eq('확정본은 넣은 사람과 확인한 사람을 둘 다 남긴다',
    [f.by, f.confirmBy, f.a, f.b], ['u1', 'u3', 6, 3]);
  ok(f.admin === false, '상대 확인으로 확정된 것은 admin 이 아니다');

  const fa = makeFinal(r, 'u9', { admin: true });
  ok(fa.admin === true, '운영진이 직접 확정한 것은 표시가 남는다');
}

/* ---------- 규칙이 읽는 명단 ---------- */
section('명단(lineup) — 규칙이 "뛴 사람인가"를 보는 곳');
{
  const lu = lineupOf([M, M_OFF]);
  eq('경기별 두 팀', lu.r1c1, { A: ['u1', 'u2'], B: ['u3', 'u4'] });
  eq('빈 입력', lineupOf(null), {});
  ok(sameLineup(lu, lineupOf([M, M_OFF])), '같은 대진이면 같다');
  ok(sameLineup({ x: { A: ['b', 'a'], B: [] } }, { x: { A: ['a', 'b'], B: [] } }),
    '팀 안의 순서는 상관없다 — 누가 뛰었는지만 본다');
  ok(!sameLineup({ x: { A: ['a'], B: ['b'] } }, { x: { A: ['b'], B: ['a'] } }),
    '앞뒤 팀이 바뀌면 다르다');
  ok(!sameLineup(undefined, lu), '명단이 없던 예전 대진은 다르다 — 채워야 한다');
}

section('대진을 다시 저장할 때 지울 점수');
{
  const prev = [M, { id: 'mn-1-2', teamA: ['u1', 'u2'], teamB: ['u3', 'u4'] }];
  const mt = {
    scores: { r1c1: { a: 6, b: 3 } },
    finals: { 'mn-1-2': { a: 6, b: 1 }, oldjunk: { a: 6, b: 0 } },
  };
  /* ⚠️ 수기 표의 id 는 고정이다. 같은 칸에 다른 사람을 넣었는데 점수를
        안 지우면, 예전 경기의 확정 점수가 새 사람들의 기록이 된다. */
  const next = [M, { id: 'mn-1-2', teamA: ['u5', 'u6'], teamB: ['u3', 'u4'] }];
  eq('사람이 바뀐 칸의 점수 + 예전 찌꺼기를 지운다',
    staleScoreIds(prev, next, mt).sort(), ['mn-1-2', 'oldjunk']);
  eq('사람이 그대로면 지우지 않는다', staleScoreIds(prev, prev, { finals: { r1c1: {} } }), []);
  eq('대진을 비우면 전부 지운다', staleScoreIds(prev, [], mt).sort(), ['mn-1-2', 'oldjunk', 'r1c1']);
  eq('점수가 없으면 지울 것도 없다', staleScoreIds(prev, [], {}), []);
}

section('운영진 수정인가 — 입력은 뛴 사람이 한다');
{
  /* 운영진이라도 자기가 뛴 경기는 상대 확인을 받는다. 이걸 풀면
     "운영진은 혼자 정해도 된다"는 구멍이 생긴다. */
  const MA = { ...M, teamA: ['boss', 'u2'] };
  ok(!isAdminOverride(MA, empty, 'boss', true), '운영진이 뛴 경기는 일반 입력(상대 확인 필요)');
  ok(isAdminOverride(M, empty, 'boss', true), '운영진이 안 뛴 경기는 운영진 수정');
  ok(isAdminOverride(MA, { finals: { r1c1: { a: 6, b: 3 } } }, 'boss', true),
    '확정된 경기를 고치는 것은 운영진 수정');
  ok(!isAdminOverride(M, empty, 'u1', false), '회원은 운영진 수정이 아니다');
}

section('쓰기 표지(scoreOp)');
{
  const o = scoreOp('report', 'r1c1', 'u1');
  eq('종류·경기·사람', [o.kind, o.match, o.by], ['report', 'r1c1', 'u1']);
}

/* ---------- 알림 ---------- */
section('알림 — 할 일이 생긴 사람에게만');
{
  const base = { matches: [M, M_OFF], scores: {}, finals: {} };
  const after = {
    ...base,
    scores: { r1c1: makeReport({ a: 6, b: 3, uid: 'u1', side: 'A' }) },
    scoreOp: { kind: 'report', match: 'r1c1', by: 'u1', at: 1 },
  };
  const plan = scorePushPlan(base, after);
  eq('넣으면 상대 팀에게', plan && plan.to, ['u3', 'u4']);
  ok(plan && plan.kind === 'report', '종류는 확인 요청');

  eq('같은 표지가 또 오면(다른 필드만 바뀜) 안 보낸다',
    scorePushPlan(after, { ...after, rsvp: { u9: 'yes' } }), null);

  /* 상대가 전부 오프라인이면 받을 사람이 없다 */
  const offAfter = {
    ...base,
    scores: { r1c2: makeReport({ a: 6, b: 2, uid: 'u1', side: 'A' }) },
    scoreOp: { kind: 'report', match: 'r1c2', by: 'u1', at: 2 },
  };
  eq('상대가 전부 오프라인이면 보내지 않는다', scorePushPlan(base, offAfter), null);

  /* 아니라고 하면 넣은 사람에게 */
  const rejected = {
    ...base, scores: {},
    scoreOp: { kind: 'reject', match: 'r1c1', by: 'u3', at: 3 },
  };
  const rp = scorePushPlan(after, rejected);
  eq('아니라고 하면 넣은 사람에게', rp && rp.to, ['u1']);
  /* 자기 보고를 자기가 물린 경우엔 알릴 사람이 없다 */
  eq('자기가 물린 것은 안 보낸다',
    scorePushPlan(after, { ...rejected, scoreOp: { kind: 'reject', match: 'r1c1', by: 'u1', at: 4 } }), null);

  /* 확정은 보내지 않는다 — 할 일이 없는 알림은 알림을 끄게 만든다 */
  const confirmed = {
    ...base, scores: {}, finals: { r1c1: makeFinal(after.scores.r1c1, 'u3') },
    scoreOp: { kind: 'confirm', match: 'r1c1', by: 'u3', at: 5 },
  };
  eq('확정은 알리지 않는다', scorePushPlan(after, confirmed), null);

  const names = { u1: '김민수', u2: '이준호', u3: '박지연', u4: '최서윤' };
  const txt = scorePushText(plan, (id) => names[id]);
  ok(/김민수님이 1타임/.test(txt.body), '누가 넣었는지 적힌다', txt.body);
  ok(/김민수·이준호 6 : 3 박지연·최서윤/.test(txt.body), '두 팀 이름과 점수가 적힌다', txt.body);
  eq('알릴 게 없으면 문구도 없다', scorePushText(null), null);
}

/* ---------- 앱과 서버가 같은 답을 내는가 ----------
   서버는 functions/ 의 사본을 쓴다(배포 묶음에 src/lib 가 안 들어간다).
   말로만 같아야 한다고 적어 두면 반드시 어긋난다. 같은 입력을 양쪽에
   넣어 대조한다. 한쪽만 고치면 여기서 깨진다. */
section('앱과 서버가 같은 답을 내는가');
{
  const base = { matches: [M, M_OFF], scores: {}, finals: {} };
  const rep = makeReport({ a: 6, b: 3, uid: 'u1', side: 'A' });
  const cases = [
    [base, { ...base, scores: { r1c1: rep }, scoreOp: { kind: 'report', match: 'r1c1', by: 'u1', at: 1 } }],
    [base, { ...base, scores: { r1c2: rep }, scoreOp: { kind: 'report', match: 'r1c2', by: 'u1', at: 1 } }],
    [{ ...base, scores: { r1c1: rep } }, { ...base, scoreOp: { kind: 'reject', match: 'r1c1', by: 'u3', at: 2 } }],
    [{ ...base, scores: { r1c1: rep } }, { ...base, scoreOp: { kind: 'reject', match: 'r1c1', by: 'u1', at: 2 } }],
    [base, { ...base, scoreOp: { kind: 'confirm', match: 'r1c1', by: 'u3', at: 3 } }],
    [base, { ...base, scoreOp: { kind: 'report', match: 'nope', by: 'u1', at: 4 } }],
    [base, base],
    [null, null],
  ];
  const names = { u1: '김민수', u3: '박지연' };
  cases.forEach(([bf, af], i) => {
    const a = scorePushPlan(bf, af);
    const s2 = srv.scorePushPlan(bf, af);
    eq(`알림 대상 ${i + 1}`, s2, a);
    eq(`알림 문구 ${i + 1}`, srv.scorePushText(s2, (id) => names[id]), scorePushText(a, (id) => names[id]));
  });
  ['local:x', 'g:손님', 'u1', '', null].forEach((id) =>
    eq(`오프라인 판정 ${String(id)}`, srv.isOfflineId(id), isOfflineId(id)));
}

console.log('\n[내 경기 1~N경기 버튼]');
{
  const ms = [
    { id: 'r1c1', round: 1, teamA: ['me', 'a'], teamB: ['b', 'c'], score: { a: 6, b: 3 } },
    { id: 'r1c2', round: 1, teamA: ['d', 'e'], teamB: ['f', 'g'] },
    { id: 'r2c1', round: 2, teamA: ['d', 'e'], teamB: ['f', 'g'] },
    { id: 'r3c2', round: 3, teamA: ['b', 'c'], teamB: ['a', 'me'] },
    { id: 'r4c1', round: 4, teamA: ['me', 'b'], teamB: ['c', 'd'] },
  ];
  const slots = myRoundSlots(ms, 'me', 4);
  eq('칸 수 = 그날 경기 수', slots.length, 4);
  eq('내가 뛰는 경기만 채움', slots.map((x) => (x.match ? x.match.id : null)), ['r1c1', null, 'r3c2', 'r4c1']);
  eq('B팀으로 뛰어도 내 경기', slots[2].match.id, 'r3c2');
  eq('처음엔 아직 점수 없는 가장 이른 내 경기', pickMyRound(slots), 3);
  const done = ms.map((m) => ({ ...m, score: { a: 6, b: 4 } }));
  eq('다 끝났으면 마지막 내 경기', pickMyRound(myRoundSlots(done, 'me', 4)), 4);
  eq('내 경기 없으면 null', pickMyRound(myRoundSlots(ms, 'nobody', 4)), null);
  eq('모임 경기 수보다 대진이 길면 대진 기준', myRoundSlots([{ id: 'x', round: 6, teamA: ['me'], teamB: ['z'] }], 'me', 4).length, 6);
  eq('로그인 없음이면 전부 빈 칸', myRoundSlots(ms, null, 4).every((x) => !x.match), true);
  eq('대진 없음', myRoundSlots([], 'me', 0).length, 0);
}

console.log(`\n점수 보고 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
