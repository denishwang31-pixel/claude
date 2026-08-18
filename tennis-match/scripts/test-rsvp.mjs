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

/* ---------- 설정 정리 ---------- */
section('설정 정리');
eq('빈 설정은 기본값', app.normalizeAsk(), { enabled: true, daysBefore: 3, time: '09:00' });
eq('꺼짐 유지', app.normalizeAsk({ enabled: false }).enabled, false);
eq('음수 일수는 0으로', app.normalizeAsk({ daysBefore: -5 }).daysBefore, 0);
eq('과한 일수는 30으로', app.normalizeAsk({ daysBefore: 400 }).daysBefore, 30);
eq('소수는 반올림', app.normalizeAsk({ daysBefore: 2.6 }).daysBefore, 3);
eq('글자는 기본값', app.normalizeAsk({ daysBefore: '이틀' }).daysBefore, 3);
eq('망가진 시각은 09:00', app.normalizeAsk({ time: '25:99' }).time, '09:00');
eq('빈 시각은 09:00', app.normalizeAsk({ time: '' }).time, '09:00');
eq('정상 시각 유지', app.normalizeAsk({ time: '20:30' }).time, '20:30');
eq('한 자리 시각도 허용', app.normalizeAsk({ time: '9:05' }).time, '9:05');

/* ---------- 날짜 계산 ---------- */
section('날짜 계산');
eq('3일 전', app.shiftYmd('2026-03-10', -3), '2026-03-07');
eq('월 넘김', app.shiftYmd('2026-03-01', -1), '2026-02-28');
eq('윤년 2월', app.shiftYmd('2028-03-01', -1), '2028-02-29');
eq('연 넘김', app.shiftYmd('2026-01-01', -1), '2025-12-31');
eq('망가진 날짜는 빈 문자열', app.shiftYmd('없음', -1), '');
eq('모임의 발송 예정일', app.askDateFor({ date: '2026-03-10' }, { daysBefore: 3 }), '2026-03-07');
eq('당일 발송 설정', app.askDateFor({ date: '2026-03-10' }, { daysBefore: 0 }), '2026-03-10');

/* ---------- 자동 발송 시점 ---------- */
section('자동 발송 시점');
const mt = { date: '2026-03-10', time: '10:00', place: '염곡코트' };
const cfg = { enabled: true, daysBefore: 3, time: '09:00' };

eq('예정일 예정시각 → 보낸다', app.isAskDue(mt, cfg, '2026-03-07', '09:00'), true);
eq('예정일 이른 시각 → 아직', app.isAskDue(mt, cfg, '2026-03-07', '08:30'), false);
eq('예정일 늦은 시각 → 늦게라도 보낸다',
  app.isAskDue(mt, cfg, '2026-03-07', '14:00'), true);
eq('하루 전날 → 아니다', app.isAskDue(mt, cfg, '2026-03-06', '09:00'), false);
eq('하루 뒤 → 아니다', app.isAskDue(mt, cfg, '2026-03-08', '09:00'), false);
eq('꺼져 있으면 안 보낸다',
  app.isAskDue(mt, { ...cfg, enabled: false }, '2026-03-07', '09:00'), false);
eq('취소된 모임은 안 보낸다',
  app.isAskDue({ ...mt, canceled: true }, cfg, '2026-03-07', '09:00'), false);
eq('지난 모임은 안 보낸다',
  app.isAskDue({ ...mt, date: '2026-03-01' }, cfg, '2026-03-07', '09:00'), false);
eq('오늘 이미 보냈으면 다시 안 보낸다',
  app.isAskDue({ ...mt, rsvpAsk: { auto: '2026-03-07' } }, cfg, '2026-03-07', '10:00'), false);
eq('다른 날 보낸 기록은 오늘을 막지 않는다',
  app.isAskDue({ ...mt, rsvpAsk: { auto: '2026-03-01' } }, cfg, '2026-03-07', '10:00'), true);
eq('날짜 없는 모임', app.isAskDue({ time: '10:00' }, cfg, '2026-03-07', '09:00'), false);
eq('당일 설정이면 모임 당일에 보낸다',
  app.isAskDue(mt, { ...cfg, daysBefore: 0 }, '2026-03-10', '09:00'), true);

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
eq('미정도 답한 것으로 본다',
  app.pendingVoters(members, { rsvp: { a: 'maybe' } }).map((m) => m.id), ['b', 'c', 'e']);
