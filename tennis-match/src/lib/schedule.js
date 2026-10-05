/* ============================================================
   클럽 운영 설정 유틸 — 코트 면수 / 운영 시간 / 타임(라운드) 길이
   club.settings = {
     courts: 3,            // 확보한 코트 면수
     startTime: '10:00',   // 운동 시작
     endTime: '13:00',     // 운동 종료
     roundMinutes: 40,     // 한 타임(게임) 소요 시간
     allowMixedDefault: false, // 잡복 기본 허용 여부
     feeAmount, guestFee, payLink …
   }
   ============================================================ */

export const DEFAULT_SETTINGS = {
  courts: 2,
  startTime: '10:00',
  endTime: '13:00',
  roundMinutes: 40,
  allowMixedDefault: false,
  feeAmount: 30000,
  guestFee: 10000,
  payLink: '',
};

/* 대진 편성 기본 설정 (클럽 meta/matchConfig).
   모임마다 타임별로 덮어쓸 수 있고, 여기 값은 "기본값" 역할. */
export const DEFAULT_MATCH_CONFIG = {
  defaultRoundType: 'MX',   // 기본 타임 유형: 혼복
  allowMixed: false,        // 잡복 허용
  skillBalance: false,      // NTRP 근접 매칭
  ruleOrder: null,          // 편성 기준 우선순위(키 배열) — null 이면 기본 순서
};

/** 'HH:MM' → 분 (잘못된 값이면 null) */
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export const toHHMM = (mins) => {
  const v = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

/** 운영 시간과 타임 길이로 라운드 수 계산 (종료시각이 이전이면 자정 넘김 처리) */
export function roundsFromSettings(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const start = toMinutes(s.startTime);
  const end = toMinutes(s.endTime);
  const per = Number(s.roundMinutes) || 40;
  if (start == null || end == null || per <= 0) return 4;
  let span = end - start;
  if (span <= 0) span += 1440;
  return Math.max(1, Math.floor(span / per));
}

/** 각 타임의 시작/종료 시각 목록 (대진표에 시간 표기용) */
export function roundTimes(settings, rounds) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const start = toMinutes(s.startTime);
  const per = Number(s.roundMinutes) || 40;
  const n = rounds || roundsFromSettings(s);
  if (start == null) return [];
  return Array.from({ length: n }, (_, i) => ({
    round: i + 1,
    start: toHHMM(start + i * per),
    end: toHHMM(start + (i + 1) * per),
  }));
}

/**
 * 대회 시작~종료 시간으로 타임 수 — 일정(roundsFromSettings)과 같은 계산.
 * 시작·종료를 둘 다 안 정했으면 null(타임 수는 직접 적은 값 그대로).
 * 앱 주인(2026-10-04): "시작 시간 종료 시간이 있어야지"
 */
export function timingRounds(timing) {
  const start = toMinutes(timing?.startTime);
  const end = toMinutes(timing?.endTime);
  if (start == null || end == null) return null;
  const per = Math.min(180, Math.max(5, Number(timing.roundMinutes) || TOURNAMENT_ROUND_MINUTES));
  let span = end - start;
  if (span <= 0) span += 1440;
  /* 이벤트(행사·식사)가 끼면 그만큼 타임이 밀린다 — 종료 시간 안에 실제로 들어가는 타임만 센다 */
  if ((timing.events || []).length) {
    const endAbs = start + span;
    let n = 0;
    while (n < 200) {
      const s = tournamentSchedule(timing, n + 1).times[n];
      if (!s || s.endAbs > endAbs) break;
      n += 1;
    }
    return Math.max(1, n);
  }
  return Math.max(1, Math.floor(span / per));
}

/* ============================================================
   대회 이벤트 — 경기 말고 행사·식사 같은 일정(개회식·점심·시상식)
   2026-10-05 앱 주인: "처음·중간·마지막에 행사나 식사 같은 이벤트도 — 이름·시간을 정하면
   그 경기 타임 중간에 블락하고, 색도 다르게".
   timing.events = [{ id, name, startTime:'HH:MM', minutes }]
   타임은 시작 시간부터 한 타임씩 이어 가다가, 이벤트와 겹치면 이벤트가 끝난 뒤로 밀린다.
   ============================================================ */
export const EVENT_MINUTES = 60;
export function normalizeEvents(timing) {
  return (timing?.events || [])
    .map((e, i) => ({
      id: String(e?.id || `ev${i}`),
      name: String(e?.name || '').trim() || '이벤트',
      start: toMinutes(e?.startTime),
      minutes: Math.min(600, Math.max(5, Number(e?.minutes) || EVENT_MINUTES)),
    }))
    .filter((e) => e.start != null)
    .sort((a, b) => a.start - b.start);
}

/**
 * 타임 시각 + 이벤트 자리 — 대진표가 이벤트 띠를 어느 타임 앞에 그릴지(beforeRound, 끝이면 null)
 * @returns { times:[{round,start,end,startAbs,endAbs}], events:[{id,name,start,end,minutes,beforeRound}] }
 */
