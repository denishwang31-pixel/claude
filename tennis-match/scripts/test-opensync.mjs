/* 공개 대회 자동 갱신 — 모아 온 목록을 넣기 전에 거르는 판단 (src/lib/openSync.js) */
import {
  AUTO_SOURCE, normDate, normSido, nameKey, sameKey, autoId, cleanItem, planSync, seoulToday,
} from '../src/lib/openSync.js';
import { clientOptions, explainApiError, runTournamentSync, SOURCES } from '../src/lib/tournamentSearch.js';
import { syncRunView } from '../src/lib/openTournament.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m} — 기대 ${JSON.stringify(b)} / 실제 ${JSON.stringify(a)}`);

const TODAY = '2026-09-25';

console.log('[날짜 읽기]');
eq(normDate('2026-10-03'), '2026-10-03', '그대로');
eq(normDate('2026.10.3'), '2026-10-03', '점 표기');
eq(normDate('2026/10/03(토)'), '2026-10-03', '슬래시·요일');
eq(normDate('2026년 10월 3일'), '2026-10-03', '한글 표기');
eq(normDate('2026. 10. 3.'), '2026-10-03', '띄어 쓴 점 표기');
eq(normDate('2026-02-30'), '', '없는 날은 버린다');
eq(normDate('10월 3일'), '', '연도 없으면 못 읽는다');
eq(normDate(null), '', 'null');

console.log('[시도 읽기]');
eq(normSido('서울특별시'), '서울', '긴 이름');
eq(normSido('경기도 수원시'), '경기', '뒤에 시가 붙어도');
eq(normSido('강원특별자치도'), '강원', '새 이름');
eq(normSido('전북특별자치도'), '전북', '새 이름');
eq(normSido('충남'), '충남', '짧은 이름');
eq(normSido('전국'), '', '모르는 값은 비운다(지역 칩에 엉뚱한 값이 안 생기게)');

console.log('[같은 대회 판별]');
eq(nameKey('제 5회 (사)KATO 오픈'), nameKey('제5회 사KATO오픈'), '띄어쓰기·괄호 무시');
eq(autoId({ name: '서울오픈', startDate: '2026.10.10' }), autoId({ name: '서울 오픈', startDate: '2026-10-10' }),
  '표기가 달라도 같은 대회는 같은 문서');
ok(autoId({ name: '서울오픈', startDate: '2026-10-10' }) !== autoId({ name: '서울오픈', startDate: '2026-10-11' }),
  '날짜가 다르면 다른 문서');
ok(/^auto_[0-9a-z]+$/.test(autoId({ name: 'x', startDate: '2026-10-10' })), '문서 id 모양');

console.log('[한 건 정리]');
{
  const good = { name: '  제3회 테스트오픈 ', sido: '경기도', startDate: '2026.10.20', endDate: '2026-10-20',
    signupFrom: '2026-09-20', signupTo: '2026-10-10', link: 'https://example.com/apply', divisions: '신인부, 개나리부', fee: '40000' };
  const { doc } = cleanItem(good, TODAY);
  ok(!!doc, '멀쩡한 대회는 들어간다');
  eq(doc?.name, '제3회 테스트오픈', '이름 앞뒤 공백 정리');
  eq(doc?.sido, '경기', '시도 짧게');
  eq(doc?.endDate, '', '하루짜리는 종료일 비움');
  eq(doc?.divisions, ['신인부', '개나리부'], '종별 쉼표를 배열로');
  eq(doc?.fee, 40000, '참가비 숫자로');
  eq(doc?.link, 'https://example.com/apply', '신청 링크');

  eq(cleanItem({ ...good, signupTo: '2026-09-24' }, TODAY).reason, '접수가 이미 끝남', '마감일이 지난 것은 안 넣는다');
  ok(!!cleanItem({ ...good, signupTo: TODAY }, TODAY).doc, '마감 당일은 넣는다');
  ok(!!cleanItem({ ...good, signupFrom: '2026-10-01' }, TODAY).doc, '접수 예정도 넣는다');
  eq(cleanItem({ ...good, name: '' }, TODAY).reason, '이름 없음', '이름 없으면 버림');
  eq(cleanItem({ ...good, startDate: '미정' }, TODAY).reason, '대회 날짜를 못 읽음', '날짜 없으면 버림');
  ok(!cleanItem({ ...good, signupTo: '2026-10-25' }, TODAY).doc, '접수가 대회보다 늦게 끝나면 요강 검사에 걸린다');
  eq(cleanItem({ ...good, link: 'javascript:alert(1)', sourceUrl: 'https://kato.kr/x' }, TODAY).doc?.link,
    'https://kato.kr/x', 'http 가 아닌 링크는 버리고 출처 주소로');
  eq(cleanItem({ ...good, link: '' , sourceUrl: '' }, TODAY).doc?.link, '', '링크가 전혀 없으면 빈 값(버튼이 안 나온다)');
  eq(cleanItem(null, TODAY).doc, null, 'null 도 버틴다');
}

