/* 계정 삭제 테스트

   여기서 지키려는 것
     - 지난 기록의 이름이 살아남을 것 (지우면 남의 대진표까지 못 읽는다)
     - 연락 수단은 하나도 안 남을 것 (탈퇴했는데 알림이 가면 안 된다)
     - 회장이 나가도 클럽이 잠기지 않을 것
     - 실수로 지워지지 않을 것 */
import {
  WIPE_FIELDS, KEEP_FIELDS, tombstone, successionPlan, successionText,
  emptyClubPatch, CONFIRM_WORD, confirmOk, deleteReady, DELETE_STEPS,
  reauthMethod, reauthFresh, REAUTH_FRESH_MS, loginAccountText,
} from '../src/lib/accountDelete.js';
import { ROLES } from '../src/lib/constants.js';
import { pendingBlanks, TERMS, PRIVACY } from '../src/lib/legalText.js';
import { customTokenUid } from '../src/lib/social.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
console.log('\n[본인 확인 — 로그인한 방법마다]');
{
  const pw = { uid: 'abc', providerData: [{ providerId: 'password' }], email: 'a@b.c' };
  eq(reauthMethod(pw), 'password', '이메일 가입 → 비밀번호');
  eq(reauthMethod({ uid: 'kakao:123', providerData: [], email: 'k@kakao.com' }), 'kakao',
    '카카오 가입은 이메일이 붙어 있어도 비밀번호가 아니라 카카오로 다시 로그인(예전엔 비밀번호를 물어 삭제가 막혔다)');
  eq(reauthMethod({ uid: 'naver:xyz', providerData: [] }), 'naver', '네이버 가입 → 네이버로 다시 로그인');
  eq(reauthMethod({ uid: 'g1', providerData: [{ providerId: 'google.com' }], email: 'g@gmail.com' }), 'google',
    '구글 가입 → 구글로 다시 로그인');
  eq(reauthMethod({ uid: 'x', isAnonymous: true }), 'anon', '둘러보기 계정은 확인할 것이 없다');
  eq(reauthMethod(null), 'none', '로그인 안 됨');

  const now = 1_000_000_000;
  ok(reauthFresh(now - 60_000, now), '1분 전 확인 → 유효');
  ok(!reauthFresh(now - REAUTH_FRESH_MS, now), '4분이 지나면 다시 확인(Firebase 는 5분 뒤 삭제를 거부)');
  ok(!reauthFresh(0, now), '확인한 적 없음');
  ok(REAUTH_FRESH_MS < 5 * 60 * 1000, 'Firebase 의 5분보다 짧다');

  eq(loginAccountText('password'), '로그인 계정 (이메일·비밀번호)', '이메일 가입 문구');
  eq(loginAccountText('kakao'), '로그인 계정 (카카오 로그인 연결)', '소셜 가입은 비밀번호라고 쓰지 않는다');
}

console.log('\n[소셜 본인 확인 — 다른 아이디로 바뀌지 않게]');
{
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tok = (uid) => `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: 'x@y.iam.gserviceaccount.com', uid, claims: { provider: 'kakao' } })}.sig`;
  eq(customTokenUid(tok('kakao:4242')), 'kakao:4242', '서버 토큰에서 계정을 로그인 없이 읽는다');
  eq(customTokenUid(tok('naver:AbC-_9')), 'naver:AbC-_9', '네이버 id(영문·기호)도 읽는다');
  eq(customTokenUid('garbage'), '', '못 읽으면 빈 값 → 다른 계정으로 보고 막는다');
  eq(customTokenUid(''), '', '빈 토큰');

  const sig = readFileSync(resolve(ROOT, 'src/lib/socialSignIn.js'), 'utf8');
  ok(/expectUid && customTokenUid\(back\.token\) !== expectUid/.test(sig), '다른 아이디면 그 토큰으로 로그인하지 않는다');
  ok(/reauthenticateWithCredential\(auth\.currentUser, cred\)/.test(sig), '구글은 새로 로그인하지 않고 지금 계정을 다시 확인한다');
  ok(/savePending\(\{[^}]*expectUid/.test(sig) && /pending\?\.expectUid/.test(sig) && /p\.expectUid/.test(sig),
    '늦게 도착한 결과(카카오톡을 거친 경우)에도 같은 확인을 한다');

  const scr = readFileSync(resolve(ROOT, 'src/components/DeleteAccountScreen.jsx'), 'utf8');
  ok(/expectUid: me/.test(scr), '삭제 화면은 지금 계정으로만 확인한다');
  ok(/method === 'password' &&/.test(scr) && !/!anon && !pw/.test(scr), '비밀번호 칸은 이메일 가입자에게만');
  ok(/<SocialLoginSheet/.test(scr), '안드로이드 카카오·네이버는 앱 안 로그인 화면으로 확인');
  ok(/!verified/.test(scr), '소셜 계정은 다시 로그인하기 전엔 삭제 버튼이 잠긴다');
}

console.log('\n[계정 삭제로 가는 길 — 내 프로필]');
{
  const prof = readFileSync(resolve(ROOT, 'src/components/ProfileScreen.jsx'), 'utf8');
  ok(/onOpen\?\.\('deleteaccount'\)/.test(prof), '내 프로필 맨 아래에 [계정 삭제]');
  const legal = readFileSync(resolve(ROOT, 'src/components/LegalScreen.jsx'), 'utf8');
  ok(!/open: 'deleteaccount'/.test(legal) && /내 프로필/.test(legal), '약관 화면엔 가는 길만 안내');
  ok(/\[내 프로필\] → \[계정 삭제\]/.test(PRIVACY) && /\[내 프로필\] → \[계정 삭제\]/.test(TERMS),
    '약관·개인정보처리방침의 경로도 같다');
  const web = readFileSync(resolve(ROOT, 'scripts/build-legal.mjs'), 'utf8');
  ok(/\[더보기\] → \[내 프로필\] → 맨 아래 \[계정 삭제\]/.test(web), '웹 삭제 안내 페이지의 경로도 같다');
  const more = readFileSync(resolve(ROOT, 'app/(tabs)/more.jsx'), 'utf8');
  ok(/onOpen=\{openFrom\('profile'\)\}/.test(more) && /if \(subParent\)/.test(more), '계정 삭제에서 뒤로 가면 내 프로필로');
}

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
