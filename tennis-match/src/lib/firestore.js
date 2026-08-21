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

export const deleteMeeting = (clubId, id) => deleteDoc(D(clubId, 'meetings', id));

/** 일정 일괄 삭제.
 *
 *  잘못 만든 정기 일정 수십 건을 하나씩 지우는 것은 현실적이지 않다.
 *  회원·회비·대회는 건드리지 않는다 — 일정만 지운다.
 *
 *  @param scope 'all' 전체 · 'future' 오늘 이후 · 'past' 오늘 이전
 *  @param venueId 있으면 그 코트장 일정만
 *  @returns 지운 건수
 */
export async function deleteMeetingsBulk(clubId, { scope = 'future', venueId = null } = {}) {
  const snap = await getDocs(C(clubId, 'meetings'));
  const t = today();
  const targets = snap.docs.filter((d) => {
    const m = d.data();
    if (venueId && m.venueId !== venueId) return false;
    if (scope === 'future') return (m.date || '') >= t;
    if (scope === 'past') return (m.date || '') < t;
    return true;
  });
  // Firestore 배치는 500건이 상한이라 잘라서 보낸다
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    targets.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return targets.length;
}

/** 이 모임 이후(같은 코트장·같은 시리즈)의 일정을 한꺼번에 수정.
 *
 *  "어느 날부터 면수가 3면 → 2면으로 줄었다" 같은 상황에서, 지난 기록은
 *  그대로 두고 그날 이후 일정만 바꾸기 위한 것. 전부 지우고 다시 만들면
 *  이미 기록된 참석·대진이 날아가므로 그렇게 하지 않는다.
 *
 *  @param fromDate  이 날짜 포함 이후만 대상
 *  @param scope     { venueId } 지정 시 같은 코트장 일정만
 *  @returns 수정된 건수
 */
export const updateMeetingsFrom = async (clubId, fromDate, patch, scope = {}) => {
  const snap = await getDocs(C(clubId, 'meetings'));
  const targets = snap.docs.filter((d) => {
    const m = d.data();
    if ((m.date || '') < fromDate) return false;
    if (m.canceled) return false;
    if (scope.venueId !== undefined && (m.venueId || null) !== scope.venueId) return false;
    return true;
  });
  if (!targets.length) return 0;

  // 배치 한도(500)를 넘지 않게 나눠 쓴다
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    targets.slice(i, i + 400).forEach((d) => batch.update(d.ref, patch));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return targets.length;
};

/* 참석 응답.
   actorId 는 "실제로 누른 사람"이다. 본인이 눌렀으면 memberId 와 같고,
   운영진이 현장에서 대신 처리했으면 다르다. 서버가 이걸 보고
   "본인이 마음을 바꾼 것"만 운영진에게 알린다 — 운영진이 자기가
   누른 것을 자기에게 다시 알릴 필요는 없다. */
export const setRsvp = (clubId, meetingId, memberId, value, actorId) =>
  updateDoc(D(clubId, 'meetings', meetingId), {
    [`rsvp.${memberId}`]: value,
    [`rsvpBy.${memberId}`]: actorId || memberId,
  });

/* 참석 투표 요청 — 아직 답하지 않은 사람에게만 푸시.
   앱에서 직접 푸시를 쏠 수는 없으므로(토큰은 서버만 본다) 요청서를
   한 장 남기고, Cloud Functions 가 그것을 보고 발송한다. */
export const requestRsvp = (clubId, meetingId, by, targets) =>
  addDoc(C(clubId, 'pushJobs'), {
    type: 'rsvpAsk',
    meetingId,
    by,
    targets: targets || [],
    status: 'queued',
    createdAt: serverTimestamp(),
  });

export const setRestScore = (clubId, meetingId, memberId, value) =>
  updateDoc(D(clubId, 'meetings', meetingId), { [`restScores.${memberId}`]: value });

export const saveMatches = (clubId, meetingId, matches) =>
  updateDoc(D(clubId, 'meetings', meetingId), { matches });

/* 총무가 회원 추가: 실서비스에선 초대코드 가입이 기본이나, 오프라인 등록용.
   memberId 는 임시 uid(예: 'local:'+random) 를 넘길 수 있음 */
