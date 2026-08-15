/* KDK 대진 검증
   실행: npm run test:kdk

   확인 항목
     1. 표준 표(5~8명)가 KDK 성질을 지키는가 — 파트너 중복 0, 경기 수 균등
     2. 표가 없는 인원(9~24명)도 성질을 지키는가
     3. 한 타임에 같은 사람이 두 코트에 들어가지 않는가
     4. 순위 계산(승수 → 득실차)이 맞는가
*/
import {
  generateKdk, kdkStandings, kdkQuality, kdkPlan, KDK_TABLES, hasKdkTable, splitKdkGroups,
} from '../src/lib/kdk.js';

let pass = 0; let fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; } else { fail++; console.error('  ✗', name, extra); }
};

const roster = (n) => Array.from({ length: n }, (_, i) => ({
  id: `p${i + 1}`, name: `선수${i + 1}`, gender: i % 2 ? 'F' : 'M',
}));

console.log('\n[조 나누기 — 어떤 인원이든 4~8명 조로 떨어져야 한다]');
for (let n = 4; n <= 48; n++) {
  const sizes = splitKdkGroups(n);
  T(`${n}명 — 합계 일치`, sizes.reduce((a, b) => a + b, 0) === n, `${sizes}`);
  T(`${n}명 — 모든 조가 4~8명`, sizes.every((s) => s >= 4 && s <= 8), `${sizes}`);
  T(`${n}명 — 모든 조에 표 존재`, sizes.every((s) => hasKdkTable(s)), `${sizes}`);
  T(`${n}명 — 조 크기 편차 1 이하`, Math.max(...sizes) - Math.min(...sizes) <= 1, `${sizes}`);
}
[[9, [5, 4]], [12, [6, 6]], [16, [8, 8]], [20, [7, 7, 6]], [24, [8, 8, 8]]].forEach(([n, want]) => {
  T(`${n}명 → ${want.join('+')}`, JSON.stringify(splitKdkGroups(n)) === JSON.stringify(want),
    `실제 ${splitKdkGroups(n)}`);
});
T('3명 이하 → 조 없음', splitKdkGroups(3).length === 0);
console.log(`  · 9명 ${splitKdkGroups(9)} · 12명 ${splitKdkGroups(12)} · 20명 ${splitKdkGroups(20)} · 30명 ${splitKdkGroups(30)}`);

console.log('\n[표준 표 (4~8명)]');
[4, 5, 6, 7, 8].forEach((n) => {
  const players = roster(n);
  const ms = generateKdk(players, 2);
  const q = kdkQuality(players, ms);
  const plan = kdkPlan(n);

  T(`${n}명 — 표 존재`, hasKdkTable(n));
  T(`${n}명 — 경기 수 = ${plan.matches}`, ms.length === KDK_TABLES[n].length,
    `실제 ${ms.length}`);
  T(`${n}명 — 파트너 중복 0`, q.repeatedPartners === 0, `중복 ${q.repeatedPartners}`);
  T(`${n}명 — 전원 경기 수 동일`, q.minGames === q.maxGames,
    `${q.minGames}~${q.maxGames}`);
  T(`${n}명 — 모든 경기 4명`, ms.every((m) => m.teamA.length === 2 && m.teamB.length === 2));
  T(`${n}명 — 팀 내 중복 없음`, ms.every((m) => {
    const four = [...m.teamA, ...m.teamB];
    return new Set(four).size === 4;
  }));
  console.log(`  · ${n}명 → ${ms.length}경기 · 1인 ${q.minGames}경기 · 파트너중복 ${q.repeatedPartners} · 상대중복 ${q.repeatedOpponents}`);
});

