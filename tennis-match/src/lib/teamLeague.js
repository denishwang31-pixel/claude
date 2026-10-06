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
     · 한 타임에는 되도록 서로 다른 팀끼리 코트를 나눠 쓴다 — 그래도 코트가
       남으면 **같은 팀이 여러 코트**에 들어간다(이번 타임에 이미 붙은 두 팀이 먼저).
       3팀에 7면처럼 팀보다 코트가 많은 대회(쿤블던: 한 타임에 두 팀이 7면을 다 씀)가
       "팀당 한 코트" 규칙 때문에 한 타임 1면밖에 못 짜던 문제(2026-10-03 앱 주인).
       예전처럼 막고 싶으면 config.oneCourtPerTeam = true (응원·교대가 편하다)
     · 아직 안 만난 팀끼리 먼저 붙인다 — 특정 두 팀만 계속 만나면
       리그가 아니라 그냥 연습 경기가 된다
     · 팀 안에서 출전 횟수를 고르게

   손으로 넣기·고치기 — addLeagueMatch / updateLeagueMatch / removeLeagueMatch
     자동으로 짠 뒤 고치거나, 처음부터 손으로 넣는다. 사람 겹침·칸 겹침은 막고,
     유형과 성별이 안 맞는 것은 경고만 한다(잡복 같은 것도 손으로는 넣을 수 있게).

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

/* ---------------- 팀 이름 바꾸기 ----------------
   기본은 A팀·B팀…. 청팀·홍팀·백팀처럼 바꿀 수 있다(2026-10-03 앱 주인 — 쿤블던).
   이름은 config.teamNames[i] 에 둔다. 비어 있으면 기본 이름.
   이름이 색으로 시작하면 색도 따라간다 — 청팀이 빨강이면 헷갈린다. */
const COLOR_WORDS = [
  [/^(청|파랑|파란|블루|blue)/i, 0],
  [/^(홍|적|빨강|빨간|레드|red)/i, 1],
  [/^(녹|초록|그린|green)/i, 2],
  [/^(황|노랑|노란|옐로|yellow)/i, 3],
  [/^(보라|퍼플|purple)/i, 4],
  [/^(백|흰|하양|화이트|white)/i, 7],
];
export const TEAM_NAME_MAX = 10;
export const cleanTeamName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, TEAM_NAME_MAX);

/** i 번째 팀의 이름·색 — names 는 config.teamNames */
export function teamLook(i, names) {
  const name = cleanTeamName(names?.[i]);
  const base = teamStyle(i);
  if (!name) return base;
  const hit = COLOR_WORDS.find(([re]) => re.test(name));
  return { ...(hit ? LEAGUE_TEAM_STYLES[hit[1]] : base), name };
}

/** 팀 수에 맞는 이름 묶음 — 한 번 눌러 채우기 */
export function teamNamePresets(count) {
  const sets = [
    ['청팀', '백팀'],
    ['청팀', '백팀', '홍팀'],
    ['청팀', '홍팀', '백팀'],
    ['청팀', '홍팀', '백팀', '황팀'],
    ['청팀', '홍팀', '백팀', '황팀', '녹팀'],
  ];
  return sets.filter((x) => x.length === count);
}

/* ---------------- 저장 모양 (Firestore) ----------------
   ⚠️ Firestore 는 "배열 안의 배열"을 저장하지 못한다(Nested arrays are not supported).
      화면에서는 teams = [[선수…], [선수…]] 가 편하지만, 그대로 저장하면 매번 거부됐다 —
      팀 리그 저장이 한 번도 안 됐고, 3팀 청백전 개설이 안 되고, 2팀→3팀 전환에서는
      그 오류가 버튼 처리 중에 터져 앱이 꺼졌다(2026-10-03 앱 주인).
      그래서 저장할 때는 [{ players:[…] }, …] 로 감싸고(pack), 읽을 때 푼다(unpack).
      예전 모양(배열의 배열)도 읽을 수 있게 둔다. */
export function packLeague(lg) {
  if (!lg) return lg;
  return { ...lg, teams: (lg.teams || []).map((t) => (Array.isArray(t) ? { players: t } : t)) };
}
export function unpackLeague(lg) {
  if (!lg) return lg;
  return { ...lg, teams: (lg.teams || []).map((t) => (Array.isArray(t) ? t : (t?.players || []))) };
}

