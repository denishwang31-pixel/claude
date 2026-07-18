/* ============================================================
   Firestore 데이터 접근 계층
   컬렉션 구조:
     clubs/{clubId}                         클럽 메타(이름, 설정)
     clubs/{clubId}/members/{memberId=uid}  회원
     clubs/{clubId}/meetings/{meetingId}    모임(rsvp, guests, matches, restScores…)
     clubs/{clubId}/posts/{postId}          공지/자유 게시글(+comments)
     clubs/{clubId}/fees/{yyyy-mm}          월별 회비
     clubs/{clubId}/courts/{courtId}        코트 DB
     clubs/{clubId}/meta/rules              편성 기준 우선순위(키 배열)
     inviteCodes/{CODE}                     초대코드 → clubId 조회(FIX-04, 루트)
     guestPosts/{postId}                    게스트 모집(공개, 루트) (FIX-05)
       └ applicants/{uid}                   신청자(본인만 작성)
   ============================================================ */
import {
  collection, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion, runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { ROLES, GUEST_STATUS } from './constants';

const C = (clubId, sub) => collection(db, 'clubs', clubId, sub);
const D = (clubId, sub, id) => doc(db, 'clubs', clubId, sub, id);
const today = () => new Date().toISOString().slice(0, 10);

/* ---- 실시간 구독 (unsubscribe 반환) ---- */
export const subClub = (clubId, cb) =>
  onSnapshot(doc(db, 'clubs', clubId), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null));

export const subMembers = (clubId, cb) =>
  onSnapshot(C(clubId, 'members'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const subMeetings = (clubId, cb) =>
  onSnapshot(C(clubId, 'meetings'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || '').localeCompare(b.date || ''))));

