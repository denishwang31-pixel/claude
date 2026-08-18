/* ============================================================
   클럽 교류전 테스트

   보는 것
     1. 타임별 유형 편성이 규칙을 지키는가
        (남복 타임에 여자가 들어가면 그건 남복이 아니다)
     2. 권한이 한쪽에 몰려 있는가
        (상대 클럽이 우리 명단을 고칠 수 있으면 사고다)
     3. 앱과 서버 사본이 같은 답을 내는가
   ============================================================ */
import * as cm from '../src/lib/clubMatch.js';
import {
  generateTypedTeamMatches, blankTeamMatches, emptySlots,
  TEAM_ROUND_TYPES, teamRoundType, teamScore,
} from '../src/lib/teamMatch.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const srv = require('../functions/clubMatch.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${name}\n      기대: ${b}\n      실제: ${a}`);
};
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${name}${extra ? `\n      ${extra}` : ''}`);
};
const section = (s) => console.log(`\n[${s}]`);

const P = (id, name, gender) => ({ id, name, gender });
const hostTeam = [
  P('h1', '김철수', 'M'), P('h2', '이민호', 'M'), P('h3', '박준영', 'M'), P('h4', '최동현', 'M'),
  P('h5', '정수민', 'F'), P('h6', '한지원', 'F'), P('h7', '오세라', 'F'), P('h8', '윤가은', 'F'),
];
const guestTeam = [
  P('g1', '강백호', 'M'), P('g2', '서태웅', 'M'), P('g3', '송태섭', 'M'), P('g4', '정대만', 'M'),
  P('g5', '채소연', 'F'), P('g6', '이한나', 'F'), P('g7', '한영주', 'F'), P('g8', '박하진', 'F'),
];
const sexOf = (id) => [...hostTeam, ...guestTeam].find((p) => p.id === id)?.gender;

/* ---------- 설정 ---------- */
section('설정 정리');
eq('빈 설정은 기본값', cm.normalizeConfig(), {
  courts: 2, rounds: 4, startTime: '10:00', scoring: 'games',
  endGames: 6, roundMinutes: 30, roundTypes: {}, autoDraw: true,
});
eq('코트 0면은 1면으로', cm.normalizeConfig({ courts: 0 }).courts, 1);
eq('코트 99면은 20면으로', cm.normalizeConfig({ courts: 99 }).courts, 20);
eq('타임 0은 1로', cm.normalizeConfig({ rounds: 0 }).rounds, 1);
eq('글자 코트는 기본값', cm.normalizeConfig({ courts: '두 면' }).courts, 2);
eq('없는 게임수는 6게임으로', cm.normalizeConfig({ endGames: 5 }).endGames, 6);
eq('4게임 유지', cm.normalizeConfig({ endGames: 4 }).endGames, 4);
eq('망가진 시각은 10:00', cm.normalizeConfig({ startTime: '99:99' }).startTime, '10:00');
eq('시간제 유지', cm.normalizeConfig({ scoring: 'time' }).scoring, 'time');
eq('모르는 방식은 게임수로', cm.normalizeConfig({ scoring: 'xx' }).scoring, 'games');
eq('roundTypes 가 배열이어도 죽지 않는다',
  typeof cm.normalizeConfig({ roundTypes: null }).roundTypes, 'object');

eq('요약 — 게임수', cm.describeConfig({ courts: 3, rounds: 5, startTime: '09:00', endGames: 4 }),
  '09:00 시작 · 코트 3면 · 5타임 · 4게임');
eq('요약 — 시간제',
  cm.describeConfig({ scoring: 'time', roundMinutes: 25 }),
  '10:00 시작 · 코트 2면 · 4타임 · 타임당 25분');

/* ---------- 권한 ---------- */
section('권한 — 개설한 클럽이 운영한다');
const base = {
  hostClubId: 'A', guestClubId: 'B', kind: 'linked', status: 'accepted',
  hostClubName: '우리클럽', guestClubName: '상대클럽', date: '2026-09-01',
};
ok('주최 운영진은 운영할 수 있다', cm.canManage(base, 'A', true));
ok('상대 운영진은 운영할 수 없다', !cm.canManage(base, 'B', true));
ok('주최 일반 회원은 운영할 수 없다', !cm.canManage(base, 'A', false));
ok('남의 클럽은 운영할 수 없다', !cm.canManage(base, 'C', true));

