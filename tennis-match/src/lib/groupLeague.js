/* ============================================================
   조별리그 운영 — 대진표 기준 · 조 편성 · 시간표 · 순위 (순수 JS, 무의존)

   클럽 대회(조별리그 + 토너먼트)의 예선을 맡는다. 우리 클럽끼리 여는 대회든,
   우리 플랫폼으로 운영하는 외부 대회든 같은 모양으로 쓴다 — 외부 대회는
   참가자 일부(또는 전부)가 회원이 아닌 「외부 참가자」(guests)일 뿐이다.

   저장 모양 (clubs/{id}/tournaments/{tid})
     rules   : { play, teamMode, groupMethod, groupCount, advance, games }
     guests  : [{ id:'g_…', name, club }]              회원이 아닌 참가자
     entries : [{ id, name, players:[id…], seed, skill }] 팀(복식) 또는 개인(단식)
     groups  : [{ id, name, entryIds:[…], courts:[1,2]?,
                  matches:[{ id, groupId, a, b, round, court, score:{a,b}|null }] }]

   순위 기준 (테니스 동호인 대회에서 흔히 쓰는 순서)
     1. 승수  2. 승자승(동률인 팀끼리 경기만 따로 계산)  3. 게임 득실차  4. 득게임
     5. 그래도 같으면 공동 순위 — 추첨·재경기는 운영진이 정한다
   ============================================================ */

let _seq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

