/* ============================================================
   게시판 말머리

   왜 말머리인가
     게시판 하나에 공지·잡담·코트 양도·대회 멤버 모집·회원 모집이 섞여
     쌓인다. 코트를 넘기려는 사람에게 급한 것은 "오늘 6시 양도" 한 줄인데,
     그게 잡담 스무 개 밑에 묻히면 아무도 못 본다. 양도는 시간이 지나면
     쓸모가 없어지는 글이라 특히 그렇다.

     게시판을 다섯 개로 쪼개지 않는 이유는, 글이 하루에 몇 개 안 올라오는
     클럽에서 빈 게시판 네 개를 보여 주면 "아무도 안 쓰는 앱"처럼 보이기
     때문이다. 하나에 모아 두고 말머리로 거른다.

   ⚠️ key 는 저장되는 값이다. 바꾸면 예전 글의 말머리가 사라진다.
      라벨은 화면 글자라 바꿔도 되지만 key 는 건드리지 않는다.

   ⚠️ 이 파일은 네이티브를 부르지 않는다 — node 로 도는 검사가 이
      판단을 전부 돌려 볼 수 있어야 한다.
   ============================================================ */

export const POST_KIND = {
  NOTICE: 'notice',      // 공지 — 운영진만
  FREE: 'free',          // 자유
  COURT: 'court',        // 코트 양도
  SQUAD: 'squad',        // 대회 참가 멤버 모집
  RECRUIT: 'recruit',    // 클럽 회원 모집
};

/**
 * 말머리 목록. 순서가 화면 순서다.
 *
 * adminOnly  운영진만 쓸 수 있는가
 * expires    날짜가 지나면 흐려지는가 — 양도·모집은 지난 글이 남아 있으면
 *            "이거 아직 유효한가요" 문의만 늘어난다
 * needsDate  날짜를 반드시 받아야 하는가
 */
export const POST_KINDS = [
  { key: POST_KIND.NOTICE, label: '공지', adminOnly: true, expires: false, needsDate: false },
  { key: POST_KIND.COURT, label: '코트 양도', adminOnly: false, expires: true, needsDate: true },
  { key: POST_KIND.SQUAD, label: '대회 멤버 모집', adminOnly: false, expires: true, needsDate: true },
  { key: POST_KIND.RECRUIT, label: '회원 모집', adminOnly: false, expires: false, needsDate: false },
  { key: POST_KIND.FREE, label: '자유', adminOnly: false, expires: false, needsDate: false },
];

/* ============================================================
   공개 범위

   ⚠️ 왜 필요한가
     게시판은 원래 클럽 안에서만 보였다(clubs/{clubId}/posts). 그런데
     여기 담기는 말머리 중 셋은 **밖에서 봐야 뜻이 있다**.
       · 클럽 회원 모집 — 우리 회원에게만 보이면 아무 의미가 없다
       · 코트 양도      — 우리 클럽이 안 쓰는 코트라서 넘기는 것이다
       · 대회 멤버 모집 — 한 팀이 모자라 밖에서 구하는 경우가 많다
     반대로 공지와 자유글은 클럽 안의 이야기라 밖에 나가면 안 된다.

   ⚠️ 예전 글은 전부 '우리 클럽만' 이다
     지금까지 올라온 글은 전부 "클럽 안에서만 보인다"는 전제로 쓰였다.
     공개를 기본값으로 잡으면 그 글들이 한순간에 전국에 열린다.
     그래서 audience 가 없는 글은 반드시 CLUB 으로 읽는다.
   ============================================================ */
export const AUDIENCE = { PUBLIC: 'public', CLUB: 'club' };

export const AUDIENCE_LABEL = {
  [AUDIENCE.PUBLIC]: '모든 클럽',
  [AUDIENCE.CLUB]: '우리 클럽만',
};

const BY_KEY = new Map(POST_KINDS.map((k) => [k.key, k]));

/** 모르는 값은 '자유'로 본다 — 예전 글과 잘못 저장된 값을 위해서다 */
export const kindOf = (key) => BY_KEY.get(String(key || '')) || BY_KEY.get(POST_KIND.FREE);

export const kindLabel = (key) => kindOf(key).label;

/**
 * 그 글의 공개 범위. 값이 없으면 '우리 클럽만'.
 *
 * ⚠️ 없을 때 공개로 읽으면 예전 글이 전부 밖으로 새어 나간다.
 *    모르면 **좁은 쪽**으로 읽는다 — 이 방향은 틀려도 되돌릴 수 있지만,
 *    반대 방향은 한 번 새면 되돌릴 수 없다.
 */
