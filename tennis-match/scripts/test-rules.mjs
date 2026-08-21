/* Firestore Security Rules 테스트 (FIX-03/04/05 검증)
   실행: npm run test:rules  (= firebase emulators:exec --only firestore "node scripts/test-rules.mjs")
   요구: Java 17+, firebase-tools, @firebase/rules-unit-testing */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

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
  await setDoc(doc(db, 'clubs', CLUB, 'members', 'owner1'), { name: '회장', gender: 'M', grade: 'B', role: '회장', status: '활동' });
  await setDoc(doc(db, 'clubs', CLUB, 'members', 'mem1'), { name: '회원1', gender: 'F', grade: 'B', role: '회원', status: '활동' });
  await setDoc(doc(db, 'clubs', CLUB, 'members', 'mem2'), { name: '회원2', gender: 'M', grade: 'C', role: '회원', status: '활동' });
  await setDoc(doc(db, 'clubs', CLUB, 'meetings', 'mt1'), { date: '2099-01-01', rsvp: { mem1: 'no' }, guests: [], matches: [], restScores: {}, canceled: false });
  await setDoc(doc(db, 'clubs', CLUB, 'posts', 'p1'), { type: 'notice', title: '공지', body: '내용', author: '총무', authorId: 'owner1', pinned: true, comments: [] });
  await setDoc(doc(db, 'guestPosts', 'gp1'), { clubId: CLUB, clubName: '테스트클럽', date: '2099-01-01', slots: 2 });
  // 앱 운영자 명단 — 콘솔에서만 만들 수 있는 문서(클라이언트 쓰기 불가)
  await setDoc(doc(db, 'appAdmins', 'appboss'), { note: '앱 운영자' });
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

/* rsvpBy — "누가 눌렀는지". 서버가 이걸 보고 본인이 마음을 바꾼 것만
   운영진에게 알린다. 남의 이름으로 쓸 수 있으면 알림을 조작할 수 있다. */
await T('본인 RSVP + rsvpBy 동시 기록 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'),
    { 'rsvp.mem1': 'maybe', 'rsvpBy.mem1': 'mem1' })));
await T('rsvpBy 를 남의 이름으로 쓰는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'),
    { 'rsvp.mem1': 'yes', 'rsvpBy.mem1': 'owner1' })));
await T('타인의 rsvpBy 항목 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'),
    { 'rsvpBy.mem2': 'mem1' })));

/* 역할 겸임 — roles 배열이 새 권한 통로가 되면 안 된다.
   규칙은 role 문자열 하나로 판단하므로, roles 에 몰래 '회장'을 넣어
   화면상 권한을 얻는 길을 막아야 한다. */
console.log('\n[역할 겸임]');
await T('회장의 겸임 지정 허용(운영진+리드)',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'members', 'mem2'),
    { roles: ['운영진', '리드'], role: '운영진' })));
await T('회장이 아닌 운영 담당의 roles 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem2'),
    { roles: ['운영진', '리드'], role: '운영진' })));
await T('본인이 자기 roles 를 바꾸는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'),
    { roles: ['회장'], role: '회장' })));
await T('role 은 그대로 두고 roles 에만 회장을 넣는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'),
    { roles: ['회장', '회원'] })));
await T('회장은 roles 로 회장 겸임도 지정 가능',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'members', 'mem2'),
    { roles: ['총무', '리드'], role: '총무' })));
await T('회원의 프로필 수정은 roles 를 안 건드리면 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { busu: '3부' })));

/* 이 블록이 바꿔 놓은 상태를 되돌린다.
   안 되돌리면 뒤 테스트가 "같은 값 쓰기"가 되어 diff() 가 비고, 규칙이
   빈 집합에 대해 참을 돌려주면서 거부돼야 할 것이 통과한다.
   (회비 테스트에서 한 번 당한 적이 있는 함정이다) */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'mem2'),
    { name: '회원2', gender: 'M', grade: 'C', role: '회원', status: '활동' });
});

console.log('\n[참석 투표 요청]');
await T('총무의 투표 요청 생성 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'j1'),
    { type: 'rsvpAsk', meetingId: 'mt1', by: 'owner1', targets: ['mem1'], status: 'queued' })));
await T('일반 회원의 투표 요청 생성 거부(전체 알림 통로가 되면 안 된다)',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'pushJobs', 'j2'),
    { type: 'rsvpAsk', meetingId: 'mt1', by: 'mem1', status: 'queued' })));
await T('남의 이름으로 요청 생성 거부',
  assertFails(setDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'j3'),
    { type: 'rsvpAsk', meetingId: 'mt1', by: 'mem1', status: 'queued' })));
await T('모르는 종류의 작업 생성 거부',
  assertFails(setDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'j4'),
    { type: 'broadcast', by: 'owner1' })));
await T('발송 결과 위조 거부(서버만 쓴다)',
  assertFails(updateDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'j1'), { status: 'done', sent: 99 })));
await T('일반 회원의 요청 내역 조회 거부',
  assertFails(getDoc(doc(mem1, 'clubs', CLUB, 'pushJobs', 'j1'))));
await T('총무의 요청 내역 조회 허용',
  assertSucceeds(getDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'j1'))));

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

console.log('\n[NTRP 등급]');
await T('본인 셀프 평가 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { ntrpSelf: 3.5 })));
await T('타인에 대한 내 투표 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem2'), { 'ntrpVotes.mem1': 3.5 })));
await T('타인 명의 투표 위조 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem2'), { 'ntrpVotes.owner1': 5.0 })));
await T('일반 회원의 인증등급 설정 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem2'), { ntrpCertified: 5.0 })));
await T('운영진의 인증등급 설정 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'members', 'mem2'), { ntrpCertified: 4.0 })));
await T('회원이 남의 이름/역할 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem2'), { role: '총무' })));

console.log('\n[출석 / 대회 / 커플]');
await T('총무의 출석 체크 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'meetings', 'mt1'), { 'attendance.mem1': true })));
await T('일반 회원의 출석 조작 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'), { 'attendance.mem2': true })));
await T('총무의 대회 개설 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'tournaments', 't1'),
    { name: '봄대회', date: '2099-03-01', entries: [], stage: 'group', status: 'ongoing' })));
