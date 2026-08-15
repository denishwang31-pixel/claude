#!/usr/bin/env node
/* ============================================================
   서울시 공공 테니스장 전수 수집 → src/lib/courtsSeoul.generated.js

   왜 이게 필요한가
     서울 공공 테니스장은 수백 곳이고 수시로 늘고 준다. 손으로 적으면
     금방 틀린 목록이 된다. 서울 열린데이터광장이 예약 정보를 그대로
     열어 두고 있으니 그걸 받아서 파일로 굽는다.

     여기서 받는 SVCID 로 예약 화면 주소가 완성된다:
       https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=<SVCID>
     사용자가 요구한 "구청 대문 말고 예약 화면이 딱 잡히게"가 이걸로 해결된다.

   쓰는 법
     1) http://data.seoul.go.kr 회원가입 → 인증키 발급(무료, 즉시)
     2) SEOUL_OPEN_API_KEY=발급받은키 node scripts/fetch-courts.mjs
     3) 생성된 파일이 앱에 자동 반영된다 (courtData.js 가 import 한다)

   경기도는 왜 없나
     시·군마다 예약 시스템이 따로여서 통합 API 가 없다. 경기 코트는
     src/lib/courtData.js 의 PUBLIC_COURTS 에 직접 적는다.
   ============================================================ */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEY = process.env.SEOUL_OPEN_API_KEY;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/courtsSeoul.generated.js');
const PAGE = 1000;   // API 1회 최대 건수

if (!KEY) {
  console.error(`
인증키가 없습니다.

  1) http://data.seoul.go.kr 에서 인증키를 발급받으세요 (무료).
  2) 아래처럼 실행하세요.

     Windows(cmd):  set SEOUL_OPEN_API_KEY=발급키 && node scripts/fetch-courts.mjs
     macOS/Linux :  SEOUL_OPEN_API_KEY=발급키 node scripts/fetch-courts.mjs
`);
  process.exit(1);
}

/** 체육시설 예약 목록을 페이지 단위로 전부 받아온다 */
async function fetchAll() {
  const rows = [];
  for (let start = 1; ; start += PAGE) {
    const url = `http://openapi.seoul.go.kr:8088/${KEY}/json/ListPublicReservationSport/${start}/${start + PAGE - 1}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — 인증키나 네트워크를 확인하세요`);
    const json = await res.json();
    const body = json.ListPublicReservationSport;
    if (!body) {
      const msg = json.RESULT?.MESSAGE || JSON.stringify(json).slice(0, 200);
      throw new Error(`응답 형식이 예상과 다릅니다: ${msg}`);
    }
    if (body.RESULT?.CODE && body.RESULT.CODE !== 'INFO-000') {
      throw new Error(`${body.RESULT.CODE} ${body.RESULT.MESSAGE}`);
    }
    const page = body.row || [];
    rows.push(...page);
    process.stdout.write(`\r받는 중… ${rows.length} / ${body.list_total_count}건`);
    if (rows.length >= (body.list_total_count || 0) || page.length < PAGE) break;
  }
  process.stdout.write('\n');
  return rows;
}

/** 표면 추정 — 시설명·설명에 적혀 있는 경우가 많다 */
function surfaceOf(text) {
  if (/인조\s*잔디|인조잔디/.test(text)) return '인조잔디';
  if (/클레이|앙투카|앙트카/.test(text)) return '클레이';
  if (/실내|indoor/i.test(text)) return '실내';
  return '하드';
}

/** "서울특별시 서초구 …" 주소에서 구·동을 뽑는다 */
function splitRegion(areaNm, addr) {
  const gungu = (addr || '').match(/([가-힣]+[구군시])/)?.[1] || areaNm || '';
  const dong = (addr || '').match(/([가-힣]+\d*[동읍면])/)?.[1] || '';
  return { gungu, dong };
}

const rows = await fetchAll();

/* 테니스장만 남긴다. 서비스명/장소명 어디에 들어 있을지 모르니 둘 다 본다. */
const tennis = rows.filter((r) =>
  /테니스/.test(`${r.SVCNM || ''} ${r.PLACENM || ''} ${r.MINCLASSNM || ''}`));

const seen = new Set();
const courts = tennis.map((r) => {
  const text = `${r.SVCNM || ''} ${r.PLACENM || ''} ${r.DTLCONT || ''}`;
  const { gungu, dong } = splitRegion(r.AREANM, r.PLACENM || r.SVCNM);
  return {
    sido: '서울',
    gungu,
    dong,
    name: (r.PLACENM || r.SVCNM || '').trim(),
    addr: (r.PLACENM || '').trim(),
    surface: surfaceOf(text),
    indoor: /실내/.test(text),
    courts: 0,
    operator: r.AREANM || '서울시 공공서비스예약',
    // 예약 화면 직행 — 사용자가 요구한 부분
    link: r.SVCID
      ? `https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=${r.SVCID}`
      : (r.SVCURL || ''),
    tel: r.TELNO || '',
    lat: Number(r.Y) || null,
    lng: Number(r.X) || null,
    svcId: r.SVCID || '',
  };
}).filter((c) => {
  if (!c.name || seen.has(c.svcId || c.name)) return false;
  seen.add(c.svcId || c.name);
  return true;
}).sort((a, b) => (a.gungu + a.name).localeCompare(b.gungu + b.name, 'ko'));

const file = `/* 자동 생성 — 직접 고치지 마세요.
   갱신: SEOUL_OPEN_API_KEY=<키> node scripts/fetch-courts.mjs
   출처: 서울 열린데이터광장 ListPublicReservationSport
   생성: ${new Date().toISOString().slice(0, 10)} · ${courts.length}건 */
export const SEOUL_COURTS = ${JSON.stringify(courts, null, 2)};
`;

writeFileSync(OUT, file, 'utf8');
console.log(`테니스장 ${courts.length}건 저장 → src/lib/courtsSeoul.generated.js`);
console.log(`구별: ${[...new Set(courts.map((c) => c.gungu))].join(', ')}`);
