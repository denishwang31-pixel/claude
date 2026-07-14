# 🎾 테니스 클럽 앱 — 코드 리뷰 & Opus 4.8 작업 지시서

> 작성: Fable 5 (리뷰·설계 담당) / 실행: Opus 4.8 (코드 작성 담당)
> 기준 코드: files.zip(Phase 1 core) + files_1.zip(화면) + files_2.zip(Phase 2 auth) + tennisclubapp_3.jsx(원본 프로토타입)
> 전제: **useClub.js, more.jsx 는 존재하지 않음(미작성)** — 사용자 확인 완료.

---

## 1. 프로젝트 구조 요약

```
app/
  _layout.jsx          ✅ 인증 라우팅 가드 + AppCtx (uid/clubId/me)
  login.jsx            ✅ 전화번호 OTP (recaptcha 미배선 — 알려진 TODO)
  onboarding.jsx       ✅ 클럽 생성 / 초대코드 가입
  (tabs)/
    _layout.jsx        ❌ 미확인(첨부 없음) — 5탭 네비게이션
    index.jsx          ✅ 홈(총무 대시보드)
    schedule.jsx       ✅ 일정/RSVP
    match.jsx          ✅ 대진(우선순위 드래그 + 휴식점수 + 스코어)
    rank.jsx           ✅ 랭킹/커리어/결산
    more.jsx           ❌ 미작성 — 회비/게시판/게스트/코트/회원 허브
src/
  lib/matchmaking.js   ✅ VBA v5 대진 엔진 (순수 JS, 무의존) — 품질 최상
  lib/firestore.js     ✅ 데이터 접근 계층
  lib/auth.js          ✅ 인증 계층
  lib/seed.js          ✅ 시드 주입
  lib/theme.js         ❌ 미확인
  lib/weather.js       ❌ 미확인 (index/schedule이 import)
  hooks/useClub.js     ❌ 미작성 — **모든 화면이 import. 앱 실행 불가의 원인**
  components/ui.jsx    ❌ 미확인 (Card/Btn/Chip/Field/Avatar/SectionTitle)
  components/MoreScreens.jsx ✅ 게시판/게스트/코트/회원 (회비 없음)
firestore.rules        ✅ 작성됨 — 그러나 코드와 계약 충돌 다수
firebaseConfig.js      ❌ 미확인 (사용자 키 입력 필요)
```

**장점 3**
1. 대진 엔진이 순수 JS 무의존 모듈로 완벽 분리 — 원본 로직 무손실 이식 + 빈 슬롯 복구 등 방어코드가 오히려 보강됨. 테스트/재사용 최적.
2. 화면 → `firestore.js` 데이터 계층 → Firebase 로 의존 방향이 일관됨. 화면이 SDK를 직접 만지는 곳이 온보딩 한 곳뿐.
3. 라우팅 가드(로그인→온보딩→탭) 구조와 Firestore 스키마 설계가 명확해 Phase 3~4 확장 지점이 분명함.

**당장 개선할 점 3**
1. **앱이 실행 불가**: `useClub.js`(전 화면 의존)·`more.jsx`·`ui.jsx`·`weather.js`·`(tabs)/_layout.jsx` 부재. "Phase 1·2 완료"는 실제로는 미완.
2. **Security Rules ↔ 코드 계약 충돌 3건**: members 생성 규칙 vs seed/addMember, 초대코드 조회 vs clubs read 규칙(가입 자체 불가), rules 저장형(키 배열) vs 소비형(객체 배열).
3. **크로스클럽 기능(게스트 모집)이 클럽 하위 컬렉션에 갇혀** 있어 "공개 게시판" 요구사항이 구조적으로 불가능.

---

## 2. 4축 코드 리뷰

### (1) 버그 / 로직 오류

