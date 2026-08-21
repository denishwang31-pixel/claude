/* ============================================================
   계정 삭제

   왜 필요한가
     구글·애플 모두 "앱에서 가입할 수 있으면 앱에서 지울 수도 있어야 한다"를
     심사 항목으로 강제한다. 없으면 등록이 반려된다.

   무엇을 지우고 무엇을 남기는가 — 사용자가 정한 규칙

     지운다
       · 로그인 계정 자체 (Firebase Auth)
       · users/{uid}  — 소속 클럽·프로필. 이걸 지워야 재가입해도 옛 클럽으로
         자동으로 끌려가지 않는다.
       · 연락처·푸시토큰 등 그 사람에게 다시 닿는 수단

     남긴다
       · **클럽 활동 기록에 남은 이름**. 대진표와 회비 정산은 지난 기록이고,
         이름을 지우면 "(탈퇴)"만 잔뜩 남아 그 기록을 읽을 수 없게 된다.
         남의 기록까지 망가진다. 그래서 회원 문서는 지우지 않고
         **비워서 남긴다** — 이름·성별·조는 남기고 연락 수단만 걷어낸다.

   재가입하면 어떻게 되나
     Firebase 계정을 지우면 다음에 가입할 때 **새 uid** 가 발급된다.
     회원 문서는 옛 uid 로 키가 잡혀 있으므로 새 계정과는 이어지지 않는다.
     즉 "예전 클럽과 무관하게 새로 시작"이 저절로 된다. 이것이 사용자가
     원한 동작이다.

   회장이 나가면 클럽은 어떻게 되나
     운영진 전원을 회장으로 올린다. 그 안에서 자기들끼리 정리하면 된다.
     한 명만 콕 집어 올리면 "왜 저 사람이냐"가 생기고, 아무도 안 올리면
     클럽이 통째로 잠긴다(역할을 바꿀 사람이 없어진다).
   ============================================================ */

import { ROLES, normalizeRole, memberRoles, isStaffRole } from './constants.js';

/** 회원 문서에서 걷어낼 것 — 그 사람에게 다시 닿을 수 있는 값들 */
export const WIPE_FIELDS = [
  'pushToken',   // 알림이 계속 가면 안 된다
  'phone',
  'email',
  'memo',        // 운영진이 적어 둔 개인 메모
  'birth',
  'addr',
];

/** 남기는 것 — 지난 대진표·정산을 읽으려면 있어야 한다 */
export const KEEP_FIELDS = ['name', 'gender', 'grade'];

/**
 * 탈퇴한 회원 문서는 어떤 모습이 되는가.
 * 지우지 않고 비운다 — 지우면 지난 기록의 이름이 전부 "(탈퇴)"가 된다.
 */
export function tombstone(member, now = new Date().toISOString()) {
  const out = {};
  KEEP_FIELDS.forEach((k) => { if (member?.[k] !== undefined) out[k] = member[k]; });
  return {
    ...out,
    role: ROLES.MEMBER,   // 권한은 즉시 내린다
    roles: [ROLES.MEMBER],
    status: '탈퇴',
    deleted: true,
    deletedAt: now,
  };
}

/**
 * 이 사람이 나가면 회장 자리를 어떻게 넘기는가.
 *
 * @param leavingId 나가는 사람
 * @param members   클럽 전체 회원 (나가는 사람 포함)
 * @returns {{ needed: boolean, promote: string[], reason: string, orphan: boolean }}
 *   promote 에 담긴 사람들을 회장으로 올린다. orphan 이면 올릴 사람이 없다.
 */
