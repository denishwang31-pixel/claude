/* KATO 대회 목록 읽기 (src/lib/openParse.js) — 실제 사이트 모양(2026-10-01)을 줄여 옮긴 견본 */
import { katoNames, parseKatoHome, parseKatoGame, withKatoGame } from '../src/lib/openParse.js';
import { planSync } from '../src/lib/openSync.js';
let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('  ✗', m, '— 기대', JSON.stringify(b), '/ 실제', JSON.stringify(a)); } };

const card = (id, ribbon, name, div, dates) => `
  <div class="col-md-6 col-sm-6 service-wrap">
   <div class="service" onClick="location.href='/openGame/${id}'">
    ${ribbon ? `<div class="ribbon-wrapper ribbon-lg"><div class="ribbon bg-mixed text-lg">${ribbon}</div></div>` : ''}
    <div class="row"><div class="col-md-2 col-xs-2"><img src="/x.png" class="emblem" /></div>
     <div class="col-md-10 col-xs-10">
      <h3>${name}</h3>
      <div class="align-left lh">${div}</div>
      <div class="align-left lh">${dates}</div>
     </div></div></div></div>`;
const HOME = `<h2>경기중인 대회</h2>${card('0200', '경기중', '지난 대회..', '개나리부', '2026. 09. 01 ~ 2026. 09. 02')}
<h2 class="title">접수중인 대회</h2>
${card('0322', '부분접수중', '제1회 위닝컵 전국동호인테니스대회..', '개나리부, 마스터스부, 챌린저부', '2026. 09. 15 ~ 2026. 10. 09')}
${card('0330', '접수중', '제23회 서산시장배 서산6쪽마늘 전국동..', '개나리부, 국화부, 마스터스부', '2026. 10. 10 ~ 2026. 10. 17')}
${card('0331', '접수마감', '마감된 대회..', '개나리부', '2026. 10. 12 ~ 2026. 10. 12')}
<h2 class="title">접수예정 대회</h2>
${card('0340', '', '제27회 수원화성배 전국동호인테니스대회..', '개나리부, 국화부', '2026. 10. 28 ~ 2026. 11. 01')}`;
const LIST = `<a href="/openGame/0330">제23회 서산시장배 서산6쪽마늘 전국동호인테니스대회</a>
<a href="/openGame/0330">제23회 서산시장배 서산6쪽마늘 전국동...</a><a href="/openGame/0330">대회접수중</a>
<a href="/openGame/0340">제27회 수원화성배 전국동호인테니스대회</a>`;

const names = katoNames(LIST);
eq(names['0330'], '제23회 서산시장배 서산6쪽마늘 전국동호인테니스대회', '온전한 이름(줄인 이름·버튼 글자는 버림)');
const items = parseKatoHome(HOME, names);
eq(items.map((x) => x.link.split('/').pop()), ['0322', '0330', '0340'], '경기중 칸·마감 띠는 빼고 접수중·예정만');
eq(items[1].name, '제23회 서산시장배 서산6쪽마늘 전국동호인테니스대회', '1년 목록의 온전한 이름');
eq(items[0].name, '제1회 위닝컵 전국동호인테니스대회', '온전한 이름이 없으면 줄임표만 떼고');
eq([items[1].startDate, items[1].endDate], ['2026. 10. 10', '2026. 10. 17'], '대회 기간');
eq(items[1].divisions, ['개나리부', '국화부', '마스터스부'], '부서');
eq([items[1].signupStatus, items[2].signupStatus], ['', 'soon'], '접수중 / 접수예정');
eq(!!items[0].note, true, '부분접수중은 안내를 붙인다');
eq(items[2].link, 'https://kato.kr/openGame/0340', '요강 주소');
eq(parseKatoHome('<html>다른 모양</html>'), [], '모양이 바뀌면 빈 목록');

/* 앱에 들어갈 때 — 진행 중(위닝컵)은 빠지고, 예정은 「접수 예정」으로 */
const { upserts, skipped } = planSync({ found: items, existing: [], today: '2026-10-01' });
eq(upserts.map((u) => u.data.name.split(' ')[1]), ['서산시장배', '수원화성배'], '접수 중·예정만 넣는다');
eq(upserts[1].data.signupStatus, 'soon', '예정 표시가 남는다');
eq(skipped.length, 1, '이미 열리고 있는 대회는 건너뜀');