| ID | 위치 | 문제 | 방치 시 리스크 |
|---|---|---|---|
| B-1 | `src/hooks/useClub.js` (부재) | 모든 탭 화면이 `useClub(clubId)`로 `{club, members, meetings, posts, guestPosts, courts, rules}`를 받는 계약인데 파일이 없음. 특히 `rules`는 Firestore에 **키 문자열 배열**로 저장되지만(`firestore.js:49 setRules`) 화면(`match.jsx renderRule`)과 엔진(`matchmaking.js:64`)은 **`{key,name,desc}` 객체 배열**을 기대. | 번들 실패로 앱 자체가 안 뜸. 매핑 없이 배선하면 대진 탭 크래시. |
| B-2 | `app/(tabs)/more.jsx` (부재) + `MoreScreens.jsx` | 회비(Fees) 화면이 이식 목록에서 누락. 원본 `tennisclubapp_3.jsx:691~749`(월별 납부 현황, CSV 붙여넣기 매칭, 입금 푸시 시뮬레이션, 미납 리마인드)가 통째로 빠짐. 데이터 계층(`setFeePaid/subFee`)만 존재. | "회비 자동 업데이트" 핵심 요구사항의 UI 접점이 없음. |
| B-3 | `seed.js:33 seedClub` | `writeBatch`가 데모 회원을 랜덤 ID로 생성 → rules의 `create: uid==memberId` 위반 → **배치 전체 롤백**. 같은 배치의 `meta/rules`·코트·공지까지 전부 미생성. | 신규 클럽 생성이 항상 실패(기본값 withDemo=true). rules 문서 부재로 대진 탭 2차 크래시. |
| B-4 | `onboarding.jsx:41 doJoin` | 비멤버가 `clubs`를 `inviteCode`로 쿼리하지만 rules상 `clubs read: isMember()` → **가입 쿼리가 항상 permission-denied**. | 초대코드 가입 플로우 전체 불능. |
| B-5 | `MoreScreens.jsx:73 Guest.confirm` | 신청자를 자기 클럽 `members`에서만 조회 → 타 클럽 회원이면 `undefined`라 모임 `guests`에 미추가. 게스트 전적도 `'g:'+name` 문자열이라 본인 계정 누적 불가(동명이인 충돌 포함). | "공개 게스트 초청 + 본인 기록 누적" 요구사항 미충족. |
| B-6 | `firestore.js:76 addComment` | 읽어둔 comments 스냅샷에 push 후 배열 전체 덮어쓰기. 두 명이 동시에 댓글 달면 늦게 쓴 쪽이 이김. | 동시 작성 시 댓글 유실. |
| B-7 | `schedule.jsx:33` / `index.jsx:27` | `weatherFor` 반환값 null 방어가 화면마다 다름(index는 `w &&`, schedule은 무방비로 `w.icon` 접근). weather.js 계약 미확정. | 예보 없는 날짜에서 일정 탭 크래시 가능. |
| B-8 | `firestore.js:93 createClub` / `101 findClubByCode` | 초대코드가 `Math.random` 기반(6자 미만 가능, 중복 검사 없음). `findClubByCode`는 결과가 아닌 query 객체를 반환하는 죽은 코드. `onboarding.jsx:24`의 `'DEMO_ME'` 폴백, `auth.js`의 `signInWithPhoneNumber` 미사용 import도 정리 대상. | 코드 충돌 시 엉뚱한 클럽 가입. 죽은 코드가 후속 작업 오도. |
| B-9 | `rank.jsx:114` | "2026 SEASON WRAPPED" 연도 하드코딩 + 결산이 전체 누적 기준(연도 필터 없음). | 해가 바뀌면 표기·집계 불일치. |

### (2) 보안 이슈

| ID | 위치 | 문제 | 방치 시 리스크 |
|---|---|---|---|
| S-1 | `firestore.rules:31` members create | `uid==memberId`만 검사 → **clubId만 알면 초대코드 없이 아무 클럽이나 자가 가입 가능**. 초대코드 검증이 앱 코드에만 있고 규칙엔 없음. 동시에 총무의 회원 추가(addMember, 랜덤 ID)는 거부됨 — 정반대로 뚫리고 막힘. | 무단 가입 + 총무 기능 불능. |
| S-2 | `firestore.rules:41` meetings update | `hasOnly(['rsvp'])`는 최상위 필드만 검사 → 회원이 **rsvp 맵 전체를 덮어써 남의 참석 여부 조작** 가능. | 대진 편성의 입력 데이터(참석자) 무결성 붕괴. |
| S-3 | `firestore.rules:51` posts update | `isMember()`면 누구나 **공지 포함 모든 글의 제목·본문·pinned를 덮어쓰기** 가능(댓글 허용을 위해 열어둔 부작용). | 공지 위변조. |
| S-4 | `firestore.rules:59` guestPosts update | 누구나 applicants의 남의 status를 'confirmed'로 바꾸거나 slots·fee 조작 가능. UI만 총무 노출일 뿐 규칙 무방비. | 게스트 확정 권한 우회. |
| S-5 | `users/{uid}` + 라우팅 | 사용자가 자기 users 문서에 임의 clubId를 써서 라우팅 진입 가능(멤버가 아니면 이후 read는 거부되므로 실해는 낮음). S-1과 결합 시 완전 우회. | S-1 해결 시 잔여 위험 낮음(문서화만). |