/** 저장 전에 확인 — 배열 안에 배열이 있으면 그 경로를 돌려준다(없으면 '') */
export function nestedArrayPath(v, path = '') {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i += 1) {
      if (Array.isArray(v[i])) return `${path}[${i}]`;
      const inner = nestedArrayPath(v[i], `${path}[${i}]`);
      if (inner) return inner;
    }
    return '';
  }
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      const inner = nestedArrayPath(v[k], path ? `${path}.${k}` : k);
      if (inner) return inner;
    }
  }
  return '';
}

/* ---------------- 팀 편성 손보기 — 자동 배치 / 수동 배치 ----------------
   자동 배치: splitIntoTeams 로 실력·성비가 고르게 나뉜다.
   수동 배치: 모두 '미배정'에서 시작해 운영진이 팀에 넣는다.
   어느 쪽이든 여러 명을 골라 한 번에 다른 팀으로 옮길 수 있다 — 백팀에서 셋을 골라
   홍팀으로 보내는 식(2026-10-03 앱 주인). 미배정 명단은 league.unassigned 에 둔다(평평한 배열). */
export const UNASSIGNED = -1;

/** 고른 사람들(ids)을 to 팀으로 — to 가 UNASSIGNED 면 미배정으로. 이미 그 팀인 사람은 자리 그대로 */
export function moveToTeam(teams, unassigned, ids, to) {
  const list = teams || [];
  const pool = unassigned || [];
  if (to !== UNASSIGNED && (to < 0 || to >= list.length)) return { teams: list, unassigned: pool, moved: 0 };
  const pick = new Set(ids || []);
  const moving = [];
  const take = (arr) => arr.filter((p) => {
    if (!pick.has(p.id)) return true;
    moving.push(p);
    return false;
  });
  const nextTeams = list.map((t, i) => (i === to ? t : take(t)));
  const nextPool = to === UNASSIGNED ? pool : take(pool);
  if (to === UNASSIGNED) return { teams: nextTeams, unassigned: [...nextPool, ...moving], moved: moving.length };
  nextTeams[to] = [...nextTeams[to], ...moving];
  return { teams: nextTeams, unassigned: nextPool, moved: moving.length };
}

/** 수동 배치 시작 — 빈 팀 N개, 모두 미배정 */
export function emptyTeams(roster, count) {
  const n = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.round(Number(count) || 2)));
  return { teams: Array.from({ length: n }, () => []), unassigned: [...(roster || [])] };
}

/** 수동 배치 중 팀 수 바꾸기 — 넣어 둔 사람은 그대로, 없어지는 팀의 사람은 미배정으로 */
export function resizeTeams(teams, unassigned, count) {
  const n = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.round(Number(count) || 2)));
  const list = teams || [];
  const kept = Array.from({ length: n }, (_, i) => list[i] || []);
  const dropped = list.slice(n).flat();
  return { teams: kept, unassigned: [...(unassigned || []), ...dropped], dropped: dropped.length };
}

/* ---------------- 청백전을 3팀(청·백·홍)으로 ----------------
   청백전은 두 팀(lib/teamMatch.js)이다. 세 팀으로 늘리면 팀 리그 엔진을 그대로 쓴다 —
   팀끼리 덜 만난 조합부터 붙이므로 세 팀이 고르게 돈다(2026-10-03 앱 주인). */
export const BLUE_WHITE_RED = ['청팀', '백팀', '홍팀'];

/** 명단으로 리그 시작 상태 — 대회 문서의 league 칸에 그대로 넣는다 */
export function leagueFromRoster(roster, count, { courts = 2, rounds = 6, teamNames = [] } = {}, opts = {}) {
  return {
    teams: splitIntoTeams(roster || [], count, opts),
    matches: [],
    config: { courts: Math.max(1, Number(courts) || 1), rounds, roundTypes: {}, teamNames, oneCourtPerTeam: false },
  };
}

/**
 * 세 팀이 똑같이 뛰는지 — 한 타임에 한 조합이 코트를 다 쓰면 한 팀은 쉰다.
 * 그래서 3팀은 타임 수가 3의 배수일 때 세 팀의 출전 타임이 같다.
 * @returns 안내 문구 또는 ''
 */
