/* 코치 · 코트 정보 · 송금 · 용품 드랍십 테스트

   여기서 지키려는 것
     - 승인 안 된 코치/영상이 회원에게 새지 않을 것
     - 지역 검색이 "사는 곳"뿐 아니라 "가르치는 코트"로도 걸릴 것
     - 같은 코트의 다른 표기가 하나로 모일 것
     - 돈이 걸린 계산(지급액·마진)이 조용히 틀리지 않을 것
     - 준비 안 된 로그인 버튼이 화면에 나오지 않을 것 */
import {
  COACH_STATUS, VIDEO_STATUS, normalizeCoach, coachProfileReady,
  submitPatch, approvePatch, rejectPatch, publicCoaches, publicVideos,
  searchCoaches, sortCoaches, lessonSlotText, sortLessonSlots, lessonSlotOk,
  billingMonth, billingId, billingAmountOk, billingTargets, billingDiff,
  BILLING_MIN, BILLING_MAX, BILLING_STATUS,
  youtubeId, videoThumb, videoReady, statusTone,
} from '../src/lib/coach.js';
import {
  normalizeCourtName, courtKey, courtKeyOf, sameCourt, clubCourtKeys,
  buildCourtIndex, courtInfo, courtInfoLine, lessonsByDay,
} from '../src/lib/courtInfo.js';
import {
  PAY_METHODS, BANKS, accountOk, accountText, tossUrl,
  availableMethods, payTarget, payClaim, claimMatches,
  parseAccountText, paySettings,
} from '../src/lib/pay.js';
import {
  GEAR_MODE, gearMode, margin, marginText, gearReady, sellableGear, isSoldOut,
  ORDER_STATUS, nextStatuses, canAdvance, newOrder, orderReady,
} from '../src/lib/dropship.js';
import {
  PROVIDERS, providerReady, enabledProviders, missingFor, needsNativeRebuild, SETUP,
} from '../src/lib/social.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m}\n      받은 값: ${JSON.stringify(a)}\n      기대값 : ${JSON.stringify(b)}`);

/* ============================================================
   코치 프로필
   ============================================================ */
console.log('\n[코치 프로필 — 저장 전 정규화]');
{
  const n = normalizeCoach({
    name: '  김코치 ', sido: '서울', gungu: '강남구',
    career: ' 국가대표 상비군 5년 ', certs: [' 생활체육지도자2급 ', '', '  '],
    lessonSlots: [
      { day: '수', from: '19:00', to: '21:00' },
      { day: '월', from: '06:00', to: '08:00', note: ' 성인그룹 ' },
      { day: '화', from: '20:00', to: '19:00' },   // 끝이 시작보다 빠르다 — 버린다
      { day: '', from: '10:00', to: '11:00' },     // 요일 없음 — 버린다
    ],
  });
  eq(n.name, '김코치', '앞뒤 공백은 지운다');
  eq(n.regionText, '서울 강남구', 'regionText 는 sido/gungu 에서 다시 만든다');
  eq(n.certs, ['생활체육지도자2급'], '빈 자격증 항목은 버린다');
  eq(n.lessonSlots.length, 2, '말이 안 되는 레슨 시간은 저장하지 않는다');
  eq(n.lessonSlots[0].day, '월', '요일 순으로 정렬한다');
  eq(n.lessonSlots[0].note, '성인그룹', '메모 공백도 지운다');

  /* regionText 만 주고 sido/gungu 를 안 주는 경우 — 옛 문서를 다시 저장할 때 */
  const m = normalizeCoach({ name: '박코치', regionText: '경기 성남시', career: '10년' });
  eq([m.sido, m.gungu], ['경기', '성남시'], 'regionText 만 있어도 쪼개서 채운다');
}

console.log('\n[승인 신청 자격]');
{
  eq(coachProfileReady({ name: '김', regionText: '서울 강남구', career: '5년' }).ok, true,
    '이름·지역·경력이 있으면 낼 수 있다');
  eq(coachProfileReady({ name: '김', career: '5년' }).missing, ['활동지역'],
    '빠진 항목을 정확히 알려 준다');
  eq(coachProfileReady({}).missing, ['이름', '활동지역', '경력'], '전부 비면 셋 다 알려 준다');
  eq(coachProfileReady({ name: '김', regionText: '서울 강남구', career: '5년', courts: [] }).ok, true,
    '코트가 없어도 신청할 수 있다 — 출강 코치를 막지 않는다');
}

