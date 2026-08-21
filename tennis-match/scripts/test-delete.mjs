/* 계정 삭제 테스트

   여기서 지키려는 것
     - 지난 기록의 이름이 살아남을 것 (지우면 남의 대진표까지 못 읽는다)
     - 연락 수단은 하나도 안 남을 것 (탈퇴했는데 알림이 가면 안 된다)
     - 회장이 나가도 클럽이 잠기지 않을 것
     - 실수로 지워지지 않을 것 */
import {
  WIPE_FIELDS, KEEP_FIELDS, tombstone, successionPlan, successionText,
  emptyClubPatch, CONFIRM_WORD, confirmOk, deleteReady, DELETE_STEPS,
} from '../src/lib/accountDelete.js';
import { ROLES } from '../src/lib/constants.js';
import { pendingBlanks } from '../src/lib/legalText.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m}\n      받은 값: ${JSON.stringify(a)}\n      기대값 : ${JSON.stringify(b)}`);

console.log('\n[탈퇴한 회원 문서 — 비우되 지우지 않는다]');
{
  const before = {
    id: 'u1', name: '홍길동', gender: 'M', grade: 'B',
    phone: '010-1111-2222', email: 'a@b.c', pushToken: 'ExponentPushToken[xx]',
    memo: '운영진 메모', role: ROLES.PRESIDENT, roles: [ROLES.PRESIDENT, ROLES.MANAGER],
    status: '활동', startedAt: '2018-03-01',
  };
  const after = tombstone(before, '2026-08-21T00:00:00.000Z');

  eq(after.name, '홍길동', '이름은 남는다 — 지난 대진표를 읽으려면 있어야 한다');
  eq(after.gender, 'M', '성별도 남는다 — 혼복 기록이 읽혀야 한다');
  eq(after.grade, 'B', '조도 남는다');

  WIPE_FIELDS.forEach((f) => {
    eq(after[f], undefined, `${f} 는 남으면 안 된다 — 탈퇴한 사람에게 닿는 수단`);
  });
  ok(!('pushToken' in after), '푸시 토큰이 남으면 탈퇴 후에도 알림이 간다');

  eq(after.role, ROLES.MEMBER, '권한은 즉시 내린다');
  eq(after.roles, [ROLES.MEMBER], '겸임 역할도 함께 내린다');
  eq(after.status, '탈퇴', '탈퇴 표시');
  eq(after.deleted, true, '삭제된 계정임을 표시');
  eq(after.deletedAt, '2026-08-21T00:00:00.000Z', '시각이 남는다');

  /* 빈 문서를 넣어도 터지지 않아야 한다 */
  const empty = tombstone(null);
  eq(empty.status, '탈퇴', '값이 없어도 탈퇴 표시는 만든다');
  eq(empty.name, undefined, '없던 이름을 지어내지 않는다');

  ok(KEEP_FIELDS.every((k) => !WIPE_FIELDS.includes(k)),
    '남길 것과 지울 것이 겹치면 안 된다');
}

console.log('\n[회장이 나갈 때 — 운영진 전원이 회장이 된다]');
{
  const members = [
    { id: 'p', name: '회장', role: ROLES.PRESIDENT, status: '활동' },
    { id: 's1', name: '총무', role: ROLES.MANAGER, status: '활동' },
    { id: 's2', name: '운영진', role: ROLES.STAFF, status: '활동' },
    { id: 's3', name: '리드', role: ROLES.LEAD, status: '활동' },
    { id: 'm1', name: '회원1', role: ROLES.MEMBER, status: '활동' },
  ];
  const plan = successionPlan('p', members);
  eq(plan.needed, true, '회장이 나가면 승계가 필요하다');
  eq(plan.promote.sort(), ['s1', 's2', 's3'],
    '운영진 전원을 올린다 — 한 명만 고르면 "왜 저 사람이냐"가 생긴다');
  ok(!plan.promote.includes('m1'), '일반 회원은 올리지 않는다(운영진이 있으므로)');
  eq(plan.orphan, false, '넘겨받을 사람이 있다');

  const text = successionText(plan, (id) => members.find((m) => m.id === id)?.name);
  ok(text.includes('총무') && text.includes('회장이 되어'),
    '누가 이어받는지 화면에 그대로 보여 준다');
}

