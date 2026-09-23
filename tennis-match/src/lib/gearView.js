/* ============================================================
   용품 — 보여 줄 순서·검색 (화면 밖 판단)

   원포인트와 같은 틀이다: 검색창 → 가로로 넘기는 선반(새로 들어온 용품,
   카테고리마다 한 줄). 판단은 여기, 그리기는 GearScreen.
   ============================================================ */
import { GEAR_CATEGORIES } from './constants.js';

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

/** 목록에 없는 카테고리로 적힌 것은 [기타]에서 보인다 */
export const gearCatOf = (g) => (GEAR_CATEGORIES.includes(g && g.category) ? g.category : '기타');

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

export const priceText = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString('ko-KR')}원` : '');

export default {
  norm, ms, gearCatOf, gearCounts, inGearCategory, gearShelves, searchGear, priceText,
};
