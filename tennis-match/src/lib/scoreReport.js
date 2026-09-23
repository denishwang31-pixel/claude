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

   ⚠️ 규칙이 못 잡는 것 — "이 사람이 정말 그 경기에 뛰었는가".
      그걸 보려면 규칙이 meetings 문서를 읽고 matches 배열을 뒤져야
      하는데 규칙에는 반복문이 없다. 그래서 **그 검사는 앱이 한다**
      (아래 canReport/canConfirm). 클럽 회원이 앱이 아닌 방법으로
      남의 경기를 확정하는 것까지는 막지 못한다 — 대신 운영진이
      언제든 고칠 수 있다. 이 한계를 알고 고른 선택이다.

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

export default {
  SCORE_STATE, isOfflineId, sideOf, otherSide, reportOf, finalOf, scoreStateOf,
  mergeScores, validScore, canReport, canConfirm, canEditFinal, hasConfirmer,
  makeReport, makeFinal, awaitingMyConfirm, myUnreported, progressOf,
};
