/* 출석부 — 투표로 미리 채우고, 고친 사람만 기록, 확정하면 목록에서 빠진다 */
import {
  effectiveAttendance, changedFromVote, attendanceTargets, confirmMap, attendanceCount,
  openAttendance, confirmedAttendance,
} from '../src/lib/attendance.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)} / 실제 ${JSON.stringify(a)}`);

const M = [
  { id: 'a', name: '가', venueIds: ['v1'], status: '활동' },
  { id: 'b', name: '나', venueIds: ['v1'], status: '활동' },
  { id: 'c', name: '다', venueIds: ['v2'], status: '활동' },
  { id: 'd', name: '라', venueIds: [], status: '활동' },
  { id: 'e', name: '마', venueIds: ['v1'], status: '휴면' },
];
const MT = { id: 'm1', date: '2026-09-28', venueId: 'v1', rsvp: { a: 'yes', b: 'no', c: 'yes' }, attendance: {} };

console.log('[투표로 미리 채우기]');
eq(effectiveAttendance(MT, 'a'), { present: true, source: 'yes' }, '참석 투표 → 출석');
eq(effectiveAttendance(MT, 'b'), { present: false, source: 'no' }, '불참 투표 → 결석');
eq(effectiveAttendance(MT, 'd'), { present: false, source: 'none' }, '미응답 → 결석(고칠 수 있다)');
eq(effectiveAttendance({ ...MT, attendance: { a: false } }, 'a'), { present: false, source: 'record' }, '운영진이 고친 값이 먼저');
eq(effectiveAttendance({ ...MT, rsvp: { a: 'maybe' } }, 'a').present, false, '예전 미정은 미응답처럼');

console.log('[고친 사람 표시]');
ok(changedFromVote({ ...MT, attendance: { a: false } }, 'a'), '참석 투표했는데 결석으로 고침');
ok(changedFromVote({ ...MT, attendance: { d: true } }, 'd'), '미응답인데 출석으로 고침');
ok(!changedFromVote({ ...MT, attendance: { a: true } }, 'a'), '투표와 같으면 고친 게 아님');
ok(!changedFromVote(MT, 'a'), '기록이 없으면 고친 게 아님');

console.log('[출석부에 오를 사람 — 그 코트장 회원]');
eq(attendanceTargets(M, MT).map((m) => m.id), ['a', 'b', 'd', 'c'].sort((x, y) => M.find((m) => m.id === x).name.localeCompare(M.find((m) => m.id === y).name, 'ko')), '코트장 회원 + 미배정 + 코트장 밖이지만 참석 투표한 사람');
ok(!attendanceTargets(M, { ...MT, rsvp: {} }).some((m) => m.id === 'c'), '다른 코트장 회원은 안 오른다(섞이지 않게)');
ok(!attendanceTargets(M, MT).some((m) => m.id === 'e'), '휴면 회원은 빠진다');
eq(attendanceTargets(M, { ...MT, venueId: null }).length, 4, '코트장 미지정 모임은 활동 회원 전원');

console.log('[확정]');
eq(confirmMap(M, { ...MT, attendance: { d: true } }), { a: true, b: false, c: true, d: true }, '확정하면 오른 사람 전원의 값을 적는다');
eq(attendanceCount(M, MT), { yes: 2, no: 2 }, '출석 · 결석 수');

console.log('[열린 출석부 · 확정한 출석부]');
const list = [
  { id: 'p1', date: '2026-09-20', time: '08:00' },
  { id: 'p2', date: '2026-09-27', time: '08:00', attendanceConfirmed: true },
  { id: 'p3', date: '2026-09-28', time: '06:00' },
  { id: 'p4', date: '2026-09-28', time: '08:00', canceled: true },
  { id: 'f1', date: '2026-10-04', time: '08:00' },
];
eq(openAttendance(list, '2026-09-28').map((m) => m.id), ['p3', 'p1'], '오늘까지 · 확정·취소 빼고 · 최근 것부터');
eq(confirmedAttendance(list).map((m) => m.id), ['p2'], '확정한 출석부는 따로(다시 열기용)');

console.log(`\n출석부 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
