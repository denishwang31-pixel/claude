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
     clubs/{clubId}/joinRequests/{uid}      가입 신청(비회원이 직접 생성, 운영진이 승인)
     inviteCodes/{CODE}                     초대코드 → clubId 조회(FIX-04, 루트)
     clubDirectory/{clubId}                 공개 클럽 목록(이름 검색용, 루트)
     guestPosts/{postId}                    게스트 모집(공개, 루트) (FIX-05)
       └ applicants/{uid}                   신청자(본인만 작성)
   ============================================================ */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, arrayUnion,
  runTransaction, deleteField, writeBatch, increment,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { ROLES, GUEST_STATUS, JOIN_STATUS } from './constants';

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

/* ---- 클럽 운영 설정(코트·시간·타임 길이 등) ---- */
export const updateClubSettings = (clubId, settings) =>
  updateDoc(doc(db, 'clubs', clubId), { settings });

/* ---- 코트장(venue) — 클럽이 여러 곳을 운영하는 경우 ----
   각 코트장마다 면수·운영시간·리드(담당자)를 따로 관리 */
export const subVenues = (clubId, cb) =>
  onSnapshot(C(clubId, 'venues'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))));

export const addVenue = (clubId, data) => addDoc(C(clubId, 'venues'), data);
export const updateVenue = (clubId, id, patch) => updateDoc(D(clubId, 'venues', id), patch);
export const deleteVenue = (clubId, id) => deleteDoc(D(clubId, 'venues', id));

/* ---- 대진 편성 기본 설정(클럽 단위) ---- */
export const subMatchConfig = (clubId, cb) =>
  onSnapshot(D(clubId, 'meta', 'matchConfig'), (d) => cb(d.exists() ? d.data() : null));

export const setMatchConfig = (clubId, cfg) =>
  setDoc(D(clubId, 'meta', 'matchConfig'), cfg, { merge: true });

/* ---- 회원 역할/삭제 (회장만 임명 — 규칙에서 강제) ---- */
export const setMemberRole = (clubId, memberId, role) =>
  updateDoc(D(clubId, 'members', memberId), { role });

export const deleteMember = (clubId, memberId) => deleteDoc(D(clubId, 'members', memberId));

/* ---- 지출 관리 (회비 메뉴) ---- */
export const subExpenses = (clubId, cb) =>
  onSnapshot(C(clubId, 'expenses'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''))));

export const addExpense = (clubId, data) =>
  addDoc(C(clubId, 'expenses'), { ...data, createdAt: serverTimestamp() });

export const deleteExpense = (clubId, id) => deleteDoc(D(clubId, 'expenses', id));

/* ---- 용품 광고 (루트 공통 컬렉션) ----
   앱 관리자만 등록·수정하고, 모든 클럽·회원은 조회와 링크 이동만 가능.
   앱 관리자 = appAdmins/{uid} 문서가 존재하는 사용자(Firebase 콘솔에서 수동 등록). */
export const subGear = (cb) =>
  onSnapshot(collection(db, 'gear'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const addGear = (data) => addDoc(collection(db, 'gear'), { ...data, createdAt: serverTimestamp() });
export const updateGear = (id, patch) => updateDoc(doc(db, 'gear', id), patch);
export const deleteGear = (id) => deleteDoc(doc(db, 'gear', id));

/** 앱 관리자 여부 확인 (로그인은 동일, 권한만 다름) */
export const checkAppAdmin = async (uid) => {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'appAdmins', uid));
    return snap.exists();
  } catch (e) { return false; }
};

/* ---- 원포인트 레슨(유튜브) ---- */
export const subTips = (clubId, cb) =>
  onSnapshot(C(clubId, 'tips'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const addTip = (clubId, data) => addDoc(C(clubId, 'tips'), { ...data, createdAt: serverTimestamp() });
export const deleteTip = (clubId, id) => deleteDoc(D(clubId, 'tips', id));

/* ============================================================
   참가투표 — 일정 RSVP 와 별개. 회식 날짜, 대회 참가 의사처럼
   "물어보고 집계"가 필요한 모든 것을 담는다.
   votes 는 { uid: 선택키 } 맵이라 회원이 자기 키만 바꾸도록 규칙을 걸 수 있다.
   ============================================================ */
export const subPolls = (clubId, cb) =>
  onSnapshot(C(clubId, 'polls'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))));