const pending = { ...base, status: 'pending' };
ok('초대받은 클럽은 응답할 수 있다', cm.canRespond(pending, 'B', true));
ok('주최 클럽은 자기 초대에 응답하지 않는다', !cm.canRespond(pending, 'A', true));
ok('이미 수락했으면 다시 응답하지 않는다', !cm.canRespond(base, 'B', true));
ok('일반 회원은 응답할 수 없다', !cm.canRespond(pending, 'B', false));

eq('주최는 자기 명단 자리', cm.rosterSideFor(base, 'A', true), 'host');
eq('상대는 자기 명단 자리', cm.rosterSideFor(base, 'B', true), 'guest');
eq('수락 전에는 명단을 못 넣는다', cm.rosterSideFor(pending, 'B', true), null);
eq('회원은 명단을 못 넣는다', cm.rosterSideFor(base, 'A', false), null);
eq('남의 클럽은 자리가 없다', cm.rosterSideFor(base, 'C', true), null);

ok('미등록 상대는 주최가 양쪽을 넣는다',
  cm.hostFillsBothRosters({ ...base, kind: 'manual' }));
ok('등록 클럽은 각자 넣는다', !cm.hostFillsBothRosters(base));

eq('수락 전 안내(상대)', cm.rosterGuideFor(pending, 'B', true),
  '초대를 수락하면 우리 출전 명단을 넣을 수 있습니다.');
eq('수락 전 안내(주최)', cm.rosterGuideFor(pending, 'A', true),
  '상대 클럽이 수락하면 양쪽 명단을 넣을 수 있습니다.');
eq('거절 안내', cm.rosterGuideFor({ ...base, status: 'declined' }, 'A', true),
  '상대 클럽이 초대를 거절했습니다.');

/* ---------- 초대 검증 ---------- */
section('초대 검증');
eq('날짜 없으면 거부', cm.validateInvite({ kind: 'linked', guestClubId: 'B' }), '경기 날짜를 선택하세요');
eq('등록 클럽인데 미선택', cm.validateInvite({ kind: 'linked', date: '2026-09-01' }),
  '상대 클럽을 검색해서 선택하세요');
eq('미등록인데 이름 없음',
  cm.validateInvite({ kind: 'manual', date: '2026-09-01', guestClubName: '  ' }),
  '상대 클럽 이름을 입력하세요');
eq('정상 — 등록 클럽',
  cm.validateInvite({ kind: 'linked', date: '2026-09-01', guestClubId: 'B' }), null);
eq('정상 — 미등록',
  cm.validateInvite({ kind: 'manual', date: '2026-09-01', guestClubName: '한강클럽' }), null);

/* ---------- 편성 — 타임별 유형 ---------- */
section('편성 — 타임별 유형을 지킨다');
const cfg4 = { courts: 2, rounds: 4, roundTypes: { 1: 'MX', 2: 'MD', 3: 'WD', 4: 'SG' } };
const { matches: ms, shortages } = generateTypedTeamMatches(hostTeam, guestTeam, cfg4);

eq('2면 × 4타임 = 8경기', ms.length, 8);
eq('모자란 칸 없음', shortages.length, 0);

ok('모든 경기가 주최 vs 상대다', ms.every((m) =>
  m.teamA.every((id) => id.startsWith('h')) && m.teamB.every((id) => id.startsWith('g'))),
'팀 내 대결이 생기면 단체전이 아니다');

const r1 = ms.filter((m) => m.round === 1);
ok('1타임 혼복 — 양 팀 남1 여1', r1.every((m) =>
  [m.teamA, m.teamB].every((t) =>
    t.filter((id) => sexOf(id) === 'M').length === 1
    && t.filter((id) => sexOf(id) === 'F').length === 1)));

const r2 = ms.filter((m) => m.round === 2);
ok('2타임 남복 — 전원 남자', r2.every((m) =>
  [...m.teamA, ...m.teamB].every((id) => sexOf(id) === 'M')));

const r3 = ms.filter((m) => m.round === 3);
ok('3타임 여복 — 전원 여자', r3.every((m) =>
  [...m.teamA, ...m.teamB].every((id) => sexOf(id) === 'F')));