await T('회원의 대회 읽기 허용',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'tournaments', 't1'))));
await T('회원의 대회 결과 조작 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'tournaments', 't1'), { status: 'finished' })));
// Firestore 는 중첩 배열 불가 → 객체 배열로 저장(firestore.js setPairs 가 변환)
await T('총무의 커플/페어 설정 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'meta', 'pairs'),
    { couples: [{ a: 'mem1', b: 'mem2' }], fixedPairs: [] })));
await T('회원의 커플/페어 설정 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'meta', 'pairs'), { couples: [], fixedPairs: [] })));

console.log('\n[코트장 / 대진 설정]');
await T('총무의 코트장 등록 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'venues', 'v1'),
    { name: '올림픽공원', courts: 3, startTime: '10:00', endTime: '13:00', roundMinutes: 40, leadId: 'mem1' })));
await T('회원의 코트장 읽기 허용',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'venues', 'v1'))));
await T('회원의 코트장 수정 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'venues', 'v1'), { courts: 99 })));
await T('총무의 대진 기본설정 저장 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'meta', 'matchConfig'),
    { defaultRoundType: 'MX', skillBalance: true, allowMixed: false })));
await T('회원의 대진 기본설정 변경 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'meta', 'matchConfig'), { defaultRoundType: 'SINGLES' })));
await T('회원의 모임 타임유형(roundPlan) 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'meetings', 'mt1'), { roundPlan: { 1: 'SINGLES' } })));
await T('총무의 타임유형 변경 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'meetings', 'mt1'), { roundPlan: { 1: 'SINGLES' } })));

console.log('\n[역할 임명 / 지출 / 용품·원포인트]');
// mem2 로 임명 테스트(뒤 테스트가 쓰는 mem1 은 일반 회원으로 유지)
await T('회장의 역할 임명 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'members', 'mem2'), { role: '리드' })));
await T('임명된 리드도 운영 권한 보유(일정 수정)',
  assertSucceeds(updateDoc(doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'meetings', 'mt1'), { courts: 3 })));
await T('리드는 회비 조회 거부(회장·총무 전용)',
  assertFails(getDoc(doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'fees', '2026-07'))));
await T('리드는 지출 등록 거부(회장·총무 전용)',
  assertFails(setDoc(doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'expenses', 'e9'),
    { date: '2099-02-01', category: '기타', amount: 1000 })));
await T('리드는 역할 임명 불가(회장 전용)',
  assertFails(updateDoc(doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'members', 'mem1'), { role: '총무' })));
// 예전 이름 '책임리더' 도 리드와 같게 인정되는지
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'mem2'), { role: '책임리더' });
});
await T('예전 역할명 책임리더도 운영 권한 인정',
  assertSucceeds(updateDoc(doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'meetings', 'mt1'), { courts: 2 })));
// '운영진' 역할도 운영 권한은 있으나 회비는 못 본다
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'mem2'), { role: '운영진' });
});
await T('운영진의 일정 수정 허용',
  assertSucceeds(updateDoc(doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'meetings', 'mt1'), { courts: 4 })));
await T('운영진의 회비 조회 거부(회장·총무 전용)',
  assertFails(getDoc(doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'fees', '2026-07'))));
// 원상 복구 — 이후 테스트가 mem2 를 일반 회원으로 가정
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'mem2'), { role: '회원' });
});

