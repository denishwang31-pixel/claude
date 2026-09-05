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

---

## 매번 하는 것 — 버튼 한 번

1. `github.com/denishwang31-pixel/claude` → 상단 **Actions** 탭
2. 왼쪽 목록에서 **테니스매치 배포**
3. 오른쪽 **Run workflow** →
   - 브랜치: `claude/tennis-app-roadmap-review-oxol8b`
   - 체크박스 네 개는 기본값(전부 켜짐) 그대로 두면 된다
   - **Run workflow** 누르기
4. 5~10분. 초록 체크가 뜨면 끝.

앱에서는 **껐다 켜면** 새 화면이 내려온다.

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

## 이건 여전히 컴퓨터가 필요하다

**APK 새로 굽기 (`eas build`)**

OTA 는 자바스크립트만 바꾼다. 아래를 건드렸으면 APK 를 다시 구워서
휴대폰에 설치해야 한다.

- `app.json` 의 권한·아이콘·패키지 이름
- 새 네이티브 라이브러리 추가 (`expo-*` 중 네이티브가 딸린 것)
- `google-services.json` 교체

빌드 자체는 이 workflow 에 넣을 수 있지만, 지금은 넣지 않았다.
빌드는 20~40분이 걸리고 실패했을 때 원인이 앱 설정에 있는 경우가 많아서,
처음 몇 번은 화면을 보며 하는 편이 낫다. 필요해지면 그때 추가한다.

---

## 잘 안 될 때

**`FIREBASE_SERVICE_ACCOUNT 시크릿이 비어 있습니다`**
시크릿 이름 철자를 확인한다. 대소문자까지 정확히 같아야 한다.

**`서비스 계정 JSON 형식이 아닙니다`**
파일 경로가 아니라 **파일 내용**을 붙여넣어야 한다. `{` 로 시작해서
`}` 로 끝나는 글이다.

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
