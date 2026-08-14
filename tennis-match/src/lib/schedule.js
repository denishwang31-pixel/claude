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
