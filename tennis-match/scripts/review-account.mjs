/* ============================================================
   스토어 심사용 계정 + 시험 클럽 — GitHub Actions 「테니스매치 심사용 계정」에서 돈다

   왜 필요한가
     이 앱은 로그인해야 쓸 수 있다. 구글 플레이·앱스토어 심사자는 우리
     클럽 회원이 아니라서, 로그인할 계정과 **내용이 들어 있는 클럽**이 없으면
     빈 화면만 보고 "기능을 확인할 수 없음"으로 반려한다.
     플레이 콘솔 › 앱 콘텐츠 › 앱 액세스에 이 계정의 이메일·비밀번호를 적는다.

   ⚠️ 비밀번호는 채팅·로그·저장소에 남기지 않는다
      앱 주인이 GitHub Secrets 에 REVIEW_EMAIL · REVIEW_PASSWORD 로 넣고,
      같은 값을 플레이 콘솔에 적는다. 이 스크립트는 그 값을 받아 계정을
      만들거나(없으면) 비밀번호를 맞출(있으면) 뿐 어디에도 찍지 않는다.

   만드는 것 (여러 번 돌려도 같은 결과 — 문서 id 를 고정했다)
     · 계정: 이메일 인증 완료 상태, 이름 「심사 담당자」
     · 클럽 review-demo 「[심사용] Court 데모 클럽」 — 심사자가 회장이라 운영 기능까지 보인다
     · 가상의 회원 11명(앱 계정 없는 오프라인 회원), 다가오는 모임 2개(참석 9명),
       이번 달 회비(절반 납부)·지출 2건, 공지 1건
     · 클럽 찾기 목록에는 올리지 않는다(다른 사람 눈에 띄지 않게)

   입력(환경 변수)
     REVIEW_EMAIL, REVIEW_PASSWORD  (필수)
     REVIEW_ACTION  setup(기본) | remove — remove 는 계정과 시험 클럽을 지운다
   ============================================================ */
import { createRequire } from 'node:module';
import { DEFAULT_SETTINGS } from '../src/lib/schedule.js';
import { DEFAULT_RULES } from '../src/lib/matchmaking.js';
import { ROLES } from '../src/lib/constants.js';

/* 서버 라이브러리는 실제로 돌 때만 불러온다 — 검사(test-review)는 모양만 보므로
   functions/node_modules 가 없는 곳에서도 돌아야 한다. */
const admin = () => {
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  return {
    ...require('firebase-admin/app'), ...require('firebase-admin/auth'), ...require('firebase-admin/firestore'),
  };
};
let FieldValue = null;

export const CLUB_ID = 'review-demo';
export const CLUB_NAME = '[심사용] Court 데모 클럽';