console.log('\n[회장이 남아 있으면 아무것도 안 한다]');
{
  const members = [
    { id: 'p1', name: '회장1', role: ROLES.PRESIDENT, status: '활동' },
    { id: 'p2', name: '회장2', role: ROLES.PRESIDENT, status: '활동' },
    { id: 's1', name: '총무', role: ROLES.MANAGER, status: '활동' },
  ];
  const plan = successionPlan('p1', members);
  eq(plan.needed, false, '다른 회장이 있으면 승계가 필요 없다');
  eq(plan.reason, 'president-remains', '이유를 남긴다');
  eq(plan.promote, [], '아무도 안 올린다');
  ok(successionText(plan).includes('그대로 유지'), '사용자에게 안심시켜 준다');

  /* 겸임 — roles 배열로 회장을 가진 사람도 회장으로 센다 */
  const withRoles = [
    { id: 'p1', name: '회장', role: ROLES.PRESIDENT, status: '활동' },
    { id: 'x', name: '겸임', roles: [ROLES.STAFF, ROLES.PRESIDENT], role: ROLES.STAFF, status: '활동' },
  ];
  eq(successionPlan('p1', withRoles).needed, false,
    '겸임으로 회장을 가진 사람도 회장으로 본다');
}

console.log('\n[회장도 운영진도 없으면 남은 회원 전원에게]');
{
  const members = [
    { id: 'p', name: '회장', role: ROLES.PRESIDENT, status: '활동' },
    { id: 'm1', name: '회원1', role: ROLES.MEMBER, status: '활동' },
    { id: 'm2', name: '회원2', role: ROLES.MEMBER, status: '활동' },
  ];
  const plan = successionPlan('p', members);
  eq(plan.promote.sort(), ['m1', 'm2'],
    '운영진이 없으면 회원에게라도 넘긴다 — 안 그러면 역할을 바꿀 사람이 없어 클럽이 잠긴다');
  eq(plan.reason, 'members-promoted', '이유를 구분해 둔다');
}

console.log('\n[이미 탈퇴한 사람에게는 안 넘긴다]');
{
  const members = [
    { id: 'p', name: '회장', role: ROLES.PRESIDENT, status: '활동' },
    { id: 's1', name: '떠난총무', role: ROLES.MANAGER, status: '탈퇴', deleted: true },
    { id: 's2', name: '휴면운영', role: ROLES.STAFF, status: '휴면' },
  ];
  const plan = successionPlan('p', members);
  eq(plan.promote, ['s2'], '탈퇴한 사람은 빼고, 휴면은 아직 회원이므로 넣는다');
}

console.log('\n[마지막 한 명이 나가면 빈 클럽]');
{
  const members = [{ id: 'p', name: '회장', role: ROLES.PRESIDENT, status: '활동' }];
  const plan = successionPlan('p', members);
  eq(plan.orphan, true, '넘겨받을 사람이 없다');
  eq(plan.promote, [], '올릴 사람도 없다');
  ok(successionText(plan).includes('빈 클럽'), '그 사실을 미리 알려 준다');

  const patch = emptyClubPatch('2026-08-21T00:00:00.000Z');
  eq(patch.searchable, false, '빈 클럽은 검색에서 빠진다');
  eq(patch.ownerId, '', '소유자를 비운다');
  eq(patch.closed, true, '닫힌 클럽으로 표시');
}

console.log('\n[일반 회원이 나가는 경우]');
{
  const members = [
    { id: 'p', name: '회장', role: ROLES.PRESIDENT, status: '활동' },
    { id: 'm1', name: '회원', role: ROLES.MEMBER, status: '활동' },
  ];
  const plan = successionPlan('m1', members);
  eq(plan.needed, false, '회장이 아니면 승계할 것이 없다');
  eq(plan.reason, 'not-president', '이유를 남긴다');
  eq(successionText(plan), '', '보여 줄 말도 없다');
}

