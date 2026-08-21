/* 사람이 늘면 조용히 터지는 것들 (PRE-LAUNCH C)

   여기 있는 것들의 공통점: 고장 나도 오류가 안 뜬다.
     · 모임 구독을 자르면 재작년 랭킹이 조용히 0이 된다
     · 지난 초대가 안 접히면 목록이 쓰레기통이 된다
     · 상대 클럽 선수 이름이 영영 남는다
     · 코트 링크가 죽어도 눌러 보기 전에는 모른다

   그래서 "잘라도 거짓말은 안 하는가"를 검사한다. */
import {
  WINDOW_MONTHS, shiftMonths, windowStart, coveredByWindow,
  yearRange, mergeMeetings, windowNote,
} from '../src/lib/meetingWindow.js';
import {
  CM_STATUS, isStale, isArchived, splitMatches, archiveReason,
  ROSTER_KEEP_DAYS, rosterExpired, scrubRoster,
} from '../src/lib/clubMatch.js';
import { courtDataAge, courtDataNote, COURT_DATA_STALE_DAYS } from '../src/lib/courtData.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m}\n      받은 값: ${JSON.stringify(a)}\n      기대값 : ${JSON.stringify(b)}`);

const TODAY = '2026-08-21';

console.log('\n[날짜에서 개월 빼기 — 말일 보정]');
{
  eq(shiftMonths('2026-08-21', -12), '2025-08-21', '1년 전');
  eq(shiftMonths('2026-01-15', -1), '2025-12-15', '해를 넘긴다');
  /* 3월 31일에서 한 달을 빼면 2월 31일이라는 날은 없다 */
  eq(shiftMonths('2026-03-31', -1), '2026-02-28', '없는 날은 말일로 당긴다');
  eq(shiftMonths('2028-03-31', -1), '2028-02-29', '윤년 2월은 29일까지');
  eq(shiftMonths('2026-08-31', -6), '2026-02-28', '6개월 전도 마찬가지');
  eq(shiftMonths('', -1), '', '이상한 값은 빈 값');
  eq(shiftMonths('2026-08-21', 1), '2026-09-21', '더하기도 된다');
}

console.log('\n[실시간으로 들고 있을 범위]');
{
  eq(windowStart(TODAY), '2025-08-21', `기본 ${WINDOW_MONTHS}개월`);
  eq(windowStart(TODAY, 3), '2026-05-21', '개월 수를 바꿀 수 있다');
  eq(windowStart(TODAY, 0), '2026-07-21', '0을 넣어도 최소 1개월은 든다');

  ok(coveredByWindow('2026-01-01', TODAY), '올해는 창 안이다 — 따로 안 읽는다');
  ok(!coveredByWindow('2024-01-01', TODAY), '재작년은 창 밖이다 — 따로 읽어야 한다');
  ok(!coveredByWindow('', TODAY), '날짜가 없으면 덮지 못한 것으로 본다');
  eq(yearRange('2025'), { from: '2025-01-01', to: '2025-12-31' }, '연 범위');
}

console.log('\n[창과 과거를 합칠 때 — 같은 모임을 두 번 세면 안 된다]');
{
  const live = [
    { id: 'a', date: '2026-08-01' },
    { id: 'b', date: '2026-07-01', rsvp: { x: 'yes' } },   // 실시간 값(최신)
  ];
  const loaded = [
    { id: 'b', date: '2026-07-01', rsvp: {} },             // 같은 모임의 옛 값
    { id: 'c', date: '2024-03-01' },
  ];
  const merged = mergeMeetings(live, loaded);
  eq(merged.length, 3, '겹치는 것은 하나로 — 두 번 세면 승수와 출석률이 부풀려진다');
  eq(merged.map((m) => m.id), ['c', 'b', 'a'], '날짜순으로 선다');
  eq(merged.find((m) => m.id === 'b').rsvp, { x: 'yes' },
    '겹치면 실시간 쪽이 이긴다 — 그쪽이 최신이다');

  eq(mergeMeetings(null, null), [], '빈 입력도 버틴다');
  eq(mergeMeetings([{ date: '2026-01-01' }], []), [],
    'id 없는 것은 합칠 수 없으니 뺀다');
}

