/* ============================================================
   클럽 교류전 — 서버 쪽 사본 (CommonJS)

   firebase deploy 는 functions/ 만 올리므로 ../src/lib 를 require 할 수
   없다. 그래서 알림 문구에 필요한 만큼만 사본을 둔다.

   사본은 반드시 어긋난다 — 말로 적어 두는 것으로는 못 막는다.
   scripts/test-clubmatch.mjs 가 src/lib/clubMatch.js 와 이 파일에
   같은 입력을 넣어 답이 같은지 대조한다. 한쪽만 고치면 깨진다.

   여기 없는 함수(편성·권한 판단)는 서버가 쓰지 않는다. 서버가 안 쓰는
   것까지 베끼면 어긋날 표면만 넓어진다.
   ============================================================ */

const SCORING = { GAMES: 'games', TIME: 'time' };
const END_GAMES = [4, 6, 8];

const DEFAULT_CM_CONFIG = {
  courts: 2,
  rounds: 4,
  startTime: '10:00',
  scoring: SCORING.GAMES,
  endGames: 6,
  roundMinutes: 30,
  roundTypes: {},
  autoDraw: true,
};

const clampInt = (v, lo, hi, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

function normalizeConfig(cfg) {
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

function describeConfig(cfg) {
  const c = normalizeConfig(cfg);
  const how = c.scoring === SCORING.TIME
    ? `타임당 ${c.roundMinutes}분`
    : `${c.endGames}게임`;
  return `${c.startTime} 시작 · 코트 ${c.courts}면 · ${c.rounds}타임 · ${how}`;
}

function inviteMessage(m) {
  return {
    title: `${(m && m.hostClubName) || '클럽'} 교류전 초대`,
    body: `${(m && m.date) || ''}${m && m.place ? ` ${m.place}` : ''} — ${describeConfig(m && m.config)}`,
  };
}

function responseMessage(m, accepted) {
  return {
    title: `교류전 ${accepted ? '수락' : '거절'}`,
    body: accepted
      ? `${(m && m.guestClubName) || '상대 클럽'}이 ${(m && m.date) || ''} 교류전을 수락했습니다. 출전 명단을 넣어 주세요.`
      : `${(m && m.guestClubName) || '상대 클럽'}이 ${(m && m.date) || ''} 교류전을 거절했습니다.`,
  };
}

module.exports = {
  SCORING, END_GAMES, DEFAULT_CM_CONFIG,
  normalizeConfig, describeConfig, inviteMessage, responseMessage,
};
