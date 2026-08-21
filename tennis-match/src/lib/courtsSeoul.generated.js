/* 자동 생성 자리 — 아직 API 로 받지 않은 상태.

   서울 공공 테니스장 전수 목록은 아래 명령으로 채웁니다.
     SEOUL_OPEN_API_KEY=<발급키> node scripts/fetch-courts.mjs
   (인증키는 http://data.seoul.go.kr 에서 무료로 즉시 발급됩니다)

   비어 있는 동안에는 courtData.js 의 수기 목록만 검색됩니다.

   ⚠️ 받아 온 날짜를 같이 굽습니다.
      공공 코트는 수시로 늘고 줄며 예약 주소도 바뀝니다. 언제 받은
      값인지 모르면 "조용히 죽은 링크"를 몇 년이고 들고 있게 됩니다.
      날짜가 오래되면 코트 검색 화면이 그렇다고 알려 줍니다. */
export const SEOUL_COURTS_FETCHED_AT = '';
export const SEOUL_COURTS = [];