console.log('\n[상태 전이 — 누가 언제 승인했는지 남는다]');
{
  const s = submitPatch();
  eq(s.status, COACH_STATUS.PENDING, '신청하면 대기 상태');
  ok(!!s.submittedAt, '신청 시각이 남는다');
  eq(s.rejectReason, '', '재신청하면 예전 반려 사유는 지운다');

  const a = approvePatch('admin1');
  eq(a.status, COACH_STATUS.APPROVED, '승인');
  eq(a.reviewedBy, 'admin1', '승인한 사람이 남는다 — 지급 결정이기 때문');
  ok(!!a.reviewedAt, '승인 시각이 남는다');

  eq(rejectPatch('admin1', ''), null, '사유 없이는 반려할 수 없다');
  eq(rejectPatch('admin1', '  '), null, '공백만 적어도 반려되지 않는다');
  const r = rejectPatch('admin1', '경력 확인 불가');
  eq(r.status, COACH_STATUS.REJECTED, '사유가 있으면 반려된다');
  eq(r.rejectReason, '경력 확인 불가', '사유가 저장된다');

  eq(statusTone(COACH_STATUS.APPROVED), 'green', '공개는 초록');
  eq(statusTone(COACH_STATUS.PENDING), 'warn', '대기는 주황');
  eq(statusTone(COACH_STATUS.REJECTED), 'red', '반려는 빨강');
}

console.log('\n[회원에게 새면 안 되는 것]');
{
  const all = [
    { id: 'a', status: COACH_STATUS.APPROVED, name: '승인' },
    { id: 'b', status: COACH_STATUS.PENDING, name: '대기' },
    { id: 'c', status: COACH_STATUS.REJECTED, name: '반려' },
    { id: 'd', status: COACH_STATUS.DRAFT, name: '작성중' },
    { id: 'e', status: COACH_STATUS.APPROVED, active: false, name: '내림' },
  ];
  eq(publicCoaches(all).map((x) => x.id), ['a'],
    '승인되고 내려두지 않은 코치만 보인다');

  const vids = [
    { id: 'v1', status: VIDEO_STATUS.APPROVED },
    { id: 'v2', status: VIDEO_STATUS.PENDING },
    { id: 'v3', status: VIDEO_STATUS.REJECTED },
    { id: 'v4', status: VIDEO_STATUS.APPROVED, active: false },
  ];
  eq(publicVideos(vids).map((x) => x.id), ['v1'], '승인된 영상만 보인다');
  eq(publicCoaches(null), [], '목록이 없어도 터지지 않는다');
}

/* ============================================================
   코치 검색
   ============================================================ */
console.log('\n[지역 검색 — 사는 곳과 가르치는 곳 둘 다]');
{
  const A = { id: 'a', status: 'approved', name: '강남코치', regionText: '서울 강남구', career: '10년', courts: [] };
  const B = {
    id: 'b', status: 'approved', name: '출강코치', regionText: '서울 강남구', career: '8년',
    courts: ['서울|송파올림픽'],
  };
  const C = { id: 'c', status: 'approved', name: '성남코치', regionText: '경기 성남시', career: '3년', courts: [] };
  const D = { id: 'd', status: 'pending', name: '대기코치', regionText: '서울 강남구', career: '1년' };
  const list = [A, B, C, D];
  const courtRegions = { '서울|송파올림픽': '서울 송파구' };

  eq(searchCoaches(list, {}).map((c) => c.id), ['a', 'b', 'c'],
    '조건이 없으면 승인된 코치 전부');
  eq(searchCoaches(list, { sido: '서울' }).map((c) => c.id), ['a', 'b'],
    '시/도만 고르면 그 시/도 전부');
  eq(searchCoaches(list, { sido: '서울', gungu: '강남구' }).map((c) => c.id), ['a', 'b'],
    '구까지 좁히면 그 구만');
  eq(searchCoaches(list, { sido: '서울', gungu: '송파구' }).map((c) => c.id), [],
    '코트 지역표를 안 넘기면 출강 코치는 안 잡힌다');
  eq(searchCoaches(list, { sido: '서울', gungu: '송파구', courtRegions }).map((c) => c.id), ['b'],
    '가르치는 코트의 지역으로도 검색된다 — 강남 사는 코치가 송파에서 가르치면 송파에 나온다');
  eq(searchCoaches(list, { courtKey: '서울|송파올림픽' }).map((c) => c.id), ['b'],
    '특정 코트로 바로 찾을 수 있다');
  eq(searchCoaches(list, { keyword: '10년' }).map((c) => c.id), ['a'], '경력 글에서도 찾는다');
  eq(searchCoaches(list, { keyword: '대기' }).map((c) => c.id), [],
    '승인 안 된 코치는 이름으로 찾아도 안 나온다');
}

console.log('\n[검색 결과 정렬]');
{
  const list = [
    { id: 'a', name: '나코치' }, { id: 'b', name: '가코치' }, { id: 'c', name: '다코치' },
  ];
  eq(sortCoaches(list, (id) => ({ a: 0, b: 0, c: 3 }[id] || 0)).map((c) => c.id),
    ['c', 'b', 'a'], '영상이 많은 코치가 먼저, 같으면 이름순');
  eq(sortCoaches(list).map((c) => c.id), ['b', 'a', 'c'], '영상 수를 안 주면 이름순');
}

