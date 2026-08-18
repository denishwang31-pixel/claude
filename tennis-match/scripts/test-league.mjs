/* ============================================================
   다팀 리그 + 수기 대진표 테스트

   리그에서 무너지면 안 되는 것
     · 한 사람이 같은 타임에 두 코트에 서지 않는다
     · 한 팀이 같은 타임에 두 코트에 갈라지지 않는다
     · 특정 두 팀만 계속 만나지 않는다
     · 팀 편성이 실력·성비로 고르다
   ============================================================ */
import {
  MIN_TEAMS, MAX_TEAMS, splitIntoTeams, teamAverage, teamComposition,
  allPairings, generateLeagueMatches, leagueStandings, leaguePlayerStats,
  diagnoseLeague, teamStyle, LEAGUE_TEAM_STYLES,
} from '../src/lib/teamLeague.js';
import {
  slotSize, blankDraw, labelOf, toggleInSlot, busyInRound, playCounts, reviewDraw,
} from '../src/lib/manualDraw.js';

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

const P = (id, name, gender, ntrp) => ({ id, name, gender, ntrp });
/* 남 12 여 12 — 4팀이면 팀당 남3 여3 */
const ROSTER = [
  ...Array.from({ length: 12 }, (_, i) => P(`m${i}`, `남${i}`, 'M', 4.5 - i * 0.1)),
  ...Array.from({ length: 12 }, (_, i) => P(`f${i}`, `여${i}`, 'F', 4.2 - i * 0.1)),
];

/* ---------- 팀 나누기 ---------- */
section('팀 나누기');
[2, 3, 4, 6].forEach((n) => {
  const teams = splitIntoTeams(ROSTER, n);
  eq(`${n}팀으로 나뉜다`, teams.length, n);
  const sizes = teams.map((t) => t.length);
  ok(Math.max(...sizes) - Math.min(...sizes) <= 1,
    `${n}팀 — 인원 편차 1 이내`, `분포 ${sizes}`);

  const comps = teams.map(teamComposition);
  ok(Math.max(...comps.map((c) => c.female)) - Math.min(...comps.map((c) => c.female)) <= 1,
    `${n}팀 — 여자 인원 편차 1 이내`,
    `분포 ${comps.map((c) => `${c.male}남${c.female}여`).join(' ')}`);

  const avgs = teams.map((t) => teamAverage(t));
  ok(Math.max(...avgs) - Math.min(...avgs) < 0.35,
    `${n}팀 — 평균 실력이 고르다`, `평균 ${avgs.join(', ')}`);
});

eq('최소보다 적게 요청하면 최소로', splitIntoTeams(ROSTER, 1).length, MIN_TEAMS);
eq('최대보다 많이 요청하면 최대로', splitIntoTeams(ROSTER, 99).length, MAX_TEAMS);
eq('참가자가 없으면 빈 팀만', splitIntoTeams([], 3).map((t) => t.length), [0, 0, 0]);
ok(splitIntoTeams(ROSTER, 4).flat().length === ROSTER.length, '아무도 빠지지 않는다');
{
  const ids = splitIntoTeams(ROSTER, 4).flat().map((p) => p.id);
  ok(new Set(ids).size === ids.length, '같은 사람이 두 팀에 들어가지 않는다');
}

section('팀 조합');
eq('3팀이면 3조합', allPairings(3), [[0, 1], [0, 2], [1, 2]]);
eq('4팀이면 6조합', allPairings(4).length, 6);
eq('2팀이면 1조합', allPairings(2).length, 1);

section('팀 색·이름');
eq('8팀까지 준비', LEAGUE_TEAM_STYLES.length, 8);
eq('첫 팀은 A팀', teamStyle(0).name, 'A팀');
eq('넘치면 돌려 쓴다', teamStyle(8).name, 'A팀');

/* ---------- 대진 생성 ---------- */
section('리그 대진 — 규칙을 지킨다');
const TEAMS4 = splitIntoTeams(ROSTER, 4);
const cfg = { courts: 2, rounds: 6, roundTypes: { 1: 'MX', 2: 'MD', 3: 'WD', 4: 'MX', 5: 'MD', 6: 'WD' } };
const { matches, shortages } = generateLeagueMatches(TEAMS4, cfg);

ok(matches.length > 0, '경기가 생성된다');
eq('모자란 칸 없음', shortages.length, 0);
eq('2면 × 6타임', matches.length, 12);