/* 구 버전 클럽 구제 — 예전에는 클럽 생성자에게 '총무'를 줬다.
   그러면 회장이 아무도 없는데 임명은 회장만 할 수 있어 교착에 빠진다.
   소유자(ownerId)는 저장된 역할과 무관하게 회장으로 인정해야 한다. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'owner1'), { role: '총무' });
});
await T('소유자는 역할이 총무여도 임명 가능(교착 해소)',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'members', 'mem2'), { role: '운영진' })));
await T('소유자는 자기 역할을 회장으로 올릴 수 있다',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'members', 'owner1'), { role: '회장' })));
await T('소유자는 회비도 볼 수 있다',
  assertSucceeds(getDoc(doc(owner, 'clubs', CLUB, 'fees', '2026-07'))));
await T('소유자가 아닌 총무는 임명 불가',
  assertFails(updateDoc(doc(env.authenticatedContext('mem2').firestore(),
    'clubs', CLUB, 'members', 'mem1'), { role: '회장' })));
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'mem2'), { role: '회원' });
});
await T('일반 회원의 역할 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem2'), { role: '총무' })));
await T('본인이 자기 역할 승격 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { role: '회장' })));
await T('회원 본인 프로필(성별) 수정 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { gender: 'M', grade: '' })));
await T('운영진의 회원 삭제 허용',
  assertSucceeds(deleteDoc(doc(owner, 'clubs', CLUB, 'members', 'local:abc'))));
await T('회장의 지출 등록 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'expenses', 'e1'),
    { date: '2099-01-05', category: '코트 대관', amount: 120000, venueId: null })));
await T('코트장별 지출 등록 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'expenses', 'e2'),
    { date: '2099-01-06', category: '코트 대관', amount: 80000, venueId: 'v1' })));
await T('일반 회원의 지출 조회 거부(회장·총무 전용)',
  assertFails(getDoc(doc(mem1, 'clubs', CLUB, 'expenses', 'e1'))));
await T('일반 회원의 회비 조회 거부(회장·총무 전용)',
  assertFails(getDoc(doc(mem1, 'clubs', CLUB, 'fees', '2026-07'))));
await T('운영진의 원포인트 영상 등록 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'tips', 't1'), { title: '포핸드', category: '포핸드', url: 'https://youtu.be/abc' })));
await T('회원의 원포인트 조회 허용',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'tips', 't1'))));

console.log('\n[구력 확인제도 — startedAt 잠금]');
await T('비어 있을 때 본인이 처음 입력 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { startedAt: '2019-03-01' })));
await T('기록된 구력을 본인이 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { startedAt: '2024-01-01' })));
await T('기록된 구력을 총무가 변경 거부(회장 아님)', (async () => {
  // mem2 를 잠시 총무로 만들어 확인 후 복구
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'mem2'), { role: '총무' });
  });
  const r = assertFails(updateDoc(
    doc(env.authenticatedContext('mem2').firestore(), 'clubs', CLUB, 'members', 'mem1'),
    { startedAt: '2024-01-01' },
  ));
  await r;
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'mem2'), { role: '회원' });
  });
})());
await T('회장의 구력 초기화 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'members', 'mem1'), { startedAt: '' })));
await T('초기화 후 본인이 다시 입력 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { startedAt: '2019-03-01' })));
await T('구력 잠금과 무관한 필드는 그대로 수정 가능',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'), { busu: '4부' })));
// 뒤 테스트가 mem1 프로필을 쓰므로 startedAt 은 남겨둬도 무방

console.log('\n[참가투표]');
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'clubs', CLUB, 'polls', 'pl1'),
    { type: 'choice', title: '유니폼 색', options: ['빨강', '파랑'], votes: {}, closed: false });
  await setDoc(doc(db, 'clubs', CLUB, 'polls', 'pl2'),
    { type: 'attend', title: '마감된 투표', votes: {}, closed: true });
});
await T('회원의 투표 조회 허용',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl1'))));
await T('회원이 자기 표 던지기 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl1'), { 'votes.mem1': '0' })));
await T('남의 표 조작 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl1'), { 'votes.mem2': '1' })));
await T('회원의 투표 제목 변경 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl1'), { title: '바꿔치기' })));
await T('회원의 투표 마감 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl1'), { closed: true })));
await T('마감된 투표에 표 던지기 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl2'), { 'votes.mem1': 'yes' })));
await T('회원의 투표 개설 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl3'), { title: '맘대로', votes: {} })));
await T('운영진의 투표 개설 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'polls', 'pl3'),
    { type: 'attend', title: '회식', votes: {}, closed: false })));
await T('운영진의 투표 마감 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'polls', 'pl3'), { closed: true })));
await T('회원의 투표 삭제 거부',
  assertFails(deleteDoc(doc(mem1, 'clubs', CLUB, 'polls', 'pl3'))));
await T('운영진의 투표 삭제 허용',
  assertSucceeds(deleteDoc(doc(owner, 'clubs', CLUB, 'polls', 'pl3'))));
await T('비멤버의 투표 조회 거부',
  assertFails(getDoc(doc(outsider, 'clubs', CLUB, 'polls', 'pl1'))));

console.log('\n[클럽 채팅]');
await T('회원의 메시지 작성 허용',
  assertSucceeds(setDoc(doc(mem1, 'clubs', CLUB, 'messages', 'msg1'),
    { body: '안녕하세요', authorId: 'mem1', author: '회원1' })));
await T('남의 이름으로 메시지 작성 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'messages', 'msg2'),
    { body: '사칭', authorId: 'owner1' })));
await T('회원의 메시지 조회 허용',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'messages', 'msg1'))));
await T('비멤버의 메시지 조회 거부',
  assertFails(getDoc(doc(outsider, 'clubs', CLUB, 'messages', 'msg1'))));
await T('메시지 내용 수정 거부(본인이어도)',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'messages', 'msg1'), { body: '바꿔치기' })));
await T('남의 메시지 삭제 거부',
  assertFails(deleteDoc(doc(joiner, 'clubs', CLUB, 'messages', 'msg1'))));
await T('본인 메시지 삭제 허용',
  assertSucceeds(deleteDoc(doc(mem1, 'clubs', CLUB, 'messages', 'msg1'))));
await T('운영진의 메시지 삭제 허용', (async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'clubs', CLUB, 'messages', 'msg3'),
      { body: '신고된 글', authorId: 'mem2' });
  });
  return assertSucceeds(deleteDoc(doc(owner, 'clubs', CLUB, 'messages', 'msg3')));
})());

console.log('\n[서비스 현황 카운터]');
await T('로그인 사용자의 카운터 증가 허용',
  assertSucceeds(setDoc(doc(mem1, 'stats', 'service'), { clubs: 1 }, { merge: true })));
await T('비로그인 카운터 증가 거부',
  assertFails(setDoc(doc(anon, 'stats', 'service'), { clubs: 99 }, { merge: true })));
await T('카운터 삭제 거부(운영진도)',
  assertFails(deleteDoc(doc(owner, 'stats', 'service'))));

console.log('\n[공개 클럽 목록 / 가입 신청 승인]');
await T('운영진의 공개 목록 등록 허용',
  assertSucceeds(setDoc(doc(owner, 'clubDirectory', CLUB),
    { name: '테스트클럽', nameLower: '테스트클럽', region: '경기 과천시', memberCount: 3, searchable: true })));
await T('비회원도 공개 목록 조회 허용(검색)',
  assertSucceeds(getDoc(doc(outsider, 'clubDirectory', CLUB))));
await T('비회원의 공개 목록 열거 허용(검색)',
  assertSucceeds(getDocs(collection(outsider, 'clubDirectory'))));
await T('비로그인 공개 목록 조회 거부',
  assertFails(getDoc(doc(anon, 'clubDirectory', CLUB))));
await T('타 클럽 사용자의 공개 목록 변조 거부',
  assertFails(updateDoc(doc(outsider, 'clubDirectory', CLUB), { name: '탈취됨' })));
await T('일반 회원의 공개 목록 변조 거부',
  assertFails(updateDoc(doc(mem1, 'clubDirectory', CLUB), { memberCount: 999 })));

await T('비회원의 가입 신청 생성 허용',
  assertSucceeds(setDoc(doc(outsider, 'clubs', CLUB, 'joinRequests', 'other9'),
    { name: '신청자', gender: 'M', status: 'pending' })));
await T('남의 이름으로 가입 신청 거부',
  assertFails(setDoc(doc(outsider, 'clubs', CLUB, 'joinRequests', 'someoneelse'),
    { name: '사칭', status: 'pending' })));
await T('처음부터 approved 로 신청 거부',
  assertFails(setDoc(doc(joiner, 'clubs', CLUB, 'joinRequests', 'newbie'),
    { name: '자가승인', status: 'approved' })));
await T('신청에 role 끼워넣기 거부',
  assertFails(setDoc(doc(joiner, 'clubs', CLUB, 'joinRequests', 'newbie'),
    { name: '자가임명', status: 'pending', role: '회장' })));
await T('신청자 본인의 신청 조회 허용',
  assertSucceeds(getDoc(doc(outsider, 'clubs', CLUB, 'joinRequests', 'other9'))));
await T('남의 신청 조회 거부',
  assertFails(getDoc(doc(joiner, 'clubs', CLUB, 'joinRequests', 'other9'))));
await T('운영진의 신청 목록 열람 허용',
  assertSucceeds(getDocs(collection(owner, 'clubs', CLUB, 'joinRequests'))));
await T('일반 회원의 신청 목록 열람 거부',
  assertFails(getDocs(collection(mem1, 'clubs', CLUB, 'joinRequests'))));
await T('신청자가 스스로 승인 처리 거부',
  assertFails(updateDoc(doc(outsider, 'clubs', CLUB, 'joinRequests', 'other9'), { status: 'approved' })));
await T('일반 회원의 승인 처리 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'joinRequests', 'other9'), { status: 'approved' })));
await T('운영진의 승인 처리 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubs', CLUB, 'joinRequests', 'other9'), { status: 'approved' })));
await T('승인 후 운영진의 회원 등록 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'members', 'other9'),
    { name: '신청자', gender: 'M', grade: 'B', role: '회원', status: '활동' })));
await T('신청자 본인의 신청 취소(삭제) 허용',
  assertSucceeds(deleteDoc(doc(outsider, 'clubs', CLUB, 'joinRequests', 'other9'))));
// 원상 복구 — 뒤의 "비멤버" 테스트가 other9 를 외부인으로 가정한다
await env.withSecurityRulesDisabled(async (ctx) => {
  await deleteDoc(doc(ctx.firestore(), 'clubs', CLUB, 'members', 'other9'));
});

console.log('\n[용품 = 앱 운영자 전용(루트 /gear)]');
const appAdmin = env.authenticatedContext('appboss').firestore();
await T('앱 운영자의 용품 등록 허용',
  assertSucceeds(setDoc(doc(appAdmin, 'gear', 'g1'), { title: '라켓', category: '라켓', price: 290000 })));
await T('앱 운영자의 용품 수정 허용',
  assertSucceeds(updateDoc(doc(appAdmin, 'gear', 'g1'), { price: 250000 })));
await T('일반 회원의 용품 조회 허용(전 클럽 공용)',
  assertSucceeds(getDoc(doc(mem1, 'gear', 'g1'))));
await T('타 클럽 사용자도 용품 조회 허용',
  assertSucceeds(getDoc(doc(outsider, 'gear', 'g1'))));
await T('비로그인 용품 조회 거부',
  assertFails(getDoc(doc(anon, 'gear', 'g1'))));
await T('클럽 운영진(총무)의 용품 등록 거부',
  assertFails(setDoc(doc(owner, 'gear', 'g2'), { title: '몰래광고' })));
await T('일반 회원의 용품 등록 거부',
  assertFails(setDoc(doc(mem1, 'gear', 'g3'), { title: '몰래광고' })));
await T('일반 회원의 용품 삭제 거부',
  assertFails(deleteDoc(doc(mem1, 'gear', 'g1'))));
await T('앱 운영자의 용품 삭제 허용',
  assertSucceeds(deleteDoc(doc(appAdmin, 'gear', 'g1'))));
await T('앱 운영자 명단 조회 허용(내 권한 확인용)',
  assertSucceeds(getDoc(doc(mem1, 'appAdmins', 'appboss'))));
await T('앱 운영자 명단 자가 등록 거부',
  assertFails(setDoc(doc(mem1, 'appAdmins', 'mem1'), { note: '내가 운영자' })));
/* 2026-08-21 정책 변경: 앱 운영자는 앱 안에서 인수인계할 수 있어야 한다.
   예전에는 콘솔에서만 가능해서 내가 사라지면 아무도 관리할 수 없었다.
   ⚠️ 여기서 mem1 을 승격시키면 뒤따르는 광고 집계 테스트가 통째로 무너진다
      (mem1 이 앱 운영자가 되어 "회원은 못 본다"가 거짓이 된다).
      실제로 그렇게 깨졌다. 승격 대상은 아무 데도 안 쓰는 uid 로 둔다. */