const shuffle = (arr, rnd = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ---------------- 기준 ---------------- */
export const PLAY = { DOUBLES: 'doubles', SINGLES: 'singles' };
export const TEAM_MODE = { BALANCED: 'balanced', RANDOM: 'random', MANUAL: 'manual' };
export const GROUP_METHOD = { SNAKE: 'snake', RANDOM: 'random', GRADE: 'grade' };

export const DEFAULT_RULES = {
  play: PLAY.DOUBLES,
  teamMode: TEAM_MODE.BALANCED,
  groupMethod: GROUP_METHOD.SNAKE,
  groupCount: 4,
  advance: 2,
  games: 6,           // 한 경기 게임 수(6게임 단세트가 기본)
};

export const RULE_LABELS = {
  play: { doubles: '복식 (2명 1팀)', singles: '단식 (1명)' },
  teamMode: { balanced: '실력 균등 짝', random: '무작위 짝', manual: '직접 짝짓기' },
  groupMethod: { snake: '실력 고르게 (스네이크)', random: '무작위', grade: '같은 등급끼리' },
};

export const RANK_RULE_TEXT = '승수 → 승자승 → 게임 득실차 → 득게임 순';

export const groupName = (i) => `${String.fromCharCode(65 + i)}조`;

/** 규칙 값 정리 — 저장된 값이 비거나 이상해도 화면이 깨지지 않게 */
export function normRules(r = {}) {
  const x = { ...DEFAULT_RULES, ...(r || {}) };
  if (!Object.values(PLAY).includes(x.play)) x.play = DEFAULT_RULES.play;
  if (!Object.values(TEAM_MODE).includes(x.teamMode)) x.teamMode = DEFAULT_RULES.teamMode;
  if (!Object.values(GROUP_METHOD).includes(x.groupMethod)) x.groupMethod = DEFAULT_RULES.groupMethod;
  x.groupCount = Math.max(1, Math.round(Number(x.groupCount) || 1));
  x.advance = Math.max(0, Math.round(Number(x.advance) || 0));
  x.games = Math.min(9, Math.max(1, Math.round(Number(x.games) || 6)));
  return x;
}

/* ---------------- 외부 참가자 ---------------- */
/** 회원이 아닌 참가자 한 명 — 이름은 꼭, 소속은 선택 */
export function makeGuest(name, club = '') {
  const n = String(name || '').trim().slice(0, 20);
  if (!n) return null;
  return { id: uid('g'), name: n, club: String(club || '').trim().slice(0, 20), guest: true };
}

/* ---------------- 팀(엔트리) 만들기 ----------------
   players: [{ id, name, skill }] — skill 은 대회 등급·NTRP 로 정한 실력(높을수록 잘함) */
const entryOf = (ps, i) => ({
  id: uid('e'),
  name: ps.map((p) => p.name).join(' / '),
  players: ps.map((p) => p.id),
  seed: null,
  skill: ps.length ? Math.round((ps.reduce((s, p) => s + (Number(p.skill) || 3), 0) / ps.length) * 100) / 100 : 3,
  ...(ps.some((p) => p.tgrade) ? { tgrade: ps.map((p) => p.tgrade || '').sort()[0] } : {}),
  _i: i,
});

/**
 * 참가자를 팀으로.
 * @param pairs  직접 짝짓기일 때 [[id,id], …] — 짝이 안 된 사람은 남은 사람끼리 균등으로
 */
export function makeEntries(players, { play = PLAY.DOUBLES, teamMode = TEAM_MODE.BALANCED, pairs = [] } = {}, rnd = Math.random) {
  const list = [...(players || [])];
  if (play === PLAY.SINGLES) return list.map((p, i) => entryOf([p], i));
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const teams = [];
  const used = new Set();
  if (teamMode === TEAM_MODE.MANUAL) {
    (pairs || []).forEach(([a, b]) => {
      if (!byId[a] || !byId[b] || used.has(a) || used.has(b) || a === b) return;
      teams.push([byId[a], byId[b]]); used.add(a); used.add(b);
    });
  }
  const rest = list.filter((p) => !used.has(p.id));
  if (teamMode === TEAM_MODE.RANDOM) {
    const s = shuffle(rest, rnd);
    while (s.length >= 2) teams.push([s.shift(), s.shift()]);
    if (s.length) teams.push([s[0]]);
  } else {
    /* 균등 — 실력 높은 사람과 낮은 사람을 짝지어 팀 평균을 고르게 */
    const s = [...rest].sort((a, b) => (Number(b.skill) || 3) - (Number(a.skill) || 3));
    while (s.length >= 2) teams.push([s.shift(), s.pop()]);
    if (s.length) teams.push([s[0]]);
  }
  return teams.map(entryOf);
}

/* ---------------- 조 나누기 ---------------- */
/**
 * @param method snake(실력 고르게) | random | grade(같은 등급끼리 — 등급마다 한 조)
 * @returns groups [{ id, name, entryIds, matches:[] }]
 */
export function assignGroups(entries, { groupCount = 4, groupMethod = GROUP_METHOD.SNAKE } = {}, rnd = Math.random) {
  const list = [...(entries || [])];
  if (!list.length) return [];
  if (groupMethod === GROUP_METHOD.GRADE && list.some((e) => e.tgrade)) {
    const keys = [...new Set(list.map((e) => e.tgrade || '기타'))].sort();
    return keys.map((k, i) => ({
      id: uid('grp'), name: `${groupName(i)} (${k})`, grade: k,
      entryIds: list.filter((e) => (e.tgrade || '기타') === k).map((e) => e.id), matches: [],
    }));
  }
  const g = Math.max(1, Math.min(Number(groupCount) || 1, list.length));
  const groups = Array.from({ length: g }, (_, i) => ({ id: uid('grp'), name: groupName(i), entryIds: [], matches: [] }));
  let ordered;
  if (groupMethod === GROUP_METHOD.RANDOM) ordered = shuffle(list, rnd);
  else {
    /* 시드 먼저, 그다음 실력 순 — 스네이크로 돌리면 조마다 강약이 고르게 섞인다 */
    ordered = [...list].sort((a, b) => (a.seed || 999) - (b.seed || 999) || (b.skill || 0) - (a.skill || 0));
  }
  ordered.forEach((e, idx) => {
    const row = Math.floor(idx / g);
    const col = idx % g;
    groups[row % 2 === 0 ? col : g - 1 - col].entryIds.push(e.id);
  });
  return groups;
}

/* ---------------- 조 안 경기 (풀리그) ----------------
   원형 돌리기(circle method) — 라운드마다 모든 팀이 한 번씩, 홀수면 한 팀이 쉰다 */
export function roundRobin(ids) {
  const list = [...ids];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]; const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());   // 첫 자리는 고정, 나머지를 한 칸씩 돌린다
  }
  return rounds;
}

const pairKey = (a, b) => [a, b].sort().join('|');

/** 조의 경기를 (다시) 만든다 — 이미 결과가 있는 짝은 결과를 그대로 살린다 */
export function buildGroupMatches(group, old = []) {
  const keep = new Map((old || []).filter((m) => m.score).map((m) => [pairKey(m.a, m.b), m]));
  const out = [];
  roundRobin(group.entryIds).forEach((pairs, ri) => pairs.forEach(([a, b]) => {
    const prev = keep.get(pairKey(a, b));
    out.push({
      id: prev?.id || uid('gm'), groupId: group.id, a, b, rr: ri + 1,
      score: prev ? (prev.a === a ? prev.score : { a: prev.score.b, b: prev.score.a }) : null,
    });
  }));
  return out;
}

