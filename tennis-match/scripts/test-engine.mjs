/* 대진 엔진 회귀 테스트 — `node scripts/test-engine.mjs`
   matchmaking.js 는 외부 의존 없는 순수 모듈이라 data-URL ESM 로 로드(설정 변경 불필요). */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/matchmaking.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const {
  generateMatchesV5, DEFAULT_RULES, collectPastPairs, computeStats,
  diagnoseRoster, describeShortage,
} = mod;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗', msg); } };

const mk = (n, g, grade = 'B') => ({ id: `${g}${n}`, name: `${g}${n}`, gender: g, grade });
const roster = (nm, nf) => [
  ...Array.from({ length: nm }, (_, i) => mk(i + 1, 'M')),
  ...Array.from({ length: nf }, (_, i) => mk(i + 1, 'F')),
];

const HARD_TYPES = new Set(['남복', '여복', '혼복']);
const ALL_TYPES = new Set(['남복', '여복', '혼복', '잡복']);

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

// 케이스 6: 커플 라운드 동기화 — 둘 다 출전하거나 둘 다 휴식
{
  const players = roster(6, 6);
  const couples = [['M1', 'F1'], ['M2', 'F2']];
  const matches = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, { couples });
  checkMatches(matches, players);
  const byRound = {};
  matches.forEach((m) => {
    (byRound[m.round] ||= new Set());
    [...m.teamA, ...m.teamB].forEach((id) => byRound[m.round].add(id));
  });
  for (const [r, set] of Object.entries(byRound)) {
    couples.forEach(([a, b]) => {
      ok(set.has(a) === set.has(b), `ROUND ${r}: 커플 ${a}/${b} 출전 라운드 불일치`);
    });
  }
}

// 케이스 7: 고정 페어 — 함께 출전 시 반드시 같은 팀
{
  const players = roster(6, 6);
  const fixedPairs = [['M1', 'F1'], ['M3', 'M4']];
  const matches = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, { fixedPairs });
  checkMatches(matches, players);
  matches.forEach((m) => {
    fixedPairs.forEach(([a, b]) => {
      const four = [...m.teamA, ...m.teamB];
      if (four.includes(a) && four.includes(b)) {
        const sameTeam = (m.teamA.includes(a) && m.teamA.includes(b)) || (m.teamB.includes(a) && m.teamB.includes(b));
        ok(sameTeam, `고정 페어 ${a}/${b} 가 같은 경기에서 분리됨 (R${m.round} C${m.court})`);
      }
    });
    // 고정 페어도 라운드 동기화 대상
  });
  const byRound = {};
  matches.forEach((m) => {
    (byRound[m.round] ||= new Set());
    [...m.teamA, ...m.teamB].forEach((id) => byRound[m.round].add(id));
  });
  for (const [r, set] of Object.entries(byRound)) {
    fixedPairs.forEach(([a, b]) => {
      ok(set.has(a) === set.has(b), `ROUND ${r}: 고정페어 ${a}/${b} 출전 라운드 불일치`);
    });
  }
}

// 케이스 8: 커플 + 고정페어 동시 적용에도 하드룰 유지
{
  const players = roster(8, 8);
  const matches = generateMatchesV5(players, 3, 4, DEFAULT_RULES, {}, {}, {
    couples: [['M1', 'F1']],
    fixedPairs: [['M2', 'F2'], ['F5', 'F6']],
  });
  ok(matches.length > 0, '케이스8: 편성 결과 없음');
  checkMatches(matches, players);
}

// 케이스 9: 불가능한 제약 → 무한 재시도 대신 완화해서 결과를 낸다 (VBA 멈춤 이슈와 동종)
{
  // 1코트는 혼복만 가능 → 동성 고정페어는 같은 팀이 될 수 없는 구조
  const players = roster(2, 2);
  const report = {};
  const t0 = Date.now();
  const matches = generateMatchesV5(players, 1, 4, DEFAULT_RULES, {}, {}, { fixedPairs: [['M1', 'M2']], report });
  const ms = Date.now() - t0;
  ok(matches.length > 0, '불가능 제약에서도 편성 결과가 나옴(빈 결과 아님)');
  ok(report.relaxed.length > 0, '완화 사실이 report 에 기록됨');
  ok(ms < 3000, `제한 시간 내 종료 (${ms}ms)`);
  checkMatches(matches, players);
}

