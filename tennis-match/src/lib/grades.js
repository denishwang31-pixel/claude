/* ============================================================
   조(등급) — 클럽 조와 대회 등급

   클럽 조   회원 문서의 grade. 운영진이 회원 목록에서 매긴다(A 가 가장 높다).
             NTRP 가 없을 때 대진 실력 매칭의 기준이 된다.
   대회 등급 대회를 열 때 그 대회에만 매기는 등급(tournament.tgrades).
             클럽 조와 상관없다 — "평소엔 B조지만 이번 대회는 A부로" 같은
             일이 흔하다. 대회 등급을 매긴 사람은 그 대회의 팀 짜기·그룹
             나누기에서 NTRP 대신 이 등급을 실력으로 쓴다.
   ============================================================ */
import { GRADES, GRADE_SKILL } from './constants.js';

export const GRADE_COUNT_MIN = 2;
export const GRADE_COUNT_DEFAULT = 4;

/** 앞에서부터 n 칸 (A~D 처럼) */
export const gradesUpTo = (n) => GRADES.slice(0, Math.min(GRADES.length, Math.max(GRADE_COUNT_MIN, n || GRADE_COUNT_DEFAULT)));

/** 이미 쓰고 있는 가장 낮은 칸까지는 보여야 한다(E 를 쓰는 클럽에서 A~D 만 보이면 E 인 사람이 사라진다) */
export function gradeCountFor(values, fallback = GRADE_COUNT_DEFAULT) {
  const used = (values || []).map((g) => GRADES.indexOf(g)).filter((i) => i >= 0);
  return Math.max(fallback, used.length ? Math.max(...used) + 1 : 0);
}

/** 조별 인원 — { A: 3, B: 5, '': 12 } ('' = 미배정) */
export function gradeCounts(people, gradeOf = (p) => p.grade) {
  const out = {};
  (people || []).forEach((p) => {
    const g = GRADES.includes(gradeOf(p)) ? gradeOf(p) : '';
    out[g] = (out[g] || 0) + 1;
  });
  return out;
}

/** "A조 3 · B조 5 · 미배정 12" */
export function gradeSummary(people, gradeOf, unit = '조') {
  const c = gradeCounts(people, gradeOf);
  const parts = GRADES.filter((g) => c[g]).map((g) => `${g}${unit} ${c[g]}`);
  if (c['']) parts.push(`미배정 ${c['']}`);
  return parts.join(' · ');
}

/** 대회 등급을 클럽 조로 채우기 (고른 사람만) */
export function fillFromClub(ids, members) {
  const byId = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const out = {};
  (ids || []).forEach((id) => { if (GRADES.includes(byId[id]?.grade)) out[id] = byId[id].grade; });
  return out;
}

/** 대회에서 쓸 실력 값 — 대회 등급이 있으면 그것, 없으면 NTRP(없으면 null) */
export function tournamentSkill(tgrade, ntrp) {
  if (GRADES.includes(tgrade)) return GRADE_SKILL[tgrade];
  return typeof ntrp === 'number' ? ntrp : null;
}

/**
 * 대회 등급별 그룹 — A그룹, B그룹 … (등급이 없는 사람은 맨 끝 "등급 없음")
 * assignSkillGroups 와 같은 모양으로 돌려준다: [{ name, grade, size, memberIds }]
 */
export function groupsByGrade(ids, tgrades) {
  const list = [...new Set(ids || [])];
  const groups = GRADES
    .map((g) => ({ name: `${g}그룹`, grade: g, memberIds: list.filter((id) => tgrades?.[id] === g) }))
    .filter((g) => g.memberIds.length);
  const none = list.filter((id) => !GRADES.includes(tgrades?.[id]));
  if (none.length) groups.push({ name: '등급 없음', grade: '', memberIds: none });
  return groups.map((g) => ({ ...g, size: g.memberIds.length }));
}

export default { gradesUpTo, gradeCountFor, gradeCounts, gradeSummary, fillFromClub, tournamentSkill, groupsByGrade };