console.log('[넣고 지울 것 정하기]');
{
  const A = { name: '가을오픈', startDate: '2026-10-20', signupTo: '2026-10-10', link: 'https://a.kr' };
  const B = { name: '겨울오픈', startDate: '2026-12-05', signupFrom: '2026-11-01', link: 'https://b.kr' };
  const MANUAL = { id: 'm1', name: '가 을 오픈', startDate: '2026-10-20' };        // 운영자가 손으로 넣은 같은 대회
  const LOCKED = { id: autoId(B), source: AUTO_SOURCE, locked: true, ...B };
  const DONE = { id: 'auto_old', source: AUTO_SOURCE, name: '여름오픈', startDate: '2026-08-01' };
  const CLOSED = { id: 'auto_closed', source: AUTO_SOURCE, name: '마감', startDate: '2026-10-01', signupTo: '2026-09-20' };
  const MANUAL_DONE = { id: 'm2', name: '지난 수동', startDate: '2026-08-01' };

  const p1 = planSync({ found: [A, B], existing: [], today: TODAY });
  eq(p1.upserts.map((u) => u.id), [autoId(A), autoId(B)], '처음엔 둘 다 넣는다');
  ok(p1.upserts.every((u) => u.data.source === AUTO_SOURCE), '자동 수집 표시가 붙는다');

  const p2 = planSync({ found: [A, B, { ...A, name: '가을 오픈' }], existing: [MANUAL], today: TODAY });
  ok(!p2.upserts.some((u) => u.id === autoId(A)), '운영자가 넣은 대회와 같으면 새로 안 만든다');
  ok(p2.skipped.some((x) => x.reason.includes('운영자')), '건너뛴 이유가 남는다');

  const p3 = planSync({ found: [B], existing: [LOCKED], today: TODAY });
  eq(p3.upserts, [], '운영자가 고쳐 잠근 대회는 덮어쓰지 않는다');

  const p4 = planSync({ found: [], existing: [DONE, CLOSED, MANUAL_DONE, LOCKED], today: TODAY });
  eq(p4.deletes, ['auto_old'], '끝난 자동 대회만 지운다 — 수동 대회·접수만 끝난 대회는 둔다');

  const p5 = planSync({ found: [A, A], existing: [], today: TODAY });
  eq(p5.upserts.length, 1, '한 번에 같은 대회가 두 번 와도 한 건');
  eq(planSync({ today: TODAY }).upserts, [], '아무것도 없어도 버틴다');
}

console.log('[한국 날짜]');
eq(seoulToday(new Date('2026-09-24T17:00:00Z')), '2026-09-25', 'UTC 17시 = 한국 02시, 다음 날');
eq(seoulToday(new Date('2026-09-24T14:59:00Z')), '2026-09-24', '한국 23:59 는 그날');

console.log('[Claude 클라이언트 설정]');
eq(clientOptions({ ANTHROPIC_API_KEY: 'k' }), { apiKey: 'k' }, '워크스페이스 ID 가 없으면 헤더를 붙이지 않는다');
eq(clientOptions({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_WORKSPACE_ID: ' wrkspc_1 ' }).defaultHeaders,
  { 'anthropic-workspace-id': 'wrkspc_1' }, '있으면 헤더로');
