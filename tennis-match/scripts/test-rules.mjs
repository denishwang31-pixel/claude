/* Firestore Security Rules 테스트 (FIX-03/04/05 검증)
   실행: npm run test:rules  (= firebase emulators:exec --only firestore "node scripts/test-rules.mjs")
   요구: Java 17+, firebase-tools, @firebase/rules-unit-testing */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-tennis-rules',
  firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8089),
  },
});

let pass = 0, fail = 0;
async function T(name, promise) {
  try { await promise; pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.error('  ✗', name, '\n    ', e.message?.split('\n')[0]); }
}

/* ---- 픽스처: 클럽/총무/회원/초대코드/모임/게시글/게스트모집 ---- */
const CLUB = 'club1';
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'clubs', CLUB), { name: '테스트클럽', ownerId: 'owner1', inviteCode: 'ABC234' });
  await setDoc(doc(db, 'inviteCodes', 'ABC234'), { clubId: CLUB, clubName: '테스트클럽' });
  await setDoc(doc(db, 'clubs', CLUB, 'members', 'owner1'), { name: '총무', gender: 'M', grade: 'B', role: '총무', status: '활동' });
  await setDoc(doc(db, 'clubs', CLUB, 'members', 'mem1'), { name: '회원1', gender: 'F', grade: 'B', role: '회원', status: '활동' });
  await setDoc(doc(db, 'clubs', CLUB, 'members', 'mem2'), { name: '회원2', gender: 'M', grade: 'C', role: '회원', status: '활동' });
  await setDoc(doc(db, 'clubs', CLUB, 'meetings', 'mt1'), { date: '2099-01-01', rsvp: { mem1: 'no' }, guests: [], matches: [], restScores: {}, canceled: false });
  await setDoc(doc(db, 'clubs', CLUB, 'posts', 'p1'), { type: 'notice', title: '공지', body: '내용', author: '총무', authorId: 'owner1', pinned: true, comments: [] });
  await setDoc(doc(db, 'guestPosts', 'gp1'), { clubId: CLUB, clubName: '테스트클럽', date: '2099-01-01', slots: 2 });
});

const owner = env.authenticatedContext('owner1').firestore();   // 총무
const mem1 = env.authenticatedContext('mem1').firestore();      // 일반 회원
const joiner = env.authenticatedContext('newbie').firestore();  // 비멤버(가입 희망)
const outsider = env.authenticatedContext('other9').firestore();// 타 클럽 사용자
const anon = env.unauthenticatedContext().firestore();

console.log('\n[초대코드 / 가입 (FIX-04)]');
await T('로그인 사용자 초대코드 단건 조회 허용',
  assertSucceeds(getDoc(doc(joiner, 'inviteCodes', 'ABC234'))));
await T('비로그인 초대코드 조회 거부',
  assertFails(getDoc(doc(anon, 'inviteCodes', 'ABC234'))));
await T('초대코드 목록 열거 거부',
  assertFails(getDocs(collection(joiner, 'inviteCodes'))));
await T('유효 초대코드로 자가 가입 허용',
  assertSucceeds(setDoc(doc(joiner, 'clubs', CLUB, 'members', 'newbie'),
    { name: '신규', gender: 'M', grade: 'B', role: '회원', status: '활동', joinCode: 'ABC234' })));
await T('초대코드 없이 자가 가입 거부',
  assertFails(setDoc(doc(outsider, 'clubs', CLUB, 'members', 'other9'),
    { name: '침입', gender: 'M', grade: 'B', role: '회원', status: '활동' })));
await T('틀린 초대코드 가입 거부',
  assertFails(setDoc(doc(outsider, 'clubs', CLUB, 'members', 'other9'),
    { name: '침입', gender: 'M', grade: 'B', role: '회원', status: '활동', joinCode: 'WRONG1' })));
await T('타인 uid 문서 생성 거부(비관리자)',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'members', 'someoneelse'),
    { name: 'x', role: '회원', status: '활동', joinCode: 'ABC234' })));
await T('총무의 회원 문서 생성 허용(오프라인 등록/시드)',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'members', 'local:abc'),
    { name: '수기', gender: 'F', grade: 'B', role: '회원', status: '활동' })));

