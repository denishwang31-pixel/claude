/* 전체 ↔ 코트장 하이어라키 테스트

   여기서 지키려는 것
     · 아무것도 안 건드린 클럽은 예전과 완전히 똑같이 동작할 것
       (하이어라키를 넣었다고 회비가 두 배가 되면 안 된다)
     · 코트장에 값을 넣은 순간에만 갈라질 것
     · "꺼 두었다"와 "설정한 적 없다"를 구분할 것
     · 코트장을 나눴다고 아무도 청구되지 않는 상태가 되지 않을 것 */
import {
  FROM, resolve, overrides, overrideKeys,
  FEE_SCOPE, feeScopeOf, feeRule, billingScopes, feeDocKey, parseFeeDocKey,
  memberBill, membersInScope,
  NOTIFY_KINDS, notifyRule, notifySettings, notifyOverrideCount, notifyTargets,
  scopeSummary,
} from '../src/lib/scope.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m}\n      받은 값: ${JSON.stringify(a)}\n      기대값 : ${JSON.stringify(b)}`);

const VENUES = [
  { id: 'v1', name: '염곡' },
  { id: 'v2', name: '수도공고' },
];

console.log('\n[값 물려받기 — 비워 두면 위층]');
{
  const club = { settings: { feeAmount: 30000 } };
  eq(resolve(club, null, 'feeAmount', 0), { value: 30000, from: FROM.CLUB },
    '코트장을 안 보면 클럽 값');
  eq(resolve(club, { id: 'v1' }, 'feeAmount', 0), { value: 30000, from: FROM.CLUB },
    '코트장에 값이 없으면 클럽 값을 물려받는다');
  eq(resolve(club, { id: 'v1', feeAmount: 20000 }, 'feeAmount', 0),
    { value: 20000, from: FROM.VENUE }, '코트장에 값이 있으면 그 값');
  eq(resolve({}, null, 'feeAmount', 30000), { value: 30000, from: FROM.DEFAULT },
    '아무 데도 없으면 기본값');

  /* 빈 문자열은 "안 정했다"로 본다 — 계좌를 지웠다고 빈칸이 내려가면
     회원 화면에 입금 계좌가 사라진다 */
  eq(resolve({ settings: { feeAccount: '농협 123' } }, { feeAccount: '' }, 'feeAccount', '').from,
    FROM.CLUB, '코트장 계좌가 빈칸이면 클럽 계좌를 쓴다');

  /* 0 은 진짜 값이다 — 회비 0원인 코트장이 실제로 있다(무료 공공코트) */
  eq(resolve({ settings: { feeAmount: 30000 } }, { feeAmount: 0 }, 'feeAmount', 0),
    { value: 0, from: FROM.VENUE }, '0원은 "안 정함"이 아니라 진짜 0원이다');

  ok(overrides({ feeAmount: 20000 }, 'feeAmount'), '따로 정한 것을 알아본다');
  ok(!overrides({ feeAmount: '' }, 'feeAmount'), '빈칸은 따로 정한 것이 아니다');
  eq(overrideKeys({ feeAmount: 20000, feeDueDay: null }, ['feeAmount', 'feeDueDay']),
    ['feeAmount'], '따로 정한 항목만 센다');
}

console.log('\n[회비 청구 단위 — 기본은 예전 그대로]');
{
  const club = { settings: { feeAmount: 30000, feeDueDay: 10 } };
  eq(feeScopeOf(club), FEE_SCOPE.CLUB, '아무것도 안 고르면 클럽 하나로');
  const scopes = billingScopes(club, VENUES);
  eq(scopes.length, 1, '코트장이 둘이어도 청구는 한 몫 — 여기가 깨지면 회비가 두 배가 된다');
  eq(scopes[0].id, null, '전체 한 줄');
  eq(scopes[0].amount, 30000, '금액도 그대로');
}

console.log('\n[코트장마다로 바꾸면]');
{
  const club = { settings: { feeScope: FEE_SCOPE.VENUE, feeAmount: 30000, feeDueDay: 10 } };
  const venues = [
    { id: 'v1', name: '염곡' },                        // 물려받음
    { id: 'v2', name: '수도공고', feeAmount: 20000, feeDueDay: 25 }, // 따로
  ];
  const scopes = billingScopes(club, venues);
  eq(scopes.length, 2, '코트장 수만큼 청구 단위가 생긴다');
  eq(scopes[0].amount, 30000, '값을 안 넣은 코트장은 클럽 금액을 그대로');
  eq(scopes[0].dueDay, 10, '납부일도 물려받는다');
  eq(scopes[1].amount, 20000, '값을 넣은 코트장은 자기 금액');
  eq(scopes[1].dueDay, 25, '납부일도 따로');
  eq(scopes[1].from.amount, FROM.VENUE, '어디서 온 값인지 남긴다');
  eq(scopes[0].from.amount, FROM.CLUB, '물려받은 것도 표시된다');

  /* ⚠️ 코트장 단위로 골랐는데 코트장이 하나도 없는 경우.
     여기서 빈 배열을 돌려주면 아무에게도 회비가 청구되지 않고,
     회비는 조용히 0이 되어도 아무도 눈치채지 못하는 종류의 값이다. */
  eq(billingScopes(club, []).length, 1, '코트장이 없으면 전체 한 몫으로 되돌린다');
  eq(billingScopes(club, [])[0].id, null, '되돌린 것은 전체 줄이다');
}

