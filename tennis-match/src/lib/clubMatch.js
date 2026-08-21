/* ============================================================
   클럽 교류전 — 두 클럽이 하나의 대회를 같이 본다

   지금까지는 상대 클럽 선수를 우리가 손으로 다 쳐 넣었다. 20명이면
   20번 입력하고, 이름을 잘못 들으면 그대로 대진표에 남았다. 상대는
   자기 대진표를 볼 수도 없어서 결국 캡처를 찍어 단톡방에 보냈다.

   앱에 등록된 클럽이면 검색해서 연결한다.
     1. 개설한 클럽(host)이 상대 클럽을 찾아 초대를 보낸다
     2. 상대 클럽 운영진에게 알림이 가고, 수락하면 성사된다
     3. 각 클럽이 자기 출전 명단을 직접 넣는다 (자기 회원 목록에서 고른다)
     4. 대진표 작성·결과 입력은 개설한 클럽이 맡는다

   왜 개설한 쪽이 운영하나
     두 클럽이 같은 대진표를 동시에 고치면 누가 마지막에 눌렀는지로
     결과가 갈린다. 그런 것을 자동으로 합칠 방법은 없고, 실제로도
     주최 클럽이 코트를 잡고 진행을 맡는다. 그래서 운영 권한은 한쪽에
     몰고, 상대는 자기 명단만 책임진다.

   앱에 없는 클럽이면 예전처럼 이름과 선수를 직접 입력한다.
   동호회의 절반은 아직 앱을 안 쓰므로 이 길을 막으면 기능이 죽는다.
   ============================================================ */

export const CM_STATUS = {
  PENDING: 'pending',     // 초대를 보냈고 상대가 아직 안 봤다
  ACCEPTED: 'accepted',   // 상대가 수락했다 — 이제 양쪽이 명단을 넣는다
  DECLINED: 'declined',   // 상대가 거절했다
  CANCELED: 'canceled',   // 개설한 쪽이 취소했다
  DONE: 'done',           // 경기가 끝났다
};

export const CM_STATUS_LABEL = {
  [CM_STATUS.PENDING]: '수락 대기',
  [CM_STATUS.ACCEPTED]: '진행 중',
  [CM_STATUS.DECLINED]: '거절됨',
  [CM_STATUS.CANCELED]: '취소됨',
  [CM_STATUS.DONE]: '종료',
};

/** 상대가 앱에 있느냐 — 없으면 예전처럼 손으로 넣는다 */
export const CM_KIND = {
  LINKED: 'linked',       // 앱에 등록된 클럽 (검색해서 연결)
  MANUAL: 'manual',       // 미등록 클럽 (이름·선수 직접 입력)
};

/** 경기 길이를 무엇으로 끊는가 */
export const SCORING = {
  GAMES: 'games',         // 몇 게임 먼저 (4게임 / 6게임)
  TIME: 'time',           // 시간제 — 정해진 분이 지나면 종료
};

export const END_GAMES = [4, 6, 8];

export const DEFAULT_CM_CONFIG = {
  courts: 2,
  rounds: 4,
  startTime: '10:00',
  scoring: SCORING.GAMES,
  endGames: 6,
  roundMinutes: 30,
  roundTypes: {},         // { 1:'MX', 2:'MD', … } 없으면 혼복
  autoDraw: true,         // 자동 편성 / 끄면 각 팀이 직접 넣는다
};

const clampInt = (v, lo, hi, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

export function normalizeConfig(cfg) {
  const c = { ...DEFAULT_CM_CONFIG, ...(cfg || {}) };
  return {
    courts: clampInt(c.courts, 1, 20, 2),
    rounds: clampInt(c.rounds, 1, 20, 4),
    startTime: /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(c.startTime || '')) ? c.startTime : '10:00',
    scoring: c.scoring === SCORING.TIME ? SCORING.TIME : SCORING.GAMES,
    endGames: END_GAMES.includes(Number(c.endGames)) ? Number(c.endGames) : 6,
    roundMinutes: clampInt(c.roundMinutes, 10, 120, 30),
    roundTypes: c.roundTypes && typeof c.roundTypes === 'object' ? c.roundTypes : {},
    autoDraw: c.autoDraw !== false,
  };
}

