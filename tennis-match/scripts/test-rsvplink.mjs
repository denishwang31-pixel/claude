/* 카톡 참석 링크 — 앱 없는 오프라인 회원이 링크로 참석/불참을 누른다.

   이 링크는 단톡방에 돈다. 그래서 검사가 지켜야 할 것은
     1. 열쇠가 틀리면 아무것도 보여 주지도, 받지도 않는다
     2. 링크로는 **오프라인 회원의 답만** 바꾼다 — 앱 회원은 못 건드린다
     3. 밖으로 나가는 것은 이름과 참석 여부뿐이다(전화번호·등급 금지)
     4. 다른 코트장 모임·지난 모임·취소된 모임에는 답할 수 없다       */
import { createRequire } from 'node:module';
import {
  TOKEN_LEN, validToken, makeToken, linkUrl, shareMessage,
  offlineTargets, answeredViaLink, offlineUnanswered,
} from '../src/lib/rsvpLink.js';
import { pushWorthyChanges } from '../src/lib/rsvpAsk.js';

const require = createRequire(import.meta.url);
const srv = require('../functions/rsvpLink.js');

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

const TOKEN = 'Abcdefghijklmnopqrstuvwxyz012345';   // 32자
const CLUB = { name: '써티포티', rsvpLink: { token: TOKEN } };
const MEMBERS = [
  { id: 'local:a', name: '김오프', gender: 'M', status: '활동', phone: '010-1111-2222', grade: 'A' },
  { id: 'local:b', name: '박오프', gender: 'F', status: '활동', venueIds: ['v1'] },
  { id: 'local:c', name: '최휴면', gender: 'M', status: '휴면' },
  { id: 'uidApp', name: '앱회원', gender: 'M', status: '활동' },
];
const TODAY = '2026-09-24';
const MT = (id, date, extra = {}) => ({ id, date, time: '10:00', rsvp: {}, ...extra });
const MEETINGS = [
  MT('m1', '2026-09-24', { rsvp: { 'local:a': 'yes', uidApp: 'no' } }),
  MT('m2', '2026-09-25', { venueId: 'v2' }),
  MT('m0', '2026-09-20'),                          // 지난 모임
  MT('mx', '2026-09-26', { canceled: true }),       // 취소
  MT('m3', '2026-10-01'), MT('m4', '2026-10-08'), MT('m5', '2026-10-15'),
];

/* ---------- 1. 열쇠 ---------- */
section('열쇠가 맞아야 한다');
ok(srv.tokenOk(CLUB, TOKEN), '맞는 열쇠');
ok(!srv.tokenOk(CLUB, TOKEN.replace('A', 'B')), '한 글자만 달라도 거절');
ok(!srv.tokenOk({ name: 'x' }, TOKEN), '클럽에 열쇠가 없으면(아직 안 만듦) 거절');
ok(!srv.tokenOk(null, TOKEN), '클럽이 없으면 거절');
ok(!srv.tokenOk({ rsvpLink: { token: 'short' } }, 'short'), '짧은 열쇠는 둘이 같아도 거절');
ok(!srv.tokenOk(CLUB, undefined), '열쇠 없이 온 요청 거절');
ok(!srv.tokenOk({ rsvpLink: { token: '' } }, ''), '빈 열쇠끼리 같아도 거절');

/* ---------- 3. 밖으로 나가는 것 ---------- */
section('링크 페이지가 받는 것 — 필요한 것만');
{
  const bd = srv.boardOf({ club: CLUB, members: MEMBERS, meetings: MEETINGS, today: TODAY });
  eq('클럽 이름', bd.club, { name: '써티포티' });
  eq('오프라인·활동 회원만 — 앱 회원·휴면 회원은 없다',
    bd.people.map((p) => p.id).sort(), ['local:a', 'local:b']);
  /* ⚠️ 이 응답은 링크만 있으면 누구나 받는다 */
  ok(bd.people.every((p) => Object.keys(p).sort().join() === 'gender,id,name'),
    '사람마다 이름·성별·id 만 — 전화번호·등급이 새지 않는다', JSON.stringify(bd.people));
  const all = JSON.stringify(bd);
  ok(!all.includes('010-'), '전화번호가 어디에도 없다');
  ok(!all.includes('uidApp') && !all.includes('앱회원'), '앱 회원의 이름·응답이 어디에도 없다');

  eq('지난 모임·취소 모임은 빠지고, 가까운 순 4개까지',
    bd.meetings.map((m) => m.id), ['m1', 'm2', 'm3', 'm4']);
  eq('m1 의 응답은 오프라인 회원 것만', bd.meetings[0].rsvp, { 'local:a': 'yes' });
  /* 코트장이 지정된 모임은 그 코트장 사람만(배정 안 된 사람은 포함) */
  eq('v2 모임 대상 — v1 소속 박오프는 빠진다', bd.meetings[1].who, ['local:a']);
  eq('코트장 없는 모임 대상 — 둘 다', bd.meetings[0].who.sort(), ['local:a', 'local:b']);
  eq('빈 입력에도 안 죽는다', srv.boardOf({ club: null, members: null, meetings: null, today: TODAY }),
    { club: { name: '' }, people: [], meetings: [] });
}