// 케이스 10: 커플이 많아 성비 동기화가 불가능해도 완화 후 편성
{
  const players = roster(5, 3);
  const report = {};
  const matches = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, {
    couples: [['M1', 'F1'], ['M2', 'F2'], ['M3', 'F3']], report,
  });
  ok(matches.length > 0, '커플 과다 상황에서도 편성 결과가 나옴');
  checkMatches(matches, players);
}

// 케이스 11: 코트를 다 채울 수 없는 성비 → 가능한 코트만 사용해 편성
{
  const players = roster(5, 3); // 2면을 채우는 조합이 없음(부분 사용 필요)
  const matches = generateMatchesV5(players, 2, 3, DEFAULT_RULES, {}, {});
  ok(matches.length > 0, '코트 부분 사용으로 편성 가능');
  checkMatches(matches, players);
}

// 케이스 12: 성립 불가 로스터는 조용히 실패하지 않고 report 에 남긴다
{
  const players = roster(3, 1); // 남복(4)·여복(4)·혼복(2+2) 어느 것도 불가
  const report = {};
  const matches = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, { report });
  ok(matches.length === 0, '편성 불가 로스터는 빈 결과');
  ok(report.skippedRounds.length === 4, '편성 못 한 타임이 report 에 기록됨');
}

// 케이스 13: 과부하 상황 성능 (VBA 가 수 분 걸리던 조건)
{
  const players = roster(9, 6);
  const past = {};
  const ids = players.map((p) => p.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) past[[ids[i], ids[j]].sort().join('|')] = 5;
  }
  const strict = [DEFAULT_RULES[2], DEFAULT_RULES[0], DEFAULT_RULES[1], DEFAULT_RULES[3], DEFAULT_RULES[4]];
  const t0 = Date.now();
  const matches = generateMatchesV5(players, 3, 4, strict, past, {});
  const ms = Date.now() - t0;
  ok(matches.length > 0, '페어 전소진 + strict 에서도 편성됨');
  ok(ms < 1000, `과부하 상황 1초 이내 (${ms}ms)`);
}

/* ---------------- 잡복 허용 / 로스터 진단 ---------------- */

// 케이스 14: 기본은 잡복 금지 — 남3여1 은 편성되지 않아야 함
{
  const players = roster(3, 1);
  const strict = generateMatchesV5(players, 1, 2, DEFAULT_RULES, {}, {});
  ok(strict.length === 0, '기본(잡복 금지)에서 남3여1 은 편성 불가');
  const mixed = generateMatchesV5(players, 1, 2, DEFAULT_RULES, {}, {}, { allowMixed: true });
  ok(mixed.length > 0, '잡복 허용 시 남3여1 편성 가능');
  mixed.forEach((m) => {
    ok(ALL_TYPES.has(m.type), `허용되지 않은 타입: ${m.type}`);
    const four = new Set([...m.teamA, ...m.teamB]);
    ok(four.size === 4, '잡복 경기에 중복 인물');
  });
}

// 케이스 15: 잡복 허용해도 하드룰(동일 타임 중복 금지)은 유지
{
  const players = roster(5, 3);
  const matches = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, { allowMixed: true });
  ok(matches.length > 0, '잡복 허용 편성 성공');
  const byRound = {};
  matches.forEach((m) => { (byRound[m.round] ||= []).push(m); });
  Object.entries(byRound).forEach(([r, ms]) => {
    const seen = new Set(); let dup = false;
    ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { if (seen.has(id)) dup = true; seen.add(id); }));
    ok(!dup, `ROUND ${r}: 잡복 허용 시에도 동일 타임 중복 없음`);
  });
}