### (3) 성능 병목

| ID | 위치 | 문제 | 방치 시 리스크 |
|---|---|---|---|
| P-1 | `firestore.js:26 subMeetings` | 과거 포함 **전체 모임 문서**(각각 matches 배열 내장)를 항시 구독. `collectPastPairs`가 전체 이력을 요구하는 구조라 모임이 쌓일수록 구독 페이로드·재렌더 선형 증가. | 1~2년 운영 시 로딩·요금·재렌더 비용 증가. (지금 규모에선 허용) |
| P-2 | `computeStats` 호출부 (index/rank) | 전체 meetings 변경마다 전 회원 전적 재계산. useMemo는 있으나 P-1과 결합해 재계산 빈도 높음. | P-1 해결(집계 문서)과 함께 자연 해소. |
| P-3 | `matchmaking.js` `sort(() => Math.random()-0.5)` | 편향 셔플(성능 아닌 품질 이슈). 엔진 "무수정 원칙"과 상충하므로 **선택 항목** — 바꾼다면 Fisher-Yates로 격리 함수화. | 특정 자리 배치 확률 편향(체감 미미). |

### (4) 가독성 / 유지보수성

| ID | 위치 | 문제 |
|---|---|---|
| M-1 | 전 화면 | `meVal`/`isAdmin`/`nameOf`/`today()` 파생 로직이 화면마다 복붙. useClub 훅으로 단일화 필요. |
| M-2 | 전 코드 | `'총무'`/`'운영진'`/`'회원'`, `'g:'` 접두사 등 매직 문자열 산재. rules 파일과도 문자열로만 동기화됨. 상수 모듈 필요. |
| M-3 | `firestore.js:62,65` | `saveMatches`/`saveScore`가 완전 동일 함수 중복. `setMe`는 빈 함수 죽은 코드. |
| M-4 | `MoreScreens.jsx` | 4개 화면 1파일 260줄. 회비 추가 시 5개 — 파일 분리 필요. |
| M-5 | 전 화면 | toast(flash) 로직 중복. 공용 Toast 컨텍스트로 승격. |

---

## 3. Opus 4.8 작업 지시문 (FIX-01 ~ FIX-10)

> 공통 제약: **`src/lib/matchmaking.js`의 엔진 로직은 수정 금지**(FIX-10의 셔플 격리만 예외적 허용).
> 모든 FIX는 기존 파일의 스타일(함수형 컴포넌트, 한국어 주석, theme 토큰 `C`)을 따를 것.

---

### FIX-01 — `src/hooks/useClub.js` 신규 작성 (앱 기동의 전제)
- **대상**: `src/hooks/useClub.js` (신규)
- **목표**: 전 화면이 의존하는 실시간 구독 훅을 만들어 앱을 실행 가능 상태로 만든다.
- **접근**: `subClub/subMembers/subMeetings/subPosts/subGuestPosts/subCourts/subRules/subFee`를 useEffect로 일괄 구독·해제. **rules는 키 배열 → `DEFAULT_RULES` 객체 배열로 매핑**(모르는 키는 무시, 누락 키는 기본 순서로 뒤에 보충 — 앱 업데이트로 기준이 추가돼도 안전). `meVal`(members에서 uid 조회), `isAdmin`, `nameOf`를 훅에서 파생해 반환(M-1 해소).
- **Before**: 파일 부재 → 번들 실패. / **After**: `const {club, members, meetings, posts, guestPosts, courts, rules, fee, meVal, isAdmin, nameOf} = useClub(clubId, {feeMonth})`.
- **Opus 4.8 지시문**: "1) `src/hooks/useClub.js` 생성, firestore.js의 sub* 전부를 clubId 변경 시 재구독/정리되게 배선. 2) rules 매핑 함수 `hydrateRules(orderKeys)` 작성: null이면 DEFAULT_RULES 그대로, 배열이면 키 순서대로 DEFAULT_RULES 항목 재배열 + 누락 키 뒤에 보충. 3) meVal/isAdmin/nameOf 파생 포함해 반환. 4) index/schedule/match/rank 화면의 중복 파생 로직을 훅 반환값 사용으로 교체. 5) `node --experimental-*` 없이 검증 어려우므로 최소한 import 그래프가 끊기지 않는지 expo start로 확인."
- **난이도**: 중 / **우선순위**: **P0**

