/* ============================================================
   카톡 참석 링크 — 앱이 없는 회원이 참석/불참을 누르는 곳 (서버 판단)

   왜 있나
     오프라인으로 등록한 회원은 앱이 없다. 지금까지는 총무가 단톡방에서
     답을 받아 앱에 손으로 옮겨 적었다. 이제 총무가 카톡으로 링크를
     보내면, 받은 사람이 링크에서 자기 이름을 고르고 참석/불참을 누른다.
     그 답이 앱의 명단에 바로 들어간다.

   왜 서버를 거치나
     앱이 없는 사람은 로그인이 없다. 보안 규칙은 "로그인한 클럽 회원"만
     믿을 수 있어서, 이들의 쓰기를 규칙으로는 허락할 방법이 없다.
     그래서 서버 함수가 링크의 열쇠(token)를 확인하고 대신 적는다.

   ⚠️ 링크로는 **오프라인 회원의 답만** 적는다.
      앱을 쓰는 회원 이름은 목록에 나오지도 않는다. 링크는 단톡방에
      돌기 때문에, 앱 회원까지 열어 두면 남이 그 사람의 참석을 바꿀 수
      있게 된다. 앱 회원은 앱에서 스스로 누른다.

   ⚠️ 대리로 누를 수 있다는 건 알고 고른 것이다.
      단톡방 링크 하나를 쓰므로 누구든 목록의 어느 이름이든 누를 수 있다.
      그런데 지금도 총무가 그분들 대신 누르고 있으니 새로 생기는 위험이
      아니다. 대신 (1) 링크로 온 답은 앱에 표시가 남고 (2) 링크가 엉뚱한
      곳에 퍼지면 총무가 새로 만들어 옛 링크를 막을 수 있다.

   이 파일은 순수 함수만 둔다 — 데이터베이스는 index.js 가 읽고 쓴다.
   그래야 scripts/test-rsvplink.mjs 가 서버 없이 판단을 검사할 수 있다.
   ============================================================ */

const { membersInScope } = require('./scope');

const isOfflineId = (id) => String(id || '').startsWith('local:');

/** 열쇠 모양 — 앱이 만드는 것과 같아야 한다(src/lib/rsvpLink.js) */
const TOKEN_RE = /^[A-Za-z0-9]{24,64}$/;
const validToken = (t) => typeof t === 'string' && TOKEN_RE.test(t);

/** 링크의 열쇠가 클럽에 저장된 것과 같은가.
    ⚠️ 클럽에 열쇠가 없으면(아직 안 만들었거나 지웠으면) 무조건 거절. */
function tokenOk(club, token) {
  const saved = club && club.rsvpLink && club.rsvpLink.token;
  return validToken(saved) && validToken(token) && saved === token;
}

/** 한국 날짜 'YYYY-MM-DD'. 서버는 UTC 로 돈다 — 그대로 쓰면 아침 9시
    전까지 "어제"로 계산돼, 오늘 모임이 지난 모임처럼 사라진다. */
