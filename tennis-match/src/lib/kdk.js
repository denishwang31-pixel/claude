/* ============================================================
   KDK 대진 (개인전 방식)

   KDK 가 뭔가
     동호회 월례대회에서 가장 많이 쓰는 개인전 대진 방식이다.
     고정 파트너 없이 매 경기 파트너가 바뀌고, 참가자 전원이 같은 경기 수를
     치른 뒤 개인 성적(승수 → 득실)으로 순위를 낸다.
     "누구랑 쳐도 실력이 드러난다"는 게 이 방식의 취지라, 파트너가 겹치지
     않는 것이 가장 중요한 규칙이다.

   이 파일이 보장하는 것 (KDK 의 핵심 성질)
     1. 전원 경기 수 동일
     2. 같은 파트너 재조합 최소화 — 가능한 경우 0회
     3. 같은 상대 재대결 최소화
     4. 연속 출전/연속 휴식 쏠림 최소화

   구현 방식
     5·6·7·8명 조는 동호회에서 쓰는 표준 배열이 이미 굳어 있어 그대로 표로
     넣었다(KDK_TABLES). 그 밖의 인원은 같은 성질을 목표로 하는 생성기가
     만들어 낸다. 표가 있는 인원은 표를 쓰는 게 안전하다 — 회원들이 이미
     익숙한 순서라 "왜 저 사람이랑 또 치냐"는 말이 안 나온다.

   반환 형식은 기존 대진 엔진(generateMatchesV5)과 동일하다.
     { id, round, court, type, teamA:[id,id], teamB:[id,id], score:null }
   ============================================================ */

/* ------------------------------------------------------------
   표준 KDK 표 — 인덱스(0-based)로 표기
   각 항목: [[a,b],[c,d]]  = ab팀 vs cd팀
   ------------------------------------------------------------ */
export const KDK_TABLES = {
  // 4명 3경기 — 각자 3경기. 나머지 3명 전원과 한 번씩 짝
  4: [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ],
  // 5명 5경기 — 각자 4경기, 1경기 휴식. 모든 사람과 정확히 1번씩 파트너
  5: [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 4]],
    [[0, 3], [2, 4]],
    [[1, 2], [3, 4]],
    [[0, 4], [1, 3]],
  ],
  // 6명 6경기 — 각자 4경기, 2경기 휴식. 파트너 중복 0
  // (6명은 서로 다른 5명 중 4명과만 짝이 된다 — 안 만나는 짝 3쌍이 서로 겹치지 않게 잡았다)
  6: [
    [[0, 1], [2, 4]],
    [[0, 2], [3, 5]],
    [[0, 4], [2, 3]],
    [[0, 5], [1, 3]],
    [[1, 2], [4, 5]],
    [[1, 5], [3, 4]],
  ],
  // 7명 7경기 — 각자 4경기, 3경기 휴식. 파트너 중복 0
  7: [
    [[0, 2], [1, 3]],
    [[0, 3], [1, 4]],
    [[0, 4], [1, 5]],
    [[0, 5], [1, 6]],
    [[2, 4], [3, 6]],
    [[2, 6], [3, 5]],
    [[2, 5], [4, 6]],
  ],
  // 8명 8경기 — 각자 4경기
  8: [
    [[0, 1], [2, 3]],
    [[4, 5], [6, 7]],
    [[0, 2], [1, 3]],
    [[4, 6], [5, 7]],
    [[0, 4], [1, 5]],
    [[2, 6], [3, 7]],
    [[0, 6], [1, 7]],
    [[2, 4], [3, 5]],
  ],
};

/** 표가 있는 인원인지 */
export const hasKdkTable = (n) => !!KDK_TABLES[n];

/* ------------------------------------------------------------
   조 나누기

   KDK 대회는 인원이 많으면 한 덩어리로 돌리지 않는다. 4~8명짜리 조로
   쪼갠 뒤 각 조에서 표준 표를 돌리고, 조별로 순위를 낸다.
   (인원 전체를 한 판으로 엮으면 파트너가 겹치기 시작하고, 코트 회전도
    꼬여서 실제 운영이 안 된다)

   조 크기를 4~8로 잡으면 어떤 인원이든 표가 있는 크기로 떨어진다.
     9명 → 5+4 · 12명 → 6+6 · 20명 → 7+7+6 · 24명 → 8+8+8
   ------------------------------------------------------------ */
