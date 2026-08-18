/* ============================================================
   단체전 — 청백전 / 클럽 교류전

   두 형식은 규칙이 같다. 두 팀이 있고, 모든 경기는 A팀 2명 vs B팀 2명으로
   짜인다. 이긴 경기 수를 합산해 팀 승부를 가린다. 다른 점은 팀을 어떻게
   만드느냐뿐이다.
     청백전     : 우리 클럽 회원을 실력이 비슷하게 두 팀으로 가른다
     클럽교류전 : A팀은 우리 회원, B팀은 상대 클럽 선수(직접 입력)

   그래서 팀 편성만 다르게 하고, 대진 생성·집계는 같은 함수를 쓴다.

   대진을 짤 때 지키는 것
     1. 모든 경기는 반드시 A팀 2명 vs B팀 2명 (팀 내 대결이 생기면 단체전이 아니다)
     2. 팀 안에서 출전 횟수를 고르게
     3. 같은 파트너·같은 상대 반복을 줄인다
     4. 한 타임에 같은 사람이 두 코트에 들어가지 않는다
   ============================================================ */

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 실력 점수 — NTRP 우선, 없으면 부수, 그것도 없으면 조(A~D) */
function skillOf(p, busuToNtrp) {
  if (typeof p.ntrp === 'number' && p.ntrp > 0) return p.ntrp;
  const fromBusu = busuToNtrp ? busuToNtrp(p.busu) : null;
  if (fromBusu) return fromBusu;
  const byGrade = { A: 4.0, B: 3.5, C: 3.0, D: 2.5 };
  return byGrade[p.grade] || 3.0;
}

/**
 * 청백전 팀 나누기 — 실력 합이 비슷하고 성별도 한쪽에 쏠리지 않게.
 * 실력 순으로 세운 뒤 뱀 모양(1-2-2-1)으로 번갈아 담는다.
 */
export function splitTeams(players, { busuToNtrp } = {}) {
  const bySex = { M: [], F: [] };
  players.forEach((p) => { (bySex[p.gender === 'F' ? 'F' : 'M']).push(p); });

  const A = []; const B = [];
  // 성별마다 따로 뱀 배분 → 남녀 비율까지 자동으로 맞는다
  Object.values(bySex).forEach((group) => {
    const sorted = [...group].sort((x, y) => skillOf(y, busuToNtrp) - skillOf(x, busuToNtrp));
    sorted.forEach((p, i) => {
      const toA = Math.floor(i / 1) % 4 === 0 || Math.floor(i / 1) % 4 === 3;
      (toA ? A : B).push(p);
    });
  });

  // 인원이 어긋나면 실력이 가장 가까운 사람을 옮겨 맞춘다
  while (Math.abs(A.length - B.length) > 1) {
    const from = A.length > B.length ? A : B;
    const to = A.length > B.length ? B : A;
    to.push(from.pop());
  }
  return { teamA: A, teamB: B };
}

/** 두 팀 실력 합계 — 화면에 균형을 보여줄 때 쓴다 */
export function teamStrength(team, { busuToNtrp } = {}) {
  if (!team.length) return 0;
  const sum = team.reduce((s, p) => s + skillOf(p, busuToNtrp), 0);
  return Math.round((sum / team.length) * 100) / 100;
}

/**
 * 단체전 대진 생성 — 모든 경기가 A팀 2명 vs B팀 2명
 *
 * @param teamA   A팀 선수 [{id,name,gender,...}]
 * @param teamB   B팀 선수
 * @param courts  동시 사용 코트 수
 * @param rounds  진행할 타임 수 (미지정 시 인원에 맞춰 자동)
 * @param options { sameSexOnly } 잡복을 피하고 싶을 때
 */
