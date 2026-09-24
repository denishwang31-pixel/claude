/* ============================================================
   공개 대회 자동 갱신 — 밤마다 모아 온 목록을 정리해 넣는 판단

   무엇을 하나
     매일 02시(한국 시간) jobs/sync-tournaments.mjs 가 협회·대회 사이트를
     훑어 "접수 중·접수 예정" 대회를 모아 온다. 모아 온 것은 사람 손을
     거치지 않은 값이라 그대로 넣으면 안 된다. 여기서
       · 날짜·지역·링크를 앱이 쓰는 모양으로 고치고
       · 요강 검사(validateOpen)에 걸리는 것은 버리고
       · 이미 접수가 끝난 것은 넣지 않고
       · 운영자가 손으로 넣었거나 고친 대회는 건드리지 않고
       · 끝난 자동 대회는 지운다
     를 정한다. 네이티브·네트워크가 없는 순수 함수라 검사가 붙는다
     (scripts/test-opensync.mjs).

   ⚠️ 운영자 우선
      자동 대회를 운영자가 앱에서 고치면 locked 가 붙는다. 그 뒤로는
      밤마다 돌아도 덮어쓰지 않는다 — 운영자가 요강을 보고 바로잡은 값을
      다음 날 새벽에 잘못 긁은 값이 되돌려 놓는 일을 막는다.
      운영자가 손으로 넣은 대회(source 없음)와 이름·날짜가 같은 것은
      아예 새로 만들지 않는다(같은 대회가 두 줄로 보이지 않게).
   ============================================================ */
import { SIDO_LIST } from './regions.js';
import { openState, OPEN_STATE, validateOpen, lastDay } from './openTournament.js';

export const AUTO_SOURCE = 'auto';
export const AUTO_PREFIX = 'auto_';

const pad = (n) => String(n).padStart(2, '0');

