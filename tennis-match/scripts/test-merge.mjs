/* 오프라인 회원 합치기 — 서버 판단(functions/mergeMember.js)과 앱 권유(src/lib/mergeMember.js) */
import { createRequire } from 'node:module';
import { mergeCandidates, mergeConfirmText } from '../src/lib/mergeMember.js';
const require = createRequire(import.meta.url);
const M = require('../functions/mergeMember.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`);

const OFF = 'local:lz3k9xab12';
const UID = 'Uabc123';

console.log('[아이디 바꾸기 — 어디에 있든]');
{
  const meeting = {
    date: '2026-09-01',
    rsvp: { [OFF]: 'yes', u2: 'no' },
    rsvpBy: { [OFF]: OFF },
    matches: [{ id: 'r1c1', A: [OFF, 'u2'], B: ['u3', 'u4'] }],
    lineup: { r1c1: { A: [OFF, 'u2'], B: ['u3', 'u4'] } },
    finals: { r1c1: { A: 6, B: 3, by: OFF } },
    note: `${OFF}|u2`,
  };
  const r = M.renameDeep(meeting, OFF, UID);
  eq(r.changed, true, '바뀐 게 있다고 알린다');
  eq(r.value.rsvp, { u2: 'no', [UID]: 'yes' }, '참석 칸의 이름(키)');
  eq(r.value.rsvpBy, { [UID]: UID }, '누가 눌렀나 — 키와 값 둘 다');
  eq(r.value.matches[0].A, [UID, 'u2'], '대진 선수 목록(배열)');
  eq(r.value.lineup.r1c1.A, [UID, 'u2'], '경기별 명단');
  eq(r.value.finals.r1c1.by, UID, '점수 확정한 사람');
  eq(r.value.note, `${UID}|u2`, '문자열 안에 섞여 있어도(짝 키)');
  eq(meeting.rsvp[OFF], 'yes', '원본은 건드리지 않는다');
  eq(r.value.date, '2026-09-01', '상관없는 칸은 그대로');
}
{
  const r = M.renameDeep({ a: 'local:lz3k9xab123', b: ['local:lz3k9xab12x'], c: 'xlocal:lz3k9xab12' }, OFF, UID);
  eq(r.changed, false, '아이디 뒤에 글자가 더 붙은 다른 아이디는 안 바꾼다');
  eq(r.value.a, 'local:lz3k9xab123', '앞부분만 같은 아이디 보존');
}
{
  const r = M.renameDeep({ rsvp: { [OFF]: 'no', [UID]: 'yes' } }, OFF, UID);
  eq(r.value.rsvp, { [UID]: 'yes' }, '둘 다 누른 칸은 앱 계정 쪽(본인이 누른 것)을 남긴다');
  const r2 = M.renameDeep({ fees: { [OFF]: { paid: 30000, month: '09' }, [UID]: { paid: 0 } } }, OFF, UID);
  eq(r2.value.fees[UID], { paid: 0, month: '09' }, '겹치는 칸이 묶음이면 합치되 앱 계정 값 우선');
}
{
  class Ts { constructor(s) { this.seconds = s; } }
  const t = new Ts(5);
  const r = M.renameDeep({ at: t, who: OFF }, OFF, UID);
  ok(r.value.at === t, '날짜 같은 특수 값은 그대로(같은 객체)');
  eq(M.renameDeep({ a: 1, b: [1, 2], c: null }, OFF, UID).changed, false, '없으면 바뀐 것 없음');
}

console.log('[회원 문서 합치기]');
{
  const online = { name: '김민수', role: '회원', ntrpSelf: 3.0, pushToken: 'x', ntrpVotes: { u9: 3.5 } };
  const offline = { name: '김민수(오프)', role: '총무', ntrpCertified: 4.0, startedAt: '2015-03-01', grade: 'A', pushToken: 'y', ntrpVotes: { u8: 4.0, u9: 2.0 }, status: '휴면' };
  const p = M.memberPatch(online, offline, OFF);
  eq(p.ntrpCertified, 4.0, '운영진 인증 NTRP 옮김');
  eq(p.startedAt, '2015-03-01', '구력 옮김');
  eq(p.grade, 'A', '조 옮김');
  eq(p.name, undefined, '이름은 앱 계정 것 유지');
  eq(p.role, undefined, '권한은 옮기지 않는다');
  eq(p.status, undefined, '상태는 옮기지 않는다');
  eq(p.pushToken, undefined, '알림 토큰은 옮기지 않는다');
  eq(p.ntrpVotes, { u9: 3.5, u8: 4.0 }, '받은 투표는 합치되 겹치면 앱 계정 쪽');
  eq(p.mergedFrom, [OFF], '어디서 합쳐졌는지 남김');
  eq(M.memberPatch({ mergedFrom: [OFF] }, {}, OFF).mergedFrom, [OFF], '같은 기록 두 번 안 남김');
}

console.log('[합치기 요청 검사]');
eq(M.checkMerge({ offlineId: OFF, uid: UID, offline: {}, online: {} }).ok, true, '정상');
eq(M.checkMerge({ offlineId: 'u5', uid: UID, offline: {}, online: {} }).code, 'offline', '오프라인 아이디가 아님');
eq(M.checkMerge({ offlineId: OFF, uid: 'local:x', offline: {}, online: {} }).code, 'uid', '오프라인끼리는 안 합침');
eq(M.checkMerge({ offlineId: OFF, uid: 'a/b', offline: {}, online: {} }).code, 'uid', '경로 글자 거부');
eq(M.checkMerge({ offlineId: OFF, uid: UID, offline: null, online: {} }).code, 'gone', '이미 합쳐짐');
eq(M.checkMerge({ offlineId: OFF, uid: UID, offline: {}, online: null }).code, 'online', '앱 회원이 클럽에 없음');
eq(M.checkMerge({ offlineId: OFF, uid: UID, offline: {}, online: { deleted: true } }).code, 'deleted', '탈퇴 회원');

console.log('[알림 막기 표시]');
eq(M.isMergeWrite({}, { mergeOp: { at: '1' } }), true, '합치기로 다시 쓴 모임');
eq(M.isMergeWrite({ mergeOp: { at: '1' } }, { mergeOp: { at: '1' } }), false, '예전 표시가 남아 있을 뿐이면 보통 변경');
eq(M.isMergeWrite({}, {}), false, '보통 변경');
ok(M.CLUB_COLLECTIONS.includes('meetings') && M.CLUB_COLLECTIONS.includes('memberFees') && M.CLUB_COLLECTIONS.includes('fees'), '모임·회비 모음을 훑는다');

console.log('[앱 — 같은 사람 권하기]');
{
  const members = [
    { id: 'local:a1', name: '김민수' },
    { id: 'u1', name: '김 민수' },
    { id: 'local:a2', name: '이영희' },
    { id: 'u2', name: '이영희' }, { id: 'u3', name: '이영희' },   // 동명이인
    { id: 'local:a3', name: '박철수' },
    { id: 'u4', name: '박철수', deleted: true },                    // 탈퇴
  ];
  const c = mergeCandidates(members);
  eq(c.map((x) => `${x.offline.id}>${x.online.id}`), ['local:a1>u1'], '이름이 같은 짝 하나만(동명이인·탈퇴 제외, 띄어쓰기 무시)');
  ok(mergeConfirmText({ name: '김민수' }, { name: '김 민수' }).includes('되돌릴 수 없습니다'), '확인 문구에 되돌릴 수 없음을 적는다');
}

console.log(`\n오프라인 회원 합치기 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