console.log('\n[모임 RSVP (FIX-03 S-2)]');
await T('본인 RSVP 변경 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'), { 'rsvp.mem1': 'yes' })));
await T('타인 RSVP 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'), { 'rsvp.mem2': 'yes' })));
await T('회원의 rsvp 외 필드 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'), { canceled: true })));
await T('총무의 모임 편집 허용(대진 저장)',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'meetings', 'mt1'), { matches: [{ id: 'x' }] })));

console.log('\n[게시판 (FIX-03 S-3)]');
await T('회원 댓글 추가 허용(comments만)',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'posts', 'p1'),
    { comments: [{ id: 'c1', author: '회원1', body: '넵' }] })));
await T('회원의 공지 본문 덮어쓰기 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'posts', 'p1'), { title: '해킹' })));
await T('회원 글 작성 허용(본인 authorId)',
  assertSucceeds(setDoc(doc(mem1, 'clubs', CLUB, 'posts', 'p2'),
    { type: 'free', title: '자유', body: 'ㅎㅇ', author: '회원1', authorId: 'mem1', comments: [] })));
await T('authorId 위조 글 작성 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'posts', 'p3'),
    { type: 'free', title: 'x', body: 'x', author: '총무', authorId: 'owner1', comments: [] })));

console.log('\n[게스트 모집 (FIX-05)]');
await T('타 클럽 사용자도 모집글 읽기 허용(공개)',
  assertSucceeds(getDoc(doc(outsider, 'guestPosts', 'gp1'))));
await T('본인 신청 문서 생성 허용',
  assertSucceeds(setDoc(doc(outsider, 'guestPosts', 'gp1', 'applicants', 'other9'),
    { uid: 'other9', name: '외부인', gender: 'M', grade: 'B', status: 'applied' })));
await T('타인 명의 신청 거부',
  assertFails(setDoc(doc(outsider, 'guestPosts', 'gp1', 'applicants', 'mem1'),
    { uid: 'mem1', name: '사칭', status: 'applied' })));
await T('신청자 본인의 확정(status 변경) 거부',
  assertFails(updateDoc(doc(outsider, 'guestPosts', 'gp1', 'applicants', 'other9'),
    { status: 'confirmed' })));
await T('모집 클럽 총무의 확정 허용',
  assertSucceeds(updateDoc(doc(owner, 'guestPosts', 'gp1', 'applicants', 'other9'),
    { status: 'confirmed' })));
await T('일반 회원의 모집글 생성 거부',
  assertFails(setDoc(doc(mem1, 'guestPosts', 'gp2'), { clubId: CLUB, date: '2099-02-01', slots: 2 })));
await T('총무의 모집글 생성 허용',
  assertSucceeds(setDoc(doc(owner, 'guestPosts', 'gp2'), { clubId: CLUB, clubName: '테스트클럽', date: '2099-02-01', slots: 2 })));

console.log('\n[클럽 생성(온보딩)]');
await T('오너 클럽 생성 + 본인 멤버 문서 허용', (async () => {
  const nb = env.authenticatedContext('founder').firestore();
  await assertSucceeds(setDoc(doc(nb, 'clubs', 'club2'), { name: '새클럽', ownerId: 'founder' }));
  await assertSucceeds(setDoc(doc(nb, 'clubs', 'club2', 'members', 'founder'),
    { name: '창립자', gender: 'M', grade: 'B', role: '총무', status: '활동' }));
})());
await T('ownerId 불일치 클럽 생성 거부',
  assertFails(setDoc(doc(mem1, 'clubs', 'club3'), { name: '사칭클럽', ownerId: 'owner1' })));

console.log('\n[회비/기타]');
await T('회원 회비 읽기 허용',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'fees', '2026-07'))));
await T('회원 회비 쓰기 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'fees', '2026-07'), { paid: { mem1: true } })));
await T('비멤버의 클럽 문서 읽기 거부',
  assertFails(getDoc(doc(outsider, 'clubs', CLUB))));

await env.cleanup();
console.log(`\n규칙 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
