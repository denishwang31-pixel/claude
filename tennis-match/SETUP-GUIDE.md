# 🔧 사용자 직접 수행 가이드 (코드 외 수동 절차)

> 코드는 전부 준비되어 있습니다. 아래는 **계정·키·콘솔 설정** 등 본인만 할 수 있는 절차입니다.
> 순서대로 진행하면 됩니다. ⏱ 표시는 대략 소요 시간.

---

## 1. Firebase 프로젝트 연결 (⏱ 15분) — 필수, 가장 먼저

1. https://console.firebase.google.com → **프로젝트 추가** (이름 예: `tennis-match`)
2. 프로젝트 설정(⚙️) → 일반 → **앱 추가 → 웹(</>)** 선택 → 앱 등록
3. 표시되는 `firebaseConfig` 값 6개를 **`firebaseConfig.js`** 에 복사
   (apiKey / authDomain / projectId / storageBucket / messagingSenderId / appId)
4. 좌측 **빌드 → Firestore Database → 데이터베이스 만들기** (위치: `asia-northeast3`, 프로덕션 모드)
5. 좌측 **빌드 → Authentication → 시작하기 → 전화** 사용 설정
   - 같은 화면 하단 **테스트용 전화번호**에 본인 번호 + 고정 코드(예: `+821012345678` / `123456`)를
     등록해 두면 SMS 없이 개발 테스트 가능
6. 터미널:
   ```bash
   npm i -g firebase-tools
   firebase login
   cd tennis-match
   cp .firebaserc.example .firebaserc   # 열어서 YOUR_FIREBASE_PROJECT_ID 를 실제 ID로 교체
   firebase deploy --only firestore:rules
   ```

## 2. 로컬 실행 (⏱ 10분)

```bash
cd tennis-match
npm install
npm run test:engine     # 대진 엔진 검증 (Firebase 불필요)
npm run test:rules      # 보안 규칙 검증 (Java 17+ 필요, 에뮬레이터 자동 실행)
npx expo start          # QR → Expo Go
```
- ⚠️ **푸시 알림은 Expo Go 에서 동작하지 않습니다**(안드로이드 SDK 53+). 앱 흐름 확인만 Expo Go로 하고,
  푸시까지 보려면 4번의 dev build 를 쓰세요.

## 3. Cloud Functions 배포 (⏱ 20분) — 푸시·날씨의 서버측

1. Firebase 콘솔 → 좌측 하단 **요금제 업그레이드 → Blaze(종량제)**
   - 카드 등록만 필요. 이 규모(클럽 수십 명)는 **무료 쿼터 내**라 실제 청구 0원 예상.
2. 기상청 키 발급: https://www.data.go.kr 가입 →
   **"기상청_단기예보 ((구)_동네예보) 조회서비스"** 검색 → 활용신청(즉시 승인) →
   마이페이지에서 **일반 인증키(Decoding)** 복사
3. 터미널:
   ```bash
   cd tennis-match
   firebase functions:secrets:set KMA_SERVICE_KEY   # 위 키 붙여넣기
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```

## 4. EAS 빌드 (⏱ 30분 + 빌드 대기)

```bash
npm i -g eas-cli
eas login                # Expo 계정 (expo.dev 가입)
cd tennis-match
eas init                 # projectId 가 app.json 에 자동 기록됨 → 푸시 토큰 발급에 사용
eas build --profile development --platform android   # 푸시 포함 개발용 APK
eas build --profile preview --platform android       # 클럽 배포용 APK
```
- iOS 는 Apple Developer($99/년) 가입 후 `--platform ios`. TestFlight 업로드는 `eas submit`.

## 5. 카카오맵 (⏱ 15분) — 선택(안 해도 간이 지도로 동작)

1. https://developers.kakao.com → 애플리케이션 추가
2. 앱 설정 → **앱 키**에서 `JavaScript 키`, `REST API 키` 복사
3. **`src/lib/keys.js`** 에 두 키 입력
4. 앱 설정 → 플랫폼 → Web → 사이트 도메인에 `https://localhost` 추가
   (WebView 내 지도 SDK 로드용)

## 6. 스토어 등록 (출시 시점)

- **Google Play**: https://play.google.com/console 가입($25 1회) →
  `eas build --profile production --platform android`(AAB) 업로드 →
  개인정보처리방침 URL(노션 페이지 가능) → 비공개 테스트(테스터 20명·14일) → 프로덕션
- **App Store**: Apple Developer($99/년) → `eas submit --platform ios` →
  심사 대응(전화 인증 테스트 계정 제공 필요)

---

## 남은 개발 결정 1건 — R-1 (전화 인증 스택)

현재 코드는 **Firebase JS SDK + expo-firebase-recaptcha** 로 배선되어 있습니다(1차 출시 가능).
이 패키지는 deprecated 라 장기적으로는 **`@react-native-firebase/auth` + dev build** 전환이 안전합니다.
전환 시점: 1차 출시 후. 전환 범위: `auth.js`의 sendOtp/confirmOtp + `login.jsx`의 모달 제거 (데이터 계층은 무관).
지금 당장은 아무것도 안 해도 됩니다 — 1번의 테스트용 전화번호로 개발하세요.
