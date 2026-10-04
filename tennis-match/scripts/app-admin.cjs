/* ============================================================
   앱 관리자 지정·해제·목록 — GitHub Actions 「테니스매치 앱 관리자」에서 돈다

   왜 이렇게 하나
     앱 관리자는 appAdmins/{uid} 문서가 있는 계정이다. 첫 관리자는 앱
     안에서 만들 수 없다(규칙상 관리자만 관리자를 만든다). 콘솔에서
     손으로 만들려면 uid 를 찾아 복사해야 해서 태블릿으로는 번거롭다.
     그래서 이메일만 넣고 버튼을 누르면 되게 했다.

   ⚠️ 비밀번호가 있는 새 계정을 만들어 건네지 않는다. 채팅이나 로그에
      비밀번호가 남으면 그 계정은 이미 새어 나간 것이다. 대신 **본인이
      평소 로그인하는 계정**(구글 등)을 관리자로 지정한다.
   ⚠️ 그 이메일로 앱에 한 번은 로그인해 있어야 한다(계정이 있어야 지정된다).
   ⚠️ 로그에는 이메일을 가려서 남긴다(de***@gmail.com). uid 도 뒤 4자만.

   입력(환경 변수)
     ADMIN_ACTION  grant | revoke | list | info(로그인 방식·인증 상태 보기)
                   | social-log(카카오·네이버 로그인이 서버까지 왔는지 — 최근 요청·기록)
                   | errors(앱 화면 오류 기록 최근 7일 — src/lib/crashReport.js)
     ADMIN_TARGET  이메일 또는 uid
   ============================================================ */
const path = require('path');
const req = (m) => require(require.resolve(m, { paths: [path.join(__dirname, '..', 'functions')] }));
const { initializeApp } = req('firebase-admin/app');
const { getAuth } = req('firebase-admin/auth');
const { getFirestore, FieldValue } = req('firebase-admin/firestore');

const mask = (email) => {
  const [a, d] = String(email || '').split('@');
  if (!d) return '(이메일 없음)';
  return `${a.slice(0, 2)}***@${d}`;
};
const tail = (uid) => `…${String(uid).slice(-4)}`;

async function resolveUser(auth, target) {
  const t = String(target || '').trim();
  if (!t) throw new Error('이메일(또는 uid)을 넣어 주세요.');
  try {
    return t.includes('@') ? await auth.getUserByEmail(t) : await auth.getUser(t);
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') {
      throw new Error('그 계정이 아직 없습니다. 먼저 그 이메일로 앱에 한 번 로그인해 주세요.');
    }
    throw e;
  }
}

/* 카카오·네이버 로그인 진단 — "로그인 결과가 앱으로 안 온다"를 추측이 아니라 기록으로 본다.
   ⚠️ 비밀값은 찍지 않는다: 요청 주소는 경로만(쿼리 = code·state 는 이름만),
      토큰·code 값·이메일은 어디에도 남기지 않는다. */
function redactUrl(u) {
  try {
    const x = new URL(u);
    const keys = [...x.searchParams.keys()];
    return `${x.pathname}${keys.length ? ` ?${keys.join(',')}` : ''}${x.searchParams.get('error') ? ` error=${x.searchParams.get('error')}` : ''}`;
  } catch (e) { return '(주소 읽기 실패)'; }
}