// 케이스 16: 잡복은 최후 수단 — 정규 조합이 가능하면 잡복을 쓰지 않음
{
  const players = roster(4, 4); // 남복+여복 또는 혼복2 로 충분
  const matches = generateMatchesV5(players, 2, 3, DEFAULT_RULES, {}, {}, { allowMixed: true });
  const mixedCount = matches.filter((m) => m.type === '잡복').length;
  ok(mixedCount === 0, `정규 편성 가능할 땐 잡복 미사용 (실제 ${mixedCount}경기)`);
}

// 케이스 17: diagnoseRoster 정확도
{
  const d31 = diagnoseRoster(roster(3, 1), 1);
  ok(d31.strictCourts === 0, '남3여1: 잡복 없이 0면');
  ok(d31.mixedCourts === 1, '남3여1: 잡복 허용 시 1면');
  ok(d31.needForFirstCourt.m === 1 && d31.needForFirstCourt.f === 0, '남3여1: 남성 1명이면 남복 가능');

  const d13 = diagnoseRoster(roster(1, 3), 1);
  ok(d13.needForFirstCourt.f === 1 && d13.needForFirstCourt.m === 0, '남1여3: 여성 1명이면 여복 가능');

  const d53 = diagnoseRoster(roster(5, 3), 2);
  ok(d53.strictCourts === 1, '남5여3 2면: 잡복 없이 1면');
  ok(d53.mixedCourts === 2, '남5여3 2면: 잡복 허용 시 2면');
  ok(d53.needForFullStrict.f === 1, '남5여3 2면: 여성 1명 추가면 2면 정규 가능');

  const d21 = diagnoseRoster(roster(2, 1), 2);
  ok(!d21.canPlayMixed, '총 3명: 잡복도 불가');
  ok(d21.needForFirstCourt.f === 1, '총 3명(남2여1): 여성 1명이면 혼복 가능');

  const d96 = diagnoseRoster(roster(9, 6), 3);
  ok(d96.strictCourts === 3 && d96.canPlayStrict, '남9여6 3면: 전부 정규 편성 가능');
  ok(describeShortage(d96.needForFullStrict) === '추가 인원 불필요', '부족 없음 문구');
  ok(describeShortage({ m: 2, f: 1 }) === '남성 2명 · 여성 1명', '부족 인원 문구 형식');
}

// 케이스 18: 진단과 실제 편성 결과가 일치
{
  for (const [nm, nf, courts] of [[3, 1, 1], [5, 3, 2], [7, 1, 2], [9, 6, 3], [10, 2, 3], [2, 2, 1]]) {
    const players = roster(nm, nf);
    const d = diagnoseRoster(players, courts);
    const strict = generateMatchesV5(players, courts, 1, DEFAULT_RULES, {}, {});
    const mixed = generateMatchesV5(players, courts, 1, DEFAULT_RULES, {}, {}, { allowMixed: true });
    ok(strict.length === d.strictCourts, `남${nm}여${nf} ${courts}면: 정규 예측(${d.strictCourts}) = 실제(${strict.length})`);
    ok(mixed.length === d.mixedCourts, `남${nm}여${nf} ${courts}면: 잡복 예측(${d.mixedCourts}) = 실제(${mixed.length})`);
  }
}

/* ---------------- 타임 유형 / 단식 / 실력 매칭 ---------------- */
const withNtrp = (nm, nf) => [
  ...Array.from({ length: nm }, (_, i) => ({ ...mk(i + 1, 'M'), ntrp: 2.5 + (i % 6) * 0.5 })),
  ...Array.from({ length: nf }, (_, i) => ({ ...mk(i + 1, 'F'), ntrp: 2.5 + (i % 6) * 0.5 })),
];

