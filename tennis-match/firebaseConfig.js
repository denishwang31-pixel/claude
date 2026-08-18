/* ============================================================
   Firebase 초기화. 아래 키를 본인 Firebase 콘솔 값으로 교체하세요.
   (공개 저장소라면 .env / EAS Secrets 로 분리 권장)

   실기기 인증 관련 결정(R-1): expo-firebase-recaptcha 는 deprecated 이므로
   전화번호 인증을 본격 사용할 때는 @react-native-firebase/auth + EAS dev build
   전환을 권장. 이 파일은 Firebase JS SDK 기준 골격.
   ============================================================ */
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyAuz511b8yp_L-7Hg9Cim5Epxt-LQRPw_g",
  authDomain: "tennis-match-52b31.firebaseapp.com",
  projectId: "tennis-match-52b31",
  storageBucket: "tennis-match-52b31.firebasestorage.app",
  messagingSenderId: "738996873154",
  appId: "1:738996873154:web:7309cdb6c54a998afcd85b",
  measurementId: "G-DQYYD8L3E9",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
