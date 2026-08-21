/* ============================================================
   PHASE 2 — 초기 시드 데이터 주입
   새 클럽 생성 직후 1회 호출(총무 온보딩). 데모/테스트용 회원·코트·모임 생성.
   실사용 클럽은 seedMembers 없이 총무 본인만 등록되도록 minimal 옵션 사용.
   ============================================================ */
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { DEFAULT_RULES } from './matchmaking';
import { ROLES } from './constants';

const SEED_MEMBERS = [
  ['이서연', 'F', 'B'], ['박지훈', 'M', 'B'], ['최수아', 'F', 'A'], ['정도윤', 'M', 'C'],
  ['강하은', 'F', 'B'], ['조현우', 'M', 'A'], ['윤지민', 'F', 'C'], ['임태양', 'M', 'B'],
  ['한소율', 'F', 'A'], ['오건우', 'M', 'C'], ['신유나', 'F', 'B'],
];

const SEED_COURTS = [
  { sido: '서울', gu: '송파구', name: '올림픽공원 테니스장', addr: '송파구 올림픽로 424', surface: '하드', indoor: false, link: 'https://www.ksponco.or.kr' },
  { sido: '서울', gu: '강남구', name: '탄천 테니스장', addr: '강남구 탄천변', surface: '하드', indoor: false, link: 'https://yeyak.seoul.go.kr' },
  { sido: '경기', gu: '과천시', name: '과천시민회관 테니스장', addr: '과천시 중앙동', surface: '하드', indoor: false, link: 'https://www.gccity.go.kr' },
  { sido: '경기', gu: '안양시', name: '평촌 테니스장', addr: '안양시 동안구', surface: '클레이', indoor: false, link: 'https://www.anyang.go.kr' },
];

function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

/**
 * @param clubId   대상 클럽
 * @param withDemo true면 데모 회원/모임까지, false면 코트+규칙만(실사용)
 */
/* 기본값이 false 인 이유
   예전에는 true 였다. 지금 부르는 곳(온보딩)은 항상 false 를 넘기므로
   실제로 가짜 회원이 들어간 적은 없다. 다만 나중에 누가 인자를 빼고
   부르면 그 순간 남의 클럽에 모르는 이름이 생긴다. 그것만큼 신뢰를
   빨리 깎는 것이 없어서 기본값을 뒤집어 둔다. */
export async function seedClub(clubId, withDemo = false) {
  const batch = writeBatch(db);

  // 편성 규칙 기본값
  batch.set(doc(db, 'clubs', clubId, 'meta', 'rules'), { order: DEFAULT_RULES.map((r) => r.key) });

  // 코트 DB
  SEED_COURTS.forEach((c) => {
    const ref = doc(collection(db, 'clubs', clubId, 'courts'));
    batch.set(ref, c);
  });

  if (withDemo) {
    const memberIds = [];
    SEED_MEMBERS.forEach(([name, gender, grade]) => {
      const ref = doc(collection(db, 'clubs', clubId, 'members'));
      batch.set(ref, { name, gender, grade, role: ROLES.MEMBER, status: '활동' });
      memberIds.push(ref.id);
    });

    // 다음 토요일 모임 + 앞 9명 참석
    const rsvp = {};
    memberIds.slice(0, 9).forEach((id) => { rsvp[id] = 'yes'; });
    const mref = doc(collection(db, 'clubs', clubId, 'meetings'));
    batch.set(mref, {
      date: nextSaturday(), time: '10:00', place: '과천시민회관 테니스장',
      courts: 2, rounds: 4, rsvp, guests: [], matches: [], restScores: {}, canceled: false,
      createdAt: serverTimestamp(),
    });

    // 공지 1건
    const pref = doc(collection(db, 'clubs', clubId, 'posts'));
    batch.set(pref, {
      type: 'notice', title: '정기모임 안내', body: '이번 주 토요일 10시, 코트 2면 확보 완료!',
      author: '총무', pinned: true, comments: [], date: new Date().toISOString().slice(0, 10),
    });
  }

  await batch.commit();
}
