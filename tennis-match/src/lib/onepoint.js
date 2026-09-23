/* ============================================================
   원포인트 — 화면 밖에서 판단하는 것들 (선반·검색·시작 시각)

   화면(src/components/onepoint/)은 그리기만 하고, "무엇을 어느 순서로
   보여 줄지"는 전부 여기서 정한다. 그래야 scripts/test-onepoint.mjs 가
   휴대폰 없이 검사할 수 있다.

   ⚠️ 예전 영상(새 필드가 없는 것)도 똑같이 보여야 한다.
      videoId·level·pinned 는 모두 없을 수 있다. 없으면 읽을 때 계산하거나
      없는 대로 둔다.
   ============================================================ */
import { TIP_CATEGORIES } from './constants.js';

export const CATEGORIES = TIP_CATEGORIES;

export const NEWEST_COUNT = 6;
export const SHELF_MAX = 10;
export const RECENT_MAX = 5;

/** 수준 — 저장은 영어 키, 화면은 한글 */
export const LEVELS = [
  { key: 'beginner', label: '입문' },
  { key: 'intermediate', label: '중급' },
  { key: 'advanced', label: '상급' },
];
export const levelLabel = (k) => (LEVELS.find((l) => l.key === k) || {}).label || '';

/* React Native 의 URL 구현은 searchParams 가 빠져 있을 수 있어 정규식으로 읽는다. */
const YT_ID = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/;

export const parseYouTubeId = (url) => {
  const m = String(url || '').trim().match(YT_ID);
  return m ? m[1] : null;
};

export const thumbUrl = (id) => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);

/** 저장된 videoId 가 없으면(예전 영상) 주소에서 계산 */
export const videoIdOf = (v) => (v && v.videoId) || parseYouTubeId(v && v.url);

/** 제목을 채워 줄 oEmbed 주소. API 키가 필요 없다. */
export const oembedUrl = (url) =>
  `https://www.youtube.com/oembed?url=${encodeURIComponent(String(url || '').trim())}&format=json`;

/**
 * 메모나 주소에서 시작 시각(초)을 찾는다.
 * "3분부터", "1분 30초부터", "3:00", "?t=90", "t=1m30s"
 */
export function parseStartAt(note, url) {
  if (url) {
    const t = String(url).match(/[?&](?:t|start)=(?:(\d+)m)?(\d+)s?\b/);
    if (t) return (t[1] ? +t[1] * 60 : 0) + +t[2];
  }
  if (!note) return null;
  const s = String(note);
  const mmss = s.match(/(\d{1,2}):([0-5]\d)/);
  if (mmss) return +mmss[1] * 60 + +mmss[2];
  const ko = s.match(/(\d{1,2})\s*분(?:\s*(\d{1,2})\s*초)?\s*(?:부터|~|에서)/);
  if (ko) return +ko[1] * 60 + (ko[2] ? +ko[2] : 0);
  const sec = s.match(/(\d{1,3})\s*초\s*(?:부터|~)/);
  if (sec) return +sec[1];
  return null;
}

export const formatClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const formatStart = (s) => `${formatClock(s)}부터 보기`;

/** 목록에 없는 영역으로 적힌 옛 영상은 [기타]로 본다 — 안 그러면 어디서도 안 보인다 */
export const catOf = (v) => (CATEGORIES.includes(v && v.category) ? v.category : '기타');

/**
 * 등록 시각(밀리초).
 * ⚠️ 방금 올린 영상은 서버 시각이 아직 안 와서 비어 있다(null). 그걸
 *    0 으로 보면 방금 올린 게 맨 뒤로 간다. 가장 새것으로 본다.
 */
export function ms(t) {
  if (t == null) return Number.MAX_SAFE_INTEGER;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  const p = Date.parse(t);
  return Number.isNaN(p) ? 0 : p;
}

const byNew = (a, b) => ms(b.createdAt) - ms(a.createdAt);
export const byPinnedThenNew = (a, b) =>
  Number(!!b.pinned) - Number(!!a.pinned) || byNew(a, b);

/** 한 영역의 영상 — 추천 먼저, 그다음 최신 */
export const inCategory = (videos, c) =>
  (videos || []).filter((v) => catOf(v) === c).sort(byPinnedThenNew);

