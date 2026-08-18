/* ============================================================
   일정 보기 테스트 — 200명 · 코트장 여러 곳 · 일정 100건

   지켜야 할 것
     · 이번 달만 먼저 보인다. 접힌 개수를 알려 준다
     · 코트장이 지정된 모임은 그 코트 사람만 대상이다
     · 아직 코트 배정이 안 된 사람을 조용히 빼지 않는다
     · 운영진도 자기가 속하지 않은 코트에는 참석 체크를 못 한다
   ============================================================ */
import {
  monthKey, monthLabel, shiftMonth, MONTH_STEP, windowEnd, visibleMeetings,
  groupByMonth, belongsToVenue, membersForMeeting, canRsvpSelf,
  rsvpBlockReason, rsvpSummary,
} from '../src/lib/scheduleView.js';

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

/* ---------- 달 계산 ---------- */
section('달 계산');
eq('날짜에서 달 뽑기', monthKey('2026-08-18'), '2026-08');
eq('빈 값', monthKey(''), '');
eq('달 이름', monthLabel('2026-08'), '2026년 8월');
eq('망가진 값은 빈 문자열', monthLabel('없음'), '');
eq('한 달 뒤', shiftMonth('2026-08', 1), '2026-09');
eq('연말 넘김', shiftMonth('2026-12', 1), '2027-01');
eq('연초 역행', shiftMonth('2026-01', -1), '2025-12');
eq('3개월 뒤', shiftMonth('2026-11', 3), '2027-02');
eq('12개월 뒤', shiftMonth('2026-08', 12), '2027-08');
eq('더보기 단위는 3개월', MONTH_STEP, 3);
eq('이번 달만이면 다음 달 시작이 끝', windowEnd('2026-08', 1), '2026-09');
eq('4개월치면', windowEnd('2026-08', 4), '2026-12');
eq('0을 넣어도 최소 1개월', windowEnd('2026-08', 0), '2026-09');

/* ---------- 창 자르기 ---------- */
section('보여줄 범위 — 이번 달부터');
const TODAY = '2026-08-18';
/* 8월 3건, 9월 2건, 10월 2건, 11월 1건 + 지난 것 1건 */
const MEET = [
  { id: 'p1', date: '2026-08-01', venueId: 'v1' },      // 지났다
  { id: 'a1', date: '2026-08-20', venueId: 'v1' },
  { id: 'a2', date: '2026-08-25', venueId: 'v2' },
  { id: 'a3', date: '2026-08-27', venueId: 'v1' },
  { id: 'b1', date: '2026-09-03', venueId: 'v1' },
  { id: 'b2', date: '2026-09-10', venueId: 'v2' },
  { id: 'c1', date: '2026-10-05', venueId: 'v1' },
  { id: 'c2', date: '2026-10-12', venueId: 'v1' },
  { id: 'd1', date: '2026-11-02', venueId: 'v2' },
];

{
  const r = visibleMeetings(MEET, { today: TODAY, months: 1 });
  eq('이번 달 3건만', r.items.map((m) => m.id), ['a1', 'a2', 'a3']);
  eq('지난 모임은 아예 제외', r.total, 8);
  eq('접힌 건수', r.hidden, 5);
  ok(r.hasMore, '더 있다고 알려준다');
}
{
  /* 이번 달(8월) + 3개월 = 8·9·10·11월 */
  const r = visibleMeetings(MEET, { today: TODAY, months: 1 + MONTH_STEP });
  eq('더보기 한 번 = 8~11월', r.items.length, 8);
  ok(r.items.some((m) => m.id === 'd1'), '11월도 들어온다');
}
{
  /* 12월 모임을 하나 더 두면, 4개월치에는 아직 안 들어온다 */
  const withDec = [...MEET, { id: 'e1', date: '2026-12-05', venueId: 'v1' }];
  const r = visibleMeetings(withDec, { today: TODAY, months: 1 + MONTH_STEP });
  eq('12월은 아직 접혀 있다', r.items.some((m) => m.id === 'e1'), false);
  eq('접힌 건수', r.hidden, 1);
}
{
  const r = visibleMeetings(MEET, { today: TODAY, months: 12 });
  eq('넉넉히 열면 전부', r.items.length, 8);
  eq('더 없음', r.hidden, 0);
  ok(!r.hasMore, '더보기 버튼이 사라진다');
}
{
  const r = visibleMeetings(MEET, { today: TODAY, months: 12, venueId: 'v2' });
  eq('코트장 필터', r.items.map((m) => m.id), ['a2', 'b2', 'd1']);
}
{
  const r = visibleMeetings(MEET, { today: TODAY, months: 12, scopeIds: ['v1'] });
  eq('내 범위 밖 코트장 제외', r.items.every((m) => m.venueId === 'v1'), true);
}
{
  const withNull = [...MEET, { id: 'n1', date: '2026-08-22', venueId: null }];
  const r = visibleMeetings(withNull, { today: TODAY, months: 1, scopeIds: ['v1'] });
  ok(r.items.some((m) => m.id === 'n1'), '코트장 미지정 모임은 범위와 무관하게 보인다');
}
eq('날짜 없는 모임은 버린다',
  visibleMeetings([{ id: 'x' }], { today: TODAY, months: 12 }).items.length, 0);
