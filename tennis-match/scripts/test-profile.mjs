/* 내 프로필 (src/lib/profile.js) */
import { loginMethodOf, profilePatch, signupMissing, signupMissingText } from '../src/lib/profile.js';
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('  ✗', m, '— 기대', JSON.stringify(b), '/ 실제', JSON.stringify(a)); } };

eq(loginMethodOf({ uid: 'kakao:123' }), '카카오', '카카오');
eq(loginMethodOf({ uid: 'naver:abc' }), '네이버', '네이버');
eq(loginMethodOf({ uid: 'x', providerData: [{ providerId: 'google.com' }] }), '구글', '구글');
eq(loginMethodOf({ uid: 'x', providerData: [{ providerId: 'password' }] }), '이메일', '이메일');
eq(loginMethodOf({ uid: 'x', isAnonymous: true, providerData: [] }), '둘러보기(계정 없음)', '익명');
eq(loginMethodOf(null), '', '로그인 안 함');

eq(profilePatch({ name: '  ' }, {}).error, '이름을 입력하세요', '이름 필수');
eq(profilePatch({ name: '김코트', gender: 'F', region: '서울 송파구' }, {}).patch,
  { name: '김코트', gender: 'F', region: '서울 송파구' }, '기본 칸만');
eq(profilePatch({ name: 'a', busu: '1부', grade: 'A', role: '회장', venueIds: ['v'] }, {}).patch,
  { name: 'a', gender: 'M', region: '' }, '부수·조·역할·코트장은 본인이 못 바꾼다');
eq(profilePatch({ name: 'a', startedAt: '2019-03' }, {}).patch.startedAt, '2019-03-01', '구력 처음 넣기');
eq(profilePatch({ name: 'a', startedAt: '2019-03' }, { startedAt: '2015-01-01' }).patch.startedAt, undefined, '이미 있으면 덮어쓰지 않는다');
eq(profilePatch({ name: 'a', startedAt: '2019-13' }, {}).error, '테니스 시작 년월을 확인하세요', '잘못된 달');

/* 가입 필수 칸 — 이름·성별·활동 지역·테니스 시작 년월 */
eq(signupMissing({}), ['name', 'gender', 'region', 'startedAt'], '빈 가입서는 네 칸 다 빠짐');
eq(signupMissing({ name: '김코트', gender: 'F', region: '서울 송파구', startedAt: '2019-03-01' }), [], '다 넣으면 통과');
eq(signupMissing({ name: '  ', gender: '', region: '서울', startedAt: '2019-03' }), ['name', 'gender'], '공백 이름·성별 미선택');
eq(signupMissingText(['gender', 'startedAt']), '위의 필수 칸(*)을 채워 주세요: 성별 · 테니스 시작 년월', '무엇을 넣어야 하는지 이름으로 알려 준다');
eq(signupMissingText([]), '', '다 넣었으면 안내 없음');
{
  const onb = readFileSync(new URL('../app/onboarding.jsx', import.meta.url), 'utf8');
  eq(/markSkipped\?\.\(\);\s*router\.replace\('\/\(tabs\)'\)/.test(onb), true,
    '「나중에」로 가입하면 앱 상태도 둘러보기로 바꾼다 — 안 그러면 같은 화면으로 되돌아온다(네이버 가입에서 겪음)');
  eq(/useState\(''\);[^\n]*\n?[^\n]*/.test(onb) && /const \[gender, setGender\] = useState\(''\)/.test(onb), true, '성별을 미리 골라 두지 않는다');
  eq((onb.match(/<Label required/g) || []).length, 4, '필수 칸 네 개에 * 표시');
  eq(/catch \(e\) \{\s*setBusy\(false\);\s*setErr\(/.test(onb), true, '저장에 실패하면 조용히 넘어가지 않고 알린다');
  const lay = readFileSync(new URL('../app/_layout.jsx', import.meta.url), 'utf8');
  eq(/skipped: true/.test(lay) && /markSkipped,/.test(lay), true, '앱 뿌리가 markSkipped 를 준다');
}

console.log(`\n내 프로필 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
