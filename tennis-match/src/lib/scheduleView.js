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
export const SOON_DAYS = 14;      // 달이 바뀌어도 늘 보여 주는 앞으로의 날 수
export const MIN_FIRST = 4;       // 달과 상관없이 늘 보여 주는 가장 가까운 일정 수

/** 'YYYY-MM-DD' 에 일수를 더한다 (표준시 계산이라 시차를 타지 않는다) */
function shiftDay(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * 지금 보여줄 범위.
 * months=1 이면 이번 달(+ 앞으로 2주·가장 가까운 4건). [더보기] 누를 때마다 3개월씩.
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
  const sorted = [...inScope]
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  /* ⚠️ "이번 달만"으로 자르면 월말에 빈 화면이 된다 — 9/28 에 열었는데 다음 모임이
        10/4 라서 "예정된 일정이 없습니다"가 떴다(앱 주인). 그래서 달과 상관없이
        앞으로 2주 안의 일정과 가장 가까운 MIN_FIRST 건은 늘 보여 준다. */
  const soon = shiftDay(today, SOON_DAYS);
  const items = sorted.filter((m, i) => monthKey(m.date) < end || m.date <= soon || i < MIN_FIRST);

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

/**
 * 모임 카드를 어떻게 구분해 그릴지.
 *   'mine'  — 내가 나가는 코트장 모임(초록 띠 + 「내 코트」)
 *   'other' — 같은 클럽이지만 다른 코트장 모임(띠 없이 납작하게 + 「다른 코트장」)
 *   'plain' — 구분할 필요가 없다(코트장이 하나뿐 · 취소된 모임)
 * 전체 일정에서 두 종류가 똑같이 보여 헷갈린다는 제보(앱 주인)로 나눴다.
 * 흐리게 하지는 않는다 — 같은 클럽 일정이라 읽을 수는 있어야 한다.
 */
export function meetingTie(meVal, meeting, venueCount = 0) {
  if (!meeting || meeting.canceled || venueCount < 2) return 'plain';
  if (!meVal) return 'plain';                      // 내 정보를 아직 못 읽었으면 다 "다른 코트"로 보이면 안 된다
  if (!meeting.venueId) return 'plain';            // 코트장 미지정 = 전체 모임
  return canRsvpSelf(meVal, meeting) ? 'mine' : 'other';
}

/**
 * 코트장 목록을 내 코트 / 나머지로 나눈다(각각 원래 순서 유지).
 * 드롭다운에서 내 코트를 맨 위에 두려고 쓴다.
 */
export function splitMine(venues, mineIds) {
  const ids = new Set(Array.isArray(mineIds) ? mineIds : []);
  const list = (venues || []).filter(Boolean);
  return { mine: list.filter((v) => ids.has(v.id)), others: list.filter((v) => !ids.has(v.id)) };
}

/**
 * 일정 목록을 "내 코트 먼저, 다른 코트장은 접어서" 보여 주려고 나눈다.
 * 내 코트 쪽에는 코트장 미지정 모임·취소된 모임도 들어간다(meetingTie 가 'other' 가 아닌 것 전부).
 */
export function splitByTie(meetings, meVal, venueCount) {
  const mine = []; const other = [];
  (meetings || []).forEach((m) => (meetingTie(meVal, m, venueCount) === 'other' ? other : mine).push(m));
  return { mine, other };
}

/**
 * 날짜별로 묶는다 — 대진 화면 위 선택 줄.
 * 같은 날 06:00 · 08:00 모임이 칩 두 개로 따로 늘어서 있으면 어느 날인지부터
 * 헷갈린다(앱 주인). 날짜를 먼저 고르고, 그날 모임이 둘 이상이면 시간을 고른다.
 * @returns {{ date, items }[]} 날짜 오름차순, items 는 시간 오름차순
 */
export function groupByDate(meetings) {
  const map = new Map();
  (meetings || []).forEach((m) => {
    if (!m || !m.date) return;
    if (!map.has(m.date)) map.set(m.date, []);
    map.get(m.date).push(m);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    }));
}

/**
 * 코트장별로 묶는다 — 대진 화면의 "다른 코트장" 목록.
 * 코트장이 서너 곳이면 날짜 칩을 옆으로 넘기며 찾기 어렵고 어느 코트인지도
 * 안 보였다(앱 주인). 코트장 이름을 줄마다 세로로 세운다.
 * @returns {{ id, name, items }[]} 코트장 목록 순서, 각 items 는 날짜·시간순
 */
export function groupByVenue(meetings, venues) {
  const order = new Map((venues || []).map((v, i) => [v.id, i]));
  const map = new Map();
  (meetings || []).forEach((m) => {
    if (!m || !m.date || !m.venueId) return;
    if (!map.has(m.venueId)) map.set(m.venueId, []);
    map.get(m.venueId).push(m);
  });
  return [...map.entries()]
    .map(([id, items]) => ({
      id,
      name: (venues || []).find((v) => v.id === id)?.name || '코트장',
      items: items.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))),
    }))
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
}

/* ---------- 같은 모임이 두 번 ---------- */

/** 같은 모임인지 가르는 열쇠 — 날짜 · 시작 시간 · 코트장(없으면 장소 이름) */
export function meetingSlot(m) {
  if (!m || !m.date) return '';
  const where = m.venueId ? `v:${m.venueId}` : `p:${String(m.place || '').trim()}`;
  return `${m.date}|${m.time || ''}|${where}`;
}