/** '2026.10.3' · '2026/10/03' · '2026-10-03(토)' · '2026년 10월 3일' → '2026-10-03'. 못 읽으면 '' */
export function normDate(v) {
  const m = String(v || '').match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return '';   // 2/30 같은 날
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/* 긴 이름 → 앱의 짧은 시도 이름 */
const SIDO_ALIAS = {
  서울특별시: '서울', 서울시: '서울', 경기도: '경기', 인천광역시: '인천', 인천시: '인천',
  부산광역시: '부산', 대구광역시: '대구', 광주광역시: '광주', 대전광역시: '대전',
  울산광역시: '울산', 세종특별자치시: '세종', 세종시: '세종',
  강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남',
  경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 제주도: '제주',
};

/** 시도 이름을 앱 목록 값으로. 모르면 '' (지역 칩에 엉뚱한 값이 생기지 않게) */
export function normSido(v) {
  const s = String(v || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  if (SIDO_LIST.includes(s)) return s;
  if (SIDO_ALIAS[s]) return SIDO_ALIAS[s];
  const long = Object.keys(SIDO_ALIAS).find((k) => s.startsWith(k));
  if (long) return SIDO_ALIAS[long];
  return SIDO_LIST.find((x) => s.startsWith(x)) || '';
}

/** 이름 비교용 — 띄어쓰기·괄호·기호를 빼고 소문자로 */
export const nameKey = (name) => String(name || '')
  .toLowerCase()
  .replace(/[\s()[\]{}<>「」『』【】·•,.\-_'"`~!?:;/]/g, '');

/** 같은 대회 판별 열쇠 — 이름 + 시작일 */
export const sameKey = (t) => `${nameKey(t?.name)}|${normDate(t?.startDate)}`;

/* FNV-1a 32bit — 문서 id 를 값에서 정해서, 밤마다 돌아도 같은 대회는 같은 문서가 된다 */
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
export const autoId = (t) => `${AUTO_PREFIX}${fnv(sameKey(t))}`;

const httpUrl = (v) => {
  const s = String(v || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : '';
};
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * 모아 온 한 건을 앱 문서 모양으로.
 * @returns {{ doc: object|null, reason: string }} doc 이 null 이면 reason 에 버린 이유
 */
export function cleanItem(raw, today) {
  if (!raw || typeof raw !== 'object') return { doc: null, reason: '빈 값' };
  const name = text(raw.name, 120);
  if (!name) return { doc: null, reason: '이름 없음' };
  const startDate = normDate(raw.startDate);
  if (!startDate) return { doc: null, reason: '대회 날짜를 못 읽음' };
  let endDate = normDate(raw.endDate);
  if (endDate === startDate) endDate = '';
  const doc = {
    name,
    host: text(raw.host, 80),
    org: text(raw.org, 30),
    sido: normSido(raw.sido),
    gungu: text(raw.gungu, 20),
    place: text(raw.place, 80),
    startDate,
    endDate,
    signupFrom: normDate(raw.signupFrom),
    signupTo: normDate(raw.signupTo),
    divisions: (Array.isArray(raw.divisions) ? raw.divisions : String(raw.divisions || '').split(','))
      .map((x) => text(x, 30)).filter(Boolean).slice(0, 12),
    fee: Math.max(0, Math.round(Number(raw.fee) || 0)),
    /* 신청 링크가 없으면 요강·공지 주소라도 — 누르면 어디로든 가야 한다 */
    link: httpUrl(raw.link) || httpUrl(raw.sourceUrl),
    sourceUrl: httpUrl(raw.sourceUrl) || httpUrl(raw.link),
    note: text(raw.note, 200),
  };
  const err = validateOpen(doc);
  if (err) return { doc: null, reason: err };
  const st = openState(doc, today);
  if (st !== OPEN_STATE.SIGNUP && st !== OPEN_STATE.SOON) {
    return { doc: null, reason: '접수가 이미 끝남' };
  }
  return { doc, reason: '' };
}

/**
 * 이번에 모은 것과 지금 들어 있는 것을 비교해 할 일을 정한다.
 *
 * @param {{found: object[], existing: object[], today: string}} p
 *        existing 은 openTournaments 전체({id, ...data})
 * @returns {{upserts: {id, data}[], deletes: string[], skipped: {name, reason}[]}}
 */
export function planSync({ found = [], existing = [], today }) {
  const byId = new Map((existing || []).filter((t) => t && t.id).map((t) => [t.id, t]));
  const manualKeys = new Set((existing || [])
    .filter((t) => t && t.source !== AUTO_SOURCE)
    .map(sameKey));

  const upserts = [];
  const skipped = [];
  const seen = new Set();
  (found || []).forEach((raw) => {
    const { doc, reason } = cleanItem(raw, today);
    if (!doc) { skipped.push({ name: text(raw?.name, 60) || '(이름 없음)', reason }); return; }
    const key = sameKey(doc);
    if (manualKeys.has(key)) { skipped.push({ name: doc.name, reason: '운영자가 넣은 대회와 같음' }); return; }
    const id = autoId(doc);
    if (seen.has(id)) { skipped.push({ name: doc.name, reason: '이번 목록 안에서 중복' }); return; }
    seen.add(id);
    const prev = byId.get(id);
    if (prev?.locked) { skipped.push({ name: doc.name, reason: '운영자가 고친 대회라 그대로 둠' }); return; }
    upserts.push({ id, data: { ...doc, source: AUTO_SOURCE } });
  });

  /* 끝난 자동 대회는 지운다(운영자가 고친 것도 끝났으면 지운다 — 목록에서 이미 안 보인다).
     접수만 끝난 것은 남겨 둔다: 목록에선 안 보이지만, 사이트가 잠깐 안 열려
     못 모은 날 멀쩡한 대회가 사라졌다 생기는 일을 막는다. */
  const deletes = (existing || [])
    .filter((t) => t && t.source === AUTO_SOURCE && String(t.id || '').startsWith(AUTO_PREFIX))
    .filter((t) => { const e = lastDay(t); return e && today > e; })
    .map((t) => t.id);

  return { upserts, deletes, skipped };
}

/** 한국 날짜 'YYYY-MM-DD' — 러너는 UTC 라 02시(KST)에 돌면 UTC 로는 전날이다 */
export function seoulToday(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

export default {
  AUTO_SOURCE, AUTO_PREFIX, normDate, normSido, nameKey, sameKey, autoId,
  cleanItem, planSync, seoulToday,
};