export function tournamentSchedule(timing, rounds) {
  const out = { times: [], events: [] };
  const s0 = toMinutes(timing?.startTime);
  if (s0 == null) return out;
  const per = Math.min(180, Math.max(5, Number(timing.roundMinutes) || TOURNAMENT_ROUND_MINUTES));
  /* 이벤트 시각을 대회 시작 기준으로 펼친다(자정을 넘는 대회 — 시작보다 이르면 다음 날) */
  const evs = normalizeEvents(timing).map((e) => {
    let a = e.start;
    if (a < s0 - 180) a += 1440;      // 시작보다 3시간 넘게 이르면 다음 날로 본다
    return { ...e, a, b: a + e.minutes };
  }).sort((x, y) => x.a - y.a);
  let cur = s0;
  const n = Math.max(0, Math.floor(Number(rounds) || 0));
  for (let r = 1; r <= n; r += 1) {
    /* 이 타임 자리와 겹치는 이벤트가 있으면 그 이벤트가 끝난 뒤로 */
    let moved = true;
    while (moved) {
      moved = false;
      for (const e of evs) {
        if (e.a < cur + per && e.b > cur) { cur = e.b; moved = true; }
      }
    }
    out.times.push({ round: r, start: toHHMM(cur), end: toHHMM(cur + per), startAbs: cur, endAbs: cur + per });
    cur += per;
  }
  out.events = evs.map((e) => {
    const next = out.times.find((t) => t.startAbs >= e.a);
    return { id: e.id, name: e.name, start: toHHMM(e.a), end: toHHMM(e.b), minutes: e.minutes, beforeRound: next ? next.round : null };
  });
  return out;
}

/**
 * 대회 타임별 시각 — 대회 문서 timing = { startTime:'HH:MM', endTime:'HH:MM', roundMinutes }
 * 일정(모임)과 같은 계산(roundTimes). 시작 시간을 아직 안 정했으면 빈 목록 → 대진표에 시각을 안 그린다.
 * (2026-10-04 앱 주인: "일정 설정할 때처럼 대회도 시간·타임당 소요시간을 정해 타임 아래 시간 표시")
 */
export const TOURNAMENT_ROUND_MINUTES = 30;
export function tournamentRoundTimes(timing, rounds) {
  if (!timing || toMinutes(timing.startTime) == null) return [];
  const n = Math.max(0, Math.floor(Number(rounds) || 0));
  if (!n) return [];
  /* 이벤트가 있으면 그만큼 밀린 시각(tournamentSchedule), 없으면 일정과 같은 계산 */
  if (normalizeEvents(timing).length) {
    return tournamentSchedule(timing, n).times.map(({ round, start, end }) => ({ round, start, end }));
  }
  const per = Math.min(180, Math.max(5, Number(timing.roundMinutes) || TOURNAMENT_ROUND_MINUTES));
  return roundTimes({ startTime: timing.startTime, roundMinutes: per }, n);
}

/** 설정 요약 문장 (설정 화면·모임 등록에서 표시) */
export function describeSettings(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const n = roundsFromSettings(s);
  return `${s.startTime}~${s.endTime} · 코트 ${s.courts}면 · ${s.roundMinutes}분/타임 → ${n}타임`;
}

/* ============================================================
   정기 모임 반복 생성
   - 매주 / 격주 / 매월(같은 요일 n번째)
   - 시작일부터 종료일(기한)까지의 날짜 목록을 만든다
   ============================================================ */
export const REPEAT_TYPES = [
  { key: 'none', name: '반복 안함' },
  { key: 'weekly', name: '매주' },
  { key: 'biweekly', name: '격주' },
  { key: 'monthly', name: '매월 같은 주·요일' },
];

const pad2 = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} untilDate 'YYYY-MM-DD' (포함)
 * @param {string} type      none|weekly|biweekly|monthly
 * @param {number} max       안전 상한(기본 60회)
 * @returns {string[]} 날짜 목록
 */
export function expandRecurrence(startDate, untilDate, type, max = 60) {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return [];
  if (type === 'none' || !type) return [startDate];
  const until = new Date(untilDate);
  if (Number.isNaN(until.getTime()) || until < start) return [startDate];

  const out = [];
  if (type === 'monthly') {
    // 시작일이 그 달의 몇 번째 요일인지 고정 (예: 둘째 주 토요일)
    const dow = start.getDay();
    const nth = Math.ceil(start.getDate() / 7);
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (out.length < max) {
      // 해당 월의 nth 번째 dow 요일 찾기
      const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const shift = (dow - first.getDay() + 7) % 7;
      const day = 1 + shift + (nth - 1) * 7;
      const cand = new Date(cur.getFullYear(), cur.getMonth(), day);
      if (cand.getMonth() === cur.getMonth() && cand >= start && cand <= until) out.push(toYmd(cand));
      cur.setMonth(cur.getMonth() + 1);
      if (new Date(cur.getFullYear(), cur.getMonth(), 1) > until) break;
    }
    return out;
  }

  const step = type === 'biweekly' ? 14 : 7;
  const cur = new Date(start);
  while (cur <= until && out.length < max) {
    out.push(toYmd(cur));
    cur.setDate(cur.getDate() + step);
  }
  return out;
}

/** 요일 이름 */
export const dowName = (dateStr) => {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? '' : ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
};
