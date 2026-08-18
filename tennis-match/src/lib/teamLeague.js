/* ============================================================
   다팀 리그 — 팀을 3개 이상 만들어 돌려가며 붙는다

   청백전은 두 팀뿐이라 "우리 편 아니면 상대"로 끝난다. 그런데 인원이
   20명을 넘어가면 두 팀으로는 한 팀이 10명이 되고, 그러면 한 사람이
   뛰는 시간보다 기다리는 시간이 길어진다. 그래서 실제 동호회는 대회를
   할 때 4~6명씩 여러 팀으로 나누고 팀끼리 돌려가며 붙인다.

   여기서 하는 일
     1. 참가자를 N개 팀으로 실력·성비가 고르게 가른다
     2. 팀끼리 골고루 만나도록 대진을 짠다
     3. 팀 점수를 합산해 순위를 낸다

   대진을 짤 때 지키는 것
     · 한 타임에 같은 사람이 두 코트에 들어가지 않는다
     · 한 타임에 같은 팀이 두 코트에 들어가지 않는다
       (팀원이 갈라져 서로 다른 코트에 있으면 응원도 교대도 안 된다)
     · 아직 안 만난 팀끼리 먼저 붙인다 — 특정 두 팀만 계속 만나면
       리그가 아니라 그냥 연습 경기가 된다
     · 팀 안에서 출전 횟수를 고르게

   순위는 승점(경기 승) → 게임 득실 → 총 득점 순.
   승점만으로 가르면 동점이 너무 자주 나와서 결국 사람이 눈치로 정하게 된다.
   ============================================================ */

import { TEAM_ROUND_TYPES, teamRoundType } from './teamMatch.js';

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;

/** 팀 이름·색 — 8팀까지 준비해 둔다 */
export const LEAGUE_TEAM_STYLES = [
  { name: 'A팀', color: '#1d4ed8', bg: '#eff6ff' },
  { name: 'B팀', color: '#be123c', bg: '#fff1f2' },
  { name: 'C팀', color: '#0d7a5f', bg: '#e7f6f1' },
  { name: 'D팀', color: '#b45309', bg: '#fffbeb' },
  { name: 'E팀', color: '#6d28d9', bg: '#f5f3ff' },
  { name: 'F팀', color: '#0f766e', bg: '#f0fdfa' },
  { name: 'G팀', color: '#a21caf', bg: '#fdf4ff' },
  { name: 'H팀', color: '#475569', bg: '#f8fafc' },
];

export const teamStyle = (i) => LEAGUE_TEAM_STYLES[i % LEAGUE_TEAM_STYLES.length];

const skillOf = (p, busuToNtrp) => {
  if (typeof p.ntrp === 'number' && p.ntrp > 0) return p.ntrp;
  const fromBusu = busuToNtrp ? busuToNtrp(p.busu) : null;
  if (fromBusu) return fromBusu;
  return ({ A: 4.0, B: 3.5, C: 3.0, D: 2.5 })[p.grade] || 3.0;
};

/**
 * 참가자를 N개 팀으로 가른다.
 *
 * 뱀 순서(0,1,2,3,3,2,1,0)로 담는다. 실력 순으로 그냥 잘라 담으면
 * 1팀이 전부 고수가 되어 리그가 첫 경기에 끝난다.
 * 남녀를 따로 돌려서 성비까지 같이 맞춘다 — 한 팀만 여자가 없으면
 * 혼복 타임에 그 팀이 아예 못 나온다.
 */
export function splitIntoTeams(players, teamCount, { busuToNtrp } = {}) {
  const n = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.round(Number(teamCount) || 2)));
  const teams = Array.from({ length: n }, () => []);
  if (!players?.length) return teams;

  const bySex = { M: [], F: [] };
  players.forEach((p) => bySex[p.gender === 'F' ? 'F' : 'M'].push(p));

  let cursor = 0;   // 성별을 넘겨도 이어서 담아야 인원이 고르다
  Object.values(bySex).forEach((group) => {
    const sorted = [...group].sort((a, b) => skillOf(b, busuToNtrp) - skillOf(a, busuToNtrp));
    sorted.forEach((p) => {
      const lap = Math.floor(cursor / n);
      const pos = cursor % n;
      teams[lap % 2 === 0 ? pos : n - 1 - pos].push(p);
      cursor += 1;
    });
  });
  return teams;
}

