/* ============================================================
   로그인 화면 문구 — 순수 함수 (검사: scripts/test-social.mjs)

   ⚠️ 지메일로 비밀번호 가입 → 나중에 [구글로 시작하기] → 비밀번호 로그인이 막힘
      Firebase 의 "한 이메일 = 한 계정" 규칙 때문이다. 구글은 @gmail.com 의
      진짜 주인을 보증하는 곳이라, 같은 지메일로 구글 로그인을 하면 확인되지 않은
      비밀번호 방식은 떨어져 나가고 계정(uid·클럽 기록)은 그대로 구글 쪽으로 이어진다.
      남이 내 지메일로 먼저 가입해 두는 것을 막는 보안 동작이라 끌 일은 아니다.
      대신 막혔을 때 무엇을 하면 되는지 말해 준다:
        · [구글로 시작하기] 로 들어오면 된다(같은 계정)
        · 비밀번호도 쓰고 싶으면 [비밀번호를 잊으셨나요?] 로 다시 만들면 둘 다 된다
   ============================================================ */

/* 로그인에서 받는 최소 길이 — 기존 계정(6자로 가입한 사람)이 그대로 들어오게 6 을 유지한다 */
export const MIN_PW = 6;

/* ---------- 새 비밀번호 규칙 (2026-09-28, 가입할 때만) ----------
   기존 계정은 건드리지 않는다 — 로그인은 예전처럼 6자 이상이면 시도한다.
   입력할 때마다 칸 아래에 하나씩 ✓ 가 켜진다(체크리스트). */
export const PW_RULES = [
  { key: 'len', label: '8자 이상', test: (p) => p.length >= 8 },
  { key: 'upper', label: '영문 대문자 (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: '영문 소문자 (a-z)', test: (p) => /[a-z]/.test(p) },
  { key: 'digit', label: '숫자 (0-9)', test: (p) => /[0-9]/.test(p) },
  { key: 'special', label: '특수기호 (!@#$% 등)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
  { key: 'space', label: '띄어쓰기 없음', test: (p) => p.length > 0 && !/\s/.test(p) },
];

/** 규칙마다 통과했는지 — 화면의 체크리스트 */
export const pwChecks = (pw) => {
  const p = String(pw || '');
  return PW_RULES.map((r) => ({ key: r.key, label: r.label, ok: r.test(p) }));
};

/** 새 비밀번호가 규칙을 모두 지키는가 */
export const pwPolicyOk = (pw) => pwChecks(pw).every((c) => c.ok);

/** 구글이 주인을 보증하는 주소인가 — 이 주소들만 위 일이 생긴다 */
export const isGoogleMail = (email) => /@(gmail|googlemail)\.com\s*$/i.test(String(email || '').trim());

/** 로그인·가입 실패 문구 */
export function loginErrorText(code, email = '') {
  const c = String(code || '');
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('invalid-login')) {
    if (isGoogleMail(email)) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.\n'
        + '이 지메일로 [구글로 시작하기]를 쓴 적이 있다면 비밀번호 로그인은 꺼집니다(구글 보안 규칙 — 계정과 기록은 그대로).'
        + ' [구글로 시작하기]로 들어오시거나, 아래 [비밀번호를 잊으셨나요?]로 비밀번호를 다시 만들면 둘 다 쓸 수 있습니다.';
    }
    return '이메일 또는 비밀번호가 올바르지 않습니다. 비밀번호가 기억나지 않으면 아래 [비밀번호를 잊으셨나요?]를 눌러 주세요.';
  }
  if (c.includes('user-not-found')) return '가입되지 않은 이메일입니다. 위에서 [회원가입]을 눌러 주세요.';
  if (c.includes('email-already-in-use')) {
    return isGoogleMail(email)
      ? '이미 가입된 지메일입니다. [로그인]하시거나 [구글로 시작하기]를 눌러 주세요.'
      : '이미 가입된 이메일입니다. 위에서 [로그인]을 눌러 주세요.';
  }
  if (c.includes('weak-password') || c.includes('password-does-not-meet-requirements')) {
    return '비밀번호가 규칙에 맞지 않습니다. 8자 이상, 대문자·소문자·숫자·특수기호를 모두 넣어 주세요.';
  }
  if (c.includes('invalid-email')) return '이메일 형식을 확인해 주세요.';
  if (c.includes('too-many-requests')) return '시도가 너무 많습니다. 잠시 후 다시 해 주세요.';
  if (c.includes('operation-not-allowed')) return 'Firebase 콘솔에서 해당 로그인 방법을 사용 설정해 주세요.';
  if (c.includes('network')) return '네트워크 연결을 확인해 주세요.';
  return '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

/** 회원가입 칸 점검 — 문제가 있는 칸의 문구(없으면 '') */
export function signupProblems({ email, pw, pw2 }) {
  return {
    pw2: pw2 !== undefined && String(pw2) !== String(pw) ? '비밀번호가 서로 다릅니다' : '',
    gmailTip: isGoogleMail(email)
      ? '지메일이라면 위의 [구글로 시작하기]가 더 간단합니다. 비밀번호 없이 들어오고, 나중에 비밀번호 로그인이 막히는 일도 없습니다.'
      : '',
  };
}