export const addPoll = (clubId, data) =>
  addDoc(C(clubId, 'polls'), { ...data, votes: {}, closed: false, createdAt: serverTimestamp() });

export const votePoll = (clubId, pollId, uid, choice) =>
  updateDoc(D(clubId, 'polls', pollId), { [`votes.${uid}`]: choice });

export const unvotePoll = (clubId, pollId, uid) =>
  updateDoc(D(clubId, 'polls', pollId), { [`votes.${uid}`]: deleteField() });

export const closePoll = (clubId, pollId, closed = true) =>
  updateDoc(D(clubId, 'polls', pollId), { closed });

export const deletePoll = (clubId, pollId) => deleteDoc(D(clubId, 'polls', pollId));

/* ============================================================
   클럽 채팅 — 최근 메시지만 실시간으로 받는다.
   전체를 구독하면 오래된 클럽일수록 앱이 무거워지므로 200개로 자른다.
   ============================================================ */
export const subMessages = (clubId, cb, max = 200) =>
  onSnapshot(
    query(C(clubId, 'messages'), orderBy('createdAt', 'desc'), limit(max)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
    () => cb([]),
  );

export const sendMessage = (clubId, data) =>
  addDoc(C(clubId, 'messages'), { ...data, createdAt: serverTimestamp() });

export const deleteMessage = (clubId, id) => deleteDoc(D(clubId, 'messages', id));

/* ---- 여러 모임 한번에 생성(정기 모임 반복 등록) ---- */
export const addMeetingsBatch = async (clubId, list) => {
  const batch = writeBatch(db);
  list.forEach((data) => {
    const ref = doc(C(clubId, 'meetings'));
    batch.set(ref, {
      ...data, rsvp: {}, guests: [], matches: [], restScores: {},
      canceled: false, createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
};

/* ---- NTRP 등급 관리 ---- */
export const setNtrpSelf = (clubId, memberId, value) =>
  updateDoc(D(clubId, 'members', memberId), { ntrpSelf: value });

export const setNtrpCertified = (clubId, memberId, value) =>
  updateDoc(D(clubId, 'members', memberId), { ntrpCertified: value });

export const clearNtrpCertified = (clubId, memberId) =>
  updateDoc(D(clubId, 'members', memberId), { ntrpCertified: deleteField() });

/** 회원 투표: 대상 회원 문서의 ntrpVotes.{voterUid} 만 갱신 */
export const setNtrpVote = (clubId, targetId, voterId, value) =>
  updateDoc(D(clubId, 'members', targetId), { [`ntrpVotes.${voterId}`]: value });

/* ---- 프로필(구력 등) ---- */
export const updateMemberProfile = (clubId, memberId, patch) =>
  updateDoc(D(clubId, 'members', memberId), patch);

/* ---- 출석 ---- */
export const setAttendance = (clubId, meetingId, memberId, present) =>
  updateDoc(D(clubId, 'meetings', meetingId), { [`attendance.${memberId}`]: present });

export const bulkSetAttendance = (clubId, meetingId, map) =>
  updateDoc(D(clubId, 'meetings', meetingId), { attendance: map });

/* ---- 커플 / 고정 페어 (클럽 단위 설정) ----
   ⚠️ Firestore 는 중첩 배열([[a,b]])을 저장할 수 없다.
   저장 형태: [{a,b}]  ↔  앱/엔진 사용 형태: [[a,b]]  (여기서 변환) */
const pairsToDocs = (arr) => (arr || []).map((p) => (Array.isArray(p) ? { a: p[0], b: p[1] } : p));
const pairsToTuples = (arr) => (arr || []).map((p) => (Array.isArray(p) ? p : [p.a, p.b]));

export const subPairs = (clubId, cb) =>
  onSnapshot(D(clubId, 'meta', 'pairs'), (d) => {
    const raw = d.exists() ? d.data() : {};
    cb({ couples: pairsToTuples(raw.couples), fixedPairs: pairsToTuples(raw.fixedPairs) });
  });

export const setPairs = (clubId, data) =>
  setDoc(D(clubId, 'meta', 'pairs'), {
    couples: pairsToDocs(data?.couples),
    fixedPairs: pairsToDocs(data?.fixedPairs),
  }, { merge: true });

/* ---- 대회 ---- */
export const subTournaments = (clubId, cb) =>
  onSnapshot(C(clubId, 'tournaments'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''))));

export const addTournament = (clubId, data) =>
  addDoc(C(clubId, 'tournaments'), { ...data, createdAt: serverTimestamp() });

export const updateTournament = (clubId, id, patch) =>
  updateDoc(D(clubId, 'tournaments', id), patch);

export const deleteTournament = (clubId, id) => deleteDoc(D(clubId, 'tournaments', id));

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

export const createClub = async (name, settings, owner, extra = {}) => {
  const { uid, ...ownerData } = owner;
  const region = (settings?.region || '').trim();
  const ref = await addDoc(collection(db, 'clubs'), {
    name,
    settings,
    ownerId: uid,
    image: extra.image || '',
    joinPassword: extra.joinPassword || '',   // 있으면 검색 가입 시 이 값을 물어본다
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'clubs', ref.id, 'members', uid), { ...ownerData, role: ROLES.PRESIDENT, status: '활동' });
  const code = await reserveInviteCode(ref.id, name);
  await setDoc(doc(db, 'clubs', ref.id, 'meta', 'rules'), { order: null });
  await updateDoc(ref, { inviteCode: code }); // 총무 표시용
  // 공개 목록에 등록 — 다른 사람이 이름으로 검색해 가입 신청할 수 있게
  await publishClubDirectory(ref.id, {
    name,
    region,
    memberCount: 1,
    image: extra.image || '',
    maleCount: ownerData.gender === 'F' ? 0 : 1,
    femaleCount: ownerData.gender === 'F' ? 1 : 0,
    hasPassword: !!extra.joinPassword,
  });
  bumpServiceStat('clubs');
  bumpServiceStat('members');
  return { clubId: ref.id, inviteCode: code };
};

/** 클럽 가입 비밀번호 확인 — 맞으면 승인 없이 바로 가입시킨다.
 *  옐로우홀처럼 "클럽명 검색 → 비밀번호 입력" 경로를 지원하기 위한 것. */
export const checkClubPassword = async (clubId, password) => {
  try {
    const snap = await getDoc(doc(db, 'clubs', clubId));
    if (!snap.exists()) return false;
    const saved = snap.data().joinPassword || '';
    return !!saved && saved === String(password).trim();
  } catch (e) {
    // 비회원은 클럽 문서를 읽을 수 없다 → 신청 경로로 안내
    return false;
  }
};

export const setClubJoinPassword = (clubId, password) =>
  updateDoc(doc(db, 'clubs', clubId), { joinPassword: password || '' });

export const setClubImage = (clubId, image) =>
  updateDoc(doc(db, 'clubs', clubId), { image: image || '' });

/** 초대코드 → {clubId, clubName} (없으면 null) */
export const findClubByInviteCode = async (code) => {
  const snap = await getDoc(doc(db, 'inviteCodes', String(code).toUpperCase()));
  return snap.exists() ? snap.data() : null;
};

/* ============================================================
   공개 클럽 목록(clubDirectory) — 이름으로 검색해서 가입 신청
   · 클럽 상세(회원·일정)는 여전히 회원만 볼 수 있고,
     여기엔 검색에 필요한 최소 정보(이름·지역·인원)만 공개한다.
   · searchable = false 로 두면 목록에서 빠진다(초대코드로만 가입).
   ============================================================ */
const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

export const publishClubDirectory = (clubId, {
  name, region, memberCount, searchable = true, image, maleCount, femaleCount, hasPassword,
}) =>
  setDoc(doc(db, 'clubDirectory', clubId), {
    name,
    nameLower: normalize(name),
    region: region || '',
    regionLower: normalize(region),
    memberCount: memberCount ?? 0,
    maleCount: maleCount ?? 0,
    femaleCount: femaleCount ?? 0,
    image: image || '',
    hasPassword: !!hasPassword,
    searchable,
    updatedAt: serverTimestamp(),
  }, { merge: true });

/* ============================================================
   서비스 전체 현황 — "클럽 5,301개 · 회원 50,110명"처럼 규모를 보여준다.
   집계 문서를 따로 두고 클럽/회원이 늘 때 카운터를 올린다.
   (컬렉션 전체를 세면 문서 수만큼 읽기 비용이 나가므로 쓰지 않는다)
   ============================================================ */
export const subServiceStats = (cb) =>
  onSnapshot(doc(db, 'stats', 'service'),
    (d) => cb(d.exists() ? d.data() : null),
    () => cb(null));

export const bumpServiceStat = async (field, by = 1) => {
  try {
    await setDoc(doc(db, 'stats', 'service'), { [field]: increment(by) }, { merge: true });
  } catch (e) { /* 집계 실패가 사용자 흐름을 막지 않도록 무시 */ }
};

/** 이름·지역 부분 문자열 검색.
 *  Firestore 는 부분 문자열 검색을 지원하지 않으므로 공개 목록을 받아
 *  클라이언트에서 거른다. where 한 개 + limit 만 써서 복합 색인이 필요 없다
 *  (색인을 따로 만들지 않아도 배포 직후 바로 동작). */
export const searchClubs = async (keyword, max = 40) => {
  const snap = await getDocs(query(
    collection(db, 'clubDirectory'),
    where('searchable', '==', true),
    limit(300),
  ));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
  const q = normalize(keyword);
  if (!q) return all.slice(0, max);
  return all
    .filter((c) => (c.nameLower || '').includes(q) || (c.regionLower || '').includes(q))
    .slice(0, max);
};

export const getClubDirectory = async (clubId) => {
  const snap = await getDoc(doc(db, 'clubDirectory', clubId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/* ============================================================
   가입 신청 — 비회원이 직접 문서를 만들고, 운영진이 승인한다.
   clubs/{clubId}/joinRequests/{uid}
   승인 시점에 members/{uid} 문서를 운영진 권한으로 만들고,
   신청 문서 상태를 approved 로 바꾼다. 신청자 앱은 자기 신청 문서를
   구독하다가 approved 를 보면 users/{uid}.clubId 를 스스로 기록한다.
   (users/{uid} 는 본인만 쓸 수 있으므로 이 순서가 필요하다)
   ============================================================ */
export const requestJoinClub = (clubId, uid, profile) =>
  setDoc(doc(db, 'clubs', clubId, 'joinRequests', uid), {
    ...profile,
    status: JOIN_STATUS.PENDING,
    createdAt: serverTimestamp(),
  });

/** 신청자 본인이 자기 신청 상태를 구독 */
export const subMyJoinRequest = (clubId, uid, cb) =>
  onSnapshot(doc(db, 'clubs', clubId, 'joinRequests', uid),
    (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null),
    () => cb(null));

/** 운영진이 대기 중 신청 목록을 구독 */
export const subJoinRequests = (clubId, cb) =>
  onSnapshot(collection(db, 'clubs', clubId, 'joinRequests'),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([]));

/** 운영진 승인 — 회원 문서 생성 + 신청 상태 갱신 */
export const approveJoinRequest = async (clubId, uid, data) => {
  const { status, createdAt, ...profile } = data || {};
  const batch = writeBatch(db);
  batch.set(doc(db, 'clubs', clubId, 'members', uid), {
    ...profile, role: ROLES.MEMBER, status: '활동',
  });
  batch.update(doc(db, 'clubs', clubId, 'joinRequests', uid), {
    status: JOIN_STATUS.APPROVED, decidedAt: serverTimestamp(),
  });
  await batch.commit();
  bumpServiceStat('members');
};

export const rejectJoinRequest = (clubId, uid) =>
  updateDoc(doc(db, 'clubs', clubId, 'joinRequests', uid), {
    status: JOIN_STATUS.REJECTED, decidedAt: serverTimestamp(),
  });

/** 신청자 본인이 신청 취소 */
export const cancelJoinRequest = (clubId, uid) =>
  deleteDoc(doc(db, 'clubs', clubId, 'joinRequests', uid));

/** 초대코드로 즉시 가입(승인 불필요 — 코드 자체가 운영진의 초대) */
export const joinClubWithCode = async (clubId, uid, profile, code) => {
  await setDoc(doc(db, 'clubs', clubId, 'members', uid), {
    ...profile, role: ROLES.MEMBER, status: '활동', joinCode: String(code).toUpperCase(),
  });
  bumpServiceStat('members');
};
