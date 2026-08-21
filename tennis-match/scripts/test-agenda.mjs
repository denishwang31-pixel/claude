/* 통합 일정 테스트 — 모임 · 대회 · 게스트 모집을 한 화면에

   여기서 지키려는 것
     · 대회를 놓치지 않을 것 (코트장을 골랐다고 대회가 사라지면 안 된다)
     · 현황이 보일 것 (몇 자리 남았는지 모르면 신청을 못 한다)
     · 달력 칸이 요일과 어긋나지 않을 것
     · 준비 중인 대회가 회원에게 새어 나가지 않을 것 */
import {
  KIND, KINDS, T_STATE, T_STATE_LABEL,
  signupCount, tournamentState, tournamentStatusLine, canApply,
  buildAgenda, filterAgenda, countByKind,
  monthMeta, shiftMonth, monthLabel, calendarGrid, dateHead, ddayOf, dowName,
} from '../src/lib/agenda.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m}\n      받은 값: ${JSON.stringify(a)}\n      기대값 : ${JSON.stringify(b)}`);

const TODAY = '2026-09-10';

const venueName = (id) => ({ v1: '염곡', v2: '수도공고' }[id] || '');

const MEETINGS = [
  { id: 'm1', date: '2026-09-12', time: '10:00', venueId: 'v1', courts: 3, rounds: 4, rsvp: { me: 'yes' } },
  { id: 'm2', date: '2026-09-13', time: '07:00', venueId: 'v2', courts: 2, rounds: 3, rsvp: {} },
  { id: 'm3', date: '2026-09-13', time: '10:00', venueId: 'v1', courts: 3, rounds: 4, canceled: true, rsvp: {} },
];

console.log('\n[대회 현황 — 신청할 수 있는 상태인가]');
{
  const base = { id: 't1', name: '가을 대회', date: '2026-09-20' };

  eq(tournamentState({ ...base }, TODAY), T_STATE.DRAFT,
    '모집을 안 열었으면 준비 중');
  eq(tournamentState({ ...base, signup: { open: true, cap: 16 } }, TODAY), T_STATE.OPEN,
    '열었고 자리가 있으면 모집 중');
  eq(tournamentState({
    ...base, signup: { open: true, cap: 2 }, applicants: { a: {}, b: {} },
  }, TODAY), T_STATE.FULL, '정원이 차면 마감');
  eq(tournamentState({
    ...base, signup: { open: true, cap: 16, deadline: '2026-09-05' },
  }, TODAY), T_STATE.CLOSED, '마감일이 지나면 접수 마감');
  eq(tournamentState({ ...base, date: TODAY, signup: { open: true, cap: 16 } }, TODAY),
    T_STATE.LIVE, '오늘이면 진행 — 정원이 남아 있어도 오늘이 이긴다');
  eq(tournamentState({ ...base, date: '2026-09-01' }, TODAY), T_STATE.DONE,
    '날짜가 지났으면 끝난 것으로 본다 — 운영진이 안 닫아도 목록이 깨끗해진다');
  eq(tournamentState({ ...base, status: 'finished' }, TODAY), T_STATE.DONE,
    '명시적으로 끝냈으면 끝');
  eq(tournamentState({
    ...base, status: 'finished', signup: { open: true, cap: 99 },
  }, TODAY), T_STATE.DONE, '끝난 대회는 모집 조건을 따지지 않는다');
  eq(tournamentState(null, TODAY), T_STATE.DRAFT, '없는 대회도 터지지 않는다');

  /* 마감일을 안 적었으면 대회 당일까지 받는다 */
  eq(tournamentState({ ...base, signup: { open: true } }, TODAY), T_STATE.OPEN,
    '마감일을 안 적으면 대회 날짜 전까지 받는다');
  eq(tournamentState({ ...base, date: '2026-09-20', signup: { open: true } }, '2026-09-19'),
    T_STATE.OPEN, '전날까지는 열려 있다');
}