/* ---------- 2·4. 답 받기 ---------- */
section('답 받기');
{
  const base = { club: CLUB, token: TOKEN, members: MEMBERS, today: TODAY };
  const m1 = MEETINGS[0];
  const mem = (id) => MEMBERS.find((x) => x.id === id);

  const good = srv.checkAnswer({ ...base, member: mem('local:a'), meeting: m1, value: 'no' });
  ok(good.ok, '오프라인 회원의 답은 받는다');
  /* ⚠️ rsvpBy 는 본인 — 대진 뒤 빠지면 운영진이 알림을 받아야 한다 */
  eq('적는 것은 그 사람의 참석과 rsvpBy(본인) 두 칸뿐', good.patch,
    { 'rsvp.local:a': 'no', 'rsvpBy.local:a': 'local:a' });

  const code = (r) => (r.ok ? 'ok' : r.code);
  eq('열쇠가 틀리면 거절', code(srv.checkAnswer({ ...base, token: 'X'.repeat(32), member: mem('local:a'), meeting: m1, value: 'yes' })), 'link');
  eq('앱 회원은 링크로 못 바꾼다', code(srv.checkAnswer({ ...base, member: mem('uidApp'), meeting: m1, value: 'no' })), 'member');
  eq('없는 사람', code(srv.checkAnswer({ ...base, member: null, meeting: m1, value: 'yes' })), 'member');
  eq('휴면 회원은 대상이 아니다', code(srv.checkAnswer({ ...base, member: mem('local:c'), meeting: m1, value: 'yes' })), 'scope');
  eq('다른 코트장 모임에는 못 답한다', code(srv.checkAnswer({ ...base, member: mem('local:b'), meeting: MEETINGS[1], value: 'yes' })), 'scope');
  eq('지난 모임', code(srv.checkAnswer({ ...base, member: mem('local:a'), meeting: MEETINGS[2], value: 'yes' })), 'past');
  eq('취소된 모임', code(srv.checkAnswer({ ...base, member: mem('local:a'), meeting: MEETINGS[3], value: 'yes' })), 'meeting');
  eq('참석·불참 말고는 거절', code(srv.checkAnswer({ ...base, member: mem('local:a'), meeting: m1, value: 'maybe' })), 'value');
  eq('모임이 없으면 거절', code(srv.checkAnswer({ ...base, member: mem('local:a'), meeting: null, value: 'yes' })), 'meeting');

  /* 되돌리기 — 이름을 잘못 골라 남의 이름으로 누른 사람이 치울 때 */
  const clr = srv.checkAnswer({ ...base, member: mem('local:a'), meeting: m1, value: 'clear' });
  ok(clr.ok, '미응답으로 되돌리기는 받는다');
  eq('되돌리기는 두 칸을 지운다 — 아무것도 새로 적지 않는다',
    [clr.patch, clr.remove], [{}, ['rsvp.local:a', 'rsvpBy.local:a']]);
  eq('참석으로 적을 땐 지우는 칸이 없다', good.remove, []);
  eq('되돌리기도 열쇠가 맞아야 한다',
    code(srv.checkAnswer({ ...base, token: 'X'.repeat(32), member: mem('local:a'), meeting: m1, value: 'clear' })), 'link');
  eq('앱 회원의 답은 되돌리기로도 못 지운다',
    code(srv.checkAnswer({ ...base, member: mem('uidApp'), meeting: m1, value: 'clear' })), 'member');
}

section('한국 날짜 — 서버는 UTC 로 돈다');
/* UTC 9/23 16:00 = 한국 9/24 01:00. UTC 날짜를 쓰면 오늘 모임이 "지난 모임"이 된다 */
eq('한국 새벽 1시는 이미 다음 날', srv.todayKST(Date.UTC(2026, 8, 23, 16, 0)), '2026-09-24');
eq('한국 오전 8시 59분', srv.todayKST(Date.UTC(2026, 8, 23, 23, 59)), '2026-09-24');