export const DEMO_MEMBERS = [
  ['이서연', 'F', 'B'], ['박지훈', 'M', 'B'], ['최수아', 'F', 'A'], ['정도윤', 'M', 'C'],
  ['강하은', 'F', 'B'], ['조현우', 'M', 'A'], ['윤지민', 'F', 'C'], ['임태양', 'M', 'B'],
  ['한소율', 'F', 'A'], ['오건우', 'M', 'C'], ['신유나', 'F', 'B'],
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 오늘(한국)에서 가장 가까운 다음 요일(0=일 … 6=토). 오늘이면 다음 주 */
export function nextWeekday(dow, now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  const base = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  const add = ((dow - base.getUTCDay() + 7) % 7) || 7;
  base.setUTCDate(base.getUTCDate() + add);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/** 심사자가 보게 될 데이터 한 벌 — 쓰기 전에 모양만 만든다(검사가 이것을 본다) */
export function demoDocs(uid, now = new Date()) {
  const today = ymd(new Date(now.getTime() + 9 * 3600 * 1000 + new Date().getTimezoneOffset() * 60000));
  const month = today.slice(0, 7);
  const members = DEMO_MEMBERS.map(([name, gender, grade], i) => ({
    id: `demo${pad(i + 1)}`,
    data: { name, gender, grade, role: ROLES.MEMBER, status: '활동', venueIds: [] },
  }));
  const going = Object.fromEntries(members.slice(0, 8).map((m) => [m.id, 'yes']));
  const meeting = (date, time, place) => ({
    date, time, place, courts: 2, rounds: 4,
    rsvp: { ...going, [uid]: 'yes' }, guests: [], matches: [], restScores: {}, canceled: false,
  });
  const paid = Object.fromEntries(members.map((m, i) => [m.id, i % 2 === 0]));
  paid[uid] = true;
  return {
    club: {
      name: CLUB_NAME,
      settings: { ...DEFAULT_SETTINGS, region: '서울 송파구' },
      ownerId: uid, image: '', joinPassword: '', review: true,
    },
    owner: { name: '심사 담당자', gender: 'M', grade: 'B', role: ROLES.PRESIDENT, status: '활동', venueIds: [] },
    user: { clubId: CLUB_ID, name: '심사 담당자', gender: 'M', grade: 'B', pendingClubId: null, skippedOnboarding: false },
    members,
    meetings: [
      { id: 'meet-sat', data: meeting(nextWeekday(6, now), '10:00', '올림픽공원 테니스장') },
      { id: 'meet-wed', data: meeting(nextWeekday(3, now), '19:30', '장충테니스장') },
    ],
    rules: { order: DEFAULT_RULES.map((r) => r.key) },
    fee: { key: month, data: { paid, amount: DEFAULT_SETTINGS.feeAmount } },
    expenses: [
      { id: 'exp-court', data: { date: `${month}-05`, category: '코트 대관', amount: 120000, memo: '토요일 코트 2면', venueId: null } },
      { id: 'exp-ball', data: { date: `${month}-12`, category: '공·소모품', amount: 45000, memo: '테니스공 2박스', venueId: null } },
    ],
    notice: {
      type: 'notice', title: '정기모임 안내', clubId: CLUB_ID, pinned: true, comments: [],
      body: '이번 주 토요일 10시 올림픽공원, 코트 2면 확보했습니다. 참석 투표 부탁드려요!',
      author: '심사 담당자', date: today,
    },
  };
}

async function ensureUser(auth, email, password) {
  try {
    const u = await auth.getUserByEmail(email);
    await auth.updateUser(u.uid, { password, emailVerified: true, disabled: false });
    return { uid: u.uid, created: false };
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e;
    const u = await auth.createUser({ email, password, emailVerified: true, displayName: '심사 담당자' });
    return { uid: u.uid, created: true };
  }
}

async function setup(auth, db, email, password) {
  const { uid, created } = await ensureUser(auth, email, password);
  const d = demoDocs(uid);
  const club = db.collection('clubs').doc(CLUB_ID);
  const batch = db.batch();
  batch.set(club, { ...d.club, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(club.collection('members').doc(uid), d.owner, { merge: true });
  d.members.forEach((m) => batch.set(club.collection('members').doc(m.id), m.data, { merge: true }));
  /* 모임은 매번 다가오는 날짜로 새로 쓴다 — 지난 날짜로 남으면 심사자가 빈 일정을 본다 */
  d.meetings.forEach((m) => batch.set(club.collection('meetings').doc(m.id), { ...m.data, createdAt: FieldValue.serverTimestamp() }));
  batch.set(club.collection('meta').doc('rules'), d.rules);
  batch.set(club.collection('fees').doc(d.fee.key), d.fee.data, { merge: true });
  d.expenses.forEach((x) => batch.set(club.collection('expenses').doc(x.id), { ...x.data, createdAt: FieldValue.serverTimestamp() }));
  batch.set(club.collection('posts').doc('notice'), d.notice);
  batch.set(db.collection('users').doc(uid), { ...d.user, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  console.log(`심사용 계정 ${created ? '만듦' : '비밀번호 맞춤'} · 시험 클럽 준비 완료`);
  console.log(`  클럽: ${CLUB_NAME} (회원 ${d.members.length + 1}명, 모임 ${d.meetings.map((m) => m.data.date).join(' · ')})`);
}

async function remove(auth, db, email) {
  try {
    const u = await auth.getUserByEmail(email);
    await db.collection('users').doc(u.uid).delete();
    await auth.deleteUser(u.uid);
    console.log('심사용 계정을 지웠습니다');
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e;
    console.log('심사용 계정이 이미 없습니다');
  }
  await db.recursiveDelete(db.collection('clubs').doc(CLUB_ID));
  console.log('시험 클럽을 지웠습니다');
}

async function main() {
  const email = String(process.env.REVIEW_EMAIL || '').trim();
  const password = String(process.env.REVIEW_PASSWORD || '');
  const action = process.env.REVIEW_ACTION || 'setup';
  if (!email) throw new Error('REVIEW_EMAIL 시크릿이 없습니다.');
  if (action === 'setup' && password.length < 8) throw new Error('REVIEW_PASSWORD 시크릿이 없거나 8자보다 짧습니다.');
  const a = admin();
  FieldValue = a.FieldValue;
  a.initializeApp();
  const auth = a.getAuth();
  const db = a.getFirestore();
  if (action === 'remove') return remove(auth, db, email);
  return setup(auth, db, email, password);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => {
    console.error(`::error::${e?.message || e}`);
    process.exit(1);
  });
}
