/* ============================================================
   코치 — 프로필 · 지역 검색 · 영상 승인 · 월 지급

   무엇을 위한 것인가
     코치가 본인 영상을 올려 홍보하고, 앱은 그 영상을 모든 회원에게
     보여 주는 대신 코치에게 월 3~5만원을 지급한다. 즉 영상은 콘텐츠가
     아니라 "광고"다. 그래서 아무나 올리는 대로 나가면 안 되고 앱 주인의
     승인을 거친다.

   왜 승인이 필요한가 — 지급이 걸려 있기 때문
     승인이 곧 "이번 달 이 코치에게 돈을 준다"는 결정이다. 승인한 사람과
     시각을 남기지 않으면 나중에 누가 왜 통과시켰는지 알 수 없고, 지급
     내역과 대조가 안 된다. 그래서 상태 전이를 이 파일 한 곳에서만
     만든다 — 화면이 status 를 직접 손대지 않는다.

   예약·결제·코치 관리는 여기 없다
     사용자가 "추후 개발"로 못박은 부분이다. 지금은 프로필과 영상,
     그리고 "어느 코트에서 몇 시에 레슨하는가"까지만 다룬다.
     나중에 예약을 붙일 때 lessonSlots 가 그대로 예약 가능 시간이 된다.
   ============================================================ */

import { parseRegion, regionText } from './regions.js';

/* ---------- 상태 ---------- */

/** 코치 프로필 상태. 회원에게 보이는 것은 approved 뿐이다. */
export const COACH_STATUS = {
  DRAFT: 'draft',        // 작성 중 — 본인만 보인다
  PENDING: 'pending',    // 승인 대기 — 앱 주인 검토 중
  APPROVED: 'approved',  // 공개
  REJECTED: 'rejected',  // 반려 — 고쳐서 다시 낼 수 있다
};

/** 영상 상태. 코치 프로필과 따로 심사한다 —
    프로필은 통과했는데 영상 하나가 부적절할 수 있기 때문. */
export const VIDEO_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const COACH_STATUS_LABEL = {
  [COACH_STATUS.DRAFT]: '작성 중',
  [COACH_STATUS.PENDING]: '승인 대기',
  [COACH_STATUS.APPROVED]: '공개 중',
  [COACH_STATUS.REJECTED]: '반려됨',
};

export const VIDEO_STATUS_LABEL = {
  [VIDEO_STATUS.PENDING]: '승인 대기',
  [VIDEO_STATUS.APPROVED]: '공개 중',
  [VIDEO_STATUS.REJECTED]: '반려됨',
};

/** 화면에서 상태 색을 고를 때 */
export const statusTone = (s) => (
  s === COACH_STATUS.APPROVED ? 'green'
    : s === COACH_STATUS.PENDING ? 'warn'
      : s === COACH_STATUS.REJECTED ? 'red' : 'default');

/* ---------- 레슨 시간 ---------- */

export const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const dayRank = (d) => {
  const i = DAYS.indexOf(String(d || '').trim());
  return i === -1 ? 99 : i;
};

/** "화 06:00~08:00 (성인 그룹)" 한 줄로 */
export function lessonSlotText(slot) {
  if (!slot) return '';
  const t = [slot.from, slot.to].filter(Boolean).join('~');
  return [slot.day, t, slot.note ? `(${slot.note})` : ''].filter(Boolean).join(' ');
}

/** 요일 → 시작시각 순. 요일이 이상하면 맨 뒤로 보낸다(버리지 않는다) */
export const sortLessonSlots = (slots) =>
  [...(slots || [])].sort((a, b) =>
    dayRank(a?.day) - dayRank(b?.day)
    || String(a?.from || '').localeCompare(String(b?.from || '')));

/** 시간이 말이 되는가 — 끝이 시작보다 빠르면 안 된다 */
export const lessonSlotOk = (slot) =>
  !!slot?.day && !!slot?.from && !!slot?.to && String(slot.from) < String(slot.to);

/* ---------- 프로필 ---------- */

const clean = (s) => String(s ?? '').trim();
const cleanList = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

