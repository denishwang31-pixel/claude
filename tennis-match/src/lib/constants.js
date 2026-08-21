/* ============================================================
   FIX-08 — 매직 문자열 상수화.
   역할 문자열은 firestore.rules 와 반드시 동일하게 유지할 것.
   ============================================================ */

/* ============================================================
   역할 5단계 — 위로 갈수록 권한이 넓다.

     회장   클럽의 최종 책임자. 역할 임명은 회장만 할 수 있다.
     총무   회비·지출을 다룬다. 그 밖의 운영 권한은 운영진과 같다.
     운영진 일정·대진·회원 등 일상 운영. 회비는 볼 수 없다.
     리드   자기가 맡은 코트장의 일정·대진만 다룬다.
     회원   조회와 본인 참석 체크.

   ⚠️ 이 문자열은 firestore.rules 와 반드시 같아야 한다.
   ('책임리더'는 예전 이름 — 데이터에 남아 있을 수 있어 리드와 같게 취급한다)
   ============================================================ */
export const ROLES = {
  PRESIDENT: '회장',
  MANAGER: '총무',
  STAFF: '운영진',
  LEAD: '리드',
  MEMBER: '회원',
};

/** 예전 이름 → 현재 이름 */
export const LEGACY_ROLE = { 책임리더: ROLES.LEAD };
export const normalizeRole = (role) => LEGACY_ROLE[role] || role || ROLES.MEMBER;

/** 운영 권한을 가진 역할 (회원 제외 전부) */
export const STAFF_ROLES = [ROLES.PRESIDENT, ROLES.MANAGER, ROLES.STAFF, ROLES.LEAD];

/** 임명 가능한 역할 (회장이 부여) */
export const ASSIGNABLE_ROLES = [ROLES.PRESIDENT, ROLES.MANAGER, ROLES.STAFF, ROLES.LEAD, ROLES.MEMBER];

/** 역할 설명 — 회원 관리 화면에서 보여준다 */
export const ROLE_DESC = {
  [ROLES.PRESIDENT]: '모든 권한 + 역할 임명',
  [ROLES.MANAGER]: '운영 전반 + 회비·지출',
  [ROLES.STAFF]: '일정·대진·회원 운영 (회비 제외)',
  [ROLES.LEAD]: '내가 맡은 코트장만 운영',
  [ROLES.MEMBER]: '조회 · 본인 참석 체크',
};

/** 운영 권한 여부 */
export const isStaffRole = (role) => STAFF_ROLES.includes(normalizeRole(role));

/** 회비·지출을 볼 수 있는 역할 — 회장·총무만 */
export const canSeeFees = (role) => [ROLES.PRESIDENT, ROLES.MANAGER].includes(normalizeRole(role));

/** 모든 코트를 볼 수 있는 역할 — 리드는 자기 코트만 */
export const canSeeAllVenues = (role) =>
  [ROLES.PRESIDENT, ROLES.MANAGER, ROLES.STAFF].includes(normalizeRole(role));

/** 하위호환 */
export const isAdminRole = (role) => isStaffRole(role);

/** 역할 임명 권한 — 회장만 (회장·총무를 세울 수 있는 사람) */
export const canAppointRole = (role) => normalizeRole(role) === ROLES.PRESIDENT;

/* 운영진도 일상 역할은 정할 수 있어야 한다.

   회장 한 사람만 임명할 수 있으면 "리드 한 명 지정"에도 회장을 불러야 한다.
   그렇다고 아무나 회장·총무를 세우게 하면 권한이 위로 새어 나간다.
   그래서 위 두 자리(회장·총무)만 회장이 정하고, 나머지는 운영 담당이 정한다. */

/** 운영진 이하 역할 — 회장이 아니어도 정할 수 있다 */
export const DAILY_ROLES = [ROLES.STAFF, ROLES.LEAD, ROLES.MEMBER];

/** 회장만 정할 수 있는 자리 */
export const TOP_ROLES = [ROLES.PRESIDENT, ROLES.MANAGER];

/**
 * actor 가 target 인 사람을 nextRole 로 바꿀 수 있는가.
 * ⚠️ firestore.rules 의 같은 규칙과 반드시 일치해야 한다.
 */
