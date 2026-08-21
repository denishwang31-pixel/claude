/* ============================================================
   공개 대회 — 협회·지자체·스폰서가 여는 큰 대회

   ⚠️ 클럽 대회와 완전히 다른 물건이다. 섞으면 안 된다.

     클럽 대회 (clubs/{id}/tournaments, src/lib/agenda.js)
       우리 클럽이 우리끼리 여는 월례대회·청백전. 참가자는 우리 회원이고,
       대진도 우리가 짜고, 운영진이 관리한다. 일정에 함께 뜬다.

     공개 대회 (openTournaments, 이 파일)
       KTA·시도협회·던롭 X-OPEN 처럼 밖에서 여는 대회. 우리가 여는 것이
       아니라 "이런 게 열린다"를 알려 주는 것이다. 참가 신청은 주최 측
       사이트에서 하고, 우리는 대진도 명단도 갖고 있지 않다.

   왜 일정에 섞지 않는가
     1. 성격이 다르다. 클럽 일정은 "내가 가야 하는 것", 공개 대회는
        "관심 있으면 나가는 것"이다. 한 줄에 섞으면 화요일 정기 모임과
        전국대회가 같은 무게로 보인다.
     2. 양이 다르다. 전국에서 열리는 대회는 한 달에 수십 건이다. 우리
        클럽 일정은 한 달에 여덟 번이다. 섞으면 우리 일정이 묻힌다.
     3. 달력이 무의미해진다. 공개 대회까지 점을 찍으면 거의 모든 날에
        점이 생겨서, "이번 주에 우리 뭐 있지"를 볼 수 없게 된다.

     그래서 별도 화면([대회 찾기])에 두고, 일정에는 "이 달 우리 지역에
     N건"이라는 한 줄만 둔다. 그 한 줄은 목록에도 달력에도 섞이지 않는다.

   수익이 여기서 나온다
     스폰서 배너·대회 홍보·중계는 전부 이 화면 쪽 이야기다. 클럽 운영
     화면에는 광고를 늘리지 않는다 — 매일 쓰는 화면이 광고판이 되면
     앱을 안 쓰게 된다.
   ============================================================ */

/** 대회가 지금 어떤 단계인가 — "지금 내가 뭘 할 수 있나"로 나눈다 */
export const OPEN_STATE = {
  SOON: 'soon',       // 접수 시작 전 — 일정만 알아 두는 단계
  SIGNUP: 'signup',   // 접수 중 — 신청 링크가 살아 있다
  CLOSED: 'closed',   // 접수 마감, 대회는 아직
  LIVE: 'live',       // 대회 기간 중 — 중계로 들어가는 자리
  DONE: 'done',       // 끝났다
};

export const OPEN_STATE_LABEL = {
  [OPEN_STATE.SOON]: '접수 예정',
  [OPEN_STATE.SIGNUP]: '접수 중',
  [OPEN_STATE.CLOSED]: '접수 마감',
  [OPEN_STATE.LIVE]: '대회 진행 중',
  [OPEN_STATE.DONE]: '종료',
};

export const OPEN_STATE_TONE = {
  [OPEN_STATE.SOON]: 'soft',
  [OPEN_STATE.SIGNUP]: 'lime',
  [OPEN_STATE.CLOSED]: 'default',
  [OPEN_STATE.LIVE]: 'red',
  [OPEN_STATE.DONE]: 'default',
};

const d = (v) => String(v || '').slice(0, 10);

/** 대회 마지막 날. 하루짜리면 시작일과 같다. */
export const lastDay = (t) => d(t?.endDate) || d(t?.startDate);

/**
 * 지금 단계.
 *
 * 판단 순서가 중요하다. 이미 끝난 대회는 접수 기간을 따지지 않고,
 * 대회 기간 중이면 접수가 열려 있든 말든 '진행 중'이다.
 */
export function openState(t, today) {
  if (!t) return OPEN_STATE.SOON;
  const start = d(t.startDate);
  const end = lastDay(t);

  if (end && today > end) return OPEN_STATE.DONE;
  if (start && end && today >= start && today <= end) return OPEN_STATE.LIVE;

  const from = d(t.signupFrom);
  const to = d(t.signupTo);
  if (to && today > to) return OPEN_STATE.CLOSED;
  if (from && today < from) return OPEN_STATE.SOON;
  /* 접수 기간을 안 적은 대회가 흔하다(요강만 올라오고 날짜는 공지로).
     그때는 대회 전날까지 접수 중으로 본다 — "접수 예정"으로 두면
     영영 신청 못 하는 대회가 된다. */
  if (!from && !to) return start ? OPEN_STATE.SIGNUP : OPEN_STATE.SOON;
  return OPEN_STATE.SIGNUP;
}

/** 카드에 붙일 한 줄 — 언제까지 신청해야 하는지가 제일 중요하다 */
export function openStatusLine(t, today) {
  const state = openState(t, today);
  const to = d(t?.signupTo);
  if (state === OPEN_STATE.SIGNUP) {
    return to ? `${to}까지 접수` : '접수 중 · 마감일은 요강 확인';
  }
  if (state === OPEN_STATE.SOON) {
    const from = d(t?.signupFrom);
    return from ? `${from}부터 접수` : '접수 일정 미정';
  }
  if (state === OPEN_STATE.CLOSED) return '접수가 마감되었습니다';
  if (state === OPEN_STATE.LIVE) return '오늘 열리고 있습니다';
  return '끝난 대회입니다';
}

