/* 공개 대회 자동 갱신 — 모아 온 목록을 넣기 전에 거르는 판단 (src/lib/openSync.js) */
import {
  AUTO_SOURCE, normDate, normSido, nameKey, sameKey, autoId, cleanItem, planSync, seoulToday,
} from '../src/lib/openSync.js';

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

console.log(`\n대회 자동 갱신 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