export const audienceOf = (post) =>
  (post?.audience === AUDIENCE.PUBLIC ? AUDIENCE.PUBLIC : AUDIENCE.CLUB);

/** 밖에 낼 수 있는 말머리인가 — 공지·자유는 클럽 안의 이야기다 */
export const canBePublic = (key) => {
  const k = kindOf(key).key;
  return k === POST_KIND.COURT || k === POST_KIND.SQUAD || k === POST_KIND.RECRUIT;
};

/** 그 말머리를 고르면 기본으로 어디까지 보일 것인가 */
export const defaultAudience = (key) =>
  (canBePublic(key) ? AUDIENCE.PUBLIC : AUDIENCE.CLUB);

/**
 * 저장하기 전에 공개 범위를 바로잡는다.
 *
 * ⚠️ 화면에서 말머리를 '코트 양도 + 공개'로 골라 두고 '공지'로 바꾸면
 *    공개인 채로 남는다. 그 상태로 저장하면 클럽 공지가 전국에 뜬다.
 *    화면이 실수해도 여기서 막는다 — 저장 직전에 한 번 더 본다.
 */
export const safeAudience = (key, audience) =>
  (canBePublic(key) && audience === AUDIENCE.PUBLIC ? AUDIENCE.PUBLIC : AUDIENCE.CLUB);

/** 이 사람이 쓸 수 있는 말머리 */
export const kindsFor = (isAdmin) => POST_KINDS.filter((k) => isAdmin || !k.adminOnly);

/** 그 말머리로 글을 쓸 수 있는가 — 화면과 저장 양쪽에서 같은 판단을 쓴다 */
export const canPost = (key, isAdmin) => {
  const k = BY_KEY.get(String(key || ''));
  return !!k && (isAdmin || !k.adminOnly);
};

/**
 * 날짜가 지나 쓸모없어진 글인가.
 *
 * ⚠️ 지우지 않는다. 글쓴이가 쓴 글을 앱이 말없이 없애면 안 되고,
 *    "어제 양도 글 누가 가져갔지"를 되짚을 일도 있다. 흐리게만 한다.
 */
export function isExpired(post, today) {
  if (!post || !kindOf(post.kind).expires) return false;
  const d = String(post.eventDate || '').trim();
  return !!d && d < String(today || '');
}

/**
 * 글 목록 정렬.
 *
 * 1) 고정(공지)이 맨 위
 * 2) 지난 글은 맨 아래 — 위에 있으면 유효한 줄 알고 연락한다
 * 3) 나머지는 최신 글부터
 *
 * ⚠️ date 는 '올린 날'이고 eventDate 는 '그 일이 있는 날'이다. 둘을
 *    섞으면 "내일 양도" 글이 지난주 글보다 아래로 내려간다.
 */
export function sortPosts(posts = [], today = '') {
  return [...posts].sort((a, b) => {
    const pin = (p) => (p.pinned ? 0 : 1);
    if (pin(a) !== pin(b)) return pin(a) - pin(b);
    const exp = (p) => (isExpired(p, today) ? 1 : 0);
    if (exp(a) !== exp(b)) return exp(a) - exp(b);
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
}

/**
 * 내가 볼 수 있는 글인가.
 *
 * 공개 글은 누구나, 클럽 전용 글은 그 클럽 사람만. 목록을 만들 때
 * 반드시 이걸 거쳐야 한다 — 다만 **화면에서 거르는 것만으로는
 * 부족하다**. 보안 규칙이 같은 판단을 해야 앱이 아닌 방법으로도
 * 막힌다(firestore.rules 참고).
 */
export const canSee = (post, myClubId) =>
  audienceOf(post) === AUDIENCE.PUBLIC || (!!myClubId && post?.clubId === myClubId);

/** 말머리로 거른다. 빈 값이면 전부. */
export const filterPosts = (posts = [], kind = '') =>
  (kind ? posts.filter((p) => kindOf(p.kind).key === kind) : [...posts]);

/** 말머리별 글 수 — 칩에 숫자를 붙여 "여기 뭐가 있나"를 알려 준다 */
export function countByKind(posts = []) {
  const out = {};
  POST_KINDS.forEach((k) => { out[k.key] = 0; });
  posts.forEach((p) => { out[kindOf(p.kind).key] += 1; });
  return out;
}

export default {
  POST_KIND, POST_KINDS, kindOf, kindLabel, kindsFor, canPost,
  AUDIENCE, AUDIENCE_LABEL, audienceOf, canBePublic, defaultAudience,
  safeAudience, canSee,
  isExpired, sortPosts, filterPosts, countByKind,
};