eq('빈 입력', visibleMeetings(null, { today: TODAY }).items.length, 0);
{
  const r = visibleMeetings(MEET, { today: TODAY, months: 12 });
  const dates = r.items.map((m) => m.date);
  eq('날짜 오름차순', dates, [...dates].sort());
}

section('월별 묶기');
{
  const r = visibleMeetings(MEET, { today: TODAY, months: 12 });
  const g = groupByMonth(r.items);
  eq('4개 달', g.map((x) => x.key), ['2026-08', '2026-09', '2026-10', '2026-11']);
  eq('8월에 3건', g[0].items.length, 3);
  eq('달 이름이 붙는다', g[0].label, '2026년 8월');
  eq('총합 보존', g.reduce((s, x) => s + x.items.length, 0), r.items.length);
}
eq('빈 목록', groupByMonth([]), []);

/* ---------- 코트장으로 사람 거르기 ---------- */
section('코트장별 대상');
const MEMBERS = [
  { id: 'm1', name: '염곡만', venueIds: ['v1'], status: '활동' },
  { id: 'm2', name: '수도만', venueIds: ['v2'], status: '활동' },
  { id: 'm3', name: '둘다', venueIds: ['v1', 'v2'], status: '활동' },
  { id: 'm4', name: '미배정', status: '활동' },
  { id: 'm5', name: '빈배열', venueIds: [], status: '활동' },
  { id: 'm6', name: '휴면', venueIds: ['v1'], status: '휴면' },
];

ok(belongsToVenue(MEMBERS[0], 'v1'), '자기 코트장');
ok(!belongsToVenue(MEMBERS[0], 'v2'), '남의 코트장');
ok(belongsToVenue(MEMBERS[2], 'v1') && belongsToVenue(MEMBERS[2], 'v2'), '두 곳 소속');
ok(belongsToVenue(MEMBERS[3], 'v1'), '미배정은 빼지 않는다');
ok(belongsToVenue(MEMBERS[4], 'v1'), '빈 배열도 빼지 않는다');
ok(belongsToVenue(MEMBERS[0], null), '코트장 미지정 모임은 전원 대상');

eq('v1 모임 대상',
  membersForMeeting(MEMBERS, { venueId: 'v1' }).map((m) => m.id),
  ['m1', 'm3', 'm4', 'm5']);
eq('v2 모임 대상',
  membersForMeeting(MEMBERS, { venueId: 'v2' }).map((m) => m.id),
  ['m2', 'm3', 'm4', 'm5']);
eq('코트장 미지정 모임은 활동 회원 전원',
  membersForMeeting(MEMBERS, {}).map((m) => m.id),
  ['m1', 'm2', 'm3', 'm4', 'm5']);
ok(!membersForMeeting(MEMBERS, { venueId: 'v1' }).some((m) => m.id === 'm6'),
  '휴면 회원은 어느 경우에도 대상이 아니다');
eq('빈 입력', membersForMeeting(null, { venueId: 'v1' }), []);

