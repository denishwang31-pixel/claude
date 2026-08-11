/* 대회 엔진 테스트 — `node scripts/test-tournament.mjs` */
import { readFileSync } from 'node:fs';

const load = async (rel) => {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
};
const T = await load('../src/lib/tournament.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

const mkEntries = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `팀${i + 1}`, players: [`p${i}a`, `p${i}b`], seed: null }));

/* ---- 조별리그 ---- */
{
  const entries = mkEntries(12);
  entries[0].seed = 1; entries[1].seed = 2; entries[2].seed = 3; entries[3].seed = 4;
  const groups = T.buildGroups(entries, 4);
  ok(groups.length === 4, '조 개수 4');
  const total = groups.reduce((n, g) => n + g.entryIds.length, 0);
  ok(total === 12, `전원 배정(${total}/12)`);
  // 시드 분산: 시드 1~4가 서로 다른 조에 있어야 함
  const seedGroups = ['e1', 'e2', 'e3', 'e4'].map((id) => groups.findIndex((g) => g.entryIds.includes(id)));
  ok(new Set(seedGroups).size === 4, '시드 4팀이 서로 다른 조에 분산');
  // 3팀 조의 풀리그 경기 수 = 3
  groups.forEach((g) => {
    const n = g.entryIds.length;
    ok(g.matches.length === (n * (n - 1)) / 2, `${g.name} 풀리그 경기 수`);
  });
}

/* ---- 조 순위 ---- */
{
  const entries = mkEntries(3);
  const [g] = T.buildGroups(entries, 1);
  const [X, Y, Z] = g.entryIds; // 실제 배정 순서 기준
  const setScore = (a, b, sa, sb) => {
    const m = g.matches.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    m.score = m.a === a ? { a: sa, b: sb } : { a: sb, b: sa };
  };
  setScore(X, Y, 6, 2);  // X 승
  setScore(X, Z, 6, 4);  // X 승
  setScore(Z, Y, 6, 3);  // Z 승
  const st = T.groupStandings(g);
  ok(st[0].id === X && st[0].w === 2, '조 1위 = 2승 팀');
  ok(st[1].id === Z, '2위 = 1승 팀');
  ok(st[2].id === Y && st[2].w === 0, '3위 = 0승 팀');
}

/* ---- 토너먼트 브래킷 (2의 거듭제곱) ---- */
{
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const br = T.buildBracket(ids);
  ok(br.rounds.length === 3, '8팀 → 3라운드(8강·준결·결승)');
  ok(br.rounds[0].matches.length === 4, '1라운드 4경기');
  ok(br.rounds[2].matches.length === 1, '결승 1경기');
  // 1시드(a)와 2시드(b)는 결승 전에 만나지 않아야 함 → 1라운드에서 서로 반대편
  const r1 = br.rounds[0].matches;
  const aIdx = r1.findIndex((m) => m.a === 'a' || m.b === 'a');
  const bIdx = r1.findIndex((m) => m.a === 'b' || m.b === 'b');
  ok((aIdx < 2) !== (bIdx < 2), '1·2시드가 브래킷 반대편에 배치');
  // 표준 시드: 1번은 최하위 시드와 대결
  const m0 = r1[0];
  ok((m0.a === 'a' && m0.b === 'h') || (m0.b === 'a' && m0.a === 'h'), '1시드 vs 최하위 시드');
}

/* ---- BYE 처리 (2의 거듭제곱 아님) ---- */
{
  const ids = ['a', 'b', 'c', 'd', 'e']; // 5팀 → 8강 브래킷, 3자리 BYE
  const br = T.buildBracket(ids);
  ok(br.rounds[0].matches.length === 4, '5팀 → 8강 브래킷 4경기');
  const byeWinners = br.rounds[0].matches.filter((m) => m.winner).length;
  ok(byeWinners === 3, `부전승 3경기 자동 승자 (실제 ${byeWinners})`);
  const first = br.rounds[0].matches.find((m) => m.a === 'a' || m.b === 'a');
  ok(first.winner === 'a', '1시드는 부전승');
}

/* ---- 결과 전파 ---- */
{
  const ids = ['a', 'b', 'c', 'd'];
  let br = T.buildBracket(ids);
  const m1 = br.rounds[0].matches[0], m2 = br.rounds[0].matches[1];
  br = T.applyResult(br, m1.id, 6, 3);
  br = T.applyResult(br, m2.id, 2, 6);
  const finalM = br.rounds[1].matches[0];
  ok(finalM.a === m1.a, '결승 A슬롯에 1경기 승자 전파');
  ok(finalM.b === (m2.b), '결승 B슬롯에 2경기 승자 전파');
  br = T.applyResult(br, finalM.id, 7, 5);
  ok(T.championOf(br) === finalM.a, '우승자 확정');
}