await T('앱 운영자가 명단에 다른 사람을 추가 허용(인수인계)',
  assertSucceeds(setDoc(doc(appAdmin, 'appAdmins', 'spare-admin'), { note: '승격' })));
await T('추가한 사람을 다시 내리기 허용',
  assertSucceeds(deleteDoc(doc(appAdmin, 'appAdmins', 'spare-admin'))));

console.log('\n[광고 집계(루트 /adStats)]');
await T('회원의 노출/클릭 집계 기록 허용',
  assertSucceeds(setDoc(doc(mem1, 'adStats', 'g1'), { impressions: 1 }, { merge: true })));
await T('타 클럽 사용자도 집계 기록 허용',
  assertSucceeds(setDoc(doc(outsider, 'adStats', 'g1'), { clicks: 1 }, { merge: true })));
await T('비로그인 집계 기록 거부',
  assertFails(setDoc(doc(anon, 'adStats', 'g1'), { clicks: 1 }, { merge: true })));
await T('회원의 광고 성과 조회 거부(앱 운영자 전용)',
  assertFails(getDoc(doc(mem1, 'adStats', 'g1'))));
await T('앱 운영자의 광고 성과 조회 허용',
  assertSucceeds(getDoc(doc(appAdmin, 'adStats', 'g1'))));
await T('회원의 집계 삭제 거부',
  assertFails(deleteDoc(doc(mem1, 'adStats', 'g1'))));

console.log('\n[일회성 정산 — 참여자는 자기 몫을 알아야 한다]');
await T('회장의 일회성 정산 개설 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'duesPools', 'p1'),
    { title: '9월 회식', total: 120000, participants: ['mem1'], paid: {} })));