console.log('\n[실수로 지워지지 않게]');
{
  eq(CONFIRM_WORD, '계정 삭제', '입력해야 하는 말');
  eq(confirmOk('계정 삭제'), true, '정확히 적으면 통과');
  eq(confirmOk('  계정 삭제  '), true, '앞뒤 공백은 봐준다');
  eq(confirmOk('계정삭제'), false, '띄어쓰기가 다르면 막는다');
  eq(confirmOk('삭제'), false, '비슷한 말로는 안 된다');
  eq(confirmOk(''), false, '빈 값은 당연히 막는다');
  eq(confirmOk(null), false, 'null 도 막는다');
}

console.log('\n[지울 수 있는 상태인가]');
{
  const members = [
    { id: 'p', name: '회장', role: ROLES.PRESIDENT, status: '활동' },
    { id: 's1', name: '총무', role: ROLES.MANAGER, status: '활동' },
  ];
  eq(deleteReady({ uid: 'p', members }).ok, true, '넘겨받을 사람이 있으면 진행 가능');
  eq(deleteReady({ uid: '', members }).blockers, ['로그인이 필요합니다'], '로그인은 필수');
  eq(deleteReady({ uid: 'p', members: [members[0]] }).ok, true,
    '마지막 한 명이어도 나갈 수 있다 — 빈 클럽이 될 뿐이다');

  ok(DELETE_STEPS.length === 4, '단계는 넷');
  eq(DELETE_STEPS[0].key, 'reauth',
    '본인 확인이 가장 먼저 — 나중에 계정 삭제가 막히면 데이터만 지워진 채로 남는다');
  eq(DELETE_STEPS[3].key, 'auth', '로그인 계정 삭제가 마지막');
}

/* ============================================================
   법적 문서의 빈칸

   실패로 만들지 않는 이유
     지금은 채울 수 없는 값(사업자 정보 등)이 섞여 있다. 계속 빨간 채로
     두면 "원래 하나는 실패하는 것"이 되어 진짜 실패를 놓치게 된다.
     대신 눈에 걸리게 크게 찍고, PRE-LAUNCH.md A 에 항목으로 남겨 둔다.
   ============================================================ */
/* 검사 자체가 맞게 도는지 먼저 확인한다.
   처음 만든 검사는 `[[...]]` 두 겹만 찾아서, 대괄호를 하나씩만 지운 상태를
   놓쳤다. 그 상태로 "빈칸 없음 — 출시 가능"이 떴다. 실제로 겪었다. */
console.log('\n[빈칸 검사가 제대로 도는가]');
{
  eq(pendingBlanks('· 대표자: [[대표자 이름]]').length > 0, true,
    '아예 안 채운 것을 잡는다');
  eq(pendingBlanks('· 대표자: [대표자 이름]').length > 0, true,
    '대괄호를 하나만 지운 것도 잡는다 — 안내 문구가 그대로 남아 있기 때문');
  eq(pendingBlanks('· 대표자: 황동현'), [], '제대로 채우면 안 잡는다');
  eq(pendingBlanks('[더보기] → [계정 삭제] 에서 지울 수 있습니다'), [],
    '화면 이름을 가리키는 홑대괄호는 헛경보를 내지 않는다');
  eq(pendingBlanks(''), [], '빈 글은 잡을 것이 없다');
}

const blanks = pendingBlanks();
console.log('\n[약관·개인정보처리방침 빈칸]');
if (blanks.length === 0) {
  ok(true, '');
  console.log('  ✓ 빈칸 없음 — 출시 가능한 상태');
} else {
  console.log(`  ⚠ 아직 ${blanks.length}군데가 비어 있습니다 (src/lib/legalText.js)`);
  blanks.forEach((b) => console.log('     ', b));
  console.log('  → 이 상태로 스토어에 올리면 안 됩니다. 앱 화면에도 경고가 뜹니다.');
}

console.log(`\n계정 삭제 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
