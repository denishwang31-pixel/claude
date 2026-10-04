import { readFileSync } from 'node:fs';
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
  teamLook, teamNamePresets, cleanTeamName, duplicateTeamNames,
  leagueFromRoster, BLUE_WHITE_RED, leagueBalanceNote, teamGameCounts,
  packLeague, unpackLeague, nestedArrayPath,
  moveToTeam, emptyTeams, resizeTeams, UNASSIGNED, withTeamIdx, twoTeamSide,
  actualMatchType, typeCounts, gridExtent,
  checkLeagueMatch, addLeagueMatch, updateLeagueMatch, removeLeagueMatch, matchToDraft, emptyDraft, sideSize,
} from '../src/lib/teamLeague.js';
import { guard, ALERT_GAP_MS } from '../src/lib/crashReport.js';
import {
  slotSize, blankDraw, labelOf, toggleInSlot, busyInRound, playCounts, reviewDraw,
  sameDraw, draftChanges,
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
/* 팀 수가 코트의 두 배 이상이면 규칙을 꺼도 팀이 갈라지지 않는다(남는 팀부터 쓰므로) */
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
  /* [한 팀은 한 타임에 한 코트만]을 켜면: 4팀 3면이면 한 면은 남는다 (팀 둘이 한 코트를 쓰므로 최대 2면) */
  const r = generateLeagueMatches(TEAMS4, { courts: 3, rounds: 1, roundTypes: { 1: 'MX' }, oneCourtPerTeam: true });
  eq('규칙 켬: 4팀 3면이면 2경기만', r.matches.length, 2);
  eq('규칙 켬: 남는 면은 사유와 함께', r.shortages.length, 1);
}
{
  /* 기본(규칙 끔): 코트를 다 채운다 — 남는 코트는 이미 붙은 두 팀이 한 번 더 */
  const r = generateLeagueMatches(TEAMS4, { courts: 3, rounds: 1, roundTypes: { 1: 'MX' } });
  eq('규칙 끔: 4팀 3면이면 3경기', r.matches.length, 3);
  const ids = r.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
  ok(ids.length === new Set(ids).size, '규칙 끔에도 한 사람이 두 코트에 서지 않는다');
  const pairs = r.matches.map((m) => [m.teamAIdx, m.teamBIdx].sort().join('-'));
  ok(new Set(pairs).size === 2, '세 번째 코트는 이미 붙은 두 팀 중 하나가 한 번 더(옆 코트에 모인다)', pairs.join(' '));
}
section('3팀 · 7면 — 쿤블던 모양 (한 타임에 두 팀이 코트를 다 씀)');
{
  const big = [];
  ['a', 'b', 'c'].forEach((t) => {
    for (let i = 0; i < 18; i += 1) big.push(P(`${t}m${i}`, `${t}m${i}`, 'M'));
    for (let i = 0; i < 10; i += 1) big.push(P(`${t}f${i}`, `${t}f${i}`, 'F'));
  });
  const T3 = [0, 1, 2].map((k) => big.filter((p) => p.id[0] === 'abc'[k]));
  const rt = {}; for (let r = 1; r <= 6; r += 1) rt[r] = 'MD';
  const r = generateLeagueMatches(T3, { courts: 7, rounds: 6, roundTypes: rt });
  eq('3팀 7면 6타임 남복 → 42경기 다 채움', r.matches.length, 42);
  eq('빈 칸 없음', r.shortages.length, 0);
  [...new Set(r.matches.map((m) => m.round))].forEach((rd) => {
    const inR = r.matches.filter((m) => m.round === rd);
    const ids = inR.flatMap((m) => [...m.teamA, ...m.teamB]);
    ok(ids.length === new Set(ids).size, `${rd}타임 — 사람은 겹치지 않는다`);
    ok(new Set(inR.map((m) => [m.teamAIdx, m.teamBIdx].sort().join('-'))).size === 1, `${rd}타임 — 한 조합이 7면을 다 쓴다(쉬는 팀 하나)`);
  });
  const meet = {}; r.matches.forEach((m) => { const k = [m.teamAIdx, m.teamBIdx].sort().join('-'); meet[k] = (meet[k] || 0) + 1; });
  eq('세 조합이 고르게 (14·14·14)', Object.values(meet).sort().join(), '14,14,14');
  ok(!diagnoseLeague(T3, { courts: 7, rounds: 6, roundTypes: rt }).problems.some((p) => p.includes('최대')), '규칙을 끄면 "최대 1면" 경고가 없다');
  ok(diagnoseLeague(T3, { courts: 7, rounds: 1, roundTypes: { 1: 'MD' }, oneCourtPerTeam: true }).problems[0].includes('1면'), '켜면 경고한다');
}

