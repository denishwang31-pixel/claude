/* 단체전(청백전·클럽교류전) + 지역·부수 유틸 검증
   실행: npm run test:team */
import {
  splitTeams, teamStrength, generateTeamMatches, teamScore, teamPlayerStats,
} from '../src/lib/teamMatch.js';
import {
  BUSU_KEYS, busuToNtrp, busuRank, TOURNAMENT_FORMATS, TEAM_SIDES, TOURNAMENT_FORMAT,
} from '../src/lib/constants.js';
import {
  SIDO_LIST, gunguOf, regionText, parseRegion, sameArea,
} from '../src/lib/regions.js';

let pass = 0; let fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; } else { fail++; console.error('  ✗', name, extra); }
};

const roster = (n, opts = {}) => Array.from({ length: n }, (_, i) => ({
  id: `p${i + 1}`,
  name: `선수${i + 1}`,
  gender: opts.allMale ? 'M' : (i % 2 ? 'F' : 'M'),
  ntrp: 2.5 + ((i % 5) * 0.5),
}));

console.log('\n[팀 나누기]');
[8, 10, 12, 16, 20, 24].forEach((n) => {
  const players = roster(n);
  const { teamA, teamB } = splitTeams(players);
  T(`${n}명 — 전원 배정`, teamA.length + teamB.length === n, `${teamA.length}+${teamB.length}`);
  T(`${n}명 — 중복 배정 없음`,
    new Set([...teamA, ...teamB].map((p) => p.id)).size === n);
  T(`${n}명 — 인원 차 1 이하`, Math.abs(teamA.length - teamB.length) <= 1,
    `${teamA.length} vs ${teamB.length}`);

  const sa = teamStrength(teamA); const sb = teamStrength(teamB);
  T(`${n}명 — 평균 실력 차 0.6 이하`, Math.abs(sa - sb) <= 0.6, `${sa} vs ${sb}`);

  // 성별도 한쪽에 쏠리지 않아야 한다
  const mA = teamA.filter((p) => p.gender === 'M').length;
  const mB = teamB.filter((p) => p.gender === 'M').length;
  T(`${n}명 — 남자 배분 차 1 이하`, Math.abs(mA - mB) <= 1, `${mA} vs ${mB}`);
  console.log(`  · ${n}명 → ${teamA.length}:${teamB.length} · 실력 ${sa} vs ${sb} · 남 ${mA} vs ${mB}`);
});

console.log('\n[단체전 대진 — 반드시 A팀 vs B팀]');
[[8, 8], [10, 6], [6, 12], [4, 4]].forEach(([na, nb]) => {
  const A = roster(na).map((p) => ({ ...p, id: `a${p.id}` }));
  const B = roster(nb).map((p) => ({ ...p, id: `b${p.id}` }));
  const ids = { a: new Set(A.map((p) => p.id)), b: new Set(B.map((p) => p.id)) };

  [1, 2, 3].forEach((courts) => {
    const ms = generateTeamMatches(A, B, courts, 4);
    T(`${na}vs${nb}/${courts}면 — 경기 생성됨`, ms.length > 0);
    T(`${na}vs${nb}/${courts}면 — teamA 는 모두 A팀`,
      ms.every((m) => m.teamA.every((id) => ids.a.has(id))));
    T(`${na}vs${nb}/${courts}면 — teamB 는 모두 B팀`,
      ms.every((m) => m.teamB.every((id) => ids.b.has(id))));
    T(`${na}vs${nb}/${courts}면 — 한 경기 4명 서로 다름`,
      ms.every((m) => new Set([...m.teamA, ...m.teamB]).size === 4));
    T(`${na}vs${nb}/${courts}면 — 코트 수 초과 없음`, (() => {
      const per = {};
      ms.forEach((m) => { per[m.round] = (per[m.round] || 0) + 1; });
      return Object.values(per).every((v) => v <= courts);
    })());
    T(`${na}vs${nb}/${courts}면 — 같은 타임 중복 출전 없음`, (() => {
      const byRound = {};
      ms.forEach((m) => { (byRound[m.round] ||= []).push(...m.teamA, ...m.teamB); });
      return Object.values(byRound).every((x) => new Set(x).size === x.length);
    })());
  });
});

console.log('\n[출전 균등]');
{
  const A = roster(8).map((p) => ({ ...p, id: `a${p.id}` }));
  const B = roster(8).map((p) => ({ ...p, id: `b${p.id}` }));
  const ms = generateTeamMatches(A, B, 2, 8);
  const played = {};
  [...A, ...B].forEach((p) => { played[p.id] = 0; });
  ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((id) => { played[id] += 1; }));
  const vals = Object.values(played);
  T('8vs8 — 출전 편차 2 이하', Math.max(...vals) - Math.min(...vals) <= 2,
    `${Math.min(...vals)}~${Math.max(...vals)}`);
  console.log(`  · 8vs8/2면/8타임 → ${ms.length}경기 · 1인 ${Math.min(...vals)}~${Math.max(...vals)}경기`);
}

console.log('\n[같은 성별끼리 옵션]');
{
  const A = roster(8); const B = roster(8).map((p) => ({ ...p, id: `b${p.id}` }));
  const ms = generateTeamMatches(A, B, 2, 4, { sameSexOnly: true });
  const mixedTeams = ms.filter((m) => {
    const g = (id) => [...A, ...B].find((p) => p.id === id)?.gender;
    return g(m.teamA[0]) !== g(m.teamA[1]) || g(m.teamB[0]) !== g(m.teamB[1]);
  });
  T('같은 성별 옵션 — 혼성 팀 없음(가능한 범위)', mixedTeams.length === 0,
    `혼성 ${mixedTeams.length}팀`);
}

