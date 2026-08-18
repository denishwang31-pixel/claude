/* ============================================================
   일정 보기 — 200명 · 코트장 여러 곳 · 일정 100건을 견디게

   무엇이 느렸나
     일정 화면이 예정된 모임을 전부 그렸다. 운영진 화면에서는 모임마다
     회원 전원의 이름 칩까지 그렸다. 모임 100건 × 회원 200명이면
     칩 2만 개다. 스크롤이 걸리는 게 아니라 화면이 열리는 데서 걸린다.

     그래서 두 가지를 바꾼다.
       1. 이번 달만 먼저 보여주고 [더보기]로 3개월씩 늘린다
       2. 모임 하나를 펼쳤을 때만 명단을 그린다

   코트장 구분
     회원 200명이면 한 사람이 모든 코트에 나가지 않는다. 화요일 염곡에
     나오는 사람에게 목요일 수도공고 투표를 보내면 그건 스팸이다.
     그래서 "이 모임에 해당하는 사람"을 코트장으로 먼저 거른다.

     운영진은 모든 코트를 볼 수 있어야 한다(운영을 해야 하니까).
     다만 자기 참석 여부는 자기가 속한 코트에서만 누른다 — 안 그러면
     회장이 안 나가는 코트에 참석으로 잡힌다.
   ============================================================ */

const pad2 = (n) => String(n).padStart(2, '0');

export const monthKey = (date) => String(date || '').slice(0, 7);

export const monthLabel = (key) => {
  const [y, m] = String(key || '').split('-');
  if (!y || !m) return '';
  return `${y}년 ${Number(m)}월`;
};

/** 'YYYY-MM' 에 개월 수를 더한다 */
export function shiftMonth(key, delta) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return '';
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

export const MONTH_STEP = 3;      // [더보기] 한 번에 늘어나는 개월 수

/**
 * 지금 보여줄 범위.
 * months=1 이면 이번 달만. [더보기] 누를 때마다 3개월씩.
 */
export function windowEnd(fromMonth, months) {
  return shiftMonth(fromMonth, Math.max(1, months));
}

/**
 * 화면에 그릴 모임을 고른다.
 *
 * @param all       전체 모임
 * @param opts.today      'YYYY-MM-DD' — 지난 모임은 빼기 위해
 * @param opts.months     보여줄 개월 수(1 → 이번 달만)
 * @param opts.venueId    특정 코트장만 (없으면 scopeIds 전체)
 * @param opts.scopeIds   내가 볼 수 있는 코트장 id 들
 * @returns { items, hidden, total, hasMore }
 *          hidden 은 범위 밖이라 접힌 개수 — 몇 건이 더 있는지 알려야
 *          [더보기]를 누를지 판단할 수 있다.
 */
export function visibleMeetings(all, {
  today, months = 1, venueId = null, scopeIds = null,
} = {}) {
  const inScope = (all || []).filter((m) => {
    if (!m || !m.date) return false;
    if (m.date < today) return false;
    if (scopeIds && m.venueId && !scopeIds.includes(m.venueId)) return false;
    if (venueId && m.venueId !== venueId) return false;
    return true;
  });

  const from = monthKey(today);
  const end = windowEnd(from, months);
  const items = inScope
    .filter((m) => monthKey(m.date) < end)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

  return {
    items,
    total: inScope.length,
    hidden: inScope.length - items.length,
    hasMore: inScope.length > items.length,
  };
}

/** 월별로 묶는다 — 100건을 한 줄로 늘어놓으면 어디가 어딘지 모른다 */
export function groupByMonth(meetings) {
  const map = new Map();
  (meetings || []).forEach((m) => {
    const k = monthKey(m.date);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, items]) => ({ key, label: monthLabel(key), items }));
}

/* ---------- 코트장으로 사람 거르기 ---------- */

/** 이 회원이 그 코트장에 속하는가 */
export function belongsToVenue(member, venueId) {
  if (!venueId) return true;                       // 코트장 미지정 모임은 전체 대상
  const ids = member?.venueIds;
  if (!Array.isArray(ids) || ids.length === 0) return true;  // 아직 배정 안 된 사람은 제외하지 않는다
  return ids.includes(venueId);
}

/**
 * 이 모임에 해당하는 회원.
 *
 * 코트장이 지정된 모임이면 그 코트장 사람만. 미지정이면 전원.
 * 배정이 아직 안 된 사람(venueIds 없음)은 빼지 않는다 — 새로 들어온
 * 사람을 조용히 빼면 "나만 투표를 못 받았다"가 된다.
 */
export function membersForMeeting(members, meeting) {
  const active = (members || []).filter((m) => m && m.id && (!m.status || m.status === '활동'));
  if (!meeting?.venueId) return active;
  return active.filter((m) => belongsToVenue(m, meeting.venueId));
}

/**
 * 내가 이 모임에 참석 여부를 누를 수 있는가.
 *
 * 운영진은 모든 코트의 일정을 본다. 그렇다고 안 나가는 코트에
 * 자기 참석을 누르면 그 코트 대진에 잡힌다. 그래서 보는 것과
 * 누르는 것을 나눈다.
 */
export function canRsvpSelf(meVal, meeting) {
  if (!meVal || !meeting) return false;
  if (meeting.canceled) return false;
  return belongsToVenue(meVal, meeting.venueId);
}

/** 왜 못 누르는지 — 아무 설명 없이 버튼만 없으면 고장으로 보인다 */
export function rsvpBlockReason(meVal, meeting, venueName) {
  if (!meeting || meeting.canceled) return '';
  if (canRsvpSelf(meVal, meeting)) return '';
  return `${venueName || '이 코트장'} 소속이 아니어서 참석 체크는 하지 않습니다`;
}

/* ---------- 투표 현황 요약 ---------- */

/**
 * 모임 카드에 한 줄로 띄울 요약.
 * 명단을 다 그리지 않고도 상태를 알 수 있어야 카드가 가벼워진다.
 */
export function rsvpSummary(members, meeting) {
  const target = membersForMeeting(members, meeting);
  const rsvp = meeting?.rsvp || {};
  let yes = 0; let no = 0; let maybe = 0; let none = 0;
  target.forEach((m) => {
    const v = rsvp[m.id];
    if (v === 'yes') yes += 1;
    else if (v === 'no') no += 1;
    else if (v === 'maybe') maybe += 1;
    else none += 1;
  });
  const guests = (meeting?.guests || []).length;
  return {
    target: target.length, yes, no, maybe, none, guests,
    going: yes + guests,
    answered: target.length - none,
  };
}

export default {
  monthKey, monthLabel, shiftMonth, MONTH_STEP, windowEnd, visibleMeetings,
  groupByMonth, belongsToVenue, membersForMeeting, canRsvpSelf,
  rsvpBlockReason, rsvpSummary,
};
