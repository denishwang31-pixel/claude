/* ============================================================
   전체 ↔ 코트장 — 하나의 하이어라키

   무엇을 풀려고 만들었나
     클럽이 코트장 두세 곳을 굴리기 시작하면 "클럽 하나 = 규칙 하나"가
     깨진다. 염곡은 월 3만원인데 수도공고는 코트비가 달라 2만원이고,
     화요일 염곡 사람에게 목요일 수도공고 회비 독촉이 가면 그건 스팸이다.

     그렇다고 코트장마다 전부 따로 만들면, 코트장이 하나뿐인 대다수
     클럽이 쓸데없이 두 번 설정하게 된다.

   그래서 두 층으로만 둔다 — 더 깊게 만들지 않는다
       전체(클럽)      기본값. 아무것도 안 하면 여기 값이 모두에게 적용된다.
       코트장          그 코트장만 다르게. 비워 두면 위층 값을 그대로 쓴다.

     "비워 두면 물려받는다"가 이 파일의 핵심이다. 코트장에 값을 넣는
     순간에만 갈라지고, 그 전까지는 지금까지와 완전히 똑같이 동작한다.

   ⚠️ 물려받음(inherit)과 따로 청구(separate bill)는 다른 이야기다
     회비에서 특히 조심해야 한다. 코트장 두 곳에 나가는 사람이
     "코트장 단위 회비"로 바뀌었다고 갑자기 두 배를 내면 안 된다.
     그래서 청구 단위는 클럽이 명시적으로 고른다(feeScope). 기본값은
     예전과 같은 '클럽 하나로 청구'다. 조용히 바뀌는 것은 없다.
   ============================================================ */

/* ---------- 값 물려받기 ---------- */

/** 어디서 온 값인가 — 화면에 "전체 설정을 따름"을 보여 주기 위해 남긴다 */
export const FROM = { VENUE: 'venue', CLUB: 'club', DEFAULT: 'default' };

const filled = (v) => v !== undefined && v !== null && v !== '';

/**
 * 코트장 → 클럽 → 기본값 순으로 처음 채워진 값을 찾는다.
 *
 * @param club    클럽 문서 (settings 안을 본다)
 * @param venue   코트장 문서 — null 이면 "전체" 층을 보는 것
 * @param key     settings 키 이름. 코트장 문서도 같은 이름을 쓴다.
 * @param fallback 아무 데도 없을 때
 * @returns { value, from }
 */
export function resolve(club, venue, key, fallback) {
  if (venue && filled(venue[key])) return { value: venue[key], from: FROM.VENUE };
  const c = club?.settings?.[key];
  if (filled(c)) return { value: c, from: FROM.CLUB };
  return { value: fallback, from: FROM.DEFAULT };
}

/** 이 코트장이 이 항목을 따로 정해 두었는가 (화면의 "따로 정함" 배지) */
export const overrides = (venue, key) => !!(venue && filled(venue[key]));

/** 코트장이 따로 정해 둔 항목들의 키 목록 — 설정 화면 요약용 */
export function overrideKeys(venue, keys) {
  return (keys || []).filter((k) => overrides(venue, k));
}

/* ============================================================
   회비
   ============================================================ */

/** 회비를 어느 단위로 청구하는가 */
export const FEE_SCOPE = {
  CLUB: 'club',     // 클럽 전체가 하나 (기본 — 예전과 같다)
  VENUE: 'venue',   // 코트장마다 따로 청구, 두 곳이면 두 몫
};

export const FEE_SCOPE_OPTS = [
  {
    key: FEE_SCOPE.CLUB,
    label: '클럽 하나로',
    hint: '코트장이 몇 곳이든 회비는 한 몫. 대부분의 클럽이 여기에 해당합니다.',
  },
  {
    key: FEE_SCOPE.VENUE,
    label: '코트장마다',
    hint: '코트장별로 금액·납부일을 따로 정합니다. 두 곳에 나가는 회원은 두 몫을 냅니다.',
  },
];

/** 회비 관련 설정 키 — 클럽 settings 와 코트장 문서가 같은 이름을 쓴다 */
export const FEE_KEYS = ['feeAmount', 'feeDueDay', 'feeAccount'];

export const FEE_DEFAULTS = { feeAmount: 30000, feeDueDay: 10, feeAccount: '' };

export function feeScopeOf(club) {
  return club?.settings?.feeScope === FEE_SCOPE.VENUE ? FEE_SCOPE.VENUE : FEE_SCOPE.CLUB;
}

/**
 * 한 층(전체 또는 코트장 하나)의 회비 규칙.
 * @returns { amount, dueDay, account, from: {amount, dueDay, account} }
 */
