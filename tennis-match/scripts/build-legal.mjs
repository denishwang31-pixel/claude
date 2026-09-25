/* ============================================================
   약관·개인정보처리방침 웹 페이지를 만든다

   왜 필요한가
     구글 OAuth 동의 화면이 **홈페이지 주소**와 **개인정보처리방침
     주소**를 요구한다. 없으면 동의 화면 설정을 저장할 수 없고, 저장이
     안 되면 로그인 화면에 앱 이름이 안 뜬다("project-숫자로 이동").

   ⚠️ 글을 새로 쓰지 않는다
     본문은 src/lib/legalText.js 에서 그대로 가져온다. 웹에 따로 써 두면
     앱 안의 글과 웹의 글이 갈라지는데, 그건 시간 문제가 아니라 확실히
     일어난다 — 기능을 고칠 때 한쪽만 고치기 때문이다. 그리고 두 글이
     다르면 "어느 쪽이 우리 약관인가"라는 답할 수 없는 질문이 생긴다.
     여기서는 **감싸기만** 한다.

   ⚠️ 빈칸이 남아 있으면 만들지 않는다
     legalText 의 [[대괄호]] 자리가 남아 있으면 그 글은 아직 약관이
     아니다. 그대로 올리면 "대표자 이름"이라고 적힌 약관이 인터넷에
     공개된다. 그런 것은 없느니만 못하다.
   ============================================================ */
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERMS, PRIVACY, pendingBlanks } from '../src/lib/legalText.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');

/* HTML 로 넣기 전에 반드시 막는다. 약관 본문에 <, & 가 들어 있으면
   페이지가 깨지고, 더 나쁘게는 태그로 해석된다. */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const page = (title, body) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Court</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 24px 20px 64px;
    font: 15px/1.7 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
          "Pretendard", "Malgun Gothic", sans-serif;
    color: #0F172A; background: #F8FAFC;
    max-width: 720px; margin-inline: auto;
    word-break: keep-all; overflow-wrap: anywhere;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #E2E8F0; background: #0F172A; }
    a { color: #8FD6B8; }
    nav a { border-color: #334155; }
  }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
  nav { margin: 16px 0 28px; display: flex; gap: 8px; flex-wrap: wrap; }
  nav a {
    display: inline-block; padding: 7px 14px; border-radius: 999px;
    border: 1px solid #E2E8F0; text-decoration: none; font-size: 13px;
    font-weight: 600; color: inherit;
  }
  pre {
    white-space: pre-wrap; font: inherit; margin: 0;
  }
  footer { margin-top: 40px; font-size: 12.5px; opacity: 0.65; }
</style>
</head>
<body>
<h1>Court</h1>
<nav>
  <a href="/">홈</a>
  <a href="/privacy.html">개인정보처리방침</a>
  <a href="/terms.html">이용약관</a>
  <a href="/delete-account.html">계정 삭제</a>
</nav>
${body}
<footer>Court — 테니스 클럽 운영 앱</footer>
</body>
</html>
`;

const HOME = `<pre>Court(코트)는 테니스 동호회의 일정·참석 투표·대진 편성·회비를
한곳에서 관리하는 앱입니다.

할 수 있는 일
· 정기 모임 일정을 올리고 참석 여부를 모읍니다
· 참석자로 대진을 자동 편성합니다
· 회비 납부 현황과 지출을 정리합니다
· 게스트를 모집하고 다른 클럽과 교류전을 엽니다

아래 링크에서 이용약관과 개인정보처리방침을 확인하실 수 있습니다.</pre>`;

/* 계정 삭제 안내 — 구글 플레이가 **앱 밖에서도** 삭제를 요청할 수 있는
   웹 주소를 요구한다(데이터 보안 양식의 「계정 삭제 URL」). 앱을 이미 지운
   사람도 여기서 요청할 수 있어야 한다.
   ⚠️ 무엇이 지워지고 무엇이 남는지는 개인정보처리방침 「3. 보관 기간」과
      같은 말이어야 한다. 방침을 고치면 여기도 고친다. */
const DELETE = `<pre>Court 계정 삭제 안내

1. 앱에서 직접 지우기 (바로 처리됩니다)
   앱 → [더보기] → [약관·개인정보] → 맨 아래 [계정 삭제]
   본인 확인 후 즉시 지워지며, 되돌릴 수 없습니다.

2. 앱을 쓸 수 없을 때 — 이메일로 요청하기
   ${'denis.hwang31@gmail.com'} 로 아래 내용을 보내 주세요.
   · 제목: Court 계정 삭제 요청
   · 가입한 이메일 주소 (또는 소셜 로그인 종류와 이름)
   · 소속 클럽 이름 (있다면)
   본인 확인 후 7일 안에 처리하고 결과를 회신합니다.

지워지는 정보
· 로그인 계정, 프로필(이름·성별·활동지역·실력 정보), 연락처
· 알림을 받기 위한 기기 식별값(푸시 토큰)
· 코치로 등록한 경우 코치 프로필

남는 정보
· 클럽 활동 기록(지난 대진표·경기 결과·회비 정산)에 적힌 이름
  — 함께 운동한 다른 회원의 기록을 지키기 위해서입니다.
  이 기록에는 연락처가 남지 않으며, 삭제된 계정으로는 다시 로그인할 수 없습니다.
· 이름까지 지우기를 원하시면 위 이메일로 요청해 주세요.
  소속 클럽 운영진과 확인한 뒤 처리합니다.
· 법령에서 보관을 요구하는 기록이 있으면 그 기간 동안 보관 후 지웁니다.</pre>`;

const blanks = pendingBlanks();
if (blanks.length) {
  console.error('::error::약관에 아직 채우지 않은 자리가 있습니다:', blanks.join(', '));
  console.error('빈칸이 남은 글을 인터넷에 공개하면 안 됩니다. legalText.js 를 먼저 채우세요.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), page('홈', HOME));
writeFileSync(join(OUT, 'privacy.html'), page('개인정보처리방침', `<pre>${esc(PRIVACY)}</pre>`));
writeFileSync(join(OUT, 'terms.html'), page('이용약관', `<pre>${esc(TERMS)}</pre>`));
writeFileSync(join(OUT, 'delete-account.html'), page('계정 삭제', DELETE));

/* 카톡 참석 링크 페이지 — 앱 없는 오프라인 회원이 참석/불참을 누르는 곳.
   ⚠️ 약관과 같은 사이트에 올린다. Hosting 배포는 사이트 **전체를 갈아
      끼우므로**, 여기서 빠뜨리면 약관을 올리는 순간 참석 링크가 사라진다.
      반대로 약관 빈칸 때문에 이 스크립트가 멈추면 이 페이지도 안 올라가는데,
      그게 맞다 — 약관 없이 사이트 절반만 올리면 약관 페이지가 지워진다. */
copyFileSync(join(ROOT, 'web', 'rsvp.html'), join(OUT, 'rsvp.html'));

console.log('약관 페이지를 만들었습니다 — public/index.html, privacy.html, terms.html, delete-account.html');