export const canAssignRole = (actorRole, targetRole, nextRole) => {
  const actor = normalizeRole(actorRole);
  if (actor === ROLES.PRESIDENT) return true;              // 회장은 전부
  if (!isStaffRole(actor)) return false;                   // 일반 회원은 불가
  // 운영 담당 — 위 두 자리는 건드리지 못한다 (올리는 것도, 내리는 것도)
  return DAILY_ROLES.includes(nextRole)
    && DAILY_ROLES.includes(normalizeRole(targetRole));
};

/** 이 사람이 지금 고를 수 있는 역할 목록 */
export const assignableRolesFor = (actorRole, targetRole) =>
  ASSIGNABLE_ROLES.filter((r) => canAssignRole(actorRole, targetRole, r));

/** 보기 모드 — 회장이 각 역할의 화면을 그대로 확인할 때 사용 */
export const VIEW_MODES = [
  { key: null, label: '내 역할' },
  { key: 'president', label: '회장' },
  { key: 'manager', label: '총무' },
  { key: 'staff', label: '운영진' },
  { key: 'lead', label: '리드' },
  { key: 'member', label: '회원' },
];

/** 역할 서열 — 숫자가 작을수록 권한이 넓다 */
export const ROLE_RANK = {
  [ROLES.PRESIDENT]: 0, [ROLES.MANAGER]: 1, [ROLES.STAFF]: 2, [ROLES.LEAD]: 3, [ROLES.MEMBER]: 4,
};
export const roleRank = (role) => ROLE_RANK[normalizeRole(role)] ?? 4;

/* ============================================================
   역할 겸임 — 한 사람이 운영진이면서 리드일 수 있다

   실제 동호회에서는 겸임이 기본이다. 운영진이면서 화요일 코트를 맡고,
   총무가 리드를 겸하기도 한다. 역할을 하나만 고르게 하면 둘 중 하나를
   포기해야 하고, 그러면 "리드로 해 두면 회비를 못 보고, 총무로 해 두면
   내 코트 화면이 안 나온다"가 된다.

   저장 형태
     roles : ['운영진', '리드']   ← 실제 값
     role  : '운영진'             ← 그중 가장 넓은 권한 (대표 역할)

   role 을 계속 두는 이유는 보안 규칙과 옛 데이터 때문이다. 규칙은
   role 문자열 하나를 보고 판단하고, roles 가 없던 시절 문서도 아직 있다.
   그래서 쓸 때 둘을 같이 맞춰 둔다 — 읽는 쪽은 memberRoles 만 쓰면 된다.
   ============================================================ */

/** 이 회원의 역할 목록. roles 가 없으면 옛 문서이므로 role 하나로 본다 */
export function memberRoles(member) {
  const list = Array.isArray(member?.roles) ? member.roles : null;
  const cleaned = (list || [])
    .map(normalizeRole)
    .filter((r) => ASSIGNABLE_ROLES.includes(r));
  if (cleaned.length) return [...new Set(cleaned)];
  return [normalizeRole(member?.role)];
}

/** 대표 역할 — 가장 넓은 권한. 배지·목록 정렬에 쓴다 */
export const primaryRole = (member) =>
  memberRoles(member).sort((a, b) => roleRank(a) - roleRank(b))[0] || ROLES.MEMBER;

/** 이 역할을 갖고 있는가 (겸임 포함) */
export const hasRole = (member, role) =>
  memberRoles(member).includes(normalizeRole(role));

/** 저장할 값 — roles 와 대표 role 을 함께 맞춘다 */
export function rolesPayload(list) {
  const cleaned = [...new Set((list || [])
    .map(normalizeRole)
    .filter((r) => ASSIGNABLE_ROLES.includes(r)))];
  const roles = cleaned.length ? cleaned : [ROLES.MEMBER];
  /* '회원'은 "아무 역할 없음"이라 다른 역할과 같이 들 이유가 없다.
     운영진이면서 회원인 상태는 의미가 없고 화면만 어지럽힌다. */
  const withoutMember = roles.filter((r) => r !== ROLES.MEMBER);
  const final = withoutMember.length ? withoutMember : [ROLES.MEMBER];
  const sorted = final.sort((a, b) => roleRank(a) - roleRank(b));
  return { roles: sorted, role: sorted[0] };
}