const teamOf = {};
TEAMS4.forEach((t, i) => t.forEach((p) => { teamOf[p.id] = i; }));

ok(matches.every((m) =>
  m.teamA.every((id) => teamOf[id] === m.teamAIdx)
  && m.teamB.every((id) => teamOf[id] === m.teamBIdx)),
'선수는 자기 팀 자리에만 들어간다');

ok(matches.every((m) => m.teamAIdx !== m.teamBIdx), '같은 팀끼리 붙지 않는다');

[...new Set(matches.map((m) => m.round))].forEach((r) => {
  const inRound = matches.filter((m) => m.round === r);
  const ids = inRound.flatMap((m) => [...m.teamA, ...m.teamB]);
  ok(ids.length === new Set(ids).size, `${r}타임 — 한 사람이 두 코트에 서지 않는다`);
  const tIdx = inRound.flatMap((m) => [m.teamAIdx, m.teamBIdx]);
  ok(tIdx.length === new Set(tIdx).size, `${r}타임 — 한 팀이 두 코트로 갈라지지 않는다`);
});

{
  const meet = {};
  matches.forEach((m) => {
    const k = [m.teamAIdx, m.teamBIdx].sort().join('-');
    meet[k] = (meet[k] || 0) + 1;
  });
  const counts = Object.values(meet);
  ok(Math.max(...counts) - Math.min(...counts) <= 1,
    '팀끼리 만나는 횟수가 고르다', `분포 ${JSON.stringify(meet)}`);
}

section('리그 대진 — 유형을 지킨다');
const sexOf = (id) => ROSTER.find((p) => p.id === id).gender;
matches.filter((m) => m.type === '남복').forEach((m) => {
  ok([...m.teamA, ...m.teamB].every((id) => sexOf(id) === 'M'), '남복에 여자가 없다');
});
matches.filter((m) => m.type === '여복').forEach((m) => {
  ok([...m.teamA, ...m.teamB].every((id) => sexOf(id) === 'F'), '여복에 남자가 없다');
});
matches.filter((m) => m.type === '혼복').forEach((m) => {
  ok([m.teamA, m.teamB].every((t) =>
    t.filter((id) => sexOf(id) === 'M').length === 1
    && t.filter((id) => sexOf(id) === 'F').length === 1), '혼복은 양쪽 남1 여1');
});

section('리그 대진 — 출전 균형');
{
  const c = playCounts(ROSTER, matches);
  const played = Object.values(c).filter((n) => n > 0);
  ok(Math.max(...played) - Math.min(...played) <= 1,
    '뛴 사람들 사이 편차 1 이내', `최다 ${Math.max(...played)} 최소 ${Math.min(...played)}`);
}

section('리그 대진 — 모자라면 알린다');
{
  /* 여자가 아예 없는 팀이 섞이면 여복 타임을 못 채운다 */
  const noWomen = [
    [P('a1', 'a1', 'M'), P('a2', 'a2', 'M')],
    [P('b1', 'b1', 'M'), P('b2', 'b2', 'M')],
  ];
  const r = generateLeagueMatches(noWomen, { courts: 1, rounds: 1, roundTypes: { 1: 'WD' } });
  eq('여복인데 여자가 없으면 경기 없음', r.matches.length, 0);
  ok(r.shortages.length === 1, '왜 못 채웠는지 알려준다');
  ok(!!r.shortages[0].reason, '이유가 붙어 있다');
}
{
  /* 4팀인데 3면이면 한 면은 남는다 (팀 둘이 한 코트를 쓰므로 최대 2면) */
  const r = generateLeagueMatches(TEAMS4, { courts: 3, rounds: 1, roundTypes: { 1: 'MX' } });
  eq('4팀 3면이면 2경기만', r.matches.length, 2);
  eq('남는 면은 사유와 함께', r.shortages.length, 1);
}
eq('팀이 하나면 아무것도 안 나온다',
  generateLeagueMatches([[P('a', 'a', 'M')]], { courts: 1, rounds: 1 }).matches.length, 0);

