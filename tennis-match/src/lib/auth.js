/* ============================================================
   PHASE 2 — 인증 계층 (Firebase Auth: 전화번호 인증)
   - 로그인된 uid = members 문서 id (1인 1계정)
   - users/{uid} { clubId, name, gender, grade } ← 라우팅 + 게스트 신청 프로필(FIX-05)

   ⚠️ R-1: expo-firebase-recaptcha 는 deprecated. 실기기 전화인증을 본격화할 때
   @react-native-firebase/auth + EAS dev build 로 전환 검토(아래 sendOtp/confirmOtp 교체).
   ============================================================ */
import {
  PhoneAuthProvider, signInWithCredential, onAuthStateChanged, signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

/** 인증 상태 구독 → uid 반환(없으면 null) */
export function subAuth(cb) {
  return onAuthStateChanged(auth, (user) => cb(user ? user.uid : null));
}

/** 전화번호로 OTP 발송 (RN: expo-firebase-recaptcha 의 recaptchaVerifier 필요) */
export async function sendOtp(phoneE164, recaptchaVerifier) {
  const provider = new PhoneAuthProvider(auth);
  const verificationId = await provider.verifyPhoneNumber(phoneE164, recaptchaVerifier);
  return verificationId; // confirmOtp 에 전달
}

/** OTP 코드 확인 → 로그인 완료 */
export async function confirmOtp(verificationId, code) {
  const credential = PhoneAuthProvider.credential(verificationId, code);
  const result = await signInWithCredential(auth, credential);
  return result.user.uid;
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
