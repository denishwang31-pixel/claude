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

/**
 * 아직 명단(오프라인 기록)과 이어지지 않은 앱 회원 — 이름이 명단과 달라 자동 짝(mergeCandidates)에 안 잡힌 사람.
 * 2026-10-05 앱 주인: 회원이 초대코드로 가입했는데 내 목록에서 안 보인다 — 명단엔 실명, 가입은 다른 이름("예스욱")이었다.
 * 합친 적이 있으면(mergedFrom) 빼고, 이름이 같은 짝이 이미 있으면(위 칸에서 처리) 뺀다. 보는 사람 자신도 뺀다.
 */
export function unlinkedOnline(members, me = '') {
  const paired = new Set(mergeCandidates(members).map((c) => c.online.id));
  const hasOffline = offlineMembers(members).length > 0;
  if (!hasOffline) return [];
  return onlineMembers(members)
    .filter((m) => m.id !== me && !(m.mergedFrom || []).length && !paired.has(m.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

/** 회원 목록 순서·검색 — 이름 가나다순(예전엔 저장 순서라 새 회원이 중간에 섞여 못 찾았다) */
export function sortMembers(members, q = '') {
  const key = normName(q);
  return [...(members || [])]
    .filter((m) => !key || normName(m.name).includes(key))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

export default { isOfflineId, onlineMembers, offlineMembers, mergeCandidates, mergeConfirmText, unlinkedOnline, sortMembers };
