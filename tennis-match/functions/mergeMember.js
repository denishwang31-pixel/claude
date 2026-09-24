/* ============================================================
   오프라인 회원 → 앱 가입 회원 합치기 (서버 판단 — 순수 함수만)

   왜 있나
     앱이 없던 회원을 총무가 "오프라인 회원"(local:…)으로 등록해 두고
     참석·대진·점수·회비를 쌓아 왔다. 그 사람이 나중에 앱에 가입하면
     새 계정(uid)이 따로 생긴다. 그대로 두면 한 사람이 둘로 갈라져
     예전 기록이 새 계정에 안 보이고, 랭킹·회비도 둘로 나뉜다.

   어떻게 합치나
     클럽 안의 모든 기록에서 오프라인 아이디를 새 uid 로 바꿔 쓴다.
     참석(rsvp.local:…), 대진(matches 의 선수 목록), 점수, 회비 명단,
     입금자명 연결 등 **어디에 있든** 같은 방식으로 바꾼다 — 기록이 어느
     칸에 있는지 하나하나 적어 두면 새 기능이 생길 때마다 빠뜨린다.

   ⚠️ 아이디 전체가 맞을 때만 바꾼다. 'local:ab' 를 바꾸다
      'local:abc' 의 앞부분을 망가뜨리면 안 된다(아래 idRegex).
   ⚠️ 같은 칸에 두 사람 값이 다 있으면(예: 같은 모임에 둘 다 참석을 누름)
      **앱 계정 쪽을 남긴다** — 본인이 직접 누른 것이 최신이다.
   ⚠️ 날짜(Timestamp) 같은 특수 값은 건드리지 않는다.

   데이터베이스는 index.js 가 읽고 쓴다. 여기는 판단만 —
   scripts/test-merge.mjs 가 서버 없이 검사한다.
   ============================================================ */

const isOfflineId = (id) => /^local:[A-Za-z0-9_-]+$/.test(String(id || ''));

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 아이디 전체가 맞을 때만 걸리는 정규식 — 앞뒤에 아이디 글자가 붙어 있으면 다른 아이디다 */
function idRegex(from) {
  return new RegExp(`(?<![A-Za-z0-9_:-])${esc(from)}(?![A-Za-z0-9_-])`, 'g');
}

const isPlain = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/** 두 값을 합친다 — 겹치면 keep 쪽(앱 계정)을 남긴다 */
function mergeKeep(keep, other) {
  if (isPlain(keep) && isPlain(other)) {
    const out = { ...keep };
    Object.keys(other).forEach((k) => {
      out[k] = k in keep ? mergeKeep(keep[k], other[k]) : other[k];
    });
    return out;
  }
  return keep === undefined ? other : keep;
}

/**
 * 값 전체에서 from 아이디를 to 로 바꾼다.
 * @returns {{ value, changed: boolean }}
 */
function renameDeep(value, from, to) {
  const re = idRegex(from);
  let changed = false;
  const walk = (v) => {
    if (typeof v === 'string') {
      re.lastIndex = 0;
      if (!re.test(v)) return v;
      re.lastIndex = 0;
      changed = true;
      return v.replace(re, to);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (!isPlain(v)) return v;
    const out = {};
    const renamed = [];
    Object.keys(v).forEach((k) => {
      re.lastIndex = 0;
      if (re.test(k)) { renamed.push(k); return; }
      out[k] = walk(v[k]);
    });
    /* 이름이 바뀌는 칸은 나중에 — 앱 계정 쪽 칸이 먼저 자리를 잡게 */
    renamed.forEach((k) => {
      re.lastIndex = 0;
      const nk = k.replace(re, to);
      changed = true;
      const val = walk(v[k]);
      out[nk] = nk in out ? mergeKeep(out[nk], val) : val;
    });
    return out;
  };
  const out = walk(value);
  return { value: out, changed };
}

/** 회원 문서에서 옮기지 않는 칸 — 권한·연락 수단·상태는 앱 계정 것이 맞다 */
const MEMBER_SKIP = new Set([
  'role', 'roles', 'pushToken', 'email', 'uid', 'status', 'deleted', 'deletedAt',
  'mergedFrom', 'mergedAt', 'joinedAt', 'createdAt',
]);
const empty = (v) => v === undefined || v === null || v === '';

/**
 * 오프라인 회원 문서에서 앱 계정 문서로 옮겨 적을 칸.
 * 앱 계정에 이미 값이 있으면 그대로 둔다(본인이 적은 것). 비어 있는 칸만 채운다.
 * 예: 운영진 인증 NTRP, 구력, 조, 부수, 코트장 소속.
 */
function memberPatch(online, offline, offlineId) {
  const on = online || {};
  const patch = {};
  Object.keys(offline || {}).forEach((k) => {
    if (MEMBER_SKIP.has(k)) return;
    const v = offline[k];
    if (empty(v)) return;
    if (empty(on[k])) patch[k] = v;
    else if (isPlain(on[k]) && isPlain(v)) {
      const merged = mergeKeep(on[k], v);
      if (JSON.stringify(merged) !== JSON.stringify(on[k])) patch[k] = merged;
    } else if (Array.isArray(on[k]) && Array.isArray(v) && on[k].length === 0 && v.length) {
      patch[k] = v;
    }
  });
  patch.mergedFrom = [...new Set([...(on.mergedFrom || []), offlineId])];
  return patch;
}

/**
 * 합치기 요청을 받아도 되는가.
 * @returns {{ ok: true } | { ok: false, code, message }}
 */
function checkMerge({ offlineId, uid, offline, online }) {
  if (!isOfflineId(offlineId)) return { ok: false, code: 'offline', message: '오프라인 회원이 아닙니다.' };
  if (!uid || isOfflineId(uid) || /[/]/.test(uid)) return { ok: false, code: 'uid', message: '앱에 가입한 회원을 골라 주세요.' };
  if (!offline) return { ok: false, code: 'gone', message: '오프라인 회원이 이미 없습니다(합쳐졌거나 삭제됨).' };
  if (!online) return { ok: false, code: 'online', message: '앱 회원이 이 클럽에 없습니다.' };
  if (online.deleted) return { ok: false, code: 'deleted', message: '탈퇴한 회원과는 합칠 수 없습니다.' };
  return { ok: true };
}

/** 합치면서 다시 쓴 모임 문서에 남기는 표시 — 서버 알림이 이걸 보고 조용히 넘어간다 */
const MERGE_MARK = 'mergeOp';
function isMergeWrite(before, after) {
  const a = after && after[MERGE_MARK];
  const b = before && before[MERGE_MARK];
  return !!a && JSON.stringify(a) !== JSON.stringify(b || null);
}

/** 클럽 안에서 훑을 모음 — 새 모음을 만들면 여기에 더할 것 */
const CLUB_COLLECTIONS = [
  'meetings', 'members', 'fees', 'memberFees', 'polls', 'posts', 'tournaments',
  'venues', 'meta', 'duesPools', 'incomes', 'expenses', 'courts',
];

module.exports = {
  isOfflineId, idRegex, isPlain, mergeKeep, renameDeep, memberPatch, checkMerge,
  isMergeWrite, MERGE_MARK, CLUB_COLLECTIONS,
};
