/* 카카오·네이버 로그인 서버 판단 (functions/socialAuth.js) — 네트워크·Firebase 는 가짜로 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../functions/socialAuth.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)} / 실제 ${JSON.stringify(a)}`);
const qs = (url) => Object.fromEntries(new URL(url.replace('com.donghyun.tennismatch://', 'x://')).searchParams);

console.log('[주소·state]');
eq(S.providerFromPath('/auth/kakao/callback'), 'kakao', '카카오 콜백');
eq(S.providerFromPath('/auth/naver/callback/'), 'naver', '네이버 콜백(끝 슬래시)');
eq(S.providerFromPath('/auth/google/callback'), '', '모르는 제공자');
eq(S.providerFromPath('/auth/kakao/callback/../x'), '', '이상한 경로');
ok(S.stateOk('kakao', 'kakao.abcdefghijklmnop1234'), 'state 모양');
ok(!S.stateOk('kakao', 'naver.abcdefghijklmnop1234'), '다른 제공자의 state 는 거절');
ok(!S.stateOk('kakao', 'kakao.short'), '짧은 state 거절');
ok(!S.stateOk('kakao', 'kakao.abcdefghijklmnop1234&x=1'), '기호 섞인 state 거절');

console.log('[요청 모양]');
const ENV = { KAKAO_REST_KEY: 'kk', NAVER_CLIENT_ID: 'nid', NAVER_CLIENT_SECRET: 'nsec' };
const kt = S.tokenRequest('kakao', { code: 'C', redirectUri: 'R' }, ENV);
eq(kt.url, 'https://kauth.kakao.com/oauth/token', '카카오 토큰 주소');
eq(kt.body, { grant_type: 'authorization_code', client_id: 'kk', redirect_uri: 'R', code: 'C' }, '카카오 본문(시크릿 없으면 안 보냄)');
ok(S.tokenRequest('kakao', { code: 'C', redirectUri: 'R' }, { ...ENV, KAKAO_CLIENT_SECRET: 'ks' }).body.client_secret === 'ks', '카카오 시크릿을 켰으면 보냄');
const nt = S.tokenRequest('naver', { code: 'C', state: 'ST' }, ENV);
eq(nt.body.client_secret, 'nsec', '네이버는 시크릿 필수');
eq(nt.body.state, 'ST', '네이버는 state 도 보냄');
ok(S.configured('kakao', ENV) && !S.configured('kakao', {}), '카카오 설정 판단');
ok(S.configured('naver', ENV) && !S.configured('naver', { NAVER_CLIENT_ID: 'x' }), '네이버는 ID·시크릿 둘 다');

console.log('[회원 정보 읽기]');
const KAKAO_ME = { id: 12345, kakao_account: { email: 'a@b.com', is_email_valid: true, is_email_verified: true, profile: { nickname: '김테니스', profile_image_url: 'https://k.kakaocdn.net/p.jpg' } } };
eq(S.profileFrom('kakao', KAKAO_ME), { id: '12345', name: '김테니스', email: 'a@b.com', emailVerified: true, photo: 'https://k.kakaocdn.net/p.jpg' }, '카카오 프로필');
eq(S.profileFrom('kakao', { id: 1, kakao_account: { email: 'x@y.com', is_email_valid: true, is_email_verified: false } }).email, '', '확인 안 된 이메일은 버린다');
eq(S.profileFrom('kakao', { id: 1, kakao_account: { profile: { profile_image_url: 'http://insecure' } } }).photo, '', 'http 사진은 버린다');
eq(S.profileFrom('kakao', {}), null, 'id 없으면 null');
const NAVER_ME = { resultcode: '00', response: { id: 'nv-1', name: '박네이버', email: 'n@naver.com', profile_image: 'https://phinf.pstatic.net/a.jpg' } };
eq(S.profileFrom('naver', NAVER_ME), { id: 'nv-1', name: '박네이버', email: '', emailVerified: false, photo: 'https://phinf.pstatic.net/a.jpg' }, '네이버 프로필(이메일은 계정에 안 붙임)');
eq(S.profileFrom('naver', { resultcode: '024' }), null, '네이버 실패 응답');
eq(S.uidFor('kakao', '12345'), 'kakao:12345', 'uid 모양');
eq(S.appRedirect({ a: '1', b: '', c: null, d: '가 나' }), 'com.donghyun.tennismatch://oauth?a=1&d=%EA%B0%80%20%EB%82%98', '앱 복귀 주소(빈 값 제외·인코딩)');

console.log('[전체 흐름 — 가짜 카카오]');
const STATE = 'kakao.abcdefghijklmnopqrst';
function fakes({ tokenOk = true, me = KAKAO_ME, tokenThrows = null, existing = false, emailTaken = false } = {}) {
  const calls = { fetch: [], created: [], updated: [], tokens: [] };
  const fetch = async (url, init = {}) => {
    calls.fetch.push({ url, init });
    if (url.includes('/oauth/token') || url.includes('oauth2.0/token')) {
      return { ok: tokenOk, status: tokenOk ? 200 : 401, json: async () => (tokenOk ? { access_token: 'AT' } : { error: 'invalid_grant' }) };
    }
    return { ok: true, status: 200, json: async () => me };
  };
  const auth = {
    getUser: async () => { if (!existing) { const e = new Error('no'); e.code = 'auth/user-not-found'; throw e; } return {}; },
    updateUser: async (uid, p) => { calls.updated.push({ uid, p }); },
    createUser: async (u) => {
      if (emailTaken && u.email) { const e = new Error('taken'); e.code = 'auth/email-already-exists'; throw e; }
      calls.created.push(u);
    },
    createCustomToken: async (uid, claims) => {
      if (tokenThrows) throw tokenThrows;
      calls.tokens.push({ uid, claims });
      return 'CUSTOM.TOKEN';
    },
  };
  return { calls, deps: { fetch, auth, env: ENV } };
}
{
  const { calls, deps } = fakes();
  const url = await S.handle({ path: '/auth/kakao/callback', query: { code: 'CODE', state: STATE } }, deps);
  const q = qs(url);
  eq([q.provider, q.state, q.token, q.name], ['kakao', STATE, 'CUSTOM.TOKEN', '김테니스'], '성공하면 토큰·이름을 앱으로');
  ok(!('error' in q), '오류 없음');
  eq(calls.fetch[0].init.body.includes('redirect_uri=https%3A%2F%2Ftennis-match-52b31.web.app%2Fauth%2Fkakao%2Fcallback'), true, '등록한 콜백 주소 그대로 보냄');
  eq(calls.fetch[1].init.headers.Authorization, 'Bearer AT', '받은 토큰으로 회원 정보');
  eq(calls.created[0], { uid: 'kakao:12345', displayName: '김테니스', photoURL: 'https://k.kakaocdn.net/p.jpg', email: 'a@b.com', emailVerified: true }, '새 계정: 이름·사진·확인된 이메일');
  eq(calls.tokens[0], { uid: 'kakao:12345', claims: { provider: 'kakao' } }, '커스텀 토큰 uid');
}
{
  const { calls, deps } = fakes({ emailTaken: true });
  const q = qs(await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, deps));
  ok(!!q.token && calls.created.length === 1 && !calls.created[0].email, '이메일을 다른 계정이 쓰면 이메일 없이 만든다(가입이 막히지 않게)');
}
{
  const { calls, deps } = fakes({ existing: true });
  await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, deps);
  ok(calls.created.length === 0 && calls.updated.length === 1, '기존 계정은 이름·사진만 갱신');
}
const err = async (req, opt) => qs(await S.handle(req, fakes(opt).deps)).error;
eq(await err({ path: '/auth/kakao/callback', query: { error: 'access_denied', state: STATE } }), 'cancelled', '사용자가 취소');
eq(await err({ path: '/auth/kakao/callback', query: { code: 'C', state: 'bad' } }), 'state', 'state 가 이상하면 멈춤');
eq(await err({ path: '/auth/kakao/callback', query: { state: STATE } }), 'code', 'code 없음');
eq(await err({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, { tokenOk: false }), 'exchange', '토큰 교환 실패');
eq(await err({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, { me: {} }), 'profile', '회원 정보 못 읽음');
const perm = new Error('Permission iam.serviceAccounts.signBlob denied');
eq(await err({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, { tokenThrows: perm }), 'permission', '토큰 생성 권한 없음 → permission');
{
  const { deps } = fakes();
  const q = qs(await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, { ...deps, env: {} }));
  eq(q.error, 'config', '서버 키가 없으면 config');
}
{
  const { deps } = fakes({ me: NAVER_ME });
  const q = qs(await S.handle({ path: '/auth/naver/callback', query: { code: 'C', state: 'naver.abcdefghijklmnopqrst' } }, deps));
  eq([q.provider, q.token, q.name], ['naver', 'CUSTOM.TOKEN', '박네이버'], '네이버도 같은 흐름');
}

console.log(`\n카카오·네이버 서버 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
