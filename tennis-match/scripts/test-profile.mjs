/* 내 프로필 (src/lib/profile.js) */
import { loginMethodOf, profilePatch } from '../src/lib/profile.js';
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

console.log(`\n내 프로필 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
