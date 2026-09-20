/* 게시판 말머리 검사.

   말머리는 저장되는 값이라 한 번 틀리면 예전 글이 전부 엉뚱한 칸으로
   간다. 그래서 "모르는 값이 와도 무너지지 않는가"를 특히 본다. */
import {
  POST_KIND, POST_KINDS, kindOf, kindLabel, kindsFor, canPost,
  AUDIENCE, audienceOf, canBePublic, defaultAudience, safeAudience, canSee,
  isExpired, sortPosts, filterPosts, countByKind,
} from '../src/lib/board.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log('  ✗', m); } };
const eq = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 받은 값: ${JSON.stringify(a)}`);

console.log('[말머리 사전]');
ok(POST_KINDS.length === 5, '다섯 가지');
ok(new Set(POST_KINDS.map((k) => k.key)).size === 5, 'key 가 겹치지 않는다');
ok(new Set(POST_KINDS.map((k) => k.label)).size === 5, '이름이 겹치지 않는다');
ok(POST_KINDS.every((k) => k.label && k.key), '빈 값이 없다');
/* ⚠️ key 는 저장되는 값이다. 여기 적힌 문자열이 바뀌면 예전 글의
   말머리가 통째로 사라진다. 그래서 값 자체를 못 박아 둔다. */
eq('key 는 바뀌면 안 된다', POST_KINDS.map((k) => k.key),
  ['notice', 'court', 'squad', 'recruit', 'free']);

console.log('[모르는 값이 와도 무너지지 않는다]');
/* 예전 글에는 kind 가 아예 없다. 잘못 저장된 값도 있을 수 있다.
   그때 화면이 비거나 죽으면 안 된다 — 자유글로 본다. */
eq('없으면 자유', kindOf(undefined).key, POST_KIND.FREE);
eq('빈 문자열도 자유', kindOf('').key, POST_KIND.FREE);
eq('모르는 값도 자유', kindOf('노래자랑').key, POST_KIND.FREE);
eq('숫자가 와도 죽지 않는다', kindOf(123).key, POST_KIND.FREE);
eq('이름을 돌려준다', kindLabel(POST_KIND.COURT), '코트 양도');

console.log('[누가 무엇을 쓸 수 있나]');
ok(kindsFor(true).length === 5, '운영진은 다 쓸 수 있다');
ok(kindsFor(false).length === 4, '회원은 공지만 못 쓴다');
ok(!kindsFor(false).some((k) => k.key === POST_KIND.NOTICE), '회원 목록에 공지가 없다');
ok(canPost(POST_KIND.NOTICE, true), '운영진의 공지 허용');
ok(!canPost(POST_KIND.NOTICE, false), '회원의 공지 거부');
ok(canPost(POST_KIND.COURT, false), '회원의 코트 양도 허용');
/* ⚠️ 모르는 말머리는 누구도 못 쓴다. 화면에 없는 값이 저장되면
   목록에서 자유글로 보이는데, 정작 쓴 사람은 그걸 모른다. */
ok(!canPost('노래자랑', true), '모르는 말머리는 운영진도 못 쓴다');
ok(!canPost('', true), '빈 말머리도 못 쓴다');

console.log('[공개 범위]');
/* ⚠️ 이 검사가 이 파일에서 제일 중요하다. 방향을 한 번 틀리면 클럽 안에서만
   하던 이야기가 전국에 열리고, 그건 되돌릴 수 없다. */
eq('값이 없으면 우리 클럽만', audienceOf({}), AUDIENCE.CLUB);
eq('예전 글(필드 자체가 없음)도 우리 클럽만', audienceOf({ kind: 'free' }), AUDIENCE.CLUB);
eq('null 이어도 우리 클럽만', audienceOf(null), AUDIENCE.CLUB);
eq('모르는 값이면 우리 클럽만', audienceOf({ audience: '전체' }), AUDIENCE.CLUB);
eq('public 일 때만 공개', audienceOf({ audience: 'public' }), AUDIENCE.PUBLIC);

ok(canBePublic(POST_KIND.COURT), '코트 양도는 밖에 낼 수 있다');
ok(canBePublic(POST_KIND.SQUAD), '대회 멤버 모집은 밖에 낼 수 있다');
ok(canBePublic(POST_KIND.RECRUIT), '회원 모집은 밖에 낼 수 있다 — 안 그러면 뜻이 없다');
ok(!canBePublic(POST_KIND.NOTICE), '공지는 클럽 안의 이야기다');
ok(!canBePublic(POST_KIND.FREE), '자유글도 클럽 안의 이야기다');
ok(!canBePublic('노래자랑'), '모르는 말머리는 밖에 못 낸다');

eq('회원 모집의 기본은 공개', defaultAudience(POST_KIND.RECRUIT), AUDIENCE.PUBLIC);
eq('공지의 기본은 클럽만', defaultAudience(POST_KIND.NOTICE), AUDIENCE.CLUB);

/* ⚠️ 화면이 실수해도 저장 직전에 막는다. 말머리를 '코트 양도 + 공개'로
   골라 두고 '공지'로 바꾸면 공개인 채로 남는데, 그대로 저장하면
   클럽 공지가 전국에 뜬다. */
eq('공지를 공개로 저장하려 하면 클럽만으로 내린다',
  safeAudience(POST_KIND.NOTICE, AUDIENCE.PUBLIC), AUDIENCE.CLUB);
eq('자유글도 마찬가지', safeAudience(POST_KIND.FREE, AUDIENCE.PUBLIC), AUDIENCE.CLUB);
eq('코트 양도는 공개가 그대로 간다',
  safeAudience(POST_KIND.COURT, AUDIENCE.PUBLIC), AUDIENCE.PUBLIC);
eq('코트 양도도 클럽만을 고르면 그대로',
  safeAudience(POST_KIND.COURT, AUDIENCE.CLUB), AUDIENCE.CLUB);
eq('모르는 값이 오면 클럽만', safeAudience(POST_KIND.COURT, '전체'), AUDIENCE.CLUB);

console.log('[내가 볼 수 있는 글인가]');
ok(canSee({ audience: 'public', clubId: 'other' }, 'mine'), '남의 공개 글은 보인다');
ok(canSee({ clubId: 'mine' }, 'mine'), '우리 클럽 글은 보인다');
ok(!canSee({ clubId: 'other' }, 'mine'), '남의 클럽 전용 글은 안 보인다');
ok(!canSee({ clubId: 'other' }, ''), '클럽이 없으면 남의 전용 글은 안 보인다');
ok(canSee({ audience: 'public', clubId: 'other' }, ''), '클럽이 없어도 공개 글은 보인다');

console.log('[지난 글]');
const T = '2026-09-20';
ok(isExpired({ kind: POST_KIND.COURT, eventDate: '2026-09-19' }, T), '어제 코트 양도는 지났다');
ok(!isExpired({ kind: POST_KIND.COURT, eventDate: '2026-09-20' }, T), '오늘 것은 아직 유효하다');
ok(!isExpired({ kind: POST_KIND.COURT, eventDate: '2026-09-21' }, T), '내일 것은 유효하다');
ok(!isExpired({ kind: POST_KIND.COURT }, T), '날짜가 없으면 안 지난 것으로 본다');
/* 공지·자유·회원 모집은 날짜로 만료되지 않는다 — 회원 모집은 "상시"가
   기본이라 날짜를 넣어도 흐려지면 안 된다. */
ok(!isExpired({ kind: POST_KIND.FREE, eventDate: '2020-01-01' }, T), '자유글은 안 지난다');
ok(!isExpired({ kind: POST_KIND.NOTICE, eventDate: '2020-01-01' }, T), '공지는 안 지난다');
ok(!isExpired({ kind: POST_KIND.RECRUIT, eventDate: '2020-01-01' }, T), '회원 모집은 안 지난다');
ok(!isExpired(null, T), 'null 이 와도 죽지 않는다');

console.log('[정렬]');
{
  const posts = [
    { id: 'old', date: '2026-09-01' },
    { id: 'new', date: '2026-09-19' },
    { id: 'pin', date: '2026-08-01', pinned: true },
    { id: 'gone', date: '2026-09-20', kind: POST_KIND.COURT, eventDate: '2026-09-10' },
  ];
  /* ⚠️ 지난 양도글(gone)은 올린 날짜가 가장 최근이지만 맨 아래로 간다.
     위에 있으면 아직 유효한 줄 알고 연락한다. */
  eq('고정 → 유효한 최신 → 지난 글',
    sortPosts(posts, T).map((p) => p.id), ['pin', 'new', 'old', 'gone']);
  eq('원본을 건드리지 않는다', posts.map((p) => p.id), ['old', 'new', 'pin', 'gone']);
  eq('빈 목록도 된다', sortPosts([], T), []);
  eq('인자가 없어도 죽지 않는다', sortPosts(), []);
}

console.log('[거르기와 세기]');
{
  const posts = [
    { id: 1, kind: POST_KIND.COURT },
    { id: 2, kind: POST_KIND.COURT },
    { id: 3, kind: POST_KIND.NOTICE },
    { id: 4 },                         // 예전 글 — 자유로 센다
    { id: 5, kind: '노래자랑' },        // 잘못된 값 — 자유로 센다
  ];
  eq('말머리로 거른다', filterPosts(posts, POST_KIND.COURT).map((p) => p.id), [1, 2]);
  eq('빈 값이면 전부', filterPosts(posts, '').length, 5);
  const c = countByKind(posts);
  eq('코트 양도 2', c[POST_KIND.COURT], 2);
  eq('공지 1', c[POST_KIND.NOTICE], 1);
  eq('자유 2 — 예전 글과 모르는 값이 여기로', c[POST_KIND.FREE], 2);
  eq('안 쓴 말머리는 0', c[POST_KIND.SQUAD], 0);
  /* 합이 전체와 같아야 한다. 어디에도 안 들어간 글이 있으면 그 글은
     목록에서 사라진다 — 숫자만 맞고 글이 없는 상태가 제일 찾기 어렵다. */
  eq('합이 전체와 같다',
    Object.values(c).reduce((a, b) => a + b, 0), posts.length);
}

console.log(`\n게시판 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
