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
  scoreChoices, nameLookup, liveView, kdkTables, setKdkScore,
  eligible, drawAll, redrawDivision, playersOfFn, addTeam, removeTeam, partialPairs, replacePlayer, divRules, advanceOf, bracketPlan, leagueChampions,
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
  /* 사다리 그림용 — 부마다 라운드 구조 그대로, 이긴 쪽은 a/b 로 */
  const es = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), div: 'MD' }));
  const kv = liveView({ entries: es, events: ['MD'], ko: { MD: { championId: null, bracket: { rounds: [
    { matches: [{ id: 'r0m0', a: 'a', b: 'b', score: { a: 6, b: 1 }, winner: 'a' }, { id: 'r0m1', a: 'c', b: 'd', score: null, winner: null }] },
    { matches: [{ id: 'r1m0', a: 'a', b: null, score: null, winner: null }] },
  ] } } } });
  eq(kv.kos.length, 1, '부 하나 = 사다리 하나');
  eq([kv.kos[0].name, kv.kos[0].rounds.map((r) => r.name)], ['남자복식', ['준결승', '결승']], '부 이름·라운드 이름');
  eq(kv.kos[0].rounds[0].matches.map((m) => m.winner), ['a', ''], '이긴 쪽 a/b');
  ok(!JSON.stringify(kv.kos).includes('r0m0'), '경기 id 는 내보내지 않는다');
}

console.log('[종목(부) — 남복·여복 따로, 혼복은 남녀 한 명씩]');
{
  const R = [
    ...Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, name: `남${i}`, gender: 'M', skill: 4 - i * 0.1 })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, name: `여${i}`, gender: 'F', skill: 3.5 - i * 0.1 })),
  ];
  eq([eligible(R, 'MD').length, eligible(R, 'WD').length, eligible(R, 'XD').length, eligible(R, 'MD', ['m0']).length], [9, 8, 17, 8], '부별 참가자 · 뺀 사람 제외');
  const d = drawAll(R, { groupCount: 2 }, ['MD', 'WD', 'XD'], { courts: 4 }, rnd);
  const byDiv = (k) => d.entries.filter((e) => e.div === k);
  eq([byDiv('MD').length, byDiv('WD').length, byDiv('XD').length], [4, 4, 8], '남복 4팀(1명 빠짐) · 여복 4팀 · 혼복 8팀(남 1명 빠짐)');
  ok(byDiv('MD').every((e) => e.players.every((p) => p.startsWith('m'))), '남복은 남자끼리');
  ok(byDiv('XD').every((e) => e.players.some((p) => p.startsWith('m')) && e.players.some((p) => p.startsWith('f'))), '혼복은 남녀 한 명씩');
  ok(d.problems.some((x) => /남자복식: 짝이 없어 빠진 사람/.test(x)), '짝 없는 사람은 빼고 알린다');
  ok(d.groups.every((g) => g.div && g.entryIds.every((id) => d.entries.find((e) => e.id === id).div === g.div)), '조는 부 안에서만');
  const po = playersOfFn(d.entries);
  const slots = {};
  d.groups.flatMap((g) => g.matches).forEach((m) => { (slots[m.round] ||= []).push(m); });
  ok(Object.values(slots).every((ms) => { const ps = ms.flatMap((m) => [...po(m.a), ...po(m.b)]); return new Set(ps).size === ps.length; }),
    '남복과 혼복에 다 나가는 사람도 같은 타임에 두 코트에 서지 않는다');
  ok(/여자복식 0명/.test(drawAll(R.filter((p) => p.gender === 'M'), {}, ['WD']).problems[0]), '그 부에 사람이 없으면 알린다');

  const t = { entries: d.entries, groups: setScore(d.groups, d.groups.find((g) => g.div === 'WD').matches[0].id, { a: 6, b: 1 }) };
  const re = redrawDivision(t, 'MD', R, { groupCount: 1 }, { courts: 4 }, rnd);
  eq(re.groups.filter((g) => g.div === 'MD').length, 1, '남복만 다시 짬(1개 조)');
  ok(re.groups.filter((g) => g.div === 'WD').some((g) => g.matches.some((m) => m.score)), '다른 부 결과는 그대로');

  const wd = t.groups.find((g) => g.div === 'MD');
  const add = addTeam(t.entries, t.groups, { div: 'MD', players: ['m8', 'm7'], groupId: wd.id });
  ok(/이미 이 부의/.test(add.error) || add.error === '', '부 안에 이미 있는 사람은 못 넣는다(또는 빠진 사람이면 들어간다)');
  const out = d.entries.filter((e) => e.div === 'MD').flatMap((e) => e.players);
  const left = eligible(R, 'MD').map((p) => p.id).find((id) => !out.includes(id));
  const add2 = addTeam(t.entries, t.groups, { div: 'MD', players: [left], groupId: wd.id, nameOf: (id) => id });
  eq(add2.error, '', '빠진 사람을 조에 넣기');
  const g2 = add2.groups.find((g) => g.id === wd.id);
  eq(g2.matches.length, (g2.entryIds.length * (g2.entryIds.length - 1)) / 2, '넣은 조의 경기를 다시 만든다');
  const rm = removeTeam(add2.entries, add2.groups, add2.entries.at(-1).id);
  eq(rm.groups.find((g) => g.id === wd.id).entryIds.length, wd.entryIds.length, '팀 빼기');
  const scoredEntry = t.groups.find((g) => g.div === 'WD').matches[0].a;
  ok(/뺄 수 없습니다/.test(removeTeam(t.entries, t.groups, scoredEntry).error), '경기한 팀은 못 뺀다');

  const v = liveView({ name: 'x', entries: d.entries, groups: d.groups, events: ['MD', 'WD'], ko: {} });
  ok(v.groups.some((g) => g.name.startsWith('남자복식 ')) && v.groups.some((g) => g.name.startsWith('여자복식 ')), '외부 공개에도 부 이름');
}