section('팀 이름 바꾸기 — 청팀·홍팀·백팀');
{
  eq('이름이 없으면 기본', teamLook(1, []).name, 'B팀');
  eq('이름을 넣으면 그 이름', teamLook(0, ['청팀']).name, '청팀');
  eq('청 → 파랑', teamLook(2, ['', '', '청팀']).color, LEAGUE_TEAM_STYLES[0].color);
  eq('홍 → 빨강', teamLook(0, ['홍팀']).color, LEAGUE_TEAM_STYLES[1].color);
  eq('백 → 회색', teamLook(0, ['백팀']).color, LEAGUE_TEAM_STYLES[7].color);
  eq('색 이름이 아니면 원래 색', teamLook(2, ['', '', '독수리']).color, LEAGUE_TEAM_STYLES[2].color);
  eq('공백 정리·길이 제한', cleanTeamName('  청   팀이라고하는아주긴이름  '), '청 팀이라고하는아주');
  ok(teamNamePresets(3).some((x) => x.join() === '청팀,백팀,홍팀') && teamNamePresets(3).some((x) => x.join() === '청팀,홍팀,백팀'), '3팀이면 청·백·홍 / 청·홍·백 묶음');
  eq('겹치는 이름을 찾는다', duplicateTeamNames(['청팀', '청팀', ''], 3), ['청팀']);
  eq('기본 이름과 겹쳐도 찾는다', duplicateTeamNames(['B팀', '', ''], 3), ['B팀']);
  const T3 = [[P('x1', 'x1', 'M'), P('x2', 'x2', 'M')], [P('y1', 'y1', 'M'), P('y2', 'y2', 'M')], [P('z1', 'z1', 'M'), P('z2', 'z2', 'M')]];
  const ms = [{ id: 'q', round: 1, court: 1, teamAIdx: 0, teamBIdx: 2, teamA: ['x1', 'x2'], teamB: ['z1', 'z2'], score: { a: 6, b: 2 } }];
  const names = ['청팀', '홍팀', '백팀'];
  eq('순위표에 바꾼 이름', leagueStandings(T3, ms, names)[0].name, '청팀');
  eq('MVP 표에 바꾼 팀 이름', leaguePlayerStats(T3, ms, names).find((r) => r.id === 'z1').team, '백팀');
  ok(diagnoseLeague(T3, { courts: 1, rounds: 1, roundTypes: { 1: 'WD' }, teamNames: names }).problems[0].includes('청팀'), '진단 문구도 바꾼 이름');
}

section('청백전 → 청·백·홍 3팀 — 세 팀이 고르게');
{
  const lg = leagueFromRoster(ROSTER, 3, { courts: 2, teamNames: BLUE_WHITE_RED });
  eq('세 팀', lg.teams.length, 3);
  eq('이름은 청·백·홍', [0, 1, 2].map((i) => teamLook(i, lg.config.teamNames).name), ['청팀', '백팀', '홍팀']);
  ok(lg.matches.length === 0 && lg.config.oneCourtPerTeam === false, '대진은 비어서 시작, 코트는 다 채우는 쪽');
  ok(Math.max(...lg.teams.map((t) => t.length)) - Math.min(...lg.teams.map((t) => t.length)) <= 1, '인원이 고르게 나뉜다');
  for (const [courts, rounds] of [[1, 3], [2, 6], [3, 9]]) {
    const r = generateLeagueMatches(lg.teams, { courts, rounds, roundTypes: {} });
    const per = teamGameCounts(3, r.matches);
    ok(Math.max(...per) === Math.min(...per), `${courts}면 ${rounds}타임 — 세 팀 경기 수가 같다`, per.join(','));
    const meet = {}; r.matches.forEach((m) => { const k = [m.teamAIdx, m.teamBIdx].sort().join('-'); meet[k] = (meet[k] || 0) + 1; });
    ok(Object.keys(meet).length === 3 && new Set(Object.values(meet)).size === 1, `${courts}면 ${rounds}타임 — 세 조합을 똑같이 만난다`, JSON.stringify(meet));
  }
  eq('3의 배수면 안내 없음', leagueBalanceNote(3, 6), '');
  ok(leagueBalanceNote(3, 4).includes('6타임'), '아니면 가까운 3의 배수를 권한다');
  eq('3팀이 아니면 안내 없음', leagueBalanceNote(4, 5), '');
  eq('팀별 경기 수 세기', teamGameCounts(3, [{ teamAIdx: 0, teamBIdx: 2 }, { teamAIdx: 0, teamBIdx: 1 }]), [2, 1, 1]);
}