// 케이스 19: 타임 유형 지정이 그대로 반영
{
  const players = roster(8, 8);
  const mx = generateMatchesV5(players, 2, 3, DEFAULT_RULES, {}, {}, { defaultRoundType: 'MX' });
  ok(mx.length > 0 && mx.every((m) => m.type === '혼복'), 'MX 지정 시 전부 혼복');

  const same = generateMatchesV5(players, 2, 3, DEFAULT_RULES, {}, {}, { defaultRoundType: 'SAME' });
  ok(same.length > 0 && same.every((m) => m.type === '남복' || m.type === '여복'), 'SAME 지정 시 동성복식만');

  const mixedPlan = generateMatchesV5(players, 2, 3, DEFAULT_RULES, {}, {}, {
    roundPlan: { 1: 'MX', 2: 'SAME', 3: 'SINGLES' },
  });
  const r1 = mixedPlan.filter((m) => m.round === 1);
  const r2 = mixedPlan.filter((m) => m.round === 2);
  const r3 = mixedPlan.filter((m) => m.round === 3);
  ok(r1.length && r1.every((m) => m.type === '혼복'), '1타임 혼복');
  ok(r2.length && r2.every((m) => m.type === '남복' || m.type === '여복'), '2타임 동성복식');
  ok(r3.length && r3.every((m) => m.type === '남단식' || m.type === '여단식'), '3타임 단식');
}

// 케이스 20: 단식은 코트당 2명, 팀당 1명
{
  const players = roster(6, 6);
  const singles = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, { defaultRoundType: 'SINGLES' });
  ok(singles.length > 0, '단식 편성됨');
  singles.forEach((m) => {
    ok(m.teamA.length === 1 && m.teamB.length === 1, '단식은 1:1');
    ok(m.teamA[0] !== m.teamB[0], '자기 자신과 대결 불가');
  });
  // 동일 타임 중복 없음
  const byRound = {};
  singles.forEach((m) => { (byRound[m.round] ||= []).push(...m.teamA, ...m.teamB); });
  Object.entries(byRound).forEach(([r, ids]) => {
    ok(new Set(ids).size === ids.length, `단식 ROUND ${r} 중복 배정 없음`);
  });
  // 성별 규칙: 남단식은 남자끼리
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  singles.forEach((m) => {
    const g = [byId[m.teamA[0]].gender, byId[m.teamB[0]].gender];
    if (m.type === '남단식') ok(g.every((x) => x === 'M'), '남단식은 남자끼리');
    if (m.type === '여단식') ok(g.every((x) => x === 'F'), '여단식은 여자끼리');
  });
}

// 케이스 21: 실력 매칭이 양 팀 실력 합을 균등하게 만든다
{
  const players = withNtrp(8, 8);
  const skill = (id) => players.find((p) => p.id === id).ntrp;
  const teamGap = (ms) => ms.filter((m) => m.teamA.length === 2).map((m) =>
    Math.abs(m.teamA.map(skill).reduce((a, b) => a + b, 0) - m.teamB.map(skill).reduce((a, b) => a + b, 0)));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const off = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, {});
  const on = generateMatchesV5(players, 2, 4, DEFAULT_RULES, {}, {}, { skillBalance: true });
  ok(avg(teamGap(on)) <= avg(teamGap(off)) + 0.01,
    `실력매칭 ON 이 팀 균형 우수 (ON ${avg(teamGap(on)).toFixed(2)} vs OFF ${avg(teamGap(off)).toFixed(2)})`);
  ok(avg(teamGap(on)) < 1.0, `실력매칭 시 팀 실력차 1.0 미만 (${avg(teamGap(on)).toFixed(2)})`);
  checkMatches(on, players);
}

// 케이스 22: 단식 진단
{
  const d = diagnoseRoster(roster(5, 3), 3, 'SINGLES');
  ok(d.strictCourts === 3, '남5여3 3면 단식: 3면 가능(남2+여1)');
  const d2 = diagnoseRoster(roster(1, 0), 2, 'SINGLES');
  ok(!d2.canPlayStrict, '1명은 단식 불가');
}

