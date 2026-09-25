/* ============================================================
   참석 투표 요청 — "이번 주 나오세요?"를 총무가 매번 묻지 않게 한다

   지금까지는 모임을 등록할 때 한 번 알림이 갔고, 그 뒤로는 총무가
   단톡방에서 "아직 답 안 주신 분?"을 손으로 세고 있었다.
   여기서 하는 일은 두 가지다.

     1. 정해진 날 정해진 시각에 자동으로 묻는다 (기본: 모임 6일 전·5일 전 정오, 마감 4일 전 정오)
     2. 총무가 필요하면 언제든 [투표 요청]을 눌러 다시 묻는다

   두 경우 모두 아직 답하지 않은 사람에게만 간다. 이미 참석이라고
   답한 사람에게 또 물으면 알림이 짜증나는 것이 되고, 그러면 사람들이
   알림 자체를 꺼 버린다 — 그 순간 이 기능은 죽는다.

   회원이 답을 바꾸면(참석 → 불참) 운영진에게 알린다. 대진을 다 짠
   뒤에 한 명이 빠지면 편성을 다시 해야 하는데, 그걸 당일 아침에
   알게 되는 것이 지금까지의 가장 큰 사고였다.

   이 파일은 순수 함수만 둔다. 앱(일정 화면)과 서버(Cloud Functions)가
   같은 판단을 해야 하기 때문이다 — 앱에서 "3명에게 보냅니다"라고
   했는데 서버가 5명에게 보내면 안 된다.
   ============================================================ */

/* ---------- 자동 발송 일정 (2026-09-25 여러 번 + 마감으로 바꿈) ----------
   예전: 모임 N일 전 한 번.
   지금: 여러 번(기본 2번 — 6일 전·5일 전 정오) 보내고, 알림에 **마감**(기본 4일 전
   정오)을 적는다. 두 번째부터는 그때까지 답하지 않은 사람에게만 간다.
   마감은 안내다 — 지나도 참석 버튼은 막지 않는다(급한 변경은 운영진이 받는다).
   ⚠️ 예전 모양({daysBefore, time})으로 저장된 클럽은 새 기본값으로 읽는다.
      예전 값은 거의 다 옛 기본값(3일 전 09:00)이었고, 앱 주인이 기본을 바꿨다. */
export const DEFAULT_RSVP_ASK = {
  enabled: true,
  sends: [{ daysBefore: 6, time: '12:00' }, { daysBefore: 5, time: '12:00' }],
  deadline: { daysBefore: 4, time: '12:00' },
};

/** 화면에서 고르는 날짜 — 며칠 전 */
export const RSVP_DAYS_BEFORE = [1, 2, 3, 4, 5, 6, 7, 10, 14];
export const RSVP_MAX_SENDS = 4;

const okTime = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
/* '9:05' → '09:05' — 문자열 비교로 시각을 견주므로 두 자리로 맞춘다 */
const hhmm = (t, fallback) => {
  if (!okTime(t)) return fallback;
  const [h, m] = String(t).split(':');
  return `${String(Number(h)).padStart(2, '0')}:${m}`;
};
const days = (d, fallback) => {
  const n = Number(d);
  return Number.isFinite(n) ? Math.min(30, Math.max(0, Math.round(n))) : fallback;
};