/* 회원 추가.
   역할과 소속 코트장을 등록할 때 같이 받는다. 예전에는 role 을 무조건
   '회원'으로 덮어써서, 총무가 운영진을 추가해 놓고 다시 회원 목록에서
   역할을 바꿔야 했다. 코트장도 마찬가지로 따로 지정해야 했고, 200명
   클럽에서는 그 "따로"가 매번 빠졌다. */
export const addMember = (clubId, memberId, data) =>
  setDoc(D(clubId, 'members', memberId), {
    role: ROLES.MEMBER,
    status: '활동',
    venueIds: [],
    ...data,
  });

/* ---- 클럽 운영 설정(코트·시간·타임 길이 등) ---- */
export const updateClubSettings = (clubId, settings) =>
  updateDoc(doc(db, 'clubs', clubId), { settings });

/** 클럽 이름·대표 이미지·가입 비밀번호 수정 + 공개 목록(clubDirectory) 동기화.
 *  예전엔 클럽 생성 때만 넣을 수 있고 이후엔 못 바꿨고, 이름을 바꿔도
 *  검색 목록에는 옛 이름이 남는 불일치가 있었다. */
export const saveClubProfile = async (clubId, { name, image, joinPassword, region, memberCount }) => {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (image !== undefined) patch.image = image;
  if (joinPassword !== undefined) patch.joinPassword = joinPassword;
  if (Object.keys(patch).length) await updateDoc(doc(db, 'clubs', clubId), patch);
  await publishClubDirectory(clubId, {
    name: name ?? '',
    region: region ?? '',
    image: image ?? '',
    memberCount,
    hasPassword: !!joinPassword,
  });
};

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
  updateDoc(D(clubId, 'members', memberId), { role, roles: [role] });

/* 겸임 저장 — roles(실제)와 role(대표)을 함께 쓴다.
   보안 규칙은 role 문자열 하나를 보고 판단하므로 둘이 어긋나면
   화면과 권한이 따로 논다. rolesPayload 가 둘을 같이 만든다. */
export const setMemberRoles = (clubId, memberId, payload) =>
  updateDoc(D(clubId, 'members', memberId), {
    roles: payload.roles,
    role: payload.role,
  });

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

/* 소속 코트장 일괄 배정.
   회원이 200명이면 한 사람씩 눌러 지정하는 것은 현실적이지 않다.
   그리고 이 지정이 없으면 일정·투표가 전원에게 가므로 반드시 채워야 한다.

   @param mode 'set' 덮어쓰기 · 'add' 추가 · 'remove' 빼기
   @returns 바꾼 인원 수 */
export async function assignVenuesBulk(clubId, memberIds, venueIds, mode = 'set') {
  const ids = [...new Set(memberIds || [])].filter(Boolean);
  if (!ids.length) return 0;
  const snap = await getDocs(C(clubId, 'members'));
  const byId = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));

  for (let i = 0; i < ids.length; i += 400) {   // 배치 상한 500
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => {
      const cur = byId[id]?.venueIds || [];
      let next;
      if (mode === 'add') next = [...new Set([...cur, ...venueIds])];
      else if (mode === 'remove') next = cur.filter((v) => !venueIds.includes(v));
      else next = [...new Set(venueIds)];
      batch.update(D(clubId, 'members', id), { venueIds: next });
    });
    await batch.commit();
  }
  return ids.length;
}

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

/* ---- 회비 납부 기록 ----

   두 곳에 쓴다.
     fees/{기간}            총무용 전체 명단. 회장·총무만 읽는다.
     memberFees/{회원id}    회원 개인용 사본. 본인과 회장·총무만 읽는다.

   왜 사본을 두나
     전체 명단을 회원에게 열어 주면 누가 안 냈는지 서로 다 보게 된다.
     그렇다고 아예 막으면 본인도 자기 납부 여부를 확인할 수 없어서,
     "냈는데 미납으로 되어 있다"를 발견할 방법이 없다.
     그래서 본인 몫만 떼어 개인 문서로 내려 준다.

   바뀐 사람만 쓴다 — 체크 하나 누를 때마다 30명 문서를 다시 쓰지 않는다. */
