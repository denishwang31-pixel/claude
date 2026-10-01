/* ============================================================
   클럽 대회 — KDK 방식 대진 (부별)

   KDK 는 팀이 고정되지 않는다. 매 경기 파트너가 바뀌고, 참가자 전원이 같은 경기
   수를 치른 뒤 개인 성적(승수 → 득실)으로 순위를 낸다. 대진표 자체는 src/lib/kdk.js
   (4~8명 조의 표준 표 + 생성기)를 그대로 쓴다. 여기서는 대회의 부(남복·여복 …)마다
   나눠 돌리고, 여러 부의 시간표를 한 코트 세트에 맞춘다.

   ⚠️ groupLeague.js 와 따로 둔 이유: groupLeague 는 서버 함수(외부 공개)로도 복사되는데
      그쪽은 kdk.js 를 갖고 있지 않다.

   저장 모양: t.kdk = { [부]: { players:[{id,name,gender}], matches:[{id,round,court,group,teamA,teamB,score}] } }
   ============================================================ */
import { generateKdk } from './kdk.js';
import { eligible, eventOf } from './groupLeague.js';

/** KDK 로 돌릴 수 있는 부 — 같은 성별 복식·자유 복식만(혼복은 남녀 짝 규칙이 따로라 아직 안 됨) */
export const kdkOk = (evKey) => {
  const ev = eventOf(evKey);
  return ev.play === 'doubles' && ev.gender !== 'X';
};

/**
 * @param roster   [{ id, name, gender, skill }]
 * @param rules    normRules 결과 — groupCount(1 이하면 인원에 맞춰 4~8명 조 자동)
 * @returns { kdk, problems }
 */
export function drawKdkAll(roster, rules, events, { courts = 2, excluded = {} } = {}) {
  const n = Math.max(1, Math.round(Number(courts) || 1));
  const problems = [];
  const divs = [];
  (events || []).forEach((k) => {
    const ev = eventOf(k);
    if (!kdkOk(k)) { problems.push(`${ev.name}: KDK 는 남복·여복·자유 복식만 됩니다(혼복·단식은 조별리그로)`); return; }
    /* 실력순으로 세워 조를 자른다 — 비슷한 실력끼리 한 조(KDK 는 조 안에서 파트너가 돌기 때문) */
    const ps = eligible(roster, k, excluded[k] || []).sort((a, b) => (Number(b.skill) || 3) - (Number(a.skill) || 3));
    if (ps.length < 4) { problems.push(`${ev.name} ${ps.length}명 — KDK 는 4명 이상 필요`); return; }
    divs.push({ k, ps });
  });
  if (!divs.length) return { kdk: {}, problems };

  /* 코트 나누기 — 여러 부에 함께 나가는 사람이 없고 코트가 부 수만큼 있으면 부마다 코트를 나눠 동시에,
     아니면 부마다 차례로(앞 부가 끝난 타임 뒤에 이어서) */
  const seen = new Map();
  const overlap = divs.some(({ k, ps }) => ps.some((p) => {
    if (seen.has(p.id) && seen.get(p.id) !== k) return true;
    seen.set(p.id, k);
    return false;
  }));
  const split = !overlap && divs.length > 1 && n >= divs.length;
  const per = split ? Math.floor(n / divs.length) : n;

  const kdk = {};
  let offset = 0;
  divs.forEach(({ k, ps }, di) => {
    const opts = Number(rules?.groupCount) > 1 ? { groupCount: Number(rules.groupCount) } : {};
    const ms = generateKdk(ps.map((p) => ({ id: p.id, name: p.name, gender: p.gender, ntrp: p.skill })), per, opts);
    const courtBase = split ? di * per : 0;
    const matches = ms.map((m) => ({
      ...m,
      id: `${k}-${m.id}`,
      round: m.round + (split ? 0 : offset),
      court: m.court + courtBase,
      div: k,
    }));
    if (!split) offset = Math.max(offset, ...matches.map((m) => m.round));
    kdk[k] = { players: ps.map((p) => ({ id: p.id, name: p.name, gender: p.gender || '' })), matches };
  });
  if (!split && divs.length > 1) problems.push('여러 부에 함께 나가는 사람이 있거나 코트가 모자라 부마다 차례로 진행합니다');
  return { kdk, problems };
}

export default { kdkOk, drawKdkAll };