console.log('\n[점수 집계]');
{
  const A = roster(4).map((p) => ({ ...p, id: `a${p.id}` }));
  const B = roster(4).map((p) => ({ ...p, id: `b${p.id}` }));
  const ms = generateTeamMatches(A, B, 1, 4);
  const scored = ms.map((m, i) => ({ ...m, score: i % 3 === 0 ? { a: 4, b: 6 } : { a: 6, b: 4 } }));
  const sc = teamScore(scored);
  T('이긴 경기 수 합계 = 전체', sc.a + sc.b === scored.length, `${sc.a}+${sc.b}/${scored.length}`);
  T('총 게임 수 집계', sc.gamesA + sc.gamesB === scored.length * 10);
  T('승자 판정', sc.winner === (sc.a > sc.b ? 'A' : sc.a < sc.b ? 'B' : null));
  T('미기록은 played 에서 제외', teamScore(ms).played === 0);

  const stats = teamPlayerStats([...A, ...B], scored);
  T('개인 기록 전원 포함', stats.length === 8);
  T('개인 승수 합 = 경기수*2', stats.reduce((s, r) => s + r.wins, 0) === scored.length * 2);
  T('정렬은 승수 내림차순', stats.every((r, i) => i === 0 || stats[i - 1].wins >= r.wins));
}

console.log('\n[예외 처리]');
T('A팀 1명 → 빈 배열', generateTeamMatches(roster(1), roster(8), 1, 4).length === 0);
T('B팀 0명 → 빈 배열', generateTeamMatches(roster(8), [], 1, 4).length === 0);
T('빈 팀 실력 = 0', teamStrength([]) === 0);
T('빈 대진 점수 = 0:0', teamScore([]).a === 0 && teamScore([]).b === 0);
T('splitTeams 빈 배열', splitTeams([]).teamA.length === 0);

console.log('\n[부수]');
T('부수 6종', BUSU_KEYS.length === 6);
T('1부가 최상위', busuRank('1부') === 0);
T('5부가 오픈부보다 위', busuRank('5부') < busuRank('오픈부'));
T('없는 부수는 최하위', busuRank('없음') === 99);
T('3부 NTRP 환산', busuToNtrp('3부') === 3.75, String(busuToNtrp('3부')));
T('오픈부는 환산 없음', busuToNtrp('오픈부') === null);
T('부수별 설명 존재', BUSU_KEYS.every((k) => busuToNtrp(k) !== undefined));

console.log('\n[대회 형식]');
/* 클럽 안에서 만드는 형식만 여기 있다 — 조별+토너먼트 · KDK · 청백전 · 팀 리그.
   클럽 교류전은 빠졌다: 두 클럽이 같이 보는 문서라 [클럽 교류전] 화면에서만
   만든다. 두 길을 다 열어 두면 옛 길로 만든 교류전은 상대가 볼 수 없다. */
T('새로 만들 수 있는 형식 4종', TOURNAMENT_FORMATS.length === 4,
  TOURNAMENT_FORMATS.map((f) => f.label).join(', '));
T('팀 리그가 목록에 있다',
  TOURNAMENT_FORMATS.some((f) => f.key === TOURNAMENT_FORMAT.TEAM_LEAGUE));
T('교류전은 대회 형식 목록에 없다',
  !TOURNAMENT_FORMATS.some((f) => f.key === TOURNAMENT_FORMAT.TEAM_CLUB));
T('청백전 팀 2개', TEAM_SIDES[TOURNAMENT_FORMAT.TEAM_BLUE_WHITE].length === 2);
/* 상수와 팀 이름은 남긴다 — 예전에 만든 교류전 기록이 아직 열려야 한다 */
T('옛 교류전 기록을 위해 상수는 남는다', !!TOURNAMENT_FORMAT.TEAM_CLUB);
T('교류전 팀 2개', TEAM_SIDES[TOURNAMENT_FORMAT.TEAM_CLUB].length === 2);
T('모든 형식에 설명', TOURNAMENT_FORMATS.every((f) => f.desc && f.label && f.icon));

console.log('\n[활동지역]');
T('시/도 17개', SIDO_LIST.length === 17, `${SIDO_LIST.length}개`);
T('모든 시/도에 하위 지역', SIDO_LIST.every((s) => gunguOf(s).length > 0));
T('경기도에 과천시', gunguOf('경기').includes('과천시'));
T('없는 시/도는 빈 배열', gunguOf('없는곳').length === 0);
T('문자열 조합', regionText('경기', '과천시') === '경기 과천시');
T('시/도만', regionText('제주', '') === '제주');
{
  const p = parseRegion('경기 과천시');
  T('파싱 — 시도', p.sido === '경기');
  T('파싱 — 시군구', p.gungu === '과천시');
}
T('빈 문자열 파싱', parseRegion('').sido === '');
T('알 수 없는 지역 파싱', parseRegion('화성행궁').sido === '');
T('같은 시/도 = 가까움', sameArea('경기 과천시', '경기 성남시') === true);
T('다른 시/도 = 멂', sameArea('경기 과천시', '서울 강남구') === false);
T('엄격 모드는 구까지 일치해야', sameArea('경기 과천시', '경기 성남시', { strict: true }) === false);
T('엄격 모드 동일 지역', sameArea('경기 과천시', '경기 과천시', { strict: true }) === true);

console.log(`\n단체전·지역·부수 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