export const setFeePaid = async (clubId, monthKey, paidMap, amount, prevPaid = null) => {
  const ref = D(clubId, 'fees', monthKey);

  let before = prevPaid;
  if (!before) {
    const snap = await getDoc(ref);
    before = snap.exists() ? (snap.data().paid || {}) : {};
  }

  await setDoc(ref, { paid: paidMap, amount }, { merge: true });

  const ids = new Set([...Object.keys(before || {}), ...Object.keys(paidMap || {})]);
  const changed = [...ids].filter((id) => !!before?.[id] !== !!paidMap?.[id]);
  if (!changed.length) return;

  const at = new Date().toISOString();
  for (let i = 0; i < changed.length; i += 400) {
    const batch = writeBatch(db);
    changed.slice(i, i + 400).forEach((id) => {
      batch.set(D(clubId, 'memberFees', id), {
        periods: { [monthKey]: { paid: !!paidMap[id], amount: Number(amount) || 0, at } },
      }, { merge: true });
    });
    await batch.commit();
  }
};

/** 내 납부 내역 — 회원 본인이 본다 */
export const subMyFees = (clubId, memberId, cb) =>
  onSnapshot(D(clubId, 'memberFees', memberId), (d) =>
    cb(d.exists() ? d.data() : { periods: {}, claims: {} }));

/** "냈는데 미납으로 되어 있어요" — 회원이 확인을 요청한다.
    회원은 claims 만 건드릴 수 있다(보안 규칙에서 강제). */
export const fileFeeClaim = (clubId, memberId, monthKey, note) =>
  setDoc(D(clubId, 'memberFees', memberId), {
    claims: {
      [monthKey]: { note: note || '', at: new Date().toISOString(), resolved: false },
    },
  }, { merge: true });

/** 회원이 요청을 스스로 취소 */
export const cancelFeeClaim = (clubId, memberId, monthKey) =>
  setDoc(D(clubId, 'memberFees', memberId), {
    claims: { [monthKey]: deleteField() },
  }, { merge: true });

/** 확인 요청 목록 — 회장·총무가 본다 */
export const subFeeClaims = (clubId, cb) =>
  onSnapshot(C(clubId, 'memberFees'), (s) => {
    const out = [];
    s.docs.forEach((d) => {
      Object.entries(d.data().claims || {}).forEach(([period, c]) => {
        if (c && !c.resolved) out.push({ memberId: d.id, period, ...c });
      });
    });
    cb(out.sort((a, b) => String(b.at).localeCompare(String(a.at))));
  });

/** 총무가 확인 요청을 처리 완료로 표시 */
export const resolveFeeClaim = (clubId, memberId, monthKey) =>
  setDoc(D(clubId, 'memberFees', memberId), {
    claims: { [monthKey]: { resolved: true } },
  }, { merge: true });

/* ---- 총무 도구: 입금 대사 · 독촉 · 결산 ---- */

/** 입금자명 별칭 — 총무가 고쳐 준 매칭을 기억한다 ("김철수부인" → 김철수) */
export const subFeeAliases = (clubId, cb) =>
  onSnapshot(D(clubId, 'meta', 'feeAliases'), (d) => cb(d.exists() ? (d.data().map || {}) : {}));

export const saveFeeAliases = (clubId, map) =>
  setDoc(D(clubId, 'meta', 'feeAliases'), { map, updatedAt: serverTimestamp() }, { merge: true });

/** 독촉 발송 기록 — { '2026-08': { first: '2026-08-11', ... } } */
export const subDunningLog = (clubId, cb) =>
  onSnapshot(D(clubId, 'meta', 'dunning'), (d) => cb(d.exists() ? (d.data().sent || {}) : {}));

export const markDunningSent = (clubId, monthKey, stageKey, today) =>
  setDoc(D(clubId, 'meta', 'dunning'), {
    sent: { [monthKey]: { [stageKey]: today } },
  }, { merge: true });

/** 회비 설정(납부일·입금계좌) — 클럽 settings 안에 둔다 */
export const saveFeePolicy = (clubId, { dueDay, account }) =>
  updateDoc(doc(db, 'clubs', clubId), {
    'settings.feeDueDay': Number(dueDay) || 10,
    'settings.feeAccount': account || '',
  });

