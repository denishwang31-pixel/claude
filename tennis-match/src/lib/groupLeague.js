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
  perTeam: 0,         // 조 안 팀당 경기 수 — 0 이면 풀리그(모두 한 번씩)
  format: 'league',   // league(팀 고정 조별리그) | kdk(개인전, 매 경기 파트너 교체)
  knockout: true,     // false 면 조별리그만(본선 없이 조 순위로 끝)
  byDiv: {},          // 부마다 다르게(필요할 때만) — { MD: { groupCount: 2, advance: 4 }, WD: { advance: 2 } }
  groupAdvance: {},   // 조마다 다르게(필요할 때만) — { [조 id]: 3 }
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
  x.perTeam = Math.max(0, Math.min(20, Math.round(Number(x.perTeam) || 0)));   // 0 = 풀리그
  x.format = x.format === 'kdk' ? 'kdk' : 'league';                              // 팀 고정 조별리그 / KDK
  x.knockout = x.knockout !== false;
  /* 부·조마다 따로 — 숫자로 정한 값만 남긴다(빈칸 = 대회 기본값) */
  const num = (v, min) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.max(min, Math.round(Number(v))));
  const byDiv = {};
  Object.entries(x.byDiv || {}).forEach(([k, v]) => {
    const gc = num(v?.groupCount, 1);
    const ad = num(v?.advance, 0);
    if (gc != null || ad != null) byDiv[k] = { ...(gc != null ? { groupCount: gc } : {}), ...(ad != null ? { advance: ad } : {}) };
  });
  x.byDiv = byDiv;
  const ga = {};
  Object.entries(x.groupAdvance || {}).forEach(([k, v]) => { const n = num(v, 0); if (n != null) ga[k] = n; });
  x.groupAdvance = ga;
  return x;
}

/** 한 부의 기준 — 부마다 따로 정한 조 개수·본선 진출이 있으면 그것으로 */
export function divRules(rules, div) {
  const r = normRules(rules);
  const o = r.byDiv[div] || {};
  return { ...r, ...(o.groupCount != null ? { groupCount: o.groupCount } : {}), ...(o.advance != null ? { advance: o.advance } : {}) };
}

/** 이 조에서 본선에 올라가는 팀 수 — 조별 지정 > 부별 지정 > 대회 기본. 조별리그만이면 0 */
export function advanceOf(rules, g) {
  const r = normRules(rules);
  if (!r.knockout) return 0;
  if (g?.id && r.groupAdvance[g.id] != null) return r.groupAdvance[g.id];
  return divRules(r, g?.div).advance;
}