console.log('\n[레슨 시간 표기]');
{
  eq(lessonSlotText({ day: '화', from: '06:00', to: '08:00', note: '성인그룹' }),
    '화 06:00~08:00 (성인그룹)', '한 줄로 읽힌다');
  eq(lessonSlotText({ day: '토', from: '09:00', to: '11:00' }), '토 09:00~11:00', '메모가 없으면 괄호도 없다');
  eq(lessonSlotText(null), '', '값이 없어도 터지지 않는다');
  eq(lessonSlotOk({ day: '월', from: '10:00', to: '09:00' }), false, '끝이 시작보다 빠르면 안 된다');
  eq(lessonSlotOk({ day: '월', from: '10:00', to: '10:00' }), false, '시작과 끝이 같아도 안 된다');
  eq(sortLessonSlots([{ day: '일', from: '9:00' }, { day: '월', from: '7:00' }]).map((s) => s.day),
    ['월', '일'], '월요일부터');
  eq(sortLessonSlots([{ day: '???', from: '7:00' }, { day: '금', from: '9:00' }]).map((s) => s.day),
    ['금', '???'], '이상한 요일은 버리지 않고 맨 뒤로');
}

/* ============================================================
   월 지급
   ============================================================ */
console.log('\n[광고비 청구 — 돈은 코치 → 앱 방향이다]');
{
  eq(billingMonth(new Date('2026-08-19T00:00:00')), '2026-08', '년-월 두 자리');
  eq(billingMonth(new Date('2026-01-05T00:00:00')), '2026-01', '한 자리 달도 0 을 붙인다');
  eq(billingId('coach1', '2026-08'), 'coach1_2026-08',
    '한 코치의 한 달치는 문서 하나 — 중복 청구가 구조적으로 막힌다');

  eq(billingAmountOk(30000), true, '3만원은 된다');
  eq(billingAmountOk(50000), true, '5만원도 된다');
  eq(billingAmountOk(29999), false, '3만원 미만은 막는다');
  eq(billingAmountOk(50001), false, '5만원 초과는 막는다');
  eq(billingAmountOk('40000'), true, '문자로 들어와도 숫자로 본다');
  eq(billingAmountOk(''), false, '빈 값은 막는다');
  eq(billingAmountOk(null), false, 'null 도 막는다');
  eq([BILLING_MIN, BILLING_MAX], [30000, 50000], '범위는 3~5만원');

  const coaches = [
    { id: 'c1', status: 'approved', name: '김' },
    { id: 'c2', status: 'approved', name: '박' },
    { id: 'c3', status: 'approved', name: '최' },   // 영상 없음
    { id: 'c4', status: 'pending', name: '이' },
  ];
  const videos = [
    { coachId: 'c1', status: 'approved', createdAt: '2026-08-03' },
    { coachId: 'c1', status: 'approved', createdAt: '2026-08-20' },
    { coachId: 'c2', status: 'approved', createdAt: '2026-08-11' },
    { coachId: 'c2', status: 'pending', createdAt: '2026-08-12' },  // 승인 전 — 노출 안 됐다
    { coachId: 'c3', status: 'approved', createdAt: '2026-07-30' }, // 지난달
    { coachId: 'c4', status: 'approved', createdAt: '2026-08-01' }, // 코치가 승인 전
  ];
  const t = billingTargets(coaches, videos, '2026-08');
  eq(t.map((x) => x.coachId), ['c1', 'c2'],
    '그 달에 광고가 실제로 나간 코치만 청구 대상 — 노출 없이 청구할 근거는 없다');
  eq(t[0].videoCount, 2, '편수를 함께 준다 — 금액 정할 때 근거가 된다');

  const d1 = billingDiff(t, [], '2026-08');
  eq(d1.missing.map((x) => x.coachId), ['c1', 'c2'],
    '광고는 나갔는데 청구서를 안 만들었으면 잡아 준다 — 그대로 두면 못 받는 돈이다');
  eq(d1.inSync, false, '빠진 청구가 있으면 어긋남');
  eq([d1.billed, d1.collected, d1.outstanding], [0, 0, 0], '아직 아무것도 안 만들었으면 0');

  const billings = [
    { coachId: 'c1', month: '2026-08', amount: 50000, status: BILLING_STATUS.PAID },
    { coachId: 'c2', month: '2026-08', amount: 30000, status: BILLING_STATUS.BILLED },
    { coachId: 'c9', month: '2026-07', amount: 999, status: BILLING_STATUS.PAID },  // 지난달
  ];
  const d2 = billingDiff(t, billings, '2026-08');
  eq(d2.missing, [], '둘 다 청구서를 만들었으면 빠진 건 없음');
  eq(d2.billed, 80000, '이 달 청구 합계');
  eq(d2.collected, 50000, '실제로 들어온 돈');
  eq(d2.outstanding, 30000, '미수금 = 청구 - 입금');
  eq(d2.unpaid.map((b) => b.coachId), ['c2'], '아직 안 들어온 건');
  eq(d2.inSync, true, '빠진 청구도 이상한 금액도 없으면 맞음');

  /* 면제 — 무료 체험이나 초기 입점 혜택.
     0원이 정상이므로 금액 검사에서 빼고, 청구 합계에도 안 넣는다.
     이걸 안 하면 "범위를 벗어난 금액" 경고가 매달 뜬다. */
  const withWaived = billingDiff(t, [
    { coachId: 'c1', month: '2026-08', amount: 0, status: BILLING_STATUS.WAIVED },
    { coachId: 'c2', month: '2026-08', amount: 30000, status: BILLING_STATUS.PAID },
  ], '2026-08');
  eq(withWaived.outOfRange, [], '면제 건은 금액이 0이어도 경고하지 않는다');
  eq(withWaived.billed, 30000, '면제는 청구 합계에 안 들어간다');
  eq(withWaived.collected, 30000, '입금은 실제 들어온 것만');
  eq(withWaived.outstanding, 0, '미수금 없음');
  eq(withWaived.unpaid, [], '면제는 미수금이 아니다');
  eq(withWaived.inSync, true, '면제가 섞여도 어긋남이 아니다');

  const bad = billingDiff(t, [
    { coachId: 'c1', month: '2026-08', amount: 100000, status: BILLING_STATUS.PAID },
    { coachId: 'c2', month: '2026-08', amount: 30000, status: BILLING_STATUS.PAID },
  ], '2026-08');
  eq(bad.outOfRange.map((b) => b.coachId), ['c1'], '범위를 벗어난 금액을 잡는다');
  eq(bad.inSync, false, '금액이 이상하면 어긋남');
}

