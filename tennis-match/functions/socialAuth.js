/* ============================================================
   카카오 · 네이버 로그인 — 서버 쪽 (Cloud Functions `socialAuth`)

   왜 서버가 필요한가
     Firebase 는 카카오·네이버를 모른다. 그래서 두 곳이 준 로그인 결과를
     우리 서버가 직접 확인하고, Firebase 가 믿는 "커스텀 토큰"으로 바꿔
     앱에 넘겨야 한다. 구글·애플은 Firebase 가 원래 아는 곳이라 필요 없다.

   흐름 (앱은 비밀값을 하나도 갖지 않는다)
     1. 앱이 카카오/네이버 로그인 창을 연다(웹). 돌아올 주소는
        https://<호스팅>/auth/<kakao|naver>/callback — 호스팅이 이 함수로 넘긴다.
     2. 로그인이 끝나면 카카오/네이버가 그 주소로 code·state 를 보낸다.
     3. 이 함수가 code 를 비밀값(Client Secret)으로 토큰과 바꾸고, 그 토큰으로
        회원 정보를 읽어 "카카오의 누구"인지 확인한다.
     4. Firebase 커스텀 토큰(uid `kakao:<번호>`)을 만들어 앱 주소로 돌려보낸다
        (302 → com.donghyun.tennismatch://oauth?...). 앱은 그 토큰으로 로그인.

   ⚠️ 비밀값은 functions/.env 로만 들어온다(배포 workflow 가 GitHub Secrets 에서 쓴다).
      KAKAO_REST_KEY, KAKAO_CLIENT_SECRET(카카오에서 켰을 때만), NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
   ⚠️ 커스텀 토큰을 만들려면 함수가 도는 서비스 계정에 「서비스 계정 토큰 생성자」
      (roles/iam.serviceAccountTokenCreator) 역할이 있어야 한다. 없으면 error=permission.
   ⚠️ 판단(주소·요청 모양·회원 정보 읽기)은 전부 순수 함수다 — scripts/test-socialauth.mjs.
      네트워크와 Firebase 는 handle() 에 주입한다.
   ============================================================ */

const PROVIDERS = ['kakao', 'naver'];
const APP_RETURN_DEFAULT = 'com.donghyun.tennismatch://oauth';
/* 카카오·네이버 콘솔에 등록하는 「Redirect URI / Callback URL」의 도메인.
   ⚠️ 요청의 Host 로 만들지 않는다 — 호스팅을 거쳐 오면 Host 가 함수 주소로
      바뀌어 있어, 등록한 주소와 한 글자라도 다르면 토큰 교환이 거절된다.
      앱(src/lib/social.js 의 SOCIAL_AUTH_HOST)과 같은 값이어야 한다. */
const AUTH_HOST_DEFAULT = 'tennis-match-52b31.web.app';

/** '/auth/kakao/callback' → 'kakao'. 모르는 주소면 '' */
function providerFromPath(path) {
  const m = String(path || '').match(/^\/auth\/(kakao|naver)\/callback\/?$/);
  return m ? m[1] : '';
}

/** 앱이 만든 state 모양 — '<제공자>.<영숫자 16~64>' 만 받는다(주소에 섞여 들어오는 값이라) */
function stateOk(provider, state) {
  return new RegExp(`^${provider}\\.[A-Za-z0-9_-]{16,64}$`).test(String(state || ''));
}

/** 그 제공자에 필요한 서버 비밀값이 다 있는가 */
function configured(provider, env) {
  if (provider === 'kakao') return !!env.KAKAO_REST_KEY;
  if (provider === 'naver') return !!(env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET);
  return false;
}

/** code → 액세스 토큰 요청 (form-urlencoded POST) */
function tokenRequest(provider, { code, state, redirectUri }, env) {
  if (provider === 'kakao') {
    const body = {
      grant_type: 'authorization_code',
      client_id: env.KAKAO_REST_KEY,
      redirect_uri: redirectUri,
      code,
    };
    if (env.KAKAO_CLIENT_SECRET) body.client_secret = env.KAKAO_CLIENT_SECRET;
    return { url: 'https://kauth.kakao.com/oauth/token', body };
  }
  return {
    url: 'https://nid.naver.com/oauth2.0/token',
    body: {
      grant_type: 'authorization_code',
      client_id: env.NAVER_CLIENT_ID,
      client_secret: env.NAVER_CLIENT_SECRET,
      code,
      state,
    },
  };
}

/** 액세스 토큰으로 회원 정보 읽기 */
function profileUrl(provider) {
  return provider === 'kakao'
    ? 'https://kapi.kakao.com/v2/user/me'
    : 'https://openapi.naver.com/v1/nid/me';
}

const str = (v, max = 100) => String(v ?? '').trim().slice(0, max);

/**
 * 제공자 응답 → 우리 모양.
 * 이메일은 **확인된 것만** 믿는다. 확인 안 된 이메일로 계정을 만들면 남의
 * 이메일을 가로채는 통로가 된다.
 * @returns {{id, name, email, emailVerified, photo}|null}
 */