console.log('\n[신청자 수 세기]');
{
  eq(signupCount({ applicants: { a: {}, b: {} } }), 2, '신청 맵을 센다');
  eq(signupCount({ roster: ['a', 'b', 'c'] }), 3, '예전 대회는 명단을 센다');
  eq(signupCount({ applicants: {}, roster: ['a'] }), 0,
    '신청 맵이 있으면 그것이 정답 — 빈 맵은 "아직 아무도"이지 "명단을 보라"가 아니다');
  eq(signupCount(null), 0, '없으면 0');
}

console.log('\n[현황 한 줄 — 몇 자리 남았는지가 핵심]');
{
  const t = { signup: { open: true, cap: 16 }, applicants: { a: {}, b: {} }, date: '2026-09-20' };
  ok(tournamentStatusLine(t, TODAY).includes('14자리'), '남은 자리를 숫자로 말한다');
  ok(tournamentStatusLine(t, TODAY).includes('2/16'), '현재/정원도 함께');
  ok(tournamentStatusLine({ signup: { open: true }, date: '2026-09-20' }, TODAY).includes('접수 중'),
    '정원을 안 정했으면 접수 중으로만');
  ok(tournamentStatusLine({ date: '2026-09-20' }, TODAY).includes('모집을 시작하지'),
    '준비 중인 대회는 그렇게 말한다');
}

console.log('\n[신청할 수 있는가 — 못 하면 이유를 말한다]');
{
  const open = { signup: { open: true, cap: 16 }, date: '2026-09-20', applicants: {} };
  eq(canApply(open, 'me', TODAY).ok, true, '모집 중이면 신청 가능');
  eq(canApply(open, '', TODAY).ok, false, '로그인 안 했으면 불가');

  const mine = { ...open, applicants: { me: { at: 1 } } };
  eq(canApply(mine, 'me', TODAY).ok, false, '이미 신청했으면 또 못 한다');
  eq(canApply(mine, 'me', TODAY).applied, true, '이미 신청했음을 화면이 알 수 있게');

  const full = { signup: { open: true, cap: 1 }, date: '2026-09-20', applicants: { x: {} } };
  ok(canApply(full, 'me', TODAY).reason.includes('정원'), '정원이 찼다고 말해 준다');

  const closed = { signup: { open: true, cap: 9, deadline: '2026-09-01' }, date: '2026-09-20' };
  ok(canApply(closed, 'me', TODAY).reason.includes('마감'), '마감되었다고 말해 준다');
  ok(canApply({ date: '2026-09-20' }, 'me', TODAY).reason.includes('모집 전'),
    '아직 안 열었다고 말해 준다');
}

