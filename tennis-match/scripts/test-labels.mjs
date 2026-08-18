/* 화면 이름 일관성 — 안내 문구가 가리키는 메뉴가 실제로 있는가.

   실제로 있었던 문제
     홈 화면에 "운영진이 [회원] 화면에서 소속 코트장을 지정하면" 이라고
     적어 뒀는데 실제 메뉴 이름은 [회원 목록]이었다. 회원은 그 메뉴를
     찾다가 포기한다. 코드가 도는 데는 지장이 없어서 아무도 모른다.

   그래서 화면 이름을 constants.js 의 SCREEN 한 곳에서만 정하고,
   여기서 "UI 문구에 대괄호로 적힌 이름이 실제 메뉴에 있는가"를 대조한다. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREEN, screenRef } from '../src/lib/constants.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.js', '.jsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

console.log('[화면 이름 사전]');
const labels = Object.values(SCREEN);
ok(labels.length > 0, 'SCREEN 이 비어 있지 않다');
ok(new Set(labels).size === labels.length,
  `이름이 겹치지 않는다 (${labels.length}개)`);
ok(labels.every((l) => typeof l === 'string' && l.trim()), '모든 이름이 비어 있지 않다');
ok(screenRef('members') === '[회원 목록]', `screenRef 형식 (${screenRef('members')})`);
ok(screenRef('없는키') === '[없는키]', '모르는 키는 그대로 돌려준다');

console.log('[메뉴에 없는 이름을 문구에서 가리키지 않는다]');
/* 화면 이름이 아닌 대괄호 표현 — 같은 화면 안의 버튼·상태 표시.
   메뉴를 가리키는 게 아니라 "이 화면의 저 버튼"이라 검사 대상이 아니다.
   새로 추가할 때는 정말 버튼인지 확인하고 넣을 것. */
const NOT_SCREENS = new Set([
  // 공용 버튼·조작
  '전체', '취소', '삭제', '승인', '거절', '직접 지정', '‹ 뒤로',
  '＋ 새 모임', '＋ 새 정산', '가입 신청',
  // 코트 검색
  '예약하기', '예약 찾기',
  // 대진·대회 화면 안의 버튼
  '자동 대진 생성', '대진 생성', '다시 생성', '자동 배정', '경기 방식',
  // 로그인 화면
  '회원가입', '로그인',
]);

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))];
let refs = 0;
for (const file of files) {
  const rel = file.slice(ROOT.length + 1);
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 주석은 설명용이라 제외
    .replace(/\/\/[^\n]*/g, ' ');

  /* 화면을 가리키는 표현만 본다 — "[X]에서", "[X]로", "[X] 화면" */
  for (const m of src.matchAll(/\[([가-힣A-Za-z0-9·\s]{2,20})\]\s*(?:화면|에서|으로|로|에|을|를)/g)) {
    const name = m[1].trim();
    if (NOT_SCREENS.has(name)) continue;
    refs += 1;
    ok(labels.includes(name),
      `${rel}: "[${name}]" 은(는) 실제 메뉴에 없습니다 — 사용자가 찾지 못합니다`);
  }
}
console.log(`[문구 ${refs}건 대조]`);

console.log(`\n화면 이름 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