/* ---------------- 시간표 (타임 × 코트) ----------------
   courts: 전체 코트 수. 조에 courts:[1,2] 를 정해 두면 그 조는 그 코트에서만 돈다
   (「A조는 1·2코트, B조는 3·4코트」처럼 조별로 따로 진행).
   같은 타임에 한 팀이 두 경기에 들어가지 않게, 풀리그 라운드 순서를 지키며 채운다. */
export function schedule(groups, courts = 2) {
  const total = Math.max(1, Math.round(Number(courts) || 1));
  const allCourts = Array.from({ length: total }, (_, i) => i + 1);
  const own = (g) => {
    const cs = (g.courts || []).map(Number).filter((c) => c >= 1);
    return cs.length ? [...new Set(cs)].sort((a, b) => a - b) : null;
  };
  const out = groups.map((g) => ({ ...g, matches: (g.matches || []).map((m) => ({ ...m })) }));
  /* 코트를 따로 가진 조는 따로, 나머지는 남은 코트를 같이 쓴다 */
  const lanes = [];
  const shared = out.filter((g) => !own(g));
  const taken = new Set(out.filter(own).flatMap(own));
  out.filter(own).forEach((g) => lanes.push({ groups: [g], courts: own(g) }));
  if (shared.length) {
    const free = allCourts.filter((c) => !taken.has(c));
    lanes.push({ groups: shared, courts: free.length ? free : allCourts });
  }
  lanes.forEach(({ groups: gs, courts: cs }) => {
    /* 조를 번갈아 가며 라운드 순으로 줄 세운다 — 한 조만 먼저 끝나지 않게 */
    const queue = [];
    const maxRr = Math.max(0, ...gs.flatMap((g) => g.matches.map((m) => m.rr || 1)));
    for (let r = 1; r <= maxRr; r++) gs.forEach((g) => g.matches.filter((m) => (m.rr || 1) === r).forEach((m) => queue.push(m)));
    let slot = 0;
    while (queue.length) {
      slot += 1;
      const busy = new Set();
      let ci = 0;
      for (let i = 0; i < queue.length && ci < cs.length;) {
        const m = queue[i];
        if (busy.has(m.a) || busy.has(m.b)) { i += 1; continue; }
        m.round = slot; m.court = cs[ci]; ci += 1;
        busy.add(m.a); busy.add(m.b);
        queue.splice(i, 1);
      }
      if (slot > 500) break;   // 안전장치
    }
  });
  return out;
}

/** 처음부터 끝까지 — 참가자 → 팀 → 조 → 경기 → 시간표 */
export function buildLeague(players, rulesIn, { courts = 2, pairs = [], seeds = {} } = {}, rnd = Math.random) {
  const rules = normRules(rulesIn);
  const entries = makeEntries(players, { play: rules.play, teamMode: rules.teamMode, pairs }, rnd)
    .map((e) => ({ ...e, seed: seeds[e.players.join('+')] || null }));
  const groups = assignGroups(entries, rules, rnd).map((g) => ({ ...g, matches: buildGroupMatches(g) }));
  return { rules, entries, groups: schedule(groups, courts) };
}

/* ---------------- 손으로 고치기 ---------------- */
const hasScore = (g) => (g.matches || []).some((m) => m.score);

/** 팀을 다른 조로 — 두 조의 경기를 다시 만들고(이미 친 경기 결과는 남는 짝만 유지) 시간표를 다시 짠다 */
export function moveEntry(groups, entryId, toGroupId, courts = 2) {
  const from = groups.find((g) => g.entryIds.includes(entryId));
  if (!from || from.id === toGroupId || !groups.some((g) => g.id === toGroupId)) return { groups, error: '' };
  if ((from.matches || []).some((m) => m.score && (m.a === entryId || m.b === entryId))) {
    return { groups, error: '이 팀은 이미 결과가 있는 경기가 있어 조를 옮길 수 없습니다' };
  }
  const next = groups.map((g) => {
    if (g.id === from.id) {
      const ng = { ...g, entryIds: g.entryIds.filter((x) => x !== entryId) };
      return { ...ng, matches: buildGroupMatches(ng, g.matches) };
    }
    if (g.id === toGroupId) {
      const ng = { ...g, entryIds: [...g.entryIds, entryId] };
      return { ...ng, matches: buildGroupMatches(ng, g.matches) };
    }
    return g;
  });
  return { groups: schedule(next, courts), error: '' };
}