await T('회원의 정산 조회 허용(내 몫이 얼마인지)',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'duesPools', 'p1'))));
await T('회원이 자기 납부를 체크하는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'duesPools', 'p1'), { 'paid.mem1': true })));
await T('회원의 정산 개설 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'duesPools', 'p2'), { title: '가짜' })));
await T('비회원의 정산 조회 거부',
  assertFails(getDoc(doc(env.authenticatedContext('outsider2').firestore(),
    'clubs', CLUB, 'duesPools', 'p1'))));

console.log('\n[회원 개인 납부 내역 — 본인은 보되 고칠 수는 없다]');
await T('회장의 개인 납부 기록 작성 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'memberFees', 'mem1'),
    { periods: { '2026-08': { paid: true, amount: 30000 } } })));
await T('본인의 납부 내역 조회 허용',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'memberFees', 'mem1'))));
await T('남의 납부 내역 조회 거부',
  assertFails(getDoc(doc(mem1, 'clubs', CLUB, 'memberFees', 'mem2'))));
await T('본인이 자기 납부 여부를 바꾸는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'memberFees', 'mem1'),
    { periods: { '2026-09': { paid: true, amount: 30000 } } })));
await T('본인이 미납을 납부로 뒤집는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'memberFees', 'mem1'),
    { 'periods.2026-08.paid': false })));
await T('본인의 확인 요청(claims) 작성 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'memberFees', 'mem1'),
    { claims: { '2026-08': { note: '8/1 이체했습니다', resolved: false } } })));
await T('claims 와 함께 periods 를 바꾸는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'memberFees', 'mem1'),
    { claims: { '2026-09': {} }, periods: { '2026-09': { paid: true } } })));
await T('남의 확인 요청 작성 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'memberFees', 'mem2'),
    { claims: { '2026-08': { note: '가짜' } } })));
await T('회장은 확인 요청을 처리할 수 있다',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'memberFees', 'mem1'),
    { claims: { '2026-08': { resolved: true } } }, { merge: true })));
await T('비회원의 개인 납부 내역 조회 거부',
  assertFails(getDoc(doc(env.authenticatedContext('outsider').firestore(),
    'clubs', CLUB, 'memberFees', 'mem1'))));

console.log('\n[총무 도구 — 회비 관련 문서는 회장·총무만]');
await T('회장의 입금자명 별칭 저장 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'meta', 'feeAliases'), { map: { 김철수부인: 'mem1' } })));
await T('일반 회원의 별칭 조회 거부',
  assertFails(getDoc(doc(mem1, 'clubs', CLUB, 'meta', 'feeAliases'))));
await T('일반 회원의 별칭 저장 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'meta', 'feeAliases'), { map: {} })));
await T('회장의 독촉 기록 저장 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'meta', 'dunning'), { sent: { '2026-08': { first: '2026-08-11' } } })));
await T('일반 회원의 독촉 기록 조회 거부',
  assertFails(getDoc(doc(mem1, 'clubs', CLUB, 'meta', 'dunning'))));
await T('회장의 회비 외 수입 등록 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'incomes', 'i1'),
    { label: '게스트비', amount: 60000, date: '2026-01-01' })));
await T('일반 회원의 수입 조회 거부',
  assertFails(getDoc(doc(mem1, 'clubs', CLUB, 'incomes', 'i1'))));
await T('인수인계 이력은 회원도 조회 가능(누가 총무인지)',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'meta', 'handover'))));
await T('일반 회원의 인수인계 이력 수정 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'meta', 'handover'), { history: [] })));
await T('편성 규칙은 회원도 조회 가능',
  assertSucceeds(getDoc(doc(mem1, 'clubs', CLUB, 'meta', 'rules'))));

/* ---------------- 클럽 교류전 ----------------
   두 클럽이 같은 문서를 본다. 권한을 한쪽에 몰아 두지 않으면
   마지막에 누른 쪽이 이기는 대진표가 된다. */
console.log('\n[클럽 교류전]');
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  // 상대 클럽 B — 회장 bpres, 회원 bmem
  await setDoc(doc(db, 'clubs', 'club2'), { name: '상대클럽', ownerId: 'bpres', inviteCode: 'ZZZ999' });
  await setDoc(doc(db, 'clubs', 'club2', 'members', 'bpres'), { name: 'B회장', gender: 'M', role: '회장', status: '활동' });
  await setDoc(doc(db, 'clubs', 'club2', 'members', 'bmem'), { name: 'B회원', gender: 'F', role: '회원', status: '활동' });
  await setDoc(doc(db, 'clubMatches', 'cm1'), {
    kind: 'linked', hostClubId: CLUB, hostClubName: '테스트클럽',
    guestClubId: 'club2', guestClubName: '상대클럽',
    date: '2099-09-01', status: 'pending', createdBy: 'owner1',
    config: {}, hostRoster: [], guestRoster: [], matches: [],
  });
});
const bpres = env.authenticatedContext('bpres').firestore();
const bmem = env.authenticatedContext('bmem').firestore();

await T('주최 클럽 운영진의 교류전 개설 허용',
  assertSucceeds(setDoc(doc(owner, 'clubMatches', 'cm2'), {
    kind: 'linked', hostClubId: CLUB, hostClubName: '테스트클럽',
    guestClubId: 'club2', guestClubName: '상대클럽',
    date: '2099-10-01', status: 'pending', createdBy: 'owner1',
  })));
await T('남의 클럽 이름으로 개설 거부',
  assertFails(setDoc(doc(bpres, 'clubMatches', 'cm3'), {
    kind: 'linked', hostClubId: CLUB, hostClubName: '테스트클럽',
    guestClubId: 'club2', status: 'pending', createdBy: 'bpres',
  })));
await T('일반 회원의 개설 거부',
  assertFails(setDoc(doc(mem1, 'clubMatches', 'cm4'), {
    kind: 'linked', hostClubId: CLUB, guestClubId: 'club2',
    status: 'pending', createdBy: 'mem1',
  })));