/* ============================================================
   영상
   ============================================================ */
console.log('\n[영상 링크]');
{
  eq(youtubeId('https://youtu.be/abc123XYZ'), 'abc123XYZ', '단축 주소');
  eq(youtubeId('https://www.youtube.com/watch?v=abc123XYZ&t=10'), 'abc123XYZ', '일반 주소');
  eq(youtubeId('https://youtube.com/shorts/abc123XYZ'), 'abc123XYZ', '쇼츠');
  eq(youtubeId('https://vimeo.com/12345'), null, '유튜브가 아니면 못 읽는다');
  eq(videoThumb('https://youtu.be/abc123XYZ'), 'https://img.youtube.com/vi/abc123XYZ/mqdefault.jpg',
    '썸네일 주소를 만들어 준다');
  eq(videoThumb('https://vimeo.com/1'), '', '못 읽으면 빈 문자열 — 화면이 깨지지 않는다');

  eq(videoReady({ title: '포핸드', url: 'https://youtu.be/abc123XYZ' }).ok, true, '제목과 링크가 있으면 된다');
  eq(videoReady({ title: '', url: 'https://youtu.be/abc123XYZ' }).missing, ['제목'], '제목이 없으면 막는다');
  eq(videoReady({ title: '포핸드', url: 'https://naver.com' }).missing, ['유튜브 링크'],
    '유튜브가 아닌 링크는 받지 않는다');
}

/* ============================================================
   코트 ↔ 클럽 · 코치
   ============================================================ */
console.log('\n[코트 이름 — 표기가 흔들려도 하나로 모인다]');
{
  eq(normalizeCourtName('올림픽공원 테니스장'), '올림픽공원', '꼬리표를 뗀다');
  eq(normalizeCourtName('올림픽공원테니스장'), '올림픽공원', '공백이 없어도 같다');
  eq(normalizeCourtName('올림픽공원 테니스코트'), '올림픽공원', '테니스코트도 같은 꼬리표');
  eq(normalizeCourtName('올림픽공원 코트'), '올림픽공원', '코트만 붙어도 같다');
  eq(normalizeCourtName('  양재 시민의숲 구장 '), '양재시민의숲', '앞뒤 공백과 꼬리표를 함께 정리');

  eq(courtKey({ sido: '서울', name: '올림픽공원 테니스장' }), '서울|올림픽공원', '시/도를 앞에 둔다');
  eq(courtKey({ sido: '서울', name: '올림픽공원테니스장' }), '서울|올림픽공원', '표기가 달라도 같은 키');
  eq(courtKeyOf('서울', '올림픽공원 코트'), '서울|올림픽공원', '이름만 알아도 같은 키');
  eq(courtKey({ sido: '경기', name: '중앙테니스장' }) === courtKey({ sido: '서울', name: '중앙테니스장' }),
    false, '이름이 같아도 시/도가 다르면 다른 코트');
  eq(courtKey({ sido: '서울', name: '' }), '', '이름이 없으면 키를 만들지 않는다');
  eq(courtKey(null), '', '값이 없어도 터지지 않는다');

  eq(sameCourt({ sido: '서울', name: '올림픽공원 테니스장' }, { sido: '서울', name: '올림픽공원코트' }),
    true, '같은 곳으로 본다');
  eq(sameCourt({ sido: '서울', name: '' }, { sido: '서울', name: '' }), false,
    '둘 다 이름이 없으면 같다고 하지 않는다');
}