/** 두 팀의 선수 한 명씩 맞바꾸기 — 결과가 있는 팀은 못 바꾼다 */
export function swapPlayers(entries, groups, p1, p2, nameOf = (id) => id) {
  const e1 = entries.find((e) => e.players.includes(p1));
  const e2 = entries.find((e) => e.players.includes(p2));
  if (!e1 || !e2 || e1.id === e2.id) return { entries, error: '' };
  const played = (eid) => groups.some((g) => (g.matches || []).some((m) => m.score && (m.a === eid || m.b === eid)));
  if (played(e1.id) || played(e2.id)) return { entries, error: '이미 경기를 한 팀은 선수를 바꿀 수 없습니다' };
  const fix = (e) => {
    const players = e.players.map((p) => (p === p1 ? p2 : p === p2 ? p1 : p));
    return { ...e, players, name: players.map(nameOf).join(' / ') };
  };
  return { entries: entries.map((e) => (e.id === e1.id || e.id === e2.id ? fix(e) : e)), error: '' };
}

/** 조에 코트를 정해 주기 ([] 면 함께 쓰기) — 시간표를 다시 짠다 */
export function setGroupCourts(groups, groupId, courtList, courts = 2) {
  const cs = (courtList || []).map(Number).filter((c) => c >= 1 && c <= courts);
  return schedule(groups.map((g) => (g.id === groupId ? { ...g, courts: cs } : g)), courts);
}

/** 결과 넣기·지우기 */
export function setScore(groups, matchId, score) {
  const ok = score && Number.isFinite(+score.a) && Number.isFinite(+score.b) && +score.a >= 0 && +score.b >= 0 && +score.a !== +score.b;
  return groups.map((g) => ({
    ...g,
    matches: (g.matches || []).map((m) => (m.id !== matchId ? m : { ...m, score: ok ? { a: +score.a, b: +score.b } : null })),
  }));
}

/** 예전 문서(시간표 없이 a·b 만 있는 경기)도 표로 보이게 */
export function ensureSchedule(groups, courts = 2) {
  if ((groups || []).every((g) => (g.matches || []).every((m) => m.round && m.court))) return groups || [];
  return schedule((groups || []).map((g) => ({
    ...g,
    matches: (g.matches || []).some((m) => m.rr) ? g.matches : buildGroupMatches(g, g.matches),
  })), courts);
}

/* ---------------- 순위 ---------------- */
function tally(entryIds, matches) {
  const rec = {};
  entryIds.forEach((id) => { rec[id] = { id, played: 0, w: 0, l: 0, gf: 0, ga: 0 }; });
  matches.forEach((m) => {
    if (!m.score || !rec[m.a] || !rec[m.b]) return;
    const { a, b } = m.score;
    rec[m.a].played++; rec[m.b].played++;
    rec[m.a].gf += a; rec[m.a].ga += b; rec[m.b].gf += b; rec[m.b].ga += a;
    if (a > b) { rec[m.a].w++; rec[m.b].l++; } else if (b > a) { rec[m.b].w++; rec[m.a].l++; }
  });
  Object.values(rec).forEach((r) => { r.diff = r.gf - r.ga; });
  return rec;
}

/**
 * 조 순위 — 실시간(결과가 들어온 경기만으로).
 * @returns [{ id, rank, played, w, l, gf, ga, diff, tie }] — rank 는 공동이면 같은 숫자
 */
export function standings(group) {
  const ids = group?.entryIds || [];
  const matches = group?.matches || [];
  const rec = tally(ids, matches);
  /* 승수로 먼저 묶고, 같은 승수끼리는 그 팀들끼리 경기만으로 승자승을 따진다 */
  const byWins = new Map();
  Object.values(rec).forEach((r) => {
    if (!byWins.has(r.w)) byWins.set(r.w, []);
    byWins.get(r.w).push(r);
  });
  const ordered = [];
  [...byWins.keys()].sort((a, b) => b - a).forEach((w) => {
    const tied = byWins.get(w);
    if (tied.length === 1) { ordered.push(...tied.map((r) => ({ ...r, h2h: 0 }))); return; }
    const set = new Set(tied.map((r) => r.id));
    const mini = tally([...set], matches.filter((m) => set.has(m.a) && set.has(m.b)));
    tied.map((r) => ({ ...r, h2h: mini[r.id].w }))
      .sort((x, y) => y.h2h - x.h2h || y.diff - x.diff || y.gf - x.gf)
      .forEach((r) => ordered.push(r));
  });
  const same = (x, y) => x.w === y.w && x.h2h === y.h2h && x.diff === y.diff && x.gf === y.gf;
  let rank = 0;
  return ordered.map((r, i) => {
    if (i === 0 || !same(ordered[i - 1], r)) rank = i + 1;
    const tie = (i > 0 && same(ordered[i - 1], r)) || (i < ordered.length - 1 && same(ordered[i + 1], r));
    return { ...r, rank, tie: tie && r.played > 0 };
  });
}

