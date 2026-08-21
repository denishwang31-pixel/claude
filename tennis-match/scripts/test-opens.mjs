/* 공개 대회 (협회·지자체·스폰서가 여는 큰 대회)

   여기서 지키려는 것
     · **클럽 대회와 절대 섞이지 않을 것** — 이게 제일 중요하다
     · 지금 신청할 수 있는 것이 맨 위에 올 것
     · 접수 마감일이 눈에 띌 것 (놓치면 그걸로 끝이다)
     · 요강이 이상하면 등록 단계에서 막을 것 */
import {
  OPEN_STATE, OPEN_STATE_LABEL,
  lastDay, openState, openStatusLine, periodText, regionText,
  visibleOpen, sortOpen, openSidos, nearbyNote, validateOpen,
} from '../src/lib/openTournament.js';
import { KIND, KINDS, buildAgenda } from '../src/lib/agenda.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m}\n      받은 값: ${JSON.stringify(a)}\n      기대값 : ${JSON.stringify(b)}`);

const TODAY = '2026-09-10';

/* ============================================================
   섞이지 않는가 — 이 파일이 존재하는 이유
   ============================================================ */
console.log('\n[⚠️ 클럽 대회와 섞이지 않는다]');
{
  /* 공개 대회 문서를 클럽 대회인 척 일정에 밀어 넣어 본다.
     buildAgenda 는 clubs/{id}/tournaments 만 받는다. 만약 누가
     나중에 openTournaments 를 여기에 이어 붙이면, 아래가 깨진다. */
  const openDoc = {
    id: 'o1', name: '2026 던롭 X-OPEN',
    startDate: '2026-10-01', signupTo: '2026-09-20',
    sido: '서울', host: 'KATO',
  };

  /* 공개 대회 문서에는 클럽 대회가 쓰는 필드(date, signup.open)가 없다.
     그래서 일정에 넣어도 "준비 중"으로 판정되어 회원에게 안 보인다.
     이것은 우연이 아니라 두 모델이 다르기 때문이고, 여기서 못 박아 둔다. */
  const asClubTourney = buildAgenda(
    { tournaments: [openDoc] }, { today: TODAY, me: 'me' },
  );
  eq(asClubTourney.length, 0,
    '공개 대회 문서를 클럽 대회 목록에 넣어도 일정에 뜨지 않는다');

  /* 일정 화면의 종류는 셋뿐이다. 공개 대회가 여기 끼면 달력에 점이 찍힌다. */
  eq(KINDS.length, 3, '일정에 뜨는 종류는 모임·클럽 대회·게스트 셋뿐이다');
  ok(!Object.values(KIND).includes('open'),
    '공개 대회는 일정의 종류가 아니다 — 넣으려면 openTournament.js 머리말부터 읽을 것');
  eq(KINDS.find((k) => k.key === KIND.TOURNAMENT).label, '클럽 대회',
    '이름부터 "클럽 대회"로 못 박는다 — 그냥 "대회"면 다음 사람이 또 섞는다');
}

console.log('\n[지금 어떤 단계인가]');
{
  const base = {
    id: 'o1', name: '가을 오픈', startDate: '2026-10-10', endDate: '2026-10-12',
  };

  eq(openState({ ...base, signupFrom: '2026-09-20' }, TODAY), OPEN_STATE.SOON,
    '접수 시작 전');
  eq(openState({ ...base, signupFrom: '2026-09-01', signupTo: '2026-09-30' }, TODAY),
    OPEN_STATE.SIGNUP, '접수 기간 안');
  eq(openState({ ...base, signupTo: '2026-09-05' }, TODAY), OPEN_STATE.CLOSED,
    '마감일이 지났다');
  eq(openState({ ...base, startDate: '2026-09-10' }, TODAY), OPEN_STATE.LIVE,
    '오늘이 대회 첫날');
  eq(openState({ ...base, startDate: '2026-09-08', endDate: '2026-09-12' }, TODAY),
    OPEN_STATE.LIVE, '여러 날 대회의 중간 날도 진행 중');
  eq(openState({ ...base, startDate: '2026-08-01', endDate: '2026-08-03' }, TODAY),
    OPEN_STATE.DONE, '끝났다');

  /* 순서가 중요하다 */
  eq(openState({
    ...base, startDate: '2026-08-01', endDate: '2026-08-03', signupTo: '2026-12-01',
  }, TODAY), OPEN_STATE.DONE, '끝난 대회는 접수 기간을 따지지 않는다');
  eq(openState({ ...base, startDate: '2026-09-10', signupTo: '2026-09-01' }, TODAY),
    OPEN_STATE.LIVE, '오늘 열리는 대회는 접수가 마감됐어도 진행 중이다');

  /* 접수 기간을 안 적은 대회가 흔하다 — 요강만 올라오고 날짜는 공지로 */
  eq(openState(base, TODAY), OPEN_STATE.SIGNUP,
    '접수 기간을 안 적으면 접수 중으로 본다 — 접수 예정으로 두면 영영 신청 못 한다');
  eq(openState({ id: 'x' }, TODAY), OPEN_STATE.SOON, '날짜가 아예 없으면 예정');
  eq(openState(null, TODAY), OPEN_STATE.SOON, '없는 대회도 안 터진다');

  eq(lastDay({ startDate: '2026-10-10' }), '2026-10-10', '하루짜리는 시작일이 마지막 날');
  eq(lastDay({ startDate: '2026-10-10', endDate: '2026-10-12' }), '2026-10-12', '여러 날');
}