function todayKST(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const SHOW_MEETINGS = 4;

/** 이 모임에 답할 수 있는 오프라인 회원 */
function offlineFor(members, meeting) {
  return membersInScope(members, meeting && meeting.venueId)
    .filter((m) => isOfflineId(m.id));
}

/**
 * 링크 페이지가 보여 줄 것.
 * ⚠️ 필요한 것만 내보낸다. 이 응답은 링크만 있으면 누구나 받는다 —
 *    전화번호·등급 같은 건 절대 싣지 않고, 앱 회원의 이름·응답도 뺀다.
 */
function boardOf({ club, members, meetings, today }) {
  const upcoming = (meetings || [])
    .filter((mt) => mt && !mt.canceled && (mt.date || '') >= today)
    .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')))
    .slice(0, SHOW_MEETINGS);

  const people = new Map();
  const outMeetings = upcoming.map((mt) => {
    const who = offlineFor(members, mt);
    who.forEach((m) => people.set(m.id, { id: m.id, name: m.name || '', gender: m.gender || '' }));
    const rsvp = {};
    who.forEach((m) => {
      const v = (mt.rsvp || {})[m.id];
      if (v === 'yes' || v === 'no') rsvp[m.id] = v;
    });
    return {
      id: mt.id,
      date: mt.date || '',
      time: mt.time || '',
      endTime: mt.endTime || '',
      place: mt.place || '',
      courts: mt.courts || null,
      /* 이 모임에 답할 수 있는 사람 — 코트장이 지정된 모임은 그 코트장
         사람만. 다른 코트 모임에 답하면 그 코트 대진에 잡혀 버린다. */
      who: who.map((m) => m.id),
      rsvp,
    };
  });

  return {
    club: { name: (club && club.name) || '' },
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    meetings: outMeetings,
  };
}

/**
 * 답 하나를 검사하고, 적을 내용을 돌려준다.
 * @returns {{ ok: true, patch } | { ok: false, code, message }}
 *
 * ⚠️ rsvpBy 에는 **그 회원 본인**을 적는다. 서버의 알림 규칙은 rsvpBy 가
 *    본인이면 "본인이 마음을 바꿨다"로 읽는다. 오프라인 회원이 링크로
 *    대진 뒤에 빠지면 운영진이 알아야 하니 이게 맞다. 그리고 오프라인
 *    회원은 앱에서 스스로 누를 방법이 없으므로, 오프라인 회원의 답이
 *    본인 이름으로 적혀 있으면 **곧 링크로 온 답**이다 — 앱이 이걸로
 *    표시를 단다. 따로 필드를 두지 않는다.
 */
function checkAnswer({ club, token, member, meeting, value, today, members }) {
  if (!tokenOk(club, token)) {
    return { ok: false, code: 'link', message: '링크가 바뀌었거나 잘못되었습니다. 총무에게 새 링크를 받아 주세요.' };
  }
  /* 'clear' = 아직 안 답한 상태로 되돌리기. 이름을 잘못 골라 남의 이름으로
     누른 사람이 자기 실수를 치울 때 쓴다(링크 페이지의 [내가 아니에요]).
     링크를 가진 사람은 어차피 오프라인 회원의 참석을 바꿀 수 있으므로,
     "미응답으로 되돌리기"가 새로 여는 위험은 없다. */
  if (value !== 'yes' && value !== 'no' && value !== 'clear') {
    return { ok: false, code: 'value', message: '참석 또는 불참만 고를 수 있습니다.' };
  }
  if (!meeting || meeting.canceled) {
    return { ok: false, code: 'meeting', message: '없어졌거나 취소된 모임입니다.' };
  }
  if ((meeting.date || '') < today) {
    return { ok: false, code: 'past', message: '이미 지난 모임입니다.' };
  }
  if (!member || !isOfflineId(member.id)) {
    return { ok: false, code: 'member', message: '앱을 쓰는 회원은 앱에서 직접 눌러 주세요.' };
  }
  const allowed = offlineFor(members, meeting).some((m) => m.id === member.id);
  if (!allowed) {
    return { ok: false, code: 'scope', message: '이 모임의 대상이 아닙니다.' };
  }
  if (value === 'clear') {
    /* 지울 칸의 이름만 돌려준다 — 실제 삭제 표시는 index.js 가 붙인다
       (이 파일은 데이터베이스 모듈을 모른다). */
    return { ok: true, patch: {}, remove: [`rsvp.${member.id}`, `rsvpBy.${member.id}`] };
  }
  return {
    ok: true,
    patch: {
      [`rsvp.${member.id}`]: value,
      [`rsvpBy.${member.id}`]: member.id,
    },
    remove: [],
  };
}

module.exports = {
  isOfflineId, validToken, tokenOk, todayKST, offlineFor, boardOf, checkAnswer, SHOW_MEETINGS,
};