export function generateTeamMatches(teamA, teamB, courts = 1, rounds = 0, options = {}) {
  if (teamA.length < 2 || teamB.length < 2) return [];

  const nCourts = Math.max(1, courts);
  const perRound = Math.min(nCourts, Math.floor(Math.min(teamA.length, teamB.length) / 2));
  if (perRound < 1) return [];

  const totalRounds = rounds > 0
    ? rounds
    : Math.max(1, Math.ceil(Math.max(teamA.length, teamB.length) / (perRound * 2)) * 2);

  const played = {};
  [...teamA, ...teamB].forEach((p) => { played[p.id] = 0; });
  const partner = {};
  const opponent = {};
  const partnerN = (a, b) => partner[pairKey(a, b)] || 0;
  const opponentN = (a, b) => opponent[pairKey(a, b)] || 0;

  /** 한 팀에서 짝 하나 고르기 — 적게 뛴 사람 + 파트너 중복 적은 쪽 */
  const pickPair = (team, busy) => {
    const avail = team.filter((p) => !busy.has(p.id));
    if (avail.length < 2) return null;
    let best = null;
    for (let i = 0; i < avail.length; i++) {
      for (let j = i + 1; j < avail.length; j++) {
        const a = avail[i]; const b = avail[j];
        if (options.sameSexOnly && a.gender !== b.gender) continue;
        const cost = partnerN(a.id, b.id) * 100 + played[a.id] + played[b.id];
        if (!best || cost < best.cost) best = { cost, pair: [a, b] };
      }
    }
    if (!best) {                       // sameSexOnly 로 못 찾으면 제약을 푼다
      for (let i = 0; i < avail.length; i++) {
        for (let j = i + 1; j < avail.length; j++) {
          const a = avail[i]; const b = avail[j];
          const cost = partnerN(a.id, b.id) * 100 + played[a.id] + played[b.id];
          if (!best || cost < best.cost) best = { cost, pair: [a, b] };
        }
      }
    }
    return best?.pair || null;
  };

  const out = [];
  for (let r = 1; r <= totalRounds; r++) {
    const busy = new Set();
    for (let c = 1; c <= perRound; c++) {
      const pa = pickPair(teamA, busy);
      if (!pa) break;
      pa.forEach((p) => busy.add(p.id));
      const pb = pickPair(teamB, busy);
      if (!pb) { pa.forEach((p) => busy.delete(p.id)); break; }
      pb.forEach((p) => busy.add(p.id));

      partner[pairKey(pa[0].id, pa[1].id)] = partnerN(pa[0].id, pa[1].id) + 1;
      partner[pairKey(pb[0].id, pb[1].id)] = partnerN(pb[0].id, pb[1].id) + 1;
      pa.forEach((a) => pb.forEach((b) => {
        opponent[pairKey(a.id, b.id)] = opponentN(a.id, b.id) + 1;
      }));
      [...pa, ...pb].forEach((p) => { played[p.id] += 1; });

      const all = [...pa, ...pb];
      const allM = all.every((p) => p.gender === 'M');
      const allF = all.every((p) => p.gender === 'F');
      const mixedTeams = pa[0].gender !== pa[1].gender && pb[0].gender !== pb[1].gender;

      out.push({
        id: `tm-${r}-${c}`,
        round: r,
        court: c,
        team: true,
        type: allM ? '남복' : allF ? '여복' : mixedTeams ? '혼복' : '잡복',
        teamA: pa.map((p) => p.id),
        teamB: pb.map((p) => p.id),
        score: null,
      });
    }
  }
  return out;
}

/* ============================================================
   타임별 경기 유형 지정 편성

   위의 generateTeamMatches 는 "아무 조합이나 2:2"였다. 실제 교류전은
   그렇게 안 돌아간다 — 1타임 혼복, 2타임 남복, 3타임 여복처럼 미리
   정해 놓고 그 타임에 나갈 선수를 뽑는다. 그래야 양 클럽이 "우리는
   남복에 누구를 낸다"를 준비할 수 있다.

   유형별로 각 팀이 내보내는 사람이 다르다.
     혼복  남1 여1        단식  1명 (되도록 같은 성별끼리 붙인다)
     남복  남2            여복  여2
   ============================================================ */
