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

/* ---------- 결과 맡겨 두기 — 카카오톡이 크롬에서 로그인을 마쳐 앱으로 못 돌아가는 경우 ---------- */
{
  const box = new Map();
  const handoff = { put: async (k, v) => { box.set(k, v); }, take: async (k) => { const v = box.get(k) || null; box.delete(k); return v; } };
  const { deps } = fakes();
  const T = 1_800_000_000_000;
  const d = { ...deps, handoff, now: () => T };
  await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, d);
  eq(box.get(STATE)?.token, 'CUSTOM.TOKEN', '로그인 결과를 state 이름으로 맡겨 둔다');
  ok(S.isResultPath('/auth/result') && !S.isResultPath('/auth/kakao/callback'), '결과 찾는 주소를 구분한다');
  const r1 = await S.handleResult({ state: STATE }, d);
  eq([r1.status, r1.body.token, r1.body.provider, r1.body.name], [200, 'CUSTOM.TOKEN', 'kakao', '김테니스'], '앱이 state 로 결과를 찾아간다');
  eq((await S.handleResult({ state: STATE }, d)).body, { pending: true }, '한 번 꺼내면 지워진다(두 번 못 쓴다)');
  eq((await S.handleResult({ state: 'kakao.OTHERSTATEOTHER123' }, d)).body, { pending: true }, '없는 state 는 아직 없음');
  eq((await S.handleResult({ state: 'bad' }, d)).status, 400, '모양이 틀린 state 는 거절');
  eq((await S.handleResult({ state: 'google.abcdefghijklmnopqrst' }, d)).status, 400, '카카오·네이버가 아니면 거절');
  await S.handle({ path: '/auth/kakao/callback', query: { error: 'access_denied', state: STATE } }, d);
  eq((await S.handleResult({ state: STATE }, d)).body.error, 'cancelled', '취소도 맡겨 둔다 — 앱이 조용히 멈춘다');
  await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, d);
  eq((await S.handleResult({ state: STATE }, { ...d, now: () => T + S.HANDOFF_TTL_MS + 1 })).body.error, 'expired', '오래된 결과는 쓰지 않는다');
  await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: 'bad' } }, d);
  ok(!box.has('bad'), 'state 가 틀린 요청은 맡기지 않는다');
  const failing = { ...d, handoff: { put: async () => { throw new Error('db down'); }, take: async () => null } };
  const q = qs(await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, failing));
  eq(q.token, 'CUSTOM.TOKEN', '맡기기에 실패해도 앱 주소로는 그대로 돌려보낸다');
}

