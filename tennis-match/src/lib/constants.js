/* ============================================================
   FIX-08 — 매직 문자열 상수화.
   역할 문자열은 firestore.rules 와 반드시 동일하게 유지할 것.
   ============================================================ */
export const ROLES = {
  ADMIN: '총무',
  STAFF: '운영진',
  MEMBER: '회원',
};

/** 총무·운영진 여부 */
export const isAdminRole = (role) => role === ROLES.ADMIN || role === ROLES.STAFF;

/** 참석자/전적에서 게스트 ID 접두사 (뒤에 uid 가 붙음: 'g:<uid>') */
export const GUEST_PREFIX = 'g:';
export const isGuestId = (id) => typeof id === 'string' && id.startsWith(GUEST_PREFIX);
export const guestId = (uid) => GUEST_PREFIX + uid;
export const guestUid = (id) => (isGuestId(id) ? id.slice(GUEST_PREFIX.length) : id);

/** RSVP 값 */
export const RSVP = { YES: 'yes', MAYBE: 'maybe', NO: 'no' };

/** 게스트 신청 상태 */
export const GUEST_STATUS = { APPLIED: 'applied', CONFIRMED: 'confirmed' };