console.log('\n[무엇을 보고 있는지 말해 준다]');
{
  eq(windowNote({ year: '2026', today: TODAY }), '',
    '창 안의 해는 아무 말도 안 한다 — 멀쩡할 때 잔소리하지 않는다');
  ok(windowNote({ year: '2023', today: TODAY }).includes('이전 기록'),
    '창 밖의 해는 눌러야 한다고 알려 준다');
  ok(windowNote({ year: '2023', today: TODAY, loading: true }).includes('불러오는 중'),
    '불러오는 동안 그렇다고 말한다');
  ok(windowNote({ year: '2023', today: TODAY, loaded: true }).includes('불러왔'),
    '다 불러오면 그렇다고 말한다');
  eq(windowNote({ today: TODAY }), '', '연도가 없으면 할 말도 없다');
}

console.log('\n[교류전 — 답 없는 초대를 접는다]');
{
  const base = { id: 'm1', hostClubId: 'c1', guestClubId: 'c2' };

  ok(isStale({ ...base, status: CM_STATUS.PENDING, date: '2026-01-01' }, TODAY),
    '답을 못 받은 채 날짜가 지났으면 지난 것');
  ok(!isStale({ ...base, status: CM_STATUS.PENDING, date: '2026-12-01' }, TODAY),
    '아직 안 온 경기는 살아 있다');
  ok(!isStale({ ...base, status: CM_STATUS.ACCEPTED, date: '2026-01-01' }, TODAY),
    '수락된 것은 "답 없음"이 아니다 — 이유가 다르다');
  ok(!isStale({ ...base, status: CM_STATUS.PENDING }, TODAY),
    '날짜가 없으면 지났는지 알 수 없다');

  ok(isArchived({ ...base, status: CM_STATUS.DONE, date: '2026-12-01' }, TODAY),
    '끝난 것은 날짜와 무관하게 접는다');
  ok(isArchived({ ...base, status: CM_STATUS.DECLINED, date: '2026-12-01' }, TODAY),
    '거절된 것도');
  ok(isArchived({ ...base, status: CM_STATUS.ACCEPTED, date: '2026-01-01' }, TODAY),
    '수락했는데 날짜가 지난 것도 접는다 — 결과는 나중에도 넣을 수 있다');
  ok(!isArchived({ ...base, status: CM_STATUS.ACCEPTED, date: '2026-12-01' }, TODAY),
    '다가오는 경기는 위에 남는다');
  ok(!isArchived({ ...base, status: CM_STATUS.PENDING, date: '2026-12-01' }, TODAY),
    '답을 기다리는 다가오는 경기도 위에 남는다');
}

console.log('\n[목록을 위아래로 가른다]');
{
  const list = [
    { id: 'live1', status: CM_STATUS.PENDING, date: '2026-09-01' },
    { id: 'live2', status: CM_STATUS.ACCEPTED, date: '2026-10-01' },
    { id: 'old1', status: CM_STATUS.PENDING, date: '2026-01-01' },
    { id: 'old2', status: CM_STATUS.DONE, date: '2025-06-01' },
  ];
  const { live, past } = splitMatches(list, TODAY);
  eq(live.map((m) => m.id), ['live1', 'live2'], '진행 중은 가까운 날짜부터');
  eq(past.map((m) => m.id), ['old1', 'old2'], '지난 것은 최근 것부터');
  eq(splitMatches(null, TODAY), { live: [], past: [] }, '빈 목록도 버틴다');

  /* 접어 놓고 이유를 안 적으면 사라진 것으로 보인다 */
  ok(archiveReason({ status: CM_STATUS.PENDING, date: '2026-01-01' }, TODAY).includes('답을 받지 못한'),
    '왜 접혔는지 말해 준다');
  ok(archiveReason({ status: CM_STATUS.DECLINED }, TODAY).includes('거절'), '거절');
  ok(archiveReason({ status: CM_STATUS.CANCELED }, TODAY).includes('취소'), '취소');
  ok(archiveReason({ status: CM_STATUS.DONE }, TODAY).includes('종료'), '종료');
  eq(archiveReason({ status: CM_STATUS.ACCEPTED, date: '2026-12-01' }, TODAY), '',
    '접히지 않은 것에는 이유가 없다');
}