### FIX-02 — `app/(tabs)/more.jsx` 신규 작성 + 회비 화면 이식
- **대상**: `app/(tabs)/more.jsx` (신규), `src/components/FeesScreen.jsx` (신규), `MoreScreens.jsx`
- **목표**: 더보기 허브(회비/게시판/게스트/코트/회원/설정/로그아웃)를 완성하고 원본의 회비 화면을 RN으로 이식한다.
- **접근**: 원본 `tennisclubapp_3.jsx:691~749` Fees 컴포넌트를 RN 변환(div→View, textarea→multiline TextInput). 월 선택, 납부 토글(총무만), CSV/텍스트 붙여넣기 이름 매칭(`runMatch`), 입금 푸시 시뮬레이션 버튼(Phase 4 네이티브 연동 전 자리표시), 미납 리마인드 버튼(Phase 3 연결 지점 주석). 데이터는 `subFee`/`setFeePaid` 사용.
- **Before**: more 탭 부재, 회비 기능 접점 없음. / **After**: 5탭 완성, 회비 수동+반자동 플로우 동작.
- **Opus 4.8 지시문**: "1) more.jsx를 서브화면 스위처(허브 리스트 → Board/Guest/Courts/Members/Fees)로 작성, MoreScreens.jsx의 기존 4개 컴포넌트에 useClub 데이터를 props로 전달. 2) FeesScreen을 원본 691~749줄 기준으로 RN 이식, 이름 매칭 로직은 원본 그대로. 3) 로그아웃(auth.logout)과 클럽 초대코드 표시(총무용)를 더보기 하단에 추가. 4) MoreScreens.jsx가 260줄을 넘으므로 화면별 파일 분리(M-4)는 이 작업에서 함께 수행."
- **난이도**: 중 / **우선순위**: **P0**

### FIX-03 — `firestore.rules` 계약 정합 + 필드 수준 보호
- **대상**: `firestore.rules` 전체
- **목표**: 코드가 실제로 하는 쓰기를 허용하고, 열어둔 구멍(S-1~S-4)을 필드 수준으로 닫는다.
- **접근**:
  - members create: `request.auth.uid == memberId || isAdmin()` (B-3, 총무 추가·시드 허용). 자가 가입은 FIX-04의 초대코드 검증과 결합.
  - meetings update(회원): `affectedKeys().hasOnly(['rsvp'])` **및** `request.resource.data.rsvp.diff(resource.data.rsvp).affectedKeys().hasOnly([request.auth.uid])` (S-2).
  - posts update(일반 회원): `affectedKeys().hasOnly(['comments'])`만 허용, 그 외는 작성자 본인 또는 admin (S-3). ※ posts 문서에 `authorId` 필드 추가 필요 → firestore.js `addPost`에 uid 저장.
  - guestPosts update(일반 회원): `affectedKeys().hasOnly(['applicants'])` + 본인 항목만 추가/변경 가능하게 검증, 확정(status='confirmed')은 admin만 (S-4). 규칙이 복잡해지면 "신청은 서브컬렉션 `applicants/{uid}`로 분리"가 더 단순 — FIX-05와 함께 결정.