/** 대회 기간 표기 — '9/12' 또는 '9/12~9/14' */
export function periodText(t) {
  const s = d(t?.startDate);
  const e = d(t?.endDate);
  const short = (x) => (x.length === 10 ? `${Number(x.slice(5, 7))}/${Number(x.slice(8, 10))}` : x);
  if (!s) return '날짜 미정';
  if (!e || e === s) return short(s);
  return `${short(s)}~${short(e)}`;
}

/** 지역 한 줄 */
export const regionText = (t) =>
  [t?.sido, t?.gungu].filter(Boolean).join(' ') || '지역 미정';

/* ---------------- 고르기 ---------------- */

/** 목록에 남길 것인가 */
export function visibleOpen(list, { today, region = null, state = null, kw = '' } = {}) {
  const q = String(kw || '').trim().toLowerCase();
  return (list || []).filter((t) => {
    if (!t || !t.id) return false;
    /* 끝난 대회는 기본으로 감춘다. 지난 대회 요강을 찾는 사람보다
       이번 달에 나갈 대회를 찾는 사람이 훨씬 많다. */
    const st = openState(t, today);
    if (state ? st !== state : st === OPEN_STATE.DONE) return false;
    if (region && t.sido !== region) return false;
    if (q) {
      const hay = `${t.name || ''} ${t.host || ''} ${t.org || ''} ${regionText(t)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * 정렬 — 접수 중인 것을 맨 위로.
 *
 * 날짜순으로만 세우면 "접수가 이미 마감된 다음 주 대회"가 "다음 달
 * 접수 중인 대회"보다 위에 온다. 지금 신청할 수 있는 것이 먼저다.
 */
export function sortOpen(list, today) {
  const rank = (t) => {
    const st = openState(t, today);
    if (st === OPEN_STATE.SIGNUP) return 0;
    if (st === OPEN_STATE.LIVE) return 1;
    if (st === OPEN_STATE.SOON) return 2;
    if (st === OPEN_STATE.CLOSED) return 3;
    return 4;
  };
  return [...(list || [])].sort((a, b) => rank(a) - rank(b)
    || d(a.startDate).localeCompare(d(b.startDate)));
}

/** 목록에 있는 시도들 — 지역 필터 칩 */
export const openSidos = (list) =>
  [...new Set((list || []).map((t) => t?.sido).filter(Boolean))].sort();

/**
 * 일정 화면에 띄울 한 줄.
 *
 * ⚠️ 이 한 줄이 이 파일이 클럽 일정에 개입하는 전부다. 목록에도
 *    달력에도 들어가지 않는다. 누르면 [대회 찾기]로 넘어간다.
 *    여기에 카드를 늘리고 싶어지면, 이 파일 머리말을 다시 읽을 것.
 */
export function nearbyNote(list, { today, monthKey, region = null } = {}) {
  const near = (list || []).filter((t) => {
    if (region && t?.sido !== region) return false;
    const st = openState(t, today);
    if (st === OPEN_STATE.DONE || st === OPEN_STATE.CLOSED) return false;
    return d(t?.startDate).slice(0, 7) === monthKey;
  });
  if (!near.length) return null;
  const signup = near.filter((t) => openState(t, today) === OPEN_STATE.SIGNUP).length;
  return {
    count: near.length,
    signup,
    text: signup
      ? `이 달 ${region || '전국'} 대회 ${near.length}건 · 접수 중 ${signup}건`
      : `이 달 ${region || '전국'} 대회 ${near.length}건`,
  };
}

/* ---------------- 등록 검증 (앱 운영자) ---------------- */

export function validateOpen(t) {
  if (!String(t?.name || '').trim()) return '대회 이름을 넣어 주세요';
  if (!d(t?.startDate)) return '대회 시작일을 넣어 주세요';
  const s = d(t.startDate);
  const e = d(t.endDate);
  if (e && e < s) return '종료일이 시작일보다 빠릅니다';
  const from = d(t.signupFrom);
  const to = d(t.signupTo);
  if (from && to && to < from) return '접수 마감일이 시작일보다 빠릅니다';
  /* 접수가 대회보다 늦게 끝나는 것은 현실에 없다. 이걸 막지 않으면
     "접수 중"인데 이미 끝난 대회가 목록 맨 위에 올라온다. */
  if (to && to > s) return '접수 마감일이 대회 시작일보다 늦습니다';
  const link = String(t?.link || '').trim();
  if (link && !/^https?:\/\//i.test(link)) return '신청 링크는 http 로 시작해야 합니다';
  return '';
}

export default {
  OPEN_STATE, OPEN_STATE_LABEL, OPEN_STATE_TONE,
  lastDay, openState, openStatusLine, periodText, regionText,
  visibleOpen, sortOpen, openSidos, nearbyNote, validateOpen,
};