const r4 = ms.filter((m) => m.round === 4);
ok('4타임 단식 — 한 명씩', r4.every((m) => m.teamA.length === 1 && m.teamB.length === 1));
eq('단식 유형 이름', r4[0].type, '단식');

/* 같은 타임에 한 사람이 두 코트에 서면 안 된다 — 실제로 겪으면 현장이 멈춘다 */
[1, 2, 3, 4].forEach((r) => {
  const ids = ms.filter((m) => m.round === r).flatMap((m) => [...m.teamA, ...m.teamB]);
  ok(`${r}타임 중복 출전 없음`, ids.length === new Set(ids).size);
});

section('편성 — 출전 횟수를 고르게');
const wide = generateTypedTeamMatches(hostTeam, guestTeam, {
  courts: 2, rounds: 6, roundTypes: { 1: 'MX', 2: 'MX', 3: 'MX', 4: 'MX', 5: 'MX', 6: 'MX' },
});
const counts = {};
hostTeam.forEach((p) => { counts[p.id] = 0; });
wide.matches.forEach((m) => m.teamA.forEach((id) => { counts[id] += 1; }));
const vals = Object.values(counts);
ok('주최 팀 출전 편차 1 이내',
  Math.max(...vals) - Math.min(...vals) <= 1,
  `분포: ${JSON.stringify(counts)}`);

section('편성 — 인원이 모자라면 숨기지 않고 알린다');
const fewWomen = [P('h1', '김', 'M'), P('h2', '이', 'M'), P('h3', '박', 'M'), P('h4', '최', 'M')];
const short = generateTypedTeamMatches(fewWomen, guestTeam, {
  courts: 2, rounds: 1, roundTypes: { 1: 'WD' },
});
eq('여복인데 여자가 없으면 경기가 안 나온다', short.matches.length, 0);
ok('왜 못 채웠는지 돌려준다', short.shortages.length === 2);
eq('부족한 쪽을 짚어 준다', short.shortages[0].side, 'A');
ok('남복 타임에 여자를 억지로 넣지 않는다',
  generateTypedTeamMatches(hostTeam, guestTeam, { courts: 1, rounds: 1, roundTypes: { 1: 'MD' } })
    .matches.every((m) => [...m.teamA, ...m.teamB].every((id) => sexOf(id) === 'M')));

section('편성 — 빈 대진표(직접 입력)');
const blanks = blankTeamMatches({ courts: 2, rounds: 3, roundTypes: { 2: 'SG' } });
eq('칸 수', blanks.length, 6);
ok('선수는 비어 있다', blanks.every((m) => m.teamA.length === 0 && m.teamB.length === 0));
eq('지정하지 않은 타임은 혼복', blanks[0].type, '혼복');
eq('지정한 타임은 단식', blanks.find((m) => m.round === 2).type, '단식');
eq('빈 칸 목록 — 복식 2 + 단식 1 타임 × 2면 × 양팀', emptySlots(blanks).length, 12);
eq('다 채우면 빈 칸 없음', emptySlots([
  { round: 1, court: 1, typeKey: 'MX', teamA: ['a', 'b'], teamB: ['c', 'd'] },
]).length, 0);
eq('단식은 한 명이면 찬 것', emptySlots([
  { round: 1, court: 1, typeKey: 'SG', teamA: ['a'], teamB: ['c'] },
]).length, 0);
eq('한쪽만 비면 그쪽만', emptySlots([
  { round: 1, court: 1, typeKey: 'MX', teamA: ['a', 'b'], teamB: ['c'] },
]), [{ round: 1, court: 1, side: 'B' }]);

/* ---------- 사전 진단 ---------- */
section('사전 진단 — 누르기 전에 알려 준다');
const okDiag = cm.diagnose(hostTeam, guestTeam, cfg4);
ok('충분하면 문제 없음', okDiag.ok, JSON.stringify(okDiag.problems));
eq('성비를 센다', [okDiag.host.M, okDiag.host.F], [4, 4]);

const badDiag = cm.diagnose(fewWomen, guestTeam, { courts: 2, rounds: 1, roundTypes: { 1: 'WD' } });
ok('여자가 없으면 문제로 잡는다', !badDiag.ok);
ok('어느 타임이 문제인지 말한다', badDiag.problems[0].includes('1타임 여복'));