export function splitKdkGroups(n, preferred = 8) {
  if (n < 4) return [];
  const g = Math.max(1, Math.ceil(n / preferred));
  const base = Math.floor(n / g);
  const rem = n % g;
  return Array.from({ length: g }, (_, i) => base + (i < rem ? 1 : 0));
}

/** 이 인원이면 몇 경기짜리 조가 되는지 안내용 */
export function kdkPlan(n) {
  const table = KDK_TABLES[n];
  if (table) {
    const per = {};
    table.forEach(([a, b]) => [...a, ...b].forEach((i) => { per[i] = (per[i] || 0) + 1; }));
    const games = Math.min(...Object.values(per));
    return { players: n, matches: table.length, gamesPerPlayer: games, standard: true };
  }
  if (n < 4) return null;
  const matches = n;                       // 인원 수만큼 경기 (관행)
  const gamesPerPlayer = Math.floor((matches * 4) / n);
  return { players: n, matches, gamesPerPlayer, standard: false };
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/* ------------------------------------------------------------
   생성기 — 표가 없는 인원용

   경기 수 균등이 KDK 의 첫 번째 약속이라, 이건 벌점이 아니라 "상한"으로
   강제한다. 총 출전 슬롯(경기수 × 4)을 인원으로 나눈 값을 1인 상한으로 두고,
   상한에 닿은 사람은 후보에서 아예 뺀다. 그 제약 안에서 파트너 중복 →
   상대 중복 순으로 벌점이 낮은 조합을 고른다.
   (예전엔 셋 다 벌점으로만 다뤄서, 파트너 중복을 피하려다 특정 인원이
    3경기, 다른 인원이 5경기를 뛰는 편차가 생겼다)
   ------------------------------------------------------------ */
function buildByGenerator(n, matchCount) {
  const partner = {};   // pairKey -> 함께 뛴 횟수
  const opponent = {};  // pairKey -> 맞붙은 횟수
  const played = Array.from({ length: n }, () => 0);
  const out = [];

  const partnerN = (a, b) => partner[pairKey(a, b)] || 0;
  const opponentN = (a, b) => opponent[pairKey(a, b)] || 0;
  const cap = Math.ceil((matchCount * 4) / n);   // 1인 최대 경기 수

  /** 후보 pool 안에서 벌점이 가장 낮은 2:2 조합을 찾는다 */
  const searchBest = (pool) => {
    let found = null;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        for (let k = j + 1; k < pool.length; k++) {
          for (let l = k + 1; l < pool.length; l++) {
            const four = [pool[i], pool[j], pool[k], pool[l]];
            // 4명을 2:2 로 나누는 3가지 방법
            const splits = [
              [[four[0], four[1]], [four[2], four[3]]],
              [[four[0], four[2]], [four[1], four[3]]],
              [[four[0], four[3]], [four[1], four[2]]],
            ];
            splits.forEach(([A, B]) => {
              const cost =
                (partnerN(A[0], A[1]) + partnerN(B[0], B[1])) * 100
                + (opponentN(A[0], B[0]) + opponentN(A[0], B[1])
                  + opponentN(A[1], B[0]) + opponentN(A[1], B[1])) * 10
                + four.reduce((s, p) => s + played[p], 0);
              if (!found || cost < found.cost) found = { cost, A, B };
            });
          }
        }
      }
    }
    return found;
  };

  for (let m = 0; m < matchCount; m++) {
    // 상한에 닿지 않은 사람 중, 적게 뛴 순서로 후보를 잡는다
    let eligible = [...Array(n).keys()].filter((i) => played[i] < cap);
    if (eligible.length < 4) eligible = [...Array(n).keys()]; // 막히면 상한 해제
    eligible.sort((x, y) => played[x] - played[y] || x - y);

    // 후보를 8명으로 좁혀 빠르게 찾되, 그 안에서 파트너 중복을 못 피하면
    // 후보를 14명까지 넓혀 한 번 더 찾는다 (좁은 후보 탓에 생기던 중복 제거)
    let best = null;
    for (const poolSize of [8, 14]) {
      const pool = eligible.slice(0, Math.min(eligible.length, poolSize));
      best = searchBest(pool);
      if (best && best.cost < 100) break;   // 100 미만 = 파트너 중복 없음
      if (poolSize >= eligible.length) break;
    }
    if (!best) break;

    const { A, B } = best;
    partner[pairKey(A[0], A[1])] = partnerN(A[0], A[1]) + 1;
    partner[pairKey(B[0], B[1])] = partnerN(B[0], B[1]) + 1;
    A.forEach((a) => B.forEach((b) => { opponent[pairKey(a, b)] = opponentN(a, b) + 1; }));
    [...A, ...B].forEach((p) => { played[p] += 1; });
    out.push([A, B]);
  }
  return out;
}

