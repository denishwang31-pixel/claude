/* ============================================================
   참석 투표 요청 — 서버 쪽 사본 (CommonJS)

   왜 사본인가
     firebase deploy 는 functions/ 폴더만 올린다. ../src/lib 는 배포
     묶음에 들어가지 않으므로 서버에서 require 할 수 없다.

   그래서 이 파일은 src/lib/rsvpAsk.js 와 "같은 답을 내야 한다".
   말로만 같아야 한다고 적어 두면 반드시 어긋난다 — 회비 독촉에서
   이미 겪었다. 그래서 scripts/test-rsvp.mjs 가 두 파일을 모두
   불러와 같은 입력에 같은 답을 내는지 매번 대조한다.
   한쪽만 고치면 테스트가 깨진다.
   ============================================================ */

/* ---------- 자동 발송 일정 (2026-09-25 여러 번 + 마감으로 바꿈) ----------
   예전: 모임 N일 전 한 번.
   지금: 여러 번(기본 2번 — 6일 전·5일 전 정오) 보내고, 알림에 **마감**(기본 4일 전
   정오)을 적는다. 두 번째부터는 그때까지 답하지 않은 사람에게만 간다.
   마감은 안내다 — 지나도 참석 버튼은 막지 않는다(급한 변경은 운영진이 받는다).
   ⚠️ 예전 모양({daysBefore, time})으로 저장된 클럽은 새 기본값으로 읽는다.
      예전 값은 거의 다 옛 기본값(3일 전 09:00)이었고, 앱 주인이 기본을 바꿨다. */
const DEFAULT_RSVP_ASK = {
  enabled: true,
  sends: [{ daysBefore: 6, time: '12:00' }, { daysBefore: 5, time: '12:00' }],
  deadline: { daysBefore: 4, time: '12:00' },
};

/** 화면에서 고르는 날짜 — 며칠 전 */
const RSVP_DAYS_BEFORE = [1, 2, 3, 4, 5, 6, 7, 10, 14];
const RSVP_MAX_SENDS = 4;

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
function normalizeAsk(cfg) {
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
function shiftYmd(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/* 보낸 기록 열쇠 — Firestore 필드 이름으로 쓰므로 영숫자·밑줄만 */
const sendKey = (ymd, time) => `d${String(ymd).replace(/-/g, '_')}_${String(time).replace(':', '')}`;

/** 이 모임의 자동 발송 일정 [{ymd, time, key}] — 앞선 것부터 */
function askSchedule(meeting, cfg) {
  if (!meeting || !meeting.date) return [];
  return normalizeAsk(cfg).sends
    .map((s) => { const ymd = shiftYmd(meeting.date, -s.daysBefore); return { ymd, time: s.time, key: sendKey(ymd, s.time) }; })
    .filter((s) => s.ymd);
}

/** 첫 자동 발송일 (예전 화면 호환) */
const askDateFor = (meeting, cfg) => {
  const s = askSchedule(meeting, cfg);
  return s.length ? s[0].ymd : '';
};

/** 이 모임의 투표 마감 {ymd, time} — 없으면 null */
function deadlineFor(meeting, cfg) {
  const c = normalizeAsk(cfg);
  if (!meeting || !meeting.date || !c.deadline) return null;
  const ymd = shiftYmd(meeting.date, -c.deadline.daysBefore);
  return ymd ? { ymd, time: c.deadline.time } : null;
}

/** 마감이 지났는가 */
function deadlinePassed(meeting, cfg, nowYmd, nowHHMM) {
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
function dueAskKey(meeting, cfg, nowYmd, nowHHMM) {
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
const isAskDue = (meeting, cfg, nowYmd, nowHHMM) => !!dueAskKey(meeting, cfg, nowYmd, nowHHMM);

/** 서버가 오늘 찾아볼 모임 날짜들 — 발송일이 오늘인 모임만 꺼내면 된다 */
function askTargetDates(cfg, nowYmd) {
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
function pendingVoters(members, meeting) {
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
function askProgress(members, meeting) {
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
function shortWhen(ymd, time) {
  if (!ymd) return '';
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}(${dow(ymd)})${time ? ` ${time}` : ''}`;
}

/** 회원에게 가는 투표 요청 문구 — cfg 를 주면 마감을 덧붙인다 */
function askMessage(clubName, meeting, cfg) {
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
function askSummary(cfg) {
  const c = normalizeAsk(cfg);
  if (!c.enabled || !c.sends.length) return '자동 발송 꺼짐';
  const w = (x) => (x.daysBefore === 0 ? `당일 ${x.time}` : `${x.daysBefore}일 전 ${x.time}`);
  return `${c.sends.map(w).join(' · ')}에 보내고`
    + (c.deadline ? `, 마감은 ${w(c.deadline)}` : ', 마감 안내 없음');
}

const RSVP_WORD = { yes: '참석', maybe: '미정', no: '불참' };

function changeMessage(clubName, memberName, from, to, meeting) {
  const d = (meeting && meeting.date) || '';
  const when = d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '';
  const drawn = ((meeting && meeting.matches) || []).length > 0;
  return {
    title: `${clubName || '클럽'} 참석 변경`,
    body: `${memberName || '회원'} 님이 ${when} 모임을 `
      + `${RSVP_WORD[from] || '미응답'} → ${RSVP_WORD[to] || '?'}(으)로 바꿨습니다.`
      + (drawn ? ' 대진이 이미 편성되어 있습니다.' : ''),
  };
}

function changedAnswers(before, after) {
  const b = (before && before.rsvp) || {};
  const a = (after && after.rsvp) || {};
  const by = (after && after.rsvpBy) || {};
  const out = [];
  Object.keys(a).forEach((id) => {
    const from = b[id];
    const to = a[id];
    if (from === undefined || from === null || from === '') return;
    if (from === to) return;
    if (by[id] && by[id] !== id) return;
    out.push({ id, from, to });
  });
  return out;
}

/* ⚠️ 운영진에게 알릴 만한 변경만. 앱(src/lib/rsvpAsk.js)과 같은 판단이어야
   한다 — 검사가 두 파일을 대조한다. 왜 이 조건인지는 그쪽 머리말 참고
   (요지: 알림이 많으면 사람이 알림을 꺼 버리고, 그러면 정말 중요한
   알림도 같이 죽는다). */
function pushWorthyChanges(before, after) {
  const drawn = ((after && after.matches) || []).length > 0;
  if (!drawn) return [];
  return changedAnswers(before, after)
    .filter((c) => c.from === 'yes' && c.to !== 'yes');
}

function changeDigest(clubName, names, meeting) {
  const list = (names || []).filter(Boolean);
  const d = (meeting && meeting.date) || '';
  const when = d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '';
  const who = list.length <= 2
    ? list.join(', ')
    : `${list.slice(0, 2).join(', ')} 외 ${list.length - 2}명`;
  return {
    title: `${clubName || '클럽'} 대진 확인 필요`,
    body: `${who} 님이 ${when} 모임 참석을 취소했습니다. 대진이 이미 편성되어 있습니다.`,
  };
}

module.exports = {
  DEFAULT_RSVP_ASK, RSVP_DAYS_BEFORE, RSVP_MAX_SENDS, normalizeAsk, shiftYmd, askSchedule, askDateFor,
  deadlineFor, deadlinePassed, dueAskKey, isAskDue, askTargetDates, pendingVoters, askProgress,
  shortWhen, askMessage, askSummary, changeMessage, changedAnswers, pushWorthyChanges, changeDigest,
};
