# 🎾 테니스 클럽 통합 앱 — 개발 로드맵 & 체크리스트

> React Native(Expo) + Firebase 기반. 단일 코드베이스로 iOS/Android 동시 대응.
> 대진 엔진은 기존 VBA v5 로직을 순수 JS로 이식(무수정 재사용).

---

## PHASE 0. 준비물
- [ ] Node.js LTS 설치, `npm i -g eas-cli`
- [ ] Expo 계정 생성 / Firebase 프로젝트 생성(Spark 무료)
- [ ] GitHub 저장소 생성
- [ ] 패키지명 확정: `com.donghyun.tennismatch`
- [ ] **R-1 결정**: 전화번호 인증 스택 — Firebase JS SDK(현재 골격) vs
      `@react-native-firebase/auth` + EAS dev build(권장). expo-firebase-recaptcha 는 deprecated.

## PHASE 1. 프로젝트 뼈대 — ✅ 완료(재구성 포함)
- [x] 디렉터리 구조 / package.json·app.json·babel.config.js
- [x] firebaseConfig.js (키는 사용자 입력)
- [x] theme.js / ui.jsx / weather.js / constants.js
- [x] matchmaking.js (VBA v5 엔진, Node 회귀 테스트 통과)
- [x] firestore.js / auth.js / seed.js
- [x] **useClub.js** (전 화면 실시간 구독 훅 + rules 키↔객체 매핑)
- [x] app/_layout.jsx / (tabs)/_layout.jsx / 5개 탭 화면
- [x] more.jsx 허브 + 회비/게시판/게스트/코트/회원 서브화면

## PHASE 2. 데이터 연동 — ✅ 완료
- [x] Firestore 스키마 확정
- [x] onSnapshot 실시간 동기화(useClub)
- [x] Security Rules(총무/회원 권한 분리 + 필드 수준 보호)
- [x] 초대코드 가입 플로우(루트 inviteCodes)
- [x] 전화번호 로그인 골격(recaptcha 실배선은 R-1 결정 후)
- [x] 초기 시드 데이터

## PHASE 2.5. 실행 가능화 + 계약 정합 — ✅ 완료 (이번 작업, FIX-01~08)
- [x] FIX-01 useClub.js — 앱 기동 전제 + rules 매핑
- [x] FIX-02 more.jsx + 회비 화면 이식
- [x] FIX-03 firestore.rules 정합(시드/추가 허용, rsvp·posts·guest 필드 보호)
- [x] FIX-04 초대코드 가입 재설계(inviteCodes, ownerId, 죽은 코드 제거)
- [x] FIX-05 게스트 크로스클럽(루트 guestPosts + applicants 서브컬렉션 + uid 귀속)
- [x] FIX-06 댓글 arrayUnion / FIX-07 weather null 계약 / FIX-08 상수화·결산 연도
- [x] scripts/test-engine.mjs (엔진 제약 회귀 123케이스 통과)
- [ ] **남은 실배포 준비(사용자 수동)**: Firebase Phone Auth 활성화,
      `firebase deploy --only firestore:rules`, firebaseConfig 키 입력,
      login.jsx recaptcha 실배선(R-1 결정 반영)
- [ ] `scripts/test-rules.mjs` (@firebase/rules-unit-testing) 작성·통과 — **다음 착수 1순위**
- [ ] Expo Go/dev client 스모크 테스트(로그인→온보딩→5탭)

## PHASE 3. 푸시 알림 (미착수)
- [ ] expo-notifications 토큰 수집 → members.pushToken
- [ ] Cloud Functions 트리거(모임 생성/대진 확정/게스트 확정/회비 리마인드)
- [ ] iOS APNs .p8 발급·등록

## PHASE 4. 실연동 (미착수)
- [ ] 기상청 단기예보 → meeting.forecast (weatherFor 는 이미 forecast 소비 계약)
- [ ] 카카오맵 SDK/WebView + 로컬 API 좌표 변환(코트 lat/lng)
- [ ] (2차) 안드로이드 입금 알림 파싱 네이티브 모듈 — 현재는 CSV 붙여넣기로 대체

## PHASE 5~6. 빌드·내부테스트·스토어 등록 (미착수)
- [ ] eas build preview / 클럽 실사용 / Play $25 / Apple $99

---

## FIX 백로그 (P2, 실사용 데이터 쌓일 때)
- [ ] FIX-09 subMeetings 기간 제한 + meta/pastPairs 집계 문서(구독량·대진 비용 일정화)
- [ ] FIX-10 공용 Toast 컨텍스트 / (선택) Fisher-Yates 셔플 격리

## 고정 원칙 (대진 엔진 — 무수정)
- 잡복 금지: 남복 / 여복 / 혼복(남여 vs 남여)만
- 타임 단위 풀 선발 → 동일 타임 중복 배정 구조적 차단
- 이전 모임 페어 누적 기록 반영 / 우선순위 5기준 드래그 재배열 → 가중치 변동

## 비용 요약
| 항목 | 비용 |
|---|---|
| 개발도구·Firebase·Expo·API | 0원 |
| Google Play (1회) | $25 |
| Apple Developer (연) | $99 |