/* ------------------------------------------------------------
   경기 목록을 타임(라운드)/코트에 배치
   한 타임에 같은 사람이 두 코트에 들어가지 않도록 한다.
   조가 여러 개면 서로 다른 조의 경기가 같은 타임에 나란히 진행된다.
   ------------------------------------------------------------ */
function schedule(items, courts) {
  const rounds = [];
  const remaining = [...items];

  while (remaining.length) {
    const used = new Set();
    const round = [];
    for (let idx = 0; idx < remaining.length && round.length < courts; idx++) {
      const it = remaining[idx];
      const four = [...it.teamA, ...it.teamB].map((p) => p.id);
      if (four.some((x) => used.has(x))) continue;
      four.forEach((x) => used.add(x));
      round.push(it);
    }
    if (!round.length) round.push(remaining[0]);  // 이론상 없지만 무한루프 방지
    round.forEach((r) => {
      const at = remaining.indexOf(r);
      if (at >= 0) remaining.splice(at, 1);
    });
    rounds.push(round);
  }
  return rounds;
}

/** 경기 유형 표기 — 참가자 성별로 판정 */
function typeOfPlayers(A, B) {
  const all = [...A, ...B].map((p) => p?.gender);
  if (all.every((x) => x === 'M')) return '남복';
  if (all.every((x) => x === 'F')) return '여복';
  const teamMixed = (t) => t[0]?.gender !== t[1]?.gender;
  if (teamMixed(A) && teamMixed(B)) return '혼복';
  return '잡복';
}

/** 한 조 안에서만 대진을 만든다(인덱스 기준) */
function pairsForGroup(size, options = {}) {
  const table = KDK_TABLES[size];
  const plan = kdkPlan(size);
  if (table && !options.matches) return table.map(([a, b]) => [a, b]);
  return buildByGenerator(size, Math.max(1, options.matches || plan.matches));
}

/**
 * KDK 대진 생성
 *
 * @param players  [{id, name, gender, ntrp, grade}] 참가자
 * @param courts   동시에 쓸 코트 수
 * @param options
 *   groupCount   조 수 직접 지정 (미지정 시 인원에 맞춰 4~8명 조로 자동 분할)
 *   groups       이미 나눠 둔 조 [[player,...], ...] — 실력 배분을 직접 했을 때
 *   matches      한 조당 경기 수 직접 지정 (미지정 시 표준값)
 * @returns 기존 엔진과 같은 형태의 경기 배열 (+ group 필드)
 */