console.log('\n[클럽이 쓰는 코트 알아내기]');
{
  eq(clubCourtKeys({ region: '서울 송파구', venues: [{ name: '올림픽공원 테니스장' }] }),
    ['서울|올림픽공원'], '코트장에 시/도가 없으면 클럽 지역에서 가져온다');
  eq(clubCourtKeys({ region: '서울 송파구', venues: [{ name: '양재코트', addr: '서울 서초구 양재동' }] }),
    ['서울|양재'], '주소 첫 단어가 시/도면 그걸 쓴다');
  eq(clubCourtKeys({ venues: [{ name: '어디코트' }] }), [],
    '지역을 전혀 알 수 없으면 붙이지 않는다 — 엉뚱한 코트에 붙는 것보다 낫다');
  eq(clubCourtKeys({ region: '서울', venues: [] }), [], '코트장이 없으면 빈 목록');
  eq(clubCourtKeys(null), [], '클럽이 없어도 터지지 않는다');
}

console.log('\n[코트 색인 — 그 코트에 누가 있는가]');
{
  const clubs = [
    { id: 'club1', name: '강남클럽', region: '서울 송파구', venues: [{ name: '올림픽공원 테니스장' }] },
    { id: 'club2', name: '송파클럽', region: '서울 송파구', venues: [{ name: '올림픽공원테니스코트' }] },
    { id: 'club3', name: '분당클럽', region: '경기 성남시', venues: [{ name: '탄천 테니스장' }] },
  ];
  const coaches = [
    {
      id: 'co1',
      name: '김코치',
      courts: ['서울|올림픽공원'],
      lessonSlots: [{ day: '월', from: '06:00', to: '08:00' }, { day: '수', from: '19:00', to: '21:00' }],
    },
    { id: 'co2', name: '박코치', courts: ['서울|올림픽공원'], lessonSlots: [{ day: '월', from: '10:00', to: '12:00' }] },
  ];
  const idx = buildCourtIndex({ clubs, coaches });
  const court = { sido: '서울', name: '올림픽공원 테니스장' };
  const info = courtInfo(court, idx);

  eq(info.clubs.map((c) => c.id), ['club1', 'club2'],
    '표기가 달라도 같은 코트의 클럽으로 모인다');
  eq(info.coaches.map((c) => c.id), ['co1', 'co2'], '그 코트 코치들');
  eq(info.lessons.length, 3, '레슨 시간이 코치별로 펼쳐진다');
  eq(info.lessons[0].coachName, '김코치', '어느 코치의 시간인지 알 수 있다');
  eq(courtInfoLine(info), '클럽 2 · 코치 2', '카드에 한 줄로');

  const empty = courtInfo({ sido: '부산', name: '없는코트' }, idx);
  eq([empty.clubs.length, empty.coaches.length], [0, 0], '아무도 없는 코트는 빈 묶음');
  eq(courtInfoLine(empty), '', '보여 줄 것이 없으면 빈 줄');
  eq(courtInfo(court, null).clubs, [], '색인이 없어도 터지지 않는다');

  const byDay = lessonsByDay(info.lessons);
  eq(Object.keys(byDay).sort(), ['수', '월'], '요일별로 묶인다');
  eq(byDay['월'].map((l) => l.coachName), ['김코치', '박코치'], '같은 요일은 시작 시각 순');
}

/* ============================================================
   송금
   ============================================================ */
console.log('\n[계좌]');
{
  eq(accountOk({ bank: '신한', number: '110-123-456789' }), true, '은행과 계좌번호가 있으면 된다');
  eq(accountOk({ bank: '없는은행', number: '110123456789' }), false, '목록에 없는 은행은 막는다');
  eq(accountOk({ bank: '신한', number: '123' }), false, '너무 짧은 계좌번호는 막는다');
  eq(accountOk(null), false, '값이 없어도 터지지 않는다');
  ok(BANKS.includes('카카오뱅크') && BANKS.includes('토스뱅크'), '인터넷은행도 목록에 있다');

  eq(accountText({ bank: '신한', number: '110-123-456789', holder: '홍길동' }),
    '신한 110-123-456789 (홍길동)', '읽기 쉬운 한 줄');
  eq(accountText({ bank: '신한', number: '110-123-456789' }),
    '신한 110-123-456789', '예금주가 없으면 괄호도 없다');
  eq(accountText({}), '', '빈 계좌는 빈 문자열');
}