/* ---------- 본인 참석 체크 권한 ---------- */
section('참석 체크는 자기 코트에서만');
ok(canRsvpSelf(MEMBERS[0], { venueId: 'v1' }), '자기 코트 모임은 누른다');
ok(!canRsvpSelf(MEMBERS[0], { venueId: 'v2' }), '남의 코트 모임은 못 누른다');
ok(canRsvpSelf(MEMBERS[3], { venueId: 'v1' }), '미배정은 아직 막지 않는다');
ok(canRsvpSelf(MEMBERS[0], { venueId: null }), '코트장 미지정 모임은 누구나');
ok(!canRsvpSelf(MEMBERS[0], { venueId: 'v1', canceled: true }), '취소된 모임은 못 누른다');
ok(!canRsvpSelf(null, { venueId: 'v1' }), '내 정보가 없으면 못 누른다');

/* 회장이라도 안 나가는 코트에는 자기 참석을 못 넣는다 —
   넣으면 그 코트 대진에 잡히고, 당일에 사람이 안 나타난다 */
const PRESIDENT = { id: 'boss', name: '회장', role: '회장', venueIds: ['v1'], status: '활동' };
ok(canRsvpSelf(PRESIDENT, { venueId: 'v1' }), '회장도 자기 코트는 누른다');
ok(!canRsvpSelf(PRESIDENT, { venueId: 'v2' }), '회장도 남의 코트는 못 누른다');
ok(rsvpBlockReason(PRESIDENT, { venueId: 'v2' }, '수도공고').includes('수도공고'),
  '왜 못 누르는지 코트장 이름과 함께 알려준다');
eq('누를 수 있으면 설명 없음', rsvpBlockReason(PRESIDENT, { venueId: 'v1' }, '염곡'), '');

/* ---------- 요약 ---------- */
section('현황 요약 — 명단을 안 그려도 상태를 안다');
{
  const mt = {
    venueId: 'v1',
    rsvp: { m1: 'yes', m3: 'no', m4: 'maybe' },
    guests: [{ name: '게스트1' }],
  };
  const s = rsvpSummary(MEMBERS, mt);
  eq('대상 인원', s.target, 4);          // m1 m3 m4 m5
  eq('참석', s.yes, 1);
  eq('불참', s.no, 1);
  eq('미정', s.maybe, 1);
  eq('미응답', s.none, 1);
  eq('응답 수', s.answered, 3);
  eq('게스트', s.guests, 1);
  eq('실제 인원 = 참석 + 게스트', s.going, 2);
}
{
  const s = rsvpSummary(MEMBERS, { venueId: 'v2' });
  eq('아무도 안 답하면 전원 미응답', [s.target, s.none, s.answered], [4, 4, 0]);
}
{
  /* 다른 코트 사람의 응답이 섞여 있어도 이 모임 집계에는 안 들어간다 */
  const s = rsvpSummary(MEMBERS, { venueId: 'v1', rsvp: { m2: 'yes' } });
  eq('남의 코트 응답은 안 센다', s.yes, 0);
  eq('대상은 그대로', s.target, 4);
}
eq('빈 입력에도 죽지 않는다', rsvpSummary(null, null).target, 0);

/* ---------- 규모 ---------- */
section('규모 — 200명 · 100건');
{
  const many = Array.from({ length: 100 }, (_, i) => ({
    id: `x${i}`,
    date: `2026-${String(8 + Math.floor(i / 20)).padStart(2, '0')}-${String((i % 20) + 1).padStart(2, '0')}`,
    venueId: i % 2 ? 'v1' : 'v2',
  }));
  const r = visibleMeetings(many, { today: '2026-08-01', months: 1 });
  ok(r.items.length <= 20, '이번 달만 열면 20건 이하', `${r.items.length}건`);
  ok(r.hidden >= 60, '나머지는 접혀 있다', `접힘 ${r.hidden}건`);

  const members200 = Array.from({ length: 200 }, (_, i) => ({
    id: `p${i}`, name: `회원${i}`, venueIds: [i % 2 ? 'v1' : 'v2'], status: '활동',
  }));
  const s = rsvpSummary(members200, r.items[0]);
  ok(s.target === 100, '코트장으로 절반만 대상', `${s.target}명`);
}

console.log(`\n일정 보기 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