export function generateKdk(players, courts = 1, options = {}) {
  const n = players.length;
  if (n < 4) return [];

  /* 1) 조 나누기 */
  let groups = options.groups;
  if (!groups) {
    const sizes = options.groupCount
      ? splitKdkGroups(n, Math.ceil(n / Math.max(1, options.groupCount)))
      : splitKdkGroups(n);
    groups = [];
    let at = 0;
    sizes.forEach((s) => { groups.push(players.slice(at, at + s)); at += s; });
  }
  groups = groups.filter((g) => g && g.length >= 4);
  if (!groups.length) return [];

  /* 2) 조마다 표를 돌려 경기 목록을 만든다 */
  const perGroup = groups.map((g) => ({
    players: g,
    pairs: pairsForGroup(g.length, options),
  }));

  /* 3) 타임/코트 배치 — 조가 여러 개면 같은 타임에 나란히 진행한다 */
  const flat = [];
  perGroup.forEach(({ players: gp, pairs }, gi) => {
    pairs.forEach(([A, B]) => {
      flat.push({
        group: gi,
        teamA: A.map((i) => gp[i]),
        teamB: B.map((i) => gp[i]),
      });
    });
  });

  const rounds = schedule(flat, Math.max(1, courts));

  const out = [];
  rounds.forEach((round, r) => {
    round.forEach((item, c) => {
      out.push({
        id: `kdk-${r + 1}-${c + 1}`,
        round: r + 1,
        court: c + 1,
        group: item.group,
        type: typeOfPlayers(item.teamA, item.teamB),
        kdk: true,
        teamA: item.teamA.map((p) => p.id),
        teamB: item.teamB.map((p) => p.id),
        score: null,
      });
    });
  });
  return out;
}

/**
 * KDK 개인 순위 — 승수 → 득실차 → 총득점 순
 * @param players 참가자
 * @param matches 스코어가 기록된 경기들
 */
export function kdkStandings(players, matches) {
  const row = {};
  players.forEach((p) => { row[p.id] = { id: p.id, name: p.name, games: 0, wins: 0, gf: 0, ga: 0 }; });

  (matches || []).forEach((m) => {
    if (!m.score) return;
    const { a, b } = m.score;
    const sides = [[m.teamA, a, b], [m.teamB, b, a]];
    sides.forEach(([team, gf, ga]) => {
      team.forEach((id) => {
        const r = row[id];
        if (!r) return;
        r.games += 1;
        r.gf += gf;
        r.ga += ga;
        if (gf > ga) r.wins += 1;
      });
    });
  });

  return Object.values(row)
    .map((r) => ({ ...r, diff: r.gf - r.ga }))
    .sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.gf - x.gf);
}

/** 조별 순위 — [{ group, rows:[...] }] */
export function kdkStandingsByGroup(players, matches) {
  const memberOf = {};   // playerId -> group
  (matches || []).forEach((m) => {
    [...m.teamA, ...m.teamB].forEach((id) => { memberOf[id] = m.group ?? 0; });
  });
  const groups = [...new Set(Object.values(memberOf))].sort((a, b) => a - b);
  if (!groups.length) return [{ group: 0, rows: kdkStandings(players, matches) }];

  return groups.map((g) => ({
    group: g,
    rows: kdkStandings(
      players.filter((p) => memberOf[p.id] === g),
      (matches || []).filter((m) => (m.group ?? 0) === g),
    ),
  }));
}

/** 대진이 KDK 성질을 지켰는지 점검 — 화면 안내 및 테스트용 */
export function kdkQuality(players, matches) {
  const partner = {};
  const opponent = {};
  const played = {};
  players.forEach((p) => { played[p.id] = 0; });

  matches.forEach((m) => {
    const A = m.teamA; const B = m.teamB;
    partner[pairKey(A[0], A[1])] = (partner[pairKey(A[0], A[1])] || 0) + 1;
    partner[pairKey(B[0], B[1])] = (partner[pairKey(B[0], B[1])] || 0) + 1;
    A.forEach((a) => B.forEach((b) => {
      opponent[pairKey(a, b)] = (opponent[pairKey(a, b)] || 0) + 1;
    }));
    [...A, ...B].forEach((x) => { played[x] = (played[x] || 0) + 1; });
  });

  const counts = Object.values(played);
  return {
    minGames: Math.min(...counts),
    maxGames: Math.max(...counts),
    even: Math.max(...counts) - Math.min(...counts) <= 1,
    repeatedPartners: Object.values(partner).filter((v) => v > 1).length,
    repeatedOpponents: Object.values(opponent).filter((v) => v > 1).length,
  };
}
