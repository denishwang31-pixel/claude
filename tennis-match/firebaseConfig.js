/* ============================================================
   Firebase 초기화. 아래 키를 본인 Firebase 콘솔 값으로 교체하세요.
   (공개 저장소라면 .env / EAS Secrets 로 분리 권장)

   실기기 인증 관련 결정(R-1): expo-firebase-recaptcha 는 deprecated 이므로
   전화번호 인증을 본격 사용할 때는 @react-native-firebase/auth + EAS dev build
   전환을 권장. 이 파일은 Firebase JS SDK 기준 골격.
   ============================================================ */
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { authStorage } from './src/lib/authStorage';

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

/* ⚠️ getAuth() 를 쓰면 안 된다 — React Native 에서는 로그인 상태를
      메모리에만 담아서, 앱을 껐다 켜면 로그인이 풀린다. 실제로 그랬다.
      initializeAuth 로 **어디에 남길지**를 직접 정해 줘야 한다.

      저장소는 src/lib/authStorage.js 다. AsyncStorage 대신 쓰는 이유는
      그 파일 머리말에 적어 두었다(요지: 새 빌드 없이 된다).

   ⚠️ initializeAuth 는 한 앱에 한 번만 부를 수 있다. 두 번 부르면
      던진다. 개발 중 새로고침이나 모듈이 두 번 평가되는 상황에서
      실제로 일어나므로, 두 번째부터는 이미 만들어 둔 것을 돌려준다.
      여기서 던지면 앱이 아예 안 뜬다 — 로그인 유지 하나 때문에
      그렇게 될 이유가 없다.

   ⚠️ 실패하면 **조용히** 예전 동작(메모리)으로 돌아간다. 그게 제일
      위험한 모양이다 — 고친 줄 알았는데 안 고쳐졌고, 증상은 전과
      똑같아서 알아차릴 방법이 없다. 그래서 어느 길로 갔는지 남겨 두고
      [더보기 → 앱 정보]에 그대로 보여 준다. 추측하지 않는다. */
export let authPersistence = '메모리';   // 켜지면 '파일' 로 바뀐다

function makeAuth() {
  try {
    if (typeof getReactNativePersistence !== 'function') {
      /* 번들에 이 함수가 안 들어온 경우. firebase 를 올리거나 번들러
         설정이 바뀌면 생길 수 있다. 던지지 않고 아래로 내려간다. */
      return getAuth(app);
    }
    const a = initializeAuth(app, {
      persistence: getReactNativePersistence(authStorage),
    });
    authPersistence = '파일';
    return a;
  } catch (e) {
    /* initializeAuth 를 이미 불렀다면 만들어 둔 것을 그대로 쓴다.
       이 경우는 로그인 유지가 이미 켜져 있다. */
    try {
      const a = getAuth(app);
      if (a?._initializationPromise) authPersistence = '파일';
      return a;
    } catch (e2) {
      return getAuth(app);
    }
  }
}

export const auth = makeAuth();