console.log('\n[회원 한 사람이 낼 금액]');
{
  const club = { settings: { feeScope: FEE_SCOPE.VENUE, feeAmount: 30000 } };
  const venues = [
    { id: 'v1', name: '염곡', feeAmount: 30000 },
    { id: 'v2', name: '수도공고', feeAmount: 20000 },
  ];
  eq(memberBill(club, venues, { id: 'a', venueIds: ['v1'] }).total, 30000, '한 곳이면 한 몫');
  eq(memberBill(club, venues, { id: 'b', venueIds: ['v1', 'v2'] }).total, 50000,
    '두 곳에 나가면 두 몫 — 코트를 둘 다 쓰기 때문');
  eq(memberBill(club, venues, { id: 'b', venueIds: ['v1', 'v2'] }).lines.length, 2,
    '내역을 나눠 보여 줄 수 있어야 한다 — 합계만 보이면 "왜 5만원이냐"가 된다');

  /* 배정 안 된 사람. 0원으로 두면 영영 안 내고 아무도 모른다 */
  const un = memberBill(club, venues, { id: 'c' });
  eq(un.total, 30000, '배정 안 된 사람은 전체 기준 한 몫');
  eq(un.unassigned, true, '총무 화면에서 걸리도록 표시한다');

  /* 클럽 단위면 코트장 배정과 무관하게 한 몫 */
  const clubOnly = { settings: { feeAmount: 30000 } };
  eq(memberBill(clubOnly, venues, { id: 'b', venueIds: ['v1', 'v2'] }).total, 30000,
    '클럽 단위에서는 두 곳에 나가도 한 몫 — 하이어라키 도입 전과 같아야 한다');
}

console.log('\n[회비 문서 키 — 기존 문서와 섞이지 않게]');
{
  eq(feeDocKey('2026-08', null), '2026-08', '전체는 기간 그대로 — 이미 쌓인 문서를 그대로 읽는다');
  eq(feeDocKey('2026-08', 'v1'), '2026-08__v1', '코트장은 뒤에 붙인다');
  eq(parseFeeDocKey('2026-08'), { periodKey: '2026-08', scopeId: null }, '되돌리기');
  eq(parseFeeDocKey('2026-08__v1'), { periodKey: '2026-08', scopeId: 'v1' }, '되돌리기(코트장)');
  eq(parseFeeDocKey('2026'), { periodKey: '2026', scopeId: null }, '연납도 그대로');
}

console.log('\n[청구 단위에 속한 사람]');
{
  const members = [
    { id: 'a', venueIds: ['v1'], status: '활동' },
    { id: 'b', venueIds: ['v2'], status: '활동' },
    { id: 'c', venueIds: ['v1', 'v2'], status: '활동' },
    { id: 'd', status: '활동' },                        // 미배정
    { id: 'e', venueIds: ['v1'], status: '탈퇴' },
  ];
  eq(membersInScope(members, 'v1').map((m) => m.id), ['a', 'c', 'd'],
    '그 코트장 사람 + 아직 배정 안 된 사람. 탈퇴자는 뺀다');
  eq(membersInScope(members, null).map((m) => m.id), ['a', 'b', 'c', 'd'],
    '전체면 활동 중인 사람 모두');
}

console.log('\n[알림 — "껐다"와 "설정한 적 없다"는 다르다]');
{
  const club = { settings: {} };
  eq(notifyRule(club, null, 'fee').on, true, '기본으로 켜져 있는 알림');
  eq(notifyRule(club, null, 'fee').from, FROM.DEFAULT, '아무도 설정한 적 없음');
  eq(notifyRule(club, null, 'guest').on, false, '게스트 모집은 기본 꺼짐');

  const off = { settings: { notify: { fee: false } } };
  eq(notifyRule(off, null, 'fee').on, false, '전체에서 끄면 꺼진다');
  eq(notifyRule(off, { id: 'v1' }, 'fee').on, false, '코트장은 전체를 따른다');

  /* 여기가 핵심. 코트장에 false 를 저장한 것과 키가 아예 없는 것은 다르다.
     `venue.notify.fee || club...` 로 짜면 코트장의 false 가 클럽의 true 에
     먹혀서 "껐는데 계속 온다"가 된다. */
  const on = { settings: { notify: { fee: true } } };
  eq(notifyRule(on, { id: 'v1', notify: { fee: false } }, 'fee').on, false,
    '전체가 켜져 있어도 코트장에서 끄면 꺼진다');
  eq(notifyRule(on, { id: 'v1', notify: { fee: false } }, 'fee').from, FROM.VENUE,
    '코트장에서 정한 값임을 남긴다');
  eq(notifyRule(on, { id: 'v1', notify: {} }, 'fee').from, FROM.CLUB,
    '코트장에 키가 없으면 전체를 따른다');

  /* 반대 방향 — 전체는 꺼 두고 코트장 하나만 켜기 */
  eq(notifyRule({ settings: { notify: { guest: false } } }, { notify: { guest: true } }, 'guest').on,
    true, '전체를 끄고 코트장 한 곳만 켤 수도 있다');
}

