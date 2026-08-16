/* ============================================================
   회비 독촉 — 총무의 감정노동을 앱이 대신 진다.

   총무가 그만두는 이유 1위는 대진표가 아니라 "돈 얘기 하는 게 싫어서"다.
   형·동생·선배한테 "형, 회비요..." 라고 보내는 그 순간을 없애는 것이
   이 파일의 전부다.

   지켜야 할 규칙 — 어기면 오히려 클럽 분위기를 망친다
     1. 발신자는 총무 개인이 아니라 앱이다. 문구에 총무 이름을 넣지 않는다.
     2. 미납자에게 개별로만 간다. 단체방에 미납 명단을 뿌리지 않는다.
     3. 미납 현황은 본인에게만 보인다. 다른 회원의 납부 여부는 알 수 없다.
        (명예훼손 소지 + 분위기 파탄)
     4. 마지막 단계(D+10)는 자동으로 나가지 않는다. 총무가 확인하고 보낸다.
     5. 같은 단계는 한 번만. 중복 발송은 독촉이 아니라 괴롭힘이다.
   ============================================================ */

/** 독촉 단계 — 납부 기한(dueDay) 기준 경과일 */
export const DUN_STAGE = {
  PRE: 'pre',       // D-3  전체 안내 (아직 미납이 아니다)
  FIRST: 'first',   // D+1  미납자 개별 (조용히)
  SECOND: 'second', // D+5  2차 + 총무에게 요약
  FINAL: 'final',   // D+10 총무가 확인 후 발송
};

export const DUN_STAGES = [
  {
    key: DUN_STAGE.PRE,
    offset: -3,
    label: '사전 안내',
    audience: 'all',
    auto: true,
    desc: '납부일 3일 전, 전체에게 한 번',
  },
  {
    key: DUN_STAGE.FIRST,
    offset: 1,
    label: '1차 알림',
    audience: 'unpaid',
    auto: true,
    desc: '기한 다음 날, 미납자에게만 조용히',
  },
  {
    key: DUN_STAGE.SECOND,
    offset: 5,
    label: '2차 알림',
    audience: 'unpaid',
    auto: true,
    desc: '5일 경과, 미납자 + 총무에게 요약',
  },
  {
    key: DUN_STAGE.FINAL,
    offset: 10,
    label: '최종 안내',
    audience: 'unpaid',
    auto: false,               // 사람이 확인하고 보낸다
    desc: '10일 경과, 총무가 확인 후 직접 발송',
  },
];

const pad = (n) => String(n).padStart(2, '0');

/** 그 달의 마지막 날 (dueDay 가 31인데 2월이면 28/29로 맞춘다) */
const lastDayOf = (year, month) => new Date(year, month, 0).getDate();

/**
 * 납부 기한 날짜. monthKey='2026-08', dueDay=10 → '2026-08-10'
 * 연납(monthKey='2026')이면 그 해 1월 기준으로 본다.
 */
export function dueDateOf(monthKey, dueDay = 10) {
  const [y, m] = String(monthKey || '').split('-');
  const year = Number(y) || new Date().getFullYear();
  const month = Number(m) || 1;
  const day = Math.min(Math.max(1, dueDay), lastDayOf(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 날짜 문자열 차이(일). b - a */
export function daysBetween(a, b) {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2 - d1) / 86400000);
}

/**
 * 오늘 보내야 할 단계를 고른다.
 * @returns 단계 객체 또는 null (보낼 것이 없는 날)
 */
export function stageFor(monthKey, today, dueDay = 10) {
  const due = dueDateOf(monthKey, dueDay);
  const elapsed = daysBetween(due, today);
  return DUN_STAGES.find((s) => s.offset === elapsed) || null;
}

/** 미납자 목록 — 활동 중인 회원만. 휴면·탈퇴는 독촉하지 않는다. */
export function unpaidMembers(members, paidMap = {}) {
  return members.filter((m) => {
    const active = !m.status || m.status === '활동';
    return active && !paidMap[m.id];
  });
}

/**
 * 발송 대상. 규칙 2·3을 여기서 강제한다 —
 * audience 가 'unpaid' 면 미납자 본인에게만 간다.
 */
export function recipientsFor(stage, members, paidMap = {}) {
  if (!stage) return [];
  if (stage.audience === 'all') {
    return members.filter((m) => !m.status || m.status === '활동');
  }
  return unpaidMembers(members, paidMap);
}

/** '2026-08' → '8월' / '2026' → '2026년' */
export const periodLabel = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  return m ? `${Number(m)}월` : `${y}년`;
};