/** 설정값을 안전한 범위로 정리한다 (없거나 망가진 값은 기본값으로) */
export function normalizeAsk(cfg) {
  const src = cfg && typeof cfg === 'object' ? cfg : {};
  const enabled = src.enabled !== false;
  const raw = Array.isArray(src.sends) ? src.sends : DEFAULT_RSVP_ASK.sends;
  const seen = {};
  const sends = raw
    .map((x) => ({ daysBefore: days(x && x.daysBefore, -1), time: hhmm(x && x.time, '12:00') }))
    .filter((x) => x.daysBefore >= 0)
    .filter((x) => { const k = `${x.daysBefore} ${x.time}`; if (seen[k]) return false; seen[k] = true; return true; })
    .sort((a, b) => (b.daysBefore - a.daysBefore) || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
    .slice(0, RSVP_MAX_SENDS);
  const dl = src.deadline === null ? null : (src.deadline || DEFAULT_RSVP_ASK.deadline);
  let deadline = dl ? { daysBefore: days(dl.daysBefore, 4), time: hhmm(dl.time, '12:00') } : null;
  /* 마감이 마지막 발송보다 앞이면 "이미 지난 마감"을 알리게 된다 — 마지막 발송 시각으로 당긴다 */
  if (deadline && sends.length) {
    const last = sends[sends.length - 1];
    const before = deadline.daysBefore > last.daysBefore
      || (deadline.daysBefore === last.daysBefore && deadline.time < last.time);
    if (before) deadline = { daysBefore: last.daysBefore, time: last.time };
  }
  return { enabled, sends, deadline };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' 에 일수를 더한다. 표준시로만 계산해 서머타임·시차를 타지 않는다. */
export function shiftYmd(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/* 보낸 기록 열쇠 — Firestore 필드 이름으로 쓰므로 영숫자·밑줄만 */
const sendKey = (ymd, time) => `d${String(ymd).replace(/-/g, '_')}_${String(time).replace(':', '')}`;

/** 이 모임의 자동 발송 일정 [{ymd, time, key}] — 앞선 것부터 */
export function askSchedule(meeting, cfg) {
  if (!meeting || !meeting.date) return [];
  return normalizeAsk(cfg).sends
    .map((s) => { const ymd = shiftYmd(meeting.date, -s.daysBefore); return { ymd, time: s.time, key: sendKey(ymd, s.time) }; })
    .filter((s) => s.ymd);
}

/** 첫 자동 발송일 (예전 화면 호환) */
export const askDateFor = (meeting, cfg) => {
  const s = askSchedule(meeting, cfg);
  return s.length ? s[0].ymd : '';
};

/** 이 모임의 투표 마감 {ymd, time} — 없으면 null */
export function deadlineFor(meeting, cfg) {
  const c = normalizeAsk(cfg);
  if (!meeting || !meeting.date || !c.deadline) return null;
  const ymd = shiftYmd(meeting.date, -c.deadline.daysBefore);
  return ymd ? { ymd, time: c.deadline.time } : null;
}

/** 마감이 지났는가 */
export function deadlinePassed(meeting, cfg, nowYmd, nowHHMM) {
  const d = deadlineFor(meeting, cfg);
  if (!d) return false;
  return nowYmd > d.ymd || (nowYmd === d.ymd && hhmm(nowHHMM, '00:00') >= d.time);
}

/**
 * 지금 보내야 할 자동 발송의 열쇠. 없으면 ''.
 *
 * 예정 시각을 지나쳤으면 (같은 날 안에서는) 늦게라도 보낸다.
 * 서버가 30분마다 도는데 그 사이에 배포가 있거나 실행이 밀리면
 * 정각 한 번만 보는 방식으로는 그 발송이 통째로 사라진다.
 * 보낸 것은 meeting.rsvpAsk.autoSent[열쇠] 로 막는다.
 */
export function dueAskKey(meeting, cfg, nowYmd, nowHHMM) {
  const c = normalizeAsk(cfg);
  if (!c.enabled) return '';
  if (!meeting || !meeting.date || meeting.canceled) return '';
  if (meeting.date < nowYmd) return '';                  // 이미 지난 모임
  const now = hhmm(nowHHMM, '00:00');
  const sent = (meeting.rsvpAsk && meeting.rsvpAsk.autoSent) || {};
  const legacyDay = meeting.rsvpAsk && meeting.rsvpAsk.auto;   // 예전 방식이 오늘 보낸 기록
  const hit = askSchedule(meeting, c).find((s) => s.ymd === nowYmd && now >= s.time
    && !sent[s.key] && legacyDay !== nowYmd);
  return hit ? hit.key : '';
}

/** 지금 자동 발송해야 하는가 */
export const isAskDue = (meeting, cfg, nowYmd, nowHHMM) => !!dueAskKey(meeting, cfg, nowYmd, nowHHMM);

/** 서버가 오늘 찾아볼 모임 날짜들 — 발송일이 오늘인 모임만 꺼내면 된다 */
export function askTargetDates(cfg, nowYmd) {
  const c = normalizeAsk(cfg);
  if (!c.enabled) return [];
  const out = [];
  c.sends.forEach((s) => { const d = shiftYmd(nowYmd, s.daysBefore); if (d && !out.includes(d)) out.push(d); });
  return out;
}

/** 이 모임의 대상인가 — 코트장이 정해진 모임이면 그 코트장 사람만(배정 안 된 사람은 포함) */
function inMeeting(m, meeting) {
  const vid = meeting && meeting.venueId;
  if (!vid) return true;
  const ids = m && m.venueIds;
  if (!Array.isArray(ids) || ids.length === 0) return true;
  return ids.includes(vid);
}

/** 아직 답하지 않은 회원 — 자동·수동 모두 이 명단에만 보낸다 */
export function pendingVoters(members, meeting) {
  const rsvp = (meeting && meeting.rsvp) || {};
  return (members || []).filter((m) => {
    if (!m || !m.id) return false;
    if (m.status && m.status !== '활동') return false;    // 휴면·탈퇴는 제외
    if (!inMeeting(m, meeting)) return false;             // 다른 코트장 모임
    /* ⚠️ 예전 '미정'도 아직 답하지 않은 것으로 본다. 미정은 고를 수
       없게 됐고, 애초에 오겠다는 말도 안 오겠다는 말도 아니다. */
    const v = rsvp[m.id];
    return v === undefined || v === null || v === '' || v === 'maybe';
  });
}

/** 답한 사람 수 세기 — 화면의 "12명 중 8명 응답" 표기용 */
export function askProgress(members, meeting) {
  const active = (members || []).filter((m) => m && m.id && (!m.status || m.status === '활동') && inMeeting(m, meeting));
  const pending = pendingVoters(active, meeting);
  return {
    total: active.length,
    answered: active.length - pending.length,
    pending: pending.length,
  };
}

const dow = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
};

/** '9/23(수) 12:00' */
export function shortWhen(ymd, time) {
  if (!ymd) return '';
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}(${dow(ymd)})${time ? ` ${time}` : ''}`;
}

/** 회원에게 가는 투표 요청 문구 — cfg 를 주면 마감을 덧붙인다 */
export function askMessage(clubName, meeting, cfg) {
  const d = (meeting && meeting.date) || '';
  const when = d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일(${dow(d)})` : '';
  const place = meeting && meeting.place ? ` ${meeting.place}` : '';
  const dl = cfg ? deadlineFor(meeting, cfg) : null;
  return {
    title: `${clubName || '클럽'} 참석 여부를 알려주세요`,
    body: `${when}${meeting && meeting.time ? ` ${meeting.time}` : ''}${place} — 참석 / 불참을 눌러 주세요.`
      + (dl ? ` 마감 ${shortWhen(dl.ymd, dl.time)}까지` : ''),
  };
}

/** 설정 화면의 한 줄 요약 — '6일 전 12:00 · 5일 전 12:00에 보내고, 마감은 4일 전 12:00' */
export function askSummary(cfg) {
  const c = normalizeAsk(cfg);
  if (!c.enabled || !c.sends.length) return '자동 발송 꺼짐';
  const w = (x) => (x.daysBefore === 0 ? `당일 ${x.time}` : `${x.daysBefore}일 전 ${x.time}`);
  return `${c.sends.map(w).join(' · ')}에 보내고`
    + (c.deadline ? `, 마감은 ${w(c.deadline)}` : ', 마감 안내 없음');
}

const RSVP_WORD = { yes: '참석', maybe: '미정', no: '불참' };

/**
 * 회원이 답을 바꿨을 때 운영진에게 가는 문구.
 *
 * 대진을 이미 짠 뒤라면 그 사실을 같이 알린다 — 그래야 "다시 짜야
 * 하는 상황"인지 한 줄 읽고 판단할 수 있다.
 */
export function changeMessage(clubName, memberName, from, to, meeting) {
  const d = meeting?.date || '';
  const when = d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '';
  const drawn = (meeting?.matches || []).length > 0;
  return {
    title: `${clubName || '클럽'} 참석 변경`,
    body: `${memberName || '회원'} 님이 ${when} 모임을 `
      + `${RSVP_WORD[from] || '미응답'} → ${RSVP_WORD[to] || '?'}(으)로 바꿨습니다.`
      + (drawn ? ' 대진이 이미 편성되어 있습니다.' : ''),
  };
}

/**
 * 수정된 응답만 골라낸다.
 *
 * 처음 답하는 것은 알리지 않는다 — 그건 정상적인 흐름이고, 회원
 * 수만큼 알림이 쏟아지면 운영진이 알림을 꺼 버린다.
 * 운영진이 대신 눌러 준 것도 알리지 않는다(자기가 한 일이다).
 * 그래서 rsvpBy 에 "누가 눌렀는지"를 같이 남긴다.
 */
export function changedAnswers(before, after) {
  const b = before?.rsvp || {};
  const a = after?.rsvp || {};
  const by = after?.rsvpBy || {};
  const out = [];
  Object.keys(a).forEach((id) => {
    const from = b[id];
    const to = a[id];
    if (from === undefined || from === null || from === '') return;  // 첫 응답
    if (from === to) return;
    if (by[id] && by[id] !== id) return;                             // 운영진 대행
    out.push({ id, from, to });
  });
  return out;
}

/**
 * 운영진에게 **알릴 만한** 변경만 골라낸다.
 *
 * ⚠️ 예전에는 changedAnswers() 를 그대로 푸시로 보냈다. 회원이 참석을
 *    누를 때마다, 불참으로 바꿀 때마다, 다시 참석으로 돌릴 때마다
 *    회장 폰이 울렸다. 회원이 서른 명이면 모임 하나에 알림이 수십 개다.
 *    그러면 사람은 알림을 꺼 버리고, 그 순간 **정말 중요한 알림도 같이
 *    죽는다**. 알림을 줄이는 일은 편의가 아니라 기능을 지키는 일이다.
 *
 * 그래서 두 가지가 동시에 맞을 때만 알린다.
 *   1) 대진이 이미 편성되어 있다 — 아직 안 짰으면 지금 빠져도 문제가
 *      없다. 짜기 전에 바뀌는 건 정상적인 흐름이다.
 *   2) 참석에서 빠졌다 — 참석으로 들어오는 것은 자리가 느는 일이라
 *      급하지 않다. 급한 것은 짜 둔 대진에 구멍이 나는 쪽뿐이다.
 *
 * 이 조건이 바로 "대진을 다 짠 뒤 당일 아침에 한 명이 빠지는" 사고다.
 * 그것만 남기고 나머지는 보내지 않는다.
 */
export function pushWorthyChanges(before, after) {
  const drawn = (after?.matches || []).length > 0;
  if (!drawn) return [];
  return changedAnswers(before, after)
    .filter((c) => c.from === 'yes' && c.to !== 'yes');
}

/**
 * 여러 명이 한꺼번에 빠졌을 때 한 통으로 묶는다.
 *
 * ⚠️ 한 명당 한 통씩 보내면, 운영진이 명단을 손보는 순간 알림이
 *    우수수 쏟아진다. 그때 사람은 내용을 읽지 않고 전부 쓸어 버린다.
 */
export function changeDigest(clubName, names, meeting) {
  const list = (names || []).filter(Boolean);
  const d = meeting?.date || '';
  const when = d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '';
  const who = list.length <= 2
    ? list.join(', ')
    : `${list.slice(0, 2).join(', ')} 외 ${list.length - 2}명`;
  return {
    title: `${clubName || '클럽'} 대진 확인 필요`,
    body: `${who} 님이 ${when} 모임 참석을 취소했습니다. 대진이 이미 편성되어 있습니다.`,
  };
}

export default {
  DEFAULT_RSVP_ASK, RSVP_DAYS_BEFORE, RSVP_MAX_SENDS, normalizeAsk, shiftYmd, askSchedule, askDateFor,
  deadlineFor, deadlinePassed, dueAskKey, isAskDue, askTargetDates, pendingVoters, askProgress,
  shortWhen, askMessage, askSummary, changeMessage, changedAnswers, pushWorthyChanges, changeDigest,
};
