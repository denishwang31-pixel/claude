/* ============================================================
   대회 되돌리기 — 앱 안 버튼(운영진) → 서버가 지난 시각 상태로 되돌린다

   2026-10-06 앱 주인: "백업을 되돌리려면 깃허브에서 돌리는 수밖에 없어? 앱 안에 버튼 만들어서 운영진은 쓸 수 있게".
   앱(휴대폰)은 지난 시각의 데이터를 직접 읽을 수 없다(서버 백업 = Firestore PITR 은 서버에서만 읽힌다).
   그래서 운영진이 clubs/{c}/restoreJobs 에 일감을 만들면 서버(functions onRestoreJobCreated)가 처리한다.
     · preview  그 시각에 대회가 어땠는지 숫자만(경기·결과·참가자) — 되돌리기 전에 확인
     · restore  그 시각 상태로 되돌린다. 덮어쓰기 전 지금 상태를 tournamentBackups 에 남긴다
     · undo     방금 되돌리기를 취소 — 마지막으로 남긴 상태로
   ⚠️ 최근 7일만(서버 백업 보관 기간). 1분 단위(1시간보다 오래된 시각은 분 단위로만 읽힌다).
   ⚠️ import 없이 혼자 선다 — functions/shared 로 복사돼 서버도 같은 판단을 쓴다.
   ============================================================ */

export const RESTORE_KEEP_DAYS = 7;
export const RESTORE_TYPES = ['preview', 'restore', 'undo'];
const STAFF = ['회장', '운영진 대표', '총무', '운영진', '리드', '책임리더'];

/**
 * 되돌릴 시각 확인 — 분 단위로 내린다.
 * @returns { ok:true, readMs } | { ok:false, error }
 */
export function restoreReadTime(atMs, nowMs = Date.now()) {
  const at = Number(atMs);
  if (!Number.isFinite(at) || at <= 0) return { ok: false, error: '되돌릴 시각이 잘못되었습니다.' };
  const readMs = Math.floor(at / 60000) * 60000;
  if (nowMs - readMs < 60 * 1000) return { ok: false, error: '1분 이상 지난 시각만 되돌릴 수 있습니다.' };
  if (nowMs - readMs > RESTORE_KEEP_DAYS * 24 * 3600 * 1000) {
    return { ok: false, error: `서버 백업은 최근 ${RESTORE_KEEP_DAYS}일만 보관합니다.` };
  }
  return { ok: true, readMs };
}

/** 대회 문서 → 숫자 요약(미리 보기·결과 알림) — 회원 이름은 담지 않는다 */
export function tournamentCounts(t) {
  if (!t) return { exists: false, games: 0, done: 0, players: 0 };
  const ms = [...(t.league?.matches || []), ...(t.team?.matches || []), ...(t.matches || [])].filter(Boolean);
  return { exists: true, games: ms.length, done: ms.filter((m) => m.score).length, players: (t.roster || []).length };
}

/** 운영진인가 — 회원 문서의 role/roles 또는 클럽을 만든 사람(규칙 isClubAdmin 과 같은 기준) */
export function isStaffDoc(member, club, uid) {
  if (club && uid && club.ownerId === uid) return true;
  if (!member) return false;
  const roles = [member.role, ...(Array.isArray(member.roles) ? member.roles : [])];
  return roles.some((r) => STAFF.includes(r));
}

/** 지운 대회 → 되살릴 시각(지운 그 분의 처음 — 그때는 아직 있었다) */
export const trashRestoreAt = (deletedAt) => Math.floor(Number(deletedAt) / 60000) * 60000;

/** 휴지통 목록 — 7일 안에 지운 것만, 최근 것부터 */
export function trashList(items, nowMs = Date.now()) {
  return (items || [])
    .filter((x) => x && x.id && Number(x.deletedAt) > 0 && nowMs - Number(x.deletedAt) <= RESTORE_KEEP_DAYS * 24 * 3600 * 1000)
    .sort((a, b) => b.deletedAt - a.deletedAt);
}

/** 앱의 시각 고르기 — [N분 전] 칩 */
export const RESTORE_AGO = [5, 15, 30, 60, 180];
export const agoLabel = (min) => (min >= 60 ? `${min / 60}시간 전` : `${min}분 전`);

/**
 * 직접 고른 시각 → ms. dayOffset 0 = 오늘, -1 = 어제(휴대폰 시각 기준), hhmm 'HH:MM'
 * @returns ms | null
 */
export function atFromClock(dayOffset, hhmm, nowMs = Date.now()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const d = new Date(nowMs);
  d.setDate(d.getDate() + (Number(dayOffset) || 0));
  d.setHours(h, mi, 0, 0);
  return d.getTime();
}

/** 숫자 요약 → 한 줄 */
export function countsText(c) {
  if (!c || !c.exists) return '대회 없음(개설 전)';
  return `경기 ${c.games} · 결과 ${c.done} · 참가자 ${c.players}명`;
}

/** 시각 → 'M/D HH:MM' (휴대폰 시각) */
export function clockText(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default {
  restoreReadTime, tournamentCounts, isStaffDoc, atFromClock, trashRestoreAt, trashList, countsText, clockText, agoLabel,
  RESTORE_KEEP_DAYS, RESTORE_TYPES, RESTORE_AGO,
};
