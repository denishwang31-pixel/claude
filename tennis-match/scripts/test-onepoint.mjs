/* 원포인트 — 선반·검색·시작 시각 판단 검사 (src/lib/onepoint.js) */
import {
  CATEGORIES, parseYouTubeId, thumbUrl, videoIdOf, parseStartAt, formatStart, catOf, ms,
  buildShelves, searchVideos, highlightParts, addRecent, suggestionsFor, nextInCategory,
  checkDraft, tipDoc, levelLabel, categoryCounts, inCategory, a11yLabel, oembedUrl,
  canManage, canPin, canUpload, legacyMoves, CATEGORY_ICON,
} from '../src/lib/onepoint.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`);

const ID = 'dQw4w9WgXcQ';
let seq = 0;
const V = (o = {}) => ({ id: `v${++seq}`, title: `영상${seq}`, category: '포핸드', url: `https://youtu.be/${ID}`, note: '', createdAt: seq * 1000, ...o });

console.log('[유튜브 주소]');
eq(parseYouTubeId(`https://youtu.be/${ID}`), ID, '단축 주소');
eq(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&t=42s`), ID, '일반 주소 + 시각');
eq(parseYouTubeId(`https://m.youtube.com/shorts/${ID}`), ID, '모바일 쇼츠');
eq(parseYouTubeId(`https://www.youtube.com/watch?feature=share&v=${ID}`), ID, 'v 가 뒤에 있어도');
eq(parseYouTubeId(`https://www.youtube.com/live/${ID}?si=x`), ID, '라이브');
eq(parseYouTubeId(`https://www.youtube-nocookie.com/embed/${ID}`), ID, 'nocookie 임베드');
eq(parseYouTubeId(`  https://youtu.be/${ID}  `), ID, '앞뒤 공백');
eq(parseYouTubeId('https://example.com/abc'), null, '유튜브가 아니면 null');
eq(parseYouTubeId('https://vimeo.com/12345678901'), null, '비메오');
eq(parseYouTubeId(''), null, '빈 값');
eq(parseYouTubeId(undefined), null, 'undefined');
eq(thumbUrl(ID), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`, '썸네일 주소');
eq(thumbUrl(null), null, '아이디 없으면 썸네일 없음');
eq(videoIdOf({ url: `https://youtu.be/${ID}` }), ID, '예전 영상은 주소에서 계산');
eq(videoIdOf({ videoId: 'AAAAAAAAAAA', url: `https://youtu.be/${ID}` }), 'AAAAAAAAAAA', '저장된 아이디 우선');
ok(oembedUrl('https://youtu.be/x?a=1&b=2').includes(encodeURIComponent('https://youtu.be/x?a=1&b=2')), 'oEmbed 주소는 인코딩');

console.log('[시작 시각]');
eq(parseStartAt(null, `https://www.youtube.com/watch?v=${ID}&t=42s`), 42, '?t=42s');
eq(parseStartAt(null, `https://youtu.be/${ID}?t=90`), 90, '?t=90');
eq(parseStartAt(null, `https://youtu.be/${ID}?t=1m30s`), 90, 't=1m30s');
eq(parseStartAt('3분부터 핵심'), 180, '3분부터');
eq(parseStartAt('1분 30초부터'), 90, '1분 30초부터');
eq(parseStartAt('2:05 참고'), 125, '2:05');
eq(parseStartAt('45초부터 보세요'), 45, '45초부터');
eq(parseStartAt('팔꿈치를 보세요'), null, '시각 없음');
eq(parseStartAt(''), null, '빈 메모');
eq(parseStartAt('3분부터', `https://youtu.be/${ID}?t=10`), 10, '주소의 시각이 우선');
eq(formatStart(180), '3:00부터 보기', '3:00 형식');
eq(formatStart(125), '2:05부터 보기', '2:05 형식');

console.log('[영역·시각]');
eq(catOf({ category: '서브' }), '서브', '아는 영역');
eq(catOf({ category: '레슨' }), '기타', '모르는 영역은 기타');
eq(catOf({}), '기타', '영역 없음은 기타');
eq(ms(null), Number.MAX_SAFE_INTEGER, '방금 올린 영상(서버 시각 없음)은 가장 새것');
eq(ms({ toMillis: () => 5 }), 5, 'Timestamp');
eq(ms({ seconds: 2 }), 2000, 'seconds 모양');
eq(ms(7), 7, '숫자');
eq(levelLabel('beginner'), '입문', '수준 이름');
eq(levelLabel('x'), '', '모르는 수준은 빈 칸');

console.log('[선반]');
eq(buildShelves([]).mode, 'empty', '0개 = 빈 상태');
{
  seq = 0;
  const one = buildShelves([V({ category: '백핸드' })]);
  eq(one.mode, 'shelves', '1개여도 선반(시안과 같은 화면)');
  eq(one.newest, [], '영역이 하나뿐이면 새로 올라온 영상 줄은 숨김(같은 줄 두 번)');
  eq(one.byCategory.map((x) => x.category), ['백핸드'], '영역 선반 하나');
  const two = buildShelves([V({ category: '백핸드' }), V({ category: '서브' })]);
  eq(two.newest.length, 2, '영역이 둘이면 새로 올라온 영상 줄이 생김');
}
{
  seq = 0;
  const vids = [
    V({ category: '포핸드', createdAt: 1 }),
    V({ category: '포핸드', createdAt: 9, pinned: false }),
    V({ category: '포핸드', createdAt: 2, pinned: true }),
    V({ category: '서브', createdAt: 5 }),
    V({ category: '레슨', createdAt: 4 }),          // 예전 영역 → 기타
    V({ category: '백핸드', createdAt: 8 }),
    V({ category: '백핸드', createdAt: null }),      // 방금 올림
  ];
  const s = buildShelves(vids, new Set(['v4']));
  eq(s.mode, 'shelves', '6개 이상 = 선반');
  eq(s.newest.length, 6, '새로 올라온 영상 6개');
  eq(s.newest[0].id, 'v7', '방금 올린 영상이 맨 앞');
  eq(s.saved.map((v) => v.id), ['v4'], '저장한 영상');
  eq(s.byCategory.map((x) => x.category), ['포핸드', '백핸드', '서브', '기타'], '영상 없는 영역은 선반째 숨김 · 영역 순서');
  eq(s.byCategory[0].items.map((v) => v.id), ['v3', 'v2', 'v1'], '선반 안: 추천 먼저, 그다음 최신');
  eq(s.byCategory[0].count, 3, '선반 개수');
  eq(s.byCategory[3].items.map((v) => v.id), ['v5'], '모르는 영역은 기타 선반에');
  eq(buildShelves(vids).saved, [], '저장 없으면 빈 선반');
  const many = Array.from({ length: 14 }, (_, i) => V({ category: '발리', createdAt: i }));
  const m = buildShelves(many).byCategory[0];
  eq([m.items.length, m.count], [10, 14], '선반에는 10개까지, 개수는 전체');
  eq(categoryCounts(vids).map((c) => `${c.category}${c.count}`), ['포핸드3', '백핸드2', '서브1', '기타1'], '영역별 개수');
  eq(inCategory(vids, '기타').length, 1, 'inCategory 도 기타 규칙');
}

console.log('[검색]');
{
  seq = 0;
  const vids = [
    V({ title: '한손 백핸드 슬라이스 기초', category: '백핸드', createdAt: 1 }),
    V({ title: '서브 토스', note: '슬라이스 서브 2분부터', category: '서브', createdAt: 2 }),
    V({ title: '스플릿 스텝 타이밍', category: '풋워크', createdAt: 3 }),
    V({ title: '포핸드 궤도', category: '포핸드', createdAt: 4 }),
    V({ title: 'Slice Approach', category: '발리', createdAt: 5 }),
  ];
  eq(searchVideos(vids, '슬라이스').map((v) => v.id), ['v1', 'v2'], '제목이 메모보다 앞');
  eq(searchVideos(vids, '스플릿스텝').map((v) => v.id), ['v3'], '띄어쓰기 무시');
  eq(searchVideos(vids, 'slice').map((v) => v.id), ['v5'], '대소문자 무시');
  eq(searchVideos(vids, '서브').map((v) => v.id), ['v2'], '제목·메모·영역 모두');
  eq(searchVideos(vids, '풋워크').map((v) => v.id), ['v3'], '영역 이름으로도');
  eq(searchVideos(vids, '   '), [], '빈 검색어는 결과 없음');
  eq(searchVideos(vids, '킥서브'), [], '없는 말');
  const tie = [V({ title: '토스 A', createdAt: 1 }), V({ title: '토스 B', createdAt: 2, pinned: true }), V({ title: '토스 C', createdAt: 3 })];
  eq(searchVideos(tie, '토스').map((v) => v.title), ['토스 B', '토스 C', '토스 A'], '같은 점수면 추천 → 최신');
}

console.log('[강조]');
eq(highlightParts('한손 백핸드 슬라이스 기초', '슬라이스'),
  [{ text: '한손 백핸드 ', hit: false }, { text: '슬라이스', hit: true }, { text: ' 기초', hit: false }], '가운데');
eq(highlightParts('Slice slice', 'SLICE').filter((p) => p.hit).length, 2, '대소문자 무시·여러 번');
eq(highlightParts('스플릿 스텝', '스플릿스텝'), [{ text: '스플릿 스텝', hit: false }], '띄어쓰기가 다르면 강조 없음');
eq(highlightParts('abc', ''), [{ text: 'abc', hit: false }], '빈 검색어');
eq(highlightParts('토스', '토스'), [{ text: '토스', hit: true }], '전체가 일치');

console.log('[최근 찾은 말·제안]');
eq(addRecent(['토스', '스핀'], '슬라이스'), ['슬라이스', '토스', '스핀'], '앞에 넣기');
eq(addRecent(['토스', '스핀'], '스 핀'), ['스 핀', '토스'], '겹치면 하나만(띄어쓰기 무시)');
eq(addRecent(['a', 'b', 'c', 'd', 'e'], 'f').length, 5, '5개까지');
eq(addRecent(['a'], '  '), ['a'], '빈 말은 안 넣음');
{
  seq = 0;
  const vids = [V({ category: '서브' }), V({ category: '서브' }), V({ category: '포핸드' })];
  eq(suggestionsFor('킥서브', vids, ['토스', '킥서브', '스핀', '발리', '로브']),
    [{ kind: 'category', category: '서브', count: 2 }, { kind: 'word', word: '토스' }, { kind: 'word', word: '스핀' }, { kind: 'word', word: '발리' }],
    '영역 먼저, 최근 말 3개(지금 검색어 빼고)');
  eq(suggestionsFor('발리 발리', vids, []), [], '영상 없는 영역은 제안 안 함');
}

console.log('[다음 영상]');
{
  seq = 0;
  const a = V({ category: '서브', createdAt: 3 });
  const b = V({ category: '서브', createdAt: 2 });
  const c = V({ category: '서브', createdAt: 1 });
  const d = V({ category: '발리', createdAt: 9 });
  const vids = [a, b, c, d];
  eq(nextInCategory(vids, a).next.id, b.id, '바로 다음');
  eq(nextInCategory(vids, c).next.id, a.id, '끝이면 처음으로');
  eq(nextInCategory(vids, a).others, 2, '같은 영역 다른 영상 수');
  eq(nextInCategory(vids, d).next, null, '혼자면 다음 없음');
  eq(nextInCategory(vids, null).next, null, '영상 없음');
}

console.log('[등록 검사]');
{
  seq = 0;
  const vids = [V({ category: '포핸드' })];
  const base = { url: 'https://youtu.be/AAAAAAAAAAA', title: '제목', category: '서브' };
  eq(checkDraft(base, vids).ok, true, '올바른 주소 + 제목 + 영역');
  eq(checkDraft({ ...base, title: '  ' }, vids).ok, false, '제목 없음');
  eq(checkDraft({ ...base, category: '' }, vids).ok, false, '영역 없음');
  eq(checkDraft({ ...base, url: 'https://naver.com' }, vids).urlError, true, '주소 틀림');
  eq(checkDraft({ ...base, url: '' }, vids).urlError, false, '빈 주소는 오류 표시 안 함');
  const dup = checkDraft({ ...base, url: `https://www.youtube.com/watch?v=${ID}` }, vids);
  eq([dup.ok, dup.dup && dup.dup.id], [false, 'v1'], '같은 영상은 막음(주소 모양이 달라도)');
  eq(checkDraft({ ...base, url: `https://youtu.be/${ID}` }, vids, 'v1').ok, true, '수정 중인 자기 자신은 중복 아님');
  const d = tipDoc({ ...base, title: ' 제목 ', note: ' 3분부터 ', level: '', pinned: 0 }, 'AAAAAAAAAAA');
  eq(d, { title: '제목', category: '서브', url: 'https://youtu.be/AAAAAAAAAAA', note: '3분부터', videoId: 'AAAAAAAAAAA', pinned: false }, '빈 수준은 적지 않음');
  eq(tipDoc({ ...base, level: 'advanced' }, 'x').level, 'advanced', '수준 저장');
  eq(tipDoc({ ...base, level: 'pro' }, 'x').level, undefined, '모르는 수준은 버림');
}

console.log('[권한]');
{
  const mine = { createdBy: 'c1' };
  const other = { createdBy: 'boss' };
  eq(canManage(other, { me: 'boss', isAppAdmin: true }), true, '앱 운영자는 전부');
  eq(canManage(mine, { me: 'c1', isCoach: true }), true, '코치는 자기 영상');
  eq(canManage(other, { me: 'c1', isCoach: true }), false, '코치는 남의 영상 못 건드림');
  eq(canManage(mine, { me: 'c1', isCoach: false }), false, '승인이 풀린 코치는 못 건드림');
  eq(canManage(mine, { me: null, isAppAdmin: true }), false, '로그인 없음');
  eq(canPin({ isAppAdmin: false }), false, '추천은 앱 운영자만');
  eq(canPin({ isAppAdmin: true }), true, '앱 운영자 추천');
  eq(canUpload({ isCoach: true }), true, '승인 코치 등록');
  eq(canUpload({}), false, '일반 회원·클럽 운영진은 등록 못 함');
}

console.log('[예전 클럽 영상 옮기기]');
{
  const cur = [{ url: `https://youtu.be/${ID}` }];
  const legacy = [
    { id: 't1', url: `https://www.youtube.com/watch?v=${ID}` },   // 이미 있음
    { id: 't2', url: 'https://youtu.be/BBBBBBBBBBB' },
    { id: 't3', url: 'https://youtu.be/BBBBBBBBBBB' },            // 같은 클럽 안 중복
    { id: 't4', url: 'https://naver.com' },                        // 유튜브 아님
  ];
  const m = legacyMoves(legacy, cur);
  eq(m.copy.map((x) => x.id), ['t2'], '없는 영상만 한 번 옮김');
  eq(m.drop.map((x) => x.id), ['t1', 't3', 't4'], '나머지는 지우기만');
}

console.log('[영역별로 보기 그림]');
{
  let glyphs = null;
  try { glyphs = JSON.parse(readFileSync(new URL('../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json', import.meta.url), 'utf8')); } catch (e) { glyphs = null; }
  ok(!!glyphs, '아이콘 목록을 읽었다(npm ci 필요)');
  CATEGORIES.forEach((c) => ok(glyphs && CATEGORY_ICON[c] in glyphs, `${c} 그림 '${CATEGORY_ICON[c]}' 이(가) 실제로 있다 — 없으면 「?」로 나온다`));
}

console.log('[읽기 문구]');
eq(a11yLabel({ title: '토스', category: '서브', level: 'beginner' }, true), '토스, 서브, 입문, 봤어요', '제목, 영역, 수준, 봤어요');
eq(a11yLabel({ title: '토스', category: '서브' }, false), '토스, 서브', '없는 것은 빼고');
ok(CATEGORIES.length === 8 && CATEGORIES[CATEGORIES.length - 1] === '기타', '영역 8개, 기타가 끝');

console.log(`\n원포인트 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