/* ---------- 앱 쪽 ---------- */
section('열쇠 만들기 — 앱');
{
  const t = makeToken();
  eq('길이', t.length, TOKEN_LEN);
  ok(validToken(t), '서버가 받는 모양이다');
  ok(srv.validToken(t), '서버 검사도 같은 답');
  ok(makeToken() !== makeToken(), '매번 다르다');
  eq('안전한 난수를 넘기면 그걸 쓴다', makeToken(new Uint8Array(32).fill(0)), 'A'.repeat(32));
  eq('난수가 모자라면 나머지는 채운다', makeToken([0, 0]).length, TOKEN_LEN);
}

section('앱과 서버가 같은 열쇠 규칙');
['', 'short', 'A'.repeat(23), 'A'.repeat(24), 'A'.repeat(64), 'A'.repeat(65), 'abc-def'.repeat(5), TOKEN, null]
  .forEach((t) => eq(`열쇠 모양 ${String(t).slice(0, 10)}…`, srv.validToken(t), validToken(t)));

section('링크와 카톡 글');
{
  const url = linkUrl('tennis-match-52b31', 'club1', TOKEN, 'm1');
  eq('주소', url, `https://tennis-match-52b31.web.app/rsvp?c=club1&t=${TOKEN}&m=m1`);
  const msg = shareMessage({ clubName: '써티포티', meeting: { date: '2026-09-24', time: '10:00', endTime: '13:00', place: '올림픽공원' }, url });
  const lines = msg.split('\n');
  /* ⚠️ 카톡 알림 미리보기엔 첫 줄만 보인다 */
  ok(/참석 여부/.test(lines[0]), '첫 줄에 무엇을 해 달라는지', lines[0]);
  ok(lines.includes('9/24(목) 10:00~13:00 · 올림픽공원'), '언제·어디', msg);
  ok(lines[lines.length - 1] === url, '마지막 줄이 링크 — 카톡이 미리보기를 붙인다');
  ok(/이름을 고르고/.test(msg), '이름을 고르라는 말을 미리 한다');
  ok(!shareMessage({ meeting: {}, url }).includes('undefined'), '빈 값에도 undefined 가 안 찍힌다');
}

section('링크로 온 답 구별');
{
  const mt = {
    rsvp: { 'local:a': 'yes', 'local:b': 'no', uidApp: 'yes', 'local:d': 'yes' },
    rsvpBy: { 'local:a': 'local:a', 'local:b': 'boss', uidApp: 'uidApp' },
  };
  ok(answeredViaLink(mt, 'local:a'), '오프라인 회원이 본인 이름으로 = 링크');
  ok(!answeredViaLink(mt, 'local:b'), '운영진이 대신 누른 것은 링크가 아니다');
  ok(!answeredViaLink(mt, 'uidApp'), '앱 회원이 자기가 누른 것은 링크가 아니다');
  ok(!answeredViaLink(mt, 'local:d'), '누가 눌렀는지 모르면 링크로 치지 않는다');
  ok(!answeredViaLink({}, 'local:a'), '빈 모임');

  const members = MEMBERS;
  eq('오프라인 대상', offlineTargets(members, { venueId: null }).map((m) => m.id).sort(), ['local:a', 'local:b']);
  eq('미응답 수', offlineUnanswered(members, { rsvp: { 'local:a': 'yes' } }), 1);
}

/* 링크 답이 운영진 알림 규칙과 맞물리는가 — 대진을 짠 뒤 링크로 빠지면
   운영진이 알아야 한다. rsvpBy 를 본인으로 적는 이유다. */
section('대진 뒤 링크로 빠지면 운영진이 안다');
{
  const before = { matches: [{ id: 'x' }], rsvp: { 'local:a': 'yes' }, rsvpBy: { 'local:a': 'boss' } };
  const patch = srv.checkAnswer({
    club: CLUB, token: TOKEN, members: MEMBERS, today: TODAY,
    member: MEMBERS[0], meeting: MEETINGS[0], value: 'no',
  }).patch;
  const after = {
    ...before,
    rsvp: { ...before.rsvp, 'local:a': patch['rsvp.local:a'] },
    rsvpBy: { ...before.rsvpBy, 'local:a': patch['rsvpBy.local:a'] },
  };
  eq('알림 대상이 된다', pushWorthyChanges(before, after).map((c) => c.id), ['local:a']);
}

console.log(`\n카톡 참석 링크 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
