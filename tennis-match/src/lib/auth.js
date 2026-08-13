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

/** 게스트 신청 등에 쓰는 본인 프로필 */
export async function getMyProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** users/{uid} 에 소속 클럽 + 프로필 기록 */
export async function linkUserToClub(uid, clubId, profile) {
  await setDoc(
    doc(db, 'users', uid),
    { clubId, ...profile, createdAt: serverTimestamp() },
    { merge: true },
  );
}

export const logout = () => signOut(auth);