export const subPosts = (clubId, cb) =>
  onSnapshot(C(clubId, 'posts'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const subCourts = (clubId, cb) =>
  onSnapshot(C(clubId, 'courts'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const subFee = (clubId, monthKey, cb) =>
  onSnapshot(D(clubId, 'fees', monthKey), (d) => cb(d.exists() ? d.data() : { paid: {} }));

export const subRules = (clubId, cb) =>
  onSnapshot(D(clubId, 'meta', 'rules'), (d) => cb(d.exists() ? d.data().order : null));

/* 게스트 모집: 루트 공개 컬렉션에서 다가오는 모집만(FIX-05) */
export const subGuestPosts = (cb) =>
  onSnapshot(
    query(collection(db, 'guestPosts'), where('date', '>=', today()), orderBy('date', 'asc')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );

export const subApplicants = (postId, cb) =>
  onSnapshot(collection(db, 'guestPosts', postId, 'applicants'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

/* ---- 쓰기 (클럽 스코프) ---- */
export const setRules = (clubId, order) => setDoc(D(clubId, 'meta', 'rules'), { order });

export const addMeeting = (clubId, data) =>
  addDoc(C(clubId, 'meetings'), { ...data, rsvp: {}, guests: [], matches: [], restScores: {}, canceled: false, createdAt: serverTimestamp() });

export const updateMeeting = (clubId, id, patch) => updateDoc(D(clubId, 'meetings', id), patch);

export const setRsvp = (clubId, meetingId, memberId, value) =>
  updateDoc(D(clubId, 'meetings', meetingId), { [`rsvp.${memberId}`]: value });

export const setRestScore = (clubId, meetingId, memberId, value) =>
  updateDoc(D(clubId, 'meetings', meetingId), { [`restScores.${memberId}`]: value });

export const saveMatches = (clubId, meetingId, matches) =>
  updateDoc(D(clubId, 'meetings', meetingId), { matches });

/* 총무가 회원 추가: 실서비스에선 초대코드 가입이 기본이나, 오프라인 등록용.
   memberId 는 임시 uid(예: 'local:'+random) 를 넘길 수 있음 */
export const addMember = (clubId, memberId, data) =>
  setDoc(D(clubId, 'members', memberId), { ...data, role: ROLES.MEMBER, status: '활동' });

/* PHASE 3 — 본인 푸시 토큰 저장(규칙: 본인 문서 update 허용) */
export const savePushToken = (clubId, memberId, token) =>
  updateDoc(D(clubId, 'members', memberId), { pushToken: token });

export const addPost = (clubId, data) =>
  addDoc(C(clubId, 'posts'), { ...data, comments: [], date: today() });

/* FIX-06 — 동시성 안전 댓글 추가(arrayUnion). comment 에 고유 id 포함할 것 */
export const addComment = (clubId, postId, comment) =>
  updateDoc(D(clubId, 'posts', postId), { comments: arrayUnion(comment) });

export const setFeePaid = (clubId, monthKey, paidMap, amount) =>
  setDoc(D(clubId, 'fees', monthKey), { paid: paidMap, amount }, { merge: true });

export const addCourt = (clubId, data) => addDoc(C(clubId, 'courts'), data);
export const deleteCourt = (clubId, id) => deleteDoc(D(clubId, 'courts', id));

/* ---- 게스트 모집 (루트 공개, FIX-05) ---- */
export const addGuestPost = (data) =>
  addDoc(collection(db, 'guestPosts'), { ...data, createdAt: serverTimestamp() });

export const deleteGuestPost = (postId) => deleteDoc(doc(db, 'guestPosts', postId));

/** 신청: 본인 uid 문서로 프로필과 함께 기록 */
export const applyToGuestPost = (postId, applicant) =>
  setDoc(doc(db, 'guestPosts', postId, 'applicants', applicant.uid), { ...applicant, status: GUEST_STATUS.APPLIED, createdAt: serverTimestamp() });

export const cancelApplication = (postId, uid) =>
  deleteDoc(doc(db, 'guestPosts', postId, 'applicants', uid));

/** 확정: 모집 클럽 총무만(규칙에서 강제). 상태 변경만 수행 */
export const confirmApplicant = (postId, uid) =>
  updateDoc(doc(db, 'guestPosts', postId, 'applicants', uid), { status: GUEST_STATUS.CONFIRMED });

/* ---- 클럽 생성 / 초대코드 ---- */
const genCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 O/0/I/1 제외
  let s = '';
  const rnd = (typeof globalThis.crypto?.getRandomValues === 'function')
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(6)))
    : Array.from({ length: 6 }, () => Math.floor(Math.random() * 1e9));
  rnd.forEach((n) => { s += A[n % A.length]; });
  return s;
};

/** 초대코드 문서를 트랜잭션으로 유일하게 생성 후 코드 반환 */
async function reserveInviteCode(clubId, clubName) {
  for (let i = 0; i < 8; i++) {
    const code = genCode();
    const ref = doc(db, 'inviteCodes', code);
    // eslint-disable-next-line no-await-in-loop
    const ok = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, { clubId, clubName, createdAt: serverTimestamp() });
      return true;
    });
    if (ok) return code;
  }
  throw new Error('초대코드 생성 실패(충돌)');
}

export const createClub = async (name, settings, owner) => {
  const { uid, ...ownerData } = owner;
  const ref = await addDoc(collection(db, 'clubs'), { name, settings, ownerId: uid, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'clubs', ref.id, 'members', uid), { ...ownerData, role: ROLES.ADMIN, status: '활동' });
  const code = await reserveInviteCode(ref.id, name);
  await setDoc(doc(db, 'clubs', ref.id, 'meta', 'rules'), { order: null });
  await updateDoc(ref, { inviteCode: code }); // 총무 표시용
  return { clubId: ref.id, inviteCode: code };
};

/** 초대코드 → {clubId, clubName} (없으면 null) */
export const findClubByInviteCode = async (code) => {
  const snap = await getDoc(doc(db, 'inviteCodes', String(code).toUpperCase()));
  return snap.exists() ? snap.data() : null;
};
