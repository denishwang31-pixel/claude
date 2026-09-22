/* ============================================================
   수기 대진표 — 자동 편성을 쓰지 않고 손으로 짠다

   자동 편성이 아무리 좋아도 현장에는 규칙으로 못 적는 사정이 있다.
     "오늘 저 형이 무릎이 안 좋아서 1타임만"
     "저 둘은 오랜만에 만났으니 한 번 붙여 주자"
     "3코트는 조명이 어두워서 고수들끼리"
   이럴 때 지금까지는 자동으로 짠 뒤 마음에 안 들면 다시 돌리는 수밖에
   없었다. 다시 돌리면 마음에 들던 다른 칸까지 같이 바뀐다.

   그래서 빈 표를 먼저 만들고 칸을 눌러 채우는 길을 연다.
   코트 × 타임 격자만 잡아 두고 나머지는 사람이 정한다.

   자동으로 짠 대진을 손으로 고치는 것도 같은 화면에서 된다 —
   전부 지우고 새로 짤 필요가 없다.
   ============================================================ */

/** 한 경기에 한 팀이 몇 명인가 */
export const slotSize = (m) => (m?.typeKey === 'SG' || m?.type === '단식' ? 1 : 2);

/**
 * 빈 대진표. 코트 × 타임 칸만 만들고 선수는 비워 둔다.
 * type 은 비워 둔다 — 넣고 나서 자동으로 붙인다(넣기 전에는 알 수 없다).
 */
export function blankDraw({ courts = 2, rounds = 4, singles = false } = {}) {
  const nc = Math.max(1, Math.min(20, Number(courts) || 1));
  const nr = Math.max(1, Math.min(30, Number(rounds) || 1));
  const out = [];
  for (let r = 1; r <= nr; r += 1) {
    for (let c = 1; c <= nc; c += 1) {
      out.push({
        id: `mn-${r}-${c}`,
        round: r,
        court: c,
        manual: true,
        typeKey: singles ? 'SG' : null,
        type: singles ? '단식' : '',
        teamA: [],
        teamB: [],
        score: null,
      });
    }
  }
  return out;
}

/**
 * 넣은 사람들을 보고 경기 종류를 붙인다.
 * 사람이 고르게 하면 한 번 더 누르게 되고, 어차피 성별로 정해진다.
 */
export function labelOf(match, genderOf) {
  const ids = [...(match.teamA || []), ...(match.teamB || [])];
  if (!ids.length) return '';
  const g = (id) => (genderOf ? genderOf(id) : '');
  const singles = (match.teamA || []).length === 1 && (match.teamB || []).length === 1;
  if (singles) {
    const [a, b] = ids;
    if (g(a) === 'F' && g(b) === 'F') return '여단식';
    if (g(a) !== 'F' && g(b) !== 'F') return '남단식';
    return '혼성단식';
  }
  if (ids.length < 4) return '';
  const allM = ids.every((id) => g(id) !== 'F');
  const allF = ids.every((id) => g(id) === 'F');
  if (allM) return '남복';
  if (allF) return '여복';
  const mixedA = (match.teamA || []).some((id) => g(id) === 'F')
    && (match.teamA || []).some((id) => g(id) !== 'F');
  const mixedB = (match.teamB || []).some((id) => g(id) === 'F')
    && (match.teamB || []).some((id) => g(id) !== 'F');
  return mixedA && mixedB ? '혼복' : '잡복';
}

/**
 * 한 칸에 선수를 넣고 뺀다.
 *
 * 이미 있으면 뺀다(다시 누르면 취소). 자리가 찼으면 가장 먼저 넣은
 * 사람을 밀어낸다 — 꽉 찬 칸에서 아무 반응이 없으면 고장으로 보인다.
 */
export function toggleInSlot(match, side, playerId) {
  const key = side === 'B' ? 'teamB' : 'teamA';
  const cur = [...(match[key] || [])];
  const cap = slotSize(match);
  let next;
  if (cur.includes(playerId)) next = cur.filter((id) => id !== playerId);
  else if (cur.length >= cap) next = [...cur.slice(1), playerId];
  else next = [...cur, playerId];
  return { ...match, [key]: next };
}

/** 그 타임에 이미 뛰는 사람 — 한 사람이 두 코트에 설 수는 없다 */
export function busyInRound(matches, round, exceptId) {
  const set = new Set();
  (matches || []).forEach((m) => {
    if (m.round !== round || m.id === exceptId) return;
    [...(m.teamA || []), ...(m.teamB || [])].forEach((id) => set.add(id));
  });
  return set;
}