const won = (n) => `${Number(n || 0).toLocaleString()}원`;

/**
 * 알림 문구. 총무 이름은 절대 넣지 않는다 (규칙 1).
 * 담백하게 — 미안함이나 압박을 담지 않는 것이 핵심이다.
 */
export function messageFor(stage, { clubName, monthKey, amount, dueDate, account }) {
  const p = periodLabel(monthKey);
  const acc = account ? `\n입금: ${account}` : '';
  const club = clubName || '클럽';

  switch (stage?.key) {
    case DUN_STAGE.PRE:
      return {
        title: `${club} ${p} 회비 안내`,
        body: `${p} 회비 ${won(amount)} 납부일은 ${dueDate}입니다.${acc}`,
      };
    case DUN_STAGE.FIRST:
      return {
        title: `${club} ${p} 회비`,
        body: `${p} 회비 ${won(amount)}가 아직 확인되지 않았습니다.${acc}`,
      };
    case DUN_STAGE.SECOND:
      return {
        title: `${club} ${p} 회비 미납`,
        body: `${p} 회비 ${won(amount)}가 미납 상태입니다. 납부 후에는 자동으로 확인됩니다.${acc}`,
      };
    case DUN_STAGE.FINAL:
      return {
        title: `${club} ${p} 회비 확인 요청`,
        body: `${p} 회비 ${won(amount)}가 아직 미납입니다. 사정이 있으시면 운영진에게 알려 주세요.${acc}`,
      };
    default:
      return { title: `${club} 회비 안내`, body: `회비 ${won(amount)}` };
  }
}

/** 총무에게 가는 요약 (2차 단계에서만) */
export const summaryForManager = (clubName, monthKey, unpaid, amount) => ({
  title: `${clubName || '클럽'} ${periodLabel(monthKey)} 회비 현황`,
  body: unpaid.length
    ? `미납 ${unpaid.length}명 · ${won(unpaid.length * (amount || 0))} 남았습니다.`
    : '전원 납부 완료되었습니다.',
});

/**
 * 이 단계를 지금 보내도 되는가.
 * @param sent 이미 보낸 기록 { '2026-08': { first: '2026-08-11', ... } }
 */
export function canSend(stage, monthKey, sent = {}) {
  if (!stage) return { ok: false, reason: '오늘 보낼 단계가 없습니다' };
  if (sent?.[monthKey]?.[stage.key]) {
    return { ok: false, reason: `${stage.label}은 이미 보냈습니다` };
  }
  return { ok: true, reason: '' };
}

/**
 * 자동 발송 계획 — Cloud Functions 가 매일 호출한다.
 * 사람이 확인해야 하는 단계(auto:false)는 여기서 걸러진다.
 */
export function planAutoSend({ clubName, monthKey, today, dueDay, amount, members, paidMap, sent, account }) {
  const stage = stageFor(monthKey, today, dueDay);
  if (!stage) return { stage: null, recipients: [], reason: '오늘은 발송일이 아닙니다' };
  if (!stage.auto) {
    return { stage, recipients: [], reason: '총무 확인이 필요한 단계입니다', needsApproval: true };
  }
  const gate = canSend(stage, monthKey, sent);
  if (!gate.ok) return { stage, recipients: [], reason: gate.reason };

  const recipients = recipientsFor(stage, members, paidMap);
  if (!recipients.length) return { stage, recipients: [], reason: '보낼 대상이 없습니다' };

  return {
    stage,
    recipients,
    message: messageFor(stage, {
      clubName, monthKey, amount, dueDate: dueDateOf(monthKey, dueDay), account,
    }),
    reason: '',
  };
}
