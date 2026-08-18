/* ============================================================
   회비 독촉 — 서버 쪽 사본 (CommonJS)

   왜 사본인가
     firebase deploy 는 functions/ 만 올린다. ../src/lib 는 배포 묶음에
     들어가지 않아 서버에서 require 할 수 없다.

   예전에는 이 로직이 functions/index.js 안에 따로 손으로 적혀 있었고,
   대조 장치가 없었다. 그래서 실제로 어긋나 있었다 — 앱은 최종 단계에
   "사정이 있으시면 운영진에게 알려 주세요"를 쓰는데 서버는 2차 문구를
   그대로 다시 보내고 있었다. 돈 얘기라 어긋나도 아무도 모른다.

   이제 src/lib/dunning.js 와 같은 답을 내야 하고, scripts/test-manager.mjs
   가 두 파일에 같은 입력을 넣어 매번 대조한다. 한쪽만 고치면 깨진다.

   지켜야 할 규칙 (앱 쪽 주석과 같아야 한다)
     1. 발신자는 총무 개인이 아니라 앱이다. 문구에 총무 이름을 넣지 않는다.
     2. 미납자에게 개별로만. 단체방에 명단을 뿌리지 않는다.
     3. 미납 현황은 본인에게만.
     4. 마지막 단계(D+10)는 자동으로 나가지 않는다.
     5. 같은 단계는 한 번만. 중복 발송은 독촉이 아니라 괴롭힘이다.
   ============================================================ */

const DUN_STAGE = {
  PRE: 'pre',
  FIRST: 'first',
  SECOND: 'second',
  FINAL: 'final',
};

const DUN_STAGES = [
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
    auto: false,
    desc: '10일 경과, 총무가 확인 후 직접 발송',
  },
];

const pad = (n) => String(n).padStart(2, '0');
const lastDayOf = (year, month) => new Date(year, month, 0).getDate();

function dueDateOf(monthKey, dueDay = 10) {
  const [y, m] = String(monthKey || '').split('-');
  const year = Number(y) || new Date().getFullYear();
  const month = Number(m) || 1;
  const day = Math.min(Math.max(1, dueDay), lastDayOf(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysBetween(a, b) {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2 - d1) / 86400000);
}

function stageFor(monthKey, today, dueDay = 10) {
  const due = dueDateOf(monthKey, dueDay);
  const elapsed = daysBetween(due, today);
  return DUN_STAGES.find((s) => s.offset === elapsed) || null;
}

function unpaidMembers(members, paidMap = {}) {
  return members.filter((m) => {
    const active = !m.status || m.status === '활동';
    return active && !paidMap[m.id];
  });
}

function recipientsFor(stage, members, paidMap = {}) {
  if (!stage) return [];
  if (stage.audience === 'all') {
    return members.filter((m) => !m.status || m.status === '활동');
  }
  return unpaidMembers(members, paidMap);
}

const periodLabel = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  return m ? `${Number(m)}월` : `${y}년`;
};

const won = (n) => `${Number(n || 0).toLocaleString()}원`;

function messageFor(stage, { clubName, monthKey, amount, dueDate, account }) {
  const p = periodLabel(monthKey);
  const acc = account ? `\n입금: ${account}` : '';
  const club = clubName || '클럽';

  switch (stage && stage.key) {
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

const summaryForManager = (clubName, monthKey, unpaid, amount) => ({
  title: `${clubName || '클럽'} ${periodLabel(monthKey)} 회비 현황`,
  body: unpaid.length
    ? `미납 ${unpaid.length}명 · ${won(unpaid.length * (amount || 0))} 남았습니다.`
    : '전원 납부 완료되었습니다.',
});

function canSend(stage, monthKey, sent = {}) {
  if (!stage) return { ok: false, reason: '오늘 보낼 단계가 없습니다' };
  if (sent && sent[monthKey] && sent[monthKey][stage.key]) {
    return { ok: false, reason: `${stage.label}은 이미 보냈습니다` };
  }
  return { ok: true, reason: '' };
}

function planAutoSend({
  clubName, monthKey, today, dueDay, amount, members, paidMap, sent, account,
}) {
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

module.exports = {
  DUN_STAGE, DUN_STAGES, dueDateOf, daysBetween, stageFor, unpaidMembers,
  recipientsFor, periodLabel, messageFor, summaryForManager, canSend, planAutoSend,
};