section('사전 진단');
ok(diagnoseLeague(TEAMS4, cfg).ok, '충분하면 문제 없음');
{
  const d = diagnoseLeague(TEAMS4, { courts: 4, rounds: 1, roundTypes: { 1: 'MX' } });
  ok(!d.ok, '4팀에 4면은 과하다고 짚는다');
  ok(d.problems[0].includes('2면'), '쓸 수 있는 면수를 알려준다', d.problems[0]);
}
{
  const noW = [[P('a', 'a', 'M'), P('b', 'b', 'M')], [P('c', 'c', 'M'), P('d', 'd', 'M')]];
  const d = diagnoseLeague(noW, { courts: 1, rounds: 1, roundTypes: { 1: 'WD' } });
  ok(!d.ok, '여자 없는 팀의 여복 타임을 짚는다');
}

/* ---------- 순위 ---------- */
section('팀 순위');
{
  const scored = matches.map((m, i) => ({
    ...m,
    score: i % 3 === 0 ? { a: 6, b: 3 } : i % 3 === 1 ? { a: 2, b: 6 } : null,
  }));
  const st = leagueStandings(TEAMS4, scored);
  eq('팀 수만큼 행', st.length, 4);
  eq('순위가 1부터', st[0].rank, 1);
  ok(st.every((r, i) => i === 0 || st[i - 1].wins >= r.wins), '승수 내림차순');
  ok(st.every((r) => r.wins + r.losses + r.draws === r.played), '승·패·무 합이 경기 수');

  const totalGf = st.reduce((s, r) => s + r.gf, 0);
  const totalGa = st.reduce((s, r) => s + r.ga, 0);
  eq('득점 합과 실점 합이 같다', totalGf, totalGa);
}
{
  /* 동점이면 득실차로 가른다 */
  const teams = [[P('a', 'a', 'M')], [P('b', 'b', 'M')], [P('c', 'c', 'M')]];
  const ms = [
    { teamAIdx: 0, teamBIdx: 1, teamA: ['a'], teamB: ['b'], score: { a: 6, b: 0 } },
    { teamAIdx: 0, teamBIdx: 2, teamA: ['a'], teamB: ['c'], score: { a: 0, b: 6 } },
    { teamAIdx: 2, teamBIdx: 1, teamA: ['c'], teamB: ['b'], score: { a: 6, b: 5 } },
  ];
  const st = leagueStandings(teams, ms);
  eq('2승 팀이 1위', st[0].idx, 2);
  eq('1위 득실차', st[0].diff, 7);
}
{
  const teams = [[P('a', 'a', 'M')], [P('b', 'b', 'M')]];
  const st = leagueStandings(teams, [
    { teamAIdx: 0, teamBIdx: 1, teamA: ['a'], teamB: ['b'], score: { a: 4, b: 4 } },
  ]);
  eq('무승부는 승도 패도 아니다', [st[0].wins, st[0].losses, st[0].draws], [0, 0, 1]);
}
eq('스코어가 없으면 아무것도 안 센다',
  leagueStandings(TEAMS4, matches).every((r) => r.played === 0), true);

section('개인 기록');
{
  const scored = matches.map((m) => ({ ...m, score: { a: 6, b: 4 } }));
  const stats = leaguePlayerStats(TEAMS4, scored);
  ok(stats.length === ROSTER.length, '전원이 목록에 있다');
  ok(stats.every((r) => !!r.team), '소속 팀이 붙어 있다');
  ok(stats[0].wins >= stats[stats.length - 1].wins, '승수 내림차순');
}

/* ============================================================
   수기 대진표
   ============================================================ */
section('수기 — 빈 표 만들기');
{
  const d = blankDraw({ courts: 3, rounds: 4 });
  eq('3면 × 4타임 = 12칸', d.length, 12);
  ok(d.every((m) => m.teamA.length === 0 && m.teamB.length === 0), '선수는 비어 있다');
  ok(d.every((m) => m.manual), '수기 표시가 붙는다');
  eq('타임은 1부터', Math.min(...d.map((m) => m.round)), 1);
  eq('코트는 1부터', Math.min(...d.map((m) => m.court)), 1);
  ok(new Set(d.map((m) => m.id)).size === d.length, 'id 가 겹치지 않는다');
  eq('0면은 1면으로', blankDraw({ courts: 0, rounds: 2 }).length, 2);
  eq('단식 표', blankDraw({ courts: 1, rounds: 1, singles: true })[0].type, '단식');
}

