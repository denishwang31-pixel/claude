/* ============================================================
   등급 — 운영진이 매기는 실력 구분 두 가지, 그리고 대회 등급

   부수  회원 문서의 busu. 1부(가장 높음) ~ 5부, 오픈부. 대회 참가 자격에 쓰는
         한국 동호회의 기본 단위다. 처음 가입할 때 본인이 적은 값은 "신청값"이고,
         그 뒤로는 운영진이 매긴다(앱 주인: "NTRP 말고 1부, 2부 같은 등급").
   조    회원 문서의 grade. A(가장 높음) ~ F. 클럽 안에서 나누는 반.
   NTRP 가 없을 때 대진 실력 매칭은 조 → 부수 순으로 이 값을 쓴다.

   대회 등급  대회를 열 때 그 대회에만 매기는 등급(tournament.tgrades, tgScheme).
              클럽 부수·조와 상관없다. 표기는 부수식(1부~) 또는 조식(A~) 중 고른다.
              매긴 사람은 그 대회의 팀 짜기·그룹 나누기에서 이 등급을 실력으로 쓴다.
   ============================================================ */
import { GRADES, GRADE_SKILL, BUSU_KEYS, busuToNtrp } from './constants.js';

/** 등급 체계 — 같은 화면 부품(GradeRows)이 둘 다 그린다 */
export const SCHEMES = {
  busu: {
    key: 'busu', name: '부수', field: 'busu',
    keys: BUSU_KEYS,                              // 1부 … 5부, 오픈부
    cell: (g) => (g === '오픈부' ? '오픈' : g),
    label: (g) => g,                              // '1부'
    group: (g) => `${g} 그룹`,
    skill: (g) => busuToNtrp(g),                  // 오픈부는 null(실력 정보 아님)
    adjustable: false,
  },
  grade: {
    key: 'grade', name: '조', field: 'grade',
    keys: GRADES,                                 // A … F
    cell: (g) => g,
    label: (g) => `${g}조`,
    group: (g) => `${g}그룹`,
    skill: (g) => GRADE_SKILL[g] ?? null,
    adjustable: true,                             // 쓰는 칸 수를 줄였다 늘였다
  },
};
export const schemeOf = (k) => SCHEMES[k] || SCHEMES.busu;

export const GRADE_COUNT_MIN = 2;
export const GRADE_COUNT_DEFAULT = 4;

/** 앞에서부터 n 칸. 부수는 늘 전부(1부~5부·오픈부) */
export function keysUpTo(scheme, n) {
  const s = schemeOf(scheme);
  if (!s.adjustable) return s.keys;
  return s.keys.slice(0, Math.min(s.keys.length, Math.max(GRADE_COUNT_MIN, n || GRADE_COUNT_DEFAULT)));
}
/** 예전 이름 — 조 칸 */
export const gradesUpTo = (n) => keysUpTo('grade', n);

/** 이미 쓰고 있는 가장 낮은 칸까지는 보여야 한다(E 를 쓰는 클럽에서 A~D 만 보이면 E 인 사람이 사라진다) */
export function gradeCountFor(values, fallback = GRADE_COUNT_DEFAULT) {
  const used = (values || []).map((g) => GRADES.indexOf(g)).filter((i) => i >= 0);
  return Math.max(fallback, used.length ? Math.max(...used) + 1 : 0);
}

/** 등급별 인원 — { '1부': 3, '3부': 5, '': 12 } ('' = 미배정) */
export function gradeCounts(people, valueOf = (p) => p.grade, scheme = 'grade') {
  const keys = schemeOf(scheme).keys;
  const out = {};
  (people || []).forEach((p) => {
    const v = valueOf(p);
    const g = keys.includes(v) ? v : '';
    out[g] = (out[g] || 0) + 1;
  });
  return out;
}

/** "1부 2 · 3부 4 · 미배정 3" / "A조 1 · B조 2 · 미배정 2" */
export function gradeSummary(people, valueOf, scheme = 'grade') {
  const s = schemeOf(scheme);
  const c = gradeCounts(people, valueOf || ((p) => p[s.field]), scheme);
  const parts = s.keys.filter((g) => c[g]).map((g) => `${s.label(g)} ${c[g]}`);
  if (c['']) parts.push(`미배정 ${c['']}`);
  return parts.join(' · ');
}

/** 대회 등급을 클럽 값(부수 또는 조)으로 채우기 — 고른 사람만 */
export function fillFromClub(ids, members, scheme = 'grade') {
  const s = schemeOf(scheme);
  const byId = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const out = {};
  (ids || []).forEach((id) => {
    const v = byId[id]?.[s.field];
    if (s.keys.includes(v)) out[id] = v;
  });
  return out;
}

/** 대회에서 쓸 실력 값 — 대회 등급(실력 정보가 있으면) > NTRP > null */
export function tournamentSkill(tgrade, ntrp, scheme = 'grade') {
  const s = schemeOf(scheme);
  const fromGrade = s.keys.includes(tgrade) ? s.skill(tgrade) : null;
  if (typeof fromGrade === 'number') return fromGrade;
  return typeof ntrp === 'number' ? ntrp : null;
}

/**
 * 대회 등급별 그룹 — 1부 그룹, 2부 그룹 … (등급이 없는 사람은 맨 끝 "등급 없음")
 * assignSkillGroups 와 같은 모양: [{ name, grade, size, memberIds }]
 */
export function groupsByGrade(ids, tgrades, scheme = 'grade') {
  const s = schemeOf(scheme);
  const list = [...new Set(ids || [])];
  const groups = s.keys
    .map((g) => ({ name: s.group(g), grade: g, memberIds: list.filter((id) => tgrades?.[id] === g) }))
    .filter((g) => g.memberIds.length);
  const none = list.filter((id) => !s.keys.includes(tgrades?.[id]));
  if (none.length) groups.push({ name: '등급 없음', grade: '', memberIds: none });
  return groups.map((g) => ({ ...g, size: g.memberIds.length }));
}

export default { SCHEMES, schemeOf, keysUpTo, gradesUpTo, gradeCountFor, gradeCounts, gradeSummary, fillFromClub, tournamentSkill, groupsByGrade };
