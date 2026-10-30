/* ============================================================
   결과 입력 — 직접 친 숫자 확인 · 타이브레이크

   2026-10-30 앱 주인: "결과 입력을 예전 대회처럼 — 점수를 고르는 게 아니라 입력하는 걸로.
   타이브레이크 여부를 체크해서 타이브레이크 점수도 입력".
   저장 모양: { a, b } 또는 { a, b, tb: { a, b } } — a·b 는 게임 수, tb 는 타이브레이크 점수.
   순위·승패는 게임 수(a·b)로만 정한다. tb 는 기록·표시용(누가 이겼는지는 게임 수와 같아야 한다).
   ⚠️ 기기 기능을 부르지 않는다(검사에서도 돈다).
   ============================================================ */
const num = (v) => {
  const s = String(v ?? '').trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  return Number(s);
};

/**
 * @param form { a, b, tbOn, tbA, tbB } — 입력칸 글자 그대로
 * @param opts { allowDraw } — 팀 대항은 무승부가 있다, 조별리그·본선은 없다
 * @returns { score } | { error }
 */
export function readScore(form, { allowDraw = false } = {}) {
  const a = num(form?.a); const b = num(form?.b);
  if (a == null || b == null) return { error: '두 팀 게임 수를 숫자로 넣어 주세요' };
  if (!allowDraw && a === b) return { error: '게임 수가 같습니다 — 이긴 쪽이 더 많아야 합니다' };
  if (!form?.tbOn) return { score: { a, b } };
  const ta = num(form.tbA); const tb = num(form.tbB);
  if (ta == null || tb == null) return { error: '타이브레이크 점수를 두 칸 모두 넣어 주세요' };
  if (ta === tb) return { error: '타이브레이크 점수가 같습니다' };
  if (Math.abs(a - b) !== 1) return { error: '타이브레이크로 끝났으면 게임 수가 한 개 차이여야 합니다(예: 6:5, 7:6)' };
  if ((a > b) !== (ta > tb)) return { error: '게임을 이긴 팀과 타이브레이크를 이긴 팀이 다릅니다' };
  return { score: { a, b, tb: { a: ta, b: tb } } };
}

/** 입력칸 처음 값 — 이미 넣은 결과가 있으면 그 값 */
export function formOf(score) {
  return {
    a: score ? String(score.a) : '',
    b: score ? String(score.b) : '',
    tbOn: !!score?.tb,
    tbA: score?.tb ? String(score.tb.a) : '',
    tbB: score?.tb ? String(score.tb.b) : '',
  };
}

/** 타이브레이크 표시 — 「(7-5)」. 없으면 빈 글자 */
export const tbText = (score) => (score?.tb ? `(${score.tb.a}-${score.tb.b})` : '');

/** 저장해도 되는 타이브레이크인지(서버·다른 화면에서 받은 값 다듬기) */
export function cleanTb(score) {
  const t = score?.tb;
  if (!t || !Number.isFinite(+t.a) || !Number.isFinite(+t.b) || +t.a === +t.b) return null;
  if ((+score.a > +score.b) !== (+t.a > +t.b)) return null;
  return { a: +t.a, b: +t.b };
}

export default { readScore, formOf, tbText, cleanTb };