export function leagueBalanceNote(teamCount, rounds) {
  const r = Number(rounds) || 0;
  if (teamCount !== 3 || r <= 0 || r % 3 === 0) return '';
  const up = Math.ceil(r / 3) * 3;
  return `3팀은 타임 수를 3의 배수로 하면 세 팀이 똑같이 뜁니다 — 지금 ${r}타임이면 팀마다 뛰는 타임이 하나씩 다를 수 있습니다(${up}타임 권장).`;
}

/** 팀별 경기 수 — 고르게 돌았는지 화면에서 보여 줄 때 */
export function teamGameCounts(teamCount, matches) {
  const n = Array.from({ length: teamCount }, () => 0);
  (matches || []).forEach((m) => { if (n[m.teamAIdx] != null) n[m.teamAIdx] += 1; if (n[m.teamBIdx] != null) n[m.teamBIdx] += 1; });
  return n;
}

/** 이름이 겹치면 순위표에서 구별이 안 된다 — 겹치는 이름 */
export function duplicateTeamNames(names, count) {
  const seen = {};
  for (let i = 0; i < count; i += 1) {
    const n = teamLook(i, names).name;
    seen[n] = (seen[n] || 0) + 1;
  }
  return Object.keys(seen).filter((n) => seen[n] > 1);
}