/**
 * 저장 전 정규화.
 *
 * 지역을 왜 여기서 다시 만드나
 *   검색이 regionText 하나로 걸러진다. 화면이 sido/gungu 를 바꿔 놓고
 *   regionText 를 안 고치면 "강남구 코치"가 검색에서 사라진다. 저장
 *   직전에 한 번 다시 만들어서 둘이 어긋날 수 없게 한다.
 */
export function normalizeCoach(raw = {}) {
  const { sido, gungu } = raw.sido || raw.gungu
    ? { sido: clean(raw.sido), gungu: clean(raw.gungu) }
    : parseRegion(raw.regionText);
  const slots = sortLessonSlots(
    (raw.lessonSlots || []).filter(lessonSlotOk).map((s) => ({
      day: clean(s.day), from: clean(s.from), to: clean(s.to), note: clean(s.note),
    })),
  );
  return {
    name: clean(raw.name),
    phone: clean(raw.phone),
    sido,
    gungu,
    regionText: regionText(sido, gungu),
    career: clean(raw.career),          // 경력 — 자유 서술
    certs: cleanList(raw.certs),        // 자격증·수상
    intro: clean(raw.intro),            // 한 줄 소개
    photo: clean(raw.photo),
    courts: cleanList(raw.courts),      // 레슨하는 코트 키
    lessonSlots: slots,
    feeNote: clean(raw.feeNote),        // 레슨비 안내(자유 입력)
  };
}

/**
 * 승인 신청을 낼 수 있는 상태인가.
 * 이름·지역·경력이 비어 있으면 심사할 것이 없다. 코트나 레슨시간은
 * 없어도 낼 수 있게 둔다 — 출강 코치는 코트가 유동적이다.
 */
export function coachProfileReady(c) {
  const n = normalizeCoach(c);
  const missing = [];
  if (!n.name) missing.push('이름');
  if (!n.regionText) missing.push('활동지역');
  if (!n.career) missing.push('경력');
  return { ok: missing.length === 0, missing };
}

/* ---------- 상태 전이 ----------
   화면이 status 를 직접 쓰지 않게 하려고 "저장할 조각"만 돌려준다.
   승인/반려는 반드시 누가·언제를 함께 남긴다. */

/** 코치가 심사를 신청한다 */
export function submitPatch() {
  return { status: COACH_STATUS.PENDING, submittedAt: new Date().toISOString(), rejectReason: '' };
}

/** 앱 주인이 승인한다 */
export function approvePatch(reviewerUid) {
  return {
    status: COACH_STATUS.APPROVED,
    reviewedBy: reviewerUid || '',
    reviewedAt: new Date().toISOString(),
    rejectReason: '',
  };
}

/** 앱 주인이 반려한다 — 이유 없이는 반려하지 않는다 */
export function rejectPatch(reviewerUid, reason) {
  const r = clean(reason);
  if (!r) return null;               // 화면에서 버튼을 막는 근거로도 쓴다
  return {
    status: COACH_STATUS.REJECTED,
    reviewedBy: reviewerUid || '',
    reviewedAt: new Date().toISOString(),
    rejectReason: r,
  };
}

/** 회원에게 보여 줄 것만 — 승인된 코치, 그리고 내려두지 않은 것 */
export const publicCoaches = (list) =>
  (list || []).filter((c) => c.status === COACH_STATUS.APPROVED && c.active !== false);

/** 회원에게 보여 줄 영상 */
export const publicVideos = (list) =>
  (list || []).filter((v) => v.status === VIDEO_STATUS.APPROVED && v.active !== false);

/* ---------- 검색 ---------- */

const hit = (text, kw) => String(text || '').toLowerCase().includes(kw);

/**
 * 코치 검색 — 지역이 1순위다.
 *
 * 지역을 어떻게 좁히나
 *   시/도만 고르면 그 시/도 전부. 구까지 고르면 그 구만.
 *   코트 검색과 같은 방식이라 사용자가 두 화면을 다르게 배우지 않아도 된다.
 *
 * 코치가 여러 구에서 가르치는 경우
 *   프로필의 활동지역 하나로는 부족하다. 그래서 등록한 코트의 지역도
 *   함께 본다(courtRegions 로 넘긴다). 강남에 사는 코치가 송파 코트에서
 *   가르치면 송파 검색에도 나와야 한다.
 */
