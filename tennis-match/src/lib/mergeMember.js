/* ============================================================
   오프라인 회원 → 앱 가입 회원 합치기 — 앱 쪽(누구와 누구를 합칠지)

   실제로 기록을 옮기는 건 서버다(functions/mergeMember.js, onMemberJobCreated).
   여기서는 회원 명단에서 "같은 사람 같아 보이는" 짝을 찾아 권해 준다.
   ============================================================ */
export const isOfflineId = (id) => String(id || '').startsWith('local:');

const normName = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

/** 합칠 수 있는 앱 회원(가입했고, 탈퇴하지 않음) */
export const onlineMembers = (members) =>
  (members || []).filter((m) => m && m.id && !isOfflineId(m.id) && !m.deleted);

export const offlineMembers = (members) =>
  (members || []).filter((m) => m && isOfflineId(m.id) && !m.deleted);

/**
 * 이름이 같은 오프라인 회원 ↔ 앱 회원 짝.
 * ⚠️ 권하기만 한다. 동명이인이 있을 수 있어서 자동으로 합치지 않는다 —
 *    한 이름에 앱 회원이 둘 이상이면 아예 권하지 않는다(누구인지 모른다).
 */
export function mergeCandidates(members) {
  const online = onlineMembers(members);
  const byName = new Map();
  online.forEach((m) => {
    const k = normName(m.name);
    if (!k) return;
    byName.set(k, [...(byName.get(k) || []), m]);
  });
  const out = [];
  offlineMembers(members).forEach((off) => {
    const hits = byName.get(normName(off.name)) || [];
    if (hits.length === 1) out.push({ offline: off, online: hits[0] });
  });
  return out;
}

/** 확인 창 문구 */
export function mergeConfirmText(off, on) {
  return `오프라인 회원 「${off.name}」의 참석·대진·점수·회비 기록을 `
    + `앱 회원 「${on.name}」에게 옮기고, 오프라인 회원은 명단에서 지웁니다.\n`
    + '되돌릴 수 없습니다. 같은 사람이 맞는지 꼭 확인해 주세요.';
}

export default { isOfflineId, onlineMembers, offlineMembers, mergeCandidates, mergeConfirmText };
