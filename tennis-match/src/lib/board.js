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

const BY_KEY = new Map(POST_KINDS.map((k) => [k.key, k]));

/** 모르는 값은 '자유'로 본다 — 예전 글과 잘못 저장된 값을 위해서다 */
export const kindOf = (key) => BY_KEY.get(String(key || '')) || BY_KEY.get(POST_KIND.FREE);

export const kindLabel = (key) => kindOf(key).label;

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
  isExpired, sortPosts, filterPosts, countByKind,
};