console.log('\n[세 가지를 한 줄로 세운다]');
{
  const items = buildAgenda({
    meetings: MEETINGS,
    tournaments: [
      { id: 't1', name: '가을 대회', date: '2026-09-20', signup: { open: true, cap: 16 } },
      { id: 't2', name: '준비 중', date: '2026-10-01' },
    ],
    guestPosts: [
      { id: 'g1', date: '2026-09-14', clubId: 'other', clubName: '이웃클럽', slots: 4, confirmedCount: 1, region: '서초' },
    ],
  }, { today: TODAY, me: 'me', clubId: 'ours', venueName });

  eq(items.length, 5, '모임 3 + 모집 중인 대회 1 + 게스트 1 — 준비 중인 대회만 빠진다');
  ok(!items.some((i) => i.id === 't2'), '준비 중인 대회는 회원에게 안 보인다');
  eq(items.map((i) => i.date),
    ['2026-09-12', '2026-09-13', '2026-09-13', '2026-09-14', '2026-09-20'],
    '날짜순으로 선다');
  eq(items[1].time, '07:00', '같은 날은 시간순 — 07시가 10시보다 먼저');

  const t = items.find((i) => i.kind === KIND.TOURNAMENT);
  ok(t.sub.includes('16자리'), '대회 카드는 현황을 달고 다닌다');
  eq(t.status, T_STATE_LABEL[T_STATE.OPEN], '상태 이름표도 붙는다');

  const g = items.find((i) => i.kind === KIND.GUEST);
  eq(g.sub, '3자리 남음 · 서초', '게스트는 남은 자리와 지역');
  eq(g.ours, false, '남의 클럽 모집글임을 구분한다');

  /* ⚠️ 확정 인원은 하위 컬렉션에 있어서 목록에서는 모를 때가 있다.
     모르는 것을 0으로 세면 "4자리 남음"이라 적힌 곳에 가서 자리가 없다.
     그래서 셀 수 있을 때만 남은 자리를 말한다. */
  const unknown = buildAgenda({
    guestPosts: [{ id: 'g2', date: '2026-09-15', slots: 4, region: '강남' }],
  }, { today: TODAY })[0];
  eq(unknown.sub, '4명 모집 · 강남', '확정 인원을 모르면 모집 인원만 말한다');
  eq(unknown.status, '모집중', '모집글이 살아 있으면 모집 중으로 본다');

  const doneAll = buildAgenda({
    guestPosts: [{ id: 'g3', date: '2026-09-15', slots: 4, confirmedCount: 4 }],
  }, { today: TODAY })[0];
  eq(doneAll.status, '마감', '다 찼으면 마감');

  const mine = items.find((i) => i.id === 'm1');
  eq(mine.mine, true, '내가 참석 찍은 모임');
  eq(mine.myRsvp, 'yes', '무엇으로 찍었는지도');
  eq(mine.title, '염곡', '코트장 이름으로 제목을 만든다');

  const canceled = items.find((i) => i.id === 'm3');
  eq(canceled.status, '취소', '취소된 모임은 목록에서 지우지 않고 취소로 표시한다');

  /* 운영진에게는 준비 중인 대회도 보인다 — 안 보이면 자기가 만든 대회를
     자기가 못 찾는다 */
  const asAdmin = buildAgenda({
    tournaments: [{ id: 't2', name: '준비 중', date: '2026-10-01' }],
  }, { today: TODAY, me: 'me', isAdmin: true, venueName });
  eq(asAdmin.length, 1, '운영진에게는 준비 중인 대회도 보인다');
}

console.log('\n[거르기 — 코트장을 골라도 대회는 남는다]');
{
  const items = buildAgenda({
    meetings: MEETINGS,
    tournaments: [{ id: 't1', name: '대회', date: '2026-09-20', signup: { open: true } }],
    guestPosts: [{ id: 'g1', date: '2026-09-14', slots: 4 }],
  }, { today: TODAY, me: 'me', venueName });

  const v1 = filterAgenda(items, { venueId: 'v1' });
  eq(v1.filter((i) => i.kind === KIND.MEETING).map((i) => i.id), ['m1', 'm3'],
    '염곡 모임만 남는다');
  ok(v1.some((i) => i.kind === KIND.TOURNAMENT),
    '⚠️ 대회는 코트장을 골라도 남는다 — 사라지면 대회를 놓친다');
  ok(v1.some((i) => i.kind === KIND.GUEST), '게스트 모집도 남는다');

  eq(filterAgenda(items, { kinds: [KIND.MEETING] }).length, 3, '종류로 거르기');
  eq(filterAgenda(items, { kinds: [] }).length, items.length, '빈 배열은 전부 보기');
  eq(filterAgenda(items, { mineOnly: true }).map((i) => i.id), ['m1'], '내 것만 보기');
  eq(filterAgenda(items, { from: '2026-09-13', to: '2026-09-14' }).length, 3, '날짜 범위');

  /* 볼 수 있는 코트장 밖의 모임은 애초에 안 보인다 (리드 모드) */
  eq(filterAgenda(items, { scopeIds: ['v1'] }).filter((i) => i.kind === KIND.MEETING).length, 2,
    '내 범위 밖 코트장 모임은 빠진다');

  eq(countByKind(items), { meeting: 3, tournament: 1, guest: 1 }, '종류별 개수');
}