console.log('\n[여러 조 운영 (9~48명)]');
for (let n = 9; n <= 48; n++) {
  const players = roster(n);
  const ms = generateKdk(players, 4);
  const q = kdkQuality(players, ms);
  T(`${n}명 — 경기 생성됨`, ms.length > 0);
  T(`${n}명 — 경기 수 편차 1 이하`, q.even, `${q.minGames}~${q.maxGames}`);
  T(`${n}명 — 파트너 중복 0`, q.repeatedPartners === 0, `중복 ${q.repeatedPartners}`);
  T(`${n}명 — 팀 내 중복 없음`, ms.every((m) => new Set([...m.teamA, ...m.teamB]).size === 4));
  // 조가 섞이지 않아야 한다 — 한 경기의 4명은 모두 같은 조
  const groupsOf = {};
  ms.forEach((m) => { [...m.teamA, ...m.teamB].forEach((id) => { (groupsOf[id] ||= new Set()).add(m.group); }); });
  T(`${n}명 — 한 사람은 한 조에만`, Object.values(groupsOf).every((s) => s.size === 1));
  if ([9, 12, 16, 20, 24].includes(n)) {
    const gs = [...new Set(ms.map((m) => m.group))].length;
    console.log(`  · ${n}명 → ${gs}개 조 · ${ms.length}경기 · 1인 ${q.minGames}경기 · 파트너중복 ${q.repeatedPartners}`);
  }
}

console.log('\n[타임 배치 — 같은 타임 중복 출전 금지]');
[5, 8, 12, 16, 20].forEach((n) => {
  [1, 2, 3, 4].forEach((courts) => {
    const players = roster(n);
    const ms = generateKdk(players, courts);
    const byRound = {};
    ms.forEach((m) => { (byRound[m.round] ||= []).push(...m.teamA, ...m.teamB); });
    const ok = Object.values(byRound).every((ids) => new Set(ids).size === ids.length);
    T(`${n}명/${courts}면 — 같은 타임 중복 없음`, ok);

    const perRound = {};
    ms.forEach((m) => { perRound[m.round] = (perRound[m.round] || 0) + 1; });
    T(`${n}명/${courts}면 — 코트 수 초과 없음`,
      Object.values(perRound).every((v) => v <= courts));
    // 코트 번호가 1..courts 안에 있는지
    T(`${n}명/${courts}면 — 코트 번호 유효`, ms.every((m) => m.court >= 1 && m.court <= courts));
  });
});

console.log('\n[경기 유형 판정]');
{
  const men = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `남${i}`, gender: 'M' }));
  const ms = generateKdk(men, 2);
  T('전원 남자 → 남복', ms.every((m) => m.type === '남복'));

  const women = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, name: `여${i}`, gender: 'F' }));
  T('전원 여자 → 여복', generateKdk(women, 2).every((m) => m.type === '여복'));
}

console.log('\n[순위 계산]');
{
  const players = roster(5);
  const ms = generateKdk(players, 1);
  // p1 이 뛴 경기는 전부 이기게, 나머지는 앞팀 승
  const scored = ms.map((m) => {
    const aHasP1 = m.teamA.includes('p1');
    const bHasP1 = m.teamB.includes('p1');
    if (aHasP1) return { ...m, score: { a: 6, b: 2 } };
    if (bHasP1) return { ...m, score: { a: 2, b: 6 } };
    return { ...m, score: { a: 6, b: 4 } };
  });
  const table = kdkStandings(players, scored);
  T('전승자가 1위', table[0].id === 'p1', `1위=${table[0].id}`);
  T('전승자 승수 = 경기수', table[0].wins === table[0].games,
    `${table[0].wins}/${table[0].games}`);
  T('득실차 계산', table[0].diff === table[0].gf - table[0].ga);
  T('전원 순위표 포함', table.length === 5);

  // 스코어 없는 경기는 집계 제외
  const partial = kdkStandings(players, ms);
  T('미기록 경기는 집계 제외', partial.every((r) => r.games === 0));
}

console.log('\n[경기 수 직접 지정]');
{
  const players = roster(8);
  const ms = generateKdk(players, 2, { matches: 12 });
  T('지정한 경기 수만큼 생성', ms.length === 12, `실제 ${ms.length}`);
  const q = kdkQuality(players, ms);
  T('경기 수 편차 1 이하', q.even, `${q.minGames}~${q.maxGames}`);
}

console.log('\n[예외 처리]');
T('3명 이하 → 빈 배열', generateKdk(roster(3), 1).length === 0);
T('0명 → 빈 배열', generateKdk([], 1).length === 0);
T('4명 미만 kdkPlan → null', kdkPlan(3) === null);

console.log(`\nKDK 대진 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