/** 설정 한 줄 요약 — 초대장과 목록에 쓴다 */
export function describeConfig(cfg) {
  const c = normalizeConfig(cfg);
  const how = c.scoring === SCORING.TIME
    ? `타임당 ${c.roundMinutes}분`
    : `${c.endGames}게임`;
  return `${c.startTime} 시작 · 코트 ${c.courts}면 · ${c.rounds}타임 · ${how}`;
}

/* ---------- 누가 무엇을 할 수 있나 ----------
   화면과 보안 규칙이 같은 판단을 해야 한다. 화면에서만 막고 규칙에서
   안 막으면 아무 의미가 없고, 규칙에서만 막으면 눌렀는데 아무 일도
   안 일어나는 화면이 된다. */

export const isHost = (m, clubId) => !!clubId && m?.hostClubId === clubId;
export const isGuest = (m, clubId) => !!clubId && m?.guestClubId === clubId;

/** 대진표 작성·결과 입력·설정 변경 — 개설한 클럽만 */
export const canManage = (m, clubId, isAdmin) => !!isAdmin && isHost(m, clubId);

/** 초대 수락·거절 — 초대받은 클럽만, 아직 대기 중일 때만 */
export const canRespond = (m, clubId, isAdmin) =>
  !!isAdmin && isGuest(m, clubId) && m?.status === CM_STATUS.PENDING;

/**
 * 이 클럽이 지금 명단을 넣을 수 있는 자리.
 *   'host'  개설한 클럽 자리
 *   'guest' 상대 클럽 자리
 *   null    권한 없음
 *
 * 미등록 상대(MANUAL)는 상대가 앱을 못 쓰므로 개설한 쪽이 양쪽을 다 넣는다.
 */
export function rosterSideFor(m, clubId, isAdmin) {
  if (!isAdmin || !m) return null;
  if (m.status !== CM_STATUS.ACCEPTED) return null;
  if (isHost(m, clubId)) return 'host';
  if (isGuest(m, clubId)) return 'guest';
  return null;
}

/** 미등록 상대는 개설한 쪽이 상대 명단까지 넣는다 */
export const hostFillsBothRosters = (m) => m?.kind === CM_KIND.MANUAL;

/** 초대 직후에는 수락 전이라 명단을 못 넣는다 — 그 사정을 문장으로 */
export function rosterGuideFor(m, clubId, isAdmin) {
  if (!isAdmin) return '운영진만 출전 명단을 넣을 수 있습니다.';
  if (m?.status === CM_STATUS.PENDING) {
    return isGuest(m, clubId)
      ? '초대를 수락하면 우리 출전 명단을 넣을 수 있습니다.'
      : '상대 클럽이 수락하면 양쪽 명단을 넣을 수 있습니다.';
  }
  if (m?.status === CM_STATUS.DECLINED) return '상대 클럽이 초대를 거절했습니다.';
  if (m?.status === CM_STATUS.CANCELED) return '개설한 클럽이 취소했습니다.';
  return null;
}

/* ---------- 검증 ---------- */

export function validateInvite({ kind, guestClubId, guestClubName, date }) {
  if (!date) return '경기 날짜를 선택하세요';
  if (kind === CM_KIND.LINKED && !guestClubId) return '상대 클럽을 검색해서 선택하세요';
  if (kind === CM_KIND.MANUAL && !String(guestClubName || '').trim()) {
    return '상대 클럽 이름을 입력하세요';
  }
  return null;
}

/**
 * 이 명단으로 이 설정을 소화할 수 있는지 미리 본다.
 * 편성을 눌러 놓고 "빈 칸이 왜 이렇게 많지"를 겪지 않도록,
 * 누르기 전에 부족한 것을 말해 준다.
 */
