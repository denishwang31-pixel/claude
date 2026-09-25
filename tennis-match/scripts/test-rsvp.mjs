/* ============================================================
   참석 투표 요청 테스트

   두 가지를 본다.
     1. 판단이 맞는가 — 누구에게 보내는지, 언제 보내는지
     2. 앱과 서버가 같은 답을 내는가

   2번이 이 파일의 진짜 이유다. firebase deploy 는 functions/ 만
   올리므로 서버는 src/lib 를 require 할 수 없고, 같은 로직이 두 벌
   존재할 수밖에 없다. 한쪽만 고치면 "앱은 3명에게 보낸다고 했는데
   서버는 5명에게 보냈다"가 된다 — 돈이나 알림에서 이런 어긋남은
   조용히 오래 간다. 그래서 같은 입력을 두 구현에 넣고 대조한다.
   ============================================================ */
import * as app from '../src/lib/rsvpAsk.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const srv = require('../functions/rsvpAsk.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${name}\n      기대: ${b}\n      실제: ${a}`);
};
const section = (s) => console.log(`\n[${s}]`);
const ok_ = (c, name) => eq(name, !!c, true);

/* ---------- 설정 정리 ---------- */
section('설정 정리 — 기본은 6일 전·5일 전 정오 두 번, 마감 4일 전 정오');
const DEF = {
  enabled: true,
  sends: [{ daysBefore: 6, time: '12:00' }, { daysBefore: 5, time: '12:00' }],
  deadline: { daysBefore: 4, time: '12:00' },
};
eq('빈 설정은 기본값', app.normalizeAsk(), DEF);
eq('기본값 상수와 같다', app.normalizeAsk(app.DEFAULT_RSVP_ASK), DEF);
/* 예전 모양({daysBefore, time})은 새 기본값으로 읽는다 — 앱 주인이 기본을 바꿨다 */
eq('예전 모양은 새 기본값으로', app.normalizeAsk({ enabled: true, daysBefore: 3, time: '09:00' }), DEF);
eq('예전 모양이어도 꺼짐은 유지', app.normalizeAsk({ enabled: false, daysBefore: 3 }).enabled, false);
eq('발송은 이른 것부터 정렬',
  app.normalizeAsk({ sends: [{ daysBefore: 2, time: '09:00' }, { daysBefore: 7, time: '20:00' }] }).sends,
  [{ daysBefore: 7, time: '20:00' }, { daysBefore: 2, time: '09:00' }]);
eq('같은 발송은 한 번만',
  app.normalizeAsk({ sends: [{ daysBefore: 3, time: '12:00' }, { daysBefore: 3, time: '12:00' }] }).sends.length, 1);
eq('최대 4번', app.normalizeAsk({ sends: [1, 2, 3, 4, 5, 6].map((d) => ({ daysBefore: d, time: '12:00' })) }).sends.length, 4);
eq('망가진 발송은 버린다', app.normalizeAsk({ sends: [{ daysBefore: '이틀' }, { daysBefore: 3, time: '12:00' }] }).sends.length, 1);
eq('과한 일수는 30으로', app.normalizeAsk({ sends: [{ daysBefore: 400, time: '12:00' }], deadline: null }).sends[0].daysBefore, 30);
eq('망가진 시각은 12:00', app.normalizeAsk({ sends: [{ daysBefore: 3, time: '25:99' }] }).sends[0].time, '12:00');
eq('한 자리 시각은 두 자리로', app.normalizeAsk({ sends: [{ daysBefore: 3, time: '9:05' }], deadline: null }).sends[0].time, '09:05');
eq('발송을 다 빼면 빈 목록(자동 발송 없음)', app.normalizeAsk({ sends: [] }).sends, []);
eq('마감 안내 안 함', app.normalizeAsk({ ...DEF, deadline: null }).deadline, null);
eq('마감이 마지막 발송보다 앞이면 마지막 발송 시각으로',
  app.normalizeAsk({ sends: [{ daysBefore: 3, time: '12:00' }], deadline: { daysBefore: 5, time: '12:00' } }).deadline,
  { daysBefore: 3, time: '12:00' });
eq('같은 날 더 이른 시각 마감도 맞춘다',
  app.normalizeAsk({ sends: [{ daysBefore: 3, time: '18:00' }], deadline: { daysBefore: 3, time: '09:00' } }).deadline,
  { daysBefore: 3, time: '18:00' });

/* ---------- 날짜 계산 ---------- */
section('날짜 계산');
eq('3일 전', app.shiftYmd('2026-03-10', -3), '2026-03-07');
eq('월 넘김', app.shiftYmd('2026-03-01', -1), '2026-02-28');
eq('윤년 2월', app.shiftYmd('2028-03-01', -1), '2028-02-29');
eq('연 넘김', app.shiftYmd('2026-01-01', -1), '2025-12-31');
eq('망가진 날짜는 빈 문자열', app.shiftYmd('없음', -1), '');
const mt = { date: '2026-03-10', time: '10:00', place: '염곡코트' };
eq('발송 일정 — 6일 전·5일 전 정오',
  app.askSchedule(mt).map((x) => [x.ymd, x.time]), [['2026-03-04', '12:00'], ['2026-03-05', '12:00']]);
ok_(app.askSchedule(mt).every((x) => /^[A-Za-z0-9_]+$/.test(x.key)), '보낸 기록 열쇠는 영숫자·밑줄만(Firestore 필드 이름)');
eq('첫 발송일(예전 화면 호환)', app.askDateFor(mt), '2026-03-04');
eq('마감 — 4일 전 정오', app.deadlineFor(mt), { ymd: '2026-03-06', time: '12:00' });
eq('마감 전', app.deadlinePassed(mt, undefined, '2026-03-06', '11:59'), false);
eq('마감 시각부터 지남', app.deadlinePassed(mt, undefined, '2026-03-06', '12:00'), true);
eq('다음 날은 지남', app.deadlinePassed(mt, undefined, '2026-03-07', '08:00'), true);
eq('마감 안내 안 하면 안 지남', app.deadlinePassed(mt, { deadline: null }, '2026-03-09', '08:00'), false);
eq('서버가 오늘 찾아볼 모임 날짜', app.askTargetDates(undefined, '2026-03-04'), ['2026-03-10', '2026-03-09']);
eq('꺼져 있으면 찾지 않는다', app.askTargetDates({ enabled: false }, '2026-03-04'), []);

/* ---------- 자동 발송 시점 ---------- */
section('자동 발송 시점 — 차례마다 한 번씩');
const k1 = app.askSchedule(mt)[0].key;
const k2 = app.askSchedule(mt)[1].key;
eq('1차: 6일 전 정오 → 보낸다', app.dueAskKey(mt, undefined, '2026-03-04', '12:00'), k1);
eq('1차: 정오 전 → 아직', app.dueAskKey(mt, undefined, '2026-03-04', '11:30'), '');
eq('1차: 늦은 시각 → 늦게라도 보낸다', app.dueAskKey(mt, undefined, '2026-03-04', '18:00'), k1);
eq('1차를 보냈으면 그날 다시 안 보낸다',
  app.dueAskKey({ ...mt, rsvpAsk: { autoSent: { [k1]: true } } }, undefined, '2026-03-04', '18:00'), '');
eq('2차: 5일 전 정오 → 보낸다',
  app.dueAskKey({ ...mt, rsvpAsk: { autoSent: { [k1]: true } } }, undefined, '2026-03-05', '12:30'), k2);
eq('발송일이 아닌 날 → 아니다', app.dueAskKey(mt, undefined, '2026-03-06', '12:00'), '');
eq('꺼져 있으면 안 보낸다', app.isAskDue(mt, { enabled: false }, '2026-03-04', '12:00'), false);
eq('취소된 모임은 안 보낸다', app.isAskDue({ ...mt, canceled: true }, undefined, '2026-03-04', '12:00'), false);
eq('지난 모임은 안 보낸다', app.isAskDue({ ...mt, date: '2026-03-01' }, undefined, '2026-03-04', '12:00'), false);
eq('날짜 없는 모임', app.isAskDue({ time: '10:00' }, undefined, '2026-03-04', '12:00'), false);
/* 바꾸는 날 — 예전 방식이 오늘 이미 보냈으면 겹쳐 보내지 않는다 */
eq('예전 방식이 오늘 보낸 기록이 있으면 오늘은 쉰다',
  app.isAskDue({ ...mt, rsvpAsk: { auto: '2026-03-04' } }, undefined, '2026-03-04', '12:00'), false);
eq('당일 발송 설정',
  app.isAskDue(mt, { sends: [{ daysBefore: 0, time: '07:00' }], deadline: null }, '2026-03-10', '07:00'), true);
eq('시각 비교는 두 자리로 맞춰서', app.isAskDue(mt, undefined, '2026-03-04', '9:30'), false);

/* ---------- 대상 고르기 ---------- */
section('대상 — 답하지 않은 사람에게만');
const members = [
  { id: 'a', name: '김철수', status: '활동' },
  { id: 'b', name: '이영희', status: '활동' },
  { id: 'c', name: '박민수', status: '활동' },
  { id: 'd', name: '최지우', status: '휴면' },
  { id: 'e', name: '정하나' },                    // status 없음 = 활동으로 본다
];
const meeting = { date: '2026-03-10', rsvp: { a: 'yes', b: 'no' } };

eq('참석·불참 답한 사람은 빠진다',
  app.pendingVoters(members, meeting).map((m) => m.id), ['c', 'e']);
eq('휴면 회원에게는 보내지 않는다',
  app.pendingVoters(members, meeting).some((m) => m.id === 'd'), false);
/* ⚠️ 예전에는 '미정'을 답한 것으로 봤다. 미정 선택지를 없애면서 뒤집었다.
   미정은 오겠다는 말도 안 오겠다는 말도 아니라 대진을 짤 수가 없고,
   총무는 결국 단톡방에서 다시 물어야 했다. 이제는 다시 물어본다.
   ⚠️ 이 판단은 앱과 서버가 같아야 한다 — 앱이 "3명에게 보냅니다"라고
      했는데 서버가 4명에게 보내면 안 된다. 아래 사본 대조가 본다. */
eq('예전에 저장된 미정은 아직 답하지 않은 것으로 본다',
  app.pendingVoters(members, { rsvp: { a: 'maybe' } }).map((m) => m.id), ['a', 'b', 'c', 'e']);
eq('빈 문자열은 답하지 않은 것',
  app.pendingVoters(members, { rsvp: { a: '' } }).map((m) => m.id), ['a', 'b', 'c', 'e']);
eq('null 도 답하지 않은 것',
  app.pendingVoters(members, { rsvp: { a: null } }).map((m) => m.id), ['a', 'b', 'c', 'e']);
eq('아무도 안 답했으면 활동 회원 전원',
  app.pendingVoters(members, {}).map((m) => m.id), ['a', 'b', 'c', 'e']);
eq('rsvp 자체가 없어도 죽지 않는다',
  app.pendingVoters(members, null).length, 4);
eq('회원이 없으면 빈 목록', app.pendingVoters(null, meeting), []);
const vm = [
  { id: 'v1', venueIds: ['A'] }, { id: 'v2', venueIds: ['B'] }, { id: 'v3', venueIds: [] }, { id: 'v4' },
];
eq('코트장 모임이면 그 코트장 사람(배정 안 된 사람 포함)에게만',
  app.pendingVoters(vm, { venueId: 'A' }).map((m) => m.id), ['v1', 'v3', 'v4']);
eq('코트장 없는 모임은 전원', app.pendingVoters(vm, {}).map((m) => m.id), ['v1', 'v2', 'v3', 'v4']);

eq('응답 현황', app.askProgress(members, meeting), { total: 4, answered: 2, pending: 2 });
eq('전원 응답', app.askProgress(
  [{ id: 'a' }, { id: 'b' }], { rsvp: { a: 'yes', b: 'no' } },
), { total: 2, answered: 2, pending: 0 });

/* ---------- 문구 ---------- */
section('문구');
const askMsg = app.askMessage('염곡클럽', mt);
eq('제목에 클럽 이름', askMsg.title, '염곡클럽 참석 여부를 알려주세요');
eq('본문에 날짜·요일·시간·장소',
  askMsg.body, '3월 10일(화) 10:00 염곡코트 — 참석 / 불참을 눌러 주세요.');
eq('클럽 이름이 없어도 문장이 된다',
  app.askMessage('', mt).title, '클럽 참석 여부를 알려주세요');
eq('설정을 주면 마감을 덧붙인다',
  app.askMessage('염곡클럽', mt, {}).body, '3월 10일(화) 10:00 염곡코트 — 참석 / 불참을 눌러 주세요. 마감 3/6(금) 12:00까지');
eq('마감 안내 안 함이면 붙이지 않는다',
  app.askMessage('염곡클럽', mt, { deadline: null }).body, '3월 10일(화) 10:00 염곡코트 — 참석 / 불참을 눌러 주세요.');
eq('설정 요약', app.askSummary(), '6일 전 12:00 · 5일 전 12:00에 보내고, 마감은 4일 전 12:00');
eq('꺼짐 요약', app.askSummary({ enabled: false }), '자동 발송 꺼짐');

const chMsg = app.changeMessage('염곡클럽', '김철수', 'yes', 'no', mt);
eq('변경 알림 제목', chMsg.title, '염곡클럽 참석 변경');
eq('변경 알림 본문', chMsg.body, '김철수 님이 3/10 모임을 참석 → 불참(으)로 바꿨습니다.');
eq('대진이 이미 짜였으면 그 사실을 덧붙인다',
  app.changeMessage('염곡클럽', '김철수', 'yes', 'no', { ...mt, matches: [{ id: 1 }] }).body,
  '김철수 님이 3/10 모임을 참석 → 불참(으)로 바꿨습니다. 대진이 이미 편성되어 있습니다.');

/* ---------- 응답 변경 감지 ---------- */
section('응답 변경 — 바꾼 것만 알린다');
eq('참석 → 불참은 알린다',
  app.changedAnswers({ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'a' } }),
  [{ id: 'a', from: 'yes', to: 'no' }]);
eq('첫 응답은 알리지 않는다',
  app.changedAnswers({ rsvp: {} }, { rsvp: { a: 'yes' }, rsvpBy: { a: 'a' } }), []);
eq('같은 값으로 다시 눌러도 알리지 않는다',
  app.changedAnswers({ rsvp: { a: 'yes' } }, { rsvp: { a: 'yes' }, rsvpBy: { a: 'a' } }), []);
eq('운영진이 대신 바꾼 것은 알리지 않는다',
  app.changedAnswers({ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'staff' } }), []);
eq('rsvpBy 가 없는 옛 문서도 본인 변경으로 본다',
  app.changedAnswers({ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' } }),
  [{ id: 'a', from: 'yes', to: 'no' }]);
eq('여러 명이 동시에 바꾸면 모두',
  app.changedAnswers(
    { rsvp: { a: 'yes', b: 'no' } },
    { rsvp: { a: 'no', b: 'yes' }, rsvpBy: { a: 'a', b: 'b' } },
  ),
  [{ id: 'a', from: 'yes', to: 'no' }, { id: 'b', from: 'no', to: 'yes' }]);
eq('불참 → 참석도 알린다 (자리가 늘어난 것도 편성에 영향)',
  app.changedAnswers({ rsvp: { a: 'no' } }, { rsvp: { a: 'yes' }, rsvpBy: { a: 'a' } }),
  [{ id: 'a', from: 'no', to: 'yes' }]);
eq('빈 문서끼리는 아무것도 아니다', app.changedAnswers({}, {}), []);
eq('null 이 들어와도 죽지 않는다', app.changedAnswers(null, null), []);

/* ---------- 앱과 서버가 같은 답을 내는가 ---------- */
section('푸시로 보낼 만한 변경만 고른다');
/* ⚠️ 알림이 많으면 사람은 알림을 꺼 버린다. 그러면 정말 중요한 알림도
   같이 죽는다. 그래서 "대진이 이미 짜였고 참석에서 빠진 경우"만 남긴다 —
   그게 이 알림을 만든 원래 이유(짜 둔 대진에 구멍이 나는 사고)다. */
const DRAWN = { matches: [{ id: 1 }] };
eq('대진 후 참석 취소는 알린다',
  app.pushWorthyChanges({ rsvp: { a: 'yes' } },
    { ...DRAWN, rsvp: { a: 'no' }, rsvpBy: { a: 'a' } }).map((c) => c.id), ['a']);
eq('대진 전에는 안 알린다',
  app.pushWorthyChanges({ rsvp: { a: 'yes' } },
    { rsvp: { a: 'no' }, rsvpBy: { a: 'a' } }), []);
eq('불참 → 참석은 안 알린다',
  app.pushWorthyChanges({ rsvp: { a: 'no' } },
    { ...DRAWN, rsvp: { a: 'yes' }, rsvpBy: { a: 'a' } }), []);
eq('첫 응답은 안 알린다',
  app.pushWorthyChanges({ rsvp: {} },
    { ...DRAWN, rsvp: { a: 'yes' }, rsvpBy: { a: 'a' } }), []);
eq('운영진 대행은 안 알린다',
  app.pushWorthyChanges({ rsvp: { a: 'yes' } },
    { ...DRAWN, rsvp: { a: 'no' }, rsvpBy: { a: 'staff' } }), []);
/* 예전 '미정'에서 빠지는 것도 알릴 일이 아니다 — 애초에 참석이 아니었다 */
eq('미정 → 불참은 안 알린다',
  app.pushWorthyChanges({ rsvp: { a: 'maybe' } },
    { ...DRAWN, rsvp: { a: 'no' }, rsvpBy: { a: 'a' } }), []);

section('여러 명이 빠져도 한 통으로 묶는다');
/* 한 명당 한 통이면 명단을 손보는 순간 알림이 우수수 쏟아지고,
   그때 사람은 내용을 안 읽고 전부 쓸어 버린다. */
eq('한 명', app.changeDigest('염곡클럽', ['김철수'], mt).body,
  '김철수 님이 3/10 모임 참석을 취소했습니다. 대진이 이미 편성되어 있습니다.');
eq('두 명은 다 적는다', app.changeDigest('염곡클럽', ['김철수', '이영희'], mt).body,
  '김철수, 이영희 님이 3/10 모임 참석을 취소했습니다. 대진이 이미 편성되어 있습니다.');
eq('셋 이상은 줄인다', app.changeDigest('염곡클럽', ['김철수', '이영희', '박민수'], mt).body,
  '김철수, 이영희 외 1명 님이 3/10 모임 참석을 취소했습니다. 대진이 이미 편성되어 있습니다.');
eq('제목만 보고도 할 일을 안다',
  app.changeDigest('염곡클럽', ['김철수'], mt).title, '염곡클럽 대진 확인 필요');

section('앱 ↔ 서버 사본 대조');

const CASES = {
  normalizeAsk: [
    [undefined], [{}], [{ enabled: false }], [{ daysBefore: 3, time: '09:00' }],
    [{ sends: [{ daysBefore: 2, time: '9:00' }, { daysBefore: 7, time: '20:00' }] }],
    [{ sends: [{ daysBefore: 400, time: '25:99' }], deadline: null }],
    [{ sends: [], deadline: { daysBefore: 1, time: '10:00' } }],
    [{ sends: [{ daysBefore: 3, time: '18:00' }], deadline: { daysBefore: 3, time: '09:00' } }],
    [{ sends: [1, 2, 3, 4, 5, 6].map((d) => ({ daysBefore: d, time: '12:00' })) }],
  ],
  shiftYmd: [
    ['2026-03-10', -3], ['2026-03-01', -1], ['2028-03-01', -1],
    ['2026-01-01', -1], ['없음', -1], ['2026-12-31', 1],
  ],
  askSchedule: [[mt], [mt, { enabled: false }], [{}, {}], [null, {}], [mt, { sends: [{ daysBefore: 0, time: '07:00' }] }]],
  askDateFor: [[mt], [{ date: '2026-03-10' }, { sends: [{ daysBefore: 0, time: '07:00' }] }], [{}, {}], [null, {}]],
  deadlineFor: [[mt], [mt, { deadline: null }], [null], [mt, { sends: [{ daysBefore: 1, time: '12:00' }] }]],
  deadlinePassed: [[mt, undefined, '2026-03-06', '11:59'], [mt, undefined, '2026-03-06', '12:00'], [mt, { deadline: null }, '2026-03-09', '08:00']],
  askTargetDates: [[undefined, '2026-03-04'], [{ enabled: false }, '2026-03-04'], [{ sends: [{ daysBefore: 1, time: '12:00' }, { daysBefore: 1, time: '18:00' }] }, '2026-03-04']],
  dueAskKey: [
    [mt, undefined, '2026-03-04', '12:00'], [mt, undefined, '2026-03-04', '11:30'],
    [mt, undefined, '2026-03-05', '9:00'], [mt, undefined, '2026-03-05', '13:00'],
    [{ ...mt, rsvpAsk: { autoSent: { d2026_03_04_1200: true } } }, undefined, '2026-03-04', '18:00'],
    [{ ...mt, rsvpAsk: { auto: '2026-03-04' } }, undefined, '2026-03-04', '12:00'],
    [{ ...mt, canceled: true }, undefined, '2026-03-04', '12:00'], [null, undefined, '2026-03-04', '12:00'],
  ],
  isAskDue: [
    [mt, undefined, '2026-03-04', '12:00'], [mt, { enabled: false }, '2026-03-04', '12:00'],
    [mt, undefined, '2026-03-06', '12:00'], [null, undefined, '2026-03-04', '12:00'],
  ],
  shortWhen: [['2026-03-06', '12:00'], ['2026-03-06', ''], ['', '12:00']],
  askSummary: [[undefined], [{ enabled: false }], [{ sends: [{ daysBefore: 0, time: '07:00' }], deadline: null }], [{ sends: [] }]],
  pendingVoters: [
    [members, meeting], [members, {}], [members, null], [null, meeting],
    [members, { rsvp: { a: 'maybe' } }], [members, { rsvp: { a: '' } }],
    [members, { rsvp: { a: null } }],
    [[{ id: 'v1', venueIds: ['A'] }, { id: 'v2', venueIds: ['B'] }, { id: 'v3' }], { venueId: 'A' }],
  ],
  askProgress: [[members, meeting], [members, {}], [[], {}]],
  askMessage: [['염곡클럽', mt], ['', mt], ['클럽', {}], ['클럽', { date: '2026-12-25' }],
    ['염곡클럽', mt, {}], ['염곡클럽', mt, { deadline: null }], ['클럽', {}, {}]],
  changeMessage: [
    ['염곡클럽', '김철수', 'yes', 'no', mt],
    ['염곡클럽', '김철수', 'no', 'maybe', { ...mt, matches: [{ id: 1 }] }],
    ['', '', undefined, 'yes', {}],
  ],
  pushWorthyChanges: [
    /* 대진이 짜인 뒤 참석 → 불참: 이것만 알린다 */
    [{ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'a' }, matches: [{ id: 1 }] }],
    /* 대진 전이면 안 알린다 */
    [{ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'a' }, matches: [] }],
    [{ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'a' } }],
    /* 불참 → 참석은 자리가 느는 일이라 급하지 않다 */
    [{ rsvp: { a: 'no' } }, { rsvp: { a: 'yes' }, rsvpBy: { a: 'a' }, matches: [{ id: 1 }] }],
    /* 첫 응답은 변경이 아니다 */
    [{ rsvp: {} }, { rsvp: { a: 'yes' }, rsvpBy: { a: 'a' }, matches: [{ id: 1 }] }],
    /* 운영진이 대신 눌러 준 것은 자기가 한 일이다 */
    [{ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'staff' }, matches: [{ id: 1 }] }],
    [{}, {}], [null, null],
  ],
  changeDigest: [
    ['염곡클럽', ['김철수'], mt],
    ['염곡클럽', ['김철수', '이영희'], mt],
    ['염곡클럽', ['김철수', '이영희', '박민수', '최지훈'], mt],
    ['', [], {}], ['클럽', null, null],
  ],
  changedAnswers: [
    [{ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'a' } }],
    [{ rsvp: {} }, { rsvp: { a: 'yes' }, rsvpBy: { a: 'a' } }],
    [{ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' }, rsvpBy: { a: 'staff' } }],
    [{ rsvp: { a: 'yes' } }, { rsvp: { a: 'no' } }],
    [{}, {}], [null, null],
  ],
};

let compared = 0;
Object.entries(CASES).forEach(([fn, argSets]) => {
  if (typeof app[fn] !== 'function') { fail += 1; console.error(`  ✗ 앱에 ${fn} 없음`); return; }
  if (typeof srv[fn] !== 'function') { fail += 1; console.error(`  ✗ 서버에 ${fn} 없음`); return; }
  argSets.forEach((args, i) => {
    compared += 1;
    eq(`${fn} #${i + 1} 앱=서버`, app[fn](...args), srv[fn](...args));
  });
});

/* 상수도 같아야 한다 — 화면에 3·5·7일이 보이는데 서버가 다른 값을
   기본으로 쓰면 "설정한 날에 안 왔다"가 된다 */
eq('기본 설정값이 같다', app.DEFAULT_RSVP_ASK, srv.DEFAULT_RSVP_ASK);
eq('선택지가 같다', app.RSVP_DAYS_BEFORE, srv.RSVP_DAYS_BEFORE);
eq('최대 발송 수가 같다', app.RSVP_MAX_SENDS, srv.RSVP_MAX_SENDS);

/* 내보내는 함수 목록 자체가 같아야 한쪽에만 새 함수가 생기는 일을 잡는다 */
const names = (o) => Object.keys(o).filter((k) => typeof o[k] === 'function').sort();
eq('내보내는 함수 목록이 같다', names(app), names(srv));

console.log(`\n참석 투표 테스트: ${pass} 통과 / ${fail} 실패 (사본 대조 ${compared}건)`);
process.exit(fail ? 1 : 0);