/* 요강 페이지(openGame) — 표 모양 그대로 줄여 옮김 */
const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
const sched = (div, when, st) => `<tr><td>${div}</td><td>${when}</td><td>화성 볼리테니스장 외</td><td><a>${st}</a> <a>참가목록</a> 151 / 96</td></tr>`;
const GAME_OPEN = `<div class="competition-title"><div class="group-title">제1회 위닝컵 전국동호인테니스대회</div></div>
<table>${row('장 소', '▣개나리부: 화성 엘리, 볼리 ▣챌린저부/마스터스부: 화성 엘리, 안산 에리카')}
${row('주 최', '위닝컵')}${row('주 관', '위닝컵 , (사)한국테니스발전협의회(KATO)')}
${row('접수개시 및<br>환불마감', '▣ 접수 개시일: 2026년 9월 4일(금) 여자부서 12시. 남자부서 13시<br>▣ 취소 및 환불 마감일: 개나리부, 챌린저부 2026년 9월 11일( 금 ) 17시 마감 .마스터스부 2026년 10월 2일 17시 **마감이후 취소,환불 불가함.')}
${row('참가비', '개인복식 팀당 54000원 [팀당 4천원 - 꿈나무육성기금]')}</table>
<h4>대회일정목록</h4><table>${sched('개나리부', '2026년 09월 15일 (화) 09:00', '접수마감')}
${sched('챌린저부', '2026년 09월 19일 (토) 09:00', '접수마감')}${sched('마스터스부', '2026년 10월 09일 (금) 09:00', '참가신청')}</table>`;
const GAME_SOON = `<div class="competition-title"></div><table>${row('장 소', '만석공원테니스장 외 보조구장')}
${row('주 최', '수원시테니스협회')}
${row('접수개시 및<br>환불마감', '▣ 접수 개시일 : 2026년 10월 8일 ·여자부서-12시 ·남자부서-13시 ·지역신인부(남/여)-14시<br>▣ 취소 및 환불 마감일 : 2026년 10월 21일(목) 15시 ※마감 이후 환불 불가.')}
${row('참가비', '개인복식 팀당 64,000원(팀당 4천원 - 꿈나무육성기금)')}</table><h4>대회일정목록</h4>`;

const g1 = parseKatoGame(GAME_OPEN);
eq(g1.host, '위닝컵', '주최');
eq(g1.place.startsWith('개나리부: 화성 엘리'), true, '장소(▣ 기호는 뺀다)');
eq([g1.signupFrom, g1.signupFromTime], ['2026-09-04', '12:00'], '접수 개시일 · 가장 이른 시각');
eq([g1.refundTo, g1.refundToTime], ['2026-10-02', '17:00'], '취소·환불 마감 — 부서마다 다르면 가장 늦은 날');
eq(g1.fee, 54000, '참가비');
eq(g1.closedDivisions, ['개나리부', '챌린저부'], '접수 마감된 부서');
const g2 = parseKatoGame(GAME_SOON);
eq([g2.place, g2.host], ['만석공원테니스장 외 보조구장', '수원시테니스협회'], '장소·주최');
eq([g2.signupFrom, g2.signupFromTime, g2.refundTo, g2.refundToTime], ['2026-10-08', '12:00', '2026-10-21', '15:00'], '접수 개시·환불 마감');
eq(g2.fee, 64000, '쉼표 있는 참가비');
eq(g2.closedDivisions, [], '아직 부서 표가 비었으면 마감 부서 없음');
eq(parseKatoGame('<html>다른 모양</html>'), {}, '모양이 바뀌면 아무것도 더하지 않는다');

const merged = withKatoGame(items[2], g2);
eq([merged.signupStatus, merged.signupFrom, merged.host, merged.org], ['', '2026-10-08', '수원시테니스협회', 'KATO'],
  '접수 시작일을 알면 날짜가 「접수 예정」을 대신한다 · 주최는 요강 값, 약칭은 KATO');
eq(withKatoGame(items[1], { closedDivisions: ['개나리부'] }).note, '접수 마감된 부서: 개나리부 — 나머지 부서는 신청 가능', '부서별 마감 안내');
eq(withKatoGame(items[1], null), items[1], '요강을 못 읽으면 그대로');

const { upserts: up2 } = planSync({ found: [withKatoGame(items[2], g2)], existing: [], today: '2026-10-01' });
eq([up2[0]?.data.refundTo, up2[0]?.data.refundToTime, up2[0]?.data.sido], ['2026-10-21', '15:00', '경기'],
  '앱에 들어갈 때 환불 마감·지역(이름에서 짐작)이 남는다');

console.log(`\nKATO 목록 읽기 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