/** 결산에 쓸 회비 기록 전체 (기간 필터는 화면에서) */
export const loadAllFees = async (clubId) => {
  const snap = await getDocs(C(clubId, 'fees'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/* ---- 일회성 정산 (대회·캠프·회식) ----
   정기 회비와 성격이 달라 별도 컬렉션으로 둔다. 참여자만, 한 번만 낸다. */
export const subDuesPools = (clubId, cb) =>
  onSnapshot(C(clubId, 'duesPools'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))));

export const addDuesPool = (clubId, data) =>
  addDoc(C(clubId, 'duesPools'), { ...data, createdAt: serverTimestamp() });

export const updateDuesPool = (clubId, id, patch) =>
  updateDoc(D(clubId, 'duesPools', id), patch);

export const deleteDuesPool = (clubId, id) => deleteDoc(D(clubId, 'duesPools', id));

/** 한 사람의 납부 표시 토글 */
export const setPoolPaid = (clubId, id, memberId, paid) =>
  updateDoc(D(clubId, 'duesPools', id), { [`paid.${memberId}`]: !!paid });

/** 결산 수기 수입(게스트비·대회 등) */
export const subIncomes = (clubId, cb) =>
  onSnapshot(C(clubId, 'incomes'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
export const addIncome = (clubId, data) => addDoc(C(clubId, 'incomes'), data);
export const deleteIncome = (clubId, id) => deleteDoc(D(clubId, 'incomes', id));

/** 총무 인수인계 — 새 총무 임명 + 전임자는 열람 권한(운영진)으로 */
export const handOverManager = async (clubId, fromId, toId) => {
  const batch = writeBatch(db);
  batch.update(D(clubId, 'members', toId), { role: ROLES.MANAGER });
  if (fromId && fromId !== toId) {
    batch.update(D(clubId, 'members', fromId), { role: ROLES.STAFF });
  }
  batch.set(D(clubId, 'meta', 'handover'), {
    history: arrayUnion({ from: fromId || '', to: toId, at: new Date().toISOString() }),
  }, { merge: true });
  await batch.commit();
};

export const subHandoverHistory = (clubId, cb) =>
  onSnapshot(D(clubId, 'meta', 'handover'), (d) => cb(d.exists() ? (d.data().history || []) : []));

/** 내 회원 문서 한 번 읽기 — 클럽을 옮길 때 프로필을 그대로 가져오려고 쓴다 */
export const getMyMember = async (clubId, uid) => {
  try {
    const d = await getDoc(D(clubId, 'members', uid));
    return d.exists() ? { id: d.id, ...d.data() } : null;
  } catch (e) {
    return null;
  }
};

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
  venues,
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
    /* 코트 검색에서 "이 코트를 쓰는 클럽"을 보여 주려고 함께 공개한다.
       이름과 지역만 담는다 — 코트장 리드나 시간표는 클럽 내부 정보다.
       venues 를 안 넘기면 기존 값을 그대로 둔다(merge). */
    ...(venues ? {
      venues: venues.map((v) => ({
        name: String(v.name || '').trim(),
        sido: String(v.sido || '').trim(),
        addr: String(v.addr || '').trim(),
      })).filter((v) => v.name),
    } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });

/** 코트 검색용 공개 클럽 목록 — 이름·지역·코트장만 담긴 문서들 */
export const subClubDirectory = (cb) =>
  onSnapshot(
    query(collection(db, 'clubDirectory'), where('searchable', '==', true), limit(500)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );

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
   클럽 교류전 — 두 클럽이 같이 보는 문서라 루트에 둔다
   clubMatches/{matchId}

   클럽 하위(clubs/{id}/…)에 두면 상대 클럽이 읽을 수 없다. 남의 클럽
   문서를 열어 주려면 그 클럽 전체를 열어야 하는데 그럴 수는 없다.
   그래서 두 클럽 id 를 나란히 들고 있는 문서를 루트에 만들고,
   보안 규칙이 "이 두 클럽의 사람만" 읽게 한다.
   ============================================================ */
export const createClubMatch = (payload) =>
  addDoc(collection(db, 'clubMatches'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

export const updateClubMatch = (matchId, patch) =>
  updateDoc(doc(db, 'clubMatches', matchId), { ...patch, updatedAt: serverTimestamp() });

export const subClubMatch = (matchId, cb) =>
  onSnapshot(doc(db, 'clubMatches', matchId), (d) =>
    cb(d.exists() ? { id: d.id, ...d.data() } : null));

/* 우리 클럽이 낀 교류전 전부.
   "주최한 것"과 "초대받은 것"은 필드가 달라서 한 번의 질의로 못 가져온다
   (Firestore 에는 OR 이 없다). 두 갈래를 각각 구독해 합친다. */
export const subClubMatches = (clubId, cb) => {
  const bag = { host: [], guest: [] };
  const emit = () => {
    const seen = new Set();
    const all = [...bag.host, ...bag.guest].filter((m) => {
      if (seen.has(m.id)) return false;      // 혼자 연습용으로 자기 클럽을 부른 경우
      seen.add(m.id);
      return true;
    });
    cb(all.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))));
  };
  const un1 = onSnapshot(
    query(collection(db, 'clubMatches'), where('hostClubId', '==', clubId)),
    (s) => { bag.host = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
  );
  const un2 = onSnapshot(
    query(collection(db, 'clubMatches'), where('guestClubId', '==', clubId)),
    (s) => { bag.guest = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
  );
  return () => { un1(); un2(); };
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

/* ============================================================
   코치 (루트, 앱 공용)

     coaches/{uid}                 코치 프로필 — 1인 1프로필이라 문서 id 를 uid 로 둔다
     coachVideos/{videoId}         홍보 영상 — 승인 큐를 한 번에 읽으려고 루트에 둔다
     coachBillings/{coachId_YYYYMM} 광고비 청구 — 코치가 앱에 내는 돈.
                                   문서 id 를 계산해 중복 청구를 막는다

   왜 클럽 밑이 아니라 루트인가
     코치는 특정 클럽 소속이 아니다. 모든 클럽 회원이 같은 목록을 본다.
     클럽 밑에 두면 클럽 수만큼 같은 코치를 복사해야 한다.
   ============================================================ */

export const subCoaches = (cb) =>
  onSnapshot(collection(db, 'coaches'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const subMyCoach = (uid, cb) => {
  if (!uid) { cb(null); return () => {}; }
  return onSnapshot(doc(db, 'coaches', uid), (d) =>
    cb(d.exists() ? { id: d.id, ...d.data() } : null));
};

/** 프로필 저장. 상태는 여기서 건드리지 않는다 — coach.js 의 전이 함수만 쓴다. */
export const saveCoach = (uid, data) =>
  setDoc(doc(db, 'coaches', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });

export const patchCoach = (uid, patch) => updateDoc(doc(db, 'coaches', uid), patch);
export const deleteCoach = (uid) => deleteDoc(doc(db, 'coaches', uid));

export const subCoachVideos = (cb) =>
  onSnapshot(collection(db, 'coachVideos'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const addCoachVideo = (data) =>
  addDoc(collection(db, 'coachVideos'), {
    ...data,
    createdAt: new Date().toISOString(),   // 문자열 — 월별 집계에 그대로 쓴다
    serverAt: serverTimestamp(),
  });

export const patchCoachVideo = (id, patch) => updateDoc(doc(db, 'coachVideos', id), patch);
export const deleteCoachVideo = (id) => deleteDoc(doc(db, 'coachVideos', id));

export const subCoachBillings = (cb) =>
  onSnapshot(collection(db, 'coachBillings'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

/** id 를 코치+월로 계산하므로 같은 달에 두 번 만들어도 한 건으로 합쳐진다 */
export const saveCoachBilling = (id, data) =>
  setDoc(doc(db, 'coachBillings', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

export const deleteCoachBilling = (id) => deleteDoc(doc(db, 'coachBillings', id));

/* ---------- 용품 주문(드랍십) ----------
   지금은 링크형만 쓰지만 주문 구조를 미리 둔다. 나중에 결제를 붙일 때
   상태 이름이 흔들리면 이미 쌓인 주문을 다시 손봐야 하기 때문. */

export const subGearOrders = (cb) =>
  onSnapshot(collection(db, 'gearOrders'), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const subMyGearOrders = (uid, cb) => {
  if (!uid) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, 'gearOrders'), where('buyerUid', '==', uid)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );
};

export const addGearOrder = (data) => addDoc(collection(db, 'gearOrders'), data);
export const patchGearOrder = (id, patch) => updateDoc(doc(db, 'gearOrders', id), patch);

/* ---------- 테스트 알림 ----------
   서버에 일감을 하나 만들고, 서버가 그 문서에 결과를 적어 준다.
   앱은 그 문서를 구독해 "서버가 무엇을 봤는지"를 그대로 보여 준다. */
export const requestTestPush = (clubId, uid) =>
  addDoc(collection(db, 'clubs', clubId, 'pushJobs'), {
    type: 'test',
    by: uid,
    status: 'queued',
    createdAt: serverTimestamp(),
  });

export const subPushJob = (clubId, jobId, cb) =>
  onSnapshot(doc(db, 'clubs', clubId, 'pushJobs', jobId),
    (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null),
    () => cb(null));