/* ---------------- 케이스 23: 단식 게임 수 균등 ----------------
   버그였던 것: 남/여 단식을 몇 면씩 쓸지 그 타임만 보고 정하다 보니
   매 타임 같은 조합이 뽑혀 한쪽 성별만 계속 뛰었다.
   (남4·여4·3면 4타임 → 여자 4게임, 남자 2게임)                        */
{
  const gamesOf = (players, ms) => {
    const g = Object.fromEntries(players.map((p) => [p.id, 0]));
    ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { g[id] += 1; }));
    return players.map((p) => g[p.id]);
  };
  const singlesRun = (nM, nF, courts, rounds, opt = {}) => {
    const players = roster(nM, nF);
    const ms = generateMatchesV5(players, courts, rounds, DEFAULT_RULES, {}, {},
      { defaultRoundType: 'SINGLES', ...opt });
    const vals = gamesOf(players, ms);
    return { players, ms, vals, spread: Math.max(...vals) - Math.min(...vals) };
  };

  // 사용자가 신고한 바로 그 케이스
  const r = singlesRun(4, 4, 3, 4);
  ok(r.spread === 0, `남4여4 3면 4타임 단식: 전원 같은 경기 수 (편차 ${r.spread})`);
  ok(r.vals.every((v) => v === 3), `남4여4 3면 4타임: 전원 3경기 (${r.vals.join(',')})`);

  // 1면이면 예전엔 남자가 0게임이었다
  const one = singlesRun(4, 4, 1, 4);
  ok(one.vals.every((v) => v > 0), `남4여4 1면 4타임: 아무도 0경기가 아님 (${one.vals.join(',')})`);
  ok(one.spread === 0, `남4여4 1면 4타임 편차 0 (${one.spread})`);

  // 성비가 같은 여러 조합에서 편차가 최소를 벗어나지 않는다
  [[4, 4], [6, 6], [8, 8], [2, 2], [10, 10]].forEach(([nM, nF]) => {
    [1, 2, 3, 4].forEach((c) => {
      const x = singlesRun(nM, nF, c, 4);
      const slots = x.ms.length * 2;
      const lo = Math.floor(slots / x.players.length);
      const hi = Math.ceil(slots / x.players.length);
      ok(x.spread <= Math.max(1, hi - lo),
        `남${nM}여${nF} ${c}면 단식 편차 ${x.spread} ≤ ${Math.max(1, hi - lo)}`);
    });
  });

  // 잡복 금지(기본)에서는 혼성 단식이 나오지 않는다
  const strict = singlesRun(1, 7, 3, 4);
  ok(strict.ms.every((m) => m.type !== '혼성단식'), '잡복 금지 클럽은 혼성 단식 없음');

  // 잡복 허용이면 성별이 홀수여도 아무도 놀지 않는다
  const mixed = singlesRun(1, 7, 3, 4, { allowMixed: true });
  ok(mixed.vals.every((v) => v > 0), `남1여7 잡복허용: 전원 출전 (${mixed.vals.join(',')})`);
  ok(mixed.spread === 0, `남1여7 잡복허용 편차 0 (${mixed.spread})`);
  const byId = Object.fromEntries(mixed.players.map((p) => [p.id, p]));
  mixed.ms.forEach((m) => {
    const g = [byId[m.teamA[0]].gender, byId[m.teamB[0]].gender];
    if (m.type === '혼성단식') ok(g[0] !== g[1], '혼성단식은 남녀 대결');
    if (m.type === '남단식') ok(g.every((x) => x === 'M'), '남단식은 남자끼리(혼성 허용시에도)');
    if (m.type === '여단식') ok(g.every((x) => x === 'F'), '여단식은 여자끼리(혼성 허용시에도)');
  });
}