console.log('\n[상대 클럽 선수 이름의 보관 기간]');
{
  eq(ROSTER_KEEP_DAYS, 365, '개인정보처리방침에 적은 것과 같아야 한다 — 경기 후 1년');

  ok(rosterExpired({ date: '2025-01-01' }, TODAY), '1년이 지났으면 지울 때가 되었다');
  ok(!rosterExpired({ date: '2026-06-01' }, TODAY), '아직 1년이 안 지났다');
  ok(!rosterExpired({ date: '2025-08-22' }, TODAY), '정확히 364일은 아직');
  ok(rosterExpired({ date: '2025-08-20' }, TODAY), '366일은 지났다');
  ok(!rosterExpired({}, TODAY), '날짜가 없으면 판단하지 않는다');
  ok(!rosterExpired({ date: '2025-01-01' }, ''), '오늘을 모르면 판단하지 않는다');

  /* 이름만 지우고 경기 기록은 남긴다 — 지난 승패까지 사라지면
     두 클럽 모두 손해다 */
  const scrubbed = scrubRoster([
    { id: 'p1', name: '홍길동', gender: 'M' },
    { id: 'p2', name: '김영희', gender: 'F' },
  ]);
  eq(scrubbed.map((p) => p.name), ['선수1', '선수2'], '이름을 자리 이름으로 바꾼다');
  eq(scrubbed.map((p) => p.id), ['p1', 'p2'], 'id 는 남긴다 — 대진표가 이걸로 사람을 가리킨다');
  eq(scrubbed.map((p) => p.gender), ['M', 'F'],
    '성별은 남긴다 — 혼복 대진이 읽혀야 한다. 그것만으로는 누구인지 알 수 없다');
  ok(scrubbed.every((p) => p.scrubbed), '지웠다는 표시를 남긴다 — 두 번 지우지 않게');
  eq(scrubRoster(null), [], '빈 명단도 버틴다');
  eq(scrubRoster([null])[0].id, 'x1', '이상한 값이 섞여도 자리는 만든다');
}

console.log('\n[코트 목록이 얼마나 오래되었나]');
{
  eq(COURT_DATA_STALE_DAYS, 180, '반년이 지나면 다시 받는다');

  const never = courtDataAge(TODAY, '');
  eq(never.never, true, '한 번도 안 받은 상태를 구분한다');
  eq(never.stale, false, '안 받은 것은 "오래된 것"과 다르다');

  const fresh = courtDataAge(TODAY, '2026-07-01');
  eq(fresh.stale, false, '두 달 전이면 아직 쓸 만하다');
  eq(fresh.days, 51, '며칠 지났는지 센다');

  const old = courtDataAge(TODAY, '2025-01-01');
  eq(old.stale, true, '1년 반이 지났으면 오래되었다');

  ok(courtDataNote(TODAY, '').includes('아직 받지 않았'), '안 받았으면 그렇게 말한다');
  ok(courtDataNote(TODAY, '2025-01-01').includes('2025-01-01'),
    '언제 받은 값인지 날짜를 적는다 — "오래됨"만으로는 판단할 수 없다');
  eq(courtDataNote(TODAY, '2026-07-01'), '',
    '최신이면 아무 말도 안 한다 — 멀쩡할 때 잔소리하면 다음 경고도 안 읽는다');
}

console.log(`\n확장 대비 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
