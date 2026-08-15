/* ============================================================
   FIX-08 — 매직 문자열 상수화.
   역할 문자열은 firestore.rules 와 반드시 동일하게 유지할 것.
   ============================================================ */

/** 클럽 역할. 운영진(회장·총무·책임리더)은 인원 제한 없음.
 *  임명 권한은 회장에게만 있다. */
export const ROLES = {
  PRESIDENT: '회장',
  MANAGER: '총무',
  LEADER: '책임리더',
  MEMBER: '회원',
};

/** 운영진 = 회장·총무·책임리더 */
export const STAFF_ROLES = [ROLES.PRESIDENT, ROLES.MANAGER, ROLES.LEADER];

/** 임명 가능한 역할 목록(회장이 부여) */
export const ASSIGNABLE_ROLES = [ROLES.PRESIDENT, ROLES.MANAGER, ROLES.LEADER, ROLES.MEMBER];

/** 운영진 여부 */
export const isStaffRole = (role) => STAFF_ROLES.includes(role);

/** 하위호환: 기존 코드가 쓰던 이름 (총무/운영진 → 운영진 전체) */
export const isAdminRole = (role) => isStaffRole(role) || role === '운영진';

/** 역할 임명 권한 — 회장만 */
export const canAppointRole = (role) => role === ROLES.PRESIDENT;

/** 보기 모드 — 운영진이 다른 입장에서 화면을 확인할 때 사용 */
export const VIEW_MODES = [
  { key: null, label: '내 역할' },
  { key: 'staff', label: '운영진' },
  { key: 'lead', label: '리드' },
  { key: 'member', label: '회원' },
];

/** 역할 배지 색상 키 */
export const roleTone = (role) => (role === ROLES.PRESIDENT ? 'lime' : isStaffRole(role) ? 'green' : 'outline');

/** 참석자/전적에서 게스트 ID 접두사 (뒤에 uid 가 붙음: 'g:<uid>') */
export const GUEST_PREFIX = 'g:';
export const isGuestId = (id) => typeof id === 'string' && id.startsWith(GUEST_PREFIX);
export const guestId = (uid) => GUEST_PREFIX + uid;
export const guestUid = (id) => (isGuestId(id) ? id.slice(GUEST_PREFIX.length) : id);

/** RSVP 값 */
export const RSVP = { YES: 'yes', MAYBE: 'maybe', NO: 'no' };

/** 게스트 신청 상태 */
export const GUEST_STATUS = { APPLIED: 'applied', CONFIRMED: 'confirmed' };

/** 클럽 가입 신청 상태 — 운영진이 승인해야 회원이 된다 */
export const JOIN_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };
export const JOIN_STATUS_LABEL = {
  pending: '승인 대기', approved: '승인됨', rejected: '거절됨',
};

/** 경기 방식 — 모임 단위로 정한다 */
export const PLAY_MODE = { DOUBLES: 'doubles', SINGLES: 'singles' };
export const PLAY_MODES = [
  { key: PLAY_MODE.DOUBLES, label: '복식', hint: '한 코트 4명' },
  { key: PLAY_MODE.SINGLES, label: '단식', hint: '한 코트 2명' },
];

/** 대진 편성 방식 */
export const DRAW_MODE = { AUTO: 'auto', KDK: 'kdk' };
export const DRAW_MODES = [
  {
    key: DRAW_MODE.AUTO,
    label: '일반 편성',
    hint: '잡복 금지·커플·실력 매칭 등 클럽 규칙을 그대로 적용합니다.',
  },
  {
    key: DRAW_MODE.KDK,
    label: 'KDK (개인전)',
    hint: '4~8명 조로 나눠 파트너를 매 경기 바꿉니다. 전원 같은 경기 수를 뛰고 개인 승수로 순위를 냅니다.',
  },
];

/** 코트 표면 */
export const SURFACES = ['하드', '클레이', '인조잔디', '실내'];

/** 한 경기 종료 점수(게임 수) */
export const END_SCORES = [4, 6, 8, 9];

/** 실력 조(조 미사용 클럽을 위해 '선택 안함' 포함) */
export const GRADES = ['A', 'B', 'C', 'D'];
export const GRADE_NONE = '';   // 선택 안함

/** 회비 납부 주기 */
export const FEE_CYCLE = { MONTHLY: 'monthly', YEARLY: 'yearly' };

/** 용품 광고 카테고리 */
export const GEAR_CATEGORIES = ['라켓', '의류', '신발', '스트링·소모품', '가방', '기타'];

/** 원포인트 레슨 영역 */
export const TIP_CATEGORIES = ['포핸드', '백핸드', '발리', '서브', '스매시', '풋워크', '전술', '기타'];
