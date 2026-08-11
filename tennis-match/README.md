# 테니스매치 (tennis-match)

React Native(Expo) + Firebase. iOS/Android 단일 코드베이스.

## 실행
```bash
npm install
# firebaseConfig.js 에 본인 Firebase 프로젝트 키 입력
npx expo start        # QR 스캔 → Expo Go 앱에서 즉시 실행
```

## 대진 엔진 단독 검증
```bash
node scripts/test-engine.mjs
```

## 구조
```
app/
  _layout.jsx           로그인/클럽 컨텍스트 (AppCtx)
  (tabs)/
    _layout.jsx         5탭 네비게이션
    index.jsx           홈 (총무 대시보드)
    schedule.jsx        일정 / RSVP
    match.jsx           대진 (우선순위 드래그 + 휴식점수 + 스코어)
    rank.jsx            랭킹 / 커리어(케미·H2H) / 시즌 결산
    more.jsx            회비/게시판/게스트/코트/회원 허브
src/
  lib/
    matchmaking.js      ⭐ VBA v5 대진 엔진 (순수 JS, 무의존)
    firestore.js        데이터 접근 계층 (실시간 구독/쓰기)
    theme.js            디자인 토큰
    weather.js          날씨 (기상청 API 연동 지점)
  hooks/useClub.js      클럽 전체 실시간 구독 훅
  components/           공용 UI + 서브화면
firebaseConfig.js       ← 키 입력 필요
```

## 현재 상태
- **PHASE 1~4.5 코드 완료** — 기본 운영(모임·대진·회비·게시판·게스트·코트) + 푸시/날씨/지도
  + NTRP 등급, 구력, 대회(예선·토너먼트·시드), 커플/고정페어, 출석률.
- 검증: `npm run test:engine`(444) · `test:tournament`(40) · `test:schedule`(16) · `test:rules`(48, Java 필요)

## 주요 기능
| 탭 | 기능 |
|---|---|
| 홈 | 다음 모임·날씨·우천취소·랭킹 TOP3 |
| 일정 | 모임 등록, RSVP(참석 의사) |
| 대진 | VBA v5 엔진(잡복 금지·타임 중복 방지·페어 누적), **타임별 유형(혼복/남여복/단식)**, **NTRP 실력 매칭**, 우선순위 드래그, 휴식점수, 커플/고정페어, 성비 진단 + 잡복 확인창 |
| 랭킹 | 클럽 랭킹, 내 커리어(케미·H2H), 시즌 결산 |
| 더보기 | **대회**(예선+토너먼트+시드+**NTRP 실력그룹**) · **NTRP** · **출석** · **커플/페어** · 회비 · 게시판 · 게스트 모집 · 코트 검색 · 회원 · **코트장 관리** · **대진 설정** · 클럽 설정 |

## 시작하기
**→ `SETUP-GUIDE.md` 를 순서대로 따라하세요** (Firebase 키 → 로컬 실행 → Functions 배포 → EAS 빌드 → 카카오 키 → 스토어)

## 남은 작업 (ROADMAP.md 참조)
- 사용자 수동: SETUP-GUIDE.md 1~6 (계정/키/콘솔/빌드)
- R-1 2차: @react-native-firebase/auth 전환(1차 출시 후)
- 2차 기능: 안드로이드 입금 알림 파싱 네이티브 모듈
- FIX-09/10(P2): 구독 범위 제한·pastPairs 집계, 공용 Toast
