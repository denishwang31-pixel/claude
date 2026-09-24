/* ============================================================
   점수 보고 — 한 팀이 넣고, 상대 팀이 확인한다

   왜 이렇게 바꿨나
     예전에는 운영진만 점수를 넣을 수 있었다. 그런데 3면 6타임이면
     한 모임에 18경기다. 총무 한 사람이 코트를 돌며 18번을 받아 적는
     것은 현실에서 안 된다. 결국 아무도 안 넣고 기록이 비었다.

     이제 **뛴 사람이 직접 넣는다.** 대신 혼자 정하지 못하게 한다 —
     한 팀이 넣으면 **상대 팀**이 확인해야 확정된다. 둘이 맞다고 한
     숫자만 기록으로 남는다.

   세 가지 상태
     미입력   아무도 안 넣음
     확인대기 한 팀이 넣었고 상대 팀을 기다리는 중  (meeting.scores)
     확정     상대 팀이 확인함. 회원은 못 고친다     (meeting.finals)

   ⚠️ 왜 배열이 아니라 두 개의 map 인가 — 보안 규칙 때문이다.
      점수를 matches 배열 안에 두면, 회원이 점수를 쓰려면 matches 를
      통째로 쓸 권한을 줘야 한다. Firestore 규칙은 **배열의 한 칸만
      바뀌었는지 검사할 수 없다.** 그러면 회원 아무나 대진표 전체를
      갈아치울 수 있다.

      map 으로 쪼개면 규칙이 addedKeys/changedKeys/removedKeys 로
      검사할 수 있다. 그래서 확정본(finals)은 **회원에게 추가만
      허용하고 변경·삭제는 막는다**. "둘이 확정하면 변경 불가,
      운영진만 수정"이 규칙 수준에서 지켜지는 이유다.

   "이 사람이 정말 그 경기에 뛰었는가" — 규칙이 직접 본다.
      규칙에는 반복문이 없어서 matches 배열을 뒤질 수는 없다. 처음에는
      그래서 "규칙으로는 못 막는다"고 넘겼는데, 그건 **데이터 모양을
      안 바꿨을 때**의 이야기였다. 두 가지를 더 적으면 된다.

        lineup   경기별 두 팀 명단 map. { r1c1: { A:[..], B:[..] } }
                 대진을 저장할 때마다 같이 적는다(saveMatches).
                 규칙이 lineup[경기].A 안에 내 uid 가 있는지 바로 본다.
        scoreOp  "지금 어느 경기를 건드리는가"를 쓰기 요청에 같이 적는다.
                 규칙은 바뀐 칸의 이름을 꺼낼 수 없으므로, 앱이 이름을
                 대고 규칙은 **정말 그 칸만 바뀌었는지** 대조한다.

      이 둘로 규칙이 확인한다 — 뛴 사람만 넣는다, 넣은 팀의 **반대
      팀**만 확정한다, 확정할 때 숫자를 못 바꾼다, 확정된 것은 회원이
      못 건드린다. 앱 밖에서 요청을 꾸며도 통하지 않는다.

   ⚠️ 확정된 점수만 matches[].score 로 합쳐 준다(mergeScores).
      랭킹·통산기록·KDK 순위가 전부 m.score 를 읽는데, 확인 안 된
      숫자가 거기 섞이면 "아직 맞다고 한 적 없는 점수"로 순위가
      매겨진다. 합치는 자리를 한 곳(useClub)으로 두어, 읽는 쪽은
      예전과 똑같이 m.score 만 보면 되게 한다.
   ============================================================ */

export const SCORE_STATE = {
  NONE: 'none',
  PENDING: 'pending',
  FINAL: 'final',
};

/** 앱에 로그인할 수 없는 사람 — 오프라인 등록 회원과 게스트.
    이들은 확인을 눌러 줄 수 없다. 상대 팀이 전부 이런 사람이면
    아무도 확인할 수 없으므로 운영진이 대신 확정해야 한다. */
export const isOfflineId = (id) => {
  const s = String(id || '');
  return s.startsWith('local:') || s.startsWith('g:');
};

/** 이 사람이 이 경기의 어느 팀인가. 안 뛰었으면 null */
export function sideOf(match, uid) {
  if (!match || !uid) return null;
  if ((match.teamA || []).includes(uid)) return 'A';
  if ((match.teamB || []).includes(uid)) return 'B';
  return null;
}

/** 반대 팀 */
export const otherSide = (side) => (side === 'A' ? 'B' : side === 'B' ? 'A' : null);

export const reportOf = (meeting, matchId) => (meeting?.scores || {})[matchId] || null;
export const finalOf = (meeting, matchId) => (meeting?.finals || {})[matchId] || null;

