/* 샘플 팀 리그 넣기 (scripts/league-sample.cjs) — 가짜 이름으로만 검사한다 */
import { createRequire } from 'node:module';
import { leagueStandings } from '../src/lib/teamLeague.js';
const require = createRequire(import.meta.url);
const L = require('./league-sample.cjs');
let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };

const P = (team, sport, ids) => ({ team, sport, players: ids.map((i) => `선수${i}`), player_ids: ids.map((i) => `p${i}`), preference_claims: [{ requester: 'x', rank: 1 }] });
const src = { kind: 'kunnbledun_schedule', schedule: [
  { round: 1, time: '08:30-09:00', court: 'A', sport: 'WD', pair_a: P('백팀', 'WD', [1, 2]), pair_b: P('홍팀', 'WD', [3, 4]) },
  { round: 1, time: '08:30-09:00', court: 'B', sport: 'XD', pair_a: P('백팀', 'XD', [5, 1]), pair_b: P('홍팀', 'XD', [6, 3]) },
  { round: 2, time: '09:00-09:30', court: 'A', sport: 'MD', pair_a: P('청팀', 'MD', [7, 8]), pair_b: P('백팀', 'MD', [5, 9]) },
  { round: 2, time: '09:00-09:30', court: 'B', sport: 'XD', pair_a: P('청팀', 'XD', [7, 10]), pair_b: P('홍팀', 'XD', [6, 4]) },
] };
const rows = L.slim(src);
ok(!JSON.stringify(rows).includes('preference'), '짝 희망 같은 건 버린다');
const b = L.toLeague(rows);
ok(b.stats.teams.map((t) => t.from).join() === '청팀,홍팀,백팀', '색이 맞게 청(A·파랑) → 홍(B·빨강) → 백(C·초록)');
ok(b.stats.players === 10 && b.stats.matches === 4 && b.stats.rounds === 2 && b.stats.courts === 2, '숫자');
const g = Object.fromEntries(b.roster.map((p) => [p.id, p.gender]));
ok(g.p1 === 'F' && g.p5 === 'M' && g.p6 === 'M' && g.p10 === 'F', '성별: 여복·남복에서 읽고, 혼복만 뛴 사람은 짝의 반대');
const m = b.league.matches;
ok(m[0].id === 'lg-1-1' && m[1].court === 2 && m[1].typeKey === 'MX' && m[1].type === '혼복', '코트 A·B → 1·2, 혼복 = MX');
ok(m.every((x) => x.teamAIdx >= 0 && x.teamBIdx >= 0 && x.score === null && x.league === true), '앱 팀 리그 경기 모양');
ok(b.league.config.courts === 2 && b.league.config.rounds === 2 && b.league.config.roundTimes[2] === '09:00-09:30', '설정·시간');
const scored = m.map((x, i) => ({ ...x, score: i % 2 ? { a: 6, b: 3 } : { a: 2, b: 6 } }));
const st = leagueStandings(b.league.teams, scored);
ok(st.length === 3 && st.reduce((s, r) => s + r.wins, 0) === 4, '앱의 순위 계산이 그대로 돈다');

const box = L.encrypt({ rows }, 'k3y-테스트');
ok(!JSON.stringify(box).includes('선수'), '암호화한 파일에 이름이 보이지 않는다');
ok(JSON.stringify(L.decrypt(box, 'k3y-테스트').rows) === JSON.stringify(rows), '같은 열쇠로 그대로 풀린다');
let bad = false; try { L.decrypt(box, 'wrong'); } catch (e) { bad = true; }
ok(bad, '틀린 열쇠로는 안 풀린다');

const srcTxt = require('node:fs').readFileSync(new URL('./league-sample.cjs', import.meta.url), 'utf8');
ok(/sample === true/.test(srcTxt) && /sampleKey/.test(srcTxt), '지울 때는 sample 표시 + sampleKey 가 맞는 문서만');
ok(!/members'\)|collection\('members/.test(srcTxt), '회원 문서는 건드리지 않는다');

console.log(`\n샘플 대회 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