export const TEAM_ROUND_TYPES = [
  { key: 'MX', name: '혼복', need: { M: 1, F: 1 }, singles: false },
  { key: 'MD', name: '남복', need: { M: 2, F: 0 }, singles: false },
  { key: 'WD', name: '여복', need: { M: 0, F: 2 }, singles: false },
  { key: 'SG', name: '단식', need: null, singles: true },
];

export const teamRoundType = (key) =>
  TEAM_ROUND_TYPES.find((t) => t.key === key) || TEAM_ROUND_TYPES[0];

const sexOf = (p) => (p.gender === 'F' ? 'F' : 'M');

/**
 * 한 팀에서 이 유형에 맞는 조합을 고른다.
 * 적게 뛴 사람 우선, 같은 파트너 반복은 피한다.
 * 인원이 모자라면 null — 억지로 다른 성별을 넣지 않는다.
 * (남복 타임에 여자를 넣으면 그건 남복이 아니다)
 */
function pickForType(team, busy, type, played, partnerN) {
  const avail = team.filter((p) => !busy.has(p.id));

  if (type.singles) {
    if (!avail.length) return null;
    const best = [...avail].sort((a, b) => played[a.id] - played[b.id]);
    return [best[0]];
  }

  const need = type.need;
  const pool = { M: avail.filter((p) => sexOf(p) === 'M'), F: avail.filter((p) => sexOf(p) === 'F') };
  if (pool.M.length < need.M || pool.F.length < need.F) return null;

  const take = (list, n) => [...list].sort((a, b) => played[a.id] - played[b.id]).slice(0, n * 3);
  const candM = take(pool.M, need.M);
  const candF = take(pool.F, need.F);

  let best = null;
  const consider = (pair) => {
    const cost = partnerN(pair[0].id, pair[1].id) * 100 + played[pair[0].id] + played[pair[1].id];
    if (!best || cost < best.cost) best = { cost, pair };
  };

  if (need.M === 1 && need.F === 1) {
    candM.forEach((m) => candF.forEach((f) => consider([m, f])));
  } else {
    const same = need.M === 2 ? candM : candF;
    for (let i = 0; i < same.length; i += 1) {
      for (let j = i + 1; j < same.length; j += 1) consider([same[i], same[j]]);
    }
  }
  return best ? best.pair : null;
}

/**
 * 타임별 유형을 지켜 교류전 대진을 짠다.
 *
 * @param roundTypes { 1:'MX', 2:'MD', … } — 지정 없는 타임은 혼복
 * @returns { matches, shortages } shortages 는 인원이 모자라 못 채운 칸.
 *          조용히 빼먹으면 "3면 잡았는데 2면만 나왔다"가 되므로
 *          왜 못 채웠는지 화면에 알려 주기 위해 같이 돌려준다.
 */
