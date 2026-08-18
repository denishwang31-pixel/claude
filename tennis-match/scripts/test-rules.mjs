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
await T('앱 운영자 명단 자가 등록 거부(콘솔 전용)',
  assertFails(setDoc(doc(mem1, 'appAdmins', 'mem1'), { note: '내가 운영자' })));
await T('앱 운영자도 명단 추가 거부(콘솔 전용)',
  assertFails(setDoc(doc(appAdmin, 'appAdmins', 'mem1'), { note: '승격' })));

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

await env.cleanup();
console.log(`\n규칙 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