console.log('[팀당 경기 수 — 부분 리그]');
{
  const cnt = (pairs, ids) => ids.map((id) => pairs.filter(([a, b]) => a === id || b === id).length);
  const ids6 = ['a', 'b', 'c', 'd', 'e', 'f'];
  const p6 = partialPairs(ids6, 3);
  eq(cnt(p6, ids6), [3, 3, 3, 3, 3, 3], '6팀 팀당 3경기 — 모두 3경기');
  eq(new Set(p6.map(([a, b]) => [a, b].sort().join())).size, p6.length, '같은 짝 두 번 없음');
  ok(p6.some(([a, b]) => [a, b].sort().join() === 'a,f'), '첫 라운드는 1위 ↔ 꼴찌(실력순 조에서 강약이 섞인다)');
  const ids5 = ['a', 'b', 'c', 'd', 'e'];
  const c5 = cnt(partialPairs(ids5, 3), ids5);
  ok(c5.filter((x) => x === 3).length >= 4 && c5.every((x) => x >= 2 && x <= 4), '5팀 팀당 3경기 — 홀수라 한 팀만 하나 다르다(15÷2 불가)');
  const ids8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  eq(cnt(partialPairs(ids8, 3), ids8), [3, 3, 3, 3, 3, 3, 3, 3], '8팀 팀당 3경기');
  eq(partialPairs(ids5, 0).length, 10, '0 이면 풀리그(5팀 10경기)');
  eq(partialPairs(ids5, 9).length, 10, '팀 수보다 크면 풀리그');
  ok(partialPairs(ids6, 2, [['b', 'e']]).some(([a, b]) => [a, b].sort().join() === 'b,e'), '이미 친 짝은 다시 짜도 남는다');

  const g = { id: 'g', entryIds: ids6, perTeam: 3 };
  eq(buildGroupMatches(g).length, 9, '조에 perTeam 3 → 6팀 9경기');
  const lg = buildLeague(P(12), { groupCount: 1, perTeam: 3 }, { courts: 2 }, rnd);
  eq(lg.groups[0].matches.length, 9, '기준에 팀당 3경기 → 그대로 반영');
  const mv = moveEntry([{ ...lg.groups[0] }, { id: 'g2', name: 'B조', entryIds: [], matches: [], perTeam: 3 }], lg.groups[0].entryIds[0], 'g2', 2);
  eq(mv.groups[0].matches.length, 7, '조를 옮겨 다시 짜도 팀당 경기 수 유지(5팀 × 3 ÷ 2 → 7경기, 한 팀만 2경기)');

  const un = { id: 'u', entryIds: ['a', 'b', 'c'], matches: [
    { id: '1', a: 'a', b: 'b', score: { a: 6, b: 1 } }, { id: '2', a: 'a', b: 'c', score: { a: 1, b: 6 } },
    { id: '3', a: 'b', b: 'c', score: null }, { id: '4', a: 'c', b: 'x', score: null },
  ] };
  ok(standings(un).length === 3, '경기 수가 다른 조도 순위를 낸다(승률)');
}