await T('수락 상태로 바로 만드는 것 거부(상대 동의 없이 진행 금지)',
  assertFails(setDoc(doc(owner, 'clubMatches', 'cm5'), {
    kind: 'linked', hostClubId: CLUB, guestClubId: 'club2',
    status: 'accepted', createdBy: 'owner1',
  })));

await T('양쪽 클럽 회원 모두 읽기 허용(선수도 대진을 봐야 한다)',
  assertSucceeds(getDoc(doc(mem1, 'clubMatches', 'cm1'))));
await T('상대 클럽 회원도 읽기 허용',
  assertSucceeds(getDoc(doc(bmem, 'clubMatches', 'cm1'))));
await T('무관한 클럽 사용자의 읽기 거부',
  assertFails(getDoc(doc(outsider, 'clubMatches', 'cm1'))));

await T('초대받은 클럽 운영진의 수락 허용',
  assertSucceeds(updateDoc(doc(bpres, 'clubMatches', 'cm1'),
    { status: 'accepted', respondedBy: 'bpres' })));
await T('초대받은 클럽의 자기 명단 입력 허용',
  assertSucceeds(updateDoc(doc(bpres, 'clubMatches', 'cm1'),
    { guestRoster: [{ id: 'bmem', name: 'B회원', gender: 'F' }] })));
await T('초대받은 클럽이 주최 명단을 고치는 것 거부',
  assertFails(updateDoc(doc(bpres, 'clubMatches', 'cm1'),
    { hostRoster: [{ id: 'x', name: '가짜' }] })));
await T('초대받은 클럽이 대진표를 고치는 것 거부(운영은 주최가 한다)',
  assertFails(updateDoc(doc(bpres, 'clubMatches', 'cm1'),
    { matches: [{ id: 'm1', teamA: [], teamB: [] }] })));
await T('초대받은 클럽이 설정을 고치는 것 거부',
  assertFails(updateDoc(doc(bpres, 'clubMatches', 'cm1'), { config: { courts: 9 } })));
await T('초대받은 클럽이 임의 상태로 바꾸는 것 거부',
  assertFails(updateDoc(doc(bpres, 'clubMatches', 'cm1'), { status: 'done' })));
await T('상대 클럽 일반 회원의 수락 거부',
  assertFails(updateDoc(doc(bmem, 'clubMatches', 'cm1'), { status: 'accepted' })));

await T('주최 클럽 운영진의 대진 저장 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubMatches', 'cm1'),
    { matches: [{ id: 'm1', round: 1, court: 1, teamA: [], teamB: [] }] })));
await T('주최 클럽의 설정 변경 허용',
  assertSucceeds(updateDoc(doc(owner, 'clubMatches', 'cm1'), { config: { courts: 3, rounds: 5 } })));
await T('주최가 상대 클럽을 몰래 갈아치우는 것 거부',
  assertFails(updateDoc(doc(owner, 'clubMatches', 'cm1'), { guestClubId: 'club3' })));
await T('주최가 주최 클럽 자체를 바꾸는 것 거부',
  assertFails(updateDoc(doc(owner, 'clubMatches', 'cm1'), { hostClubId: 'club2' })));
await T('주최 클럽 일반 회원의 대진 수정 거부',
  assertFails(updateDoc(doc(mem1, 'clubMatches', 'cm1'), { matches: [] })));
await T('무관한 사용자의 수정 거부',
  assertFails(updateDoc(doc(outsider, 'clubMatches', 'cm1'), { status: 'canceled' })));
await T('상대 클럽의 삭제 거부',
  assertFails(deleteDoc(doc(bpres, 'clubMatches', 'cm1'))));
await T('주최 클럽의 삭제 허용',
  assertSucceeds(deleteDoc(doc(owner, 'clubMatches', 'cm2'))));

console.log('\n[회비/기타]');
await T('회원 회비 쓰기 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'fees', '2026-07'), { paid: { mem1: true } })));
await T('비멤버의 클럽 문서 읽기 거부',
  assertFails(getDoc(doc(outsider, 'clubs', CLUB))));

console.log('\n[앱 운영자 명단 — 인수인계는 되되, 아무나 되면 안 된다]');
await T('앱 운영자가 다른 사람을 앱 운영자로 세우기 허용',
  assertSucceeds(setDoc(doc(appAdmin, 'appAdmins', 'newboss'), { note: '인수인계' })));
await T('일반 회원이 스스로 앱 운영자가 되는 것 거부',
  assertFails(setDoc(doc(mem1, 'appAdmins', 'mem1'), { note: '내가 왕' })));
await T('클럽 회장이라도 앱 운영자를 세우는 것 거부',
  assertFails(setDoc(doc(owner, 'appAdmins', 'owner1'), { note: '회장이니까' })));
await T('앱 운영자가 남을 내리는 것 허용',
  assertSucceeds(deleteDoc(doc(appAdmin, 'appAdmins', 'newboss'))));
await T('앱 운영자가 스스로를 내리는 것 거부 — 마지막 한 명이면 아무도 안 남는다',
  assertFails(deleteDoc(doc(appAdmin, 'appAdmins', 'appboss'))));
await T('일반 회원의 앱 운영자 삭제 거부',
  assertFails(deleteDoc(doc(mem1, 'appAdmins', 'appboss'))));

console.log('\n[공개 클럽 목록 — 앱 운영자도 노출을 끌 수 있다]');
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'clubDirectory', 'club9'),
    { name: '남의클럽', searchable: true });
});
await T('앱 운영자가 남의 클럽 노출을 끄는 것 허용',
  assertSucceeds(setDoc(doc(appAdmin, 'clubDirectory', 'club9'), { searchable: false }, { merge: true })));
await T('그 클럽 운영진의 수정은 그대로 허용',
  assertSucceeds(setDoc(doc(owner, 'clubDirectory', CLUB), { searchable: true }, { merge: true })));
await T('무관한 회원의 남의 클럽 목록 수정 거부',
  assertFails(setDoc(doc(mem1, 'clubDirectory', 'club9'), { searchable: true }, { merge: true })));

