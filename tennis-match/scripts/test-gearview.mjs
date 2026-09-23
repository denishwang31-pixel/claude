/* 용품 — 선반·검색 판단 검사 (src/lib/gearView.js) */
import {
  gearCatOf, gearCounts, inGearCategory, gearShelves, searchGear, priceText, ms,
} from '../src/lib/gearView.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`);
let seq = 0;
const G = (o = {}) => ({ id: `g${++seq}`, title: `상품${seq}`, category: '라켓', desc: '', createdAt: seq, ...o });

console.log('[카테고리·노출]');
eq(gearCatOf({ category: '신발' }), '신발', '아는 카테고리');
eq(gearCatOf({ category: '모자' }), '기타', '모르는 카테고리는 기타');
eq(ms(null), Number.MAX_SAFE_INTEGER, '방금 올린 상품은 가장 새것');

console.log('[선반]');
eq(gearShelves([]).mode, 'empty', '0개 = 빈 상태');
{
  seq = 0;
  const one = gearShelves([G(), G()]);
  eq([one.mode, one.newest.length, one.byCategory.length], ['shelves', 0, 1], '카테고리 하나면 새로 들어온 줄 숨김');
  const items = [G({ category: '라켓', createdAt: 1 }), G({ category: '신발', createdAt: 5 }), G({ category: '라켓', createdAt: 3 }), G({ category: '모자', createdAt: 2 })];
  const s = gearShelves(items);
  eq(s.byCategory.map((x) => x.category), ['라켓', '신발', '기타'], '카테고리 순서 · 빈 카테고리 숨김');
  eq(s.byCategory[0].items.map((g) => g.createdAt), [3, 1], '선반 안은 최신순');
  eq(s.newest.map((g) => g.createdAt), [5, 3, 2, 1], '새로 들어온 용품');
  eq(gearCounts(items).map((c) => c.count), [2, 1, 1], '카테고리별 개수');
  eq(inGearCategory(items, '기타').length, 1, '기타 모아보기');
}

console.log('[검색]');
{
  seq = 0;
  const items = [
    G({ title: '윌슨 블레이드 98', desc: '컨트롤 라켓', category: '라켓' }),
    G({ title: '폴리 스트링', desc: '스핀 잘 걸림', category: '스트링·소모품' }),
    G({ title: '아식스 젤 레졸루션', desc: '', category: '신발' }),
  ];
  eq(searchGear(items, '블레이드').map((g) => g.id), ['g1'], '이름');
  eq(searchGear(items, '라켓').map((g) => g.id), ['g1'], '설명·카테고리');
  eq(searchGear(items, '젤레졸루션').map((g) => g.id), ['g3'], '띄어쓰기 무시');
  eq(searchGear(items, '스핀').map((g) => g.id), ['g2'], '설명');
  eq(searchGear(items, ' '), [], '빈 검색어');
}

console.log('[가격]');
eq(priceText(290000), '290,000원', '천 단위');
eq(priceText(0), '', '0원은 안 적음');
eq(priceText('abc'), '', '숫자 아님');

console.log(`\n용품 보기 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