console.log('\n[달력 — 칸이 요일과 어긋나면 안 된다]');
{
  /* 2026-09-01 은 화요일. 앞에 빈칸 두 개(일·월)가 와야 한다. */
  const meta = monthMeta('2026-09');
  eq(meta.firstDow, 2, '9월 1일은 화요일');
  eq(meta.days, 30, '9월은 30일');
  eq(monthMeta('2026-02').days, 28, '평년 2월');
  eq(monthMeta('2028-02').days, 29, '윤년 2월');
  eq(monthMeta('').days, 0, '이상한 값은 빈 달');

  const items = buildAgenda({ meetings: MEETINGS }, { today: TODAY, me: 'me', venueName });
  const weeks = calendarGrid('2026-09', items, TODAY);

  ok(weeks.every((w) => w.length === 7), '어느 줄이나 7칸 — 여기가 어긋나면 요일이 밀린다');
  eq(weeks[0].slice(0, 2).map((c) => c.blank), [true, true], '앞 빈칸 두 개');
  eq(weeks[0][2].day, 1, '세 번째 칸이 1일');

  /* 빈칸을 null 로 두면 화면에서 걸러지다 밀린다. 그래서 객체로 채운다. */
  ok(weeks[0].every((c) => c && typeof c === 'object'), '빈칸도 객체다 — null 이면 칸이 밀린다');

  const all = weeks.flat().filter((c) => !c.blank);
  eq(all.length, 30, '날짜 칸은 정확히 30개');
  eq(all[0].dow, 2, '1일의 요일이 격자와 맞는다');
  eq(all[29].dow, 3, '30일은 수요일');

  const d13 = all.find((c) => c.date === '2026-09-13');
  eq(d13.items.length, 2, '하루에 여러 일정이 담긴다');
  eq(d13.kinds, [KIND.MEETING], '점은 종류당 하나 — 2건이어도 점 하나');

  const d10 = all.find((c) => c.date === TODAY);
  eq(d10.today, true, '오늘 표시');
  eq(all.find((c) => c.date === '2026-09-01').past, true, '지난 날 표시');
  eq(calendarGrid('', items, TODAY), [], '이상한 달은 빈 격자');
}

console.log('\n[달 넘기기·이름]');
{
  eq(shiftMonth('2026-09', 1), '2026-10', '다음 달');
  eq(shiftMonth('2026-12', 1), '2027-01', '해를 넘긴다');
  eq(shiftMonth('2026-01', -1), '2025-12', '거꾸로도');
  eq(shiftMonth('2026-01', -13), '2024-12', '한 해 넘게 거꾸로');
  eq(monthLabel('2026-09'), '2026년 9월', '달 이름');
  eq(monthLabel(''), '', '빈 값은 빈 이름');
}

console.log('\n[날짜 표기]');
{
  eq(dateHead('2026-09-13'), '9/13(일)', '날짜 머리글');
  eq(dowName('2026-09-13'), '일', '요일');
  eq(ddayOf('2026-09-10', TODAY), '오늘', '오늘');
  eq(ddayOf('2026-09-11', TODAY), '내일', '내일');
  eq(ddayOf('2026-09-20', TODAY), 'D-10', '남은 날');
  eq(ddayOf('2026-09-01', TODAY), '', '지난 날은 D-day 를 안 쓴다');
  eq(ddayOf('', TODAY), '', '날짜가 없으면 빈 값');
}

console.log('\n[아무 데이터도 없을 때]');
{
  eq(buildAgenda({}, { today: TODAY }), [], '빈 입력은 빈 목록');
  eq(buildAgenda(undefined, undefined), [], '아예 안 넘겨도 터지지 않는다');
  eq(filterAgenda(null, {}), [], 'null 도 버틴다');
  eq(countByKind(null), { meeting: 0, tournament: 0, guest: 0 }, '개수는 0으로');
  eq(KINDS.length, 3, '종류는 셋');

  /* 날짜 없는 기록은 달력에 놓을 자리가 없다 — 조용히 뺀다 */
  eq(buildAgenda({ meetings: [{ id: 'x' }], guestPosts: [{ id: 'y' }] }, { today: TODAY }).length,
    0, '날짜 없는 모임·모집글은 빼고 그린다');
  eq(buildAgenda({ tournaments: [{ id: 't', signup: { open: true } }] },
    { today: TODAY, isAdmin: true })[0].date, '', '대회는 날짜 미정이어도 목록에는 둔다');
}

console.log(`\n통합 일정 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