/** 조 진행률 */
export function progress(group) {
  const ms = group?.matches || [];
  const done = ms.filter((m) => m.score).length;
  return { done, total: ms.length, finished: ms.length > 0 && done === ms.length };
}

/** 본선 진출 — 조 1위들 먼저, 그다음 2위들 … (공동 순위는 표 순서대로) */
export function leagueQualifiers(groups, advance = 2) {
  const out = [];
  (groups || []).forEach((g, gi) => standings(g).slice(0, advance).forEach((s, pos) => out.push({ entryId: s.id, groupIndex: gi, rank: pos })));
  return out.sort((a, b) => a.rank - b.rank || a.groupIndex - b.groupIndex);
}

/** 빠른 결과 입력 — 6게임 선승이면 6:0 … 6:5 (5:5 타이브레이크 승은 6:5). 그 밖은 직접 입력 */
export function scoreChoices(games = 6) {
  const g = Math.max(1, Number(games) || 6);
  const win = [];
  for (let l = 0; l < g; l++) win.push([g, l]);
  return win;
}

/** 이름 찾기 — 회원·외부 참가자 함께 */
export function nameLookup(members = [], guests = []) {
  const map = new Map();
  members.forEach((m) => map.set(m.id, m.name));
  guests.forEach((g) => map.set(g.id, g.club ? `${g.name}(${g.club})` : g.name));
  return (id) => map.get(id) || '?';
}

/* ---------------- 외부 공개 보기 ----------------
   앱이 없는 사람에게 보여 줄 것만 — 이름·조·시간표·결과·순위·본선.
   회원 id·전화·신청자 목록·등급 같은 것은 내보내지 않는다(서버 함수 liveTournament 가 쓴다). */
const koRound = (ri, n) => (ri === n - 1 ? '결승' : ri === n - 2 ? '준결승' : `${2 ** (n - ri)}강`);
export function liveView(t, clubName = '') {
  if (!t) return null;
  const nameOf = (id) => (t.entries || []).find((e) => e.id === id)?.name || '';
  const rules = normRules({ ...(t.rules || {}), advance: t.rules?.advance ?? t.advancePerGroup ?? 2 });
  const groups = ensureSchedule(t.groups || [], Number(t.courts) || 2).map((g) => ({
    name: g.name,
    progress: progress(g),
    standings: standings(g).map((r) => ({
      rank: r.rank, tie: r.tie, name: nameOf(r.id), played: r.played, w: r.w, l: r.l, gf: r.gf, ga: r.ga, diff: r.diff,
    })),
    matches: (g.matches || []).map((m) => ({ round: m.round, court: m.court, a: nameOf(m.a), b: nameOf(m.b), score: m.score || null }))
      .sort((x, y) => x.round - y.round || x.court - y.court),
  }));
  const rounds = t.bracket?.rounds || [];
  return {
    name: String(t.name || ''),
    date: String(t.date || ''),
    club: String(clubName || ''),
    status: t.status === 'finished' ? 'finished' : 'ongoing',
    stage: t.stage || '',
    rules: { games: rules.games, advance: rules.advance, play: rules.play },
    rankRule: RANK_RULE_TEXT,
    courts: Number(t.courts) || 2,
    champion: t.championId ? nameOf(t.championId) : '',
    groups,
    bracket: rounds.map((r, ri) => ({
      name: koRound(ri, rounds.length),
      matches: (r.matches || []).map((m) => ({ a: nameOf(m.a), b: nameOf(m.b), score: m.score || null, winner: m.winner ? nameOf(m.winner) : '' })),
    })),
  };
}

export default {
  PLAY, TEAM_MODE, GROUP_METHOD, DEFAULT_RULES, RULE_LABELS, RANK_RULE_TEXT,
  normRules, makeGuest, makeEntries, assignGroups, roundRobin, buildGroupMatches, schedule, buildLeague,
  moveEntry, swapPlayers, setGroupCourts, setScore, ensureSchedule, standings, progress, leagueQualifiers,
  scoreChoices, nameLookup, groupName, liveView,
};