eq('빈 문자열은 답하지 않은 것',
  app.pendingVoters(members, { rsvp: { a: '' } }).map((m) => m.id), ['a', 'b', 'c', 'e']);
eq('null 도 답하지 않은 것',
  app.pendingVoters(members, { rsvp: { a: null } }).map((m) => m.id), ['a', 'b', 'c', 'e']);
eq('아무도 안 답했으면 활동 회원 전원',
  app.pendingVoters(members, {}).map((m) => m.id), ['a', 'b', 'c', 'e']);
eq('rsvp 자체가 없어도 죽지 않는다',
  app.pendingVoters(members, null).length, 4);
eq('회원이 없으면 빈 목록', app.pendingVoters(null, meeting), []);

eq('응답 현황', app.askProgress(members, meeting), { total: 4, answered: 2, pending: 2 });
eq('전원 응답', app.askProgress(
  [{ id: 'a' }, { id: 'b' }], { rsvp: { a: 'yes', b: 'no' } },
), { total: 2, answered: 2, pending: 0 });

/* ---------- 문구 ---------- */
section('문구');
const askMsg = app.askMessage('염곡클럽', mt);
eq('제목에 클럽 이름', askMsg.title, '염곡클럽 참석 여부를 알려주세요');
eq('본문에 날짜·요일·시간·장소',
  askMsg.body, '3월 10일(화) 10:00 염곡코트 — 참석 / 미정 / 불참을 눌러 주세요.');
eq('클럽 이름이 없어도 문장이 된다',
  app.askMessage('', mt).title, '클럽 참석 여부를 알려주세요');

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
section('앱 ↔ 서버 사본 대조');

const CASES = {
  normalizeAsk: [
    [undefined], [{}], [{ enabled: false }], [{ daysBefore: -5 }], [{ daysBefore: 400 }],
    [{ daysBefore: 2.6 }], [{ daysBefore: '이틀' }], [{ time: '25:99' }], [{ time: '20:30' }],
    [{ time: '9:05' }], [{ enabled: false, daysBefore: 7, time: '18:00' }],
  ],
  shiftYmd: [
    ['2026-03-10', -3], ['2026-03-01', -1], ['2028-03-01', -1],
    ['2026-01-01', -1], ['없음', -1], ['2026-12-31', 1],
  ],
  askDateFor: [
    [{ date: '2026-03-10' }, { daysBefore: 3 }], [{ date: '2026-03-10' }, { daysBefore: 0 }],
    [{}, {}], [null, {}],
  ],
  isAskDue: [
    [mt, cfg, '2026-03-07', '09:00'],
    [mt, cfg, '2026-03-07', '08:30'],
    [mt, cfg, '2026-03-07', '14:00'],
    [mt, cfg, '2026-03-06', '09:00'],
    [{ ...mt, canceled: true }, cfg, '2026-03-07', '09:00'],
    [{ ...mt, rsvpAsk: { auto: '2026-03-07' } }, cfg, '2026-03-07', '10:00'],
    [{ ...mt, rsvpAsk: { auto: '2026-03-01' } }, cfg, '2026-03-07', '10:00'],
    [mt, { ...cfg, enabled: false }, '2026-03-07', '09:00'],
    [mt, { ...cfg, daysBefore: 0 }, '2026-03-10', '09:00'],
    [null, cfg, '2026-03-07', '09:00'],
  ],
  pendingVoters: [
    [members, meeting], [members, {}], [members, null], [null, meeting],
    [members, { rsvp: { a: 'maybe' } }], [members, { rsvp: { a: '' } }],
    [members, { rsvp: { a: null } }],
  ],
  askProgress: [[members, meeting], [members, {}], [[], {}]],
  askMessage: [['염곡클럽', mt], ['', mt], ['클럽', {}], ['클럽', { date: '2026-12-25' }]],
  changeMessage: [
    ['염곡클럽', '김철수', 'yes', 'no', mt],
    ['염곡클럽', '김철수', 'no', 'maybe', { ...mt, matches: [{ id: 1 }] }],
    ['', '', undefined, 'yes', {}],
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

/* 내보내는 함수 목록 자체가 같아야 한쪽에만 새 함수가 생기는 일을 잡는다 */
const names = (o) => Object.keys(o).filter((k) => typeof o[k] === 'function').sort();
eq('내보내는 함수 목록이 같다', names(app), names(srv));

console.log(`\n참석 투표 테스트: ${pass} 통과 / ${fail} 실패 (사본 대조 ${compared}건)`);
process.exit(fail ? 1 : 0);