console.log('\n[현황 한 줄 — 마감일이 제일 중요하다]');
{
  ok(openStatusLine({ startDate: '2026-10-10', signupTo: '2026-09-30' }, TODAY)
    .includes('2026-09-30'), '접수 중이면 마감일을 날짜로 적는다');
  ok(openStatusLine({ startDate: '2026-10-10' }, TODAY).includes('요강 확인'),
    '마감일을 모르면 요강을 보라고 한다 — 없는 날짜를 지어내지 않는다');
  ok(openStatusLine({ startDate: '2026-10-10', signupFrom: '2026-09-20' }, TODAY)
    .includes('2026-09-20부터'), '아직이면 언제부터인지 적는다');
  ok(openStatusLine({ startDate: '2026-10-10', signupTo: '2026-09-01' }, TODAY)
    .includes('마감'), '마감되었다고 말한다');
  ok(openStatusLine({ startDate: TODAY }, TODAY).includes('오늘'), '오늘 열린다');
  ok(openStatusLine({ startDate: '2026-01-01' }, TODAY).includes('끝난'), '끝났다');
}

console.log('\n[날짜·지역 표기]');
{
  eq(periodText({ startDate: '2026-09-12' }), '9/12', '하루');
  eq(periodText({ startDate: '2026-09-12', endDate: '2026-09-14' }), '9/12~9/14', '여러 날');
  eq(periodText({ startDate: '2026-09-12', endDate: '2026-09-12' }), '9/12',
    '시작과 끝이 같으면 하루로 적는다');
  eq(periodText({}), '날짜 미정', '없으면 없다고');
  eq(regionText({ sido: '서울', gungu: '송파구' }), '서울 송파구', '지역');
  eq(regionText({ sido: '서울' }), '서울', '구가 없어도');
  eq(regionText({}), '지역 미정', '아예 없으면');
}

console.log('\n[목록 고르기]');
{
  const LIST = [
    { id: 'a', name: '서울오픈', sido: '서울', startDate: '2026-10-10', signupTo: '2026-09-30' },
    { id: 'b', name: '부산오픈', sido: '부산', startDate: '2026-11-01', signupFrom: '2026-10-01' },
    { id: 'c', name: '지난대회', sido: '서울', startDate: '2026-05-01' },
    { id: 'd', name: '마감된대회', sido: '서울', startDate: '2026-09-25', signupTo: '2026-09-01' },
  ];

  eq(visibleOpen(LIST, { today: TODAY }).map((t) => t.id), ['a', 'b', 'd'],
    '끝난 대회는 기본으로 감춘다 — 지난 요강보다 이번 달 대회를 찾는 사람이 많다');
  eq(visibleOpen(LIST, { today: TODAY, state: OPEN_STATE.DONE }).map((t) => t.id), ['c'],
    '지난 대회만 따로 볼 수도 있다');
  eq(visibleOpen(LIST, { today: TODAY, region: '부산' }).map((t) => t.id), ['b'], '지역으로');
  eq(visibleOpen(LIST, { today: TODAY, kw: '부산' }).map((t) => t.id), ['b'], '이름으로');
  eq(visibleOpen(LIST, { today: TODAY, kw: '없는말' }), [], '없으면 빈 목록');
  eq(visibleOpen(null, { today: TODAY }), [], 'null 도 버틴다');
  eq(visibleOpen([{ name: 'id 없음' }], { today: TODAY }), [], 'id 없는 것은 뺀다');

  /* ⚠️ 날짜순으로만 세우면 "이미 마감된 다음 주 대회"가 "다음 달 접수
     중인 대회"보다 위에 온다. 지금 신청할 수 있는 것이 먼저다. */
  const sorted = sortOpen(visibleOpen(LIST, { today: TODAY }), TODAY);
  eq(sorted.map((t) => t.id), ['a', 'b', 'd'],
    '접수 중 → 예정 → 마감 순. 마감된 9/25 대회가 11/1 대회보다 아래다');

  eq(openSidos(LIST), ['부산', '서울'], '지역 칩 목록(가나다순)');
}