- **Before**: 시드 롤백·총무 추가 불능 + 회원이 공지/남의 RSVP 조작 가능. / **After**: 코드와 규칙 계약 일치, 최소 권한.
- **Opus 4.8 지시문**: "1) 위 4개 블록을 순서대로 수정. 2) `addPost`에 `authorId: uid` 필드 추가하고 Board 컴포넌트 호출부도 갱신. 3) Firebase 에뮬레이터(`firebase emulators:start --only firestore`) + `@firebase/rules-unit-testing`으로 최소 6케이스(시드 배치 성공/자가입 거부/타인 RSVP 거부/본인 RSVP 허용/공지 덮어쓰기 거부/댓글 허용) 테스트 스크립트를 `scripts/test-rules.mjs`로 작성해 통과 확인."
- **난이도**: 상 / **우선순위**: **P0**

### FIX-04 — 초대코드 가입 플로우 재설계
- **대상**: `onboarding.jsx doJoin`, `firestore.js createClub/findClubByCode`, `firestore.rules`
- **목표**: 비멤버가 clubs를 읽지 못해도 초대코드로 가입 가능하게 한다 (B-4, S-1 동시 해결).
- **접근**: 루트 컬렉션 `inviteCodes/{CODE}` = `{clubId, clubName}` 도입. 생성은 createClub에서(코드 충돌 시 재생성 루프, `crypto.getRandomValues` 기반 6자 A-Z0-9 — B-8 해소). 규칙: `inviteCodes` read는 로그인 사용자 전체 허용(코드를 알아야 문서를 특정할 수 있어 열거 위험 낮음), write는 해당 클럽 admin. members 자가 create 규칙에 "요청 데이터의 codeRef 검증" 대신 **간단하게**: 자가 create 허용 조건을 `exists(inviteCodes/$(request.resource.data.joinCode)) && get(...).data.clubId == clubId`로.
- **Before**: doJoin이 permission-denied로 항상 실패. / **After**: 코드 조회 1회 read → members 생성 → users 링크, 규칙 수준에서 코드 검증.
- **Opus 4.8 지시문**: "1) createClub에 inviteCodes 문서 생성 추가(충돌 검사 포함), 기존 clubs.inviteCode 필드는 표시용으로 유지. 2) doJoin을 `getDoc(doc(db,'inviteCodes',code))` 기반으로 재작성, member 문서에 `joinCode` 필드 포함. 3) rules에 inviteCodes 블록과 members create 검증 추가. 4) 죽은 코드 제거: findClubByCode, setMe, onboarding의 'DEMO_ME' 폴백, auth.js 미사용 import (B-8). 5) FIX-03 테스트 스크립트에 '올바른 코드 가입 성공/틀린 코드 거부' 2케이스 추가."
- **난이도**: 중 / **우선순위**: **P0**

### FIX-05 — 게스트 모집 크로스클럽 재설계
- **대상**: `guestPosts` 스키마, `MoreScreens.jsx Guest`, `firestore.js`, `firestore.rules`
- **목표**: "공개 게시판에 모집 → 타 클럽 사용자 신청 → 총무 확정 → 대진 포함 + **본인 계정에 기록 누적**" 요구사항 충족 (B-5).
- **접근**: `guestPosts`를 클럽 하위에서 **루트 공개 컬렉션 `guestPosts/{postId}`** 로 이동(`{clubId, clubName, date, place, region, slots, need, fee, applicants}`). 신청자는 `{uid, name, gender, grade, status}`를 **본인 users 프로필에서 가져와** 저장. confirm 시 모임 guests에 `{uid, name, gender, grade}` 저장하고 대진 참석자 ID를 `'g:'+uid`로 통일(nameOf도 uid→이름 해석으로 변경). 이러면 게스트 전적이 uid에 귀속돼 계정 누적 가능. 신청 항목은 서브컬렉션 `guestPosts/{id}/applicants/{uid}`로 두면 규칙이 "본인 문서만 create/delete, status 변경은 모집 클럽 admin"으로 단순해짐 — 이 방식 권장.
- **Before**: 같은 클럽 회원만 사실상 신청 가능, 게스트 기록은 이름 문자열에 묶임. / **After**: 전 앱 사용자 신청 가능, 기록 uid 귀속.
- **Opus 4.8 지시문**: "1) users/{uid}에 name/gender/grade 프로필 저장(온보딩에서 기록, linkUserToClub 확장). 2) guestPosts를 루트 컬렉션 + applicants 서브컬렉션으로 이관(firestore.js sub/add/update 함수 재작성, 지역 필터 where 쿼리 포함). 3) Guest 컴포넌트: 신청=본인 applicant 문서 create, 확정=admin이 status 변경 + 해당 모임 guests에 uid 포함 추가. 4) 참석자 게스트 ID를 'g:'+uid로 바꾸고 match.jsx/schedule.jsx/matchmaking 소비부의 nameOf 해석 로직 갱신(엔진 자체는 ID 문자열만 다루므로 무수정). 5) rules: guestPosts read는 로그인 사용자 전체, create/update는 클럽 admin, applicants는 본인 create/delete + admin update."
- **난이도**: 상 / **우선순위**: **P1**
- **주의**: 기존 데이터 마이그레이션은 불필요(출시 전). 단, seed.js가 guestPosts를 만들면 경로 갱신.

