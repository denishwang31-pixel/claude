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
} from '../src/lib/scoreReport.js';

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

console.log(`\n점수 보고 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