const skillOf = (p, busuToNtrp) => {
  if (typeof p.ntrp === 'number' && p.ntrp > 0) return p.ntrp;
  const fromBusu = busuToNtrp ? busuToNtrp(p.busu) : null;
  if (fromBusu) return fromBusu;
  return ({ A: 4.0, B: 3.5, C: 3.0, D: 2.5, E: 2.0, F: 1.5 })[p.grade] || 3.0;
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
export function generateLeagueMatches(teams, { courts = 2, rounds = 4, roundTypes = {}, oneCourtPerTeam = false } = {}) {
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
    const roundPairs = new Set();       // 이번 타임에 이미 붙은 팀 조합

    for (let c = 1; c <= nCourts; c += 1) {
      /* 고르는 순서
           1) 이번 타임에 아직 안 뛰는 팀끼리 (예전 규칙과 같은 결과)
           2) 코트가 남으면 이번 타임에 이미 붙은 두 팀이 한 코트 더 (같은 팀이 옆 코트에 모인다)
           3) 그다음 다른 조합
         각 단계 안에서는 덜 만난 조합부터. oneCourtPerTeam 이면 1) 만. */
      const busyCount = ([a, b]) => (busyTeams.has(a) ? 1 : 0) + (busyTeams.has(b) ? 1 : 0);
      const stage = (p) => (busyCount(p) === 0 ? 0 : roundPairs.has(pairKey(p[0], p[1])) ? 1 : 2);
      const candidates = allPairings(nTeams)
        .filter((p) => !oneCourtPerTeam || busyCount(p) === 0)
        .sort((x, y) => stage(x) - stage(y) || met(x[0], x[1]) - met(y[0], y[1]));

      let placed = false;
      for (const [a, b] of candidates) {
        const pa = pickFromTeam(teams[a], type, played, busyPlayers);
        if (!pa) continue;
        pa.forEach((p) => busyPlayers.add(p.id));
        const pb = pickFromTeam(teams[b], type, played, busyPlayers);
        if (!pb) { pa.forEach((p) => busyPlayers.delete(p.id)); continue; }
        pb.forEach((p) => busyPlayers.add(p.id));

        busyTeams.add(a); busyTeams.add(b);
        roundPairs.add(pairKey(a, b));
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
          reason: oneCourtPerTeam && busyTeams.size >= nTeams - 1
            ? '남은 팀이 없습니다 (한 팀은 한 타임에 한 코트만)'
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
export function leagueStandings(teams, matches, names) {
  const rows = teams.map((players, i) => ({
    idx: i,
    name: teamLook(i, names).name,
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
export function leaguePlayerStats(teams, matches, names) {
  const row = {};
  teams.forEach((players, ti) => players.forEach((p) => {
    row[p.id] = { id: p.id, name: p.name, team: teamLook(ti, names).name, games: 0, wins: 0, gf: 0, ga: 0 };
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
export function diagnoseLeague(teams, { courts = 2, rounds = 4, roundTypes = {}, oneCourtPerTeam = false, teamNames } = {}) {
  const problems = [];
  const nTeams = teams.length;

  if (nTeams < MIN_TEAMS) problems.push(`팀이 ${nTeams}개입니다. 최소 ${MIN_TEAMS}개 필요합니다`);

  /* 한 타임에 팀 하나는 코트 하나 — 팀 수의 절반보다 코트가 많으면
     남는 코트는 어차피 못 쓴다 */
  const usable = Math.floor(nTeams / 2);
  if (oneCourtPerTeam && usable < courts) {
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
        `${r}타임 ${type.name} — ${short.map(({ i }) => teamLook(i, teamNames).name).join(', ')}에 `
        + `${[type.need.M ? `남 ${type.need.M}명` : '', type.need.F ? `여 ${type.need.F}명` : '']
          .filter(Boolean).join(' · ')}이 부족합니다`,
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

/* ============================================================
   손으로 넣기 · 고치기 · 지우기
   ============================================================ */

/** 유형별로 한쪽에 몇 명 — 단식 1, 복식 2 */
export const sideSize = (typeKey) => (teamRoundType(typeKey).singles ? 1 : 2);

/**
 * 손으로 넣는 경기를 검사한다.
 * @param draft  { round, court, typeKey, teamAIdx, teamBIdx, teamA:[id], teamB:[id] }
 * @param exceptId  고치는 중인 경기(자기 자신과는 겹침을 따지지 않는다)
 * @param courtName 코트 번호 → 화면에 쓰는 이름(코트 이름을 정했으면 'A' 처럼). 없으면 숫자
 * @returns { error?: string, warnings: string[] }
 */
export function checkLeagueMatch(teams, matches, draft, exceptId = null, { courtName } = {}) {
  const warnings = [];
  const d = draft || {};
  const round = Number(d.round);
  const court = Number(d.court);
  if (!(round >= 1)) return { error: '타임을 고르세요', warnings };
  if (!(court >= 1)) return { error: '코트를 고르세요', warnings };
  const nT = (teams || []).length;
  if (!(d.teamAIdx >= 0 && d.teamAIdx < nT) || !(d.teamBIdx >= 0 && d.teamBIdx < nT)) return { error: '두 팀을 고르세요', warnings };
  if (d.teamAIdx === d.teamBIdx) return { error: '서로 다른 두 팀을 고르세요', warnings };
  const type = teamRoundType(d.typeKey);
  const need = sideSize(type.key);
  const A = d.teamA || []; const B = d.teamB || [];
  if (A.length !== need || B.length !== need) return { error: `양쪽에 ${need}명씩 고르세요`, warnings };
  const inTeam = (idx, id) => (teams[idx] || []).some((p) => p.id === id);
  if (!A.every((id) => inTeam(d.teamAIdx, id)) || !B.every((id) => inTeam(d.teamBIdx, id))) {
    return { error: '선수는 자기 팀에서만 고를 수 있습니다', warnings };
  }
  const others = (matches || []).filter((m) => m.id !== exceptId && Number(m.round) === round);
  const clash = others.find((m) => Number(m.court) === court);
  if (clash) return { error: `${round}타임 코트${courtName ? ` ${courtName(court)}` : court}에는 이미 경기가 있습니다`, warnings };
  const busy = new Set(others.flatMap((m) => [...(m.teamA || []), ...(m.teamB || [])]));
  const dup = [...A, ...B].find((id) => busy.has(id));
  if (dup) {
    const who = teams.flat().find((p) => p.id === dup)?.name || '한 선수';
    return { error: `${who} 님은 ${round}타임에 다른 코트 경기가 있습니다`, warnings };
  }
  if (!type.singles) {
    const g = (id) => teams.flat().find((p) => p.id === id)?.gender === 'F' ? 'F' : 'M';
    const fits = (side) => {
      const f = side.filter((id) => g(id) === 'F').length;
      return f === type.need.F && side.length - f === type.need.M;
    };
    if (!fits(A) || !fits(B)) warnings.push(`${type.name} 구성(남 ${type.need.M} · 여 ${type.need.F})과 성별이 다릅니다`);
  }
  return { warnings };
}

const draftToMatch = (d, id, score = null) => {
  const type = teamRoundType(d.typeKey);
  return {
    id,
    round: Number(d.round),
    court: Number(d.court),
    league: true,
    manual: true,
    teamAIdx: d.teamAIdx,
    teamBIdx: d.teamBIdx,
    typeKey: type.key,
    type: type.singles ? '단식' : type.name,
    teamA: [...d.teamA],
    teamB: [...d.teamB],
    score,
  };
};

const sortMatches = (ms) => [...ms].sort((x, y) => x.round - y.round || x.court - y.court);

/** 경기 하나 넣기 → { matches } 또는 { error } */
export function addLeagueMatch(teams, matches, draft, newId = `lm-${Date.now().toString(36)}`, opts = {}) {
  const chk = checkLeagueMatch(teams, matches, draft, null, opts);
  if (chk.error) return { error: chk.error };
  return { matches: sortMatches([...(matches || []), draftToMatch(draft, newId)]), warnings: chk.warnings };
}

/** 경기 고치기 — 선수·팀·유형이 바뀌면 지난 점수는 지운다(다른 경기가 됐다) */
export function updateLeagueMatch(teams, matches, id, draft, opts = {}) {
  const old = (matches || []).find((m) => m.id === id);
  if (!old) return { error: '고칠 경기를 찾지 못했습니다' };
  const chk = checkLeagueMatch(teams, matches, draft, id, opts);
  if (chk.error) return { error: chk.error };
  const same = old.teamAIdx === draft.teamAIdx && old.teamBIdx === draft.teamBIdx
    && old.typeKey === teamRoundType(draft.typeKey).key
    && [...old.teamA].sort().join() === [...draft.teamA].sort().join()
    && [...old.teamB].sort().join() === [...draft.teamB].sort().join();
  const next = draftToMatch(draft, id, same ? old.score : null);
  return { matches: sortMatches(matches.map((m) => (m.id === id ? next : m))), warnings: chk.warnings, scoreCleared: !same && !!old.score };
}

/** 경기 지우기 */
export const removeLeagueMatch = (matches, id) => (matches || []).filter((m) => m.id !== id);

/* ---------------- 실제 편성 기준 경기 유형 ----------------
   타임별 유형(혼복 등)은 '이렇게 짜 달라'는 설정이다. 사람이 모자라면 다른 구성으로 채워지고,
   손으로 고치면 또 바뀐다. 대진표·집계에는 실제로 선 선수 성별로 다시 매긴다(2026-10-04 앱 주인). */
export function actualMatchType(m, genderOf) {
  const A = m?.teamA || [];
  const B = m?.teamB || [];
  const g = (id) => (genderOf?.(id) === 'F' ? 'F' : 'M');
  if (A.length <= 1 && B.length <= 1) {
    const all = [...A, ...B].map(g);
    if (all.every((x) => x === 'M')) return '남단식';
    if (all.every((x) => x === 'F')) return '여단식';
    return '혼성단식';
  }
  const all = [...A, ...B].map(g);
  if (all.every((x) => x === 'M')) return '남복';
  if (all.every((x) => x === 'F')) return '여복';
  const mixed = (ids) => ids.length === 2 && new Set(ids.map(g)).size === 2;
  return mixed(A) && mixed(B) ? '혼복' : '잡복';
}

/** 유형별 경기 수 — 대진 맨 끝 요약. 순서는 늘 같게 */
export const TYPE_ORDER = ['남복', '여복', '혼복', '잡복', '남단식', '여단식', '혼성단식'];
export function typeCounts(matches, typeOf = (m) => m.type) {
  const by = {};
  (matches || []).forEach((m) => { const t = typeOf(m); by[t] = (by[t] || 0) + 1; });
  const order = [...TYPE_ORDER.filter((t) => by[t]), ...Object.keys(by).filter((t) => !TYPE_ORDER.includes(t))];
  return { total: (matches || []).length, by, order };
}

/** 표의 크기 — 설정한 타임·코트 수와 실제 경기 중 큰 쪽. 경기를 지워도 줄·칸이 남는다 */
export function gridExtent(matches, { rounds = 0, courts = 0 } = {}) {
  const ms = matches || [];
  const maxR = ms.reduce((x, m) => Math.max(x, Number(m.round) || 0), 0);
  const maxC = ms.reduce((x, m) => Math.max(x, Number(m.court) || 0), 0);
  return { rounds: Math.max(Number(rounds) || 0, maxR), courts: Math.max(Number(courts) || 0, maxC) };
}

/* ---------------- 2팀 청백전도 같은 고치기 화면으로 ----------------
   2팀 경기(lib/teamMatch.js)에는 팀 번호가 없다 — 늘 teamA = 청팀(0), teamB = 백팀(1).
   고치기 화면은 팀 번호로 움직이므로 넣을 때 붙이고, 저장할 때 청팀이 왼쪽(teamA)에
   오도록 되돌린다. 점수 판(teamScore)은 teamA 를 청팀으로 센다(2026-10-04 앱 주인). */
const TYPE_KEY_BY_NAME = { 혼복: 'MX', 남복: 'MD', 여복: 'WD', 단식: 'SG' };
export function withTeamIdx(matches) {
  return (matches || []).map((m) => ({
    ...m,
    teamAIdx: m.teamAIdx ?? 0,
    teamBIdx: m.teamBIdx ?? 1,
    typeKey: m.typeKey || TYPE_KEY_BY_NAME[m.type] || 'MX',
  }));
}
export function twoTeamSide(m) {
  if (!(m.teamAIdx === 1 && m.teamBIdx === 0)) return { ...m, team: true };
  return {
    ...m,
    team: true,
    teamAIdx: 0,
    teamBIdx: 1,
    teamA: m.teamB,
    teamB: m.teamA,
    score: m.score ? { a: m.score.b, b: m.score.a } : m.score ?? null,
  };
}

/** 경기 → 고치는 화면에 넣을 초안 */
export const matchToDraft = (m) => ({
  round: m.round, court: m.court, typeKey: m.typeKey || 'MX',
  teamAIdx: m.teamAIdx, teamBIdx: m.teamBIdx, teamA: [...(m.teamA || [])], teamB: [...(m.teamB || [])],
});

/** 새 경기 초안 — 비어 있는 첫 칸(타임·코트)을 찾아 준다 */
export function emptyDraft(matches, { courts = 2, rounds = 4 } = {}, teamsCount = 2) {
  const used = new Set((matches || []).map((m) => `${m.round}|${m.court}`));
  for (let r = 1; r <= Math.max(1, rounds); r += 1) {
    for (let c = 1; c <= Math.max(1, courts); c += 1) {
      if (!used.has(`${r}|${c}`)) return { round: r, court: c, typeKey: 'MX', teamAIdx: 0, teamBIdx: teamsCount > 1 ? 1 : 0, teamA: [], teamB: [] };
    }
  }
  return { round: Math.max(1, rounds) + 1, court: 1, typeKey: 'MX', teamAIdx: 0, teamBIdx: teamsCount > 1 ? 1 : 0, teamA: [], teamB: [] };
}

export { TEAM_ROUND_TYPES };

/* ============================================================
   대회 참가자 바꾸기 — 확정한 뒤에도 운영진이 넣고 뺀다(2026-10-06 앱 주인:
   "대회 인원 확정했는데 변경이 필요해 — 모집 말고 운영진이 추가할 수 있게").
   청백전 2팀(team)·3팀(league)·팀 리그 공통. 두 판(team·league)은 2팀↔3팀 전환 때 보관되므로 둘 다 맞춘다.
   · 넣기: 명단(roster)에 더하고, 이미 편성이 있으면 미배정에 넣는다 — 팀은 운영진이 골라 준다.
     교류전(club_match)은 우리 클럽 쪽(teamA)에 바로.
   · 빼기: 대진에 들어 있으면 막는다(경기가 한쪽 사람 없이 남는다) — 대진표 수정에서 먼저 바꾸게.
   · rosterVer 를 올린다 — 화면이 저장본을 다시 읽어 미배정에 보이게(TournamentScreen key).
   ============================================================ */
const idsOfMatch = (m) => [...(m?.teamA || []), ...(m?.teamB || [])];
const dropId = (list, id) => (list || []).filter((p) => p && p.id !== id);

/** 이 사람이 들어간 경기 수(2팀·3팀 판 모두) */
export function gamesOf(t, id) {
  const ms = [...((t?.league?.matches) || []), ...((t?.team?.matches) || [])];
  return ms.filter((m) => idsOfMatch(m).includes(id)).length;
}

/** 참가자 넣기 → 대회 문서에 쓸 patch (이미 있는 사람은 건너뛴다) */
export function rosterAddPatch(t, people) {
  const roster = [...(t?.roster || [])];
  const have = new Set(roster.map((p) => p.id));
  const add = (people || []).filter((p) => p && p.id && !have.has(p.id));
  if (!add.length) return { patch: null, added: [] };
  const patch = { roster: [...roster, ...add], rosterVer: (Number(t?.rosterVer) || 0) + 1 };
  if (t?.league) {
    const lg = t.league;
    patch.league = { ...lg, unassigned: [...(lg.unassigned || []), ...add] };
  }
  if (t?.team) {
    const tm = t.team;
    patch.team = t.format === 'club_match'
      ? { ...tm, teamA: [...(tm.teamA || []), ...add] }
      : { ...tm, unassigned: [...(tm.unassigned || []), ...add] };
  }
  return { patch, added: add };
}

/** 참가자 빼기 → { patch } 또는 { error, games } */
export function rosterRemovePatch(t, id) {
  const games = gamesOf(t, id);
  if (games > 0) return { error: 'inGames', games };
  if (!(t?.roster || []).some((p) => p.id === id)) return { error: 'notFound', games: 0 };
  const patch = { roster: dropId(t.roster, id), rosterVer: (Number(t?.rosterVer) || 0) + 1 };
  if (t.league) {
    const lg = t.league;
    patch.league = {
      ...lg,
      teams: (lg.teams || []).map((x) => (Array.isArray(x) ? dropId(x, id) : { ...x, players: dropId(x?.players, id) })),
      unassigned: dropId(lg.unassigned, id),
    };
  }
  if (t.team) {
    const tm = t.team;
    patch.team = { ...tm, teamA: dropId(tm.teamA, id), teamB: dropId(tm.teamB, id), unassigned: dropId(tm.unassigned, id) };
  }
  return { patch };
}

/**
 * 명단(roster)에는 있는데 어느 팀에도·미배정에도 없는 사람 — 화면을 열 때 미배정으로 되살린다.
 * 2026-10-06 앱 주인: "대회 인원은 추가됐는데 팀 배정에는 없다 — 미배정에도 아예 없었다".
 * 어떤 길로 편성 저장본에서 빠졌든(옛 판·동시에 저장 등) 명단에 있는 사람은 반드시 어딘가 보이게 한다.
 * @param roster  대회 명단 [{id,…}]
 * @param groups  지금 편성의 사람 목록들 [[팀1 선수…], [팀2…], [미배정…]]
 */
export function missingFromTeams(roster, groups) {
  const placed = new Set();
  (groups || []).forEach((g) => (g || []).forEach((p) => { if (p?.id) placed.add(p.id); }));
  return (roster || []).filter((p) => p?.id && !placed.has(p.id));
}

/* ============================================================
   여러 휴대폰에서 같은 대회를 열어 둘 때 — 덮어쓰기 막기 (2026-10-06)
   앱 주인: "팀 배치했던 사람들이 다시 미배정으로 빠졌다".
   편성 화면은 저장할 때 팀·미배정·대진·설정을 통째로 '이 휴대폰이 들고 있는 상태'로 썼고,
   다른 휴대폰에서 바뀐 것을 다시 읽지 않았다. 두 사람이 열어 두면 한쪽이 점수만 넣어도
   다른 쪽이 해 둔 팀 배치가 옛 상태로 돌아갔다.
   → ① 바뀐 칸만 쓴다(partialPatch: 'league.matches' 처럼) ② 남이 바꾼 저장본은 화면에 다시 읽는다(stableKey 로 내 저장과 구별)
   ============================================================ */
/** 키 순서와 상관없이 같은 값이면 같은 문자열 — 내가 방금 쓴 것인지 알아보는 데 */
export function stableKey(v) {
  const norm = (x) => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') {
      const o = {};
      Object.keys(x).sort().forEach((k) => { if (x[k] !== undefined) o[k] = norm(x[k]); });
      return o;
    }
    return x;
  };
  return JSON.stringify(norm(v ?? null));
}

/** 대회 문서에 쓸 patch — 저장본이 이미 있으면 바뀐 칸만('league.matches'), 처음이면 통째로 */
export function partialPatch(field, payload, keys, hasSaved) {
  if (!hasSaved || !keys || !keys.length) return { [field]: payload };
  const out = {};
  keys.forEach((k) => { if (payload && k in payload) out[`${field}.${k}`] = payload[k]; });
  return Object.keys(out).length ? out : { [field]: payload };
}
