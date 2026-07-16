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
};

/**
 * @param {Array} players    [{id,name,gender:'M'|'F',grade}]
 * @param {number} courts    코트 수
 * @param {number} rounds    라운드(타임) 수
 * @param {Array} ruleOrder  DEFAULT_RULES 순서(우선순위)
 * @param {Object} pastPairs collectPastPairs 결과
 * @param {Object} restScores {playerId: number}
 * @returns {Array} matches  [{id,round,court,type,teamA:[id,id],teamB:[id,id],score}]
 */
export function generateMatchesV5(players, courts, rounds, ruleOrder, pastPairs = {}, restScores = {}) {
  const W = {};
  (ruleOrder || DEFAULT_RULES).forEach((r, i) => { W[r.key] = (ruleOrder || DEFAULT_RULES).length - i; });
  const strictPair = W.pairNoRepeat >= 4; // 페어중복방지 1~2순위 → 엄격

  const games = {};
  players.forEach((p) => { games[p.id] = 0; });
  const usedPairs = { ...pastPairs };
  const allMatches = [];
  const rest = (id) => restScores[id] || 0;

  for (let r = 1; r <= rounds; r++) {
    const availM = players.filter((p) => p.gender === 'M').length;
    const availF = players.filter((p) => p.gender === 'F').length;

    /* 1) 타임별 코트 구성 사전 결정: 혼복x + 남복y + 여복z = courts 전수 탐색 */
    let best = null, bestScore = -Infinity;
    for (let x = 0; x <= courts; x++) {
      for (let y = 0; y <= courts - x; y++) {
        const z = courts - x - y;
        const needM = 2 * x + 4 * y;
        const needF = 2 * x + 4 * z;
        if (needM > availM || needF > availF) continue;
        const onCourt = needM + needF;
        let s = onCourt * 10 * W.maxPlay;                 // 출전 인원 최대화 최우선
        const patternFit = r % 2 === 1 ? y + z : x;        // 홀수=동성복식, 짝수=혼복
        s += patternFit * 3 * W.pattern;
        s -= Math.abs((availM - needM) - (availF - needF)); // 잔여 성비 불균형 페널티
        if (s > bestScore) { bestScore = s; best = { x, y, z, needM, needF }; }
      }
    }
    if (!best || best.needM + best.needF < 4) continue; // 이 타임 편성 불가

    const { x, y, z, needM, needF } = best;

    /* 2) 타임 단위 풀 선발: 출전횟수 최소 → 휴식점수 → 랜덤 */
    const pick = (gender, n) =>
      players
        .filter((p) => p.gender === gender)
        .sort((a, b) =>
          (games[a.id] - games[b.id]) * W.evenGames
          - (rest(a.id) - rest(b.id)) * W.restPriority * 0.5
          || Math.random() - 0.5)
        .slice(0, n);
    const poolM = pick('M', needM);
    const poolF = pick('F', needF);

    /* 3) 코트별 슬롯 배정 + 페어 중복 체크(재시도) */
    let courtTypes = [
      ...Array(x).fill('MX'), ...Array(y).fill('MM'), ...Array(z).fill('FF'),
    ];
    courtTypes.sort((a, b) =>
      r % 2 === 0 ? (a === 'MX' ? -1 : 1) : (a === 'MX' ? 1 : -1));

    const MAX_GLOBAL = 200, MAX_GAME = 40;
    let roundResult = null;
    for (let attempt = 0; attempt < MAX_GLOBAL && !roundResult; attempt++) {
      const m = [...poolM].sort(() => Math.random() - 0.5);
      const f = [...poolF].sort(() => Math.random() - 0.5);
      const tempPairs = {};
      const matches = [];
      let ok = true;

      for (let c = 0; c < courtTypes.length; c++) {
        const t = TYPES[courtTypes[c]];
        let placed = null;
        for (let g = 0; g < MAX_GAME && !placed; g++) {
          const ms = m.splice(0, t.m);
          const fs = f.splice(0, t.f);
          let teamA, teamB;
          if (courtTypes[c] === 'MX') { teamA = [ms[0], fs[0]]; teamB = [ms[1], fs[1]]; }
          else { const pl = ms.length ? ms : fs; teamA = [pl[0], pl[1]]; teamB = [pl[2], pl[3]]; }
          if (!teamA[0] || !teamA[1] || !teamB[0] || !teamB[1]) { m.unshift(...ms); f.unshift(...fs); break; }
          const kA = pairKey(teamA[0].id, teamA[1].id);
          const kB = pairKey(teamB[0].id, teamB[1].id);
          const repeat = (usedPairs[kA] || 0) + (usedPairs[kB] || 0) + (tempPairs[kA] || 0) + (tempPairs[kB] || 0);
          if (repeat === 0 || (!strictPair && g > MAX_GAME * 0.6) || g === MAX_GAME - 1) {
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

    if (roundResult) {
      roundResult.matches.forEach((mt) => [...mt.teamA, ...mt.teamB].forEach((id) => { games[id]++; }));
      Object.entries(roundResult.tempPairs).forEach(([k, v]) => { usedPairs[k] = (usedPairs[k] || 0) + v; });
      allMatches.push(...roundResult.matches);
    }
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