section('수기 — 자리 채우기');
{
  let m = blankDraw({ courts: 1, rounds: 1 })[0];
  m = toggleInSlot(m, 'A', 'p1');
  eq('한 명 들어감', m.teamA, ['p1']);
  m = toggleInSlot(m, 'A', 'p2');
  eq('두 명까지', m.teamA, ['p1', 'p2']);
  m = toggleInSlot(m, 'A', 'p3');
  eq('꽉 차면 먼저 넣은 사람이 밀린다', m.teamA, ['p2', 'p3']);
  m = toggleInSlot(m, 'A', 'p2');
  eq('다시 누르면 빠진다', m.teamA, ['p3']);
  m = toggleInSlot(m, 'B', 'q1');
  eq('상대 자리는 따로', m.teamB, ['q1']);
  eq('우리 자리는 그대로', m.teamA, ['p3']);
}
{
  let m = blankDraw({ courts: 1, rounds: 1, singles: true })[0];
  m = toggleInSlot(m, 'A', 'p1');
  m = toggleInSlot(m, 'A', 'p2');
  eq('단식은 한 명만', m.teamA, ['p2']);
}

section('수기 — 종류 자동 판별');
{
  const g = (id) => (id.startsWith('f') ? 'F' : 'M');
  const mk = (a, b) => ({ teamA: a, teamB: b });
  eq('남복', labelOf(mk(['m1', 'm2'], ['m3', 'm4']), g), '남복');
  eq('여복', labelOf(mk(['f1', 'f2'], ['f3', 'f4']), g), '여복');
  eq('혼복', labelOf(mk(['m1', 'f1'], ['m2', 'f2']), g), '혼복');
  eq('잡복', labelOf(mk(['m1', 'm2'], ['f1', 'f2']), g), '잡복');
  eq('남단식', labelOf(mk(['m1'], ['m2']), g), '남단식');
  eq('여단식', labelOf(mk(['f1'], ['f2']), g), '여단식');
  eq('혼성단식', labelOf(mk(['m1'], ['f1']), g), '혼성단식');
  eq('빈 칸은 이름 없음', labelOf(mk([], []), g), '');
  eq('덜 채운 칸은 이름 없음', labelOf(mk(['m1', 'm2'], ['m3']), g), '');
}

section('수기 — 같은 타임 중복 막기');
{
  const ms = [
    { id: 'a', round: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] },
    { id: 'b', round: 1, teamA: ['p5'], teamB: [] },
    { id: 'c', round: 2, teamA: ['p9'], teamB: [] },
  ];
  const busy = busyInRound(ms, 1, 'b');
  ok(busy.has('p1') && busy.has('p4'), '같은 타임 다른 코트 선수는 제외 대상');
  ok(!busy.has('p5'), '지금 고치는 칸의 선수는 제외하지 않는다');
  ok(!busy.has('p9'), '다른 타임은 상관없다');
}

section('수기 — 검토');
{
  const players = [P('p1', 'p1', 'M'), P('p2', 'p2', 'M'), P('p3', 'p3', 'F'), P('p4', 'p4', 'F'), P('p5', 'p5', 'M')];
  const ms = [
    { id: 'a', round: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] },
    { id: 'b', round: 1, teamA: ['p1'], teamB: [] },          // 덜 채움 + 중복
    { id: 'c', round: 2, teamA: [], teamB: [] },              // 아예 빈 칸
  ];
  const r = reviewDraw(players, ms);
  eq('안 쓰는 코트 1칸', r.empty, 1);
  eq('덜 채운 칸 1개', r.incomplete.length, 1);
  eq('같은 타임 중복 1건', r.dupes.length, 1);
  eq('중복된 사람', r.dupes[0].id, 'p1');
  eq('한 번도 안 뛴 사람', r.unused.map((p) => p.id), ['p5']);
  eq('최다 출전', r.max, 2);
  eq('최소 출전', r.min, 0);
}
{
  const players = [P('p1', 'p1', 'M'), P('p2', 'p2', 'M')];
  const r = reviewDraw(players, blankDraw({ courts: 1, rounds: 2 }));
  eq('전부 비면 지적할 것이 없다', [r.incomplete.length, r.dupes.length], [0, 0]);
  eq('아무도 안 뛴다', r.unused.length, 2);
}
eq('빈 입력에도 죽지 않는다', reviewDraw(null, null).dupes.length, 0);

console.log(`\n다팀 리그·수기 대진 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