async function socialLog(db) {
  const { execFileSync } = require('child_process');
  console.log('[1] 서버가 받은 요청 (최근 3시간, socialAuth)');
  try {
    execFileSync('gcloud', ['auth', 'activate-service-account', `--key-file=${process.env.GOOGLE_APPLICATION_CREDENTIALS}`, '--quiet'], { stdio: 'ignore' });
    const out = execFileSync('gcloud', ['logging', 'read',
      'resource.type="cloud_run_revision" AND resource.labels.service_name="socialauth"',
      `--project=${process.env.GOOGLE_CLOUD_PROJECT}`, '--freshness=3h', '--limit=80', '--format=json'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const rows = JSON.parse(out || '[]').reverse();
    if (!rows.length) console.log('  (요청 기록 없음 — 카카오·네이버가 우리 서버로 돌려보낸 적이 없다)');
    rows.forEach((r) => {
      const t = String(r.timestamp || '').replace('T', ' ').slice(5, 19);
      if (r.httpRequest) {
        const ua = String(r.httpRequest.userAgent || '');
        const who = /KAKAOTALK/i.test(ua) ? '카카오톡' : /NAVER/i.test(ua) ? '네이버앱' : /wv\)/.test(ua) ? '웹뷰' : /Chrome/i.test(ua) ? '크롬' : /okhttp|Dalvik/i.test(ua) ? '앱' : '기타';
        console.log(`  ${t}  ${r.httpRequest.status}  ${redactUrl(r.httpRequest.requestUrl)}  (${who})`);
      } else if (r.textPayload && /socialAuth/.test(r.textPayload)) {
        console.log(`  ${t}  기록: ${String(r.textPayload).slice(0, 160)}`);
      }
    });
  } catch (e) {
    console.log(`  요청 기록을 읽지 못했습니다(서비스 계정에 로그 보기 권한 roles/logging.viewer 필요): ${String(e.message || e).split('\n')[0].slice(0, 160)}`);
  }

  console.log('[2] 서버에 맡겨 둔 로그인 결과 (authHandoff — 값은 안 찍음)');
  const hs = await db.collection('authHandoff').get();
  if (!hs.size) console.log('  (없음)');
  hs.docs.forEach((d) => {
    const v = d.data();
    console.log(`  ${new Date(v.at || 0).toISOString().slice(5, 19)}  ${v.provider || '?'}  ${v.token ? '토큰 있음' : `오류 ${v.error || '-'}`}`);
  });
}

/* 앱 화면 오류 기록 — 하얀 화면이 왜 났는지. ⚠️ 이 로그는 공개 저장소의 Actions 로그다:
   이메일은 앱에서 이미 가렸고, uid 는 뒤 4자만, 문구·스택은 앞부분만 찍는다. */
async function clientErrors(db) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const snap = await db.collection('clientErrors').where('at', '>=', since).orderBy('at', 'desc').limit(30).get();
  console.log(`앱 오류 기록 (최근 7일) ${snap.size}건`);
  const groups = {};
  snap.docs.forEach((d) => {
    const x = d.data();
    const k = String(x.message || '').slice(0, 120);
    (groups[k] = groups[k] || []).push(x);
  });
  Object.entries(groups).forEach(([msg, rows]) => {
    const x = rows[0];
    const kst = (t) => (t?.toDate ? new Date(t.toDate().getTime() + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ') : '?');
    console.log('');
    console.log(`■ ${rows.length}번 · 최근 ${kst(x.at)} KST · ${x.where || '?'} · 화면 ${x.path || '?'}`);
    console.log(`  앱 ${x.app?.version || '?'} · 업데이트 ${String(x.app?.updateId || '').slice(0, 8) || '?'} · ${x.app?.platform || '?'} ${x.app?.os || ''} · 사용자 …${String(x.uid || '').slice(-4)}`);
    console.log(`  문구: ${msg}`);
    /* last-run(갑자기 꺼짐)은 stack 칸에 마지막 동작들이 들어 있다 — 끝까지 보여 준다 */
    String(x.stack || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(['last-run', 'user-report', 'stall', 'recover'].includes(x.where) ? -60 : 0, ['last-run', 'user-report', 'stall', 'recover'].includes(x.where) ? undefined : 6)
      .forEach((l) => console.log(`    ${l.slice(0, 160)}`));
  });
}

async function main() {
  initializeApp();
  const auth = getAuth();
  const db = getFirestore();
  const action = process.env.ADMIN_ACTION || 'list';

  if (action === 'list') {
    const snap = await db.collection('appAdmins').get();
    console.log(`앱 관리자 ${snap.size}명`);
    for (const d of snap.docs) {
      const u = await auth.getUser(d.id).catch(() => null);
      console.log(`  · ${u ? mask(u.email) : '(계정 없음)'} ${tail(d.id)}`);
    }
    return;
  }

  if (action === 'social-log') { await socialLog(db); return; }
  if (action === 'errors') { await clientErrors(db); return; }

  const user = await resolveUser(auth, process.env.ADMIN_TARGET);
  const ref = db.collection('appAdmins').doc(user.uid);
  if (action === 'grant') {
    await ref.set({ note: '앱 관리자', via: 'github-actions', grantedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log(`지정했습니다: ${mask(user.email)} ${tail(user.uid)}`);
    console.log('앱을 완전히 껐다 켜면 관리자 메뉴가 보입니다.');
  } else if (action === 'info') {
    /* 로그인이 안 되거나 메일이 안 올 때 원인 찾기 — 이 계정이 어떤 방식으로 로그인되나.
       password 가 없으면 비밀번호 로그인·재설정이 그 계정에 아직 없는 것이다
       (지메일로 구글 로그인을 하면 확인 안 된 비밀번호 방식이 떨어져 나간다). */
    const providers = (user.providerData || []).map((p) => p.providerId);
    console.log(`계정: ${mask(user.email)} ${tail(user.uid)}`);
    console.log(`  로그인 방식: ${providers.join(', ') || '(없음 — 카카오·네이버·둘러보기)'}`);
    console.log(`  비밀번호 로그인: ${providers.includes('password') ? '있음' : '없음'}`);
    console.log(`  이메일 인증: ${user.emailVerified ? '됨' : '안 됨'}`);
    console.log(`  사용 중지: ${user.disabled ? '예' : '아니오'}`);
    console.log(`  가입: ${user.metadata.creationTime} · 마지막 로그인: ${user.metadata.lastSignInTime || '-'}`);
    console.log(`  앱 관리자: ${(await ref.get()).exists ? '예' : '아니오'}`);
  } else if (action === 'revoke') {
    await ref.delete();
    console.log(`해제했습니다: ${mask(user.email)} ${tail(user.uid)}`);
  } else {
    throw new Error(`모르는 동작: ${action}`);
  }
}

main().catch((e) => {
  const msg = String((e && e.message) || e);
  if (/PERMISSION_DENIED|insufficient permission|does not have/i.test(msg)) {
    /* 콘솔 메뉴 이름은 언어·개편에 따라 달라서 적지 않는다 — 바뀌지 않는 역할 아이디로 알린다 */
    console.log('::error::서비스 계정에 권한이 없습니다. 이 서비스 계정(FIREBASE_SERVICE_ACCOUNT)에 '
      + 'IAM 역할 roles/firebaseauth.admin 과 roles/datastore.user 가 필요합니다.');
  } else {
    console.log(`::error::${msg}`);
  }
  process.exit(1);
});