### FIX-06 — 댓글 동시성 (`arrayUnion`)
- **대상**: `firestore.js addComment`
- **목표**: 동시 댓글 유실 제거 (B-6).
- **접근**: `updateDoc(ref, { comments: arrayUnion(comment) })`. 호출부에서 기존 comments 배열 전달 제거.
- **Opus 4.8 지시문**: "1) addComment 시그니처를 `(clubId, postId, comment)`로 축소하고 arrayUnion 적용. 2) Board 호출부 갱신. 3) comment 객체에 고유 id 필드 추가(동일 내용 중복 댓글이 arrayUnion에 흡수되지 않도록)."
- **난이도**: 하 / **우선순위**: **P1**

### FIX-07 — weather.js 계약 확정 + null 방어 통일
- **대상**: `src/lib/weather.js`(신규 또는 정비), `schedule.jsx`, `index.jsx`
- **목표**: 예보 데이터 유무와 무관하게 화면이 안전하게 렌더 (B-7).
- **접근**: `weatherFor(date, forecast)`는 forecast가 없으면 **null 반환**으로 계약 고정(원본의 해시 기반 가짜 날씨는 데모 플래그로만). 화면은 전부 `w && (...)` 방어. Phase 4에서 기상청 응답을 `meeting.forecast`에 저장하면 그대로 연결되는 구조.
- **Opus 4.8 지시문**: "1) weather.js를 위 계약으로 작성(파일이 이미 있으면 계약만 맞춤). 2) schedule.jsx의 날씨 블록을 index.jsx와 동일하게 null 방어. 3) `__DEV__`에서만 해시 기반 데모 날씨 사용하는 옵션 유지."
- **난이도**: 하 / **우선순위**: **P1**

### FIX-08 — 잔여 정리 (죽은 코드·중복·상수화)
- **대상**: `firestore.js`, `rank.jsx`, 신규 `src/lib/constants.js`
- **목표**: M-2/M-3/B-9 일괄 해소로 후속 작업 오도 방지.
- **접근**: `ROLES = {ADMIN:'총무', STAFF:'운영진', MEMBER:'회원'}`, `GUEST_PREFIX='g:'`, `isAdminRole(role)` 헬퍼를 constants.js로. `saveScore` 제거(saveMatches로 통일). rank 결산 연도를 `new Date().getFullYear()` + 해당 연도 모임만 필터.
- **Opus 4.8 지시문**: "1) constants.js 생성 후 전 화면·rules 주석의 역할 문자열 참조 교체. 2) firestore.js에서 saveScore/setMe 제거하고 호출부 정리. 3) rank.jsx 결산 탭에 연도 필터 적용(meetings.date 연도 매칭). 4) FIX-04에서 안 지웠다면 죽은 코드 최종 제거."
- **난이도**: 하 / **우선순위**: **P1**