/** 영상이 있는 영역과 개수, 영역 순서대로 */
export function categoryCounts(videos) {
  return CATEGORIES
    .map((c) => ({ category: c, count: (videos || []).filter((v) => catOf(v) === c).length }))
    .filter((x) => x.count > 0);
}

/**
 * 첫 화면을 어떻게 그릴지.
 *   empty    영상 0개
 *   shelves  1개 이상 — 새로 올라온 영상 / 저장한 영상 / 영역별 선반
 *
 * 예전 명세는 5개 이하면 줄 목록으로 바꿨는데, 실제로 영상이 적은 첫
 * 단계에서 시안과 전혀 다른 화면이 나와 버렸다(앱 주인이 "시안과 너무
 * 다르다"). 개수와 상관없이 늘 같은 선반 화면을 쓴다.
 *
 * 「새로 올라온 영상」은 영상이 있는 영역이 두 개 이상일 때만 둔다.
 * 영역이 하나뿐이면 그 영역 선반과 똑같은 줄이 두 번 나온다.
 */
export function buildShelves(videos, savedIds = new Set()) {
  const all = videos || [];
  if (all.length === 0) return { mode: 'empty' };

  const saved = all.filter((v) => savedIds.has(v.id)).sort(byPinnedThenNew);
  const byCategory = CATEGORIES
    .map((c) => {
      const items = inCategory(all, c);
      return { category: c, count: items.length, items: items.slice(0, SHELF_MAX) };
    })
    .filter((s) => s.count > 0);
  const newest = byCategory.length >= 2 ? [...all].sort(byNew).slice(0, NEWEST_COUNT) : [];
  return { mode: 'shelves', newest, saved, byCategory };
}

/**
 * 이 영상을 고치거나 지울 수 있나.
 * 앱 운영자는 전부, 승인된 코치는 자기가 올린 것만(규칙과 같다).
 * 「추천」 표시는 앱 운영자만.
 */
export function canManage(v, { me, isAppAdmin, isCoach }) {
  if (!v || !me) return false;
  if (isAppAdmin) return true;
  return !!isCoach && v.createdBy === me;
}
export const canPin = ({ isAppAdmin }) => !!isAppAdmin;
export const canUpload = ({ isAppAdmin, isCoach }) => !!isAppAdmin || !!isCoach;

/**
 * 예전 자리(클럽별 tips)에서 옮길 영상.
 * 이미 같은 영상이 앱 전체에 있으면 옮기지 않고 지우기만 한다.
 * @returns {{ copy: [...], drop: [...] }}
 */
export function legacyMoves(legacy, current) {
  const have = new Set((current || []).map(videoIdOf).filter(Boolean));
  const copy = [];
  const drop = [];
  (legacy || []).forEach((t) => {
    const id = videoIdOf(t);
    if (!id || have.has(id)) { drop.push(t); return; }
    have.add(id);
    copy.push(t);
  });
  return { copy, drop };
}

/* 띄어쓰기·대소문자 무시 — "스플릿 스텝" = "스플릿스텝" */
export const norm = (s = '') => String(s || '').toLowerCase().replace(/\s+/g, '');

