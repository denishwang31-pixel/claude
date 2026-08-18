/* ============================================================
   역할 겸임 + 대진↔참석 어긋남 테스트

   역할 겸임에서 무너지면 안 되는 것
     · 옛 문서(roles 없음)도 그대로 읽힌다
     · 대표 역할은 가장 넓은 권한이다 (배지·정렬이 여기 걸린다)
     · 겸임 중 하나라도 권한이 있으면 그 권한이 있다

   대진 어긋남에서 무너지면 안 되는 것
     · 수기로 짠 대진은 자동으로 고치지 않는다 — 앱이 모르는 의도가 있다
     · 빠진 사람만 빼도 경기는 남는다 (자리가 빈 게 보여야 채운다)
   ============================================================ */
import {
  ROLES, memberRoles, primaryRole, hasRole, rolesPayload, rolesLabel,
  isStaffMember, canSeeFeesMember, normalizeRole,
} from '../src/lib/constants.js';
import {
  attendingIds, drawnIds, diffDraw, removeGhosts, dropAffected,
  describeDiff, optionsFor,
} from '../src/lib/drawSync.js';

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => {
  if (c) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${m}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (name, got, want) => ok(
  JSON.stringify(got) === JSON.stringify(want), name,
  `기대 ${JSON.stringify(want)} / 실제 ${JSON.stringify(got)}`,
);
const section = (s) => console.log(`\n[${s}]`);

/* ---------- 역할 겸임 ---------- */
section('역할 읽기 — 옛 문서도 그대로');
eq('roles 가 없으면 role 하나로', memberRoles({ role: '운영진' }), ['운영진']);
eq('role 도 없으면 회원', memberRoles({}), ['회원']);
eq('null 이어도 죽지 않는다', memberRoles(null), ['회원']);
eq('옛 이름은 새 이름으로', memberRoles({ role: '책임리더' }), ['리드']);
eq('roles 가 있으면 그것을', memberRoles({ roles: ['운영진', '리드'], role: '운영진' }), ['운영진', '리드']);
eq('roles 가 빈 배열이면 role 로', memberRoles({ roles: [], role: '총무' }), ['총무']);
eq('모르는 값은 걸러낸다', memberRoles({ roles: ['운영진', '사장님'] }), ['운영진']);
eq('중복은 하나로', memberRoles({ roles: ['리드', '리드'] }), ['리드']);
eq('roles 안의 옛 이름도 변환', memberRoles({ roles: ['책임리더'] }), ['리드']);

section('대표 역할 — 가장 넓은 권한');
eq('운영진+리드 → 운영진', primaryRole({ roles: ['리드', '운영진'] }), '운영진');
eq('총무+리드 → 총무', primaryRole({ roles: ['리드', '총무'] }), '총무');
eq('회장이 섞이면 회장', primaryRole({ roles: ['리드', '회장', '운영진'] }), '회장');
eq('하나면 그것', primaryRole({ role: '리드' }), '리드');
eq('없으면 회원', primaryRole({}), '회원');

section('겸임 판정');
const dual = { roles: ['운영진', '리드'] };
ok(hasRole(dual, ROLES.STAFF), '운영진이다');
ok(hasRole(dual, ROLES.LEAD), '리드이기도 하다');
ok(!hasRole(dual, ROLES.MANAGER), '총무는 아니다');
ok(hasRole({ role: '책임리더' }, ROLES.LEAD), '옛 이름으로 저장돼 있어도 리드');
ok(isStaffMember(dual), '운영 담당이다');
ok(!isStaffMember({ role: '회원' }), '회원은 운영 담당이 아니다');
ok(!canSeeFeesMember(dual), '운영진+리드는 회비를 못 본다');
ok(canSeeFeesMember({ roles: ['총무', '리드'] }), '총무를 겸하면 회비를 본다');
ok(canSeeFeesMember({ roles: ['회장'] }), '회장은 회비를 본다');

section('저장 형태 — roles 와 대표 role 을 같이 맞춘다');
eq('둘을 함께', rolesPayload(['리드', '운영진']), { roles: ['운영진', '리드'], role: '운영진' });
eq('하나만', rolesPayload(['총무']), { roles: ['총무'], role: '총무' });
eq('빈 값은 회원', rolesPayload([]), { roles: ['회원'], role: '회원' });
eq('null 도 회원', rolesPayload(null), { roles: ['회원'], role: '회원' });
/* '회원'은 "아무 역할 없음"이라 다른 역할과 같이 들 이유가 없다 */
eq('회원은 다른 역할과 함께 저장되지 않는다',
  rolesPayload(['운영진', '회원']), { roles: ['운영진'], role: '운영진' });
eq('회원만 남으면 회원', rolesPayload(['회원']), { roles: ['회원'], role: '회원' });
eq('중복 제거', rolesPayload(['리드', '리드', '운영진']), { roles: ['운영진', '리드'], role: '운영진' });
eq('모르는 값 제거', rolesPayload(['운영진', '???']), { roles: ['운영진'], role: '운영진' });
eq('권한 넓은 순으로 정렬',
  rolesPayload(['리드', '회장', '총무']).roles, ['회장', '총무', '리드']);

section('화면 표기');
eq('겸임은 가운뎃점으로', rolesLabel({ roles: ['운영진', '리드'] }), '운영진 · 리드');
eq('하나면 그대로', rolesLabel({ role: '총무' }), '총무');

/* 저장 → 읽기 왕복이 어긋나지 않아야 한다 */
section('저장하고 다시 읽어도 같다');
[['운영진', '리드'], ['총무'], ['회장', '리드'], ['회원']].forEach((input) => {
  const saved = rolesPayload(input);
  eq(`${input.join('+')} 왕복`, memberRoles(saved), saved.roles);
  eq(`${input.join('+')} 대표 역할 일치`, primaryRole(saved), saved.role);
});

/* 옛 코드가 role 만 봐도 권한이 어긋나지 않아야 한다 */
section('옛 규칙이 role 만 봐도 맞다');
{
  const saved = rolesPayload(['리드', '운영진']);
  ok(normalizeRole(saved.role) === '운영진',
    'role 에는 가장 넓은 권한이 들어간다 — 규칙이 이것만 봐도 권한이 좁아지지 않는다');
}

/* ============================================================
   대진 ↔ 참석
   ============================================================ */
const MEMBERS = [
  { id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' },
  { id: 'd', name: '라' }, { id: 'e', name: '마' },
];
const MEET = {
  rsvp: { a: 'yes', b: 'yes', c: 'yes', d: 'yes', e: 'no' },
  guests: [{ name: '손님' }],
};
const AUTO = [
  { id: 'm1', round: 1, court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] },
  { id: 'm2', round: 2, court: 1, teamA: ['a', 'c'], teamB: ['b', 'd'] },
];

section('참석·대진 명단 뽑기');
eq('참석자 + 게스트', attendingIds(MEET, MEMBERS), ['a', 'b', 'c', 'd', 'g:손님']);
eq('불참은 빠진다', attendingIds(MEET, MEMBERS).includes('e'), false);
eq('대진에 오른 사람', drawnIds(AUTO).sort(), ['a', 'b', 'c', 'd']);
eq('빈 대진', drawnIds([]), []);
eq('빈 입력', attendingIds(null, null), []);

section('어긋남 — 다 맞을 때');
{
  const d = diffDraw(AUTO, ['a', 'b', 'c', 'd']);
  ok(d.inSync, '어긋남 없음');
  eq('빠진 사람 없음', d.ghosts, []);
  eq('남는 사람 없음', d.missing, []);
  eq('요약도 비어 있다', describeDiff(d), '');
  eq('할 일이 없다', optionsFor(d), []);
}

section('어긋남 — 사람이 빠졌을 때');
{
  const d = diffDraw(AUTO, ['a', 'b', 'c']);        // d 가 빠졌다
  ok(!d.inSync, '어긋남을 잡는다');
  eq('빠진 사람', d.ghosts, ['d']);
  eq('영향받는 경기 2건', d.affected.length, 2);
  ok(describeDiff(d, (id) => MEMBERS.find((m) => m.id === id)?.name).includes('라'),
    '이름으로 알려준다');

  const vacated = removeGhosts(AUTO, d.ghosts);
  eq('경기는 남는다', vacated.length, 2);
  eq('그 사람만 빠진다', vacated[0].teamB, ['c']);
  ok(!drawnIds(vacated).includes('d'), '대진 어디에도 없다');
  ok(vacated.every((m) => m.id), 'id 는 유지된다');

  const dropped = dropAffected(AUTO, d.affected);
  eq('영향받은 경기를 지우면 0건', dropped.length, 0);
}

section('어긋남 — 나중에 참석으로 바꿨을 때');
{
  const d = diffDraw(AUTO, ['a', 'b', 'c', 'd', 'e']);
  eq('대진에 없는 참석자', d.missing, ['e']);
  eq('빠진 사람은 없다', d.ghosts, []);
  eq('영향받는 경기도 없다', d.affected.length, 0);
  ok(!d.inSync, '그래도 어긋난 상태다 — 나왔는데 뛸 자리가 없다');
}

section('자동 편성 — 다시 돌릴 수 있다');
{
  const d = diffDraw(AUTO, ['a', 'b', 'c']);
  ok(!d.manual, '자동으로 짠 대진');
  const keys = optionsFor(d).map((o) => o.key);
  eq('세 갈래', keys, ['regen', 'vacate', 'clear']);
}

section('수기 편성 — 자동으로 고치지 않는다');
{
  const manual = AUTO.map((m) => ({ ...m, manual: true }));
  const d = diffDraw(manual, ['a', 'b', 'c']);
  ok(d.manual, '수기로 짠 대진');
  const keys = optionsFor(d).map((o) => o.key);
  eq('삭제만 준다', keys, ['drop', 'clear']);
  ok(!keys.includes('regen'), '다시 편성은 주지 않는다 — 손으로 짠 이유를 앱이 모른다');
  ok(!keys.includes('vacate'), '자리만 비우기도 주지 않는다');
}
{
  /* 자동으로 짠 뒤 한 칸만 손으로 고친 경우도 수기로 본다 */
  const mixed = [AUTO[0], { ...AUTO[1], manual: true }];
  const d = diffDraw(mixed, ['a', 'b', 'c']);
  ok(d.manual, '한 칸이라도 손으로 고쳤으면 수기로 본다');
  ok(!optionsFor(d).some((o) => o.key === 'regen'),
    '그 고친 의도를 다시 돌리기로 날리지 않는다');
}

section('예외');
eq('대진이 없으면 어긋날 것도 없다', diffDraw([], ['a']).affected.length, 0);
ok(!diffDraw([], ['a']).inSync, '참석자는 있는데 대진이 없으면 어긋난 것');
ok(diffDraw([], []).inSync, '둘 다 비면 맞는 것');
eq('null 대진', removeGhosts(null, ['a']), []);
eq('지울 사람이 없으면 그대로', removeGhosts(AUTO, []).length, 2);
eq('게스트도 빠질 수 있다',
  diffDraw([{ id: 'x', teamA: ['g:손님'], teamB: [] }], ['a']).ghosts, ['g:손님']);

console.log(`\n역할 겸임·대진 동기화 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
