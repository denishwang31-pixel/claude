/* ============================================================
   FIX-07 — 날씨 계층. 계약 고정:
     weatherFor(date, forecast) →
       - forecast(기상청 실연동, PHASE 4)가 있으면 그대로 정규화 반환
       - 없으면 개발 모드에서만 해시 기반 데모, 프로덕션에선 null
   모든 소비 화면은 반드시 `w && (...)` 로 방어할 것.
   forecast 예상 형태: { icon, temp, rain, txt }  (meeting.forecast 에 저장)
   ============================================================ */

const DEMO_OPTS = [
  { icon: '☀️', txt: '맑음', rain: 0 },
  { icon: '🌤', txt: '구름 조금', rain: 10 },
  { icon: '⛅', txt: '구름 많음', rain: 20 },
  { icon: '🌧', txt: '비', rain: 80 },
  { icon: '☀️', txt: '맑음', rain: 0 },
];

function demoWeather(dateStr) {
  let h = 0;
  for (const ch of String(dateStr)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const w = DEMO_OPTS[h % DEMO_OPTS.length];
  return { ...w, temp: 24 + (h % 8) };
}

/**
 * @param {string} dateStr  'YYYY-MM-DD'
 * @param {object|undefined} forecast  실연동 예보(있으면 우선)
 * @returns {{icon,temp,rain,txt}|null}
 */
export function weatherFor(dateStr, forecast) {
  if (forecast && typeof forecast.rain === 'number') {
    return {
      icon: forecast.icon || '🌡',
      temp: forecast.temp,
      rain: forecast.rain,
      txt: forecast.txt || '',
    };
  }
  // 실연동 예보가 없을 때: 개발 중에는 데모, 프로덕션에선 표시 안 함(null)
  if (typeof __DEV__ !== 'undefined' && __DEV__ && dateStr) {
    return demoWeather(dateStr);
  }
  return null;
}
