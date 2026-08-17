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

/** Fisher-Yates 셔플(편향 없는 무작위) */
const shuffleArr = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 실력 값 — player.ntrp 우선, 없으면 등급(A/B/C)로 근사, 그것도 없으면 3.0 */
const GRADE_NTRP = { A: 4.0, B: 3.5, C: 3.0, D: 2.5 };
const skillOf = (p) =>
  (typeof p?.ntrp === 'number' ? p.ntrp : GRADE_NTRP[p?.grade]) ?? 3.0;

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
  // 단식(1:1) — 타임 유형을 SINGLES 로 지정했을 때만 사용
  MS: { m: 2, f: 0, singles: true, label: '남단식' },
  WS: { m: 0, f: 2, singles: true, label: '여단식' },
  // 혼성 단식 — 성별 인원이 홀수라 짝이 안 맞을 때, 잡복 허용 클럽에서만 사용
  XS: { m: 1, f: 1, singles: true, label: '혼성단식' },
};

/** 타임(라운드) 유형 — 모임/클럽 설정에서 타임별로 지정 */
export const ROUND_TYPES = [
  { key: 'MX', name: '혼복', desc: '모든 타임을 남녀 2:2로 편성합니다' },
  { key: 'SAME', name: '남복 / 여복', desc: '모든 타임을 동성끼리(남남 · 여여) 편성합니다' },
  { key: 'SINGLES', name: '단식', desc: '모든 타임을 1:1로 편성합니다 (코트당 2명)' },
  {
    key: 'AUTO',
    name: '번갈아 (자동)',
    // "혼복"과 헷갈린다는 지적이 있어 이름을 바꿨다.
    // 자동은 별도 방식이 아니라 "동성복식 ↔ 혼복을 번갈아" 라는 뜻이다.
    desc: '1·3·5타임은 동성복식, 2·4·6타임은 혼복으로 번갈아 편성합니다',
  },
];
export const DEFAULT_ROUND_TYPE = 'MX';

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
/* ============================================================
   게스트 몇 명을 더 부를까 — 성비까지 같이 답한다.

   "지금 8명인데 2면이면 게스트 필요 없음", "남3 여5인데 2면이면
   남자 1명만 더" 같은 답을 대진 화면에서 바로 보여 주기 위한 것.
   총무가 머릿속으로 계산하던 것을 앱이 대신한다.

   판단 기준
     · 잡복(성비 안 맞는 복식)은 기본 금지이므로 "잡복 없이" 채우는 기준
     · 코트를 다 채우고도 남는 사람은 로테이션으로 쉬므로 게스트 불필요
     · 단식 타임은 코트당 2명이라 계산이 다르다
   ============================================================ */
export function guestNeed(players, courts, roundType = 'MX') {
  const d = diagnoseRoster(players, courts, roundType);
  const total = (players || []).length;
  const perCourt = roundType === 'SINGLES' ? 2 : 4;
  const seats = Math.max(0, courts) * perCourt;

  /* 이미 코트를 다 채우고 있으면 게스트는 필요 없다 */
  if (d.strictCourts >= courts) {
    return {
      needed: false, m: 0, f: 0, total: 0,
      M: d.M, F: d.F, seats, courtsNow: d.strictCourts, courtsWanted: courts,
      reason: total > seats
        ? `참석 ${total}명 · ${courts}면을 다 쓰고 ${total - seats}명은 교대로 쉽니다`
        : `참석 ${total}명 · ${courts}면을 채웁니다`,
    };
  }

  const need = d.needForFullStrict || { m: 0, f: 0 };
  const m = Math.max(0, need.m || 0);
  const f = Math.max(0, need.f || 0);

  /* 필요 인원이 0인데 코트가 안 차는 경우 — 성비와 무관하게 머릿수가 모자란다 */
  const short = Math.max(0, seats - total);
  const anyN = (m + f === 0) ? short : 0;

  const parts = [];
  if (m) parts.push(`남 ${m}명`);
  if (f) parts.push(`여 ${f}명`);
  if (anyN) parts.push(`${anyN}명`);

  return {
    needed: m + f + anyN > 0,
    m, f, any: anyN, total: m + f + anyN,
    M: d.M, F: d.F, seats, courtsNow: d.strictCourts, courtsWanted: courts,
    reason: parts.length
      ? `${courts}면을 다 쓰려면 ${parts.join(' · ')} 더 필요합니다`
      : `${courts}면을 다 채울 수 없습니다`,
    /* 게스트 모집글에 그대로 넣을 문구 */
    postText: parts.length
      ? `게스트 ${parts.join(', ')} 모집합니다`
      : '게스트 모집합니다',
  };
}

