# 배포 — 컴퓨터 없이 태블릿·휴대폰에서

GitHub 가 대신 배포한다. 저장소 웹페이지에서 버튼 하나를 누르면 된다.

컴퓨터에서 `cmd` 로 하던 것과 결과는 같다. 다른 점은 **어디서든 된다**는 것뿐.

---

## 처음 한 번만 — 열쇠 두 개 넣기

⚠️ **아래 값들은 채팅창이나 문서에 붙여넣지 말 것.** GitHub Secrets 칸에만
넣는다. 한 번 넣으면 다시 볼 수 없고(GitHub 도 안 보여 준다), 그게 정상이다.

넣는 곳: `github.com/denishwang31-pixel/claude`
→ **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### 1) `FIREBASE_SERVICE_ACCOUNT`

Firebase 를 대신 조작할 로봇 계정이다.

1. https://console.firebase.google.com → `tennis-match-52b31` 프로젝트
2. 톱니바퀴 → **프로젝트 설정** → **서비스 계정** 탭
3. **새 비공개 키 생성** → 확인 → `.json` 파일이 받아진다
4. 그 파일을 텍스트로 열어 **내용 전체**(`{` 부터 `}` 까지)를 복사
5. GitHub Secrets 에 이름 `FIREBASE_SERVICE_ACCOUNT`, 값은 붙여넣기

⚠️ 이 `.json` 파일은 **저장소에 넣지 않는다.** `.gitignore` 가 막고 있고
(`*service-account*.json`, `*-firebase-adminsdk-*.json`), `npm run test:imports`
가 내용까지 훑어서 실수로 들어오면 검증이 실패한다. 그래도 파일 자체는
받은 곳에서 지워 두는 편이 낫다.

### 2) `EXPO_TOKEN`

앱 화면 업데이트(OTA)를 대신 올릴 열쇠다.

1. https://expo.dev/accounts/denis-hwang/settings/access-tokens
2. **Create token** → 이름은 아무거나 (예: `github-actions`)
3. 생성 직후 한 번만 보이는 값을 복사
4. GitHub Secrets 에 이름 `EXPO_TOKEN`, 값은 붙여넣기

⚠️ 이 값은 **수십 자짜리 한 줄**이다. `{` 로 시작하거나 여러 줄이면
서비스 계정 JSON 을 잘못 넣은 것이다 — 실제로 한 번 이렇게 들어가서
OTA 가 `The bearer token is invalid.` 로 막혔다. 두 시크릿을 연달아
넣을 때 특히 헷갈린다. 지금은 workflow 가 이 경우를 이름 붙여 잡아 준다.

이미 넣은 시크릿을 고치려면: Settings → Secrets and variables → Actions
→ `EXPO_TOKEN` 옆 연필 → 새 값 붙여넣기 → Update secret. 값을 다시
볼 수는 없으므로, 확신이 없으면 Expo 에서 토큰을 새로 만들어 넣는다.

---

## 평소 — 아무것도 안 해도 된다

`claude/tennis-app-roadmap-review-oxol8b` 에 푸시가 올라가면 배포가 **자동으로**
돈다. 버튼을 누를 필요가 없다.

자동일 때 나가는 것:

| 항목 | 자동 | 왜 |
|---|---|---|
| 보안 규칙 | ✅ | 화면과 짝이다. 따로 가면 새 화면이 읽기 거부를 당한다 |
| 색인 | ✅ | 마찬가지. 빠지면 채팅이 조용히 빈다 |
| OTA (**preview**) | ✅ | 내부 테스트 앱. 스토어 앱이 아니다 |
| 서버 함수 | ❌ | 되돌리기가 비싸다. 사람이 볼 때만 올린다 |
| OTA (production) | ❌ | 스토어 앱을 사람 없이 바꾸지 않는다 |

5~10분 뒤 앱을 **껐다 켜면** 새 화면이 내려온다.

### 내보내고 싶지 않은 커밋이라면

커밋 **제목(첫 줄)** 에 `[배포안함]` 을 넣는다. 그 푸시는 배포를 통째로
건너뛴다. (검증은 **테니스매치 검증** workflow 가 따로 돌려 주므로,
건너뛰어도 테스트는 받는다.)