console.log('\n[예전 자유 입력 계좌도 읽어 낸다]');
{
  eq(parseAccountText('신한 110-123-456789 (홍길동)'),
    { bank: '신한', number: '110-123-456789', holder: '홍길동' },
    '한 줄에서 은행·번호·예금주를 건진다');
  eq(parseAccountText('국민은행 123456-78-901234'),
    { bank: '국민', number: '123456-78-901234', holder: '' },
    '예금주가 없어도 읽는다');
  eq(parseAccountText('카카오뱅크 3333-01-1234567 홍길동'),
    { bank: '카카오뱅크', number: '3333-01-1234567', holder: '' },
    '괄호가 없으면 예금주는 비운다 — 잘못 넣느니 비우는 게 낫다');
  eq(parseAccountText('총무에게 문의'), null, '계좌가 아니면 못 읽는다');
  eq(parseAccountText(''), null, '빈 값은 null');

  /* 클럽 설정 두 세대를 한 함수로 읽는다 */
  eq(paySettings({ feeAccount: '신한 110-123-456789 (홍길동)' }).account.bank, '신한',
    '새 칸이 없으면 예전 문자열에서 건진다 — 기존 클럽도 다시 입력할 필요가 없다');
  eq(paySettings({
    feeAccount: '신한 110-123-456789',
    payment: { account: { bank: '국민', number: '123456789012' } },
  }).account.bank, '국민', '새 칸이 있으면 그게 이긴다');
  eq(paySettings({}).account, null, '아무것도 없으면 null');
  /* 설정 화면이 실제로 저장하는 모양 — 여기가 어긋나면 저장은 되는데
     회원 화면에 버튼이 안 생긴다. 조용해서 알아채기 어려운 고장이다. */
  eq(paySettings({ payment: { bank: '신한', number: '110-123-456789', holder: '홍길동' } }).account,
    { bank: '신한', number: '110-123-456789', holder: '홍길동' },
    '설정 화면이 저장하는 납작한 모양도 읽는다');
  eq(availableMethods(paySettings({ payment: { bank: '신한', number: '110-123-456789' } })),
    [PAY_METHODS.TOSS, PAY_METHODS.COPY], '납작한 모양으로도 버튼이 켜진다');
  eq(paySettings({ payment: { bank: '신한', number: '12' } }).account, null,
    '계좌번호가 모자라면 안 켠다');
  eq(paySettings({ payment: { kakaoPayLink: 'https://qr.kakaopay.com/x' } }).kakaoPayLink,
    'https://qr.kakaopay.com/x', '간편송금 링크도 함께 꺼낸다');
  eq(availableMethods(paySettings({ feeAccount: '신한 110-123-456789 (홍길동)' })),
    [PAY_METHODS.TOSS, PAY_METHODS.COPY],
    '예전 문자열만 있어도 토스 버튼이 켜진다');
}

console.log('\n[토스 송금 주소]');
{
  const acc = { bank: '신한', number: '110-123-456789', holder: '홍길동' };
  const url = tossUrl(acc, 50000);
  ok(url.startsWith('supertoss://send?'), '토스 송금 화면으로 보낸다');
  ok(url.includes('bank=%EC%8B%A0%ED%95%9C'), '은행명이 들어간다');
  ok(url.includes('accountNo=110123456789'), '계좌번호는 숫자만 남긴다');
  ok(url.includes('amount=50000'), '금액이 미리 채워진다 — 회원은 확인만 누른다');
  ok(!tossUrl(acc, 0).includes('amount'), '금액이 0 이면 넣지 않는다');
  ok(!tossUrl(acc, null).includes('amount'), '금액을 모르면 안 넣는다 — 직접 입력하게');
  eq(tossUrl({ bank: '없는은행', number: '1' }, 1000), '', '쓸 수 없는 계좌면 주소를 안 만든다');
  eq(tossUrl(acc, 12345.6).includes('amount=12346'), true, '소수점은 반올림');
}