/** 겸임까지 본 화면 표시 — '운영진 · 리드' */
export const rolesLabel = (member) => memberRoles(member).join(' · ');

/** 겸임 중 하나라도 운영 권한이 있으면 운영 담당이다 */
export const isStaffMember = (member) => memberRoles(member).some(isStaffRole);
export const canSeeFeesMember = (member) => memberRoles(member).some(canSeeFees);

/** 보기 모드 → 그 모드가 흉내내는 역할 */
export const VIEW_MODE_ROLE = {
  president: ROLES.PRESIDENT,
  manager: ROLES.MANAGER,
  staff: ROLES.STAFF,
  lead: ROLES.LEAD,
  member: ROLES.MEMBER,
};

/** 내 역할로 미리볼 수 있는 보기 모드 — 나보다 위 역할은 흉내낼 수 없다 */
export const viewModesFor = (role) => {
  const mine = roleRank(role);
  return VIEW_MODES.filter(({ key }) => !key || roleRank(VIEW_MODE_ROLE[key]) >= mine);
};

/** 역할 배지 색상 키 */
export const roleTone = (role) => {
  const r = normalizeRole(role);
  if (r === ROLES.PRESIDENT) return 'green';
  if (r === ROLES.MANAGER) return 'soft';
  return isStaffRole(r) ? 'outline' : 'default';
};

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

/* ============================================================
   경기 방식 — 대진표를 만들 때 정한다.

   모임 등록 때 못박지 않는 이유: 같은 모임 안에서도 "1~2타임 복식,
   3타임 단식"처럼 섞어 돌리는 경우가 흔하다. 그래서 대진 화면에서
   복식 / 단식 / 혼합 중 고르고, 혼합이면 타임별로 체크한다.
   ============================================================ */