export function scoreStateOf(meeting, matchId) {
  if (finalOf(meeting, matchId)) return SCORE_STATE.FINAL;
  if (reportOf(meeting, matchId)) return SCORE_STATE.PENDING;
  return SCORE_STATE.NONE;
}

/**
 * 확정된 점수를 대진표에 얹는다.
 * ⚠️ 확인 대기 중인 숫자는 일부러 넣지 않는다 — 위 머리말 참고.
 */
export function mergeScores(matches, finals) {
  const F = finals || {};
  return (matches || []).map((m) => {
    const f = F[m.id];
    if (!f) return m;
    return { ...m, score: { a: Number(f.a), b: Number(f.b) } };
  });
}

/** 점수가 쓸 수 있는 값인가. 동점은 승패가 안 갈려서 막는다. */
export function validScore(a, b) {
  /* ⚠️ Number('') 는 0 이다. 빈 칸을 그냥 Number 로 바꾸면 0 점으로
        통과해 버린다 — 한 칸만 채우고 저장하면 0:6 이 기록된다.
        빈 값은 숫자로 바꾸기 전에 걸러야 한다. */
  if (a === '' || a === null || a === undefined) return false;
  if (b === '' || b === null || b === undefined) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isInteger(na) || !Number.isInteger(nb)) return false;
  if (na < 0 || nb < 0) return false;
  if (na > 99 || nb > 99) return false;
  return na !== nb;
}

/**
 * 점수를 넣을 수 있는가.
 * 뛴 사람이거나 운영진. 이미 확정된 경기는 운영진만.
 */
export function canReport(match, meeting, uid, isAdmin) {
  if (!match || !uid) return false;
  /* 오프라인 등록 회원·게스트의 id 로는 로그인할 수 없다. 여기까지
     올 일이 없지만, 못 한다는 것을 함수가 직접 말하게 해 둔다. */
  if (isOfflineId(uid)) return false;
  if (scoreStateOf(meeting, match.id) === SCORE_STATE.FINAL) return !!isAdmin;
  return !!isAdmin || !!sideOf(match, uid);
}

/**
 * 확인(컨펌)할 수 있는가.
 *
 * ⚠️ 넣은 본인은 절대 확인할 수 없다. 이게 이 기능의 전부다 —
 *    혼자 넣고 혼자 확인하면 예전과 똑같아진다.
 * ⚠️ 상대 팀만 확인한다. 같은 팀 동료가 확인해 주면 "양 팀이 맞다고
 *    했다"가 아니라 "한 팀이 두 번 말했다"가 된다.
 *
 * 운영진은 대리 확인할 수 있다 — 상대 팀이 전부 오프라인 회원이라
 * 아무도 누를 수 없는 경우가 실제로 있기 때문이다. 단 운영진이라도
 * **자기가 넣은 것은 확인할 수 없다**(아래 report.by 검사).
 */
export function canConfirm(match, meeting, uid, isAdmin) {
  const rep = reportOf(meeting, match?.id);
  if (!rep || !uid) return false;
  if (isOfflineId(uid)) return false;          // 앱을 쓸 수 없는 사람
  if (finalOf(meeting, match.id)) return false;
  if (rep.by === uid) return false;                 // 넣은 본인은 불가
  const mine = sideOf(match, uid);
  if (mine && mine === otherSide(rep.side)) return true;
  return !!isAdmin;                                  // 운영진 대리 확인
}

/** 확정된 점수를 고칠 수 있는가 — 운영진만. */
export const canEditFinal = (isAdmin) => !!isAdmin;

/**
 * 상대 팀에 확인을 눌러 줄 수 있는 사람이 있는가.
 * 없으면 화면에서 "운영진이 확정해야 합니다"라고 미리 알려 준다 —
 * 모르면 아무도 안 누르는 채로 영영 확인 대기에 남는다.
 */
export function hasConfirmer(match, side) {
  const team = side === 'A' ? match?.teamA : match?.teamB;
  return (team || []).some((id) => !isOfflineId(id));
}

/** 보고 기록 한 건 만들기 */
export function makeReport({ a, b, uid, side }) {
  return {
    a: Number(a), b: Number(b), by: uid, side, at: Date.now(),
  };
}

/** 확정 기록 한 건 만들기. admin 이면 상대 확인 없이 운영진이 정한 것이다. */
export function makeFinal(report, uid, { admin = false } = {}) {
  return {
    a: Number(report.a), b: Number(report.b),
    by: report.by || uid,
    confirmBy: uid,
    admin: !!admin,
    at: Date.now(),
  };
}

/**
 * 내가 지금 확인해 줘야 할 경기들.
 * 코트에서는 이 목록이 화면 맨 위에 떠 있어야 한다 — 대진표를 훑어
 * "확인 대기"를 찾아내라고 하면 아무도 안 한다.
 */