console.log('\n[끌 수 없는 알림]');
{
  const club = { settings: { notify: { notice: false } } };
  eq(notifyRule(club, { notify: { notice: false } }, 'notice').on, true,
    '공지는 어디서 꺼도 켜져 있다 — 못 받으면 앱이 고장 난 것으로 보인다');
  ok(notifyRule(club, null, 'notice').force, '끌 수 없다는 표시가 붙는다');
  ok(NOTIFY_KINDS.filter((k) => k.force).length === 1, '끌 수 없는 것은 최소한으로');
}

console.log('\n[알림 설정 화면이 받는 목록]');
{
  const club = { settings: { notify: { fee: true } } };
  const venue = { id: 'v1', name: '염곡', notify: { rsvp: false } };
  const rows = notifySettings(club, venue);
  eq(rows.length, NOTIFY_KINDS.length, '종류를 빠짐없이 준다');
  eq(rows.find((r) => r.key === 'rsvp').on, false, '코트장에서 끈 것');
  eq(rows.find((r) => r.key === 'fee').from, FROM.CLUB, '전체를 따르는 것');
  eq(notifyOverrideCount(club, venue), 1, '따로 정한 개수를 센다');
  eq(notifyOverrideCount(club, { id: 'v2' }), 0, '아무것도 안 정한 코트장은 0');
}

console.log('\n[누구에게 보내는가]');
{
  const club = { settings: {} };
  const members = [
    { id: 'a', venueIds: ['v1'], status: '활동' },
    { id: 'b', venueIds: ['v2'], status: '활동' },
    { id: 'c', status: '활동' },
  ];
  const venue = { id: 'v1', name: '염곡' };

  eq(notifyTargets('rsvp', { club, venue, members }).members.map((m) => m.id), ['a', 'c'],
    '참석 투표는 그 코트장 사람에게만 — 다른 코트 사람에게는 스팸이다');

  /* 대회·공지는 코트장으로 자르지 않는다. 자르면 "우리 코트만 대회를
     몰랐다"가 된다. */
  eq(notifyTargets('tourney', { club, venue, members }).members.map((m) => m.id),
    ['a', 'b', 'c'], '대회는 코트장을 골라도 클럽 전체에게');

  const offVenue = { id: 'v1', name: '염곡', notify: { rsvp: false } };
  const blocked = notifyTargets('rsvp', { club, venue: offVenue, members });
  eq(blocked.members, [], '코트장에서 껐으면 아무에게도 안 간다');
  ok(blocked.reason.includes('염곡'), '왜 안 갔는지 코트장 이름을 넣어 말해 준다');

  eq(notifyTargets('없는종류', { club, members }).members, [], '모르는 종류는 안 보낸다');
  ok(notifyTargets('rsvp', { club, venue, members: [] }).reason.includes('대상'),
    '대상이 없으면 그렇게 말한다');
}

console.log('\n[화면에 쓰는 말]');
{
  eq(scopeSummary({ name: '염곡', amount: 30000, dueDay: 10 }), '염곡 · 30,000원 · 매월 10일',
    '한 줄 요약');
  eq(scopeSummary({}), '전체 · 0원 · 매월 10일', '값이 없어도 터지지 않는다');
}

console.log('\n[이상한 값이 들어와도 버틴다]');
{
  eq(feeRule(null, null).amount, 30000, '클럽이 없어도 기본값');
  eq(feeRule({ settings: { feeAmount: '이만원' } }, null).amount, 0, '숫자가 아니면 0');
  eq(feeRule({ settings: { feeDueDay: 99 } }, null).dueDay, 31, '납부일은 31일을 넘지 않는다');
  eq(feeRule({ settings: { feeDueDay: 0 } }, null).dueDay, 1, '0일도 없다');
  eq(feeRule({ settings: { feeAmount: -5000 } }, null).amount, 0, '음수 회비는 없다');
  eq(billingScopes(null, null).length, 1, '아무것도 없어도 한 줄은 나온다');
  eq(memberBill(null, null, null).total, 30000, '기본값으로라도 청구한다');
  eq(membersInScope(null, 'v1'), [], '회원이 없으면 빈 목록');
}

console.log(`\n하이어라키 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
