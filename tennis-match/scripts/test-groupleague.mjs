/* 조별리그 운영 (src/lib/groupLeague.js)
   지키려는 것
     · 기준대로 팀·조가 짜이고, 같은 타임에 한 팀이 두 경기에 들어가지 않는다
     · 조별로 코트를 나눠 따로 돌릴 수 있다
     · 순위: 승수 → 승자승 → 게임 득실 → 득게임, 그래도 같으면 공동
     · 손으로 고쳐도 이미 친 경기 결과는 지켜진다
     · 회원이 아닌 외부 참가자도 똑같이 쓴다 */
import {
  normRules, makeGuest, makeEntries, assignGroups, roundRobin, buildGroupMatches, schedule, buildLeague,
  moveEntry, swapPlayers, setGroupCourts, setScore, ensureSchedule, standings, progress, leagueQualifiers,
  scoreChoices, nameLookup, liveView,
} from '../src/lib/groupLeague.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}\n      받은 값: ${JSON.stringify(a)}\n      기대값 : ${JSON.stringify(b)}`);
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

const P = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `선수${i + 1}`, skill: 5 - i * 0.1 }));

console.log('[기준 정리]');
{
  const r = normRules({ groupCount: '0', games: 'x', play: '이상' });
  eq([r.groupCount, r.games, r.play], [1, 6, 'doubles'], '이상한 값은 기본값으로');
}

console.log('[팀 만들기]');
{
  const e = makeEntries(P(8), { teamMode: 'balanced' });
  eq(e.length, 4, '8명 → 4팀');
  eq(e[0].players, ['p1', 'p8'], '균등: 제일 잘하는 사람 + 제일 못하는 사람');
  eq(makeEntries(P(5), { play: 'singles' }).length, 5, '단식은 한 사람이 한 팀');
  const m = makeEntries(P(6), { teamMode: 'manual', pairs: [['p1', 'p2'], ['p3', 'p3'], ['p9', 'p4']] });
  ok(m.some((x) => x.players.join() === 'p1,p2'), '직접 짝 — 고른 짝 그대로');
  eq(m.flatMap((x) => x.players).sort(), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], '짝 안 된 사람도 빠짐없이');
  eq(makeEntries(P(5)).at(-1).players.length, 1, '홀수면 마지막 한 명은 혼자 남는다(운영진이 짝을 고친다)');
}

console.log('[조 나누기]');
{
  const e = makeEntries(P(16));
  const gs = assignGroups(e, { groupCount: 4, groupMethod: 'snake' });
  eq(gs.map((g) => g.entryIds.length), [2, 2, 2, 2], '8팀 4조 → 조마다 2팀');
  const avg = gs.map((g) => g.entryIds.map((id) => e.find((x) => x.id === id).skill).reduce((a, b) => a + b, 0));
  ok(Math.max(...avg) - Math.min(...avg) < 0.5, '스네이크 — 조마다 실력 합이 비슷');
  const graded = e.map((x, i) => ({ ...x, tgrade: i < 4 ? 'A' : 'B' }));
  const gg = assignGroups(graded, { groupMethod: 'grade' });
  eq(gg.map((g) => [g.grade, g.entryIds.length]), [['A', 4], ['B', 4]], '같은 등급끼리 한 조');
  eq(assignGroups(e, { groupCount: 99 }).length, 8, '조가 팀보다 많을 수 없다');
}

console.log('[풀리그 경기]');
{
  const rr = roundRobin(['a', 'b', 'c', 'd']);
  eq(rr.length, 3, '4팀 → 3라운드');
  eq(rr.flat().length, 6, '4팀 → 6경기');
  ok(rr.every((r) => new Set(r.flat()).size === r.flat().length), '한 라운드에 같은 팀이 두 번 나오지 않는다');
  eq(roundRobin(['a', 'b', 'c']).flat().length, 3, '3팀(홀수) → 3경기');
  const keys = new Set(roundRobin(['a', 'b', 'c', 'd', 'e']).flat().map((p) => [...p].sort().join()));
  eq(keys.size, 10, '5팀 → 서로 한 번씩 10경기');
}