console.log('[연결 끊기 — 계정 삭제]');
{
  ok(S.isUnlinkIntent('kakao.del_abcdefghijklmnopqrstuvwxyz012345'), '삭제 전 본인 확인 state');
  ok(!S.isUnlinkIntent(STATE), '보통 로그인은 토큰을 맡기지 않는다');
  ok(S.stateOk('kakao', 'kakao.del_abcdefghijklmnopqrstuvwxyz012345'), '삭제용 state 도 모양 검사를 통과한다');
  ok(S.isUnlinkPath('/auth/unlink') && !S.isUnlinkPath('/auth/kakao/callback'), '/auth/unlink 주소');

  const kr = S.unlinkRequest('kakao', 'AT', ENV);
  eq([kr.url, kr.headers.Authorization], ['https://kapi.kakao.com/v1/user/unlink', 'Bearer AT'], '카카오: 사용자 토큰으로 unlink (Admin 키 불필요)');
  const nr = S.unlinkRequest('naver', 'AT', ENV);
  ok(nr.url === 'https://nid.naver.com/oauth2.0/token' && /grant_type=delete/.test(nr.body) && /access_token=AT/.test(nr.body)
    && /client_secret=nsec/.test(nr.body) && /service_provider=NAVER/.test(nr.body), '네이버: 토큰 삭제 요청');
  ok(S.unlinkOk('kakao', 200, { id: 1 }) && !S.unlinkOk('kakao', 401, { code: -401 }), '카카오 응답 판정');
  ok(S.unlinkOk('naver', 200, { result: 'success' }) && !S.unlinkOk('naver', 200, { error: 'invalid_request' }), '네이버 응답 판정');

  /* 흐름: 삭제용 로그인 → 토큰 맡김 → /auth/unlink 가 그 토큰으로 끊는다 */
  const box = new Map();
  const unlinkStore = { put: async (k, v) => { box.set(k, v); }, take: async (k) => { const v = box.get(k); box.delete(k); return v || null; } };
  const DEL = 'kakao.del_abcdefghijklmnopqrstuvwxyz012345';
  const { calls, deps } = fakes();
  await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: DEL } }, { ...deps, unlinkStore });
  eq(box.get('kakao:12345')?.accessToken, 'AT', '삭제 전 본인 확인이면 토큰을 uid 이름으로 맡긴다');
  const box2 = new Map();
  await S.handle({ path: '/auth/kakao/callback', query: { code: 'C', state: STATE } }, { ...deps, unlinkStore: { put: async (k, v) => box2.set(k, v) } });
  eq(box2.size, 0, '보통 로그인은 맡기지 않는다');

  const verify = (uid) => ({ verifyIdToken: async (t) => { if (t !== 'ID') throw new Error('bad'); return { uid }; } });
  const sent = [];
  const fetchOk = async (url, init) => { sent.push({ url, init }); return { status: 200, json: async () => ({ id: 12345 }) }; };
  let r = await S.handleUnlink({ idToken: 'ID' }, { fetch: fetchOk, auth: verify('kakao:12345'), env: ENV, unlinkStore });
  eq(r.body, { ok: true, provider: 'kakao' }, '맡겨 둔 토큰으로 카카오 연결을 끊는다');
  eq(sent[0].init.headers.Authorization, 'Bearer AT', '그 사람의 토큰으로');
  eq(box.has('kakao:12345'), false, '한 번 쓰면 지운다');
  r = await S.handleUnlink({ idToken: 'ID' }, { fetch: fetchOk, auth: verify('kakao:12345'), env: ENV, unlinkStore });
  eq(r.body.error, 'no-token', '맡긴 토큰이 없으면(본인 확인 안 함) 끊지 못한다고 알린다');
  r = await S.handleUnlink({ idToken: 'X' }, { fetch: fetchOk, auth: verify('kakao:12345'), env: ENV, unlinkStore });
  eq([r.status, r.body.error], [401, 'auth'], 'Firebase 로그인이 확인 안 되면 거절 — 남의 연결을 끊을 수 없다');
  r = await S.handleUnlink({ idToken: 'ID' }, { fetch: fetchOk, auth: verify('abcUID'), env: ENV, unlinkStore });
  eq(r.body, { ok: true, skipped: 'provider' }, '이메일·구글 계정은 서버에서 끊을 것이 없다');
  box.set('naver:nv-1', { provider: 'naver', accessToken: 'NT', at: 0 });
  r = await S.handleUnlink({ idToken: 'ID' }, { fetch: fetchOk, auth: verify('naver:nv-1'), env: ENV, unlinkStore, now: () => S.UNLINK_TTL_MS + 1 });
  eq(r.body.error, 'expired', '오래된 토큰은 쓰지 않는다');
  box.set('naver:nv-1', { provider: 'naver', accessToken: 'NT', at: 0 });
  r = await S.handleUnlink({ idToken: 'ID' }, { fetch: async () => ({ status: 200, json: async () => ({ result: 'success' }) }), auth: verify('naver:nv-1'), env: ENV, unlinkStore, now: () => 1000 });
  eq(r.body, { ok: true, provider: 'naver' }, '네이버 연결 끊기');

  const idx = (await import('node:fs')).readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  ok(/isUnlinkPath\(req\.path\)/.test(idx) && /unlinkStore,/.test(idx) && /req\.method !== 'POST'/.test(idx), '함수에 /auth/unlink 가 이어져 있다(POST 만)');
  const rules = (await import('node:fs')).readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  ok(!/authUnlink/.test(rules), '맡겨 둔 토큰 컬렉션은 규칙에 없다 = 앱이 못 읽는다');
}

console.log(`\n카카오·네이버 서버 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