ok(/워크스페이스/.test(explainApiError({ status: 400, message: 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header' })),
  '워크스페이스 오류는 사람 말로');
ok(/401/.test(explainApiError({ status: 401, message: 'invalid x-api-key' })), '키가 틀리면 401 안내');
ok(!SOURCES.some((s) => /m\.ikata\.org/.test(s.url)), '없어진 KATA 모바일 공지(404)는 뺐다');

console.log('[공용 코드는 바깥 라이브러리를 부르지 않는다 — 서버 함수로 복사되므로]');
for (const f of ['tournamentSearch.js', 'openSync.js', 'openParse.js', 'openTournament.js', 'regions.js']) {
  const src = readFileSync(new URL(`../src/lib/${f}`, import.meta.url), 'utf8');
  const bad = [...src.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)].map((m) => m[1]).filter((x) => !/^\.\/(openSync|openParse|openTournament|regions)\.js$/.test(x));
  eq(bad, [], `${f} 의 import`);
}

console.log('[찾기 한 번 — 가짜 Claude·가짜 Firestore]');
{
  const fakeClient = {
    beta: { messages: {
      stream: () => ({ finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '보고서' }], usage: {} }) }),
      create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ tournaments: [{
        name: '가을 오픈', host: '', org: 'KATO', sido: '서울', gungu: '', place: '', startDate: '2026-10-20', endDate: '',
        signupFrom: '2026-09-20', signupTo: '2026-10-10', signupFromTime: '', signupToTime: '', divisions: ['신인부'], fee: 50000,
        link: 'https://example.com/a', sourceUrl: 'https://example.com', note: '' }] }) }] }),
    } },
  };
  const writes = [];
  const fakeDb = {
    collection: () => ({ get: async () => ({ docs: [] }), doc: (id) => ({ id }) }),
    batch: () => ({ set: (ref, data) => writes.push([ref.id, data.createdBy]), delete: () => {}, commit: async () => {} }),
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  const stages = [];
  const r = await runTournamentSync({
    client: fakeClient, db: fakeDb, FieldValue: { serverTimestamp: () => 'ts' }, today: TODAY,
    by: 'manual:u1', onStage: (s) => stages.push(s),
  });
  globalThis.fetch = realFetch;
  eq([r.found.length, r.added, r.updated], [1, 1, 0], '한 건 찾고 새로 넣음');
  eq(writes.map((w) => w[1]), ['manual:u1'], '누가 돌렸는지 남긴다');
  eq(stages, ['fetch', 'search', 'extract', 'write'], '단계 순서');
  ok(r.pages.every((p) => !p.ok && /TypeError/.test(p.note)), '사이트를 못 열어도 계속한다');
  const dry = [];
  fakeDb.batch = () => ({ set: () => dry.push(1), delete: () => {}, commit: async () => {} });
  globalThis.fetch = async () => { throw new TypeError('x'); };
  await runTournamentSync({ client: fakeClient, db: fakeDb, FieldValue: { serverTimestamp: () => 'ts' }, today: TODAY, dryRun: true });
  globalThis.fetch = realFetch;
  eq(dry.length, 0, '시험 실행은 쓰지 않는다');
}

console.log('[지금 찾기 상태 한 줄]');
{
  const NOW = 1_000_000_000_000;
  eq(syncRunView(null).text, '', '요청한 적 없으면 비움');
  ok(syncRunView({ status: 'requested', at: NOW - 1000 }, NOW).busy, '막 요청 — 찾는 중');
  ok(/웹에서/.test(syncRunView({ status: 'running', stage: 'search', startedAt: NOW - 60000 }, NOW).text), '단계 표시');
  const stale = syncRunView({ status: 'running', startedAt: NOW - 20 * 60000 }, NOW);
  ok(!stale.busy && /시간 초과/.test(stale.text), '15분 넘게 running 이면 끝난 것으로 — 버튼이 영영 잠기지 않게');
  eq(syncRunView({ status: 'done', added: 2, updated: 3, deleted: 0 }, NOW).text, '찾기 완료 · 새로 2건 · 갱신 3건', '완료 요약');
  ok(/실패 · 키/.test(syncRunView({ status: 'failed', reason: '키' }, NOW).text), '실패 이유');
  ok(/KATO/.test(syncRunView({ status: 'done', added: 3, updated: 0, warn: 'AI 찾기 실패 — KATO 목록만 반영(키)' }, NOW).text), 'AI 가 막혀 KATO 만 반영한 경우도 알린다');
}

console.log(`\n대회 자동 갱신 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
