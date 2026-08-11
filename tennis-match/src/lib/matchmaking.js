/* ============================================================
   대진 편성 엔진 (VBA v5 로직 이식 — 순수 JS, RN/웹 공용)
   외부 의존성 없음. 이 파일은 웹 프로토타입과 100% 동일 로직.

   고정 원칙(우선순위 무관 하드 룰):
   - 잡복 금지: 남복(남4) / 여복(여4) / 혼복(남여 vs 남여)만 허용
   - 타임(라운드) 단위 풀 선발 → 동일 타임 동일인 중복 배정 불가

   우선순위(드래그 재배열 → 가중치): 위에 있을수록 가중치 큼
   - maxPlay      출전 인원 최대화
   - evenGames    게임 수 균등 배분(출전 최소자 우선)
   - pairNoRepeat 페어 중복 방지(이전 모임 누적 포함); 1~2순위면 하드 제약화
   - pattern      타임별 희망 패턴(홀수=동성복식, 짝수=혼복)
   - restPriority 휴식 우선점수(총무 수동 부여)
   ============================================================ */

let _seq = 0;
const uid = () => `mt_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

export const DEFAULT_RULES = [
  { key: 'maxPlay', name: '출전 인원 최대화', desc: '가능한 많은 인원이 코트에 서도록 구성' },
  { key: 'evenGames', name: '게임 수 균등 배분', desc: '출전 횟수 최소자 우선 선발' },
  { key: 'pairNoRepeat', name: '페어 중복 방지', desc: '이전 모임 누적 기록까지 포함해 같은 페어 회피' },
  { key: 'pattern', name: '타임별 희망 패턴', desc: '홀수 타임: 남복+여복 / 짝수 타임: 혼복 우선' },
  { key: 'restPriority', name: '휴식 우선점수 반영', desc: '지난주 많이 쉰 사람에게 총무가 부여한 점수 우선' },
];

const pairKey = (a, b) => [a, b].sort().join('|');

/* ---------- 커플 / 고정 페어 유틸 ----------
   couples    : [[idA,idB], …] 함께 오고 가야 하는 관계(부부·커플).
                → 매 라운드 "둘 다 출전" 또는 "둘 다 휴식" 으로 동기화.
   fixedPairs : [[idA,idB], …] 대회 준비 등으로 항상 같은 팀이어야 하는 조합.
                → 라운드 동기화 + 같은 팀 배정 + 페어중복 페널티 면제.        */
const linkMap = (links) => {
  const m = {};
  (links || []).forEach(([a, b]) => { if (a && b) { m[a] = b; m[b] = a; } });
  return m;
};

/** 이전 모임 전체에서 누적 페어 기록 수집 (VBA "이전페어" 시트 역할) */
export function collectPastPairs(meetings, excludeMeetingId) {
  const past = {};
  (meetings || []).forEach((mt) => {
    if (mt.id === excludeMeetingId) return;
    (mt.matches || []).forEach((m) => {
      [m.teamA, m.teamB].forEach((t) => {
        if (t && t.length === 2) {
          const k = pairKey(t[0], t[1]);
          past[k] = (past[k] || 0) + 1;
        }
      });
    });
  });
  return past;
}

const TYPES = {
  MM: { m: 4, f: 0, label: '남복' },
  FF: { m: 0, f: 4, label: '여복' },
  MX: { m: 2, f: 2, label: '혼복' },
  // 잡복(남3여1 등 성비가 안 맞는 복식). 기본 금지, allowMixed 옵션에서만 사용
  ANY: { m: 0, f: 0, any: 4, label: '잡복' },
};

/* ============================================================
   로스터 진단 — 대진 생성 전에 "가능한가? 안 되면 몇 명 더 필요한가?"를 계산
   반환:
     M, F               남/여 참석 인원
     strictCourts       잡복 없이 채울 수 있는 코트 수
     mixedCourts        잡복 허용 시 채울 수 있는 코트 수
     needForFirstCourt  1면이라도 만들려면 추가로 필요한 인원 {m,f} (불가일 때만 의미)
     needForFullStrict  요청한 코트를 전부 잡복 없이 채우려면 필요한 추가 인원 {m,f}
     needForOneMoreStrict 잡복 없이 한 면 더 늘리려면 필요한 추가 인원 {m,f}
   ============================================================ */
export function diagnoseRoster(players, courts) {
  const M = (players || []).filter((p) => p.gender === 'M').length;
  const F = (players || []).length - M;

  /** m명·f명으로 잡복 없이 채울 수 있는 최대 코트 수 */
  const strictCapacity = (m, f, maxCourts) => {
    let best = 0;
    for (let x = 0; x <= maxCourts; x++) {
      for (let y = 0; x + y <= maxCourts; y++) {
        for (let z = 0; x + y + z <= maxCourts; z++) {
          if (2 * x + 4 * y <= m && 2 * x + 4 * z <= f) best = Math.max(best, x + y + z);
        }
      }
    }
    return best;
  };

  /** target 면을 잡복 없이 채우기 위한 최소 추가 인원 */
  const needFor = (target) => {
    let best = null;
    for (let x = 0; x <= target; x++) {
      for (let y = 0; x + y <= target; y++) {
        const z = target - x - y;
        if (z < 0) continue;
        const addM = Math.max(0, (2 * x + 4 * y) - M);
        const addF = Math.max(0, (2 * x + 4 * z) - F);
        const total = addM + addF;
        if (!best || total < best.m + best.f) best = { m: addM, f: addF };
      }
    }
    return best || { m: 0, f: 0 };
  };

  const strictCourts = strictCapacity(M, F, courts);
  const mixedCourts = Math.min(courts, Math.floor((M + F) / 4));

  return {
    M, F,
    strictCourts,
    mixedCourts,
    canPlayStrict: strictCourts > 0,
    canPlayMixed: mixedCourts > 0,
    needForFirstCourt: strictCourts > 0 ? { m: 0, f: 0 } : needFor(1),
    needForFullStrict: needFor(courts),
    needForOneMoreStrict: strictCourts < courts ? needFor(strictCourts + 1) : { m: 0, f: 0 },
  };
}

/** 진단 결과를 사람이 읽는 문장으로 (경고창 본문용) */
export function describeShortage(need) {
  const parts = [];
  if (need.m > 0) parts.push(`남성 ${need.m}명`);
  if (need.f > 0) parts.push(`여성 ${need.f}명`);
  return parts.length ? parts.join(' · ') : '추가 인원 불필요';
}

/**
 * @param {Array} players    [{id,name,gender:'M'|'F',grade}]
 * @param {number} courts    코트 수
 * @param {number} rounds    라운드(타임) 수
 * @param {Array} ruleOrder  DEFAULT_RULES 순서(우선순위)
 * @param {Object} pastPairs collectPastPairs 결과
 * @param {Object} restScores {playerId: number}
 * @param {Object} options   { couples: [[idA,idB]…], fixedPairs: [[idA,idB]…] }
 *   - couples    : 함께 오고 가야 하는 관계 → 라운드 출전 동기화
 *   - fixedPairs : 항상 같은 팀이어야 하는 조합 → 동기화 + 같은 팀 + 중복 페널티 면제
 * @returns {Array} matches  [{id,round,court,type,teamA:[id,id],teamB:[id,id],score}]
 */
export function generateMatchesV5(players, courts, rounds, ruleOrder, pastPairs = {}, restScores = {}, options = {}) {
  const W = {};
  (ruleOrder || DEFAULT_RULES).forEach((r, i) => { W[r.key] = (ruleOrder || DEFAULT_RULES).length - i; });
  const strictPair = W.pairNoRepeat >= 4; // 페어중복방지 1~2순위 → 엄격

  // 커플·고정페어(둘 다 라운드 동기화 대상, 고정페어는 같은 팀까지 강제)
  const coupleOf = linkMap(options.couples);
  const fixedOf = linkMap(options.fixedPairs);
  const partnerOf = { ...coupleOf, ...fixedOf }; // 동기화용 통합 맵

  /* 편성 결과 진단(out-param). options.report 를 넘기면 채워준다.
     relaxed: 제약을 완화한 라운드 / skippedRounds: 끝내 편성 못 한 라운드 */
  const report = options.report || {};
  report.relaxed = [];
  report.skippedRounds = [];

  const games = {};
  players.forEach((p) => { games[p.id] = 0; });
  const usedPairs = { ...pastPairs };
  const allMatches = [];
  const rest = (id) => restScores[id] || 0;

  // 동성 고정페어는 동성 복식 코트가 있어야 한 팀이 될 수 있음 → 코트 구성 시 반영
  const genderById = Object.fromEntries(players.map((p) => [p.id, p.gender]));
  const sameSexFixed = { M: 0, F: 0 };
  (options.fixedPairs || []).forEach(([a, b]) => {
    if (genderById[a] && genderById[a] === genderById[b]) sameSexFixed[genderById[a]] += 1;
  });

  /* 라운드 1개를 계획한다. 제약 충돌로 불가능하면 null 을 돌려 상위에서 완화 재시도.
     @param useCouples 커플/페어 출전 동기화 적용 여부
     @param useFixed   고정페어 "같은 팀" 강제 적용 여부
     @param deadline   이 시각(ms)을 넘기면 즉시 포기 — 불가능한 제약에 매달리지 않음 */
  const planRound = (r, useCouples, useFixed, deadline) => {
    const syncMap = useCouples ? partnerOf : {};
    const teamMap = useFixed ? fixedOf : {};
    const allowMixed = !!options.allowMixed; // 잡복 허용(기본 false)
    const availM = players.filter((p) => p.gender === 'M').length;
    const availF = players.filter((p) => p.gender === 'F').length;

    /* 1) 타임별 코트 구성 사전 결정: 혼복x + 남복y + 여복z = courts 전수 탐색 */
    let best = null, bestScore = -Infinity;
    // x+y+z <= courts : 코트를 다 채우지 못하는 성비(예: 남5 여3 / 2면)에서도
    // 쓸 수 있는 코트만 사용해 편성하도록 부분 조합까지 평가한다.
    for (let x = 0; x <= courts; x++) {
      for (let y = 0; x + y <= courts; y++) {
        for (let z = 0; x + y + z <= courts; z++) {
          if (x + y + z === 0 && !allowMixed) continue;
          const needM = 2 * x + 4 * y;
          const needF = 2 * x + 4 * z;
          if (needM > availM || needF > availF) continue;

          // 잡복 허용 시: 정규 조합으로 채우고 남은 인원·코트로 잡복 코트 추가
          let w = 0;
          if (allowMixed) {
            const restPeople = (availM - needM) + (availF - needF);
            w = Math.min(courts - (x + y + z), Math.floor(restPeople / 4));
          }
          if (x + y + z + w === 0) continue;

          const onCourt = needM + needF + w * 4;
          let s = onCourt * 10 * W.maxPlay;                 // 출전 인원 최대화 최우선
          const patternFit = r % 2 === 1 ? y + z : x;        // 홀수=동성복식, 짝수=혼복
          s += patternFit * 3 * W.pattern;
          s -= w * 5;                                        // 잡복은 되도록 적게(최후 수단)
          // 동성 고정페어가 있으면 해당 성별 동성복식 코트를 확보하도록 유도
          if (useFixed && sameSexFixed.M && y > 0) s += 20;
          if (useFixed && sameSexFixed.F && z > 0) s += 20;
          s -= Math.abs((availM - needM) - (availF - needF)); // 잔여 성비 불균형 페널티
          if (s > bestScore) { bestScore = s; best = { x, y, z, w, needM, needF }; }
        }
      }
    }
    if (!best || best.needM + best.needF + best.w * 4 < 4) return null; // 이 타임 편성 불가

    const { x, y, z, w, needM, needF } = best;

    /* 2) 타임 단위 풀 선발: 출전횟수 최소 → 휴식점수 → 랜덤 */
    const ranked = (gender) =>
      players
        .filter((p) => p.gender === gender)
        .sort((a, b) =>
          (games[a.id] - games[b.id]) * W.evenGames
          - (rest(a.id) - rest(b.id)) * W.restPriority * 0.5
          || Math.random() - 0.5);
    const rankM = ranked('M');
    const rankF = ranked('F');

    // 잡복 코트가 있으면 남은 인원에서 성비대로 추가 선발
    let mixM = 0, mixF = 0;
    if (w > 0) {
      const restM = availM - needM;
      const restF = availF - needF;
      mixM = Math.min(restM, Math.round((4 * w) * restM / Math.max(1, restM + restF)));
      mixF = 4 * w - mixM;
      if (mixF > restF) { mixF = restF; mixM = 4 * w - mixF; }
    }
    const poolM = rankM.slice(0, needM + mixM);
    const poolF = rankF.slice(0, needF + mixF);

    /* 2-b) 커플/고정페어 라운드 동기화:
       파트너 중 한 명만 뽑힌 경우 → 상대를 데려오거나(빈 슬롯/교체) 둘 다 제외.
       "일찍 온 사람이 혼자 기다리는" 상황을 구조적으로 차단. */
    if (Object.keys(syncMap).length) {
      const pools = { M: poolM, F: poolF };
      const ranks = { M: rankM, F: rankF };
      const byId = Object.fromEntries(players.map((p) => [p.id, p]));
      const inPool = (id) => pools.M.some((p) => p.id === id) || pools.F.some((p) => p.id === id);

      // 최대 몇 바퀴 돌며 수렴(교체가 다른 커플을 깨뜨릴 수 있으므로)
      for (let iter = 0; iter < 4; iter++) {
        let changed = false;
        for (const p of [...pools.M, ...pools.F]) {
          const mateId = syncMap[p.id];
          if (!mateId || inPool(mateId)) continue;
          const mate = byId[mateId];
          if (!mate) continue; // 상대가 오늘 불참 → 제약 무시(혼자 출전 허용)
          const mp = pools[mate.gender];
          if (!mp) continue;

          // (a) 상대 성별 풀에 빈 슬롯이 있으면 그대로 투입
          const capacity = mate.gender === 'M' ? needM : needF;
          if (mp.length < capacity) { mp.push(mate); changed = true; continue; }

          // (b) 교체: 파트너 제약이 없는 사람 중 출전 수가 가장 많은 사람과 스왑
          let victimIdx = -1, victimGames = -1;
          mp.forEach((q, i) => {
            if (syncMap[q.id]) return;                 // 다른 커플은 건드리지 않음
            if (games[q.id] > victimGames) { victimGames = games[q.id]; victimIdx = i; }
          });
          if (victimIdx >= 0) { mp[victimIdx] = mate; changed = true; continue; }

          // (c) 상대를 넣을 수 없으면 본인을 빼고 다음 순번으로 대체
          const own = pools[p.gender];
          const idx = own.findIndex((q) => q.id === p.id);
          if (idx >= 0) {
            const sub = ranks[p.gender].find(
              (q) => !inPool(q.id) && q.id !== mateId && !syncMap[q.id],
            );
            if (sub) { own[idx] = sub; } else { own.splice(idx, 1); }
            changed = true;
          }
        }
        if (!changed) break;
      }
      // 인원 수가 어긋나면(제약 충돌) 이 구성으로는 불가 → 상위에서 제약 완화 재시도
      if (poolM.length !== needM + mixM || poolF.length !== needF + mixF) return null;
    }

    /* 3) 코트별 슬롯 배정 + 페어 중복 체크(재시도) */
    let courtTypes = [
      ...Array(x).fill('MX'), ...Array(y).fill('MM'), ...Array(z).fill('FF'),
    ];
    courtTypes.sort((a, b) =>
      r % 2 === 0 ? (a === 'MX' ? -1 : 1) : (a === 'MX' ? 1 : -1));
    // 잡복 코트는 항상 마지막 코트에 배치(정규 조합을 우선 채운 뒤 남는 인원)
    courtTypes = [...courtTypes, ...Array(w).fill('ANY')];

    const MAX_GLOBAL = 200, MAX_GAME = 40;
    let roundResult = null;
    for (let attempt = 0; attempt < MAX_GLOBAL && !roundResult; attempt++) {
      // 시간 상한: 불가능한 제약에 매달리지 않고 즉시 완화 단계로 넘어감
      if (attempt % 10 === 0 && Date.now() > deadline) return null;
      const m = [...poolM].sort(() => Math.random() - 0.5);
      const f = [...poolF].sort(() => Math.random() - 0.5);
      const tempPairs = {};
      const matches = [];
      let ok = true;

      for (let c = 0; c < courtTypes.length; c++) {
        const t = TYPES[courtTypes[c]];
        let placed = null;
        for (let g = 0; g < MAX_GAME && !placed; g++) {
          let ms, fs;
          if (t.any) {
            // 잡복: 성별 무관 4명 — 남은 인원이 많은 쪽에서 번갈아 뽑아 편중을 줄임
            ms = []; fs = [];
            for (let k = 0; k < 4; k++) {
              if (m.length && (m.length >= f.length || !f.length)) ms.push(m.shift());
              else if (f.length) fs.push(f.shift());
            }
          } else {
            ms = m.splice(0, t.m);
            fs = f.splice(0, t.f);
          }

          let teamA, teamB;
          if (t.any) {
            const four = [...ms, ...fs];          // 남자 먼저, 여자 뒤
            teamA = [four[0], four[2]];           // 교차 배분 → 팀별 성비 균형
            teamB = [four[1], four[3]];
          } else if (courtTypes[c] === 'MX') { teamA = [ms[0], fs[0]]; teamB = [ms[1], fs[1]]; }
          else { const pl = ms.length ? ms : fs; teamA = [pl[0], pl[1]]; teamB = [pl[2], pl[3]]; }
          if (!teamA[0] || !teamA[1] || !teamB[0] || !teamB[1]) { m.unshift(...ms); f.unshift(...fs); break; }

          /* 고정 페어 보정: 이 코트 4명 중 고정 페어가 갈라졌으면 같은 팀으로 재배치.
             단 혼복 코트에 동성 고정페어가 들어오면 한 팀 구성이 불가능 → 위반 처리 후 재시도 */
          let fpViolation = false;
          if (Object.keys(teamMap).length) {
            const four = [...teamA, ...teamB];
            const fp = four.find((p) => {
              const mate = teamMap[p.id];
              return mate && four.some((q) => q.id === mate);
            });
            if (fp) {
              const mate = four.find((q) => q.id === teamMap[fp.id]);
              const others = four.filter((q) => q.id !== fp.id && q.id !== mate.id);
              if (courtTypes[c] === 'MX' && fp.gender === mate.gender) fpViolation = true;
              else { teamA = [fp, mate]; teamB = others; }
            }
          }

          const kA = pairKey(teamA[0].id, teamA[1].id);
          const kB = pairKey(teamB[0].id, teamB[1].id);
          // 고정 페어는 반복 배정이 목적이므로 페어중복 페널티에서 제외
          const exemptA = teamMap[teamA[0].id] === teamA[1].id;
          const exemptB = teamMap[teamB[0].id] === teamB[1].id;
          const repeat = (exemptA ? 0 : (usedPairs[kA] || 0) + (tempPairs[kA] || 0))
            + (exemptB ? 0 : (usedPairs[kB] || 0) + (tempPairs[kB] || 0));
          if (!fpViolation && (repeat === 0 || (!strictPair && g > MAX_GAME * 0.6) || g === MAX_GAME - 1)) {
            placed = { teamA, teamB, kA, kB, type: t.label };
          } else {
            m.unshift(...ms); f.unshift(...fs);
            m.sort(() => Math.random() - 0.5);
            f.sort(() => Math.random() - 0.5);
          }
        }
        if (!placed) { ok = false; break; }
        tempPairs[placed.kA] = (tempPairs[placed.kA] || 0) + 1;
        tempPairs[placed.kB] = (tempPairs[placed.kB] || 0) + 1;
        matches.push({
          id: uid(), round: r, court: c + 1, type: placed.type,
          teamA: placed.teamA.map((p) => p.id), teamB: placed.teamB.map((p) => p.id), score: null,
        });
      }
      if (ok && matches.length) roundResult = { matches, tempPairs };
    }
    return roundResult;
  };

  /* 라운드별 실행: 제약을 지킬 수 없으면 단계적으로 완화한다.
     (불가능한 제약을 계속 재시도해 "멈춘 것처럼" 보이는 상황을 방지)
       1단계 전체 제약 → 2단계 고정페어 같은팀 해제 → 3단계 커플 동기화까지 해제 */
  const hasSync = Object.keys(partnerOf).length > 0;
  const hasFixedTeam = Object.keys(fixedOf).length > 0;
  const budget = Math.max(50, Number(options.roundBudgetMs) || 250); // 라운드·단계당 시간 상한

  for (let r = 1; r <= rounds; r++) {
    let roundResult = null;
    let relaxed = null;

    roundResult = planRound(r, hasSync, hasFixedTeam, Date.now() + budget);

    if (!roundResult && hasFixedTeam) {          // 같은 팀 강제만 포기(출전 시간 동기화는 유지)
      roundResult = planRound(r, hasSync, false, Date.now() + budget);
      if (roundResult) relaxed = 'fixedPairTeam';
    }
    if (!roundResult && hasSync) {               // 커플/페어 제약 전부 포기
      roundResult = planRound(r, false, false, Date.now() + budget);
      if (roundResult) relaxed = 'allPairConstraints';
    }

    if (!roundResult) { report.skippedRounds.push(r); continue; }
    if (relaxed) report.relaxed.push({ round: r, what: relaxed });

    roundResult.matches.forEach((mt) => [...mt.teamA, ...mt.teamB].forEach((id) => { games[id]++; }));
    Object.entries(roundResult.tempPairs).forEach(([k, v]) => { usedPairs[k] = (usedPairs[k] || 0) + v; });
    allMatches.push(...roundResult.matches);
  }

  return allMatches;
}

/** 전적 집계 (랭킹·커리어·케미·H2H 공용) */
export function computeStats(members, meetings) {
  const stats = {};
  const nameOf = (id) =>
    id.startsWith('g:') ? id.slice(2) + '(G)' : (members.find((m) => m.id === id)?.name || '?');
  const ensure = (id) => stats[id] || (stats[id] = { games: 0, wins: 0, partners: {}, opps: {} });
  (meetings || []).forEach((mt) =>
    (mt.matches || []).forEach((m) => {
      if (!m.score) return;
      const aWin = m.score.a > m.score.b;
      const proc = (team, opp, win) => {
        team.forEach((id) => {
          const s = ensure(id); s.games++; if (win) s.wins++;
          team.filter((v) => v !== id).forEach((pid) => {
            const p = s.partners[pid] || (s.partners[pid] = { g: 0, w: 0 }); p.g++; if (win) p.w++;
          });
          opp.forEach((oid) => {
            const o = s.opps[oid] || (s.opps[oid] = { g: 0, w: 0 }); o.g++; if (win) o.w++;
          });
        });
      };
      proc(m.teamA, m.teamB, aWin);
      proc(m.teamB, m.teamA, !aWin);
    }));
  return { stats, nameOf };
}