export function searchCoaches(list, q = {}) {
  const { sido, gungu, keyword, courtKey, courtRegions } = q;
  const kw = clean(keyword).toLowerCase();
  return publicCoaches(list).filter((c) => {
    if (courtKey && !(c.courts || []).includes(courtKey)) return false;

    if (sido) {
      const own = parseRegion(c.regionText);
      const viaCourt = (c.courts || [])
        .map((k) => (courtRegions || {})[k])
        .filter(Boolean)
        .map(parseRegion);
      const areas = [own, ...viaCourt].filter((a) => a.sido);
      const okArea = areas.some((a) =>
        a.sido === sido && (!gungu || a.gungu === gungu));
      if (!okArea) return false;
    }

    if (kw) {
      const inText = hit(c.name, kw) || hit(c.career, kw) || hit(c.intro, kw)
        || (c.certs || []).some((x) => hit(x, kw));
      if (!inText) return false;
    }
    return true;
  });
}

/** 검색 결과 정렬 — 영상을 올린 코치가 먼저, 그 다음 이름순.
    영상이 곧 이 화면의 콘텐츠라서 빈 프로필이 위에 오면 화면이 비어 보인다. */
export const sortCoaches = (list, videoCountOf = () => 0) =>
  [...(list || [])].sort((a, b) =>
    (videoCountOf(b.id) - videoCountOf(a.id))
    || String(a.name || '').localeCompare(String(b.name || '')));

/* ---------- 월 지급 ----------

   금액 규칙은 사용자가 정한 "월 3~5만원". 자동으로 5만원을 주지는
   않는다 — 앱 주인이 금액을 정하고, 범위를 벗어나면 화면이 막는다. */

export const PAYOUT_MIN = 30000;
export const PAYOUT_MAX = 50000;

/** '2026-08' */
export const payoutMonth = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** 한 코치의 한 달치는 한 건이다 — 문서 id 를 계산해서 중복 지급을 구조적으로 막는다 */
export const payoutId = (coachId, month) => `${coachId}_${month}`;

export const payoutAmountOk = (n) =>
  Number.isFinite(Number(n)) && Number(n) >= PAYOUT_MIN && Number(n) <= PAYOUT_MAX;

/**
 * 그 달에 지급 대상인 코치 — 승인된 영상이 그 달에 한 편이라도 있어야 한다.
 * "프로필만 올려 두고 영상은 안 올리는" 코치에게 돈이 나가지 않게 하는 장치.
 */
export function payoutCandidates(coaches, videos, month) {
  const approved = publicVideos(videos).filter((v) => String(v.createdAt || '').startsWith(month));
  const count = {};
  approved.forEach((v) => { count[v.coachId] = (count[v.coachId] || 0) + 1; });
  return publicCoaches(coaches)
    .filter((c) => count[c.id] > 0)
    .map((c) => ({ coachId: c.id, name: c.name, videoCount: count[c.id] }));
}

/** 이미 만들어 둔 지급 건과 대조 — 빠진 사람, 금액이 범위를 벗어난 건을 알려 준다 */
export function payoutDiff(candidates, payouts, month) {
  const byId = {};
  (payouts || []).filter((p) => p.month === month).forEach((p) => { byId[p.coachId] = p; });
  const missing = candidates.filter((c) => !byId[c.coachId]);
  const outOfRange = Object.values(byId).filter((p) => !payoutAmountOk(p.amount));
  const unpaid = Object.values(byId).filter((p) => p.status !== 'paid');
  const total = Object.values(byId).reduce((n, p) => n + (Number(p.amount) || 0), 0);
  return {
    missing, outOfRange, unpaid, total,
    inSync: missing.length === 0 && outOfRange.length === 0,
  };
}

/* ---------- 영상 ---------- */

/** 유튜브 URL → 영상 id. tips 화면과 같은 규칙을 쓴다. */
export function youtubeId(url = '') {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

export const videoThumb = (url) => {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
};

/** 올릴 수 있는 영상인가 — 유튜브 링크가 아니면 받지 않는다.
    직접 업로드는 저장 비용과 검수 부담이 커서 지금은 열지 않는다. */
export function videoReady(v) {
  const missing = [];
  if (!clean(v?.title)) missing.push('제목');
  if (!youtubeId(v?.url)) missing.push('유튜브 링크');
  return { ok: missing.length === 0, missing };
}
