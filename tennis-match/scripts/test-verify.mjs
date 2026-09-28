/* 이메일 인증 — 누구를 막는가 (src/lib/verify.js) */
import { needsEmailVerify, VERIFY_REQUIRED_FROM, resendWait, MAIL_HINT } from '../src/lib/verify.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const NEW = '2026-09-28T03:00:00Z';
const OLD = '2026-08-01T00:00:00Z';

console.log('[누구를 막나]');
ok(needsEmailVerify({ providers: ['password'], emailVerified: false, createdAt: NEW }), '새로 가입한 비밀번호 계정 · 미인증 → 막는다');
ok(!needsEmailVerify({ providers: ['password'], emailVerified: true, createdAt: NEW }), '인증을 마쳤으면 통과');
ok(!needsEmailVerify({ providers: ['password'], emailVerified: false, createdAt: OLD }), '이 기능 전에 가입한 회원은 잠그지 않는다');
ok(!needsEmailVerify({ providers: ['google.com'], emailVerified: true, createdAt: NEW }), '구글은 통과');
ok(!needsEmailVerify({ providers: ['password', 'google.com'], emailVerified: true, createdAt: NEW }), '구글이 붙은 계정은 인증된 것');
ok(!needsEmailVerify({ providers: [], emailVerified: false, createdAt: NEW }), '카카오·네이버(커스텀 토큰)는 통과');
ok(!needsEmailVerify({ isAnonymous: true, providers: [], createdAt: NEW }), '둘러보기는 통과');
ok(!needsEmailVerify(null), '로그인 안 됨');
ok(needsEmailVerify({ providers: ['password'], createdAt: Date.parse(NEW) }), '가입 시각이 숫자여도');
ok(!needsEmailVerify({ providers: ['password'], createdAt: 'Mon, 01 Sep 2026 00:00:00 GMT' }), 'Firebase 시각 문자열(예전)도 읽는다');
ok(needsEmailVerify({ providers: ['password'], createdAt: 'Mon, 28 Sep 2026 01:00:00 GMT' }), 'Firebase 시각 문자열(새)도 읽는다');
ok(VERIFY_REQUIRED_FROM === '2026-09-27T15:00:00Z', '기준은 한국 9/28 0시');

console.log('[다시 보내기 간격]');
ok(resendWait(0) === 0, '처음은 바로');
ok(resendWait(1000, 1000 + 10_000) === 50, '10초 뒤면 50초 기다림');
ok(resendWait(1000, 1000 + 61_000) === 0, '1분 지나면 바로');
ok(/스팸함/.test(MAIL_HINT) && /firebaseapp\.com/.test(MAIL_HINT), '메일 안내에 스팸함과 보내는 주소');

console.log('[연결]');
const layout = readFileSync(new URL('../app/_layout.jsx', import.meta.url), 'utf8');
ok(/needsVerify/.test(layout) && /'\/verify'/.test(layout), '라우팅 가드가 인증 화면으로 보낸다');
const auth = readFileSync(new URL('../src/lib/auth.js', import.meta.url), 'utf8');
ok(/sendEmailVerification/.test(auth), '가입하면 인증 메일을 보낸다');
ok((auth.match(/languageCode = 'ko'/g) || []).length >= 2, '인증·재설정 메일을 한국어로');

console.log(`\n이메일 인증 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