/** 지우면 아까운 정도 — 대진·참석 기록이 많은 쪽을 남긴다 */
function keepScore(m) {
  const answered = Object.values(m.rsvp || {}).filter((v) => v === 'yes' || v === 'no').length;
  return (m.canceled ? -1e6 : 0) + (m.matches?.length || 0) * 1000 + answered * 10 + (m.guests?.length || 0);
}

/**
 * 같은 날 · 같은 시간 · 같은 코트장에 모임이 둘 이상이면 하나만 남기고 나머지를 고른다.
 * 정기 일정을 두 번 등록하면 생긴다(앱 주인 화면에서 10/11 06:00 이 두 장).
 * 지난 모임은 건드리지 않는다 — 대진·랭킹 기록이 걸려 있을 수 있다.
 * @returns {{ remove: string[], groups: number }}
 */
export function duplicateMeetings(meetings, { from = '' } = {}) {
  const bySlot = new Map();
  (meetings || []).forEach((m) => {
    if (!m || !m.id || !m.date || (from && m.date < from)) return;
    const k = meetingSlot(m);
    if (!bySlot.has(k)) bySlot.set(k, []);
    bySlot.get(k).push(m);
  });
  const remove = []; let groups = 0;
  bySlot.forEach((list) => {
    if (list.length < 2) return;
    groups += 1;
    const ranked = [...list].sort((a, b) => keepScore(b) - keepScore(a) || String(a.id).localeCompare(String(b.id)));
    ranked.slice(1).forEach((m) => remove.push(m.id));
  });
  return { remove, groups };
}

/** 새로 만들 날짜 중 같은 시간 · 같은 코트장 모임이 이미 있는 날짜 */
export function clashingDates(meetings, base, dates) {
  const taken = new Set((meetings || []).filter((m) => m && !m.canceled).map(meetingSlot));
  return (dates || []).filter((d) => taken.has(meetingSlot({ ...base, date: d })));
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
    else {
      /* ⚠️ '미정'은 이제 고를 수 없다. 예전에 저장된 값은 **미응답으로
         센다** — 미정은 오겠다는 말도 안 오겠다는 말도 아니라서,
         총무 입장에서는 아직 답을 못 받은 것과 같다.
         maybe 는 따로도 세어 둔다. none 안에 포함된 부분집합이고,
         "예전 미정이 몇 명 남았나"를 알아야 다시 물어볼 수 있다. */
      if (v === 'maybe') maybe += 1;
      none += 1;
    }
  });
  const guests = (meeting?.guests || []).length;
  return {
    /* none 은 미응답 전체(예전 '미정' 포함), maybe 는 그중 '미정'만.
       answered 는 참석·불참만 — 미정은 답으로 세지 않는다. */
    target: target.length, yes, no, maybe, none, guests,
    going: yes + guests,
    answered: target.length - none,
  };
}

/**
 * 명단을 참석 · 불참 · 미응답으로 나눈다 — 모임 카드의 [명단]이 쓴다.
 *
 * 예전에는 참석자만 칩으로 늘어놓고, 그 아래 운영진용 "대신 처리" 칩(전원)이
 * 바로 이어져서 어느 줄이 참석이고 어느 줄이 미응답인지 헷갈렸다(앱 주인).
 * 그래서 세 무리로 나눠 제목을 붙인다. 셈은 rsvpSummary 와 같다(대상 회원 기준,
 * 예전 '미정'은 미응답). 게스트는 참석 무리 끝에 붙는다.
 * @returns {{yes: {id,name}[], no: {id,name}[], none: {id,name}[], guests: {id,name}[]}}
 */
export function rsvpGroups(members, meeting) {
  const rsvp = meeting?.rsvp || {};
  const out = { yes: [], no: [], none: [], guests: [] };
  membersForMeeting(members, meeting).forEach((m) => {
    const row = { id: m.id, name: m.name || '이름 없음', gender: m.gender || '' };
    const v = rsvp[m.id];
    if (v === 'yes') out.yes.push(row);
    else if (v === 'no') out.no.push(row);
    else out.none.push(row);
  });
  (meeting?.guests || []).forEach((g) => {
    out.guests.push({ id: `g:${g.uid || g.name}`, name: g.name || '게스트', gender: g.gender || '', guest: true });
  });
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ko');
  out.yes.sort(byName); out.no.sort(byName); out.none.sort(byName);
  return out;
}

/**
 * 운영진이 이름을 누를 때 다음 상태 — 미응답 → 참석 → 불참 → 미응답.
 * 예전엔 참석 ↔ 불참만 오가서, 잘못 누르면 미응답으로 되돌릴 수 없었다(앱 주인).
 * 예전 '미정'은 미응답으로 보고 참석으로 넘어간다. null = 미응답(값 지우기).
 */
export function nextRsvp(v) {
  if (v === 'yes') return 'no';
  if (v === 'no') return null;
  return 'yes';
}

export default {
  nextRsvp,
  rsvpGroups,
  monthKey, monthLabel, shiftMonth, MONTH_STEP, windowEnd, visibleMeetings,
  groupByMonth, belongsToVenue, membersForMeeting, canRsvpSelf,
  rsvpBlockReason, rsvpSummary,
};