export function diagnoseRoster(players, courts, roundType) {
  const M = (players || []).filter((p) => p.gender === 'M').length;
  const F = (players || []).length - M;

  // 단식 타임은 코트당 2명 — 판정 기준이 다르다
  if (roundType === 'SINGLES') {
    const singlesCourts = Math.min(courts, Math.floor(M / 2) + Math.floor(F / 2));
    return {
      M, F, singles: true,
      strictCourts: singlesCourts,
      mixedCourts: singlesCourts,
      canPlayStrict: singlesCourts > 0,
      canPlayMixed: singlesCourts > 0,
      needForFirstCourt: singlesCourts > 0 ? { m: 0, f: 0 }
        : { m: M === 1 ? 1 : (F === 1 ? 0 : 2), f: F === 1 ? 1 : 0 },
      needForFullStrict: { m: 0, f: 0 },
      needForOneMoreStrict: { m: 0, f: 0 },
    };
  }

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
        const bestTotal = best ? best.m + best.f : Infinity;
        /* 인원이 같으면 남녀를 고르게 부르는 쪽을 권한다.
           "여자 4명"보다 "남 2명·여 2명"이 실제로 모으기 쉽다. */
        const fairer = total === bestTotal
          && Math.abs(addM - addF) < Math.abs(best.m - best.f);
        if (total < bestTotal || fairer) best = { m: addM, f: addF };
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
    const allowMixed = !!options.allowMixed;     // 잡복 허용(기본 false)
    const skillBalance = !!options.skillBalance; // NTRP 근접 매칭(기본 false)
    const availM = players.filter((p) => p.gender === 'M').length;
    const availF = players.filter((p) => p.gender === 'F').length;

    /* 1) 타임별 코트 구성 사전 결정: 혼복x + 남복y + 여복z = courts 전수 탐색 */
    /* 이 타임의 유형 (MX 혼복 / SAME 동성복식 / SINGLES 단식 / AUTO 자동) */
    const plan = (options.roundPlan && options.roundPlan[r]) || options.defaultRoundType || 'AUTO';

    /* --- 단식 타임: 코트당 2명. 남단식 a면 + 여단식 b면 ---

       남/여 몇 면씩 쓸지를 그 타임만 보고 정하면, 성비가 같은 클럽에서
       매 타임 똑같은 조합이 뽑혀 한쪽 성별만 계속 뛰게 된다.
       (실제 사례: 남4·여4·3면 → 여자 4게임, 남자 2게임)

       그래서 후보 조합마다 "이 조합을 쓰면 각자 경기 수가 어떻게 되는지"를
       미리 계산해, 경기 수 제곱합이 가장 작은 = 가장 고른 조합을 고른다.
       제곱합은 편차가 클수록 급격히 커져서, 적게 뛴 사람이 있는 쪽에
       자연스럽게 코트를 더 준다. */
    if (plan === 'SINGLES') {
      /* 경기 수가 적은 사람 우선, 같으면 많이 쉰 사람 우선 */
      const byNeed = (gender) => players
        .filter((p) => p.gender === gender)
        .sort((p1, p2) =>
          (games[p1.id] - games[p2.id]) * W.evenGames
          - (rest(p1.id) - rest(p2.id)) * W.restPriority * 0.5
          || Math.random() - 0.5);
      const queueM = byNeed('M');
      const queueF = byNeed('F');

      /* 후보: 남단식 a면 + 여단식 b면 + 혼성단식 c면.
         혼성은 잡복을 허용한 클럽에서만 쓴다(c 는 그 외엔 항상 0). */
      let sb = null, sbKey = null;
      const maxC = allowMixed ? courts : 0;
      for (let a = 0; 2 * a <= availM && a <= courts; a++) {
        for (let b = 0; 2 * b <= availF && a + b <= courts; b++) {
          const leftM = availM - 2 * a;
          const leftF = availF - 2 * b;
          const cLimit = Math.min(maxC, courts - a - b, leftM, leftF);
          for (let c = 0; c <= cLimit; c++) {
            if (a + b + c === 0) continue;
            /* 이 조합을 쓰면 각자 경기 수가 몇이 되는지 미리 계산한다 */
            const after = { ...games };
            queueM.slice(0, 2 * a + c).forEach((p) => { after[p.id] += 1; });
            queueF.slice(0, 2 * b + c).forEach((p) => { after[p.id] += 1; });
            const vals = players.map((p) => after[p.id]);
            const sumSq = vals.reduce((t, v) => t + v * v, 0);   // 작을수록 고르다
            const spread = Math.max(...vals) - Math.min(...vals);
            const key = [
              -(a + b + c) * W.maxPlay,     // 1) 코트를 최대한 채운다
              sumSq * W.evenGames,          // 2) 경기 수를 고르게
              spread,                       // 3) 최대-최소 편차
              c,                            // 4) 같은 조건이면 동성 단식을 먼저
              Math.random(),                // 5) 그래도 같으면 무작위
            ];
            const better = !sbKey || key.some((v, i) => v < sbKey[i]
              && key.slice(0, i).every((u, j) => u === sbKey[j]));
            if (better) { sbKey = key; sb = { a, b, c }; }
          }
        }
      }
      if (!sb) return null;

      const sm = shuffleArr(queueM.slice(0, 2 * sb.a));
      const sf = shuffleArr(queueF.slice(0, 2 * sb.b));
      // 혼성 단식에 들어갈 사람 — 동성 단식에 안 뽑힌 사람 중 앞에서부터
      const xm = queueM.slice(2 * sb.a, 2 * sb.a + sb.c);
      const xf = queueF.slice(2 * sb.b, 2 * sb.b + sb.c);
      // 실력 매칭: 비슷한 NTRP 끼리 붙도록 정렬 후 인접끼리 배정
      if (skillBalance) {
        sm.sort((p1, p2) => skillOf(p2) - skillOf(p1));
        sf.sort((p1, p2) => skillOf(p2) - skillOf(p1));
        xm.sort((p1, p2) => skillOf(p2) - skillOf(p1));
        xf.sort((p1, p2) => skillOf(p2) - skillOf(p1));
      }

      const singlesMatches = [];
      let court = 1;
      for (let i = 0; i + 1 < sm.length; i += 2) {
        singlesMatches.push({
          id: uid(), round: r, court: court++, type: TYPES.MS.label,
          teamA: [sm[i].id], teamB: [sm[i + 1].id], score: null,
        });
      }
      for (let i = 0; i + 1 < sf.length; i += 2) {
        singlesMatches.push({
          id: uid(), round: r, court: court++, type: TYPES.WS.label,
          teamA: [sf[i].id], teamB: [sf[i + 1].id], score: null,
        });
      }
      for (let i = 0; i < xm.length && i < xf.length; i += 1) {
        singlesMatches.push({
          id: uid(), round: r, court: court++, type: TYPES.XS.label,
          teamA: [xm[i].id], teamB: [xf[i].id], score: null,
        });
      }
      if (!singlesMatches.length) return null;
      return { matches: singlesMatches, tempPairs: {} };
    }

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

          /* 타임 유형 반영: 지정된 유형에 강한 가산점(불가능하면 자연히 다른 구성으로 폴백) */
          if (plan === 'MX') s += x * 40;                    // 혼복 우선
          else if (plan === 'SAME') s += (y + z) * 40;       // 동성 복식 우선
          else {                                             // AUTO: 홀수=동성, 짝수=혼복
            const patternFit = r % 2 === 1 ? y + z : x;
            s += patternFit * 3 * W.pattern;
          }

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
    // 실력 매칭이 켜지면 실력순 정렬(같은 코트에 비슷한 수준끼리 모임), 아니면 무작위
    const arrange = (pool) => (skillBalance
      ? [...pool].sort((p1, p2) => skillOf(p2) - skillOf(p1) || Math.random() - 0.5)
      : shuffleArr(pool));

    for (let attempt = 0; attempt < MAX_GLOBAL && !roundResult; attempt++) {
      // 시간 상한: 불가능한 제약에 매달리지 않고 즉시 완화 단계로 넘어감
      if (attempt % 10 === 0 && Date.now() > deadline) return null;
      const m = arrange(poolM);
      const f = arrange(poolF);
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
          } else if (courtTypes[c] === 'MX') {
            // 실력 매칭 시 1등남+2등여 / 2등남+1등여 로 교차 → 양 팀 실력 합 균등
            if (skillBalance) { teamA = [ms[0], fs[1]]; teamB = [ms[1], fs[0]]; }
            else { teamA = [ms[0], fs[0]]; teamB = [ms[1], fs[1]]; }
          } else {
            const pl = ms.length ? ms : fs;
            if (skillBalance) { teamA = [pl[0], pl[3]]; teamB = [pl[1], pl[2]]; } // 1·4 vs 2·3
            else { teamA = [pl[0], pl[1]]; teamB = [pl[2], pl[3]]; }
          }
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
            if (skillBalance) {                    // 실력순은 유지하고 동점자끼리만 섞음
              m.sort((p1, p2) => skillOf(p2) - skillOf(p1) || Math.random() - 0.5);
              f.sort((p1, p2) => skillOf(p2) - skillOf(p1) || Math.random() - 0.5);
            } else {
              m.splice(0, m.length, ...shuffleArr(m));
              f.splice(0, f.length, ...shuffleArr(f));
            }
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
    // ranked === false 인 모임(친선·연습)은 랭킹·전적에서 제외한다.
    // 값이 없는 예전 모임은 기존대로 반영한다.
    (mt.ranked === false ? [] : (mt.matches || [])).forEach((m) => {
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
