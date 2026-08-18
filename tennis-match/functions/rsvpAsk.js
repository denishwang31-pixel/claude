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

const DEFAULT_RSVP_ASK = { enabled: true, daysBefore: 3, time: '09:00' };
const RSVP_DAYS_BEFORE = [1, 2, 3, 5, 7];

function normalizeAsk(cfg) {
  const c = { ...DEFAULT_RSVP_ASK, ...(cfg || {}) };
  const d = Number(c.daysBefore);
  return {
    enabled: c.enabled !== false,
    daysBefore: Number.isFinite(d) ? Math.min(30, Math.max(0, Math.round(d))) : 3,
    time: /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(c.time || '')) ? c.time : '09:00',
  };
}

function shiftYmd(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const askDateFor = (meeting, cfg) =>
  (meeting && meeting.date ? shiftYmd(meeting.date, -normalizeAsk(cfg).daysBefore) : '');

function isAskDue(meeting, cfg, nowYmd, nowHHMM) {
  const c = normalizeAsk(cfg);
  if (!c.enabled) return false;
  if (!meeting || !meeting.date || meeting.canceled) return false;
  if (meeting.date < nowYmd) return false;
  const target = askDateFor(meeting, c);
  if (!target || target !== nowYmd) return false;
  if (String(nowHHMM) < c.time) return false;
  return !(meeting.rsvpAsk && meeting.rsvpAsk.auto === nowYmd);
}

function pendingVoters(members, meeting) {
  const rsvp = (meeting && meeting.rsvp) || {};
  return (members || []).filter((m) => {
    if (!m || !m.id) return false;
    if (m.status && m.status !== '활동') return false;
    return rsvp[m.id] === undefined || rsvp[m.id] === null || rsvp[m.id] === '';
  });
}

function askProgress(members, meeting) {
  const active = (members || []).filter((m) => m && m.id && (!m.status || m.status === '활동'));
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

function askMessage(clubName, meeting) {
  const d = (meeting && meeting.date) || '';
  const when = d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일(${dow(d)})` : '';
  const place = meeting && meeting.place ? ` ${meeting.place}` : '';
  return {
    title: `${clubName || '클럽'} 참석 여부를 알려주세요`,
    body: `${when}${meeting && meeting.time ? ` ${meeting.time}` : ''}${place} — 참석 / 미정 / 불참을 눌러 주세요.`,
  };
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

module.exports = {
  DEFAULT_RSVP_ASK, RSVP_DAYS_BEFORE, normalizeAsk, shiftYmd, askDateFor,
  isAskDue, pendingVoters, askProgress, askMessage, changeMessage, changedAnswers,
};