section('Firestore 에 저장되는 모양 — 배열 안에 배열 금지');
{
  /* 2026-10-03: teams = [[선수…]] 를 그대로 저장해 매번 거부됐다(3팀 청백전 개설 실패 · 2팀→3팀에서 앱 꺼짐) */
  const lg = leagueFromRoster(ROSTER, 3, { courts: 2, teamNames: BLUE_WHITE_RED });
  lg.matches = generateLeagueMatches(lg.teams, { courts: 2, rounds: 3 }).matches;
  ok(nestedArrayPath(lg) === 'teams[0]', '화면용 모양은 배열 안 배열(그대로 저장하면 안 됨)');
  eq('저장용(pack)에는 배열 안 배열이 없다', nestedArrayPath(packLeague(lg)), '');
  eq('pack → unpack 하면 그대로', JSON.stringify(unpackLeague(packLeague(lg))), JSON.stringify(lg));
  eq('예전 모양(배열의 배열)도 읽는다', unpackLeague({ teams: [[{ id: 'a' }]] }).teams[0][0].id, 'a');
  eq('null 은 그대로', packLeague(null), null);
  const scr = readFileSync(new URL('../src/components/TeamLeagueScreen.jsx', import.meta.url), 'utf8');
  ok(/onSave\?\.\(packLeague\(/.test(scr) && /unpackLeague\(savedRaw\)/.test(scr), '팀 리그 화면은 pack 해서 저장하고 unpack 해서 읽는다');
  ok(/r\.catch\(/.test(scr) && /catch \(e\) \{\s*flash\('저장하지 못했습니다/.test(scr), '저장 실패는 알리기만 — 버튼 처리 안에서 터져 앱이 꺼지지 않게');
  const ts = readFileSync(new URL('../src/components/TournamentScreen.jsx', import.meta.url), 'utf8');
  ok((ts.match(/packLeague\(leagueFromRoster/g) || []).length === 2 && /packLeague\(t\.league\)/.test(ts), '3팀 개설·2→3팀 전환도 pack 해서 저장');
  ok(!/\n      addTournament\(clubId/.test(ts) && /await createInner\(\)/.test(ts), '대회 개설은 저장이 끝난 뒤에 "개설됐다"고 알리고, 실패는 잡는다');
}

section('팀 편성 — 자동/수동 배치 · 여러 명 한꺼번에 옮기기');
{
  /* 2026-10-03 앱 주인: 백팀에서 여럿 골라 청팀이나 홍팀으로 한 번에 */
  const T = [
    [P('a1', '청1', 'M'), P('a2', '청2', 'F')],
    [P('b1', '백1', 'M'), P('b2', '백2', 'F'), P('b3', '백3', 'M')],
    [P('c1', '홍1', 'M')],
  ];
  const ids = (t) => t.map((p) => p.id).join(',');
  let r = moveToTeam(T, [], ['b1', 'b3'], 2);
  eq('백팀 둘을 홍팀으로', ids(r.teams[2]), 'c1,b1,b3');
  eq('백팀에는 나머지만', ids(r.teams[1]), 'b2');
  eq('옮긴 수', r.moved, 2);
  ok(T[1].length === 3, '원래 편성은 건드리지 않는다');
  r = moveToTeam(T, [], ['a1', 'b2', 'c1'], 0);
  eq('여러 팀에서 고른 사람도 한 번에 — 이미 그 팀인 사람은 자리 그대로', ids(r.teams[0]), 'a1,a2,b2,c1');
  eq('이미 그 팀인 사람은 옮긴 수에서 빠진다', r.moved, 2);
  r = moveToTeam(T, [], ['b1', 'b2'], UNASSIGNED);
  eq('미배정으로', ids(r.unassigned), 'b1,b2');
  r = moveToTeam(r.teams, r.unassigned, ['b2'], 0);
  eq('미배정에서 팀으로', `${ids(r.teams[0])}|${ids(r.unassigned)}`, 'a1,a2,b2|b1');
  eq('없는 팀이면 아무것도 안 바뀐다', moveToTeam(T, [], ['a1'], 5).moved, 0);
  const count = (x) => x.teams.flat().length + x.unassigned.length;
  eq('옮겨도 사람 수는 그대로', count(moveToTeam(T, [], ['a1', 'b1', 'c1'], 1)), 6);

  const e = emptyTeams(ROSTER, 3);
  ok(e.teams.length === 3 && e.teams.every((t) => !t.length) && e.unassigned.length === ROSTER.length, '수동 배치는 빈 3팀 + 모두 미배정');
  const z = resizeTeams(T, [], 2);
  eq('팀을 줄이면 없어진 팀 사람은 미배정으로', `${z.teams.length}|${ids(z.unassigned)}|${z.dropped}`, '2|c1|1');
  const g = resizeTeams(T, [], 4);
  ok(g.teams.length === 4 && !g.teams[3].length && ids(g.teams[1]) === 'b1,b2,b3', '팀을 늘리면 빈 팀이 붙고 나머지는 그대로');

  const lg = packLeague({ teams: e.teams, unassigned: e.unassigned, matches: [], config: { placement: 'manual' } });
  eq('미배정 명단이 있어도 저장 모양에 배열 안 배열이 없다', nestedArrayPath(lg), '');
  eq('pack → unpack 해도 미배정은 그대로', unpackLeague(lg).unassigned.length, ROSTER.length);

  const scr = readFileSync(new URL('../src/components/TeamLeagueScreen.jsx', import.meta.url), 'utf8');
  ok(/unassigned: next\.unassigned \?\? unassigned/.test(scr), '저장할 때 미배정 명단도 함께');
  ok(/자동 배치/.test(scr) && /수동 배치/.test(scr) && /moveToTeam\(teams, unassigned, picked, to\)/.test(scr), '화면: 배치 방식 두 가지 + 고른 사람 한꺼번에 옮기기');
  const tm = readFileSync(new URL('../src/components/TeamMatchScreen.jsx', import.meta.url), 'utf8');
  ok(/자동 배치/.test(tm) && /수동 배치/.test(tm) && /moveToTeam\(\[teamA, teamB\], unassigned, picked, to\)/.test(tm), '2팀 청백전도 같은 방식(자동/수동 · 여러 명 옮기기)');
  ok(/unassigned: next\.unassigned \?\? unassigned/.test(tm) && /r\.catch\(/.test(tm), '2팀 화면도 옮길 때마다 저장 · 실패는 알리기만');
  const r2 = moveToTeam([[P('a', '청', 'M')], [P('b', '백1', 'M'), P('c', '백2', 'F')]], [], ['b', 'c'], 0);
  eq('2팀: 백팀 둘을 청팀으로', `${ids(r2.teams[0])}|${r2.teams[1].length}`, 'a,b,c|0');
}

section('청백전 · 팀 리그 코트 이름');
{
  /* 2026-10-04 앱 주인: 청백전·팀 리그도 코트 이름(A·B…)으로 */
  const T = [[P('a1', '가1', 'M'), P('a2', '가2', 'F')], [P('b1', '나1', 'M'), P('b2', '나2', 'F')], [P('c1', '다1', 'M'), P('c2', '다2', 'F')]];
  const d = { round: 1, court: 2, typeKey: 'MX', teamAIdx: 0, teamBIdx: 1, teamA: ['a1', 'a2'], teamB: ['b1', 'b2'] };
  const ms = addLeagueMatch(T, [], d, 'm1').matches;
  const clash = { ...d, teamAIdx: 2, teamA: ['c1', 'c2'], teamB: ['b1', 'b2'] };
  eq('이름을 주면 겹침 안내도 그 이름으로', addLeagueMatch(T, ms, clash, undefined, { courtName: (c) => ['A', 'B'][c - 1] }).error, '1타임 코트 B에는 이미 경기가 있습니다');
  eq('이름을 안 주면 예전 그대로', addLeagueMatch(T, ms, clash).error, '1타임 코트2에는 이미 경기가 있습니다');
  eq('고칠 때도 이름으로', updateLeagueMatch(T, [...ms, { ...ms[0], id: 'm2', round: 2 }], 'm2', clash, { courtName: () => '9' }).error, '1타임 코트 9에는 이미 경기가 있습니다');
  const read = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8');
  for (const f of ['TeamLeagueScreen.jsx', 'TeamMatchScreen.jsx']) {
    const src = read(f);
    ok(/<CourtNamesEditor /.test(src) && /venue=\{venue\}/.test(src), `${f}: 코트 이름 칸 + 표에 이름으로`);
    ok(!/코트\$\{m\.court\}/.test(src), `${f}: 안내 문구에 코트 번호를 그대로 쓰지 않는다`);
  }
  const ts = read('TournamentScreen.jsx');
  eq('대회 문서 courtNames 를 2팀·3팀 화면 둘 다에 넘긴다', (ts.match(/onSaveCourtNames=\{\(names\) => updateTournament\(clubId, t\.id, \{ courtNames: names \}\)\}/g) || []).length, 2);
  ok(/courtName\(c\)/.test(read('LeagueMatchEditor.jsx')), '경기 추가·고치기 화면의 코트도 이름으로 고른다');
}

section('버튼 처리 오류가 앱을 끄지 않는다 · 알림창 안에서 알림창 금지');
{
  /* 2026-10-04: 3팀 청백전 [대진 다시 작성] → 확인 창 안에서 '못 채운 코트' 창을 또 열다 앱이 꺼졌다 */
  let failed = 0;
  const g = guard(() => { throw new Error('x'); }, 'test', () => { failed += 1; });
  ok(g() === undefined && failed === 1, 'guard: 안에서 오류가 나도 밖으로 던지지 않고 알린다');
  eq('guard: 정상이면 값을 그대로', guard((a) => a * 2, 'test')(21), 42);
  await guard(async () => { throw new Error('y'); }, 'test', () => { failed += 1; })();
  await new Promise((r) => setTimeout(r, 0));
  eq('guard: 비동기 실패도 알린다', failed, 2);
  ok(ALERT_GAP_MS >= 250, '다음 창은 앞 창이 닫힐 틈을 두고');
  const read = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8');
  const lg = read('TeamLeagueScreen.jsx');
  ok(!/Alert\.alert\('일부 코트를 채우지 못했습니다'/.test(lg) && /못 채운 코트가 있습니다/.test(lg), '못 채운 코트는 창이 아니라 화면에');
  ok(/later\(runGenerate, /.test(lg) && !/onPress: runGenerate/.test(lg) && !/onPress: confirmRedo/.test(lg), '확인 창 버튼에서 대진 짜기는 한 박자 뒤에');
  ok(!/sheet\.open\(/.test(lg), '선택 시트를 거쳐 다른 창을 여는 길이 없다(경기를 누르면 창 하나만)');
  const tm = read('TeamMatchScreen.jsx');
  ok(/const gen = guard\(/.test(tm) && /later\(run, /.test(tm), '2팀 화면도 같은 보호');
  const ce = read('CourtNamesEditor.jsx');
  ok(/onBlur=\{save\}/.test(ce) && /prevSaved/.test(ce), '코트 이름: 칸에서 벗어나면 저장, 옆 칸 입력은 지우지 않는다');
  const cr = readFileSync(new URL('../src/lib/crashReport.js', import.meta.url), 'utf8');
  ok(/export async function checkLastRun/.test(cr) && /where: 'last-run'/.test(cr) && /\.slice\(-1990\)/.test(cr), '갑자기 꺼짐: 다음에 켤 때 마지막 화면·동작을 남긴다(넘치면 최근 것을 남김)');
  const lay = readFileSync(new URL('../app/_layout.jsx', import.meta.url), 'utf8');
  ok(/checkLastRun\(\)/.test(lay) && /st === 'background'\) markCleanExit\(\)/.test(lay), '뒤로 가면 정상 종료로 적어 둔다');
  for (const f of ['src/components/UpdateBanner.jsx', 'src/components/UpdateStatus.jsx', 'app/login.jsx', 'app/_layout.jsx']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    ok(!/reloadAsync\(\)/.test(src) || /markCleanExit\(\)/.test(src), `${f}: 업데이트 적용(다시 시작)은 갑자기 꺼짐으로 세지 않는다`);
  }

  ok(/reportCrash\(error, \{ where: 'global' \}\)\.then\(once, once\)/.test(cr) && /setTimeout\(once, 2000\)/.test(cr), '앱이 꺼지기 전에 기록이 서버에 닿을 틈(최대 2초)');
}

section('자동으로 짠 뒤 손보기 · 대진 삭제 (2팀·3팀)');
{
  /* 2026-10-04 앱 주인: 자동 작성 뒤 수기 조정이 안 된다 · 대진 삭제 버튼이 있어야 */
  const m2 = [{ id: 'tm-1-1', round: 1, court: 1, team: true, type: '남복', teamA: ['a1', 'a2'], teamB: ['b1', 'b2'], score: { a: 6, b: 4 } }];
  const w = withTeamIdx(m2)[0];
  ok(w.teamAIdx === 0 && w.teamBIdx === 1 && w.typeKey === 'MD', '2팀 경기에 팀 번호·유형 키를 붙인다(청 0 · 백 1)');
  eq('잡복은 혼복 키로', withTeamIdx([{ ...m2[0], type: '잡복' }])[0].typeKey, 'MX');
  const sw = twoTeamSide({ ...w, teamAIdx: 1, teamBIdx: 0, teamA: ['b1', 'b2'], teamB: ['a1', 'a2'], score: { a: 4, b: 6 } });
  ok(sw.teamA[0] === 'a1' && sw.teamAIdx === 0 && sw.score.a === 6 && sw.team, '저장할 때 청팀이 늘 왼쪽(점수도 같이 뒤집는다)');
  ok(twoTeamSide(w).teamA[0] === 'a1', '이미 청팀이 왼쪽이면 그대로');
  const T2 = [[P('a1', '청1', 'M'), P('a2', '청2', 'M'), P('a3', '청3', 'F')], [P('b1', '백1', 'M'), P('b2', '백2', 'M'), P('b3', '백3', 'F')]];
  const r = updateLeagueMatch(T2, withTeamIdx(m2), 'tm-1-1', { round: 2, court: 1, typeKey: 'MD', teamAIdx: 0, teamBIdx: 1, teamA: ['a1', 'a2'], teamB: ['b1', 'b2'] });
  ok(!r.error && r.matches[0].round === 2 && r.matches[0].score?.a === 6, '2팀 경기도 같은 고치기로 — 타임만 바꾸면 점수 그대로');
  const read = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8');
  for (const f of ['TeamLeagueScreen.jsx', 'TeamMatchScreen.jsx']) {
    const src = read(f);
    ok(/<BoardModeBar mode=\{mode\}/.test(src) && /onPressMatch=\{onPressMatch\}/.test(src), `${f}: 대진표 위 [결과 입력]·[대진표 수정] → 경기를 누르면 그 일`);
    ok(/mode === BOARD_MODE\.EDIT\) \{/.test(src) && /mode === BOARD_MODE\.SCORE\) \{/.test(src), `${f}: 고른 버튼에 따라 고치기 화면 / 점수 창`);
    ok(/const clearAll = \(\) => Alert\.alert\('대진을 모두 지울까요\?'/.test(src) && /onClearAll=\{clearAll\}/.test(src), `${f}: 대진 삭제(확인 후)`);
    ok(!/useOptionSheet/.test(src), `${f}: 점수·고치기·삭제가 섞인 메뉴는 없앴다`);
  }
  ok(/sideOf=\{\(m, side\) => look\(side === 'A' \? m\.teamAIdx : m\.teamBIdx\)\}/.test(read('TeamLeagueScreen.jsx')), '3팀 대진표 칸마다 팀 꼬리표(청·백·홍)');
  ok(/sideOf=\{\(m, side\) => \(side === 'A'/.test(read('TeamMatchScreen.jsx')), '2팀 대진표 칸마다 팀 꼬리표(청·백)');
  ok(/function SideTag/.test(read('MatchGrid.jsx')) && /sideOf = null/.test(read('MatchGrid.jsx')), '꼬리표는 sideOf 를 줄 때만 — 다른 대진표는 그대로');
  ok(!/어느 팀끼리 붙는 경기인지/.test(read('TeamLeagueScreen.jsx')), '타임별 팀 조합 카드는 없앴다 — 대진표 꼬리표·출전 현황과 겹친다');
  ok(/if \(!open \|\| !d\) return <Modal visible=\{false\}/.test(read('LeagueMatchEditor.jsx')) && /if \(!target\) return <Modal visible=\{false\}/.test(read('MatchBoard.jsx')),
    '창은 없애지 않고 visible 만 끈다(안드로이드에서 하얀 껍데기가 남지 않게)');
  ok(/groups = null/.test(read('MatchGrid.jsx')) && /groups=\{teams\.map\(/.test(read('TeamLeagueScreen.jsx')) && /groups=\{\[/.test(read('TeamMatchScreen.jsx')),
    '타임별 출전 현황: 팀별로 묶어(팀 이름 머리줄) 보여 준다');
  const mb = read('MatchBoard.jsx');
  ok(/'결과 입력'/.test(mb) && /'대진표 수정'/.test(mb) && /대진 삭제/.test(mb) && /경기 추가/.test(mb), '버튼 줄: 결과 입력 · 대진표 수정(+ 경기 추가 · 대진 삭제)');
  ok(/<LeagueMatchEditor/.test(read('TeamMatchScreen.jsx')) && /twoTeamSide/.test(read('TeamMatchScreen.jsx')), '2팀 청백전에도 경기 고치기 화면');
}

section('실제 편성 기준 유형 · 빈칸 유지 · 골라서 삭제 · 접기 · 출전 현황');
{
  /* 2026-10-04 앱 주인 */
  const G = { m1: 'M', m2: 'M', m3: 'M', m4: 'M', f1: 'F', f2: 'F', f3: 'F', f4: 'F' };
  const g = (id) => G[id];
  eq('남자 넷이면 남복', actualMatchType({ teamA: ['m1', 'm2'], teamB: ['m3', 'm4'] }, g), '남복');
  eq('여자 넷이면 여복', actualMatchType({ teamA: ['f1', 'f2'], teamB: ['f3', 'f4'] }, g), '여복');
  eq('양쪽 다 남녀 한 쌍이면 혼복', actualMatchType({ teamA: ['m1', 'f1'], teamB: ['m2', 'f2'] }, g), '혼복');
  eq('설정이 혼복이어도 실제가 남남 vs 남녀면 잡복', actualMatchType({ type: '혼복', teamA: ['m1', 'm2'], teamB: ['m3', 'f1'] }, g), '잡복');
  eq('단식', actualMatchType({ teamA: ['m1'], teamB: ['f1'] }, g), '혼성단식');
  const tc = typeCounts([{ type: '혼복' }, { type: '남복' }, { type: '혼복' }]);
  eq('유형별 경기 수(남복 먼저)', `${tc.total}|${tc.order.join(',')}|${tc.by['혼복']}`, '3|남복,혼복|2');
  eq('표 크기: 설정과 실제 중 큰 쪽 — 지워도 줄·칸이 남는다', JSON.stringify(gridExtent([{ round: 2, court: 1 }], { rounds: 6, courts: 2 })), '{"rounds":6,"courts":2}');
  eq('설정보다 큰 번호의 경기가 있으면 거기까지', JSON.stringify(gridExtent([{ round: 9, court: 3 }], { rounds: 6, courts: 2 })), '{"rounds":9,"courts":3}');
  const read = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8');
  const mg = read('MatchGrid.jsx');
  ok(/roundCount = 0, courtCount = 0, onPressEmpty, selected = null/.test(mg) && /＋ 경기 넣기/.test(mg), '대진표: 정한 타임·코트를 다 그리고 빈칸을 누르면 경기 넣기');
  ok(/typeOf = null, tagOf = null, roundCount = 0/.test(mg) && /전체 경기/.test(mg), '출전 현황: 유형별 칸 + 맨 아래 전체 합계');
  ok(/골라서 삭제/.test(read('MatchBoard.jsx')) && /export function Fold/.test(read('MatchBoard.jsx')), '골라서 삭제 · 접는 구역');
  for (const f of ['TeamLeagueScreen.jsx', 'TeamMatchScreen.jsx']) {
    const src = read(f);
    ok(/actualMatchType\(m, genderOf\)/.test(src) && /matches=\{shown\}/.test(src), `${f}: 대진표 유형은 실제 편성 기준`);
    ok(/const deletePicked = /.test(src) && /onDeletePicked=\{deletePicked\}/.test(src) && /matches\.length > 0 \|\| mode === BOARD_MODE\.EDIT/.test(src), `${f}: 골라서 삭제, 다 지워도 수정 중엔 표가 남는다`);
    ok((src.match(/<Fold title=/g) || []).length >= 4 && /<AttendanceGrid/.test(src), `${f}: 팀 편성 설정·배치 현황·대진 설정·출전 현황 접기`);
  }
}

section('손으로 넣기 · 고치기 · 지우기');
{
  const T = [
    [P('a1', '가1', 'M'), P('a2', '가2', 'F'), P('a3', '가3', 'M'), P('a4', '가4', 'F')],
    [P('b1', '나1', 'M'), P('b2', '나2', 'F'), P('b3', '나3', 'M'), P('b4', '나4', 'F')],
    [P('c1', '다1', 'M'), P('c2', '다2', 'F')],
  ];
  const d1 = { round: 1, court: 1, typeKey: 'MX', teamAIdx: 0, teamBIdx: 1, teamA: ['a1', 'a2'], teamB: ['b1', 'b2'] };
  let r = addLeagueMatch(T, [], d1, 'm1');
  ok(!r.error && r.matches.length === 1 && r.matches[0].manual && r.matches[0].type === '혼복', '혼복 한 경기 넣기');
  let ms = r.matches;
  eq('같은 칸(1타임 코트1)은 막는다', addLeagueMatch(T, ms, { ...d1, teamAIdx: 0, teamBIdx: 2, teamA: ['a3', 'a4'], teamB: ['c1', 'c2'] }).error, '1타임 코트1에는 이미 경기가 있습니다');
  ok(/다른 코트 경기가 있습니다/.test(addLeagueMatch(T, ms, { ...d1, court: 2, teamA: ['a1', 'a4'], teamB: ['b3', 'b4'] }).error), '같은 타임에 같은 사람은 막는다');
  r = addLeagueMatch(T, ms, { round: 1, court: 2, typeKey: 'MX', teamAIdx: 0, teamBIdx: 1, teamA: ['a3', 'a4'], teamB: ['b3', 'b4'] }, 'm2');
  ok(!r.error && r.matches.length === 2, '같은 타임에 같은 두 팀이 다른 코트 — 된다');
  ms = r.matches;
  eq('양쪽 인원', addLeagueMatch(T, ms, { round: 2, court: 1, typeKey: 'MD', teamAIdx: 0, teamBIdx: 1, teamA: ['a1'], teamB: ['b1', 'b3'] }).error, '양쪽에 2명씩 고르세요');
  eq('같은 팀끼리는 막는다', addLeagueMatch(T, ms, { round: 2, court: 1, typeKey: 'MX', teamAIdx: 1, teamBIdx: 1, teamA: ['b1', 'b2'], teamB: ['b3', 'b4'] }).error, '서로 다른 두 팀을 고르세요');
  eq('다른 팀 선수는 못 넣는다', addLeagueMatch(T, ms, { round: 2, court: 1, typeKey: 'MX', teamAIdx: 0, teamBIdx: 1, teamA: ['a1', 'b2'], teamB: ['b1', 'b4'] }).error, '선수는 자기 팀에서만 고를 수 있습니다');
  const w = addLeagueMatch(T, ms, { round: 2, court: 1, typeKey: 'MD', teamAIdx: 0, teamBIdx: 1, teamA: ['a1', 'a2'], teamB: ['b1', 'b3'] }, 'm3');
  ok(!w.error && w.warnings.length === 1, '남복에 여자가 섞이면 경고만 하고 넣는다(잡복도 손으로는 가능)');
  ok(addLeagueMatch(T, ms, { round: 2, court: 1, typeKey: 'SG', teamAIdx: 0, teamBIdx: 2, teamA: ['a1'], teamB: ['c1'] }).matches.length === 3 && sideSize('SG') === 1, '단식은 한 명씩');

  ms = ms.map((m) => (m.id === 'm1' ? { ...m, score: { a: 6, b: 4 } } : m));
  let u = updateLeagueMatch(T, ms, 'm1', { ...matchToDraft(ms[0]), court: 3 });
  ok(!u.error && u.matches.find((m) => m.id === 'm1').court === 3 && u.matches.find((m) => m.id === 'm1').score?.a === 6 && !u.scoreCleared, '코트만 옮기면 점수는 그대로');
  u = updateLeagueMatch(T, ms, 'm1', { ...matchToDraft(ms[0]), teamA: ['a1', 'a4'] });
  ok(/다른 코트 경기/.test(u.error || ''), '고칠 때도 같은 타임 겹침은 막는다(a4 는 코트2)');
  u = updateLeagueMatch(T, ms, 'm1', { ...matchToDraft(ms[0]), round: 3, teamA: ['a1', 'a4'] });
  ok(!u.error && u.scoreCleared && u.matches.find((m) => m.id === 'm1').score === null, '선수가 바뀌면 점수는 지운다');
  ok(updateLeagueMatch(T, ms, 'm1', matchToDraft(ms[0])).matches.length === 2, '자기 자신과는 겹침을 따지지 않는다');
  eq('지우기', removeLeagueMatch(ms, 'm2').map((m) => m.id), ['m1']);
  const e = emptyDraft(ms, { courts: 2, rounds: 3 }, 3);
  ok(e.round === 2 && e.court === 1, '새 경기는 비어 있는 첫 칸(2타임 코트1)에서 시작');
  ok(checkLeagueMatch(T, ms, { ...d1, round: 0 }).error === '타임을 고르세요', '타임 없으면 막는다');
}
eq('팀이 하나면 아무것도 안 나온다',
  generateLeagueMatches([[P('a', 'a', 'M')]], { courts: 1, rounds: 1 }).matches.length, 0);

section('사전 진단');
ok(diagnoseLeague(TEAMS4, cfg).ok, '충분하면 문제 없음');
{
  const d = diagnoseLeague(TEAMS4, { courts: 4, rounds: 1, roundTypes: { 1: 'MX' }, oneCourtPerTeam: true });
  ok(!d.ok, '[한 팀 한 코트]를 켰을 때 4팀에 4면은 과하다고 짚는다');
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

/* ---------- 저장 전 표 비교 ----------
   수기 편집은 [저장하기]를 눌러야 반영된다. 그러려면 "저장 안 한 것이
   있는가"를 알아야 하는데, 이걸 틀리면 두 방향 모두 나쁘다.
     · 바뀐 걸 안 바뀌었다고 보면 → 경고 없이 나가서 고친 게 날아간다
     · 안 바뀐 걸 바뀌었다고 보면 → 아무것도 안 했는데 자꾸 경고가 뜬다
   두 번째가 더 흔하고, 그게 쌓이면 사람들이 경고를 안 읽게 된다.       */
section('저장 전 표 비교');
{
  const base = () => [
    { id: 'r1c1', round: 1, court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'], type: '남복' },
    { id: 'r1c2', round: 1, court: 2, teamA: [], teamB: [], type: '' },
  ];
  ok(sameDraw(base(), base()), '내용이 같으면 같다 (다른 객체여도)');
  eq('같으면 고친 칸이 0', draftChanges(base(), base()), 0);

  const one = base(); one[0].teamA = ['a', 'z'];
  ok(!sameDraw(one, base()), '사람이 바뀌면 다르다');
  eq('한 칸만 고치면 1', draftChanges(one, base()), 1);

  /* ⚠️ 앞/뒤 팀이 바뀌면 코트에 서는 자리가 달라진다. 같은 사람들이라고
        같은 대진으로 보면, 팀을 맞바꾼 편집이 저장 없이 사라진다. */
  const swapped = base();
  swapped[0] = { ...swapped[0], teamA: ['c', 'd'], teamB: ['a', 'b'] };
  ok(!sameDraw(swapped, base()), '앞팀·뒷팀을 맞바꾸면 다르다');

  /* 팀 안에서의 순서도 자리다 — 파트너 순서가 바뀌면 다른 표로 본다 */
  const reordered = base();
  reordered[0] = { ...reordered[0], teamA: ['b', 'a'] };
  ok(!sameDraw(reordered, base()), '팀 안의 순서가 바뀌어도 다르다');

  /* 고쳤다가 도로 되돌린 경우. 플래그를 들고 다니면 여기서 틀린다 */
  const undone = base();
  undone[0] = { ...undone[0], teamA: ['a', 'z'] };
  undone[0] = { ...undone[0], teamA: ['a', 'b'] };
  ok(sameDraw(undone, base()), '고쳤다 되돌리면 다시 같다');
  eq('되돌리면 고친 칸도 0', draftChanges(undone, base()), 0);

  /* 스코어가 들어간 칸 */
  const scored = base();
  scored[0] = { ...scored[0], score: { a: 6, b: 3 } };
  ok(!sameDraw(scored, base()), '스코어가 붙으면 다르다');

  /* 칸 수가 달라지는 경우 — 빈 표를 새로 만들면 id 가 통째로 갈린다 */
  ok(!sameDraw(base().slice(0, 1), base()), '칸 수가 다르면 다르다');
  eq('없어진 칸도 고친 것으로 센다', draftChanges(base().slice(0, 1), base()), 1);

  ok(sameDraw([], []), '둘 다 비면 같다');
  ok(sameDraw(null, []), '빈 값과 빈 배열은 같다');
  eq('빈 입력에도 죽지 않는다 (비교)', draftChanges(null, null), 0);
}

console.log(`\n다팀 리그·수기 대진 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
