/* ============================================================
   전체 ↔ 코트장 하이어라키 — 서버 쪽 사본 (CommonJS)

   왜 사본인가
     firebase deploy 는 functions/ 만 올린다. ../src/lib 는 배포 묶음에
     들어가지 않아 서버에서 require 할 수 없다. functions/dunning.js 와
     같은 사정이다.

   ⚠️ src/lib/scope.js 와 같은 답을 내야 한다.
      scripts/test-manager.mjs 가 두 파일에 같은 입력을 넣어 매번
      대조한다. 한쪽만 고치면 깨진다.

   여기 있는 것은 서버가 실제로 쓰는 것뿐이다 — 회비 청구 단위, 대상자,
   문서 이름, 알림 켜짐 여부. 화면용 문구(FROM_LABEL 등)는 옮기지 않는다.
   ============================================================ */

const FROM = { VENUE: 'venue', CLUB: 'club', DEFAULT: 'default' };

const filled = (v) => v !== undefined && v !== null && v !== '';

function resolve(club, venue, key, fallback) {
  if (venue && filled(venue[key])) return { value: venue[key], from: FROM.VENUE };
  const c = club && club.settings ? club.settings[key] : undefined;
  if (filled(c)) return { value: c, from: FROM.CLUB };
  return { value: fallback, from: FROM.DEFAULT };
}

const FEE_SCOPE = { CLUB: 'club', VENUE: 'venue' };
const FEE_DEFAULTS = { feeAmount: 30000, feeDueDay: 10, feeAccount: '' };

function feeScopeOf(club) {
  const v = club && club.settings ? club.settings.feeScope : null;
  return v === FEE_SCOPE.VENUE ? FEE_SCOPE.VENUE : FEE_SCOPE.CLUB;
}

function feeRule(club, venue) {
  const a = resolve(club, venue, 'feeAmount', FEE_DEFAULTS.feeAmount);
  const d = resolve(club, venue, 'feeDueDay', FEE_DEFAULTS.feeDueDay);
  const c = resolve(club, venue, 'feeAccount', FEE_DEFAULTS.feeAccount);

  /* 글자가 들어오면 기본값으로, 0·음수는 1일로 — src/lib/scope.js 와 같은 규칙 */
  const rawDue = Math.round(Number(d.value));
  const dueDay = Number.isFinite(rawDue)
    ? Math.min(31, Math.max(1, rawDue))
    : FEE_DEFAULTS.feeDueDay;

  return {
    amount: Math.max(0, Math.round(Number(a.value) || 0)),
    dueDay,
    account: String(c.value || ''),
    from: { amount: a.from, dueDay: d.from, account: c.from },
  };
}

function billingScopes(club, venues) {
  const list = (venues || []).filter((v) => v && v.id);
  if (feeScopeOf(club) === FEE_SCOPE.VENUE && list.length) {
    return list.map((v) => Object.assign(
      { id: v.id, name: v.name || '이름 없는 코트장' },
      feeRule(club, v),
    ));
  }
  return [Object.assign({ id: null, name: '전체' }, feeRule(club, null))];
}

const feeDocKey = (periodKey, scopeId) =>
  (scopeId ? `${periodKey}__${scopeId}` : String(periodKey));

function membersInScope(members, scopeId) {
  const active = (members || []).filter(
    (m) => m && m.id && (!m.status || m.status === '활동'),
  );
  if (!scopeId) return active;
  return active.filter((m) => {
    const ids = m.venueIds;
    if (!Array.isArray(ids) || !ids.length) return true;
    return ids.includes(scopeId);
  });
}

/* 알림 종류 — audience/def/force 만 서버가 쓴다 */
const NOTIFY_KINDS = [
  { key: 'fee', audience: 'venue', def: true, force: false },
  { key: 'rsvp', audience: 'venue', def: true, force: false },
  { key: 'schedule', audience: 'venue', def: true, force: false },
  { key: 'draw', audience: 'venue', def: true, force: false },
  { key: 'tourney', audience: 'club', def: true, force: false },
  { key: 'guest', audience: 'club', def: false, force: false },
  { key: 'notice', audience: 'club', def: true, force: true },
];

const notifyKind = (key) => NOTIFY_KINDS.find((k) => k.key === key) || null;

function notifyRule(club, venue, key) {
  const kind = notifyKind(key);
  if (!kind) return { on: false, from: FROM.DEFAULT, force: false };
  if (kind.force) return { on: true, from: FROM.DEFAULT, force: true };

  const vmap = venue && venue.notify;
  if (vmap && typeof vmap === 'object' && key in vmap) {
    return { on: !!vmap[key], from: FROM.VENUE, force: false };
  }
  const cmap = club && club.settings && club.settings.notify;
  if (cmap && typeof cmap === 'object' && key in cmap) {
    return { on: !!cmap[key], from: FROM.CLUB, force: false };
  }
  return { on: kind.def, from: FROM.DEFAULT, force: false };
}

module.exports = {
  FROM, resolve,
  FEE_SCOPE, FEE_DEFAULTS, feeScopeOf, feeRule, billingScopes,
  feeDocKey, membersInScope,
  NOTIFY_KINDS, notifyKind, notifyRule,
};
