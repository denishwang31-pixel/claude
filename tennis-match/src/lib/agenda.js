/* ============================================================
   일정 한 곳으로 — 우리 모임 · 대회 · 게스트 모집

   왜 합치나
     지금은 세 군데에 흩어져 있다. 정기 모임은 [일정], 대회는
     [더보기]→[대회], 게스트 모집은 [더보기]→[게스트]. 그런데 회원이
     실제로 궁금한 것은 하나다 — "이번 주 토요일에 뭐가 있지?"

     흩어져 있으면 대회가 있는 줄도 모르고 지나간다. 대회는 등록 기간이
     짧아서 한 번 놓치면 끝이다. 보이지 않는 대회에는 아무도 신청하지
     않는다. 그래서 대회를 별도 메뉴가 아니라 일정 안에 둔다.

   여기 "대회"는 우리 클럽이 여는 대회다
     협회·스폰서가 여는 큰 대회는 이 목록에 들어오지 않는다. 성격도
     양도 달라서 섞으면 우리 일정이 묻힌다. 그쪽은 [대회 찾기] 화면이
     따로 맡는다 — src/lib/openTournament.js 머리말 참고.

   클럽 대회를 왜 별도 메뉴로 두지 않았나
     클럽 대회는 한 클럽 기준 1년에 서너 번이다. 그 서너 번을 위해 상시
     메뉴 한 칸을 쓰면, 1년의 대부분은 빈 화면을 열게 된다. 반대로
     일정 안에 두면 대회가 있는 주에만 저절로 눈에 띈다.
     대신 대회 카드는 다른 것과 달리 [현황]을 항상 달고 다닌다 —
     모집중인지, 몇 자리 남았는지, 오늘 경기 중인지.

   두 가지 보기
     목록   가까운 순서. 지금까지 쓰던 방식. 기본값.
     달력   한 달을 한눈에. "이번 달에 뭐가 몇 개 있나"를 볼 때.
     둘은 같은 데이터를 다르게 그릴 뿐이라 여기서 한 번만 만든다.
   ============================================================ */

/* ⚠️ 여기 'tournament' 는 **우리 클럽이 여는 대회**다 (clubs/{id}/tournaments).
      월례대회·청백전처럼 우리 회원끼리 하는 것이고, 대진도 명단도 우리가 갖는다.

      협회·지자체·스폰서가 여는 큰 대회(KTA, 시도협회, 던롭 X-OPEN 같은 것)는
      전혀 다른 물건이고 src/lib/openTournament.js 가 따로 다룬다.
      그쪽은 이 목록에 절대 들어오지 않는다 — 이유는 그 파일 머리말 참고.
      한 줄로: 전국 대회는 한 달에 수십 건이고 우리 일정은 여덟 번이다.
      섞으면 우리 일정이 묻히고 달력은 거의 모든 날에 점이 찍힌다. */
export const KIND = {
  MEETING: 'meeting',       // 우리 클럽 정기 모임
  TOURNAMENT: 'tournament', // 우리 클럽이 여는 대회
  GUEST: 'guest',           // 게스트 모집(공개 게시판)
};

export const KINDS = [
  { key: KIND.MEETING, label: '모임', icon: 'calendar', dot: '#2E7D32' },
  { key: KIND.TOURNAMENT, label: '클럽 대회', icon: 'tournament', dot: '#E65100' },
  { key: KIND.GUEST, label: '게스트', icon: 'members', dot: '#1565C0' },
];