export function awaitingMyConfirm(matches, meeting, uid, isAdmin) {
  return (matches || []).filter((m) => canConfirm(m, meeting, uid, isAdmin));
}

/** 아직 점수가 안 들어간 내 경기들 — "넣어 주세요"를 띄울 자리 */
export function myUnreported(matches, meeting, uid) {
  if (!uid) return [];
  return (matches || []).filter((m) =>
    sideOf(m, uid) && scoreStateOf(meeting, m.id) === SCORE_STATE.NONE);
}

/**
 * 대진 화면 위 「내 경기」의 1~N경기 버튼.
 * 그날의 경기(타임) 수만큼 칸을 만들고, 내가 뛰는 경기만 match 를 채운다.
 * 예전엔 "아직 점수 없는 가장 이른 경기" 하나만 보여서, 하루 3~4경기를
 * 뛰는 사람이 뒤 경기를 미리 볼 수 없었다(앱 주인이 겪음).
 * @returns [{ round, match | null }]
 */
export function myRoundSlots(matches, uid, rounds = 0) {
  const all = matches || [];
  const maxR = Math.max(Number(rounds) || 0, 0, ...all.map((m) => Number(m.round) || 0));
  return Array.from({ length: maxR }, (_, i) => {
    const r = i + 1;
    const match = uid
      ? all.find((m) => Number(m.round) === r && sideOf(m, uid)) || null
      : null;
    return { round: r, match };
  });
}

/** 처음 열었을 때 고를 경기 — 아직 점수가 없는 내 경기 중 가장 이른 것,
    다 끝났으면 내 마지막 경기. 내 경기가 없으면 null. */
export function pickMyRound(slots, isDone = (m) => !!m.score) {
  const mine = (slots || []).filter((s) => s.match);
  if (!mine.length) return null;
  const next = mine.find((s) => !isDone(s.match));
  return (next || mine[mine.length - 1]).round;
}

/** 한 모임의 진행 상황 — "18경기 중 12확정 · 3대기" */
export function progressOf(matches, meeting) {
  let final = 0;
  let pending = 0;
  (matches || []).forEach((m) => {
    const st = scoreStateOf(meeting, m.id);
    if (st === SCORE_STATE.FINAL) final += 1;
    else if (st === SCORE_STATE.PENDING) pending += 1;
  });
  const total = (matches || []).length;
  return { total, final, pending, none: total - final - pending };
}

/* ---------------- 규칙이 읽는 명단 ---------------- */

/**
 * 경기별 두 팀 명단 — 보안 규칙이 "이 사람이 뛰었나"를 볼 수 있게 적는다.
 * ⚠️ 대진을 저장할 때마다 **반드시** 같이 적어야 한다. 대진만 바뀌고
 *    명단이 옛날 것이면, 새로 들어간 사람은 점수를 못 넣고 빠진 사람이
 *    넣을 수 있게 된다. 그래서 saveMatches 가 직접 계산해 넣는다 —
 *    부르는 쪽이 챙기게 하면 언젠가 한 군데서 빠진다.
 */
export function lineupOf(matches) {
  const out = {};
  (matches || []).forEach((m) => {
    if (!m || !m.id) return;
    out[m.id] = { A: [...(m.teamA || [])], B: [...(m.teamB || [])] };
  });
  return out;
}

/* 한 팀 안에서 순서는 상관없다 — 누가 뛰었는지만 본다. 팀(A/B)은 다르다. */
const teamKey = (t) => [...(t || [])].sort().join(',');
const sameTeams = (x, y) => !!x && !!y
  && teamKey(x.A) === teamKey(y.A) && teamKey(x.B) === teamKey(y.B);

/** 두 명단이 같은가 — 저장된 명단이 대진과 어긋났는지 볼 때 */
export function sameLineup(a, b) {
  const A = a || {};
  const B = b || {};
  const ka = Object.keys(A);
  if (ka.length !== Object.keys(B).length) return false;
  return ka.every((k) => sameTeams(A[k], B[k]));
}

/**
 * 대진을 다시 저장할 때 **무효가 되는 점수**.
 *
 * ⚠️ 수기 표의 경기 id 는 `mn-1-1` 처럼 타임·코트로 정해진다. 빈 표를
 *    다시 만들면 같은 id 가 또 나오고, 지우지 않으면 **예전 경기의 확정
 *    점수가 새 경기에 그대로 달라붙는다.** 수기 편집으로 사람을 바꾼
 *    경기도 마찬가지다 — 김·이 조가 넣은 6:3 이 박·최 조의 기록이 된다.
 *
 * 사람이 바뀌었거나 없어진 경기의 점수(대기·확정 모두)를 골라낸다.
 * 예전 대진에 없던 id 의 점수(더 오래전 재생성의 찌꺼기)도 같이 버린다.
 */
