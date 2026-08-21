/* ============================================================
   PHASE 2 — 인증 계층 (Firebase Auth: 전화번호 인증)
   - 로그인된 uid = members 문서 id (1인 1계정)
   - users/{uid} { clubId, name, gender, grade } ← 라우팅 + 게스트 신청 프로필(FIX-05)

   ⚠️ R-1: expo-firebase-recaptcha 는 deprecated. 실기기 전화인증을 본격화할 때
   @react-native-firebase/auth + EAS dev build 로 전환 검토(아래 sendOtp/confirmOtp 교체).
   ============================================================ */
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously,
  deleteUser, reauthenticateWithCredential, EmailAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

/** 인증 상태 구독 → uid 반환(없으면 null) */
export function subAuth(cb) {
  return onAuthStateChanged(auth, (user) => cb(user ? user.uid : null));
}

/* ------------------------------------------------------------------
   로그인 방식 (1차: 이메일 / 체험용 익명)
   ⚠️ 전화번호 인증은 Firebase "JS" SDK 로는 RN 에서 recaptcha 웹뷰가 필요한데,
   그 역할을 하던 expo-firebase-recaptcha 가 SDK 48 에서 지원 종료됐다.
   전화 인증은 R-1 2차에서 @react-native-firebase/auth 로 전환하며 붙인다.
   (전환 시 이 파일의 signIn* 만 교체하면 되고 나머지 계층은 그대로)
   ------------------------------------------------------------------ */

/** 이메일 회원가입 → uid */
export async function signUpEmail(email, password) {
  const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return res.user.uid;
}

/** 이메일 로그인 → uid */
export async function signInEmail(email, password) {
  const res = await signInWithEmailAndPassword(auth, email.trim(), password);
  return res.user.uid;
}

/** 체험 모드(익명) 로그인 → uid.
 *  Firebase 콘솔 → Authentication → 로그인 방법 → "익명" 사용 설정 필요.
 *  앱을 지우면 계정이 사라지므로 실사용 전 이메일 계정 사용 권장. */
export async function signInAnon() {
  const res = await signInAnonymously(auth);
  return res.user.uid;
}

/** 로그인 사용자의 소속 clubId (없으면 null → 온보딩) */
export async function getMyClubId(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data().clubId : null;
}

/** 온보딩 라우팅에 필요한 상태를 한 번에 —
 *  clubId        : 소속 클럽(있으면 바로 앱으로)
 *  pendingClubId : 승인 대기 중인 클럽(있으면 대기 화면)
 *  skipped       : "나중에 하기"를 눌러 클럽 없이 둘러보는 중 */
export async function getMySession(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const d = snap.exists() ? snap.data() : {};
  return {
    clubId: d.clubId || null,
    pendingClubId: d.pendingClubId || null,
    skipped: !!d.skippedOnboarding,
    profile: d.name ? { name: d.name, gender: d.gender, grade: d.grade, startedAt: d.startedAt } : null,
  };
}

/** 승인 대기 상태 기록 — 앱을 껐다 켜도 대기 화면으로 돌아오게 */
export async function markPendingClub(uid, clubId, profile) {
  await setDoc(doc(db, 'users', uid),
    { pendingClubId: clubId, ...(profile || {}), updatedAt: serverTimestamp() },
    { merge: true });
}

/** "나중에 하기" — 클럽 없이 앱 둘러보기 */
export async function skipOnboarding(uid, profile) {
  await setDoc(doc(db, 'users', uid),
    { skippedOnboarding: true, ...(profile || {}), updatedAt: serverTimestamp() },
    { merge: true });
}

/** 게스트 신청 등에 쓰는 본인 프로필 */
export async function getMyProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** users/{uid} 에 소속 클럽 + 프로필 기록 (가입 확정 시 대기 상태는 지운다) */
export async function linkUserToClub(uid, clubId, profile) {
  await setDoc(
    doc(db, 'users', uid),
    { clubId, ...profile, pendingClubId: null, skippedOnboarding: false, createdAt: serverTimestamp() },
    { merge: true },
  );
}

export const logout = () => signOut(auth);

/* ============================================================
   계정 삭제

   순서가 중요하다
     본인 확인 → 클럽 정리 → 개인정보 삭제 → 로그인 계정 삭제

   왜 본인 확인이 가장 먼저인가
     Firebase 는 마지막 로그인이 오래된 계정의 삭제를 거부한다
     (auth/requires-recent-login). 그걸 마지막에 만나면 이미 데이터는
     지워졌는데 계정만 남는 최악의 상태가 된다. 그래서 맨 앞에서
     한 번 확인해 두고 시작한다.
   ============================================================ */

/** 지금 로그인한 사람의 이메일 (익명 계정이면 빈 문자열) */
export const currentEmail = () => auth.currentUser?.email || '';

/** 익명(체험) 계정인가 — 비밀번호가 없으므로 본인 확인을 건너뛴다 */
export const isAnonymousUser = () => !!auth.currentUser?.isAnonymous;

/**
 * 본인 확인. 이메일 계정이면 비밀번호를 다시 받는다.
 * @returns {{ok: boolean, reason?: string}}
 */
export async function reauthenticate(password) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: '로그인 상태가 아닙니다' };
  if (user.isAnonymous) return { ok: true };          // 확인할 비밀번호가 없다
  if (!user.email) return { ok: true };               // 이메일이 아닌 방식
  if (!password) return { ok: false, reason: '비밀번호를 입력하세요' };
  try {
    await reauthenticateWithCredential(
      user, EmailAuthProvider.credential(user.email, password),
    );
    return { ok: true };
  } catch (e) {
    const code = e?.code || '';
    if (code.includes('wrong-password') || code.includes('invalid-credential')) {
      return { ok: false, reason: '비밀번호가 맞지 않습니다' };
    }
    if (code.includes('too-many-requests')) {
      return { ok: false, reason: '시도가 너무 많습니다. 잠시 후 다시 해 주세요' };
    }
    return { ok: false, reason: e?.message || String(e) };
  }
}

/** 로그인 계정 자체를 지운다 — 되돌릴 수 없다 */
export async function deleteAuthUser() {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: '로그인 상태가 아닙니다' };
  try {
    await deleteUser(user);
    return { ok: true };
  } catch (e) {
    const code = e?.code || '';
    if (code.includes('requires-recent-login')) {
      return { ok: false, reason: '본인 확인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요' };
    }
    return { ok: false, reason: e?.message || String(e) };
  }
}
