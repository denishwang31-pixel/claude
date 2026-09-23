/* ============================================================
   점수 확인 알림 — 서버 쪽 사본 (CommonJS)

   왜 사본인가
     firebase deploy 는 functions/ 폴더만 올린다. ../src/lib 는 배포
     묶음에 들어가지 않으므로 서버에서 require 할 수 없다.

   그래서 이 파일은 src/lib/scoreReport.js 의 알림 부분과 "같은 답을
   내야 한다". 말로만 같아야 한다고 적어 두면 반드시 어긋난다 — 회비
   독촉에서 이미 겪었다. scripts/test-scorereport.mjs 가 두 파일을
   모두 불러와 같은 입력에 같은 답을 내는지 매번 대조한다.
   한쪽만 고치면 테스트가 깨진다.
   ============================================================ */

const isOfflineId = (id) => {
  const s = String(id || '');
  return s.startsWith('local:') || s.startsWith('g:');
};

/** 이번 변경으로 누구에게 무엇을 알릴지. 알릴 게 없으면 null */
function scorePushPlan(before, after) {
  const op = after && after.scoreOp;
  if (!op || !op.match) return null;
  if (JSON.stringify((before && before.scoreOp) || null) === JSON.stringify(op)) return null;
  const m = ((after && after.matches) || []).find((x) => x && x.id === op.match);
  if (!m) return null;

  if (op.kind === 'report') {
    const rep = (after.scores || {})[op.match];
    if (!rep) return null;
    const team = rep.side === 'A' ? m.teamB : m.teamA;
    const to = (team || []).filter((id) => !isOfflineId(id));
    if (!to.length) return null;
    return { kind: 'report', to, match: m, a: rep.a, b: rep.b, by: rep.by };
  }
  if (op.kind === 'reject') {
    const prevRep = ((before && before.scores) || {})[op.match];
    if (!prevRep || prevRep.by === op.by || isOfflineId(prevRep.by)) return null;
    return { kind: 'reject', to: [prevRep.by], match: m, by: op.by };
  }
  return null;
}

/** 알림 문구 — 코트 번호 대신 두 팀 이름을 쓴다(앱 쪽 주석 참고) */
function scorePushText(plan, nameOf) {
  if (!plan) return null;
  const nm = (id) => (nameOf ? nameOf(id) : '') || '';
  const A = (plan.match.teamA || []).map(nm).join('·');
  const B = (plan.match.teamB || []).map(nm).join('·');
  if (plan.kind === 'report') {
    return {
      title: '🎾 점수 확인 요청',
      body: `${nm(plan.by)}님이 ${plan.match.round}타임 점수를 넣었습니다. `
        + `${A} ${plan.a} : ${plan.b} ${B} — 맞는지 확인해 주세요.`,
    };
  }
  return {
    title: '점수를 다시 넣어 주세요',
    body: `${nm(plan.by)}님이 ${plan.match.round}타임 점수가 다르다고 했습니다. (${A} vs ${B})`,
  };
}

module.exports = { isOfflineId, scorePushPlan, scorePushText };
