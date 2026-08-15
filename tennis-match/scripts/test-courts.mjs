/* 코트 검색 데이터·필터 테스트 */
import {
  ALL_COURTS, PUBLIC_COURTS, SURFACE_FILTERS, searchCourts,
  courtSidos, courtGungus, courtDongs, courtLink, linkKind, courtRegionText,
} from '../src/lib/courtData.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗', msg); } };

console.log('[데이터 무결성]');
ok(ALL_COURTS.length > 0, '코트 목록이 비어 있지 않다');
ALL_COURTS.forEach((c) => {
  ok(!!c.sido && !!c.gungu, `${c.name}: 시/도·시군구 있음`);
  ok(!!c.name, '이름 있음');
  ok(SURFACE_FILTERS.includes(c.surface) || c.surface === '실내', `${c.name}: 표면값 유효 (${c.surface})`);
  ok(!!courtLink(c), `${c.name}: 예약 링크 있음`);
  ok(/^https:\/\//.test(courtLink(c)), `${c.name}: https 링크`);
  ok(linkKind(c) !== 'none', `${c.name}: 링크 종류 판별됨`);
});

console.log('[기관 대문으로 보내지 않는다]');
const 대문 = [/^https:\/\/www\.seoul\.go\.kr\/?$/, /^https:\/\/[^/]+\/$/];
ALL_COURTS.forEach((c) => {
  const u = courtLink(c);
  const bare = /^https:\/\/[^/]+\/?$/.test(u);
  ok(!bare || u.includes('reserve') || u.includes('res.'),
    `${c.name}: 대문 주소가 아님 (${u})`);
});

console.log('[3단계 지역 필터]');
const sidos = courtSidos();
ok(sidos.includes('서울') && sidos.includes('경기'), '서울·경기가 있다');
sidos.forEach((s) => {
  const gs = courtGungus(s);
  ok(gs.length > 0, `${s}: 시군구 목록이 있다`);
  gs.forEach((g) => {
    const inGungu = searchCourts({ sido: s, gungu: g });
    ok(inGungu.length > 0, `${s} ${g}: 결과가 있다`);
    ok(inGungu.every((c) => c.gungu === g), `${s} ${g}: 다른 구가 섞이지 않는다`);
    // 동 목록은 실제 코트가 있는 동만 — 고르면 반드시 결과가 나온다
    courtDongs(s, g).forEach((d) => {
      const r = searchCourts({ sido: s, gungu: g, dong: d });
      ok(r.length > 0, `${s} ${g} ${d}: 빈 결과가 아니다`);
    });
  });
});

console.log('[하위 단계를 안 골라도 검색된다]');
const seoulAll = searchCourts({ sido: '서울' });
const seoulGu = searchCourts({ sido: '서울', gungu: courtGungus('서울')[0] });
ok(seoulAll.length >= seoulGu.length, '시/도만 고르면 그 구보다 많거나 같다');
ok(searchCourts({}).length === ALL_COURTS.length, '아무것도 안 고르면 전체');

console.log('[코트 종류 필터]');
SURFACE_FILTERS.forEach((s) => {
  const r = searchCourts({ surfaces: [s] });
  ok(r.every((c) => c.surface === s), `${s} 필터: 다른 표면이 섞이지 않는다`);
});
const two = searchCourts({ surfaces: ['하드', '클레이'] });
ok(two.every((c) => c.surface === '하드' || c.surface === '클레이'), '복수 선택이 동작한다');
ok(two.length >= searchCourts({ surfaces: ['클레이'] }).length, '복수 선택이 더 넓다');

console.log('[지역 + 표면 동시]');
const combo = searchCourts({ sido: '경기', surfaces: ['하드'] });
ok(combo.every((c) => c.sido === '경기' && c.surface === '하드'), '두 조건이 모두 걸린다');

console.log('[이름 검색]');
ok(searchCourts({ keyword: '올림픽' }).length > 0, '올림픽 검색됨');
ok(searchCourts({ keyword: '없는코트이름zzz' }).length === 0, '없는 이름은 0건');

console.log('[지역 표기]');
ok(courtRegionText(ALL_COURTS[0]).includes(ALL_COURTS[0].sido), '지역 문자열에 시/도 포함');

console.log(`\n코트 검색 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
