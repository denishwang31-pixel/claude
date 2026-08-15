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