/** 팀 평균 실력 — 편성이 고른지 화면에서 보여줄 때 */
export function teamAverage(team, { busuToNtrp } = {}) {
  if (!team?.length) return 0;
  const sum = team.reduce((s, p) => s + skillOf(p, busuToNtrp), 0);
  return Math.round((sum / team.length) * 100) / 100;
}

/** 팀 구성 요약 — "6명 (남4 여2)" */
export const teamComposition = (team) => ({
  total: team.length,
  male: team.filter((p) => p.gender !== 'F').length,
  female: team.filter((p) => p.gender === 'F').length,
});

/** 모든 팀 조합 (0-1, 0-2, 1-2 …) */
export function allPairings(teamCount) {
  const out = [];
  for (let i = 0; i < teamCount; i += 1) {
    for (let j = i + 1; j < teamCount; j += 1) out.push([i, j]);
  }
  return out;
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 한 팀에서 이 유형에 맞는 사람 뽑기 (teamMatch 와 같은 규칙) */
function pickFromTeam(team, type, played, busy) {
  const avail = team.filter((p) => !busy.has(p.id));
  if (type.singles) {
    if (!avail.length) return null;
    return [[...avail].sort((a, b) => played[a.id] - played[b.id])[0]];
  }
  const need = type.need;
  const men = avail.filter((p) => p.gender !== 'F').sort((a, b) => played[a.id] - played[b.id]);
  const women = avail.filter((p) => p.gender === 'F').sort((a, b) => played[a.id] - played[b.id]);
  if (men.length < need.M || women.length < need.F) return null;
  return [...men.slice(0, need.M), ...women.slice(0, need.F)];
}

/**
 * 리그 대진 생성.
 *
 * @param teams      [[player…], [player…], …]
 * @param courts     동시에 쓰는 코트 수
 * @param rounds     타임 수
 * @param roundTypes { 1:'MX', 2:'MD', … } 지정 없으면 혼복
 * @returns { matches, shortages }
 *
 * shortages 는 인원이 모자라 못 채운 칸이다. 조용히 빼먹으면
 * "4면 잡았는데 3면만 나왔다"가 되므로 왜 못 채웠는지 같이 돌려준다.
 */
export function generateLeagueMatches(teams, { courts = 2, rounds = 4, roundTypes = {} } = {}) {
  const nCourts = Math.max(1, Number(courts) || 1);
  const nRounds = Math.max(1, Number(rounds) || 1);
  const nTeams = teams.length;
  if (nTeams < MIN_TEAMS) return { matches: [], shortages: [] };

  const played = {};
  teams.forEach((t) => t.forEach((p) => { played[p.id] = 0; }));
  const metCount = {};              // 팀끼리 몇 번 만났나
  const met = (a, b) => metCount[pairKey(a, b)] || 0;

  const out = [];
  const shortages = [];

  for (let r = 1; r <= nRounds; r += 1) {
    const type = teamRoundType(roundTypes[r] || roundTypes[String(r)] || 'MX');
    const busyPlayers = new Set();
    const busyTeams = new Set();

    for (let c = 1; c <= nCourts; c += 1) {
      /* 아직 덜 만난 팀 조합부터. 같은 타임에 이미 뛰는 팀은 뺀다 —
         팀원이 두 코트로 갈라지면 응원도 교대도 안 된다. */
      const candidates = allPairings(nTeams)
        .filter(([a, b]) => !busyTeams.has(a) && !busyTeams.has(b))
        .sort((x, y) => met(x[0], x[1]) - met(y[0], y[1]));

      let placed = false;
      for (const [a, b] of candidates) {
        const pa = pickFromTeam(teams[a], type, played, busyPlayers);
        if (!pa) continue;
        pa.forEach((p) => busyPlayers.add(p.id));
        const pb = pickFromTeam(teams[b], type, played, busyPlayers);
        if (!pb) { pa.forEach((p) => busyPlayers.delete(p.id)); continue; }
        pb.forEach((p) => busyPlayers.add(p.id));

        busyTeams.add(a); busyTeams.add(b);
        metCount[pairKey(a, b)] = met(a, b) + 1;
        [...pa, ...pb].forEach((p) => { played[p.id] += 1; });

        out.push({
          id: `lg-${r}-${c}`,
          round: r,
          court: c,
          league: true,
          teamAIdx: a,
          teamBIdx: b,
          typeKey: type.key,
          type: type.singles ? '단식' : type.name,
          teamA: pa.map((p) => p.id),
          teamB: pb.map((p) => p.id),
          score: null,
        });
        placed = true;
        break;
      }

      if (!placed) {
        shortages.push({
          round: r,
          court: c,
          type: type.singles ? '단식' : type.name,
          reason: busyTeams.size >= nTeams - 1
            ? '남은 팀이 없습니다'
            : '이 유형에 낼 선수가 부족합니다',
        });
      }
    }
  }
  return { matches: out, shortages };
}

/**
 * 팀 순위.
 *
 * 승점 = 이긴 경기 수. 무승부는 양쪽 0.5 대신 각 0점으로 두지 않고
 * 따로 센다 — 테니스는 동점으로 끝나는 일이 드물지만, 시간제로 하면
 * 생긴다. 그때 무승부를 승리로 쳐 주면 순위가 이상해진다.
 */
export function leagueStandings(teams, matches) {
  const rows = teams.map((players, i) => ({
    idx: i,
    name: teamStyle(i).name,
    players: players.length,
    wins: 0,
    losses: 0,
    draws: 0,
    gf: 0,
    ga: 0,
    played: 0,
  }));

  (matches || []).forEach((m) => {
    if (!m.score) return;
    const a = rows[m.teamAIdx];
    const b = rows[m.teamBIdx];
    if (!a || !b) return;
    a.played += 1; b.played += 1;
    a.gf += m.score.a; a.ga += m.score.b;
    b.gf += m.score.b; b.ga += m.score.a;
    if (m.score.a > m.score.b) { a.wins += 1; b.losses += 1; }
    else if (m.score.b > m.score.a) { b.wins += 1; a.losses += 1; }
    else { a.draws += 1; b.draws += 1; }
  });

  return rows
    .map((r) => ({ ...r, diff: r.gf - r.ga }))
    .sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.gf - x.gf || x.idx - y.idx)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** 개인 기록 — MVP 뽑을 때 */
export function leaguePlayerStats(teams, matches) {
  const row = {};
  teams.forEach((players, ti) => players.forEach((p) => {
    row[p.id] = { id: p.id, name: p.name, team: teamStyle(ti).name, games: 0, wins: 0, gf: 0, ga: 0 };
  }));
  (matches || []).forEach((m) => {
    if (!m.score) return;
    [[m.teamA, m.score.a, m.score.b], [m.teamB, m.score.b, m.score.a]].forEach(([side, gf, ga]) => {
      side.forEach((id) => {
        const r = row[id];
        if (!r) return;
        r.games += 1; r.gf += gf; r.ga += ga;
        if (gf > ga) r.wins += 1;
      });
    });
  });
  return Object.values(row)
    .map((r) => ({ ...r, diff: r.gf - r.ga }))
    .sort((x, y) => y.wins - x.wins || y.diff - x.diff);
}

/**
 * 짜기 전에 미리 본다 — 이 인원으로 이 설정이 되는지.
 * 눌러 놓고 빈 칸을 세는 일이 없도록.
 */
export function diagnoseLeague(teams, { courts = 2, rounds = 4, roundTypes = {} } = {}) {
  const problems = [];
  const nTeams = teams.length;

  if (nTeams < MIN_TEAMS) problems.push(`팀이 ${nTeams}개입니다. 최소 ${MIN_TEAMS}개 필요합니다`);

  /* 한 타임에 팀 하나는 코트 하나 — 팀 수의 절반보다 코트가 많으면
     남는 코트는 어차피 못 쓴다 */
  const usable = Math.floor(nTeams / 2);
  if (usable < courts) {
    problems.push(`${nTeams}팀이면 한 타임에 최대 ${usable}면까지 씁니다 (지금 ${courts}면)`);
  }

  for (let r = 1; r <= rounds; r += 1) {
    const key = roundTypes[r] || roundTypes[String(r)] || 'MX';
    const type = teamRoundType(key);
    if (type.singles) continue;
    const short = teams
      .map((t, i) => ({ i, c: teamComposition(t) }))
      .filter(({ c }) => c.male < type.need.M || c.female < type.need.F);
    if (short.length) {
      problems.push(
        `${r}타임 ${type.name} — ${short.map(({ i }) => teamStyle(i).name).join(', ')}에 `
        + `${[type.need.M ? `남 ${type.need.M}명` : '', type.need.F ? `여 ${type.need.F}명` : '']
          .filter(Boolean).join(' · ')}이 부족합니다`,
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

export { TEAM_ROUND_TYPES };