console.log('\n[이 달에 뭐가 있나]');
{
  const LIST = [
    { id: 'a', sido: '서울', startDate: '2026-09-20', signupTo: '2026-09-15' },
    { id: 'b', sido: '서울', startDate: '2026-09-25', signupTo: '2026-09-01' }, // 마감
    { id: 'c', sido: '부산', startDate: '2026-09-28' },
    { id: 'd', sido: '서울', startDate: '2026-10-05' },                          // 다음 달
  ];
  const all = nearbyNote(LIST, { today: TODAY, monthKey: '2026-09' });
  eq(all.count, 2, '이 달 · 아직 살아 있는 것만 (마감된 b 는 뺀다)');
  eq(all.signup, 2, '접수 중인 건수도 따로 센다');
  ok(all.text.includes('전국'), '지역을 안 고르면 전국');

  const seoul = nearbyNote(LIST, { today: TODAY, monthKey: '2026-09', region: '서울' });
  eq(seoul.count, 1, '지역을 고르면 그 지역만');
  ok(seoul.text.includes('서울'), '지역 이름을 넣어 말한다');

  eq(nearbyNote(LIST, { today: TODAY, monthKey: '2027-01' }), null,
    '볼 게 없으면 아무것도 안 띄운다 — 빈 줄을 남기면 자리만 차지한다');
  eq(nearbyNote(null, { today: TODAY, monthKey: '2026-09' }), null, '빈 목록도 버틴다');
}

console.log('\n[등록할 때 막는 것]');
{
  const good = {
    name: '가을오픈', startDate: '2026-10-10', endDate: '2026-10-12',
    signupFrom: '2026-09-01', signupTo: '2026-09-30', link: 'https://x.kr',
  };
  eq(validateOpen(good), '', '제대로 적으면 통과');

  ok(validateOpen({ ...good, name: '  ' }).includes('이름'), '이름은 필수');
  ok(validateOpen({ ...good, startDate: '' }).includes('시작일'), '시작일은 필수');
  ok(validateOpen({ ...good, endDate: '2026-10-01' }).includes('종료일'),
    '종료일이 시작일보다 빠를 수 없다');
  ok(validateOpen({ ...good, signupTo: '2026-08-01' }).includes('접수 마감일'),
    '접수 마감이 접수 시작보다 빠를 수 없다');

  /* ⚠️ 이걸 안 막으면 "접수 중"인데 이미 끝난 대회가 목록 맨 위에 올라온다 */
  ok(validateOpen({ ...good, signupTo: '2026-10-11' }).includes('대회 시작일보다 늦'),
    '접수가 대회보다 늦게 끝나는 것은 현실에 없다');

  ok(validateOpen({ ...good, link: 'x.kr' }).includes('http'),
    '링크는 http 로 시작해야 한다 — 아니면 눌러도 안 열린다');
  eq(validateOpen({ ...good, link: '' }), '', '링크는 없어도 된다(요강만 공지된 대회)');
}

console.log('\n[이름표]');
{
  eq(Object.keys(OPEN_STATE_LABEL).length, Object.keys(OPEN_STATE).length,
    '모든 상태에 이름이 있다 — 없으면 화면에 undefined 가 뜬다');
  ok(Object.values(OPEN_STATE_LABEL).every((v) => v && v.trim()), '빈 이름이 없다');
}

console.log(`\n공개 대회 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