### FIX-09 — 구독 범위 제한 + 페어 이력 집계 문서
- **대상**: `firestore.js subMeetings`, 신규 `clubs/{id}/meta/pastPairs`, `match.jsx gen`
- **목표**: 모임 수 증가에도 구독량·대진 생성 비용 일정화 (P-1/P-2).
- **접근**: 화면 구독은 `where('date','>=', 최근 N개월)` + limit. 과거 페어는 대진 확정 시 `meta/pastPairs` 문서에 `{pairKey: count}` 증분 누적(`increment()`), `collectPastPairs`는 이 문서 + 화면에 로드된 최근 모임으로 대체. 전적(computeStats)도 장기적으로 동일 패턴의 집계 문서 후보 — 이번엔 pastPairs만.
- **Opus 4.8 지시문**: "1) meta/pastPairs 문서와 증분 함수 `accumulatePairs(clubId, matches)` 작성, 스코어와 무관하게 대진 저장 시점에 호출. 2) match.jsx gen에서 collectPastPairs 대신 구독된 pastPairs 사용(엔진 파라미터 형태 동일하므로 엔진 무수정). 3) 재생성 시 직전 생성분이 중복 누적되지 않도록 '확정' 단계(총무가 확정 버튼) 도입 후 확정 시에만 누적. 4) subMeetings에 기간 제한 옵션 추가하되 rank 화면 전체 이력은 별도 일회성 getDocs로."
- **난이도**: 중 / **우선순위**: **P2** (클럽 1개·수십 모임 규모까지는 현행 유지 가능)

### FIX-10 — 공용 Toast + (선택) 셔플 품질
- **대상**: 신규 `src/components/Toast.jsx`, 전 화면 / (선택) `matchmaking.js`
- **목표**: flash 중복 제거(M-5), 편향 셔플 개선(P-3).
- **접근**: ToastContext + `useToast()` 훅. 셔플은 `shuffle(arr)` Fisher-Yates 유틸 하나 추가하고 `sort(()=>Math.random()-0.5)` 4곳만 치환 — **로직 구조는 그대로**.
- **Opus 4.8 지시문**: "1) ToastProvider를 app/_layout.jsx에 감싸고 각 화면의 toast state/flash 제거. 2) (선택 승인 시) matchmaking.js에 shuffle 유틸 추가 후 치환, 전후로 scripts/test-engine.mjs 재실행해 제약(잡복 금지·중복 배정 없음) 유지 확인."
- **난이도**: 하 / **우선순위**: **P2**

---

## 4. 로드맵 검토·수정

### 상태 정정
- **PHASE 1 "완료" → 미완**: useClub.js·more.jsx·(확인 필요) ui.jsx/theme.js/weather.js/(tabs)/_layout.jsx 부재. 체크박스는 파일이 실제 존재할 때만 채울 것.
- **PHASE 2 "완료" → 미완**: Rules가 시드·가입·회원추가와 충돌(FIX-03/04 전까지 신규 클럽 생성 자체가 실패).

### 수정된 로드맵 (Phase 2.5 삽입)

```
PHASE 2.5  실행 가능화 + 계약 정합  ← 지금 여기 (FIX-01~04 + 미확인 파일 보충)
  - [ ] FIX-01 useClub.js        - [ ] FIX-02 more.jsx + 회비
  - [ ] FIX-03 rules 정합        - [ ] FIX-04 초대코드 가입
  - [ ] ui.jsx/theme.js/weather.js/(tabs)/_layout.jsx 존재 확인, 없으면 작성
  - [ ] scripts/test-engine.mjs + scripts/test-rules.mjs 통과
  - [ ] Expo Go에서 로그인→온보딩→5탭 전체 스모크 테스트
PHASE 2.7  기능 완성 (FIX-05~08)
PHASE 3    푸시 알림 (아래 지시문)
PHASE 4    실연동 (아래 지시문) + FIX-09
PHASE 5~6  기존과 동일
```

### 로드맵 리스크 (설계 판단 필요)
- **R-1 (중요) 전화번호 인증 스택**: `expo-firebase-recaptcha`는 **deprecated·아카이브됨**(Expo SDK 48에서 제거). Firebase **JS** SDK의 Phone Auth는 Expo Go에서 사실상 막혀 있음. 선택지: (a) `@react-native-firebase/auth` + EAS dev build — 권장, Phone Auth 공식 지원·recaptcha 불필요(기기 검증), Expo Go 포기하고 dev client 사용. (b) 익명 로그인+초대코드만으로 1차 출시하고 전화 인증은 2차. **권장: (a)**. login.jsx/auth.js가 이 결정에 종속되므로 PHASE 2.5 착수 전에 확정할 것.
- **R-2 게스트 요구사항**: "공개 게시판"은 FIX-05 구조 변경 없이는 불가 — 로드맵 PHASE 2 항목이 아니라 별도 항목으로 명시.
- **R-3 시드 정책**: 실사용 클럽에 데모 데이터 기본 ON은 위험. `withDemo` 기본값 false + "체험 모드" 명시 토글 권장.

