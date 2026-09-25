/* ============================================================
   용품 — 보여 줄 순서·검색 (화면 밖 판단)

   원포인트와 같은 틀이다: 검색창 → 가로로 넘기는 선반(새로 들어온 용품,
   카테고리마다 한 줄). 판단은 여기, 그리기는 GearScreen.
   ============================================================ */
import { GEAR_CATEGORIES, APP_NAME } from './constants.js';

export const NEWEST_COUNT = 6;
export const SHELF_MAX = 10;

export const norm = (s = '') => String(s || '').toLowerCase().replace(/\s+/g, '');

/** 방금 올린 것은 서버 시각이 비어 있다 — 가장 새것으로 본다 */
export function ms(t) {
  if (t == null) return Number.MAX_SAFE_INTEGER;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  const p = Date.parse(t);
  return Number.isNaN(p) ? 0 : p;
}
const byNew = (a, b) => ms(b.createdAt) - ms(a.createdAt);

/** 예전 카테고리 이름 → 지금 이름 */
const LEGACY_CATEGORY = { '스트링·소모품': '스트링', 악세사리: '액세서리', 보조: '보호대', 보강재료: '라켓 튜닝' };

/** 목록에 없는 카테고리로 적힌 것은 [기타]에서 보인다(예전 이름은 새 이름으로) */
export const gearCatOf = (g) => {
  const c = LEGACY_CATEGORY[g && g.category] || (g && g.category);
  return GEAR_CATEGORIES.includes(c) ? c : '기타';
};

export function gearCounts(items) {
  return GEAR_CATEGORIES
    .map((c) => ({ category: c, count: (items || []).filter((g) => gearCatOf(g) === c).length }))
    .filter((x) => x.count > 0);
}

export const inGearCategory = (items, c) =>
  (items || []).filter((g) => gearCatOf(g) === c).sort(byNew);

/**
 * 첫 화면 선반.
 * 「새로 들어온 용품」은 카테고리가 둘 이상일 때만(하나뿐이면 같은 줄이 두 번).
 */
export function gearShelves(items) {
  const all = items || [];
  if (all.length === 0) return { mode: 'empty' };
  const byCategory = GEAR_CATEGORIES
    .map((c) => {
      const list = inGearCategory(all, c);
      return { category: c, count: list.length, items: list.slice(0, SHELF_MAX) };
    })
    .filter((s) => s.count > 0);
  const newest = byCategory.length >= 2 ? [...all].sort(byNew).slice(0, NEWEST_COUNT) : [];
  return { mode: 'shelves', newest, byCategory };
}

/** 이름(3) > 설명(2) > 카테고리(1) */
export function searchGear(items, q) {
  const k = norm(q);
  if (!k) return [];
  return (items || [])
    .map((g) => ({
      g,
      score: (norm(g.title).includes(k) ? 3 : 0)
        + (norm(g.desc).includes(k) ? 2 : 0)
        + (norm(gearCatOf(g)).includes(k) ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byNew(a.g, b.g))
    .map((x) => x.g);
}

/* ============================================================
   추천 이유 — 누가 쓸 수 있나
     · 앱 관리자
     · 앱 관리자가 승인한 코치
     · 운영진이 인증한 NTRP 4.0 이상이면서 구력 5년 이상인 회원
   셀프 평가 NTRP 는 안 된다 — 스스로 4.5 라고 적고 추천을 쓰면 추천의
   뜻이 없어진다. 규칙(firestore.rules gearPicks)도 같은 기준으로 막는다.
   구력은 규칙이 연도까지만 계산할 수 있어서 여기서도 연도 차이로 센다.
   ============================================================ */
export const PICK_MIN_NTRP = 4.0;
export const PICK_MIN_YEARS = 5;
export const PICK_MAX_LEN = 120;

/** 구력(년) — 시작 연도와 올해의 차이 */
export function careerYears(startedAt, now = new Date()) {
  const y = Number(String(startedAt || '').slice(0, 4));
  if (!y || Number.isNaN(y)) return null;
  return Math.max(0, now.getFullYear() - y);
}

/**
 * 추천 이유를 쓸 수 있나, 쓴다면 어떤 이름표로.
 * @param coach   내 코치 프로필(coaches/{uid}) 또는 null
 * @param member  지금 클럽의 내 회원 문서 또는 null
 * @returns {{ ok, kind, name, ntrp?, startedAt?, clubId?, reason? }}
 */
export function pickEligibility({ isAppAdmin, coach, member, clubId, now = new Date() }) {
  if (coach && coach.status === 'approved') {
    return { ok: true, kind: 'coach', name: coach.name || '' };
  }
  const ntrp = member && member.ntrpCertified != null ? Number(member.ntrpCertified) : null;
  const years = careerYears(member && member.startedAt, now);
  if (member && clubId && ntrp != null && ntrp >= PICK_MIN_NTRP && years != null && years >= PICK_MIN_YEARS) {
    return { ok: true, kind: 'player', name: member.name || '', ntrp, startedAt: member.startedAt, clubId };
  }
  if (isAppAdmin) return { ok: true, kind: 'editor', name: APP_NAME };
  return {
    ok: false,
    reason: `승인된 코치, 또는 운영진이 인증한 NTRP ${PICK_MIN_NTRP.toFixed(1)} 이상·구력 ${PICK_MIN_YEARS}년 이상인 회원이 쓸 수 있어요.`,
  };
}

/** 추천 한 건의 이름표 — "김소라 코치" / "박준호 · NTRP 4.5 · 구력 12년" / "Court 추천" */
export function pickLabel(p, now = new Date()) {
  if (!p) return '';
  if (p.kind === 'coach') return `${p.name} 코치`;
  if (p.kind === 'player') {
    const y = careerYears(p.startedAt, now);
    return [p.name, p.ntrp != null ? `NTRP ${Number(p.ntrp).toFixed(1)}` : '', y != null ? `구력 ${y}년` : '']
      .filter(Boolean).join(' · ');
  }
  return `${APP_NAME} 추천`;
}

const KIND_ORDER = { coach: 0, player: 1, editor: 2 };
/** 상품별 추천 묶음 — 코치 먼저, 그다음 NTRP 높은 순, 같으면 먼저 쓴 순 */
export function groupPicks(picks) {
  const m = {};
  (picks || []).forEach((p) => {
    if (!p || !p.gearId || !String(p.text || '').trim()) return;
    (m[p.gearId] = m[p.gearId] || []).push(p);
  });
  Object.values(m).forEach((list) => list.sort((a, b) =>
    (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
    || (Number(b.ntrp) || 0) - (Number(a.ntrp) || 0)
    || ms(a.createdAt) - ms(b.createdAt)));
  return m;
}

/** 저장할 추천 문서(아이디 = 상품_사람) */
export function pickDoc(gearId, uid, elig, text) {
  const out = { gearId, uid, kind: elig.kind, name: elig.name, text: String(text || '').trim().slice(0, PICK_MAX_LEN) };
  if (elig.kind === 'player') Object.assign(out, { ntrp: elig.ntrp, startedAt: elig.startedAt, clubId: elig.clubId });
  return out;
}
export const pickId = (gearId, uid) => `${gearId}_${uid}`;

export const priceText = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString('ko-KR')}원` : '');

export default {
  norm, ms, gearCatOf, gearCounts, careerYears, pickEligibility, pickLabel, groupPicks, pickDoc, pickId, inGearCategory, gearShelves, searchGear, priceText,
};