export function diagnose(hostRoster, guestRoster, cfg) {
  const c = normalizeConfig(cfg);
  const need = { MX: { M: 1, F: 1 }, MD: { M: 2, F: 0 }, WD: { M: 0, F: 2 } };
  const count = (list) => ({
    M: (list || []).filter((p) => p.gender !== 'F').length,
    F: (list || []).filter((p) => p.gender === 'F').length,
  });
  const a = count(hostRoster);
  const b = count(guestRoster);
  const problems = [];

  for (let r = 1; r <= c.rounds; r += 1) {
    const key = c.roundTypes[r] || c.roundTypes[String(r)] || 'MX';
    if (key === 'SG') {
      if (a.M + a.F < c.courts || b.M + b.F < c.courts) {
        problems.push(`${r}타임 단식 ${c.courts}면 — 양 팀 ${c.courts}명씩 필요`);
      }
      continue;
    }
    const n = need[key] || need.MX;
    const shortA = a.M < n.M * c.courts || a.F < n.F * c.courts;
    const shortB = b.M < n.M * c.courts || b.F < n.F * c.courts;
    if (shortA || shortB) {
      const label = { MX: '혼복', MD: '남복', WD: '여복' }[key];
      problems.push(
        `${r}타임 ${label} ${c.courts}면 — `
        + `${[n.M ? `남 ${n.M * c.courts}명` : '', n.F ? `여 ${n.F * c.courts}명` : '']
          .filter(Boolean).join(' · ')} 필요`,
      );
    }
  }
  return {
    host: a,
    guest: b,
    ok: problems.length === 0,
    problems,
  };
}

/* ============================================================
   지나간 초대 — 목록이 쓰레기통이 되지 않게

   상대 클럽이 수락도 거절도 안 하면 "수락 대기"로 영원히 남는다.
   경기 날짜가 지나도 남아 있으니, 몇 달 뒤 교류전 목록을 열면 지난
   초대가 위에 잔뜩 쌓여 이번 주 경기를 못 찾는다.

   ⚠️ 지우지는 않는다
     "그때 우리가 초대했는데 답이 없었다"는 사실 자체가 정보다.
     상대 클럽과 다음 이야기를 할 때 근거가 되기도 한다. 그래서
     지우는 대신 지난 것으로 접어 둔다.

   ⚠️ 서버에 상태를 바꿔 쓰지 않는다
     날짜가 지났다는 것은 문서를 안 고쳐도 날짜만 보면 안다. 굳이
     매일 도는 작업을 만들어 status 를 'expired' 로 바꾸면, 그 작업이
     한 번 실패하면 목록이 다시 뒤엉킨다. 화면에서 판단한다.
   ============================================================ */

/** 답을 못 받은 채 경기 날짜가 지났는가 */
export function isStale(m, today) {
  if (!m || m.status !== CM_STATUS.PENDING) return false;
  const d = String(m.date || '');
  return !!d && !!today && d < today;
}

/** 이미 끝났거나 접어 둘 것인가 — 목록을 위아래로 가르는 기준 */
export function isArchived(m, today) {
  if (!m) return false;
  if (m.status === CM_STATUS.DONE
    || m.status === CM_STATUS.DECLINED
    || m.status === CM_STATUS.CANCELED) return true;
  if (isStale(m, today)) return true;
  /* 수락해 놓고 결과를 안 넣은 채 날짜가 지난 것도 접는다 —
     결과는 나중에도 넣을 수 있게 열어 두되 목록 위를 차지하지 않게 */
  return m.status === CM_STATUS.ACCEPTED && !!m.date && m.date < today;
}