console.log('\n[쓸 수 있는 송금 수단만 보여 준다]');
{
  const full = {
    account: { bank: '신한', number: '110-123-456789', holder: '홍길동' },
    kakaoPayLink: 'https://qr.kakaopay.com/xxxx',
    naverPayLink: 'https://naver.me/xxxx',
  };
  eq(availableMethods(full),
    [PAY_METHODS.TOSS, PAY_METHODS.KAKAOPAY, PAY_METHODS.NAVERPAY, PAY_METHODS.COPY],
    '다 설정하면 넷 다 나온다');
  eq(availableMethods({ account: full.account }), [PAY_METHODS.TOSS, PAY_METHODS.COPY],
    '계좌만 있으면 토스와 복사');
  eq(availableMethods({}), [], '아무것도 없으면 버튼을 안 그린다 — 눌러도 안 되는 버튼을 두지 않는다');
  eq(availableMethods({ kakaoPayLink: 'kakao.com' }), [],
    'http 로 시작하지 않는 링크는 안 쓴다');

  eq(payTarget(PAY_METHODS.COPY, full).kind, 'copy', '복사는 주소가 아니라 문자열');
  eq(payTarget(PAY_METHODS.COPY, full).value, '신한 110-123-456789 (홍길동)', '복사할 내용');
  eq(payTarget(PAY_METHODS.KAKAOPAY, full).value, 'https://qr.kakaopay.com/xxxx', '카카오페이 링크');
  eq(payTarget(PAY_METHODS.TOSS, {}), null, '못 쓰는 수단은 null');
  eq(payTarget('이상한값', full), null, '모르는 수단도 null');
}

console.log('\n[보냈다는 기록 — 납부 처리와는 다르다]');
{
  const c = payClaim({ uid: 'u1', name: '홍길동', month: '2026-08', amount: 50000, method: 'toss' });
  eq(c.confirmed, false,
    '회원이 눌렀다고 납부 처리하지 않는다 — 실제 입금은 대사가 확인한다');
  eq(c.amount, 50000, '금액이 남는다');
  ok(!!c.claimedAt, '시각이 남는다');

  eq(claimMatches(c, { amount: 50000, month: '2026-08' }), true, '금액과 달이 맞으면 같은 건');
  eq(claimMatches(c, { amount: 30000, month: '2026-08' }), false, '금액이 다르면 아니다');
  eq(claimMatches(c, null), false, '한쪽이 없으면 아니다');
}

/* ============================================================
   용품 — 링크형 / 드랍십형
   ============================================================ */
console.log('\n[옛 상품은 전부 링크형]');
{
  eq(gearMode({ title: '라켓' }), GEAR_MODE.LINK, 'mode 가 없으면 링크형');
  eq(gearMode({ mode: 'dropship' }), GEAR_MODE.DROPSHIP, '드랍십으로 지정하면 드랍십');
  eq(gearMode({ mode: '이상한값' }), GEAR_MODE.LINK, '모르는 값은 링크형으로 본다');
}

console.log('\n[마진 — 수수료까지 빼고 센다]');
{
  const g = { price: 50000, cost: 38000, shipCost: 3000, shipFee: 3000, feeRate: 3 };
  const m = margin(g);
  eq(m.revenue, 53000, '판매가 + 받은 배송비');
  eq(m.fee, 1590, '결제 수수료 3%');
  eq(m.profit, 53000 - 38000 - 3000 - 1590, '수수료를 빼야 진짜 남는 돈이다');
  eq(m.profit, 10410, '계산 결과');
  eq(Math.round(m.rate * 100), 20, '마진율');
  eq(marginText(g), '10,410원 (20%)', '화면 표기');

  eq(margin({}).profit, 0, '빈 값이면 0');
  eq(margin({ price: '50,000원', cost: '38000' }).revenue, 50000, '쉼표와 단위가 섞여도 읽는다');
  eq(margin({ price: 10000, cost: 12000 }).profit, -2000, '손해면 음수로 나온다');
}

console.log('\n[등록 전 검사]');
{
  eq(gearReady({ title: '라켓', link: 'https://smartstore.naver.com/x' }).ok, true,
    '링크형은 상품명과 링크만 있으면 된다');
  eq(gearReady({ title: '라켓', link: 'naver.com' }).missing, ['판매처 링크'],
    'http 로 시작하지 않으면 링크로 안 본다');
  eq(gearReady({ mode: 'dropship', title: '라켓' }).missing, ['공급처', '판매가', '공급가'],
    '드랍십은 더 많은 것이 필요하다');

  const loss = gearReady({ mode: 'dropship', title: '라켓', supplier: 'A상사', price: 10000, cost: 12000 });
  eq(loss.ok, true, '값이 다 있으면 저장은 된다');
  eq(loss.warn, ['남는 것이 없습니다 — 판매가나 공급가를 다시 보세요'],
    '손해 보는 값은 경고한다');

  const thin = gearReady({ mode: 'dropship', title: '라켓', supplier: 'A상사', price: 10000, cost: 9500 });
  eq(thin.warn, ['마진이 10% 미만입니다'], '마진이 얇으면 알려 준다');

  const good = gearReady({ mode: 'dropship', title: '라켓', supplier: 'A상사', price: 50000, cost: 38000 });
  eq(good.warn, [], '넉넉하면 경고 없음');
}

console.log('\n[판매 상태]');
{
  eq(sellableGear([{ id: 1 }, { id: 2, active: false }, { id: 3, active: true }]).map((g) => g.id),
    [1, 3], '내려둔 상품은 빠진다');
  eq(isSoldOut({ mode: 'dropship', stock: 0 }), true, '재고 0 은 품절');
  eq(isSoldOut({ mode: 'dropship', stock: 5 }), false, '재고가 있으면 판매 중');
  eq(isSoldOut({ stock: 0 }), false, '링크형은 재고 개념이 없다 — 품절로 만들지 않는다');
}

