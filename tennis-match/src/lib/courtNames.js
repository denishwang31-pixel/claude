/* ============================================================
   코트 이름 — "1번 코트" 가 아니라 그 코트장이 실제로 부르는 이름

   무엇이 문제였나
     대진표가 코트를 1, 2, 3 으로만 불렀다. 그런데 실제 코트장은
       · A · B · C 로 부르거나
       · 9 · 10 · 11 처럼 그 코트장 전체 번호 중 우리가 빌린 것만
         떼어 쓰거나
       · 아예 "하드1", "클레이2" 처럼 바닥으로 부르기도 한다.
     코트에 서 있는 사람은 표에 적힌 "2번 코트"를 찾아 헤맨다. 표와
     현장이 다른 말을 하면 표를 안 보게 된다.

   ⚠️ 저장된 대진은 건드리지 않는다
     경기 문서의 court 는 지금도 1..N 숫자다. 여기서 바꾸는 것은
     **보여 줄 때의 이름뿐**이다. 숫자를 이름으로 바꿔 저장하면
       · 이미 쌓인 대진·전적이 전부 어긋나고
       · 편성 엔진(1..N 으로 자리를 센다)을 통째로 고쳐야 하며
       · 나중에 이름을 또 바꾸면 옛 기록이 다시 깨진다.
     이름은 언제든 바뀔 수 있는 것이라 **기록이 아니라 표시**에 둔다.

   ⚠️ 이 파일은 네이티브를 부르지 않는다 — node 검사가 전부 돌려 본다.
   ============================================================ */

/** 이름을 안 정했을 때 쓰는 기본 이름 */
export const defaultCourtName = (n) => String(n);

/**
 * 저장된 이름 목록을 면수에 맞춰 정리한다.
 *
 * ⚠️ 면수가 줄면 뒤를 자르고, 늘면 기본 이름으로 채운다. 그러지 않으면
 *    "3면 → 2면" 으로 줄였을 때 쓰지도 않는 세 번째 이름이 남아 있다가,
 *    나중에 다시 3면으로 늘리면 예전 이름이 되살아난다. 그건 고친
 *    기억이 없는 값이 나타나는 것이라 이상하게 느껴진다.
 *
 * 빈 칸은 기본 이름으로 채운다 — 이름 없는 코트가 표에 빈칸으로
 * 나오면 그 자리가 고장 난 것처럼 보인다.
 */
export function normalizeCourtNames(names, courts) {
  const n = Math.max(0, Math.floor(Number(courts) || 0));
  const src = Array.isArray(names) ? names : [];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const v = String(src[i] ?? '').trim();
    out.push(v || defaultCourtName(i + 1));
  }
  return out;
}

/**
 * 이 코트장에서 쓰는 이름 목록.
 *
 * 코트장 문서에 courtNames 가 없으면(지금까지의 모든 클럽) 1..N 을
 * 돌려준다 — 예전과 똑같이 보인다.
 */
export const courtNamesOf = (venue) =>
  normalizeCourtNames(venue?.courtNames, venue?.courts);

/**
 * 경기 문서의 court(1..N)를 보여 줄 이름으로 바꾼다.
 *
 * ⚠️ 모르는 번호가 오면 숫자를 그대로 돌려준다. 코트장을 지웠거나
 *    면수를 줄인 뒤의 옛 대진에서 실제로 일어난다. 그때 빈 문자열을
 *    돌려주면 표에 빈칸이 생겨 "대진이 깨졌다"로 보인다.
 */
export function courtLabel(venue, court) {
  const i = Math.floor(Number(court) || 0);
  if (i < 1) return String(court ?? '');
  const names = courtNamesOf(venue);
  return names[i - 1] || defaultCourtName(i);
}

/**
 * 이름을 따로 정했는가 — 기본값(1,2,3…)과 다른 것이 하나라도 있는가.
 * 화면이 "코트 이름을 정해 두면 표에 그대로 나옵니다" 안내를 띄울지
 * 정하는 데 쓴다.
 */
export const hasCustomNames = (venue) =>
  courtNamesOf(venue).some((name, i) => name !== defaultCourtName(i + 1));

/**
 * 저장하기 전에 다듬는다.
 *
 * ⚠️ 같은 이름이 둘 있으면 안 된다. "A, A, C" 로 저장되면 표에서 두
 *    코트가 같은 이름으로 나와, 어느 코트로 가야 하는지 알 수 없다.
 *    화면에서 막되 저장 직전에도 한 번 본다.
 */
export function courtNameProblems(names, courts) {
  const list = normalizeCourtNames(names, courts);
  const seen = new Map();
  const dupes = [];
  list.forEach((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) { if (!dupes.includes(name)) dupes.push(name); }
    else seen.set(key, true);
  });
  const problems = [];
  if (dupes.length) problems.push(`같은 이름이 있습니다: ${dupes.join(', ')}`);
  const tooLong = list.filter((n) => n.length > 8);
  if (tooLong.length) problems.push(`이름이 너무 깁니다(8자 이내): ${tooLong.join(', ')}`);
  return problems;
}

export default {
  defaultCourtName, normalizeCourtNames, courtNamesOf, courtLabel,
  hasCustomNames, courtNameProblems,
};