console.log('\n[테스트 알림 일감 — 남에게 쏘는 통로가 되면 안 된다]');
await T('운영진이 본인 이름으로 테스트 일감 만들기 허용',
  assertSucceeds(setDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'tj1'),
    { type: 'test', by: 'owner1', status: 'queued' })));
await T('남의 이름으로 테스트 일감 만들기 거부',
  assertFails(setDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'tj2'),
    { type: 'test', by: 'mem1', status: 'queued' })));
await T('일반 회원의 테스트 일감 생성 거부',
  assertFails(setDoc(doc(mem1, 'clubs', CLUB, 'pushJobs', 'tj3'),
    { type: 'test', by: 'mem1', status: 'queued' })));
await T('모르는 종류의 일감 거부',
  assertFails(setDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'tj4'),
    { type: 'spam', by: 'owner1', status: 'queued' })));
await T('클라이언트가 결과를 조작하는 것 거부(update 전면 차단)',
  assertFails(updateDoc(doc(owner, 'clubs', CLUB, 'pushJobs', 'tj1'), { status: 'done' })));

console.log('\n[푸시 토큰 — 본인이 자기 문서에 쓸 수 있어야 알림이 산다]');
/* 알림이 통째로 죽는 경로가 두 개다: 토큰을 못 받거나, 받아도 저장을 못 하거나.
   저장 쪽은 규칙이 막으면 조용히 실패하므로 여기서 못박아 둔다. */
await T('본인이 자기 문서에 pushToken 쓰기 허용',
  assertSucceeds(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'),
    { pushToken: 'ExponentPushToken[aaaa]' })));
await T('남의 문서에 pushToken 쓰기 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem2'),
    { pushToken: 'ExponentPushToken[bbbb]' })));
await T('비멤버가 남의 문서에 pushToken 쓰기 거부',
  assertFails(updateDoc(doc(outsider, 'clubs', CLUB, 'members', 'mem1'),
    { pushToken: 'ExponentPushToken[cccc]' })));
await T('토큰을 쓰면서 role 을 몰래 끼워 넣는 것 거부',
  assertFails(updateDoc(doc(mem1, 'clubs', CLUB, 'members', 'mem1'),
    { pushToken: 'ExponentPushToken[dddd]', role: '회장' })));

console.log('\n[코치 — 승인이 곧 지급 결정이라 상태는 앱 운영자만]');
/* 픽스처: 코치 프로필 두 건과 영상 한 건.
   coach1 은 아직 대기, coach2 는 이미 승인된 상태로 둔다. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'coaches', 'coach1'),
    { name: '김코치', regionText: '서울 강남구', career: '10년', status: 'pending' });
  await setDoc(doc(db, 'coaches', 'coach2'),
    { name: '박코치', regionText: '서울 송파구', career: '8년', status: 'approved',
      reviewedBy: 'appboss', reviewedAt: '2026-08-01' });
  await setDoc(doc(db, 'coachVideos', 'v1'),
    { coachId: 'coach1', title: '포핸드', url: 'https://youtu.be/aaaaaa', status: 'pending' });
  await setDoc(doc(db, 'coachVideos', 'v2'),
    { coachId: 'coach1', title: '백핸드', url: 'https://youtu.be/bbbbbb', status: 'approved' });
  await setDoc(doc(db, 'coachBillings', 'coach1_2026-08'),
    { coachId: 'coach1', month: '2026-08', amount: 50000, status: 'billed' });
  await setDoc(doc(db, 'gearOrders', 'o1'),
    { buyerUid: 'mem1', title: '라켓', amount: 53000, status: 'placed', addr: '서울시 ...' });
});

const coach1 = env.authenticatedContext('coach1').firestore();
const coach2 = env.authenticatedContext('coach2').firestore();
const boss = env.authenticatedContext('appboss').firestore();

await T('로그인 회원의 코치 목록 읽기 허용',
  assertSucceeds(getDocs(collection(mem1, 'coaches'))));
await T('비로그인 코치 읽기 거부',
  assertFails(getDoc(doc(anon, 'coaches', 'coach2'))));

await T('본인 프로필 생성 허용(대기 상태로)',
  assertSucceeds(setDoc(doc(env.authenticatedContext('coach3').firestore(), 'coaches', 'coach3'),
    { name: '최코치', regionText: '경기 성남시', career: '3년', status: 'pending' })));
await T('남의 uid 로 프로필 생성 거부',
  assertFails(setDoc(doc(coach1, 'coaches', 'coach9'),
    { name: '가짜', regionText: '서울', career: '1년', status: 'pending' })));
await T('처음부터 승인 상태로 만드는 것 거부',
  assertFails(setDoc(doc(env.authenticatedContext('coach4').firestore(), 'coaches', 'coach4'),
    { name: '자칭', regionText: '서울', career: '1년', status: 'approved' })));
await T('만들면서 심사 기록을 끼워 넣는 것 거부',
  assertFails(setDoc(doc(env.authenticatedContext('coach5').firestore(), 'coaches', 'coach5'),
    { name: '자칭', regionText: '서울', career: '1년', status: 'pending', reviewedBy: 'appboss' })));

await T('본인이 대기 상태에서 내용 수정 허용',
  assertSucceeds(updateDoc(doc(coach1, 'coaches', 'coach1'), { career: '11년', status: 'pending' })));
await T('본인이 스스로 승인으로 올리는 것 거부',
  assertFails(updateDoc(doc(coach1, 'coaches', 'coach1'), { status: 'approved' })));
await T('본인이 심사자 기록을 쓰는 것 거부',
  assertFails(updateDoc(doc(coach1, 'coaches', 'coach1'),
    { status: 'pending', reviewedBy: 'appboss' })));
/* 순서가 중요하다 — 아래 두 건은 coach2 가 'approved' 인 상태에서 시작해야 한다.
   먼저 "대기로 내리는" 쪽을 돌리면 coach2 가 pending 이 되어, 다음 검사가
   막혀야 할 이유 자체를 잃고 조용히 통과해 버린다. 실제로 한 번 겪었다. */
await T('승인 상태를 유지한 채 내용만 바꾸는 것 거부',
  assertFails(updateDoc(doc(coach2, 'coaches', 'coach2'), { career: '20년' })));