/** 목록을 진행 중 / 지난 것으로 가른다 */
export function splitMatches(list, today) {
  const live = [];
  const past = [];
  (list || []).forEach((m) => (isArchived(m, today) ? past : live).push(m));
  const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));
  return {
    live: live.sort(byDate),
    past: past.sort((a, b) => byDate(b, a)),   // 지난 것은 최근 것부터
  };
}

/** 접어 둔 이유 — 아무 설명 없이 아래로 내려가면 사라진 것으로 보인다 */
export function archiveReason(m, today) {
  if (isStale(m, today)) return '답을 받지 못한 채 날짜가 지났습니다';
  if (m?.status === CM_STATUS.DECLINED) return '상대 클럽이 거절했습니다';
  if (m?.status === CM_STATUS.CANCELED) return '개설한 클럽이 취소했습니다';
  if (m?.status === CM_STATUS.DONE) return '종료된 교류전입니다';
  /* 수락된 것은 날짜가 지났을 때만 접힌다. 날짜를 안 보고 답하면
     다음 달 경기에도 "날짜가 지났습니다"가 붙는다. */
  if (m?.status === CM_STATUS.ACCEPTED && !!m.date && m.date < today) {
    return '경기 날짜가 지났습니다';
  }
  return '';
}

/* ============================================================
   상대 클럽 회원 이름의 보관

   교류전 문서는 루트(clubMatches)에 있어서 두 클럽이 같이 본다. 그래서
   상대 클럽 회원의 이름·성별이 우리 클럽 밖의 문서에 복사되어 남는다.
   상대가 앱을 지워도 이 기록은 남는다.

   개인정보처리방침에 적은 보관 기간(경기 후 1년)을 여기서 판단한다.
   실제 삭제는 운영진이 [지난 교류전 정리]로 하거나, 나중에 서버 작업이
   같은 함수를 써서 한다. 기준이 두 군데로 갈라지지 않게 여기 둔다.
   ============================================================ */

/** 명단을 지워도 되는 시점이 지났는가 (경기 후 KEEP_DAYS 일) */
export const ROSTER_KEEP_DAYS = 365;

export function rosterExpired(m, today, days = ROSTER_KEEP_DAYS) {
  const d = String(m?.date || '');
  if (!d || !today) return false;
  const gap = Math.round(
    (new Date(`${today}T00:00:00`) - new Date(`${d}T00:00:00`)) / 86400000,
  );
  return gap > days;
}

/** 이름을 지운 뒤에도 경기 기록은 읽혀야 한다 — 자리만 남긴다 */
export function scrubRoster(roster) {
  return (roster || []).map((p, i) => ({
    id: p?.id || `x${i + 1}`,
    name: `선수${i + 1}`,
    gender: p?.gender || '',
    scrubbed: true,
  }));
}

/** 초대 알림 문구 — 상대 클럽 운영진에게 간다 */
export function inviteMessage(m) {
  return {
    title: `${m?.hostClubName || '클럽'} 교류전 초대`,
    body: `${m?.date || ''}${m?.place ? ` ${m.place}` : ''} — ${describeConfig(m?.config)}`,
  };
}

export function responseMessage(m, accepted) {
  return {
    title: `교류전 ${accepted ? '수락' : '거절'}`,
    body: accepted
      ? `${m?.guestClubName || '상대 클럽'}이 ${m?.date || ''} 교류전을 수락했습니다. 출전 명단을 넣어 주세요.`
      : `${m?.guestClubName || '상대 클럽'}이 ${m?.date || ''} 교류전을 거절했습니다.`,
  };
}

export default {
  CM_STATUS, CM_STATUS_LABEL, CM_KIND, SCORING, END_GAMES, DEFAULT_CM_CONFIG,
  normalizeConfig, describeConfig, isHost, isGuest, canManage, canRespond,
  rosterSideFor, hostFillsBothRosters, rosterGuideFor, validateInvite, diagnose,
  isStale, isArchived, splitMatches, archiveReason,
  ROSTER_KEEP_DAYS, rosterExpired, scrubRoster,
  inviteMessage, responseMessage,
};