export function generateTypedTeamMatches(teamA, teamB, {
  courts = 1, rounds = 4, roundTypes = {},
} = {}) {
  const nCourts = Math.max(1, Number(courts) || 1);
  const nRounds = Math.max(1, Number(rounds) || 1);

  const played = {};
  [...teamA, ...teamB].forEach((p) => { played[p.id] = 0; });
  const partner = {};
  const partnerN = (a, b) => partner[pairKey(a, b)] || 0;

  const out = [];
  const shortages = [];

  for (let r = 1; r <= nRounds; r += 1) {
    const type = teamRoundType(roundTypes[r] || roundTypes[String(r)] || 'MX');
    const busy = new Set();

    for (let c = 1; c <= nCourts; c += 1) {
      const pa = pickForType(teamA, busy, type, played, partnerN);
      if (!pa) { shortages.push({ round: r, court: c, type: type.name, side: 'A' }); continue; }
      pa.forEach((p) => busy.add(p.id));

      const pb = pickForType(teamB, busy, type, played, partnerN);
      if (!pb) {
        pa.forEach((p) => busy.delete(p.id));
        shortages.push({ round: r, court: c, type: type.name, side: 'B' });
        continue;
      }
      pb.forEach((p) => busy.add(p.id));

      if (pa.length === 2) partner[pairKey(pa[0].id, pa[1].id)] = partnerN(pa[0].id, pa[1].id) + 1;
      if (pb.length === 2) partner[pairKey(pb[0].id, pb[1].id)] = partnerN(pb[0].id, pb[1].id) + 1;
      [...pa, ...pb].forEach((p) => { played[p.id] += 1; });

      out.push({
        id: `cm-${r}-${c}`,
        round: r,
        court: c,
        team: true,
        typeKey: type.key,
        type: type.singles ? '단식' : type.name,
        teamA: pa.map((p) => p.id),
        teamB: pb.map((p) => p.id),
        score: null,
      });
    }
  }
  return { matches: out, shortages };
}

/**
 * 빈 대진표 — 자동 편성을 쓰지 않고 각 팀이 직접 선수를 넣는 경우.
 * 칸만 먼저 만들어 두고 선수는 나중에 채운다. 그래야 "몇 타임 몇 면"이
 * 먼저 합의되고, 양 클럽이 각자 자기 칸만 채울 수 있다.
 */
export function blankTeamMatches({ courts = 1, rounds = 4, roundTypes = {} } = {}) {
  const nCourts = Math.max(1, Number(courts) || 1);
  const nRounds = Math.max(1, Number(rounds) || 1);
  const out = [];
  for (let r = 1; r <= nRounds; r += 1) {
    const type = teamRoundType(roundTypes[r] || roundTypes[String(r)] || 'MX');
    for (let c = 1; c <= nCourts; c += 1) {
      out.push({
        id: `cm-${r}-${c}`,
        round: r,
        court: c,
        team: true,
        typeKey: type.key,
        type: type.singles ? '단식' : type.name,
        teamA: [],
        teamB: [],
        score: null,
      });
    }
  }
  return out;
}

/** 수동 편성이 다 찼는지 — 비어 있으면 어디가 비었는지 알려 준다 */
export function emptySlots(matches) {
  const size = (m) => (m.typeKey === 'SG' ? 1 : 2);
  return (matches || []).flatMap((m) => {
    const out = [];
    if ((m.teamA || []).length < size(m)) out.push({ round: m.round, court: m.court, side: 'A' });
    if ((m.teamB || []).length < size(m)) out.push({ round: m.round, court: m.court, side: 'B' });
    return out;
  });
}

/** 단체전 점수 — 이긴 경기 수 합산 */
export function teamScore(matches) {
  let a = 0; let b = 0; let gamesA = 0; let gamesB = 0; let done = 0;
  (matches || []).forEach((m) => {
    if (!m.score) return;
    done += 1;
    gamesA += m.score.a;
    gamesB += m.score.b;
    if (m.score.a > m.score.b) a += 1;
    else if (m.score.b > m.score.a) b += 1;
  });
  return {
    a, b, gamesA, gamesB, played: done, total: (matches || []).length,
    winner: a === b ? null : a > b ? 'A' : 'B',
  };
}

/** 단체전 개인 기록 — MVP 뽑을 때 */
export function teamPlayerStats(players, matches) {
  const row = {};
  players.forEach((p) => { row[p.id] = { id: p.id, name: p.name, games: 0, wins: 0, gf: 0, ga: 0 }; });
  (matches || []).forEach((m) => {
    if (!m.score) return;
    [[m.teamA, m.score.a, m.score.b], [m.teamB, m.score.b, m.score.a]].forEach(([team, gf, ga]) => {
      team.forEach((id) => {
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