console.log('[KDK 방식 — 부별, 파트너가 매 경기 바뀜]');
{
  const { drawKdkAll, kdkOk } = await import('../src/lib/tournamentKdk.js');
  const R2 = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `남${i}`, gender: 'M', skill: 4 - i * 0.1 })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: `여${i}`, gender: 'F', skill: 3.5 - i * 0.1 })),
  ];
  eq([kdkOk('MD'), kdkOk('OD'), kdkOk('XD'), kdkOk('MS')], [true, true, false, false], 'KDK 는 남복·여복·자유 복식만');
  const r = drawKdkAll(R2, { groupCount: 1 }, ['MD', 'WD'], { courts: 4 });
  ok(r.kdk.MD.matches.length > 0 && r.kdk.WD.matches.length > 0, '남복·여복 각각 KDK 대진');
  const per = (ms, id) => ms.filter((m) => [...m.teamA, ...m.teamB].includes(id)).length;
  const mdGames = r.kdk.MD.players.map((p) => per(r.kdk.MD.matches, p.id));
  ok(new Set(mdGames).size === 1, '한 부 안 전원 같은 경기 수');
  ok(r.kdk.MD.matches.every((m) => m.court <= 2) && r.kdk.WD.matches.every((m) => m.court >= 3), '겹치는 사람이 없으면 부마다 코트를 나눠 동시에');
  const all = [...r.kdk.MD.matches, ...r.kdk.WD.matches];
  eq(new Set(all.map((m) => m.id)).size, all.length, '경기 id 가 부끼리 겹치지 않는다');
  const r2 = drawKdkAll(R2, {}, ['MD', 'OD'], { courts: 4 });
  const mdMax = Math.max(...r2.kdk.MD.matches.map((m) => m.round));
  ok(r2.kdk.OD.matches.every((m) => m.round > mdMax), '여러 부에 함께 나가는 사람이 있으면 부마다 차례로');
  ok(r2.problems.some((x) => /차례로/.test(x)), '차례로 진행한다고 알린다');
  ok(/KDK 는 남복/.test(drawKdkAll(R2, {}, ['XD']).problems[0]), '혼복은 KDK 안 됨 안내');

  /* 개인 순위 — 이긴 쪽 두 사람 모두 1승 */
  const m0 = r.kdk.MD.matches[0];
  const k2 = setKdkScore(r.kdk, 'MD', m0.id, { a: 6, b: 2 });
  eq(r.kdk.MD.matches[0].score, null, '결과 넣기는 원본을 바꾸지 않는다');
  const tb = kdkTables(k2.MD);
  const rowOf = (id) => tb.flatMap((g) => g.standings).find((x) => x.id === id);
  ok(m0.teamA.every((id) => rowOf(id).w === 1 && rowOf(id).diff === 4), '이긴 두 사람 1승 +4');
  ok(m0.teamB.every((id) => rowOf(id).l === 1 && rowOf(id).diff === -4), '진 두 사람 1패 -4');
  eq(tb.flatMap((g) => g.standings)[0].rank, 1, '1위부터');
  eq(tb.reduce((s, g) => s + g.progress.done, 0), 1, '진행 1경기');
  const g2 = kdkTables(drawKdkAll(R2, { groupCount: 2 }, ['MD'], { courts: 2 }).kdk.MD);
  eq(g2.map((g) => g.name), ['A조', 'B조'], '조 두 개면 A조·B조');
  /* 외부 공개 보기에 KDK 순위 — 이름만, id 없이 */
  const lv = liveView({ name: '대회', kdk: k2, events: ['MD', 'WD'] });
  ok(lv.groups.some((g) => /KDK/.test(g.name) && g.standings.length > 0), '공개 보기에 KDK 순위');
  ok(!JSON.stringify(lv).includes('"m0"'), '공개 보기에 회원 id 없음');
  ok(lv.groups[0].matches[0].a.includes('·'), '공개 시간표 — 두 사람 이름');
}

console.log('[선수 바꾸기 — 대진 밖 사람 넣기 · 다른 팀과 맞바꾸기]');
{
  const es = [{ id: 'e1', players: ['a', 'b'], name: 'a / b' }, { id: 'e2', players: ['c', 'd'], name: 'c / d' }];
  const gs = [{ id: 'g1', entryIds: ['e1', 'e2'], matches: [{ id: 'm1', a: 'e1', b: 'e2', score: null }] }];
  const r1 = replacePlayer(es, gs, 'b', 'x');
  eq(r1.entries[0].players, ['a', 'x'], '대진 밖 사람으로 바꾸기');
  eq(r1.entries[0].name, 'a / x', '팀 이름도 바뀐다');
  const r2 = replacePlayer(es, gs, 'b', 'c');
  eq([r2.entries[0].players, r2.entries[1].players], [['a', 'c'], ['b', 'd']], '다른 팀 선수와 맞바꾸기');
  ok(/같은 팀/.test(replacePlayer(es, gs, 'a', 'b').error), '같은 팀끼리는 안내');
  const played = [{ ...gs[0], matches: [{ id: 'm1', a: 'e1', b: 'e2', score: { a: 6, b: 3 } }] }];
  ok(/경기를 한 팀/.test(replacePlayer(es, played, 'b', 'x').error), '경기한 팀은 못 바꾼다');
}