await T('승인된 프로필을 본인이 고치면 대기로 내려가야 통과',
  assertSucceeds(updateDoc(doc(coach2, 'coaches', 'coach2'), { career: '9년', status: 'pending' })));
await T('남의 프로필 수정 거부',
  assertFails(updateDoc(doc(coach1, 'coaches', 'coach2'), { career: '조작', status: 'pending' })));
await T('일반 회원의 코치 프로필 수정 거부',
  assertFails(updateDoc(doc(mem1, 'coaches', 'coach1'), { status: 'pending', career: '조작' })));
await T('앱 운영자의 승인 허용',
  assertSucceeds(updateDoc(doc(boss, 'coaches', 'coach1'),
    { status: 'approved', reviewedBy: 'appboss', reviewedAt: '2026-08-19' })));
await T('앱 운영자의 반려 허용',
  assertSucceeds(updateDoc(doc(boss, 'coaches', 'coach1'),
    { status: 'rejected', rejectReason: '경력 확인 불가', reviewedBy: 'appboss' })));

console.log('\n[코치 영상]');
await T('회원의 영상 목록 읽기 허용',
  assertSucceeds(getDocs(collection(mem1, 'coachVideos'))));
await T('본인 영상 등록 허용(대기 상태로)',
  assertSucceeds(setDoc(doc(coach1, 'coachVideos', 'v3'),
    { coachId: 'coach1', title: '발리', url: 'https://youtu.be/cccccc', status: 'pending' })));
await T('남의 이름으로 영상 등록 거부',
  assertFails(setDoc(doc(coach1, 'coachVideos', 'v4'),
    { coachId: 'coach2', title: '도용', url: 'https://youtu.be/dddddd', status: 'pending' })));
await T('처음부터 승인된 영상 등록 거부',
  assertFails(setDoc(doc(coach1, 'coachVideos', 'v5'),
    { coachId: 'coach1', title: '무단', url: 'https://youtu.be/eeeeee', status: 'approved' })));
await T('본인 영상 내용 수정 허용(대기로)',
  assertSucceeds(updateDoc(doc(coach1, 'coachVideos', 'v1'), { title: '포핸드 교정', status: 'pending' })));
await T('본인이 자기 영상을 승인하는 것 거부',
  assertFails(updateDoc(doc(coach1, 'coachVideos', 'v1'), { status: 'approved' })));
await T('승인된 영상을 승인 상태 그대로 바꿔치우는 것 거부',
  assertFails(updateDoc(doc(coach1, 'coachVideos', 'v2'), { url: 'https://youtu.be/zzzzzz' })));
await T('남의 영상 수정 거부',
  assertFails(updateDoc(doc(coach2, 'coachVideos', 'v1'), { title: '조작', status: 'pending' })));
await T('앱 운영자의 영상 승인 허용',
  assertSucceeds(updateDoc(doc(boss, 'coachVideos', 'v1'),
    { status: 'approved', reviewedBy: 'appboss' })));
await T('본인 영상 삭제 허용',
  assertSucceeds(deleteDoc(doc(coach1, 'coachVideos', 'v3'))));
await T('남의 영상 삭제 거부',
  assertFails(deleteDoc(doc(coach2, 'coachVideos', 'v1'))));

console.log('\n[코치 광고비 — 코치가 앱에 내는 돈. 앱 운영자의 장부]');
await T('코치 본인도 청구 내역을 볼 수 없다',
  assertFails(getDoc(doc(coach1, 'coachBillings', 'coach1_2026-08'))));
await T('일반 회원의 청구 내역 읽기 거부',
  assertFails(getDoc(doc(mem1, 'coachBillings', 'coach1_2026-08'))));
await T('코치가 자기 청구액을 깎는 것 거부',
  assertFails(updateDoc(doc(coach1, 'coachBillings', 'coach1_2026-08'), { amount: 0 })));
await T('코치가 스스로 입금 완료로 바꾸는 것 거부',
  assertFails(updateDoc(doc(coach1, 'coachBillings', 'coach1_2026-08'), { status: 'paid' })));
await T('앱 운영자의 청구 내역 읽기 허용',
  assertSucceeds(getDoc(doc(boss, 'coachBillings', 'coach1_2026-08'))));
await T('앱 운영자의 입금 확인 허용',
  assertSucceeds(updateDoc(doc(boss, 'coachBillings', 'coach1_2026-08'), { status: 'paid' })));

console.log('\n[용품 주문 — 배송지가 남의 눈에 보이면 안 된다]');
await T('본인 주문 읽기 허용',
  assertSucceeds(getDoc(doc(mem1, 'gearOrders', 'o1'))));
await T('남의 주문 읽기 거부',
  assertFails(getDoc(doc(coach1, 'gearOrders', 'o1'))));
await T('앱 운영자의 주문 읽기 허용',
  assertSucceeds(getDoc(doc(boss, 'gearOrders', 'o1'))));
await T('본인 이름으로 주문 접수 허용',
  assertSucceeds(setDoc(doc(mem1, 'gearOrders', 'o2'),
    { buyerUid: 'mem1', title: '그립', amount: 8000, status: 'placed', addr: '서울시 ...' })));
await T('남의 이름으로 주문 접수 거부',
  assertFails(setDoc(doc(mem1, 'gearOrders', 'o3'),
    { buyerUid: 'coach1', title: '도용', amount: 8000, status: 'placed', addr: 'x' })));
await T('접수 상태에서 본인 취소 허용',
  assertSucceeds(updateDoc(doc(mem1, 'gearOrders', 'o2'), { status: 'canceled' })));
await T('회원이 스스로 입금 확인으로 넘기는 것 거부',
  assertFails(updateDoc(doc(mem1, 'gearOrders', 'o1'), { status: 'paid' })));
await T('앱 운영자의 상태 변경 허용',
  assertSucceeds(updateDoc(doc(boss, 'gearOrders', 'o1'), { status: 'paid' })));
await T('회원의 주문 삭제 거부',
  assertFails(deleteDoc(doc(mem1, 'gearOrders', 'o1'))));

await env.cleanup();
console.log(`\n규칙 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
