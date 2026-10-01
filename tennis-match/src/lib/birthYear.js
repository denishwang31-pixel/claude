/* ============================================================
   출생 연도 — 연령 확인이 필요한 클럽 대회에 신청할 때만 받는다

   가입할 때는 받지 않는다(받으면 가입을 망설인다). 운영진이 대회 모집에서
   [연령 확인]을 켜 두면, 출생 연도가 없는 회원이 [참가 신청]을 누를 때
   한 번 묻는다.

   믿을 만하게 만드는 장치 두 가지(본인인증 없이)
     잠금      한 번 넣으면 본인은 못 바꾼다. 회장만 초기화한다(구력과 같은 방식).
     운영진 확인  운영진이 신분증을 보고 [확인]을 누르면 "운영진 확인" 표시가 붙는다.
               누가 언제 확인했는지 남긴다(birthYearCheckedBy · birthYearCheckedAt).
   보안 규칙도 같은 것을 막는다: 본인은 비어 있을 때만 넣을 수 있고, 확인 표시는 못 붙인다.
   ============================================================ */

export const MIN_BIRTH_YEAR = 1930;
export const MIN_AGE = 10;   // 이보다 어리면 입력 실수로 본다

/** 입력값 검사 — { year } 또는 { error } */
export function checkBirthYear(v, nowYear = new Date().getFullYear()) {
  const s = String(v ?? '').trim();
  if (!/^\d{4}$/.test(s)) return { error: '태어난 해를 숫자 네 자리로 넣어 주세요 (예: 1978)' };
  const y = Number(s);
  if (y < MIN_BIRTH_YEAR || y > nowYear - MIN_AGE) return { error: `${MIN_BIRTH_YEAR}~${nowYear - MIN_AGE} 사이로 넣어 주세요` };
  return { year: y };
}

/** 연 나이(올해 − 출생 연도). 동호인 대회 연령부는 대부분 출생 연도 기준이다 */
export const yearAge = (year, nowYear = new Date().getFullYear()) => (year ? nowYear - year : null);

/** 화면에 쓸 한 줄 상태 */
export function birthYearStatus(m, nowYear = new Date().getFullYear()) {
  const year = Number(m?.birthYear) || 0;
  if (!year) return { year: 0, checked: false, text: '미입력' };
  const checked = !!m?.birthYearCheckedAt;
  return {
    year,
    checked,
    text: `${year}년생 (올해 ${yearAge(year, nowYear)}세) · ${checked ? '운영진 확인' : '확인 전'}`,
  };
}

/** 이 대회가 출생 연도를 요구하나 */
export const needsBirthYear = (t) => !!t?.signup?.needBirthYear;

/** 신청 전에 출생 연도를 물어야 하나 */
export const mustAskBirthYear = (t, me) => needsBirthYear(t) && !(Number(me?.birthYear) > 0);

/** 운영진 확인 표시 — 회원 문서에 쓰는 값 */
export const checkPatch = (byUid, at = new Date().toISOString()) => ({ birthYearCheckedBy: byUid, birthYearCheckedAt: at });
/** 회장 초기화 — 연도와 확인 표시를 함께 지운다 */
export const resetPatch = () => ({ birthYear: 0, birthYearCheckedBy: '', birthYearCheckedAt: '' });

export default { checkBirthYear, yearAge, birthYearStatus, needsBirthYear, mustAskBirthYear, checkPatch, resetPatch };