console.log('[시간표]');
{
  const { groups } = buildLeague(P(16), { groupCount: 2 }, { courts: 3 }, rnd);
  const all = groups.flatMap((g) => g.matches);
  ok(all.every((m) => m.round >= 1 && m.court >= 1 && m.court <= 3), '모든 경기에 타임·코트');
  const bySlot = {};
  all.forEach((m) => { (bySlot[m.round] ||= []).push(m); });
  ok(Object.values(bySlot).every((ms) => {
    const ids = ms.flatMap((m) => [m.a, m.b]);
    const cs = ms.map((m) => m.court);
    return new Set(ids).size === ids.length && new Set(cs).size === cs.length;
  }), '같은 타임에 한 팀이 두 번·한 코트에 두 경기가 없다');
  const sep = setGroupCourts(setGroupCourts(groups, groups[0].id, [1], 3), groups[1].id, [2, 3], 3);
  ok(sep[0].matches.every((m) => m.court === 1), 'A조는 1코트에서만');
  ok(sep[1].matches.every((m) => [2, 3].includes(m.court)), 'B조는 2·3코트에서만');
  const old = [{ id: 'x', name: 'A조', entryIds: ['a', 'b', 'c'], matches: [{ id: 'm1', a: 'a', b: 'b', score: { a: 6, b: 2 } }] }];
  const fixed = ensureSchedule(old, 2);
  eq(fixed[0].matches.length, 3, '예전 문서도 경기를 채워 표로');
  eq(fixed[0].matches.find((m) => m.id === 'm1')?.score, { a: 6, b: 2 }, '예전 결과는 그대로');
}

console.log('[순위 — 승수 → 승자승 → 득실 → 득게임]');
{
  const g = { id: 'g', entryIds: ['a', 'b', 'c'], matches: [
    { id: '1', a: 'a', b: 'b', score: { a: 6, b: 4 } },
    { id: '2', a: 'b', b: 'c', score: { a: 6, b: 0 } },
    { id: '3', a: 'c', b: 'a', score: { a: 6, b: 5 } },
  ] };
  const st = standings(g);
  /* 셋 다 1승 1패 — 승자승도 1승씩 같음 → 득실: b +4, c -5, a +1 → b, a, c */
  eq(st.map((r) => r.id), ['b', 'a', 'c'], '세 팀 동률이면 득실차');
  eq(st.map((r) => [r.w, r.l, r.gf, r.ga]), [[1, 1, 10, 6], [1, 1, 11, 10], [1, 1, 6, 11]], '승·패·득·실');
  const h = { id: 'h', entryIds: ['a', 'b', 'c', 'd'], matches: [
    { id: '1', a: 'a', b: 'b', score: { a: 6, b: 5 } },   // a 가 b 를 이김
    { id: '2', a: 'b', b: 'c', score: { a: 6, b: 0 } },
    { id: '3', a: 'b', b: 'd', score: { a: 6, b: 0 } },
    { id: '4', a: 'a', b: 'c', score: { a: 0, b: 6 } },
    { id: '5', a: 'a', b: 'd', score: { a: 6, b: 5 } },
  ] };
  const sh = standings(h);
  eq(sh.slice(0, 2).map((r) => r.id), ['a', 'b'], '2승 동률 — 득실은 b 가 높아도 맞대결 이긴 a 가 위');
  const t = standings({ id: 't', entryIds: ['a', 'b'], matches: [{ id: '1', a: 'a', b: 'b', score: null }] });
  eq(t.map((r) => [r.rank, r.tie]), [[1, false], [1, false]], '아직 경기가 없으면 같은 순위(동률 표시는 안 함)');
  eq(progress(h), { done: 5, total: 5, finished: true }, '진행률');
  const q = leagueQualifiers([g, h], 1);
  eq(q.map((x) => x.entryId), ['b', 'a'], '조 1위들');
}