export function successionPlan(leavingId, members) {
  const list = (members || []).filter((m) => m && m.id);
  const leaving = list.find((m) => m.id === leavingId);
  const isPresident = leaving
    ? memberRoles(leaving).includes(ROLES.PRESIDENT)
    : false;

  /* 남는 사람 — 이미 탈퇴했거나 나가는 본인은 뺀다 */
  const rest = list.filter((m) => m.id !== leavingId && m.status !== '탈퇴' && !m.deleted);

  if (!isPresident) {
    return { needed: false, promote: [], reason: 'not-president', orphan: false };
  }

  /* 남은 회장이 또 있으면 아무것도 안 해도 된다 — 겸임을 허용하므로 흔하다 */
  const otherPresidents = rest.filter((m) => memberRoles(m).includes(ROLES.PRESIDENT));
  if (otherPresidents.length) {
    return { needed: false, promote: [], reason: 'president-remains', orphan: false };
  }

  /* 운영진 전원을 회장으로. 한 명만 고르면 "왜 저 사람이냐"가 생긴다. */
  const staff = rest.filter((m) => memberRoles(m).some(isStaffRole));
  if (staff.length) {
    return {
      needed: true,
      promote: staff.map((m) => m.id),
      reason: 'staff-promoted',
      orphan: false,
    };
  }

  /* 운영진이 아무도 없으면 남은 회원 전원에게 넘긴다.
     아무도 안 올리면 역할을 바꿀 사람이 없어 클럽이 통째로 잠긴다. */
  if (rest.length) {
    return {
      needed: true,
      promote: rest.map((m) => m.id),
      reason: 'members-promoted',
      orphan: false,
    };
  }

  /* 아무도 안 남았다 — 빈 클럽이 된다 */
  return { needed: true, promote: [], reason: 'empty-club', orphan: true };
}

/** 승계 결과를 사람 말로 — 탈퇴 확인 화면에 그대로 보여 준다 */
export function successionText(plan, nameOf = (id) => id) {
  if (!plan.needed) {
    return plan.reason === 'president-remains'
      ? '다른 회장이 있으므로 클럽 운영은 그대로 유지됩니다.'
      : '';
  }
  if (plan.orphan) {
    return '회원님이 마지막 회원입니다. 나가시면 이 클럽은 빈 클럽이 되고 검색에서도 빠집니다.';
  }
  const names = plan.promote.map(nameOf).filter(Boolean);
  const who = names.length > 3
    ? `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}명`
    : names.join(', ');
  return plan.reason === 'staff-promoted'
    ? `회원님이 유일한 회장입니다. 나가시면 운영진 ${who} 이(가) 모두 회장이 되어 클럽을 이어받습니다.`
    : `회원님이 유일한 회장이고 운영진이 없습니다. 나가시면 남은 회원 ${who} 이(가) 모두 회장이 됩니다.`;
}

/** 빈 클럽이 되면 클럽 문서에 적을 것 — 검색에서 빼고 소유자를 비운다 */
export function emptyClubPatch(now = new Date().toISOString()) {
  return { ownerId: '', searchable: false, closedAt: now, closed: true };
}

/**
 * 삭제 확인 문구 — 사용자가 정확히 이 글자를 입력해야 진행한다.
 *
 * 왜 이렇게까지 하나
 *   되돌릴 수 없다. 버튼 하나로 지워지면 실수로 지운 사람이 반드시 나온다.
 *   그때 복구해 줄 방법이 없다.
 */
export const CONFIRM_WORD = '계정 삭제';
export const confirmOk = (typed) => String(typed || '').trim() === CONFIRM_WORD;

/**
 * 지금 지울 수 있는 상태인가.
 * 회장이 나가는데 승계할 사람이 없고 클럽에 다른 회원이 남아 있다면
 * (이론상 안 생기지만) 막는다.
 */
export function deleteReady({ uid, members }) {
  const blockers = [];
  if (!uid) blockers.push('로그인이 필요합니다');
  const plan = successionPlan(uid, members);
  if (plan.needed && !plan.orphan && plan.promote.length === 0) {
    blockers.push('클럽을 넘겨받을 사람이 없습니다. 먼저 회장을 지정해 주세요');
  }
  return { ok: blockers.length === 0, blockers, plan };
}

/** 삭제 과정의 단계 — 화면이 어디까지 갔는지 보여 주는 데 쓴다 */
export const DELETE_STEPS = [
  { key: 'reauth', label: '본인 확인' },
  { key: 'succession', label: '클럽 정리' },
  { key: 'wipe', label: '개인정보 삭제' },
  { key: 'auth', label: '로그인 계정 삭제' },
];