/* ============================================================
   타임별 미배정 — "나는 4타임 빼 줘"

   늦게 오는 사람, 먼저 가는 사람, 오늘 무릎이 안 좋은 사람.
   이걸 못 넣으면 총무가 짜 놓고 그 자리만 손으로 고치게 되고,
   그러면 게임 수 균등 계산이 어긋난다.
   ============================================================ */
{
  const P8 = roster(4, 4);
  const inRound = (ms, r) =>
    ms.filter((m) => m.round === r).flatMap((m) => [...m.teamA, ...m.teamB]);

  {
    const ms = generateMatchesV5(P8, 2, 4, DEFAULT_RULES, {}, {}, { excluded: { M1: [4] } });
    ok(!inRound(ms, 4).includes('M1'), '4타임 제외자가 4타임에 배정됨');
    ok([1, 2, 3].some((r) => inRound(ms, r).includes('M1')), '제외하지 않은 타임에도 안 나옴');
    checkMatches(ms, P8);
  }
  {
    // 늦게 옴 — 1타임 제외
    const ms = generateMatchesV5(P8, 2, 4, DEFAULT_RULES, {}, {}, { excluded: { M1: [1], F1: [1] } });
    ok(!inRound(ms, 1).includes('M1') && !inRound(ms, 1).includes('F1'), '지각자가 1타임에 배정됨');
    ok(inRound(ms, 1).length > 0, '지각자를 빼면 1타임 경기가 아예 안 나옴');
    checkMatches(ms, P8);
  }
  {
    // 먼저 감 — 마지막 두 타임 제외
    const ms = generateMatchesV5(P8, 2, 4, DEFAULT_RULES, {}, {}, { excluded: { F2: [3, 4] } });
    ok(!inRound(ms, 3).includes('F2') && !inRound(ms, 4).includes('F2'), '조퇴자가 후반 타임에 배정됨');
    checkMatches(ms, P8);
  }
  {
    /* 빠진 사람을 뺀 나머지끼리 고르게 나뉘어야 한다.
       편성 뒤에 빼면 그 사람이 뛴 것으로 계산돼 남은 사람 균등이 어긋난다. */
    const ms = generateMatchesV5(P8, 2, 4, DEFAULT_RULES, {}, {}, { excluded: { M1: [1, 2, 3, 4] } });
    const cnt = {};
    P8.forEach((p) => { cnt[p.id] = 0; });
    ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { cnt[id] += 1; }));
    ok(cnt.M1 === 0, '전 타임 제외인데 경기에 나옴');
    const others = P8.filter((p) => p.id !== 'M1').map((p) => cnt[p.id]);
    ok(Math.max(...others) - Math.min(...others) <= 2,
      `나머지 인원 출전 편차 과다 (${others.join(',')})`);
  }
  {
    ok(generateMatchesV5(P8, 2, 4, DEFAULT_RULES, {}, {}, { excluded: {} }).length > 0,
      'excluded 빈 객체에서 편성 실패');
    ok(generateMatchesV5(P8, 2, 4, DEFAULT_RULES, {}, {}, { excluded: null }).length > 0,
      'excluded null 에서 편성 실패');
    ok(generateMatchesV5(P8, 2, 4, DEFAULT_RULES, {}, {}).length > 0,
      'excluded 미지정에서 편성 실패');
  }
  {
    // 너무 많이 빠져 코트를 못 채워도 죽지 않는다
    const ms = generateMatchesV5(P8, 2, 2, DEFAULT_RULES, {}, {},
      { excluded: { M1: [1], M2: [1], F1: [1], F2: [1], M3: [1] } });
    ok(Array.isArray(ms), '인원 부족 타임에서 예외 발생');
    ok(['M1', 'M2', 'F1', 'F2', 'M3'].every((id) => !inRound(ms, 1).includes(id)),
      '제외자가 인원 부족 타임에 끼어듦');
  }
}