### PHASE 3 지시문 (푸시) — Opus 4.8용
"1) `expo-notifications`로 권한 요청 + Expo push token 수집해 `members/{uid}.pushToken` 저장(로그인 후 1회, 앱 시작 시 갱신). 2) `functions/` 디렉터리에 Cloud Functions v2 작성: onDocumentCreated(meetings)→클럽 전원, onDocumentUpdated(meetings: matches 채워짐)→참석자, onDocumentUpdated(guestPosts applicants: confirmed)→해당 uid, 매월 1일 스케줄러→미납자. 발송은 Expo Push API(https://exp.host/--/api/v2/push/send) fetch. 3) 알림 수신 탭 라우팅(expo-router deep link). 4) iOS APNs .p8은 사용자 수동 단계로 README에 절차만 기록."

### PHASE 4 지시문 (실연동) — Opus 4.8용
"1) 날씨: Cloud Function `fetchForecast` — 기상청 단기예보(공공데이터포털) 호출, 모임 place의 좌표(코트 DB에 lat/lng 필드 추가)를 격자 변환(dfs_xy_conv 공식) 후 `meeting.forecast={icon,temp,rain}` 저장. 스케줄러로 D-2부터 12시간마다 갱신, 강수확률≥60%면 총무 푸시. weatherFor는 FIX-07 계약대로 forecast 소비만. 2) 지도: 코트 등록 시 카카오 로컬 API로 주소→좌표 저장, 코트 화면의 간이 지도를 `react-native-webview` + Kakao 지도 JS SDK로 교체(시/구 필터 → 핀 렌더, 핀 탭 → 예약 링크 Linking.openURL). 3) 입금 자동매칭 네이티브 모듈은 2차 유지 — 착수 금지, CSV 붙여넣기(FIX-02)로 대체."

---

## 5. 최종 요약

- **총 수정 포인트**: FIX 10건 (+ PHASE 3·4 지시문 2건, 로드맵 리스크 3건)
- **P0: 4건** (FIX-01~04) / **P1: 4건** (FIX-05~08) / **P2: 2건** (FIX-09~10)

**Top 3 (이번에 반드시)**
1. **FIX-01** useClub.js — 이것 없이는 아무 화면도 안 뜸. rules 키↔객체 매핑 포함.
2. **FIX-03 + FIX-04** rules 정합 + 초대코드 가입 — 안 고치면 신규 클럽 생성·가입이 규칙에 막혀 전부 실패 (한 묶음으로 처리).
3. **FIX-02** more.jsx + 회비 화면 — 5탭 완성 + 핵심 요구사항(회비) 접점 복원.

**Opus 4.8 작업 순서 (권장 워크플로우)**
1. **결정 선행**: R-1 인증 스택 확정 (권장: @react-native-firebase + EAS dev build)
2. **Step 1 — 기동**: FIX-01 → 미확인 파일(ui/theme/weather/(tabs)/_layout) 보충 → FIX-02. 완료 기준: Expo에서 5탭 렌더.
3. **Step 2 — 계약**: FIX-03 → FIX-04 (에뮬레이터 테스트 동반). 완료 기준: test-rules.mjs 전체 통과 + 실제 클럽 생성/가입 성공.
4. **Step 3 — 잔손질**: FIX-06 → FIX-07 → FIX-08 (하나의 PR로 묶어도 됨).
5. **Step 4 — 기능**: FIX-05 (게스트 재설계, 별도 PR — 스키마 변경이라 격리).
6. **Step 5 — Phase 3 푸시** → **Phase 4 실연동** → FIX-09/10은 실사용 데이터가 쌓이기 시작할 때.
- 각 Step 종료마다: `node scripts/test-engine.mjs`(엔진 회귀) + Expo 스모크 테스트를 통과 조건으로 삼을 것.