/** 사람별 출전 횟수 — 수기로 짜면 이걸 안 보고는 균형을 못 맞춘다 */
export function playCounts(players, matches) {
  const out = {};
  (players || []).forEach((p) => { out[p.id] = 0; });
  (matches || []).forEach((m) => {
    [...(m.teamA || []), ...(m.teamB || [])].forEach((id) => {
      out[id] = (out[id] || 0) + 1;
    });
  });
  return out;
}

/**
 * 지금 표가 쓸 만한지 훑는다.
 * 저장을 막지는 않는다 — 사정이 있어 일부러 비워 두는 경우도 있다.
 * 다만 모르고 지나치지는 않게 한다.
 */
export function reviewDraw(players, matches) {
  const counts = playCounts(players, matches);
  const filled = (matches || []).filter((m) => (m.teamA || []).length || (m.teamB || []).length);

  const incomplete = (matches || []).filter((m) => {
    const a = (m.teamA || []).length;
    const b = (m.teamB || []).length;
    if (!a && !b) return false;                 // 아예 빈 칸은 "안 쓰는 코트"로 본다
    const cap = slotSize(m);
    return a !== cap || b !== cap;
  });

  const dupes = [];
  const rounds = [...new Set((matches || []).map((m) => m.round))];
  rounds.forEach((r) => {
    const seen = new Set();
    (matches || []).filter((m) => m.round === r).forEach((m) => {
      [...(m.teamA || []), ...(m.teamB || [])].forEach((id) => {
        if (seen.has(id)) dupes.push({ round: r, id });
        seen.add(id);
      });
    });
  });

  const nums = Object.values(counts);
  const max = nums.length ? Math.max(...nums) : 0;
  const min = nums.length ? Math.min(...nums) : 0;

  return {
    empty: (matches || []).length - filled.length,
    incomplete,
    dupes,
    max,
    min,
    spread: max - min,
    unused: (players || []).filter((p) => !counts[p.id]),
    counts,
  };
}

/* ---------------- 저장 전 표와 저장된 표 비교 ----------------

   수기 편집은 고치는 족족 저장되고 있었다. 한 칸을 잘못 누르면 그대로
   반영되고, 되돌리려면 원래 누구였는지 기억해 내서 다시 넣어야 했다.
   이제 편집은 손안의 사본(초안)에서 하고, [저장하기]를 눌러야 반영된다.

   그러면 "저장 안 한 것이 있는가"를 알아야 한다. 이걸 플래그로 들고
   다니면(setDirty(true)) 반드시 어긋난다 — 되돌리기를 만들거나, 고쳤다
   되돌려 원래대로 만든 경우를 놓친다. 그래서 플래그를 두지 않고
   **두 표를 직접 비교**한다. 답이 항상 지금 화면과 일치한다.

   id 는 빈 표를 만들 때 정해져 바뀌지 않으므로 id 로 짝을 짓는다.
   (칸의 순서는 화면에서 정렬해 쓰므로 비교에 넣지 않는다) */

/** 한 칸이 같은가. 사람은 순서까지 같아야 같은 것으로 본다
    — 앞/뒤가 바뀌면 코트에 서는 자리가 달라진다. */
function sameSlot(a, b) {
  if (!a || !b) return false;
  const team = (x) => (x || []).join('>');
  const score = (m) => (m?.score ? `${m.score.a}:${m.score.b}` : '');
  return a.round === b.round
    && a.court === b.court
    && team(a.teamA) === team(b.teamA)
    && team(a.teamB) === team(b.teamB)
    && (a.type || '') === (b.type || '')
    && score(a) === score(b);
}

/** 두 대진표가 같은가 — 같으면 저장할 것이 없다는 뜻 */
export function sameDraw(a, b) {
  const A = a || [];
  const B = b || [];
  if (A.length !== B.length) return false;
  const byId = new Map(B.map((m) => [m.id, m]));
  return A.every((m) => sameSlot(m, byId.get(m.id)));
}

/**
 * 저장 전 표가 저장된 표와 몇 칸이나 다른지.
 * 경고창에 "3칸을 고쳤습니다" 라고 적어 주려는 것 — 숫자가 없으면
 * 사용자는 자기가 뭘 했는지 모른 채 [나가기]와 [저장] 중에 골라야 한다.
 */
export function draftChanges(draft, saved) {
  const S = new Map((saved || []).map((m) => [m.id, m]));
  const D = new Map((draft || []).map((m) => [m.id, m]));
  let changed = 0;
  D.forEach((m, id) => { if (!sameSlot(m, S.get(id))) changed += 1; });
  S.forEach((m, id) => { if (!D.has(id)) changed += 1; });
  return changed;
}

export default {
  slotSize, blankDraw, labelOf, toggleInSlot, busyInRound, playCounts, reviewDraw,
  sameDraw, draftChanges,
};
