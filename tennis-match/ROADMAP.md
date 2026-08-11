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
- [x] `scripts/test-rules.mjs` (@firebase/rules-unit-testing) 작성·에뮬레이터 통과
- [x] login.jsx recaptcha 실배선 (1차: expo-firebase-recaptcha / 2차: RNFirebase 전환)
- [ ] **사용자 수동(SETUP-GUIDE.md 1~2)**: Firebase 키 입력, Phone Auth 활성화, rules 배포
- [ ] Expo Go/dev client 스모크 테스트(로그인→온보딩→5탭)

## PHASE 3. 푸시 알림 — ✅ 코드 완료 (배포는 SETUP-GUIDE.md 3~4)
- [x] expo-notifications 토큰 수집 → members.pushToken (notifications.js + 탭 레이아웃)
- [x] Cloud Functions 트리거 4종: 모임 생성/대진 발표·취소/게스트 확정/회비 리마인드
- [ ] **사용자 수동**: Blaze 전환, functions 배포, eas init(projectId), iOS APNs .p8

## PHASE 4. 실연동 — ✅ 코드 완료 (키 입력은 SETUP-GUIDE.md 3·5)
- [x] 기상청 단기예보 Cloud Function(12시간 주기, 격자 변환, 우천 60%↑ 총무 푸시)
- [x] 카카오맵 WebView 코트 지도 + 주소→좌표 자동 변환(코트 등록 시)
- [ ] **사용자 수동**: KMA_SERVICE_KEY 시크릿, 카카오 키 2종(keys.js)
- [ ] (2차) 안드로이드 입금 알림 파싱 네이티브 모듈 — 현재는 CSV 붙여넣기로 대체

## PHASE 4.5. 동호회 실무 기능 — ✅ 코드 완료 (추가 요청분)
- [x] **NTRP 등급 관리**: 7단계 기준 설명(체크리스트) + 셀프 평가 + 운영진 인증 + 회원 투표(중앙값)
      우선순위 = 운영진 인증 > 투표 중앙값 > 셀프
- [x] **테니스 시작일(구력)**: 온보딩·회원관리에서 입력, 자동 구력 계산(대회 참가 기준)
- [x] **대회 기능**: 예선 조별리그(체크박스로 생략 가능) → 본선 토너먼트, 시드 배정(스네이크 분산 +
      표준 브래킷), 부전승 자동 처리, 조 순위(승수·득실차), 대회 기록 보관
- [x] **커플/고정 페어**: 커플=출전 타임 동기화(함께 오고 감), 고정 페어=같은 팀 고정 + 중복 페널티 면제
- [x] **출석 체크·출석률**: RSVP(의사)와 분리된 실제 출석 기록, 일괄 처리, 회원별 출석률·노쇼 통계
- [x] **클럽 운영 설정**: 코트 면수·운영 시간·타임 길이 → 타임 수 자동 계산,
      최초 클럽 생성 시 입력 + [더보기 → 클럽 설정]에서 변경, 새 모임 기본값으로 사용
- [x] **잡복 허용 옵션 + 사전 진단**: 성비 진단(diagnoseRoster)으로 "몇 면 가능/몇 명 부족"을 계산,
      편성 전 상태 표시 + 3종 경고창(일부 코트만 / 잡복 없이 불가 / 완전 불가)에서 잡복 허용 선택
- [x] 검증: 엔진 367케이스 / 대회 27케이스 / 설정 16케이스 / 규칙 41케이스 통과

## PHASE 5~6. 빌드·내부테스트·스토어 등록 (SETUP-GUIDE.md 4·6)
- [x] eas.json (development/preview/production 프로필)
- [ ] eas build preview / 클럽 실사용 1~2주 / Play $25 / Apple $99

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
