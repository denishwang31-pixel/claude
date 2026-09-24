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
     ADMIN_ACTION  grant | revoke | list
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

  const user = await resolveUser(auth, process.env.ADMIN_TARGET);
  const ref = db.collection('appAdmins').doc(user.uid);
  if (action === 'grant') {
    await ref.set({ note: '앱 관리자', via: 'github-actions', grantedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log(`지정했습니다: ${mask(user.email)} ${tail(user.uid)}`);
    console.log('앱을 완전히 껐다 켜면 관리자 메뉴가 보입니다.');
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
    console.log('::error::서비스 계정에 권한이 없습니다. Firebase 콘솔 › 프로젝트 설정 › 서비스 계정에서 쓰는 계정에 '
      + '「Firebase Authentication 관리자」와 「Cloud Datastore 사용자」 역할이 필요합니다.');
  } else {
    console.log(`::error::${msg}`);
  }
  process.exit(1);
});