⚠️ 본문이 아니라 **제목**이다. 처음에는 메시지 전체를 봤는데, 이 표시를
설명하는 문장이 본문에 들어간 커밋이 그대로 건너뛰어졌다. 게다가 건너뛴
실행은 빨강이 아니라 **회색**이라 배포가 안 된 것을 눈치채기 어렵다.
지금은 제목만 본다.

---

## 손으로 올려야 할 때 — 버튼

서버 함수를 올리거나, **production**(스토어 앱)으로 내보낼 때만 필요하다.

1. `github.com/denishwang31-pixel/claude` → 상단 **Actions** 탭
2. 왼쪽 목록에서 **테니스매치 배포**
3. 오른쪽 **Run workflow** →
   - 배포할 브랜치: `claude/tennis-app-roadmap-review-oxol8b`
   - 올릴 것만 체크 (안 올릴 것은 끈다)
   - **Run workflow** 누르기
4. 5~10분. 초록 체크가 뜨면 끝.

⚠️ 위쪽 **Use workflow from** 드롭다운은 배포 대상이 아니다. 그건
"버튼 화면을 어느 브랜치의 정의로 그릴까"일 뿐이고, 실제로 배포되는
것은 **[배포할 브랜치]** 칸의 값이다.

### 체크박스가 뜻하는 것

| 항목 | 무엇이 바뀌나 | 언제 꺼도 되나 |
|---|---|---|
| 보안 규칙 | 누가 무엇을 읽고 쓸 수 있는지 | 규칙 파일을 안 건드렸을 때 |
| 색인 | 채팅이 채널별로 나뉘어 보이는 것 | 색인 파일을 안 건드렸을 때 |
| 서버 함수 | 푸시 알림, 회비 자동 독촉 | `functions/` 를 안 건드렸을 때 |
| OTA | 앱 화면·기능 (대부분 여기) | 화면을 안 건드렸을 때 |

⚠️ **잘 모르겠으면 전부 켜 두면 된다.** 안 바뀐 것은 그냥 넘어간다.
반대로 **색인만 빼먹으면 채팅이 조용히 안 보인다** — 오류도 안 뜨고
화면도 안 죽어서, 원인을 찾는 데 한참 걸린다.

---

## 검증은 알아서 돈다

`tennis-match/` 안이 바뀐 커밋이 올라가면 **테니스매치 검증**이 자동으로
돈다. 로직 2,700여 건 + 보안 규칙 285건.

배포 workflow 도 **배포 전에 같은 검증을 한 번 더 돌린다.** 이미 돌았어도
다시 돈다 — 그 사이 다른 커밋이 들어왔을 수 있고, 배포는 되돌리기가 비싸다.
검증이 하나라도 실패하면 배포는 시작조차 안 한다.

---

## 앱을 새로 구울 때 — 테니스매치 빌드

OTA 는 자바스크립트만 바꾼다. 아래를 건드렸으면 앱을 **새로 구워서 설치**해야
한다. 이것도 태블릿에서 버튼으로 된다 — workflow 가 따로 있다.

- `app.json` 의 권한·아이콘·패키지 이름·plugins
- 새 네이티브 라이브러리 추가 (`expo-*` 중 네이티브가 딸린 것)
- `google-services.json` 교체

👉 Actions → **테니스매치 빌드** → Run workflow

| 칸 | 보통 |
|---|---|
| 빌드할 브랜치 | 그대로 |
| 무엇을 만들까 | `android` (iOS 는 Apple Developer 계정이 있어야 한다) |
| 빌드 종류 | `preview` — 내부 테스트용 APK |
| 끝까지 기다리기 | 꺼 둔다. 빌드는 EAS 서버에서 돌고 끝나면 Expo 가 메일로 알려 준다 |

완성된 앱: https://expo.dev/accounts/denis-hwang/projects/tennis-match/builds

### ⚠️ 순서를 지킬 것 — 빌드 먼저, OTA 나중

