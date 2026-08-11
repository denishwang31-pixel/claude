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
