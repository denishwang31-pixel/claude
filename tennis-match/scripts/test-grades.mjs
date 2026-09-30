/* 조(등급) — 클럽 조와 대회 등급 (src/lib/grades.js) */
import {
  gradesUpTo, gradeCountFor, gradeCounts, gradeSummary, fillFromClub, tournamentSkill, groupsByGrade,
} from '../src/lib/grades.js';
import { GRADES, GRADE_SKILL } from '../src/lib/constants.js';

let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('  ✗', m, '— 기대', JSON.stringify(b), '/ 실제', JSON.stringify(a)); } };

eq(GRADES[0], 'A', 'A 가 맨 앞(가장 높다)');
eq(GRADES.every((g) => typeof GRADE_SKILL[g] === 'number'), true, '모든 조에 실력 값');
eq(GRADES.map((g) => GRADE_SKILL[g]).every((v, i, a) => !i || v < a[i - 1]), true, '아래 조일수록 실력 값이 낮다');

eq(gradesUpTo(4), ['A', 'B', 'C', 'D'], '기본 A~D');
eq(gradesUpTo(1), ['A', 'B'], '최소 두 칸');
eq(gradesUpTo(99).length, GRADES.length, '최대는 있는 칸까지');
eq(gradeCountFor(['A', 'B']), 4, '적게 써도 기본 네 칸');
eq(gradeCountFor(['A', 'E']), 5, 'E 를 쓰면 다섯 칸 — 그 사람이 화면에서 사라지지 않게');
eq(gradeCountFor([]), 4, '아무도 없으면 기본');

const M = [{ id: 'a', grade: 'A' }, { id: 'b', grade: 'B' }, { id: 'c', grade: 'B' }, { id: 'd' }, { id: 'e', grade: 'Z' }];
eq(gradeCounts(M), { A: 1, B: 2, '': 2 }, '조별 인원 — 모르는 값은 미배정');
eq(gradeSummary(M), 'A조 1 · B조 2 · 미배정 2', '요약 한 줄');
eq(gradeSummary(M, (p) => ({ a: 'C' })[p.id], '등급'), 'C등급 1 · 미배정 4', '대회 등급 요약');

eq(fillFromClub(['a', 'b', 'd'], M), { a: 'A', b: 'B' }, '클럽 조로 채우기 — 조 없는 사람은 비운다');
eq(fillFromClub(['x'], M), {}, '없는 사람');

eq(tournamentSkill('A', 2.5), GRADE_SKILL.A, '대회 등급이 NTRP 보다 먼저');
eq(tournamentSkill('', 3.5), 3.5, '등급이 없으면 NTRP');
eq(tournamentSkill(undefined, undefined), null, '둘 다 없으면 null');

const G = groupsByGrade(['a', 'b', 'c', 'd'], { a: 'B', b: 'A', c: 'B' });
eq(G.map((g) => [g.name, g.memberIds]), [['A그룹', ['b']], ['B그룹', ['a', 'c']], ['등급 없음', ['d']]], '등급별 그룹 — A 부터, 없는 사람은 끝');
eq(G.map((g) => g.size), [1, 2, 1], '그룹 크기');
eq(groupsByGrade([], {}), [], '빈 명단');

console.log(`\n조·대회 등급 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