export const PLAY_MODE = { DOUBLES: 'doubles', SINGLES: 'singles', MIXED: 'mixed' };
export const PLAY_MODES = [
  { key: PLAY_MODE.DOUBLES, label: '복식', hint: '모든 타임 복식 (코트당 4명)' },
  { key: PLAY_MODE.SINGLES, label: '단식', hint: '모든 타임 단식 (코트당 2명)' },
  { key: PLAY_MODE.MIXED, label: '혼합', hint: '타임마다 복식/단식을 직접 지정' },
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

/* ============================================================
   한 타임(게임) 길이

   자주 쓰는 20·30·40분은 버튼으로 바로 고르고, 그 밖의 값은
   [직접 지정]에서 5분 단위로 고른다. 클럽마다 코트 사용 시간과
   타임 수가 달라서 45분·50분·1시간 15분 같은 값도 실제로 쓰인다.
   ============================================================ */
export const ROUND_MINUTES_PRESETS = [20, 30, 40];
export const ROUND_MINUTES_MIN = 10;
export const ROUND_MINUTES_MAX = 120;
export const ROUND_MINUTES_STEP = 5;

/** 5분 단위 선택지 (10분 ~ 120분) */
export const ROUND_MINUTES_OPTIONS = Array.from(
  { length: (ROUND_MINUTES_MAX - ROUND_MINUTES_MIN) / ROUND_MINUTES_STEP + 1 },
  (_, i) => ROUND_MINUTES_MIN + i * ROUND_MINUTES_STEP,
);

/** 저장 전 보정 — 범위를 벗어나거나 5분 단위가 아니면 맞춰 준다 */
export const normalizeRoundMinutes = (v) => {
  /* null·undefined·빈 문자열은 "값이 없음"이다.
     Number(null) 은 0이라 그냥 넘기면 최솟값(10분)으로 눌려 버린다. */
  if (v === null || v === undefined || v === '') return 40;
  const n = Number(v);
  if (!Number.isFinite(n)) return 40;
  const clamped = Math.min(ROUND_MINUTES_MAX, Math.max(ROUND_MINUTES_MIN, n));
  return Math.round(clamped / ROUND_MINUTES_STEP) * ROUND_MINUTES_STEP;
};

/** "1시간 15분" 처럼 읽기 쉽게 */
export const roundMinutesLabel = (v) => {
  const n = normalizeRoundMinutes(v);
  if (n < 60) return `${n}분`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
};

/* ============================================================
   화면 이름 — 한 곳에서만 정한다.

   안내 문구에 "운영진이 [회원] 화면에서 …" 라고 적어 뒀는데 실제 메뉴는
   [회원 목록]이었다. 이런 어긋남은 사용자가 그 메뉴를 못 찾게 만든다.
   메뉴도 안내 문구도 여기 값을 쓰고, 테스트가 어긋남을 잡는다.
   ============================================================ */
export const SCREEN = {
  myfees: '내 회비',
  rank: '내 기록·랭킹',
  ntrp: 'NTRP 등급',
  tournament: '대회',
  clubmatch: '클럽 교류전',
  polls: '참가투표',
  board: '공지·자유글',
  chat: '클럽 채팅',
  members: '회원 목록',
  guest: '게스트 모집',
  courts: '코트 검색',
  coaches: '코치 찾기',
  coachreview: '코치 승인·광고비',
  appops: '앱 운영 관리',
  joinreq: '가입 신청',
  invite: '클럽 초대',
  attendance: '출석',
  fees: '회비·지출',
  reconcile: '입금 대사',
  dunning: '회비 알림',
  settlement: '결산·회계보고',
  handover: '총무 인수인계',
  venues: '코트장 관리',
  pairs: '커플·고정 페어',
  matchcfg: '대진 설정',
  settings: '클럽 설정',
  legal: '약관·개인정보',
  deleteaccount: '계정 삭제',
  more: '더보기',
  schedule: '일정',
  match: '대진표',
  home: '홈',
};

/** 안내 문구에 넣을 때 — "[회원 목록]" 형태로 */
export const screenRef = (key) => `[${SCREEN[key] || key}]`;

/** 코트 표면 */
export const SURFACES = ['하드', '클레이', '인조잔디', '실내'];

/** 한 경기 종료 점수(게임 수) */
export const END_SCORES = [4, 6, 8, 9];

/** 실력 조(조 미사용 클럽을 위해 '선택 안함' 포함) */
export const GRADES = ['A', 'B', 'C', 'D'];
export const GRADE_NONE = '';   // 선택 안함

/* ============================================================
   부수(급수) — 한국 동호회가 실제로 쓰는 실력 단위.
   대회 참가 자격이 대부분 "3부 이하", "오픈부" 처럼 부수로 걸려 있어서
   NTRP 보다 이쪽이 먼저 통한다. NTRP 는 참고 지표로 함께 보여준다.
   ============================================================ */
export const BUSU = [
  { key: '1부', label: '1부', desc: '선수 출신·상위 입상권', ntrp: [4.5, 7.0] },
  { key: '2부', label: '2부', desc: '전국 대회 입상권', ntrp: [4.0, 4.5] },
  { key: '3부', label: '3부', desc: '지역 대회 상위권', ntrp: [3.5, 4.0] },
  { key: '4부', label: '4부', desc: '동호회 중상위·게임 운영 가능', ntrp: [3.0, 3.5] },
  { key: '5부', label: '5부', desc: '동호회 입문~중급', ntrp: [2.0, 3.0] },
  { key: '오픈부', label: '오픈부', desc: '부수 구분 없이 참가', ntrp: [0, 7.0] },
];
export const BUSU_KEYS = BUSU.map((b) => b.key);
export const BUSU_NONE = '';

/** 부수 → 대략적인 NTRP 중앙값 (실력 매칭 보조용) */
export const busuToNtrp = (busu) => {
  const b = BUSU.find((x) => x.key === busu);
  if (!b || busu === '오픈부') return null;
  return (b.ntrp[0] + b.ntrp[1]) / 2;
};

/** 부수는 숫자가 작을수록 상위 — 정렬용 순위값 */
export const busuRank = (busu) => {
  const i = BUSU_KEYS.indexOf(busu);
  return i < 0 ? 99 : i;
};

/* ============================================================
   대회 형식
   ============================================================ */
export const TOURNAMENT_FORMAT = {
  GROUP_BRACKET: 'group_bracket',  // 예선 조별리그 → 본선 토너먼트 (기존)
  KDK: 'kdk',                      // 개인전 KDK
  TEAM_BLUE_WHITE: 'blue_white',   // 청백전 — 클럽을 두 팀으로 나눠 단체전
  TEAM_LEAGUE: 'team_league',      // 팀 리그 — 3팀 이상으로 나눠 돌려가며
  TEAM_CLUB: 'club_match',         // 클럽교류전 — 우리 클럽 vs 상대 클럽
};

export const TOURNAMENT_FORMATS = [
  {
    key: TOURNAMENT_FORMAT.GROUP_BRACKET,
    label: '조별리그 + 토너먼트',
    icon: '🏆',
    desc: '예선에서 조별로 돌린 뒤 상위 팀이 본선 토너먼트로 올라갑니다.',
  },
  {
    key: TOURNAMENT_FORMAT.KDK,
    label: 'KDK 개인전',
    icon: '🎯',
    desc: '4~8명 조에서 파트너를 바꿔가며 전원 같은 경기 수를 뜁니다. 개인 승수로 순위를 냅니다.',
  },
  {
    key: TOURNAMENT_FORMAT.TEAM_BLUE_WHITE,
    label: '청백전',
    icon: '🔵',
    desc: '클럽 회원을 청팀·백팀으로 나눠 단체전을 합니다. 이긴 경기 수를 합산해 팀 승부를 가립니다.',
  },
  {
    key: TOURNAMENT_FORMAT.TEAM_LEAGUE,
    label: '팀 리그 (3팀 이상)',
    icon: '🚩',
    desc: '인원을 3~8개 팀으로 나눠 팀끼리 돌려가며 붙습니다. 팀 점수를 합산해 순위를 냅니다. '
      + '인원이 많아 두 팀으로는 대기가 길어질 때 씁니다.',
  },
];

/* 클럽 교류전은 여기서 빠졌다.

   예전에는 대회의 한 형식이었고 상대 클럽 선수를 손으로 다 쳐 넣었다.
   지금은 [클럽 교류전] 화면에서 상대 클럽을 검색해 초대하고, 상대가
   자기 명단을 직접 넣는다 — 두 클럽이 같이 보는 문서라 대회(우리 클럽
   안의 기록)와는 구조가 다르다.

   두 길을 다 열어 두면 "어디로 만들어야 하지"가 되고, 옛 길로 만든
   교류전은 상대가 볼 수 없다. 그래서 새로 만드는 길은 하나로 둔다.
   TOURNAMENT_FORMAT.TEAM_CLUB 과 TEAM_SIDES 는 남긴다 — 예전에 만든
   교류전 기록이 아직 열려야 하기 때문이다. */

/** 단체전(청백전·교류전) 팀 이름 기본값 */
export const TEAM_SIDES = {
  [TOURNAMENT_FORMAT.TEAM_BLUE_WHITE]: [
    { key: 'A', name: '청팀', color: '#1d4ed8', bg: '#eff6ff' },
    { key: 'B', name: '백팀', color: '#334155', bg: '#f8fafc' },
  ],
  [TOURNAMENT_FORMAT.TEAM_CLUB]: [
    { key: 'A', name: '우리 클럽', color: '#0d7a5f', bg: '#e7f6f1' },
    { key: 'B', name: '상대 클럽', color: '#be123c', bg: '#fff1f2' },
  ],
};

/* ============================================================
   참가투표 — 일정 RSVP 와 별개로, 아무 주제나 물어보는 투표
   (회식 날짜, 유니폼 색, 대회 참가 의사 등)
   ============================================================ */
export const POLL_TYPE = {
  ATTEND: 'attend',   // 참가 여부 (참석/미정/불참)
  CHOICE: 'choice',   // 선택지 투표
};
export const POLL_ATTEND_OPTIONS = [
  { key: 'yes', label: '참가' },
  { key: 'maybe', label: '미정' },
  { key: 'no', label: '불참' },
];

/** 회비 납부 주기 */
export const FEE_CYCLE = { MONTHLY: 'monthly', YEARLY: 'yearly' };

/** 용품 광고 카테고리 */
export const GEAR_CATEGORIES = ['라켓', '의류', '신발', '스트링·소모품', '가방', '기타'];

/** 원포인트 레슨 영역 */
export const TIP_CATEGORIES = ['포핸드', '백핸드', '발리', '서브', '스매시', '풋워크', '전술', '기타'];