export function feeRule(club, venue) {
  const a = resolve(club, venue, 'feeAmount', FEE_DEFAULTS.feeAmount);
  const d = resolve(club, venue, 'feeDueDay', FEE_DEFAULTS.feeDueDay);
  const c = resolve(club, venue, 'feeAccount', FEE_DEFAULTS.feeAccount);
  /* 납부일은 "잘못 적은 값"과 "0"을 나눠서 다룬다.
     글자가 들어오면 무슨 뜻인지 알 수 없으니 기본값(10일)으로 돌리고,
     0이나 음수는 뜻은 분명하되 달력에 없는 날이라 1일로 당긴다.
     둘을 한 줄로 합치면(`|| 기본값`) 0을 적은 사람이 10일을 받는다. */
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

/**
 * 청구 단위 목록. 총무 화면과 자동 독촉이 이것을 하나씩 돌린다.
 *
 * ⚠️ '코트장마다'로 골라 두었는데 코트장이 하나도 없으면 전체 한 몫으로
 *    되돌린다. 안 그러면 아무에게도 청구되지 않고 아무도 그 사실을
 *    모른다 — 회비는 조용히 0이 되면 안 되는 종류의 값이다.
 */
export function billingScopes(club, venues) {
  const list = (venues || []).filter((v) => v && v.id);
  if (feeScopeOf(club) === FEE_SCOPE.VENUE && list.length) {
    return list.map((v) => ({
      id: v.id, name: v.name || '이름 없는 코트장', ...feeRule(club, v),
    }));
  }
  return [{ id: null, name: '전체', ...feeRule(club, null) }];
}

/** 청구 단위 하나를 가리키는 문서 키. 전체는 기간 그대로 — 기존 문서와 호환된다. */
export const feeDocKey = (periodKey, scopeId) => (scopeId ? `${periodKey}__${scopeId}` : String(periodKey));

/** 문서 키를 되돌린다 ('2026-08__v1' → { periodKey:'2026-08', scopeId:'v1' }) */
export function parseFeeDocKey(key) {
  const s = String(key || '');
  const at = s.indexOf('__');
  if (at < 0) return { periodKey: s, scopeId: null };
  return { periodKey: s.slice(0, at), scopeId: s.slice(at + 2) };
}

/**
 * 이 회원이 이번 기간에 내야 할 것.
 *
 * 코트장 미배정 회원
 *   '코트장마다'인데 아직 어느 코트에도 안 넣은 사람이 있다. 0원으로
 *   두면 그 사람은 영영 회비를 안 내고 아무도 눈치채지 못한다.
 *   그래서 전체 기준 한 몫을 매기고 unassigned 를 세워, 총무 화면에
 *   "코트장 배정이 필요합니다"로 걸리게 한다.
 *
 * @returns { lines:[{scopeId,name,amount,dueDay,account}], total, unassigned }
 */
export function memberBill(club, venues, member) {
  const scopes = billingScopes(club, venues);
  if (scopes.length === 1 && scopes[0].id === null) {
    return { lines: scopes, total: scopes[0].amount, unassigned: false };
  }
  const mine = Array.isArray(member?.venueIds) ? member.venueIds : [];
  const lines = scopes.filter((s) => mine.includes(s.id));
  if (!lines.length) {
    const base = { id: null, name: '전체', ...feeRule(club, null) };
    return { lines: [base], total: base.amount, unassigned: true };
  }
  return {
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    unassigned: false,
  };
}

/** 이 청구 단위에 속한 회원 (활동 중인 사람만) */
export function membersInScope(members, scopeId) {
  const active = (members || []).filter((m) => m && m.id && (!m.status || m.status === '활동'));
  if (!scopeId) return active;
  return active.filter((m) => {
    const ids = m.venueIds;
    /* 아직 배정 안 된 사람은 빼지 않는다 — 조용히 빠지면 본인도 총무도 모른다.
       scheduleView.belongsToVenue 와 같은 판단이다. */
    if (!Array.isArray(ids) || !ids.length) return true;
    return ids.includes(scopeId);
  });
}

/* ============================================================
   알림
   ============================================================ */

/**
 * 알림 종류.
 *   audience  누구에게 가는가
 *     'venue'  그 코트장 사람에게만 (일정·대진·참석)
 *     'club'   클럽 전체 (공지·대회)
 *   def       아무 설정도 없을 때의 기본값
 *   force     끌 수 없는 것 — 끄면 앱이 고장 난 것처럼 보이는 알림
 */
export const NOTIFY_KINDS = [
  {
    key: 'fee', label: '회비 안내·독촉', audience: 'venue', def: true, force: false,
    desc: '납부일 안내와 미납 알림. 미납자 본인에게만 갑니다.',
  },
  {
    key: 'rsvp', label: '참석 투표 요청', audience: 'venue', def: true, force: false,
    desc: '아직 답하지 않은 사람에게만 보냅니다.',
  },
  {
    key: 'schedule', label: '일정 변경·취소', audience: 'venue', def: true, force: false,
    desc: '우천 취소, 시간·장소 변경.',
  },
  {
    key: 'draw', label: '대진표 확정', audience: 'venue', def: true, force: false,
    desc: '그날 대진이 나오면.',
  },
  {
    key: 'tourney', label: '대회', audience: 'club', def: true, force: false,
    desc: '대회 등록 시작·마감·결과.',
  },
  {
    key: 'guest', label: '게스트 모집', audience: 'club', def: false, force: false,
    desc: '우리 클럽 모집글에 신청이 들어오면. 기본은 꺼져 있습니다.',
  },
  {
    key: 'notice', label: '공지', audience: 'club', def: true, force: true,
    desc: '운영진 공지. 끌 수 없습니다.',
  },
];

export const NOTIFY_KEYS = NOTIFY_KINDS.map((k) => k.key);

export const notifyKind = (key) => NOTIFY_KINDS.find((k) => k.key === key) || null;

/**
 * 이 알림을 이 층에서 보내는가.
 *
 * 저장 위치
 *   전체    club.settings.notify = { fee: false, ... }
 *   코트장  venue.notify        = { fee: true, ... }
 * 코트장에 그 키가 아예 없으면 위층을 따른다 — false 를 저장한 것과
 * 키가 없는 것은 다르다. 그래서 `in` 으로 본다.
 */
export function notifyRule(club, venue, key) {
  const kind = notifyKind(key);
  if (!kind) return { on: false, from: FROM.DEFAULT, force: false };
  if (kind.force) return { on: true, from: FROM.DEFAULT, force: true };

  const vmap = venue?.notify;
  if (vmap && typeof vmap === 'object' && key in vmap) {
    return { on: !!vmap[key], from: FROM.VENUE, force: false };
  }
  const cmap = club?.settings?.notify;
  if (cmap && typeof cmap === 'object' && key in cmap) {
    return { on: !!cmap[key], from: FROM.CLUB, force: false };
  }
  return { on: kind.def, from: FROM.DEFAULT, force: false };
}

/** 한 층의 모든 알림 상태 — 설정 화면이 한 번에 그린다 */
export function notifySettings(club, venue) {
  return NOTIFY_KINDS.map((k) => ({ ...k, ...notifyRule(club, venue, k.key) }));
}

/** 코트장이 전체와 다르게 정해 둔 알림 수 — 목록에 배지로 띄운다 */
export function notifyOverrideCount(club, venue) {
  return NOTIFY_KINDS.filter((k) => !k.force && notifyRule(club, venue, k.key).from === FROM.VENUE).length;
}

/**
 * 실제로 보낼 대상.
 *
 * 두 가지를 동시에 본다
 *   1. 그 알림이 그 코트장에서 켜져 있는가 (하이어라키)
 *   2. 그 사람이 그 코트장 사람인가 (범위)
 *
 * audience 가 'club' 인 알림은 코트장을 따지지 않는다. 대회·공지를
 * 코트장별로 자르면 "우리 코트는 대회 공지를 못 받았다"가 된다.
 *
 * @returns { members, reason } — 비었으면 reason 에 이유가 담긴다
 */
export function notifyTargets(key, { club, venue = null, members = [] } = {}) {
  const kind = notifyKind(key);
  if (!kind) return { members: [], reason: '알 수 없는 알림 종류입니다' };

  const rule = notifyRule(club, kind.audience === 'club' ? null : venue, key);
  if (!rule.on) {
    return {
      members: [],
      reason: rule.from === FROM.VENUE
        ? `${venue?.name || '이 코트장'}에서 ${kind.label} 알림을 꺼 두었습니다`
        : `${kind.label} 알림이 꺼져 있습니다`,
    };
  }

  const scopeId = kind.audience === 'club' ? null : (venue?.id || null);
  const list = membersInScope(members, scopeId);
  if (!list.length) return { members: [], reason: '보낼 대상이 없습니다' };
  return { members: list, reason: '' };
}

/* ============================================================
   화면에 쓰는 말
   ============================================================ */

export const FROM_LABEL = {
  [FROM.VENUE]: '이 코트장에서 따로 정함',
  [FROM.CLUB]: '전체 설정을 따름',
  [FROM.DEFAULT]: '기본값',
};

/** 청구 단위 한 줄 요약 */
export function scopeSummary(scope) {
  const won = `${Number(scope?.amount || 0).toLocaleString()}원`;
  return `${scope?.name || '전체'} · ${won} · 매월 ${scope?.dueDay || 10}일`;
}

export default {
  FROM, resolve, overrides, overrideKeys,
  FEE_SCOPE, FEE_SCOPE_OPTS, FEE_KEYS, FEE_DEFAULTS, feeScopeOf, feeRule,
  billingScopes, feeDocKey, parseFeeDocKey, memberBill, membersInScope,
  NOTIFY_KINDS, NOTIFY_KEYS, notifyKind, notifyRule, notifySettings,
  notifyOverrideCount, notifyTargets,
  FROM_LABEL, scopeSummary,
};
