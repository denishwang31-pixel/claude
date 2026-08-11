/* ============================================================
   대회 대진 엔진 (순수 JS, 무의존)
   구성: [예선 조별리그] → [본선 토너먼트]
   - 예선 사용/미사용 토글(useGroupStage=false 면 토너먼트만)
   - 시드 배정 지원(시드는 서로 다른 조/반대 대진에 분산)
   - 참가 단위는 "팀"(복식 페어 또는 단식 개인) — entries 배열
   entry: { id, name, players:[uid…], seed?:number }
   ============================================================ */

let _seq = 0;
const tid = (p) => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

/* ---------------- 공통 ---------------- */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 시드 우선 정렬(시드 있는 팀 먼저, 낮은 번호 우선), 나머지는 무작위 */
export function orderBySeed(entries) {
  const seeded = entries.filter((e) => e.seed).sort((a, b) => a.seed - b.seed);
  const rest = shuffle(entries.filter((e) => !e.seed));
  return [...seeded, ...rest];
}

/* ---------------- 1) 예선 조별리그 ---------------- */
/**
 * 스네이크 방식으로 시드를 각 조에 분산 배정.
 * @param {Array} entries
 * @param {number} groupCount 조 개수
 * @returns {Array} groups [{ id, name, entryIds:[], matches:[] }]
 */
export function buildGroups(entries, groupCount) {
  const g = Math.max(1, Math.min(groupCount, entries.length));
  const ordered = orderBySeed(entries);
  const groups = Array.from({ length: g }, (_, i) => ({
    id: tid('grp'),
    name: `${String.fromCharCode(65 + i)}조`,
    entryIds: [],
    matches: [],
  }));
  // 스네이크(1→n, n→1 반복): 시드가 조별로 고르게 퍼짐
  ordered.forEach((e, idx) => {
    const row = Math.floor(idx / g);
    const col = idx % g;
    const target = row % 2 === 0 ? col : g - 1 - col;
    groups[target].entryIds.push(e.id);
  });
  // 조별 풀리그(라운드로빈) 경기 생성
  groups.forEach((grp) => {
    for (let i = 0; i < grp.entryIds.length; i++) {
      for (let j = i + 1; j < grp.entryIds.length; j++) {
        grp.matches.push({
          id: tid('gm'), groupId: grp.id,
          a: grp.entryIds[i], b: grp.entryIds[j],
          score: null, // {a:6,b:3}
        });
      }
    }
  });
  return groups;
}

/** 조별 순위 계산: 승수 → 득실차 → 다득점 */
export function groupStandings(group) {
  const rec = {};
  group.entryIds.forEach((id) => { rec[id] = { id, w: 0, l: 0, gf: 0, ga: 0, played: 0 }; });
  group.matches.forEach((m) => {
    if (!m.score) return;
    const { a, b } = m.score;
    if (!rec[m.a] || !rec[m.b]) return;
    rec[m.a].gf += a; rec[m.a].ga += b; rec[m.a].played++;
    rec[m.b].gf += b; rec[m.b].ga += a; rec[m.b].played++;
    if (a > b) { rec[m.a].w++; rec[m.b].l++; } else if (b > a) { rec[m.b].w++; rec[m.a].l++; }
  });
  return Object.values(rec).sort(
    (x, y) => y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf,
  );
}

/** 각 조 상위 N팀 진출자 목록(조 1위끼리 반대편에 놓기 위해 순위 정보 포함) */
export function qualifiers(groups, advancePerGroup = 2) {
  const out = [];
  groups.forEach((g, gi) => {
    groupStandings(g).slice(0, advancePerGroup).forEach((s, rank) => {
      out.push({ entryId: s.id, groupIndex: gi, rank }); // rank 0 = 조1위
    });
  });
  // 조1위들 먼저, 그 다음 조2위… (시드처럼 사용)
  return out.sort((a, b) => a.rank - b.rank || a.groupIndex - b.groupIndex);
}

/* ---------------- 2) 본선 토너먼트 ---------------- */
/** 표준 시드 배치 순서 생성 (1 vs 최하위, 2 vs 차하위 … 재귀적 브래킷) */
function seedOrder(size) {
  let arr = [1, 2];
  while (arr.length < size) {
    const n = arr.length * 2;
    const next = [];
    arr.forEach((v) => { next.push(v, n + 1 - v); });
    arr = next;
  }
  return arr; // 1-indexed 시드 위치
}