/** 제목(3) > 메모(2) > 영역(1) 순으로 점수를 매겨 찾는다 */
export function searchVideos(videos, q) {
  const k = norm(q);
  if (!k) return [];
  return (videos || [])
    .map((v) => ({
      v,
      score: (norm(v.title).includes(k) ? 3 : 0)
        + (norm(v.note).includes(k) ? 2 : 0)
        + (norm(catOf(v)).includes(k) ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byPinnedThenNew(a.v, b.v))
    .map((x) => x.v);
}

/**
 * 찾은 글자를 강조할 조각들.
 * ⚠️ 원문에 대소문자만 무시하고 그대로 들어 있을 때만 강조한다.
 *    띄어쓰기가 달라 찾아진 경우(스플릿스텝 → 스플릿 스텝)는 강조 없이
 *    보여 준다 — 어디를 칠할지 억지로 맞추면 엉뚱한 곳이 칠해진다.
 */
export function highlightParts(text, q) {
  const src = String(text || '');
  const key = String(q || '').trim().toLowerCase();
  if (!key) return [{ text: src, hit: false }];
  const low = src.toLowerCase();
  const out = [];
  let i = 0;
  for (;;) {
    const j = low.indexOf(key, i);
    if (j < 0) break;
    if (j > i) out.push({ text: src.slice(i, j), hit: false });
    out.push({ text: src.slice(j, j + key.length), hit: true });
    i = j + key.length;
  }
  if (i < src.length) out.push({ text: src.slice(i), hit: false });
  return out.length ? out : [{ text: src, hit: false }];
}

/** 최근 찾은 말 — 맨 앞에 넣고, 겹치면 하나만, 5개까지 */
export function addRecent(list, q) {
  const w = String(q || '').trim();
  if (!w) return list || [];
  return [w, ...(list || []).filter((x) => norm(x) !== norm(w))].slice(0, RECENT_MAX);
}

/**
 * 결과가 없을 때 눌러 볼 말.
 * 검색어에 영역 이름이 들어 있으면 그 영역을 먼저(영상이 있을 때만),
 * 그다음 최근 찾은 말 3개까지.
 */
export function suggestionsFor(q, videos, recent) {
  const k = norm(q);
  const cats = categoryCounts(videos)
    .filter((c) => k && k.includes(norm(c.category)))
    .map((c) => ({ kind: 'category', category: c.category, count: c.count }));
  const words = (recent || [])
    .filter((w) => norm(w) !== k)
    .slice(0, 3)
    .map((w) => ({ kind: 'word', word: w }));
  return [...cats, ...words];
}

/**
 * 재생 화면의 "다음 영상".
 * 같은 영역을 추천→최신 순으로 놓고 지금 영상 바로 다음 것. 끝이면 첫 영상,
 * 그게 지금 영상이면 없음. `others` = 같은 영역의 다른 영상 수.
 */
export function nextInCategory(videos, current) {
  if (!current) return { next: null, others: 0 };
  const list = inCategory(videos, catOf(current));
  const i = list.findIndex((v) => v.id === current.id);
  let next = i >= 0 ? list[i + 1] : list[0];
  if (!next) next = list[0];
  if (next && next.id === current.id) next = null;
  return { next: next || null, others: Math.max(0, list.filter((v) => v.id !== current.id).length) };
}

/**
 * 등록 시트 검사.
 * @returns {{ videoId, urlError, dup, ok }}
 *   urlError  주소가 적혔는데 유튜브 주소가 아님
 *   dup       같은 영상이 이미 있음(수정 중인 자기 자신은 빼고) → 그 영상
 */
export function checkDraft(draft, videos, editingId = null) {
  const url = String((draft && draft.url) || '').trim();
  const videoId = parseYouTubeId(url);
  const urlError = !!url && !videoId;
  const dup = videoId
    ? (videos || []).find((v) => v.id !== editingId && videoIdOf(v) === videoId) || null
    : null;
  const ok = !!videoId && !dup
    && !!String((draft && draft.title) || '').trim()
    && CATEGORIES.includes(draft && draft.category);
  return { videoId, urlError, dup, ok };
}

/** 저장할 문서. 비어 있는 선택 항목은 아예 적지 않는다(예전 영상과 모양을 맞춤). */
export function tipDoc(draft, videoId) {
  const out = {
    title: String(draft.title || '').trim(),
    category: draft.category,
    url: String(draft.url || '').trim(),
    note: String(draft.note || '').trim(),
    videoId,
    pinned: !!draft.pinned,
  };
  if (LEVELS.some((l) => l.key === draft.level)) out.level = draft.level;
  return out;
}

/** 화면 읽기 프로그램이 읽을 한 줄 — "제목, 영역, 수준, 봤어요" */
export function a11yLabel(v, watched) {
  return [v.title, catOf(v), levelLabel(v.level), watched ? '봤어요' : '']
    .filter(Boolean).join(', ');
}

export default {
  CATEGORIES, LEVELS, levelLabel, parseYouTubeId, thumbUrl, videoIdOf, oembedUrl,
  parseStartAt, formatClock, formatStart, catOf, ms, byPinnedThenNew, inCategory,
  categoryCounts, buildShelves, norm, searchVideos, highlightParts, addRecent,
  suggestionsFor, nextInCategory, checkDraft, tipDoc, a11yLabel, canManage, canPin, canUpload, legacyMoves,
};