/** 본선 크기 — 진출 팀 수 → 몇 강(2의 거듭제곱)·부전승 수 */
export function bracketPlan(n) {
  if (n < 2) return { teams: n, size: 0, byes: 0 };
  const size = 2 ** Math.ceil(Math.log2(n));
  return { teams: n, size, byes: size - n };
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

/**
 * 팀당 경기 수를 정한 조 경기 짝 — 부분 리그(partial round robin).
 *
 * 한 조 5팀 풀리그면 팀마다 4경기, 6팀이면 5경기라 시간이 모자라기 쉽다. 그래서
 * 「팀당 k경기」로 줄인다. 무작위로 고르지 않고 원형 돌리기 순서(1↔꼴찌, 2↔꼴찌-1 …)
 * 를 앞에서 k라운드만 쓴다 — 조 안이 실력순이라 첫 라운드는 강약이 섞이고, 라운드가
 * 지날수록 상대가 고르게 바뀐다. 홀수 조처럼 쉬는 팀이 생겨 k경기를 못 채운 팀은
 * 아직 안 만난 팀 중 경기 수가 적은 팀과 이어 준다(같은 짝 두 번은 없다).
 * forced: 이미 결과가 있는 짝 — 다시 짜도 빠지지 않게 먼저 넣는다.
 * @returns [[a,b,라운드번호], …]
 */
export function partialPairs(ids, k, forced = []) {
  const n = ids.length;
  const games = Object.fromEntries(ids.map((id) => [id, 0]));
  const used = new Set();
  const out = [];
  const add = (a, b, rr) => {
    const key = pairKey(a, b);
    if (a === b || used.has(key) || !(a in games) || !(b in games)) return false;
    used.add(key); games[a] += 1; games[b] += 1; out.push([a, b, rr]);
    return true;
  };
  forced.forEach(([a, b]) => add(a, b, 1));
  if (!k || k >= n - 1) {
    roundRobin(ids).forEach((pairs, ri) => pairs.forEach(([a, b]) => add(a, b, ri + 1)));
    return out;
  }
  roundRobin(ids).forEach((pairs, ri) => pairs.forEach(([a, b]) => {
    if (games[a] < k && games[b] < k) add(a, b, ri + 1);
  }));
  /* 못 채운 팀 — 아직 안 만난, 경기가 적은 팀끼리 */
  let guard = 0;
  for (;;) {
    const short = ids.filter((id) => games[id] < k).sort((a, b) => games[a] - games[b]);
    if (!short.length || guard++ > n * k) break;
    const a = short[0];
    const cand = ids.filter((b) => b !== a && !used.has(pairKey(a, b)))
      .sort((x, y) => (games[x] < k ? 0 : 1) - (games[y] < k ? 0 : 1) || games[x] - games[y]);
    /* 짝이 없거나(모두 만났거나) 홀수라 혼자 남으면 그 팀만 하나 모자란 채로 둔다 */
    const b = cand.find((x) => games[x] < k) || (short.length === 1 ? null : cand[0]);
    if (!b) break;
    add(a, b, k + 1);
  }
  return out;
}

/** 조의 경기를 (다시) 만든다 — 이미 결과가 있는 짝은 결과를 그대로 살린다.
    group.perTeam 이 있으면 팀당 그 경기 수(부분 리그), 없으면 풀리그 */
export function buildGroupMatches(group, old = []) {
  const scored = (old || []).filter((m) => m.score && group.entryIds.includes(m.a) && group.entryIds.includes(m.b));
  const keep = new Map(scored.map((m) => [pairKey(m.a, m.b), m]));
  const k = Number(group.perTeam) || 0;
  return partialPairs(group.entryIds, k, scored.map((m) => [m.a, m.b])).map(([a, b, rr]) => {
    const prev = keep.get(pairKey(a, b));
    return {
      id: prev?.id || uid('gm'), groupId: group.id, a, b, rr,
      score: prev ? (prev.a === a ? prev.score : { a: prev.score.b, b: prev.score.a }) : null,
    };
  });
}

/* ---------------- 시간표 (타임 × 코트) ----------------
   courts: 전체 코트 수. 조에 courts:[1,2] 를 정해 두면 그 조는 그 코트에서만 돈다
   (「A조는 1·2코트, B조는 3·4코트」처럼 조별로 따로 진행).
   같은 타임에 한 팀이 두 경기에 들어가지 않게, 풀리그 라운드 순서를 지키며 채운다. */
export function schedule(groups, courts = 2, { playersOf = null } = {}) {
  const total = Math.max(1, Math.round(Number(courts) || 1));
  const allCourts = Array.from({ length: total }, (_, i) => i + 1);
  /* 같은 타임에 겹치면 안 되는 사람 — 여러 부(남복·혼복)에 함께 나가는 사람도 있다.
     playersOf 를 주면 선수 단위로, 없으면 팀 단위로 본다. */
  const who = (id) => (playersOf ? (playersOf(id) || [id]) : [id]);
  const own = (g) => {
    const cs = (g.courts || []).map(Number).filter((c) => c >= 1 && c <= total);
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
  /* 조를 번갈아 가며 라운드 순으로 줄 세운다 — 한 조만 먼저 끝나지 않게 */
  lanes.forEach((lane) => {
    const q = [];
    const maxRr = Math.max(0, ...lane.groups.flatMap((g) => g.matches.map((m) => m.rr || 1)));
    for (let r = 1; r <= maxRr; r++) lane.groups.forEach((g) => g.matches.filter((m) => (m.rr || 1) === r).forEach((m) => q.push(m)));
    lane.queue = q;
  });
  /* 타임을 하나씩 — 모든 줄(lane)이 같은 시계를 쓴다(한 사람이 두 코트에 동시에 서지 않게) */
  let slot = 0;
  while (lanes.some((l) => l.queue.length) && slot < 500) {
    slot += 1;
    const busy = new Set();
    lanes.forEach((lane) => {
      let ci = 0;
      for (let i = 0; i < lane.queue.length && ci < lane.courts.length;) {
        const m = lane.queue[i];
        const ps = [...who(m.a), ...who(m.b)];
        if (ps.some((p) => busy.has(p))) { i += 1; continue; }
        m.round = slot; m.court = lane.courts[ci]; ci += 1;
        ps.forEach((p) => busy.add(p));
        lane.queue.splice(i, 1);
      }
    });
  }
  return out;
}

/** 처음부터 끝까지 — 참가자 → 팀 → 조 → 경기 → 시간표 */
export function buildLeague(players, rulesIn, { courts = 2, pairs = [], seeds = {} } = {}, rnd = Math.random) {
  const rules = normRules(rulesIn);
  const entries = makeEntries(players, { play: rules.play, teamMode: rules.teamMode, pairs }, rnd)
    .map((e) => ({ ...e, seed: seeds[e.players.join('+')] || null }));
  const groups = assignGroups(entries, rules, rnd).map((g) => {
    const ng = rules.perTeam ? { ...g, perTeam: rules.perTeam } : g;
    return { ...ng, matches: buildGroupMatches(ng) };
  });
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

/** 선수 바꾸기 — to 가 이 부의 다른 팀에 있으면 두 사람을 맞바꾸고, 대진 밖 사람이면 그 자리에 넣는다.
    경기를 한 팀은 바꿀 수 없다(결과가 다른 사람 것이 된다). entries 는 한 부의 팀만 넘긴다. */
export function replacePlayer(entries, groups, from, to, nameOf = (id) => id) {
  if (!from || !to || from === to) return { entries, error: '' };
  const e1 = entries.find((e) => e.players.includes(from));
  if (!e1) return { entries, error: '바꿀 선수를 찾지 못했습니다' };
  if (e1.players.includes(to)) return { entries, error: '같은 팀 안의 두 사람입니다' };
  const e2 = entries.find((e) => e.players.includes(to));
  if (e2) return swapPlayers(entries, groups, from, to, nameOf);
  const played = groups.some((g) => (g.matches || []).some((m) => m.score && (m.a === e1.id || m.b === e1.id)));
  if (played) return { entries, error: '이미 경기를 한 팀은 선수를 바꿀 수 없습니다' };
  const players = e1.players.map((p) => (p === from ? to : p));
  return { entries: entries.map((e) => (e.id === e1.id ? { ...e, players, name: players.map(nameOf).join(' / ') } : e)), error: '' };
}

/** 팀을 손으로 넣기 — 대진에서 빠진 사람(짝 없음·늦게 온 사람)을 짝지어 조에 넣는다 */
export function addTeam(entries, groups, { div = '', players = [], groupId, nameOf = (id) => id }) {
  const ps = [...new Set(players)].filter(Boolean);
  if (!ps.length) return { entries, groups, error: '선수를 고르세요' };
  const g = groups.find((x) => x.id === groupId);
  if (!g) return { entries, groups, error: '조를 고르세요' };
  const inDiv = new Set(entries.filter((e) => (e.div || '') === (div || '')).flatMap((e) => e.players));
  if (ps.some((p) => inDiv.has(p))) return { entries, groups, error: '이미 이 부의 다른 팀에 있는 사람입니다' };
  const e = { id: uid('e'), name: ps.map(nameOf).join(' / '), players: ps, seed: null, skill: 3, ...(div ? { div } : {}) };
  const ng = { ...g, entryIds: [...g.entryIds, e.id] };
  return {
    entries: [...entries, e],
    groups: groups.map((x) => (x.id !== g.id ? x : { ...ng, matches: buildGroupMatches(ng, g.matches).map((m) => (div ? { ...m, div } : m)) })),
    error: '',
  };
}

/** 팀 빼기 — 결과가 있는 팀은 못 뺀다 */
export function removeTeam(entries, groups, entryId) {
  const g = groups.find((x) => x.entryIds.includes(entryId));
  if (g && (g.matches || []).some((m) => m.score && (m.a === entryId || m.b === entryId))) {
    return { entries, groups, error: '이미 경기를 한 팀은 뺄 수 없습니다' };
  }
  return {
    entries: entries.filter((e) => e.id !== entryId),
    groups: groups.map((x) => {
      if (!x.entryIds.includes(entryId)) return x;
      const ng = { ...x, entryIds: x.entryIds.filter((id) => id !== entryId) };
      return { ...ng, matches: buildGroupMatches(ng, x.matches).map((m) => (x.div ? { ...m, div: x.div } : m)) };
    }),
    error: '',
  };
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
  /* 팀마다 잡힌 경기 수가 다르면(홀수 조 부분 리그) 승수 대신 승률로 — 한 경기 더 친 팀이
     승수만으로 앞서지 않게. 같으면 승수 그대로 */
  const sched = {};
  ids.forEach((id) => { sched[id] = 0; });
  matches.forEach((m) => { if (m.a in sched) sched[m.a]++; if (m.b in sched) sched[m.b]++; });
  const uneven = new Set(Object.values(sched)).size > 1;
  const keyOf = (r) => (uneven ? (sched[r.id] ? Math.round((r.w / sched[r.id]) * 1000) : 0) : r.w);
  /* 승수(승률)로 먼저 묶고, 같은 것끼리는 그 팀들끼리 경기만으로 승자승을 따진다 */
  const byWins = new Map();
  Object.values(rec).forEach((r) => {
    const k = keyOf(r);
    if (!byWins.has(k)) byWins.set(k, []);
    byWins.get(k).push(r);
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
  const same = (x, y) => keyOf(x) === keyOf(y) && x.h2h === y.h2h && x.diff === y.diff && x.gf === y.gf;
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
  /* advance — 숫자(모든 조 같게) 또는 (조) => 숫자(조마다 다르게) */
  (groups || []).forEach((g, gi) => standings(g).slice(0, typeof advance === 'function' ? advance(g) : advance).forEach((s, pos) => out.push({ entryId: s.id, groupIndex: gi, rank: pos })));
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

/* ---------------- 종목(부) ----------------
   대회는 보통 남복·여복·혼복으로 연다. 남복·여복을 함께 고르면 남자부·여자부를
   따로 운영하고 따로 시상한다(부마다 조·순위·본선이 따로).
   남녀 구분 없이 한 부로 하려면 「자유 복식」. */
export const EVENTS = {
  MD: { key: 'MD', name: '남자복식', short: '남복', play: 'doubles', gender: 'M' },
  WD: { key: 'WD', name: '여자복식', short: '여복', play: 'doubles', gender: 'F' },
  XD: { key: 'XD', name: '혼합복식', short: '혼복', play: 'doubles', gender: 'X' },
  OD: { key: 'OD', name: '자유 복식', short: '복식', play: 'doubles', gender: 'any' },
  MS: { key: 'MS', name: '남자단식', short: '남단', play: 'singles', gender: 'M' },
  WS: { key: 'WS', name: '여자단식', short: '여단', play: 'singles', gender: 'F' },
  OS: { key: 'OS', name: '자유 단식', short: '단식', play: 'singles', gender: 'any' },
};
export const EVENT_KEYS = Object.keys(EVENTS);
/** 예전 대회(종목 없이 한 부) */
export const LEGACY = 'ALL';
export const eventOf = (k) => EVENTS[k] || { key: LEGACY, name: '', short: '', play: 'doubles', gender: 'any' };

/** 이 부에 나갈 수 있는 사람 — 성별로 거르고, 운영진이 뺀 사람은 제외 */
export function eligible(players, evKey, excluded = []) {
  const ev = eventOf(evKey);
  const out = new Set(excluded || []);
  return (players || []).filter((p) => {
    if (out.has(p.id)) return false;
    if (ev.gender === 'M') return p.gender === 'M';
    if (ev.gender === 'F') return p.gender === 'F';
    if (ev.gender === 'X') return p.gender === 'M' || p.gender === 'F';
    return true;
  });
}

/** 혼복 짝 — 남녀 한 명씩. 균등이면 잘하는 남자 + 덜 잘하는 여자 식으로 팀 평균을 고르게 */
function mixedEntries(players, teamMode, rnd) {
  const sk = (p) => Number(p.skill) || 3;
  let men = players.filter((p) => p.gender === 'M');
  let women = players.filter((p) => p.gender === 'F');
  if (teamMode === TEAM_MODE.RANDOM) { men = shuffle(men, rnd); women = shuffle(women, rnd); } else {
    men = [...men].sort((a, b) => sk(b) - sk(a));
    women = [...women].sort((a, b) => sk(a) - sk(b));
  }
  const teams = [];
  const n = Math.min(men.length, women.length);
  for (let i = 0; i < n; i++) teams.push([men[i], women[i]]);
  [...men.slice(n), ...women.slice(n)].forEach((p) => teams.push([p]));   // 짝이 없는 사람 — 운영진이 고친다
  return teams.map(entryOf);
}

/**
 * 한 부의 대진 — 팀 → 조 → 조별 경기 (시간표는 drawAll 이 모든 부를 함께 짠다)
 * @returns { entries, groups, problem }
 */
export function drawDivision(players, rulesIn, evKey, { excluded = [], useGroups = true } = {}, rnd = Math.random) {
  const ev = eventOf(evKey);
  const rules = normRules({ ...rulesIn, play: ev.play });
  const ps = eligible(players, evKey, excluded);
  const need = ev.play === PLAY.SINGLES ? 2 : 4;
  if (ps.length < need) return { entries: [], groups: [], problem: `${ev.name || '참가자'} ${ps.length}명 — ${need}명 이상 필요` };
  const base = ev.gender === 'X'
    ? mixedEntries(ps, rules.teamMode, rnd)
    : makeEntries(ps, { play: ev.play, teamMode: rules.teamMode === TEAM_MODE.MANUAL ? TEAM_MODE.BALANCED : rules.teamMode }, rnd);
  /* 복식인데 짝이 없는 사람(홀수·혼복 남녀 수 차이)은 대진에서 빼고 알린다 —
     혼자인 팀이 조에 들어가면 그 경기는 치를 수가 없다. 운영진이 외부 참가자를
     더하거나 수기로 짝을 지어 준다. */
  const solo = ev.play === PLAY.DOUBLES ? base.filter((e) => e.players.length < 2) : [];
  const entries = base.filter((e) => !solo.includes(e)).map((e) => ({ ...e, div: ev.key }));
  const notice = solo.length ? `${ev.name}: 짝이 없어 빠진 사람 — ${solo.map((e) => e.name).join(', ')}` : '';
  if (entries.length < 2) return { entries: [], groups: [], problem: `${ev.name} 팀이 2팀 이상이어야 합니다`, notice };
  if (!useGroups) return { entries, groups: [], problem: '', notice };
  const groups = assignGroups(entries, rules, rnd).map((g) => {
    const ng = { ...g, div: ev.key, ...(rules.perTeam ? { perTeam: rules.perTeam } : {}) };
    return { ...ng, matches: buildGroupMatches(ng).map((m) => ({ ...m, div: ev.key })) };
  });
  return { entries, groups, problem: '', notice };
}

/** 선수 → 그 선수가 든 팀들의 선수(시간표 겹침 검사용) */
export const playersOfFn = (entries) => {
  const map = new Map((entries || []).map((e) => [e.id, e.players || [e.id]]));
  return (id) => map.get(id) || [id];
};

/**
 * 대회 전체 대진 작성 — 고른 종목(부)마다 따로 짜고, 시간표는 코트를 나눠 쓰며 함께 짠다.
 * @param roster  [{ id, name, gender, skill, tgrade }] (회원 + 외부 참가자)
 * @returns { entries, groups, problems:[문구] }
 */
export function drawAll(roster, rulesIn, events, { courts = 2, excluded = {}, useGroups = true } = {}, rnd = Math.random) {
  const entries = [];
  const groups = [];
  const problems = [];
  (events || []).forEach((k) => {
    const r = drawDivision(roster, divRules(rulesIn, k), k, { excluded: excluded[k] || [], useGroups }, rnd);
    if (r.problem) problems.push(r.problem);
    if (r.notice) problems.push(r.notice);
    entries.push(...r.entries);
    groups.push(...r.groups);
  });
  return { entries, groups: schedule(groups, courts, { playersOf: playersOfFn(entries) }), problems };
}

/** 부 하나만 다시 짠다 — 다른 부의 대진·결과는 그대로, 시간표만 함께 다시 */
export function redrawDivision(t, evKey, roster, rulesIn, { courts = 2, excluded = [], useGroups = true } = {}, rnd = Math.random) {
  const r = drawDivision(roster, divRules(rulesIn, evKey), evKey, { excluded, useGroups }, rnd);
  const entries = [...(t.entries || []).filter((e) => e.div !== evKey), ...r.entries];
  const groups = [...(t.groups || []).filter((g) => g.div !== evKey), ...r.groups];
  return { entries, groups: schedule(groups, courts, { playersOf: playersOfFn(entries) }), problem: [r.problem, r.notice].filter(Boolean).join(' · ') };
}

/* ---------------- KDK 부 (개인전) ----------------
   t.kdk[부] = { players:[{id,name,gender}], matches:[{id,round,court,group,teamA,teamB,score}] }
   만드는 쪽은 src/lib/tournamentKdk.js. 순위 계산만 여기 두는 이유: 외부 공개 함수도 써야 해서.
   순위 — 승수 → 게임 득실차 → 득게임 (KDK 는 파트너가 바뀌어 승자승을 따질 수 없다) */
export function kdkTables(d) {
  const players = d?.players || [];
  const matches = d?.matches || [];
  const gOf = {};
  matches.forEach((m) => [...(m.teamA || []), ...(m.teamB || [])].forEach((id) => { gOf[id] = Number(m.group) || 0; }));
  const gis = [...new Set(Object.values(gOf))].sort((a, b) => a - b);
  return gis.map((gi) => {
    const ms = matches.filter((m) => (Number(m.group) || 0) === gi);
    const rec = {};
    players.filter((p) => gOf[p.id] === gi).forEach((p) => { rec[p.id] = { id: p.id, name: p.name, played: 0, w: 0, l: 0, gf: 0, ga: 0 }; });
    ms.forEach((m) => {
      if (!m.score) return;
      [[m.teamA, m.score.a, m.score.b], [m.teamB, m.score.b, m.score.a]].forEach(([team, f, a]) => (team || []).forEach((id) => {
        const r = rec[id];
        if (!r) return;
        r.played++; r.gf += f; r.ga += a;
        if (f > a) r.w++; else r.l++;
      }));
    });
    const rows = Object.values(rec).map((r) => ({ ...r, diff: r.gf - r.ga }))
      .sort((x, y) => y.w - x.w || y.diff - x.diff || y.gf - x.gf);
    const same = (x, y) => x.w === y.w && x.diff === y.diff && x.gf === y.gf;
    let rank = 0;
    return {
      gi,
      name: gis.length > 1 ? groupName(gi) : '',
      matches: ms,
      progress: { done: ms.filter((m) => m.score).length, total: ms.length, finished: ms.length > 0 && ms.every((m) => m.score) },
      standings: rows.map((r, i) => {
        if (i === 0 || !same(rows[i - 1], r)) rank = i + 1;
        const tie = (i > 0 && same(rows[i - 1], r)) || (i < rows.length - 1 && same(rows[i + 1], r));
        return { ...r, rank, tie: tie && r.played > 0 };
      }),
    };
  });
}
export const KDK_RANK_TEXT = '개인 승수 → 게임 득실차 → 득게임 순';

/** KDK 경기 결과 바꾸기 */
export function setKdkScore(kdk, div, matchId, score) {
  const d = kdk?.[div];
  if (!d) return kdk;
  return { ...kdk, [div]: { ...d, matches: d.matches.map((m) => (m.id === matchId ? { ...m, score: score || null } : m)) } };
}

/** 조별리그만 — 끝난 조의 1위(부에 조가 하나면 그 부 우승). 본선이 있는 대회는 빈 목록 */
export function leagueChampions(t, rulesIn) {
  const rules = normRules(rulesIn || t?.rules);
  if (rules.knockout || t?.useGroupStage === false) return [];
  const gs = t?.groups || [];
  const out = [];
  [...new Set(gs.map((g) => g.div || ''))].forEach((div) => {
    const mine = gs.filter((g) => (g.div || '') === div);
    mine.forEach((g) => {
      if (!progress(g).finished) return;
      const top = standings(g)[0];
      if (top) out.push({ div, groupName: mine.length > 1 ? g.name : '', entryId: top.id });
    });
  });
  return out;
}

/* ---------------- 외부 공개 보기 ----------------
   앱이 없는 사람에게 보여 줄 것만 — 이름·조·시간표·결과·순위·본선.
   회원 id·전화·신청자 목록·등급 같은 것은 내보내지 않는다(서버 함수 liveTournament 가 쓴다). */
const koRound = (ri, n) => (ri === n - 1 ? '결승' : ri === n - 2 ? '준결승' : `${2 ** (n - ri)}강`);
export function liveView(t, clubName = '') {
  if (!t) return null;
  const nameOf = (id) => (t.entries || []).find((e) => e.id === id)?.name || '';
  const rules = normRules({ ...(t.rules || {}), advance: t.rules?.advance ?? t.advancePerGroup ?? 2 });
  const label = (div, n) => (div && div !== LEGACY && eventOf(div).short ? `${eventOf(div).name} ${n}` : n);
  const groups = ensureSchedule(t.groups || [], Number(t.courts) || 2).map((g) => ({
    name: label(g.div, g.name),
    advance: advanceOf(rules, g),     // 이 조 본선 진출 수(조마다 다를 수 있음, 조별리그만이면 0)
    progress: progress(g),
    standings: standings(g).map((r) => ({
      rank: r.rank, tie: r.tie, name: nameOf(r.id), played: r.played, w: r.w, l: r.l, gf: r.gf, ga: r.ga, diff: r.diff,
    })),
    matches: (g.matches || []).map((m) => ({ round: m.round, court: m.court, a: nameOf(m.a), b: nameOf(m.b), score: m.score || null }))
      .sort((x, y) => x.round - y.round || x.court - y.court),
  }));
  /* KDK 부 — 개인 순위를 같은 모양으로(팀 이름 자리에 "갑·을") */
  Object.entries(t.kdk || {}).forEach(([div, d]) => {
    const pn = (id) => (d.players || []).find((p) => p.id === id)?.name || '';
    const team = (ids) => (ids || []).map(pn).join('·');
    kdkTables(d).forEach((g) => groups.push({
      name: [div !== LEGACY ? eventOf(div).name : '', g.name, 'KDK 개인전'].filter(Boolean).join(' '),
      kind: 'kdk',      // 개인 순위 — 본선 진출 표시 없음
      progress: g.progress,
      standings: g.standings.map((r) => ({
        rank: r.rank, tie: r.tie, name: r.name, played: r.played, w: r.w, l: r.l, gf: r.gf, ga: r.ga, diff: r.diff,
      })),
      matches: g.matches.map((m) => ({ round: m.round, court: m.court, a: team(m.teamA), b: team(m.teamB), score: m.score || null }))
        .sort((x, y) => x.round - y.round || x.court - y.court),
    }));
  });
  /* 본선 — 예전 대회는 t.bracket 하나, 부가 있는 대회는 부마다 t.ko[부] */
  const kos = [
    ...(t.bracket?.rounds?.length ? [{ div: '', bracket: t.bracket, championId: t.championId }] : []),
    ...Object.entries(t.ko || {}).filter(([, v]) => v?.bracket?.rounds?.length).map(([div, v]) => ({ div, ...v })),
  ];
  return {
    name: String(t.name || ''),
    date: String(t.date || ''),
    club: String(clubName || ''),
    status: t.status === 'finished' ? 'finished' : 'ongoing',
    stage: t.stage || '',
    rules: { games: rules.games, advance: rules.advance, play: rules.play },
    rankRule: Object.keys(t.kdk || {}).length && !(t.groups || []).length ? KDK_RANK_TEXT : RANK_RULE_TEXT,
    courts: Number(t.courts) || 2,
    champion: [
      ...kos.filter((k) => k.championId).map((k) => (k.div ? `${eventOf(k.div).name} ${nameOf(k.championId)}` : nameOf(k.championId))),
      ...leagueChampions(t, rules).map((c) => `${c.div ? `${eventOf(c.div).name} ` : ''}${c.groupName ? `${c.groupName} ` : ''}${nameOf(c.entryId)}`),
    ].join(' · '),
    groups,
    /* 부별 본선 — 사다리 그림용(라운드 순서·경기 위치를 그대로). r 라운드 i 경기의 승자 → r+1 라운드 i/2 경기 */
    kos: kos.map((k) => ({
      name: k.div && k.div !== LEGACY ? eventOf(k.div).name : '',
      champion: k.championId ? nameOf(k.championId) : '',
      rounds: k.bracket.rounds.map((r, ri) => ({
        name: koRound(ri, k.bracket.rounds.length),
        matches: (r.matches || []).map((m) => ({ a: nameOf(m.a), b: nameOf(m.b), score: m.score || null, winner: m.winner ? (m.winner === m.a ? 'a' : 'b') : '' })),
      })),
    })),
    /* 예전 페이지용 평평한 목록(새 페이지는 kos 를 쓴다) */
    bracket: kos.flatMap((k) => k.bracket.rounds.map((r, ri) => ({
      name: label(k.div, koRound(ri, k.bracket.rounds.length)),
      matches: (r.matches || []).map((m) => ({ a: nameOf(m.a), b: nameOf(m.b), score: m.score || null, winner: m.winner ? nameOf(m.winner) : '' })),
    }))),
  };
}

export default {
  PLAY, TEAM_MODE, GROUP_METHOD, DEFAULT_RULES, RULE_LABELS, RANK_RULE_TEXT,
  normRules, makeGuest, makeEntries, assignGroups, roundRobin, buildGroupMatches, schedule, buildLeague,
  moveEntry, swapPlayers, replacePlayer, divRules, advanceOf, bracketPlan, leagueChampions, setGroupCourts, setScore, ensureSchedule, standings, progress, leagueQualifiers,
  scoreChoices, nameLookup, groupName, liveView, partialPairs, kdkTables, setKdkScore, KDK_RANK_TEXT,
  EVENTS, EVENT_KEYS, LEGACY, eventOf, eligible, drawDivision, drawAll, redrawDivision, playersOfFn, addTeam, removeTeam,
};