/* ============================================================
   게스트 우선 배정

   게스트는 돈을 내고 한 번 오는 사람이다. 회원은 다음 주에 또 뛰지만
   게스트에게는 오늘이 전부라서, 덜 뛰고 가면 다시 오지 않는다.
   ============================================================ */
{
  const withGuests = [
    ...roster(4, 4),
    { id: 'g:손님1', name: '손님1', gender: 'M', grade: 'B' },
    { id: 'g:손님2', name: '손님2', gender: 'F', grade: 'B' },
  ];
  const count = (ms, id) =>
    ms.filter((m) => [...m.teamA, ...m.teamB].includes(id)).length;

  const ms = generateMatchesV5(withGuests, 2, 4, DEFAULT_RULES, {}, {});
  checkMatches(ms, withGuests);

  const gm = count(ms, 'g:손님1');
  const gf = count(ms, 'g:손님2');
  const memberCounts = roster(4, 4).map((p) => count(ms, p.id));
  const minMember = Math.min(...memberCounts);

  ok(gm >= minMember, `게스트(남)가 최소 출전 회원보다 덜 뜀 (${gm} < ${minMember})`);
  ok(gf >= minMember, `게스트(여)가 최소 출전 회원보다 덜 뜀 (${gf} < ${minMember})`);
  ok(gm > 0 && gf > 0, '게스트가 한 게임도 못 뜀');

  // isGuest 플래그로 표시해도 같아야 한다
  const flagged = [
    ...roster(4, 4),
    { id: 'x1', name: '손님3', gender: 'M', grade: 'B', isGuest: true },
  ];
  const ms2 = generateMatchesV5(flagged, 2, 4, DEFAULT_RULES, {}, {});
  ok(count(ms2, 'x1') > 0, 'isGuest 플래그 게스트가 배정되지 않음');
}

/* ============================================================
   남은 기회가 적은 사람 먼저

   네 타임 중 세 타임을 빠지는 사람은, 남은 한 타임에 못 들어가면
   오늘 한 게임도 못 뛰고 돌아간다.
   ============================================================ */
{
  const P = roster(6, 6);
  const inRound = (ms, r) =>
    ms.filter((m) => m.round === r).flatMap((m) => [...m.teamA, ...m.teamB]);
  // M1 은 4타임에만 나올 수 있다
  const ms = generateMatchesV5(P, 2, 4, DEFAULT_RULES, {}, {},
    { excluded: { M1: [1, 2, 3] } });
  ok(inRound(ms, 4).includes('M1'),
    '한 타임만 가능한 사람이 그 타임에 배정되지 않음');
}


/* ============================================================
   상대 재대결 제한 (VBA usedOpp / oppCap)

   페어(같은 편) 중복은 원래 막고 있었지만 상대 중복은 아무도 안 봤다.
   그래서 "오늘 저 사람이랑만 세 번 붙었다"가 그대로 나왔다.
   ============================================================ */
{
  const oppPairs = (ms) => {
    const c = {};
    ms.forEach((m) => {
      m.teamA.forEach((a) => m.teamB.forEach((b) => {
        const k = [a, b].sort().join('|');
        c[k] = (c[k] || 0) + 1;
      }));
    });
    return c;
  };

  {
    // 인원이 넉넉하면 같은 상대를 두 번 만날 이유가 없다
    const P = roster(6, 6);
    const ms = generateMatchesV5(P, 2, 4, DEFAULT_RULES, {}, {});
    checkMatches(ms, P);
    const worst = Math.max(...Object.values(oppPairs(ms)), 0);
    ok(worst <= 2, `남6여6·2면·4타임에서 같은 상대를 ${worst}번 만남`);
  }
  {
    // 인원이 빠듯해도 편성은 되어야 한다 (상한을 단계적으로 푼다)
    const P = roster(2, 2);
    const ms = generateMatchesV5(P, 1, 4, DEFAULT_RULES, {}, {});
    ok(ms.length > 0, '인원이 빠듯하면 편성 자체가 안 됨 — 상한 완화가 동작하지 않음');
    checkMatches(ms, P);
  }
  {
    // 넉넉한 인원에서는 재대결이 페어 중복보다 먼저 줄어야 한다
    const P = roster(8, 8);
    const ms = generateMatchesV5(P, 2, 4, DEFAULT_RULES, {}, {});
    const worst = Math.max(...Object.values(oppPairs(ms)), 0);
    ok(worst <= 1, `남8여8 넉넉한 인원인데 같은 상대를 ${worst}번 만남`);
  }
}

