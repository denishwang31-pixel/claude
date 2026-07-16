/* 대진 엔진 회귀 테스트 — `node scripts/test-engine.mjs`
   matchmaking.js 는 외부 의존 없는 순수 모듈이라 data-URL ESM 로 로드(설정 변경 불필요). */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/matchmaking.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { generateMatchesV5, DEFAULT_RULES, collectPastPairs, computeStats } = mod;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗', msg); } };

const mk = (n, g, grade = 'B') => ({ id: `${g}${n}`, name: `${g}${n}`, gender: g, grade });
const roster = (nm, nf) => [
  ...Array.from({ length: nm }, (_, i) => mk(i + 1, 'M')),
  ...Array.from({ length: nf }, (_, i) => mk(i + 1, 'F')),
];

const HARD_TYPES = new Set(['남복', '여복', '혼복']);

function checkMatches(matches, players) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const rounds = {};
  matches.forEach((m) => { (rounds[m.round] ||= []).push(m); });

  for (const m of matches) {
    // 1) 잡복 금지: 타입은 남복/여복/혼복만
    ok(HARD_TYPES.has(m.type), `허용되지 않은 대진 타입: ${m.type}`);
    const A = m.teamA.map((id) => byId[id]?.gender);
    const B = m.teamB.map((id) => byId[id]?.gender);
    const males = [...A, ...B].filter((g) => g === 'M').length;
    const females = 4 - males;
    if (m.type === '남복') ok(males === 4, '남복인데 남4 아님');
    if (m.type === '여복') ok(females === 4, '여복인데 여4 아님');
    if (m.type === '혼복') ok(males === 2 && females === 2 && A[0] !== A[1] && B[0] !== B[1], '혼복 구성이 남녀 vs 남녀 아님');
    // 팀 내 서로 다른 사람
    ok(m.teamA[0] !== m.teamA[1] && m.teamB[0] !== m.teamB[1], '같은 사람이 한 팀에 중복');
    const four = new Set([...m.teamA, ...m.teamB]);
    ok(four.size === 4, '한 경기에 중복 인물');
  }

  // 2) 동일 타임 중복 배정 없음
  for (const r of Object.keys(rounds)) {
    const seen = new Set();
    let dup = false;
    rounds[r].forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { if (seen.has(id)) dup = true; seen.add(id); }));
    ok(!dup, `ROUND ${r} 동일 타임 중복 배정`);
  }
}

// 케이스 1: 남6 여6, 코트 2, 4라운드
{
  const players = roster(6, 6);
  const matches = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {});
  ok(matches.length > 0, '케이스1: 편성 결과 없음');
  checkMatches(matches, players);
}

// 케이스 2: 남8 여1(혼복 강제 어려움) — 남복 위주로라도 편성되고 제약 위반 없어야
{
  const players = roster(8, 1);
  const matches = generateMatchesV5(players, 2, 3, DEFAULT_RULES, {}, {});
  checkMatches(matches, players);
}

// 케이스 3: 이전 페어 누적 반영 — collectPastPairs 형태 유효성
{
  const players = roster(4, 4);
  const m1 = generateMatchesV5(players, 2, 2, DEFAULT_RULES, {}, {});
  const past = collectPastPairs([{ id: 'mt1', matches: m1 }], 'other');
  ok(typeof past === 'object', '케이스3: pastPairs 객체 아님');
  const m2 = generateMatchesV5(players, 2, 2, DEFAULT_RULES, past, {});
  checkMatches(m2, players);
}

// 케이스 4: 우선순위 재배열이 반영되어도 제약 유지
{
  const players = roster(6, 6);
  const reordered = [...DEFAULT_RULES].reverse();
  const matches = generateMatchesV5(players, 3, 3, reordered, {}, {});
  checkMatches(matches, players);
}

// 케이스 5: computeStats 집계 정합
{
  const players = roster(4, 4);
  const matches = generateMatchesV5(players, 2, 2, DEFAULT_RULES, {}, {})
    .map((m, i) => ({ ...m, score: { a: i % 2 ? 6 : 4, b: i % 2 ? 4 : 6 } }));
  const { stats } = computeStats(players, [{ id: 'mt', matches }]);
  const totalWins = Object.values(stats).reduce((n, s) => n + s.wins, 0);
  ok(totalWins === matches.length * 2, '케이스5: 승리 집계 불일치(경기당 승자 2인)');
}

console.log(`\n엔진 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