function profileFrom(provider, json) {
  if (!json || typeof json !== 'object') return null;
  if (provider === 'kakao') {
    const id = str(json.id, 40);
    if (!id) return null;
    const acc = json.kakao_account || {};
    const prof = acc.profile || {};
    const verified = !!(acc.email && acc.is_email_valid && acc.is_email_verified);
    return {
      id,
      name: str(prof.nickname || json.properties?.nickname, 40),
      email: verified ? str(acc.email, 120) : '',
      emailVerified: verified,
      photo: /^https:\/\//.test(prof.profile_image_url || '') ? str(prof.profile_image_url, 300) : '',
    };
  }
  if (json.resultcode !== '00' || !json.response) return null;
  const r = json.response;
  const id = str(r.id, 80);
  if (!id) return null;
  return {
    id,
    name: str(r.name || r.nickname, 40),
    /* 네이버는 이메일 확인 여부를 따로 주지 않는다 — 보여 주기용으로만 두고 계정에는 안 붙인다 */
    email: '',
    emailVerified: false,
    photo: /^https:\/\//.test(r.profile_image || '') ? str(r.profile_image, 300) : '',
  };
}

const uidFor = (provider, id) => `${provider}:${id}`;

/** 앱으로 돌아가는 주소 */
function appRedirect(params, base = APP_RETURN_DEFAULT) {
  const q = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `${base}?${q}` : base;
}

const form = (body) => Object.entries(body)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`)
  .join('&');

/**
 * 요청 하나 처리 — 결과는 언제나 앱으로 돌아가는 302 다(오류도 error= 로 알려 준다).
 * 브라우저 창에 우리 오류 페이지를 띄우면 사용자는 그 창을 스스로 닫아야 하고,
 * 앱은 무슨 일이 있었는지 모른다.
 *
 * @param req  {path, query}
 * @param deps {fetch, auth, env, log}
 * @returns {Promise<string>} 302 로 보낼 주소
 */
async function handle(req, deps) {
  const { fetch, auth, env = {}, log = () => {} } = deps;
  const provider = providerFromPath(req.path);
  const query = req.query || {};
  const state = str(query.state, 80);
  const back = (params) => appRedirect({ provider, state, ...params }, env.APP_RETURN || APP_RETURN_DEFAULT);

  if (!provider) return back({ error: 'path' });
  if (!stateOk(provider, state)) return back({ error: 'state' });
  if (query.error) {
    /* 사용자가 동의 화면에서 [취소]를 누른 것 — 조용히 돌아간다 */
    const cancelled = /access_denied|cancel/i.test(`${query.error} ${query.error_description || ''}`);
    return back({ error: cancelled ? 'cancelled' : 'provider' });
  }
  const code = str(query.code, 500);
  if (!code) return back({ error: 'code' });
  if (!configured(provider, env)) return back({ error: 'config' });

  const redirectUri = `https://${env.AUTH_HOST || AUTH_HOST_DEFAULT}/auth/${provider}/callback`;
  let accessToken = '';
  try {
    const t = tokenRequest(provider, { code, state, redirectUri }, env);
    const res = await fetch(t.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: form(t.body),
    });
    const json = await res.json().catch(() => ({}));
    accessToken = str(json.access_token, 2000);
    if (!res.ok || !accessToken) {
      log('token', provider, res.status, str(json.error || json.error_code, 60));
      return back({ error: 'exchange' });
    }
  } catch (e) {
    log('token-throw', provider, String(e?.message || e).slice(0, 120));
    return back({ error: 'exchange' });
  }

  let profile = null;
  try {
    const res = await fetch(profileUrl(provider), { headers: { Authorization: `Bearer ${accessToken}` } });
    profile = profileFrom(provider, await res.json().catch(() => null));
  } catch (e) {
    profile = null;
  }
  if (!profile) return back({ error: 'profile' });

  const uid = uidFor(provider, profile.id);
  /* 계정 이름·사진을 채워 둔다 — 온보딩이 이름 칸을 미리 채운다.
     이메일은 확인된 것만, 그리고 다른 계정이 이미 쓰면 붙이지 않는다(가입이 막히지 않게). */
  try {
    const patch = {};
    if (profile.name) patch.displayName = profile.name;
    if (profile.photo) patch.photoURL = profile.photo;
    try {
      await auth.getUser(uid);
      if (Object.keys(patch).length) await auth.updateUser(uid, patch);
    } catch (e) {
      if (e?.code !== 'auth/user-not-found') throw e;
      try {
        await auth.createUser({ uid, ...patch, ...(profile.email ? { email: profile.email, emailVerified: true } : {}) });
      } catch (e2) {
        if (!/email-already-exists/.test(String(e2?.code || ''))) throw e2;
        await auth.createUser({ uid, ...patch });
      }
    }
  } catch (e) {
    log('user', provider, String(e?.code || e?.message || e).slice(0, 120));
  }

  try {
    const token = await auth.createCustomToken(uid, { provider });
    return back({ token, name: profile.name });
  } catch (e) {
    const msg = String(e?.code || e?.message || e);
    log('custom-token', msg.slice(0, 160));
    return back({ error: /signBlob|iam|permission/i.test(msg) ? 'permission' : 'server' });
  }
}

module.exports = {
  PROVIDERS, APP_RETURN_DEFAULT, AUTH_HOST_DEFAULT,
  providerFromPath, stateOk, configured, tokenRequest, profileUrl, profileFrom, uidFor, appRedirect, handle,
};