/* ============================================================
   유형별 게임 수 균형 (VBA typeImb)

   전체 게임 수만 맞추면 "나는 오늘 혼복만 네 번 했다"가 된다.
   ============================================================ */
{
  const P = roster(6, 6);
  const ms = generateMatchesV5(P, 2, 6, DEFAULT_RULES, {}, {});
  const md = {}, wd = {};
  P.forEach((p) => { md[p.id] = 0; wd[p.id] = 0; });
  ms.forEach((m) => {
    const ids = [...m.teamA, ...m.teamB];
    if (m.type === '남복') ids.forEach((id) => { md[id] += 1; });
    if (m.type === '여복') ids.forEach((id) => { wd[id] += 1; });
  });
  const men = P.filter((p) => p.gender === 'M').map((p) => md[p.id]);
  const women = P.filter((p) => p.gender === 'F').map((p) => wd[p.id]);
  const spreadM = Math.max(...men) - Math.min(...men);
  const spreadF = Math.max(...women) - Math.min(...women);
  ok(spreadM <= 2, `남복 게임 수 편차 과다 (${men.join(',')})`);
  ok(spreadF <= 2, `여복 게임 수 편차 과다 (${women.join(',')})`);
}

/* ============================================================
   남녀 휴식 균형 (VBA restM/restF)

   그 타임만 보면 매번 같은 쪽이 쉬어도 티가 안 난다.
   ============================================================ */
{
  // 남8 여4 · 2면 — 여자가 매번 다 나오고 남자만 쉬는 구성이 되기 쉽다
  const P = roster(8, 4);
  const ms = generateMatchesV5(P, 2, 4, DEFAULT_RULES, {}, {});
  checkMatches(ms, P);
  const cnt = {};
  P.forEach((p) => { cnt[p.id] = 0; });
  ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { cnt[id] += 1; }));
  const men = P.filter((p) => p.gender === 'M').map((p) => cnt[p.id]);
  const women = P.filter((p) => p.gender === 'F').map((p) => cnt[p.id]);
  const avgM = men.reduce((a, b) => a + b, 0) / men.length;
  const avgF = women.reduce((a, b) => a + b, 0) / women.length;
  ok(Math.abs(avgM - avgF) <= 1.6,
    `남녀 평균 출전 격차 과다 (남 ${avgM.toFixed(1)} / 여 ${avgF.toFixed(1)})`);
}

/* ============================================================
   출석률이 낮은 사람을 더 뛰게

   VBA 는 자주 나오는 사람을 우대했지만, 이 클럽의 뜻은 반대다 —
   덜 나오던 사람이 모처럼 나왔을 때 더 뛰게 해야 다시 나온다.
   ============================================================ */
{
  const P = roster(6, 6);
  // M1·F1 은 출석률이 낮고, M2·F2 는 높다
  const attendance = { M1: 10, F1: 10, M2: 95, F2: 95 };
  let lowTotal = 0, highTotal = 0;
  for (let t = 0; t < 12; t++) {          // 무작위가 섞이므로 여러 번 돌려 경향을 본다
    const ms = generateMatchesV5(P, 2, 4, DEFAULT_RULES, {}, {}, { attendance });
    const cnt = {};
    P.forEach((p) => { cnt[p.id] = 0; });
    ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { cnt[id] += 1; }));
    lowTotal += cnt.M1 + cnt.F1;
    highTotal += cnt.M2 + cnt.F2;
  }
  ok(lowTotal >= highTotal,
    `출석률 낮은 사람이 덜 뜀 (낮음 ${lowTotal} vs 높음 ${highTotal})`);
  // 출석률을 안 넘기면 예전과 같아야 한다
  ok(generateMatchesV5(P, 2, 4, DEFAULT_RULES, {}, {}).length > 0,
    'attendance 미지정에서 편성 실패');
  ok(generateMatchesV5(P, 2, 4, DEFAULT_RULES, {}, {}, { attendance: {} }).length > 0,
    'attendance 빈 객체에서 편성 실패');
}

console.log(`\n엔진 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