console.log('[부·조마다 본선 진출 수 · 조별리그만]');
{
  const r = normRules({ groupCount: 2, advance: 4, byDiv: { WD: { advance: '2' }, MD: { groupCount: '', advance: '' } }, groupAdvance: { gB: '3', gX: '' } });
  eq(r.byDiv, { WD: { advance: 2 } }, '빈칸은 버리고 숫자만 남긴다');
  eq(r.groupAdvance, { gB: 3 }, '조별 지정도 숫자만');
  eq([divRules(r, 'MD').advance, divRules(r, 'WD').advance, divRules(r, 'WD').groupCount], [4, 2, 2], '부별 진출 수');
  eq([advanceOf(r, { id: 'gA', div: 'MD' }), advanceOf(r, { id: 'gB', div: 'MD' }), advanceOf(r, { id: 'gC', div: 'WD' })], [4, 3, 2], '조별 > 부별 > 기본');
  eq(advanceOf({ ...r, knockout: false }, { id: 'gB', div: 'MD' }), 0, '조별리그만이면 진출 0');
  eq([bracketPlan(8), bracketPlan(6), bracketPlan(7)].map((x) => [x.size, x.byes]), [[8, 0], [8, 2], [8, 1]], '본선 크기·부전승');
  /* 남자 30명(15팀) 2개 조 4팀씩, 여자 12명(6팀) 2개 조 2팀씩 */
  const R = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, name: `남${i}`, gender: 'M', skill: 4 - i * 0.02 })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, name: `여${i}`, gender: 'F', skill: 3.5 - i * 0.02 })),
  ];
  const rules = normRules({ groupCount: 2, advance: 4, byDiv: { WD: { advance: 2 } } });
  const d = drawAll(R, rules, ['MD', 'WD'], { courts: 6 }, rnd);
  const gs = (k) => d.groups.filter((g) => g.div === k);
  eq([gs('MD').length, gs('WD').length], [2, 2], '부마다 2개 조');
  const qM = leagueQualifiers(gs('MD'), (g) => advanceOf(rules, g));
  const qW = leagueQualifiers(gs('WD'), (g) => advanceOf(rules, g));
  eq([qM.length, qW.length], [8, 4], '남자부 8팀·여자부 4팀 본선');
  const r3 = normRules({ ...rules, groupAdvance: { [gs('MD')[1].id]: 3 } });
  eq(leagueQualifiers(gs('MD'), (g) => advanceOf(r3, g)).length, 7, 'B조만 3팀 진출 → 7팀(부전승 1)');
  const d2 = drawAll(R, normRules({ groupCount: 2, byDiv: { WD: { groupCount: 1 } } }), ['MD', 'WD'], { courts: 6 }, rnd);
  eq(d2.groups.filter((g) => g.div === 'WD').length, 1, '부별 조 개수(여자부 1개 조)');
  /* 조별리그만 — 끝난 조의 1위 */
  let wg = d2.groups.filter((g) => g.div === 'WD');
  wg = wg.map((g) => ({ ...g, matches: g.matches.map((m) => ({ ...m, score: { a: 6, b: 2 } })) }));
  const tl = { rules: { knockout: false }, groups: [...d2.groups.filter((g) => g.div === 'MD'), ...wg], entries: d2.entries, events: ['MD', 'WD'] };
  const ch = leagueChampions(tl);
  eq([ch.length, ch[0].div, ch[0].groupName], [1, 'WD', ''], '끝난 부만, 조 하나면 조 이름 없이 우승');
  eq(leagueChampions({ ...tl, rules: {} }).length, 0, '본선이 있는 대회는 조 1위를 우승으로 치지 않는다');
  const lv = liveView({ ...tl, name: 'x' });
  ok(lv.champion.includes('여자복식') && lv.groups.every((g) => g.advance === 0), '공개 보기 — 조별리그만 우승·진출 표시 없음');
}

console.log(`\n조별리그 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