/* ---- 라운드 이름 ---- */
{
  ok(T.roundName(2, 3) === '결승', '마지막 라운드 = 결승');
  ok(T.roundName(1, 3) === '준결승', '준결승');
  ok(T.roundName(0, 3) === '8강', '8강');
}

/* ---- 자동 팀 구성 (밸런스) ---- */
{
  const players = [
    { id: 'p1', name: 'A', ntrp: 4.5 }, { id: 'p2', name: 'B', ntrp: 4.0 },
    { id: 'p3', name: 'C', ntrp: 3.0 }, { id: 'p4', name: 'D', ntrp: 2.5 },
  ];
  const teams = T.autoTeams(players, 'balanced');
  ok(teams.length === 2, '4명 → 2팀');
  const sums = teams.map((t) => t.players.map((id) => players.find((p) => p.id === id).ntrp).reduce((a, b) => a + b, 0));
  ok(Math.abs(sums[0] - sums[1]) <= 1.0, `팀 실력 균등 (합계 ${sums.join(' vs ')})`);
  const allPlayers = teams.flatMap((t) => t.players);
  ok(new Set(allPlayers).size === 4, '중복 배정 없음');
}

/* ---- NTRP 실력 그룹 배정 ---- */
{
  const mkP = (id, gender, ntrp) => ({ id, name: id, gender, ntrp });
  const players = [
    mkP('m1', 'M', 4.5), mkP('m2', 'M', 4.0), mkP('m3', 'M', 3.5), mkP('m4', 'M', 3.0),
    mkP('m5', 'M', 2.5), mkP('m6', 'M', 2.0),
    mkP('f1', 'F', 4.5), mkP('f2', 'F', 3.5), mkP('f3', 'F', 3.0), mkP('f4', 'F', 2.5),
  ];
  const groups = T.assignSkillGroups(players, [5, 5]);
  ok(groups.length === 2, '2개 그룹 생성');
  const all = groups.flatMap((g) => g.memberIds);
  ok(all.length === 10, `전원 배정 (${all.length}/10)`);
  ok(new Set(all).size === 10, '중복 배정 없음');
  // 상위 그룹의 평균 NTRP 가 하위보다 높아야 함
  const avg = (ids) => ids.map((id) => players.find((p) => p.id === id).ntrp).reduce((a, b) => a + b, 0) / ids.length;
  ok(avg(groups[0].memberIds) > avg(groups[1].memberIds),
    `A그룹이 상위 실력 (A ${avg(groups[0].memberIds).toFixed(2)} > B ${avg(groups[1].memberIds).toFixed(2)})`);
  // 남녀가 각각 실력순으로 나뉘었는지: A그룹에 최상위 남·여가 포함
  ok(groups[0].memberIds.includes('m1'), '최상위 남성은 A그룹');
  ok(groups[0].memberIds.includes('f1'), '최상위 여성은 A그룹');
  ok(groups[1].memberIds.includes('m6'), '최하위 남성은 B그룹');
  ok(groups[0].range && groups[0].range.min <= groups[0].range.max, 'A그룹 NTRP 범위 계산');

  // 정원 합이 인원과 달라도 전원 배정
  const g3 = T.assignSkillGroups(players, [3, 3, 3]);
  ok(g3.flatMap((g) => g.memberIds).length === 10, '정원 합(9) < 인원(10) 이어도 전원 배정');
  const g4 = T.assignSkillGroups(players, [8, 8]);
  ok(g4.flatMap((g) => g.memberIds).length === 10, '정원 합(16) > 인원(10) 이어도 중복 없이 배정');
  ok(new Set(g4.flatMap((g) => g.memberIds)).size === 10, '과다 정원에서도 중복 없음');

  // 수동 이동
  const moved = T.moveMemberToGroup(groups, 'm1', 1);
  ok(!moved[0].memberIds.includes('m1') && moved[1].memberIds.includes('m1'), '회원 그룹 이동');
  ok(moved.flatMap((g) => g.memberIds).length === 10, '이동 후에도 인원 유지');
}

console.log(`\n대회 엔진 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