console.log('\n[주문 상태 — 건너뛰거나 되돌아가지 못한다]');
{
  eq(nextStatuses(ORDER_STATUS.PLACED), [ORDER_STATUS.PAID, ORDER_STATUS.CANCELED],
    '주문 접수 다음은 입금 확인 또는 취소');
  eq(canAdvance(ORDER_STATUS.PLACED, ORDER_STATUS.SHIPPED), false,
    '입금도 발주도 안 하고 배송 중으로 갈 수 없다');
  eq(canAdvance(ORDER_STATUS.PAID, ORDER_STATUS.ORDERED), true, '입금 확인 → 발주');
  eq(canAdvance(ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELED), false,
    '이미 보낸 물건은 이 화면에서 취소할 수 없다');
  eq(canAdvance(ORDER_STATUS.DONE, ORDER_STATUS.PAID), false, '끝난 주문은 되돌리지 않는다');
  eq(nextStatuses('이상한값'), [], '모르는 상태에서는 아무 데도 못 간다');
}

console.log('\n[주문 만들기]');
{
  const gear = { id: 'g1', title: '라켓', price: 50000, shipFee: 3000, cost: 38000, supplier: 'A상사' };
  const o = newOrder({ gear, qty: 2, buyerUid: 'u1', buyerName: '홍길동', phone: '010-1111-2222', addr: '서울시...' });
  eq(o.qty, 2, '수량');
  eq(o.amount, 103000, '판매가×수량 + 배송비');
  eq(o.status, ORDER_STATUS.PLACED, '처음은 주문 접수');
  eq(o.supplier, 'A상사', '어디에 발주할지 함께 적어 둔다');
  eq(newOrder({ gear, qty: 0 }).qty, 1, '수량이 0 이하면 1 로 본다');
  eq(newOrder({ gear, qty: 2.7 }).qty, 3, '소수는 반올림');

  eq(orderReady(o).ok, true, '받는 분·연락처·배송지가 있으면 접수');
  eq(orderReady({ buyerName: '홍', phone: '010', addr: '서울' }).missing, ['연락처'],
    '전화번호가 짧으면 막는다 — 배송 사고가 난다');
  eq(orderReady({}).missing, ['받는 분', '연락처', '배송지'], '전부 비면 셋 다');
}

/* ============================================================
   소셜 로그인 — 준비 상태
   ============================================================ */
console.log('\n[준비 안 된 로그인 버튼은 그리지 않는다]');
{
  eq(enabledProviders({}), [], '키가 없으면 버튼이 하나도 안 나온다');
  eq(providerReady(PROVIDERS.GOOGLE, {}), false, '구글도 키가 없으면 못 쓴다');

  const googleOnly = { googleWebClientId: 'web.apps', googleAndroidClientId: 'and.apps' };
  eq(enabledProviders(googleOnly), [PROVIDERS.GOOGLE],
    '구글은 서버 함수 없이도 된다 — Firebase 가 기본 지원하는 제공자');

  const kakaoNoServer = { kakaoRestKey: 'r', kakaoNativeKey: 'n' };
  eq(providerReady(PROVIDERS.KAKAO, kakaoNoServer), false,
    '카카오는 서버 함수 주소가 없으면 못 쓴다 — Firebase 가 모르는 제공자라서');
  eq(missingFor(PROVIDERS.KAKAO, kakaoNoServer), ['tokenEndpoint'], '뭐가 빠졌는지 알려 준다');
  eq(providerReady(PROVIDERS.KAKAO, { ...kakaoNoServer, tokenEndpoint: 'https://x' }), true,
    '서버 주소까지 있으면 쓸 수 있다');

  eq(missingFor(PROVIDERS.NAVER, {}), ['naverClientId', 'naverClientSecret', 'tokenEndpoint'],
    '네이버는 셋 다 필요하다');
  eq(missingFor('이상한값', {}), [], '모르는 제공자는 빈 목록');

  eq(needsNativeRebuild({}), false, '아무것도 안 켜면 APK 를 다시 안 만들어도 된다');
  eq(needsNativeRebuild(googleOnly), true,
    '하나라도 켜면 새 APK 가 필요하다 — 네이티브 모듈이 들어가므로 OTA 로는 안 나간다');

  Object.values(PROVIDERS).forEach((p) => {
    ok(Array.isArray(SETUP[p]) && SETUP[p].length >= 3,
      `${p} 설정 절차가 적혀 있다 — 문서를 따로 찾지 않아도 되게`);
  });
}

console.log(`\n코치·코트정보·송금·용품 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