export function staleScoreIds(prevMatches, nextMatches, meeting) {
  const prev = lineupOf(prevMatches);
  const next = lineupOf(nextMatches);
  const scored = new Set([
    ...Object.keys(meeting?.scores || {}),
    ...Object.keys(meeting?.finals || {}),
  ]);
  return [...scored].filter((id) => !next[id] || !prev[id] || !sameTeams(prev[id], next[id]));
}

/** 쓰기 요청에 붙이는 표지 — 규칙이 "어느 경기를 건드리는가"를 안다 */
export const scoreOp = (kind, matchId, uid) => ({
  kind, match: matchId, by: uid, at: Date.now(),
});

/**
 * 운영진이 직접 정하는 경우인가.
 *
 * 입력은 **뛴 사람이** 한다. 운영진이라도 자기가 뛴 경기는 똑같이
 * 넣고 상대의 확인을 받는다 — 그래야 "운영진은 혼자 정해도 된다"는
 * 구멍이 안 생긴다. 운영진의 몫은 **수정**이다.
 *   · 이미 확정된 경기를 고칠 때
 *   · 자기가 안 뛴 경기(오프라인 회원끼리 친 경기 등)를 정할 때
 */
export function isAdminOverride(match, meeting, uid, isAdmin) {
  if (!isAdmin || !match) return false;
  if (scoreStateOf(meeting, match.id) === SCORE_STATE.FINAL) return true;
  return !sideOf(match, uid);
}

/* ---------------- 알림 ----------------
   서버(functions/scoreReport.js)에 똑같은 사본이 있다 — 배포 묶음에
   src/lib 가 안 들어가기 때문이다. 둘이 같은 답을 내는지
   scripts/test-scorereport.mjs 가 매번 대조한다.

   알림은 **해야 할 일이 생긴 사람에게만** 보낸다.
     점수를 넣음  → 상대 팀에게 "확인해 주세요"
     아니라고 함  → 넣은 사람에게 "다시 넣어 주세요"
     확정         → 보내지 않는다. 할 일이 없는 알림은 알림을 끄게 만든다. */

/** 이번 변경으로 누구에게 무엇을 알릴지. 알릴 게 없으면 null */
export function scorePushPlan(before, after) {
  const op = after?.scoreOp;
  if (!op || !op.match) return null;
  if (JSON.stringify(before?.scoreOp || null) === JSON.stringify(op)) return null;
  const m = (after.matches || []).find((x) => x && x.id === op.match);
  if (!m) return null;

  if (op.kind === 'report') {
    const rep = (after.scores || {})[op.match];
    if (!rep) return null;
    const team = rep.side === 'A' ? m.teamB : m.teamA;
    const to = (team || []).filter((id) => !isOfflineId(id));
    if (!to.length) return null;
    return { kind: 'report', to, match: m, a: rep.a, b: rep.b, by: rep.by };
  }
  if (op.kind === 'reject') {
    const prevRep = (before?.scores || {})[op.match];
    if (!prevRep || prevRep.by === op.by || isOfflineId(prevRep.by)) return null;
    return { kind: 'reject', to: [prevRep.by], match: m, by: op.by };
  }
  return null;
}

/**
 * 알림 문구.
 * ⚠️ 코트 번호 대신 **두 팀 이름**을 쓴다. 코트 이름은 코트장마다
 *    다르게 정할 수 있어서(A·B, 9·10) 서버가 모르는 경우가 있고,
 *    "3코트"보다 "김민수·이준호 6:3 박지연·최서윤"이 한눈에 알아본다.
 */
export function scorePushText(plan, nameOf) {
  if (!plan) return null;
  const nm = (id) => (nameOf ? nameOf(id) : '') || '';
  const A = (plan.match.teamA || []).map(nm).join('·');
  const B = (plan.match.teamB || []).map(nm).join('·');
  if (plan.kind === 'report') {
    return {
      title: '🎾 점수 확인 요청',
      body: `${nm(plan.by)}님이 ${plan.match.round}타임 점수를 넣었습니다. `
        + `${A} ${plan.a} : ${plan.b} ${B} — 맞는지 확인해 주세요.`,
    };
  }
  return {
    title: '점수를 다시 넣어 주세요',
    body: `${nm(plan.by)}님이 ${plan.match.round}타임 점수가 다르다고 했습니다. (${A} vs ${B})`,
  };
}

export default {
  SCORE_STATE, isOfflineId, sideOf, otherSide, reportOf, finalOf, scoreStateOf,
  mergeScores, validScore, canReport, canConfirm, canEditFinal, hasConfirmer,
  makeReport, makeFinal, awaitingMyConfirm, myUnreported, progressOf,
  lineupOf, sameLineup, staleScoreIds, scoreOp, isAdminOverride,
  scorePushPlan, scorePushText,
};