const pad2 = (n) => String(n).padStart(2, '0');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export const dowName = (d) => {
  const dt = new Date(`${String(d || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? '' : WEEK[dt.getDay()];
};

/* ============================================================
   대회 현황

   "대회 일정이 보이고 현황이 보여야 등록 신청을 할 수 있다"가 출발점이다.
   그래서 상태는 이름표가 아니라 "지금 내가 무엇을 할 수 있는가"로 나눈다.
   ============================================================ */

export const T_STATE = {
  DRAFT: 'draft',       // 아직 안 열었다 (운영진만 보인다)
  OPEN: 'open',         // 신청 받는 중 — 신청 버튼이 나온다
  FULL: 'full',         // 정원 찼다 — 대기 신청만
  CLOSED: 'closed',     // 접수 마감 (날짜는 아직 안 옴)
  LIVE: 'live',         // 오늘 열린다 — 중계로 들어가는 자리
  DONE: 'done',         // 끝났다 — 결과 보기
};

export const T_STATE_LABEL = {
  [T_STATE.DRAFT]: '준비 중',
  [T_STATE.OPEN]: '모집 중',
  [T_STATE.FULL]: '정원 마감',
  [T_STATE.CLOSED]: '접수 마감',
  [T_STATE.LIVE]: '오늘 진행',
  [T_STATE.DONE]: '종료',
};

export const T_STATE_TONE = {
  [T_STATE.DRAFT]: 'default',
  [T_STATE.OPEN]: 'lime',
  [T_STATE.FULL]: 'soft',
  [T_STATE.CLOSED]: 'default',
  [T_STATE.LIVE]: 'red',
  [T_STATE.DONE]: 'default',
};

/** 신청자 수 — 지원자 맵(applicants)이 없으면 예전 방식(roster)을 센다 */
export function signupCount(t) {
  const ap = t?.applicants;
  if (ap && typeof ap === 'object') return Object.keys(ap).length;
  return Array.isArray(t?.roster) ? t.roster.length : 0;
}

/**
 * 대회 하나의 지금 상태.
 *
 * 판단 순서가 중요하다. 끝난 대회는 모집 조건을 따지지 않고, 오늘
 * 열리는 대회는 정원이 찼든 말든 '오늘 진행'이다.
 */
export function tournamentState(t, today) {
  if (!t) return T_STATE.DRAFT;
  if (t.status === 'finished') return T_STATE.DONE;

  const date = String(t.date || '');
  if (date && date < today) return T_STATE.DONE;      // 날짜가 지났는데 안 닫은 것
  if (date && date === today) return T_STATE.LIVE;

  const su = t.signup || {};
  if (!su.open) return T_STATE.DRAFT;

  const deadline = String(su.deadline || date || '');
  if (deadline && today > deadline) return T_STATE.CLOSED;

  const cap = Number(su.cap) || 0;
  if (cap > 0 && signupCount(t) >= cap) return T_STATE.FULL;
  return T_STATE.OPEN;
}

/** 카드에 한 줄로 띄울 현황. 숫자가 없으면 상태 이름만. */
export function tournamentStatusLine(t, today) {
  const state = tournamentState(t, today);
  const cap = Number(t?.signup?.cap) || 0;
  const n = signupCount(t);

  if (state === T_STATE.OPEN) {
    const left = cap > 0 ? Math.max(0, cap - n) : 0;
    return cap > 0
      ? `신청 ${n}/${cap}명 · ${left}자리 남음`
      : `신청 ${n}명 접수 중`;
  }
  if (state === T_STATE.FULL) return `신청 ${n}/${cap}명 · 정원 마감`;
  if (state === T_STATE.CLOSED) return `신청 ${n}명 · 접수 마감`;
  if (state === T_STATE.LIVE) return `참가 ${n}명 · 오늘 진행합니다`;
  if (state === T_STATE.DONE) return `참가 ${n}명 · 종료`;
  return '아직 모집을 시작하지 않았습니다';
}

/** 내가 지금 이 대회에 신청할 수 있는가 — 못 하면 이유를 말해 준다 */
export function canApply(t, uid, today) {
  if (!uid) return { ok: false, reason: '로그인이 필요합니다' };
  const ap = t?.applicants || {};
  if (ap[uid]) return { ok: false, reason: '이미 신청했습니다', applied: true };

  const state = tournamentState(t, today);
  if (state === T_STATE.OPEN) return { ok: true, reason: '' };
  if (state === T_STATE.FULL) return { ok: false, reason: '정원이 찼습니다' };
  if (state === T_STATE.CLOSED) return { ok: false, reason: '접수가 마감되었습니다' };
  if (state === T_STATE.DRAFT) return { ok: false, reason: '아직 모집 전입니다' };
  return { ok: false, reason: '이미 시작했거나 끝난 대회입니다' };
}

/* ============================================================
   세 가지를 같은 모양으로
   ============================================================ */

/* 게스트 모집의 확정 인원은 하위 컬렉션(applicants)에 있다. 일정 목록은
   모집글마다 구독을 걸 수 없어서 그 수를 모른다.

   ⚠️ 모르는 것을 0으로 두면 안 된다. 4명 모집에 3명이 찼는데도 "4자리
      남음"이라고 적히면 헛걸음을 시킨다. 그래서 세어 둔 값이 있을 때만
      남은 자리를 말하고, 없으면 모집 인원만 말한다. */
function guestSub(p) {
  const slots = Number(p?.slots) || 0;
  const known = Number.isFinite(Number(p?.confirmedCount));
  const region = p?.region ? ` · ${p.region}` : '';
  if (!known) return `${slots}명 모집${region}`;
  const left = Math.max(0, slots - Number(p.confirmedCount));
  return left > 0 ? `${left}자리 남음${region}` : `모집 완료${region}`;
}

/** 아직 자리가 남았는가 — 모르면 남은 것으로 본다(모집글이 살아 있으므로) */
const guestOpen = (p) => {
  const slots = Number(p?.slots) || 0;
  const done = Number(p?.confirmedCount);
  return Number.isFinite(done) ? done < slots : true;
};

/**
 * 화면이 그릴 수 있는 하나의 모양으로 바꾼다.
 *
 * 어느 것이든 { key, kind, date, time, title, sub, status, venueId } 를
 * 가진다. 카드가 종류마다 다른 필드를 뒤지지 않아도 되게.
 *
 * @param opts.today     'YYYY-MM-DD'
 * @param opts.me        내 uid — "내가 신청함" 표시
 * @param opts.clubId    우리 클럽 — 게스트 모집이 우리 것인지 구분
 * @param opts.venueName (id) => 이름
 * @param opts.isAdmin   준비 중인 대회는 운영진에게만 보인다
 */
export function buildAgenda({
  meetings = [], tournaments = [], guestPosts = [],
} = {}, {
  today, me = '', clubId = '', venueName = () => '', isAdmin = false,
} = {}) {
  const out = [];

  meetings.forEach((m) => {
    if (!m?.id || !m.date) return;
    const rsvp = m.rsvp || {};
    out.push({
      key: `m:${m.id}`,
      id: m.id,
      kind: KIND.MEETING,
      date: String(m.date).slice(0, 10),
      time: m.time || '',
      title: `${venueName(m.venueId) || m.place || '장소 미정'}`,
      sub: `코트 ${m.courts || 0}면 · ${m.rounds || 0}타임${m.recurring ? ' · 정기' : ''}`,
      venueId: m.venueId || null,
      canceled: !!m.canceled,
      status: m.canceled ? '취소' : '',
      mine: !!rsvp[me],
      myRsvp: rsvp[me] || '',
      raw: m,
    });
  });

  tournaments.forEach((t) => {
    if (!t?.id) return;
    const state = tournamentState(t, today);
    /* 준비 중인 대회는 회원에게 안 보인다 — 날짜도 정원도 안 정해진 것을
       띄우면 "신청은 언제 하냐"는 문의만 늘어난다 */
    if (state === T_STATE.DRAFT && !isAdmin) return;
    out.push({
      key: `t:${t.id}`,
      id: t.id,
      kind: KIND.TOURNAMENT,
      date: String(t.date || '').slice(0, 10),
      time: t.time || '',
      title: t.name || '클럽 대회',
      sub: tournamentStatusLine(t, today),
      venueId: t.venueId || null,
      canceled: false,
      state,
      status: T_STATE_LABEL[state],
      tone: T_STATE_TONE[state],
      mine: !!(t.applicants || {})[me],
      raw: t,
    });
  });

  guestPosts.forEach((p) => {
    if (!p?.id || !p.date) return;
    const open = guestOpen(p);
    out.push({
      key: `g:${p.id}`,
      id: p.id,
      kind: KIND.GUEST,
      date: String(p.date).slice(0, 10),
      time: p.time || '',
      title: p.clubName || p.title || '게스트 모집',
      sub: guestSub(p),
      venueId: null,
      canceled: false,
      ours: p.clubId === clubId,
      status: open ? '모집중' : '마감',
      mine: false,
      raw: p,
    });
  });

  return out.sort((a, b) =>
    (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
}

/**
 * 보기 조건으로 거른다.
 *
 * @param opts.kinds     보여줄 종류 — 비면 전부
 * @param opts.venueId   코트장. 대회·게스트는 코트장이 없으므로 살려 둔다.
 *                       (코트장을 골랐다고 대회가 사라지면 대회를 놓친다)
 * @param opts.scopeIds  내가 볼 수 있는 코트장들
 * @param opts.from/to   날짜 범위 (달력 보기가 쓴다)
 * @param opts.mineOnly  내가 관련된 것만
 */
export function filterAgenda(items, {
  kinds = null, venueId = null, scopeIds = null, from = null, to = null, mineOnly = false,
} = {}) {
  const set = kinds && kinds.length ? new Set(kinds) : null;
  return (items || []).filter((it) => {
    if (set && !set.has(it.kind)) return false;
    if (from && it.date < from) return false;
    if (to && it.date > to) return false;
    if (mineOnly && !it.mine) return false;
    if (it.kind === KIND.MEETING) {
      if (scopeIds && it.venueId && !scopeIds.includes(it.venueId)) return false;
      if (venueId && it.venueId !== venueId) return false;
    }
    return true;
  });
}

/** 종류별 개수 — 필터 칩에 숫자를 붙인다 */
export function countByKind(items) {
  const out = { [KIND.MEETING]: 0, [KIND.TOURNAMENT]: 0, [KIND.GUEST]: 0 };
  (items || []).forEach((it) => { if (out[it.kind] !== undefined) out[it.kind] += 1; });
  return out;
}

/* ============================================================
   달력

   라이브러리를 쓰지 않는 이유
     달력 라이브러리는 대부분 "날짜 하나를 고르는" 용도라 하루에 여러
     일정을 점으로 찍는 것이 어색하다. 게다가 네이티브 모듈이 딸려 오면
     OTA(eas update)로 못 고치고 다시 빌드해야 한다. 격자 만드는 것은
     날짜 계산 몇 줄이라 직접 만든다.
   ============================================================ */

/** 'YYYY-MM' → 그 달 1일의 요일(0=일)과 일수 */
export function monthMeta(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return { year: 0, month: 0, firstDow: 0, days: 0 };
  return {
    year: y,
    month: m,
    firstDow: new Date(y, m - 1, 1).getDay(),
    days: new Date(y, m, 0).getDate(),
  };
}

export function shiftMonth(monthKey, delta) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return '';
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

export const monthLabel = (key) => {
  const [y, m] = String(key || '').split('-');
  return y && m ? `${y}년 ${Number(m)}월` : '';
};

/**
 * 한 달을 6줄 × 7칸 격자로.
 *
 * 앞뒤 빈칸을 null 이 아니라 { date:'', blank:true } 로 채운다 —
 * 화면에서 null 을 걸러내다 보면 칸이 밀려 요일이 어긋난다. 실제로 그랬다.
 *
 * @returns [{ date, day, dow, blank, today, items:[], kinds:[] }][]  (주 단위 배열)
 */
export function calendarGrid(monthKey, items, today) {
  const { year, month, firstDow, days } = monthMeta(monthKey);
  if (!days) return [];

  const byDate = new Map();
  (items || []).forEach((it) => {
    if (!it?.date) return;
    if (!byDate.has(it.date)) byDate.set(it.date, []);
    byDate.get(it.date).push(it);
  });

  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push({ date: '', blank: true, items: [], kinds: [] });
  for (let d = 1; d <= days; d += 1) {
    const date = `${year}-${pad2(month)}-${pad2(d)}`;
    const list = byDate.get(date) || [];
    cells.push({
      date,
      day: d,
      dow: (firstDow + d - 1) % 7,
      blank: false,
      today: date === today,
      past: date < today,
      items: list,
      /* 점은 종류당 하나만 — 모임 5건이면 점 5개가 아니라 초록 점 하나 */
      kinds: KINDS.map((k) => k.key).filter((k) => list.some((it) => it.kind === k)),
    });
  }
  while (cells.length % 7) cells.push({ date: '', blank: true, items: [], kinds: [] });

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 날짜 머리글 — '9/13(토)' */
export function dateHead(date) {
  const s = String(date || '');
  if (s.length < 10) return s;
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}(${dowName(s)})`;
}

/** D-day. 오늘이면 '오늘', 지났으면 빈 문자열 */
export function ddayOf(date, today) {
  if (!date || !today) return '';
  const diff = Math.round(
    (new Date(`${date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000,
  );
  if (Number.isNaN(diff) || diff < 0) return '';
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  return `D-${diff}`;
}

export default {
  KIND, KINDS, dowName,
  T_STATE, T_STATE_LABEL, T_STATE_TONE,
  signupCount, tournamentState, tournamentStatusLine, canApply,
  buildAgenda, filterAgenda, countByKind,
  monthMeta, shiftMonth, monthLabel, calendarGrid, dateHead, ddayOf,
};
