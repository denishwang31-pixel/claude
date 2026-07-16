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

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
