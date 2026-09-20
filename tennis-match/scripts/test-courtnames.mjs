/* 코트 이름 검사.

   ⚠️ 이름은 표시용이고 저장된 대진의 court 는 계속 숫자다. 그 경계가
      흐트러지면 이미 쌓인 대진·전적이 어긋난다. 그래서 "모르는 번호가
      와도 숫자를 그대로 돌려주는가"를 특히 본다. */
import {
  defaultCourtName, normalizeCourtNames, courtNamesOf, courtLabel,
  hasCustomNames, courtNameProblems,
} from '../src/lib/courtNames.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 받은 값: ${JSON.stringify(a)}`);

console.log('[이름을 안 정했으면 예전 그대로]');
/* ⚠️ 지금까지 만든 모든 코트장에는 courtNames 가 없다. 그 클럽들의
   화면이 조금이라도 달라지면 안 된다. */
eq('없으면 1..N', courtNamesOf({ courts: 3 }), ['1', '2', '3']);
eq('빈 배열이어도 1..N', courtNamesOf({ courts: 2, courtNames: [] }), ['1', '2']);
eq('코트장이 없으면 빈 목록', courtNamesOf(null), []);
eq('면수가 0이면 빈 목록', courtNamesOf({ courts: 0 }), []);
eq('면수가 이상하면 빈 목록', courtNamesOf({ courts: '세 면' }), []);

console.log('[정한 이름을 쓴다]');
eq('A B C', courtNamesOf({ courts: 3, courtNames: ['A', 'B', 'C'] }), ['A', 'B', 'C']);
eq('9 10 11', courtNamesOf({ courts: 3, courtNames: ['9', '10', '11'] }), ['9', '10', '11']);
eq('앞뒤 공백은 걷어낸다',
  courtNamesOf({ courts: 2, courtNames: [' A ', 'B '] }), ['A', 'B']);

console.log('[면수와 이름 수가 안 맞을 때]');
/* ⚠️ 면수를 줄였는데 이름이 남아 있으면, 나중에 다시 늘릴 때 고친 적
   없는 이름이 되살아난다. 그건 이상하게 느껴진다. */
eq('면수가 줄면 뒤를 자른다',
  normalizeCourtNames(['A', 'B', 'C'], 2), ['A', 'B']);
eq('면수가 늘면 기본 이름으로 채운다',
  normalizeCourtNames(['A'], 3), ['A', '2', '3']);
/* 빈 칸은 기본 이름으로 — 표에 빈칸이 나오면 고장으로 보인다 */
eq('중간이 비면 그 자리만 기본값',
  normalizeCourtNames(['A', '', 'C'], 3), ['A', '2', 'C']);
eq('null 이 섞여도 죽지 않는다',
  normalizeCourtNames(['A', null, undefined], 3), ['A', '2', '3']);
eq('배열이 아니어도 죽지 않는다', normalizeCourtNames('A,B', 2), ['1', '2']);

console.log('[표에 쓸 이름]');
const V = { courts: 3, courtNames: ['A', 'B', 'C'] };
eq('1번은 A', courtLabel(V, 1), 'A');
eq('3번은 C', courtLabel(V, 3), 'C');
/* ⚠️ 여기가 제일 중요하다. 코트장을 지웠거나 면수를 줄인 뒤의 옛
   대진에서 실제로 일어난다. 빈 문자열을 돌려주면 표에 빈칸이 생겨
   "대진이 깨졌다"로 보인다. */
eq('범위를 넘으면 숫자를 그대로', courtLabel(V, 5), '5');
eq('코트장이 없으면 숫자를 그대로', courtLabel(null, 2), '2');
eq('이름을 안 정했으면 숫자', courtLabel({ courts: 3 }, 2), '2');
eq('0 이면 그대로', courtLabel(V, 0), '0');
eq('숫자가 아니면 그대로', courtLabel(V, '중앙'), '중앙');

console.log('[따로 정했는가]');
ok(hasCustomNames(V), 'A B C 는 따로 정한 것');
ok(!hasCustomNames({ courts: 3 }), '안 정했으면 아니다');
ok(!hasCustomNames({ courts: 3, courtNames: ['1', '2', '3'] }),
  '1 2 3 을 적어 넣은 것은 기본값과 같다');
ok(hasCustomNames({ courts: 3, courtNames: ['1', '2', '9'] }),
  '하나만 달라도 정한 것');

console.log('[저장 전에 막는 것]');
/* 같은 이름이 둘이면 표에서 두 코트가 같은 이름으로 나와,
   어느 코트로 가야 하는지 알 수 없다. */
eq('같은 이름을 잡는다',
  courtNameProblems(['A', 'A', 'B'], 3).length, 1);
eq('대소문자만 다른 것도 같은 이름으로 본다',
  courtNameProblems(['a', 'A'], 2).length, 1);
eq('제대로 적었으면 문제 없음', courtNameProblems(['A', 'B', 'C'], 3), []);
eq('안 적었어도 문제 없음 — 1,2,3 은 서로 다르다',
  courtNameProblems([], 3), []);
ok(courtNameProblems(['아주아주아주긴이름'], 1).length === 1, '너무 긴 이름을 잡는다');

console.log(`\n코트 이름 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