console.log('[손으로 고치기]');
{
  const built = buildLeague(P(12), { groupCount: 2 }, { courts: 2 }, rnd);
  const [g1, g2] = built.groups;
  const scored = setScore(built.groups, g1.matches[0].id, { a: 6, b: 3 });
  eq(setScore(scored, g1.matches[1].id, { a: 6, b: 6 })[0].matches[1].score, null, '동점은 결과로 받지 않는다');
  const played = g1.matches[0].a;
  ok(/옮길 수 없습니다/.test(moveEntry(scored, played, g2.id, 2).error), '경기한 팀은 조를 못 옮긴다');
  const free = g1.entryIds.find((id) => !g1.matches.slice(0, 1).some((m) => m.a === id || m.b === id));
  const mv = moveEntry(scored, free, g2.id, 2);
  eq(mv.error, '', '아직 안 친 팀은 옮긴다');
  ok(mv.groups[1].entryIds.includes(free) && !mv.groups[0].entryIds.includes(free), '조가 바뀌었다');
  eq(mv.groups[0].matches.filter((m) => m.score).length, 1, '옮겨도 이미 친 경기 결과는 남는다');
  const n = mv.groups[1].entryIds.length;
  eq(mv.groups[1].matches.length, (n * (n - 1)) / 2, '옮겨 간 조의 경기를 다시 만든다');
  const e = built.entries;
  const sw = swapPlayers(e, built.groups, e[0].players[0], e[1].players[0], (id) => id.toUpperCase());
  eq(sw.entries[0].players[0], e[1].players[0], '선수 맞바꾸기');
  ok(sw.entries[0].name.includes(e[1].players[0].toUpperCase()), '팀 이름도 바뀐다');
  const keepIds = buildGroupMatches({ id: 'x', entryIds: ['a', 'b'] }, [{ id: 'm', a: 'b', b: 'a', score: { a: 6, b: 1 } }]);
  eq(keepIds[0].score.a + keepIds[0].score.b, 7, '다시 만들어도 결과(방향 맞춰서) 유지');
}

console.log('[외부 참가자 — 외부 대회도 같은 방식]');
{
  const g = makeGuest('  홍길동 ', 'OO클럽');
  ok(g.id.startsWith('g_') && g.name === '홍길동' && g.guest, '외부 참가자 한 명');
  eq(makeGuest(''), null, '이름 없으면 만들지 않는다');
  const nameOf = nameLookup([{ id: 'm1', name: '김회원' }], [g]);
  eq([nameOf('m1'), nameOf(g.id), nameOf('x')], ['김회원', '홍길동(OO클럽)', '?'], '회원·외부 참가자 이름');
  const mixed = buildLeague([{ id: 'm1', name: '김회원', skill: 4 }, { ...g, skill: 3 }, { id: 'm2', name: '박', skill: 3.5 }, makeGuest('이', 'X')], { groupCount: 1 }, { courts: 1 });
  eq(mixed.entries.length, 2, '회원 + 외부 참가자 섞어서 팀');
}

console.log('[빠른 결과 버튼]');
eq(scoreChoices(6).map((x) => x.join(':')), ['6:0', '6:1', '6:2', '6:3', '6:4', '6:5'], '6게임 선승');
eq(scoreChoices(4).length, 4, '4게임');

console.log('[외부 공개 보기 — 필요한 것만]');
{
  const lg = buildLeague(P(8), { groupCount: 2 }, { courts: 2 }, rnd);
  const t = {
    name: '가을 오픈', date: '2026-10-10', courts: 2, rules: lg.rules, entries: lg.entries,
    groups: setScore(lg.groups, lg.groups[0].matches[0].id, { a: 6, b: 4 }), stage: 'group',
    applicants: { u1: { name: '비밀' } }, tgrades: { p1: 'A' }, guests: [{ id: 'g1', name: '외부', phone: '010' }],
  };
  const v = liveView(t, '한강클럽');
  eq([v.name, v.club, v.groups.length], ['가을 오픈', '한강클럽', 2], '대회·클럽·조');
  ok(v.groups[0].standings.every((r) => r.name && !('id' in r)), '순위는 이름으로(내부 id 없음)');
  ok(v.groups[0].matches.some((m) => m.score), '결과 포함');
  const raw = JSON.stringify(v);
  ok(!raw.includes('applicants') && !raw.includes('비밀') && !raw.includes('010') && !raw.includes('tgrade') && !/"p\d"/.test(raw),
    '신청자·전화·등급·회원 id 는 내보내지 않는다');
  eq(liveView({ entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], bracket: { rounds: [{ matches: [{ a: 'a', b: 'b', score: { a: 6, b: 2 }, winner: 'a' }] }] }, championId: 'a' }).bracket[0],
    { name: '결승', matches: [{ a: 'A', b: 'B', score: { a: 6, b: 2 }, winner: 'A' }] }, '본선 대진도 이름으로');
}

console.log(`\n조별리그 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