/**
 * 토너먼트 브래킷 생성. 참가 팀 수가 2의 거듭제곱이 아니면 상위 시드에 부전승(BYE).
 * @param {Array} entryIds 시드 순서대로 정렬된 참가 ID 배열(앞이 상위 시드)
 * @returns {Object} { rounds: [{ index, matches:[…] }, …] }
 *   ⚠️ Firestore 가 중첩 배열을 지원하지 않으므로 라운드는 객체로 감싼다.
 */
export function buildBracket(entryIds) {
  const n = entryIds.length;
  if (n < 2) return { rounds: [] };
  const size = 2 ** Math.ceil(Math.log2(n)); // 브래킷 크기
  const order = seedOrder(size);
  // 시드 위치에 참가자 배치(없는 자리는 BYE=null)
  const slots = order.map((seedPos) => (seedPos <= n ? entryIds[seedPos - 1] : null));

  const rounds = [];
  let current = [];
  for (let i = 0; i < size; i += 2) {
    current.push({
      id: tid('tm'), round: 1, a: slots[i], b: slots[i + 1], score: null,
      // 한쪽이 BYE 면 자동 진출
      winner: slots[i] && !slots[i + 1] ? slots[i] : (!slots[i] && slots[i + 1] ? slots[i + 1] : null),
    });
  }
  rounds.push({ index: 0, matches: current });

  let roundNo = 2;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push({
        id: tid('tm'), round: roundNo,
        a: current[i].winner || null,
        b: current[i + 1]?.winner || null,
        score: null, winner: null,
        fromA: current[i].id, fromB: current[i + 1]?.id || null,
      });
    }
    rounds.push({ index: roundNo - 1, matches: next });
    current = next;
    roundNo++;
  }
  return { rounds };
}

/** 라운드 이름(결승/준결승/8강…). roundIndex 는 0-based */
export function roundName(roundIndex, totalRounds) {
  const fromEnd = totalRounds - 1 - roundIndex; // 0 = 결승
  if (fromEnd === 0) return '결승';
  if (fromEnd === 1) return '준결승';
  return `${2 ** (fromEnd + 1)}강`;
}

/** 승자 입력 후 다음 라운드에 전파 */
export function applyResult(bracket, matchId, scoreA, scoreB) {
  const rounds = bracket.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m })) }));
  let found = null, ri = -1, mi = -1;
  rounds.forEach((r, i) => r.matches.forEach((m, j) => { if (m.id === matchId) { found = m; ri = i; mi = j; } }));
  if (!found) return bracket;

  found.score = { a: scoreA, b: scoreB };
  found.winner = scoreA > scoreB ? found.a : found.b;

  // 다음 라운드 슬롯 갱신
  if (ri + 1 < rounds.length) {
    const nextMatch = rounds[ri + 1].matches[Math.floor(mi / 2)];
    if (nextMatch) {
      if (mi % 2 === 0) nextMatch.a = found.winner;
      else nextMatch.b = found.winner;
      // 상대 자리가 아예 없는(부전승) 경우 자동 진출
      if (nextMatch.a && !nextMatch.b && !rounds[ri].matches[mi + 1]) nextMatch.winner = nextMatch.a;
    }
  }
  return { ...bracket, rounds };
}

/** 우승자 (결승 승자) */
export function championOf(bracket) {
  const last = bracket?.rounds?.[bracket.rounds.length - 1];
  return last?.matches?.[0]?.winner || null;
}

/* ---------------- 3) 참가팀 자동 구성 도우미 ---------------- */
/**
 * 참가 인원(회원)에서 복식 팀을 자동 구성.
 * mode: 'random' | 'balanced'(NTRP 상·하위 매칭) | 'manual'
 * @param {Array} players [{id,name,ntrp}]
 * @param {string} mode
 */
export function autoTeams(players, mode = 'balanced') {
  const list = [...players];
  if (list.length < 2) return [];
  const teams = [];
  if (mode === 'balanced') {
    // NTRP 높은 순 정렬 후 상위-하위 짝짓기(팀 평균 실력 균등화)
    const sorted = list.sort((a, b) => (b.ntrp || 3) - (a.ntrp || 3));
    while (sorted.length >= 2) {
      const top = sorted.shift();
      const bottom = sorted.pop();
      teams.push([top, bottom]);
    }
    if (sorted.length === 1) teams.push([sorted[0]]);
  } else {
    const s = shuffle(list);
    while (s.length >= 2) teams.push([s.shift(), s.shift()]);
    if (s.length === 1) teams.push([s[0]]);
  }
  return teams.map((t, i) => ({
    id: tid('e'),
    name: t.map((p) => p.name).join(' / '),
    players: t.map((p) => p.id),
    seed: null,
    _index: i,
  }));
}