const tight = cm.diagnose(
  [P('a', 'a', 'M'), P('b', 'b', 'F')],
  [P('c', 'c', 'M'), P('d', 'd', 'F')],
  { courts: 2, rounds: 1, roundTypes: { 1: 'MX' } },
);
ok('2면인데 2명뿐이면 문제로 잡는다', !tight.ok);

/* ---------- 유형 정의 ---------- */
section('유형 정의');
eq('네 가지', TEAM_ROUND_TYPES.map((t) => t.key), ['MX', 'MD', 'WD', 'SG']);
eq('모르는 키는 혼복으로', teamRoundType('없음').key, 'MX');
eq('단식만 singles', TEAM_ROUND_TYPES.filter((t) => t.singles).map((t) => t.key), ['SG']);

/* ---------- 점수 집계 ---------- */
section('점수 집계');
const scored = [
  { teamA: ['h1'], teamB: ['g1'], score: { a: 6, b: 4 } },
  { teamA: ['h2'], teamB: ['g2'], score: { a: 4, b: 6 } },
  { teamA: ['h3'], teamB: ['g3'], score: { a: 6, b: 2 } },
  { teamA: ['h4'], teamB: ['g4'], score: null },
];
eq('이긴 경기 수', teamScore(scored).a, 2);
eq('상대 승수', teamScore(scored).b, 1);
eq('기록된 경기만 센다', teamScore(scored).played, 3);
eq('전체 경기 수', teamScore(scored).total, 4);
eq('우세', teamScore(scored).winner, 'A');

/* ---------- 앱 ↔ 서버 대조 ---------- */
section('앱 ↔ 서버 사본 대조');
const CASES = {
  normalizeConfig: [
    [undefined], [{}], [{ courts: 0 }], [{ courts: 99 }], [{ rounds: 0 }],
    [{ courts: '두 면' }], [{ endGames: 5 }], [{ endGames: 4 }],
    [{ startTime: '99:99' }], [{ scoring: 'time' }], [{ scoring: 'xx' }],
    [{ roundMinutes: 1 }], [{ roundMinutes: 999 }], [{ autoDraw: false }],
    [{ roundTypes: null }],
  ],
  describeConfig: [
    [undefined], [{ courts: 3, rounds: 5, startTime: '09:00', endGames: 4 }],
    [{ scoring: 'time', roundMinutes: 25 }],
  ],
  inviteMessage: [
    [{ hostClubName: '우리클럽', date: '2026-09-01', place: '염곡', config: {} }],
    [{}], [null],
  ],
  responseMessage: [
    [{ guestClubName: '상대클럽', date: '2026-09-01' }, true],
    [{ guestClubName: '상대클럽', date: '2026-09-01' }, false],
    [null, true],
  ],
};
let compared = 0;
Object.entries(CASES).forEach(([fn, argSets]) => {
  if (typeof cm[fn] !== 'function') { fail += 1; console.error(`  ✗ 앱에 ${fn} 없음`); return; }
  if (typeof srv[fn] !== 'function') { fail += 1; console.error(`  ✗ 서버에 ${fn} 없음`); return; }
  argSets.forEach((args, i) => {
    compared += 1;
    eq(`${fn} #${i + 1} 앱=서버`, cm[fn](...args), srv[fn](...args));
  });
});
eq('기본 설정이 같다', cm.DEFAULT_CM_CONFIG, srv.DEFAULT_CM_CONFIG);
eq('게임수 선택지가 같다', cm.END_GAMES, srv.END_GAMES);
eq('경기 방식 상수가 같다', cm.SCORING, srv.SCORING);

/* 서버는 필요한 것만 베낀다. 반대로 서버에만 있는 함수가 생기면
   그건 앱과 무관하게 자란 로직이므로 잡는다. */
const srvFns = Object.keys(srv).filter((k) => typeof srv[k] === 'function').sort();
ok('서버 사본에 앱에 없는 함수가 없다',
  srvFns.every((k) => typeof cm[k] === 'function'),
  `서버: ${srvFns.join(', ')}`);

console.log(`\n클럽 교류전 테스트: ${pass} 통과 / ${fail} 실패 (사본 대조 ${compared}건)`);
process.exit(fail ? 1 : 0);
