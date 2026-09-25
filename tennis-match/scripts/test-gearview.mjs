/* 용품 — 선반·검색 판단 검사 (src/lib/gearView.js) */
import {
  gearCatOf, gearCounts, inGearCategory, gearShelves, searchGear, priceText, ms,
  careerYears, pickEligibility, pickLabel, groupPicks, pickDoc, pickId,
} from '../src/lib/gearView.js';
import { GEAR_CATEGORIES, GEAR_CATEGORY_HINT } from '../src/lib/constants.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`);
let seq = 0;
const G = (o = {}) => ({ id: `g${++seq}`, title: `상품${seq}`, category: '라켓', desc: '', createdAt: seq, ...o });

console.log('[카테고리·노출]');
eq(gearCatOf({ category: '신발' }), '신발', '아는 카테고리');
eq(gearCatOf({ category: '모자' }), '기타', '모르는 카테고리는 기타');
eq(gearCatOf({ category: '스트링·소모품' }), '스트링', '예전 이름 스트링·소모품 → 스트링');
eq(gearCatOf({ category: '악세사리' }), '액세서리', '악세사리 → 액세서리');
eq(gearCatOf({ category: '라켓 튜닝' }), '라켓 튜닝', '새 카테고리');
ok(GEAR_CATEGORIES.every((c) => c in GEAR_CATEGORY_HINT), '모든 카테고리에 예시 문구 칸');
ok(new Set(GEAR_CATEGORIES).size === GEAR_CATEGORIES.length && GEAR_CATEGORIES[GEAR_CATEGORIES.length - 1] === '기타', '겹치지 않고 기타가 끝');
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
    G({ title: '폴리 스트링', desc: '스핀 잘 걸림', category: '스트링' }),
    G({ title: '아식스 젤 레졸루션', desc: '', category: '신발' }),
  ];
  eq(searchGear(items, '블레이드').map((g) => g.id), ['g1'], '이름');
  eq(searchGear(items, '라켓').map((g) => g.id), ['g1'], '설명·카테고리');
  eq(searchGear(items, '젤레졸루션').map((g) => g.id), ['g3'], '띄어쓰기 무시');
  eq(searchGear(items, '스핀').map((g) => g.id), ['g2'], '설명');
  eq(searchGear(items, ' '), [], '빈 검색어');
}

console.log('[추천 이유 — 누가 쓰나]');
{
  const now = new Date('2026-09-24');
  eq(careerYears('2015-03-01', now), 11, '구력은 연도 차이');
  eq(careerYears('', now), null, '구력 없음');
  const coach = pickEligibility({ coach: { status: 'approved', name: '한코치' }, now });
  eq([coach.ok, coach.kind, coach.name], [true, 'coach', '한코치'], '승인 코치');
  eq(pickEligibility({ coach: { status: 'pending', name: 'x' }, now }).ok, false, '승인 대기 코치는 못 씀');
  const pro = pickEligibility({ member: { name: '고수', ntrpCertified: 4.5, startedAt: '2012-05-01' }, clubId: 'c1', now });
  eq([pro.ok, pro.kind, pro.ntrp, pro.clubId], [true, 'player', 4.5, 'c1'], '인증 NTRP 4.5 · 구력 14년');
  eq(pickEligibility({ member: { ntrpCertified: 3.5, startedAt: '2010-01-01' }, clubId: 'c1', now }).ok, false, 'NTRP 4.0 미만');
  eq(pickEligibility({ member: { ntrpSelf: 5.0, startedAt: '2010-01-01' }, clubId: 'c1', now }).ok, false, '셀프 평가는 인정 안 함');
  eq(pickEligibility({ member: { ntrpCertified: 4.0, startedAt: '2022-01-01' }, clubId: 'c1', now }).ok, false, '구력 5년 미만');
  eq(pickEligibility({ member: { ntrpCertified: 4.0, startedAt: '2021-12-31' }, clubId: 'c1', now }).ok, true, '정확히 4.0 · 5년이면 됨');
  eq(pickEligibility({ member: { ntrpCertified: 4.5, startedAt: '2012-01-01' }, now }).ok, false, '클럽 없이는 회원 자격을 확인 못 함');
  eq(pickEligibility({ isAppAdmin: true, now }).kind, 'editor', '앱 관리자');
  eq(pickEligibility({ isAppAdmin: true, coach: { status: 'approved', name: '관리코치' }, now }).kind, 'coach', '코치이기도 하면 코치 이름표 우선');
  ok(/코치/.test(pickEligibility({ now }).reason), '못 쓰는 이유를 알려 준다');

  eq(pickLabel({ kind: 'coach', name: '한코치' }, now), '한코치 코치', '코치 이름표');
  eq(pickLabel({ kind: 'player', name: '고수', ntrp: 4.5, startedAt: '2012-05-01' }, now), '고수 · NTRP 4.5 · 구력 14년', '회원 이름표');
  eq(pickLabel({ kind: 'editor' }, now), 'Court 추천', '운영 추천');

  const g = groupPicks([
    { gearId: 'g1', kind: 'player', ntrp: 4.0, text: 'a', createdAt: 1 },
    { gearId: 'g1', kind: 'editor', text: 'b', createdAt: 0 },
    { gearId: 'g1', kind: 'player', ntrp: 4.5, text: 'c', createdAt: 2 },
    { gearId: 'g1', kind: 'coach', text: 'd', createdAt: 3 },
    { gearId: 'g2', kind: 'coach', text: '  ', createdAt: 3 },
  ]);
  eq(g.g1.map((p) => p.text), ['d', 'c', 'a', 'b'], '코치 → NTRP 높은 회원 → 운영 추천');
  eq(g.g2, undefined, '빈 추천은 안 보임');
  eq(pickId('g1', 'u1'), 'g1_u1', '문서 아이디');
  const d = pickDoc('g1', 'u1', pro, ' 가볍고 좋아요 ');
  eq([d.text, d.kind, d.ntrp, d.clubId, d.startedAt], ['가볍고 좋아요', 'player', 4.5, 'c1', '2012-05-01'], '회원 추천 문서');
  eq(pickDoc('g1', 'u1', coach, 'x'.repeat(200)).text.length, 120, '120자까지');
  eq(Object.keys(pickDoc('g1', 'u1', coach, 'a')).sort(), ['gearId', 'kind', 'name', 'text', 'uid'], '코치 추천엔 클럽 정보 없음');
}

console.log('[가격]');
eq(priceText(290000), '290,000원', '천 단위');
eq(priceText(0), '', '0원은 안 적음');
eq(priceText('abc'), '', '숫자 아님');

console.log(`\n용품 보기 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