네이티브 모듈이 들어간 커밋을 **OTA 로 먼저** 내보내면, 기존 앱은 없는 모듈을
찾다가 죽는다. 반드시 **새 앱을 설치한 뒤에** 그다음 배포를 한다.

작업 중이라 아직 내보내면 안 되는 커밋은 제목에 `[배포안함]` 을 넣어 자동
배포를 막을 수 있다.

### 왜 배포와 따로 두나

성격이 다르다. 배포는 2~3분이고 푸시하면 자동이다. 빌드는 20~40분이고
**EAS 무료 한도가 월 몇 회뿐**이다. 한 화면에 두면 배포하려다 실수로 빌드가
돌아 한도를 태운다. 그래서 빌드에는 자동 방아쇠를 아예 달지 않았다.

### 첫 안드로이드 빌드가 막히면

키스토어(앱 서명 키)가 없어서다. 비대화형이라 "새로 만들까요?"에 답할 수가
없다. 웹에서 먼저 하나 만들어 두면 된다 — 태블릿에서 된다.

1. https://expo.dev/accounts/denis-hwang/projects/tennis-match/credentials
2. **Android → Build Credentials → Add new** → Expo 가 만들어 주는 쪽
3. 빌드를 다시 실행

⭐ 그 화면의 **SHA-1 Fingerprint** 가 구글 로그인에 필요한 값이다.
로컬 디버그 키의 것이 아니라 **이 값**을 Google Cloud 의 Android OAuth
클라이언트에 넣는다.

---

## 잘 안 될 때

**`FIREBASE_SERVICE_ACCOUNT 시크릿이 비어 있습니다`**
시크릿 이름 철자를 확인한다. 대소문자까지 정확히 같아야 한다.

**`서비스 계정 JSON 형식이 아닙니다`**
파일 경로가 아니라 **파일 내용**을 붙여넣어야 한다. `{` 로 시작해서
`}` 로 끝나는 글이다.

**서버 함수가 일부만 실패했다**

전부 다시 할 필요가 없다. 로그에서
`Functions deploy had errors with the following functions:` 를 찾으면 막힌 것만
적혀 있고, 거기 없는 함수는 **이미 올라갔다**. 권한을 고친 뒤 다시 돌리면
막혔던 것만 새로 붙는다.

⚠️ **예약 함수 3개만 막히는 경우가 흔하다** (`dailyFeeDunning` 회비 독촉,
`autoRsvpAsk` 참석 투표 요청, `updateForecasts` 날씨). 이 셋은 "매일 몇 시에"
도는 것이라 Cloud Scheduler 작업을 함께 만들어야 하는데, 그 권한이 따로다.
로그에 `cloudscheduler.jobs.update` 가 보이면 서비스 계정에
**Cloud Scheduler 관리자** 역할을 더하면 된다.

실제로 이것 때문에 한 번 돌아갔다. 15개 중 12개가 올라갔는데 안내문이
"대개 권한 문제입니다"라고만 해서, 전부 실패한 줄 알고 엉뚱한 역할을 찾았다.
지금은 workflow 안내가 로그에 찍히는 권한 이름과 줄 역할을 짝지어 보여 준다.

**`Failed to load function definition`**
서버 함수가 자기 의존성을 못 찾는 것이다. workflow 가 `npm ci --prefix functions`
로 미리 깔아 두므로 보통 안 나지만, `functions/package-lock.json` 이
`functions/package.json` 과 어긋나면 난다. 컴퓨터에서 `functions` 폴더에
`npm install` 을 한 번 돌리고 lock 파일을 커밋하면 맞춰진다.

**OTA 는 올라갔는데 앱이 그대로**
앱을 완전히 껐다가 켠다(작업 목록에서 밀어 없애기). 그래도 안 되면
[더보기] → [업데이트 상태]에서 어느 채널을 보고 있는지 확인한다.

**함수를 지웠거나 이름을 바꿨는데 걱정될 때**
비대화형 배포라 `--force` 로 돌린다. 소스에서 사라진 함수는 묻지 않고
지운다는 뜻이다. 그런 커밋을 배포한 뒤에는 Firebase 콘솔의 Functions
목록을 한 번 보는 편이 좋다.
