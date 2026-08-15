/* ============================================================
   공공 테니스장 목록 — 앱에 내장하는 참조 데이터.

   왜 Firestore 가 아니라 코드에 넣나
     코트 목록은 클럽마다 다르지 않고 거의 바뀌지 않는다. 앱에 넣어 두면
     읽기 비용이 0이고, 오프라인에서도 뜨고, 화면이 즉시 그려진다.
     클럽이 직접 쓰는 코트는 이것과 별개로 [코트장 관리]에 등록한다.

   링크 정책 — 사용자가 "예약 화면이 딱 잡히게" 요구한 부분
     link      예약 화면으로 바로 가는 확인된 주소. 있으면 이걸 쓴다.
     searchUrl 운영 기관 예약 시스템에서 코트명을 검색한 결과 화면.
               정확한 주소를 모를 때 홈페이지 대문 대신 여기로 보낸다.
     기관 대문(예: www.seoul.go.kr)으로는 절대 보내지 않는다.

   목록을 늘리는 법
     서울은 `npm run courts:seoul` (서울 열린데이터광장 API) 로 전수 갱신한다.
     경기는 시·군마다 예약 시스템이 따로여서 통합 API 가 없다 — 아래 표에
     직접 추가한다. scripts/fetch-courts.mjs 주석 참고.
   ============================================================ */

import { SEOUL_COURTS } from './courtsSeoul.generated.js';

/** 코트 표면 — 검색 필터에 쓴다 */
export const SURFACE = { HARD: '하드', CLAY: '클레이', TURF: '인조잔디', INDOOR: '실내' };
export const SURFACE_FILTERS = [SURFACE.HARD, SURFACE.CLAY, SURFACE.TURF];

/* ---------- 예약 시스템별 검색 링크 만들기 ----------
   각 기관 예약 시스템의 "검색 결과" 주소를 코트명으로 채워 준다.
   대문이 아니라 그 코트가 나오는 화면에서 시작하게 하는 것이 목적. */
const YEYAK_SEOUL = (name) =>
  `https://yeyak.seoul.go.kr/web/search/selectPageListDetailSearchImg.do?searchKeyword=${encodeURIComponent(name)}`;
const GG_SHARE = (name) =>
  `https://share.gg.go.kr/search?keyword=${encodeURIComponent(name)}`;

/** 서울시 공공서비스예약 — 서비스 ID 를 알면 예약 화면으로 직행 */
export const yeyakUrl = (svcId) =>
  `https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=${svcId}`;

/* ============================================================
   코트 목록

   필드
     sido/gungu/dong  지역 3단계. dong 은 없으면 빈 문자열(그래도 검색된다)
     surface          하드 | 클레이 | 인조잔디
     indoor           실내 코트 여부
     courts           면수 (모르면 0)
     link             예약 화면 직행 주소 (확인된 것만)
     searchUrl        예약 시스템 검색 결과 (link 가 없을 때)
     operator         운영 기관 — 목록에 같이 보여 준다

   ⚠️ 여기 적힌 면수·주소는 바뀔 수 있다. 예약 전에 링크에서 확인할 것.
   ============================================================ */
export const PUBLIC_COURTS = [
  /* ---------------- 서울 ---------------- */
  {
    sido: '서울', gungu: '송파구', dong: '방이동', name: '올림픽공원 테니스장',
    addr: '서울 송파구 올림픽로 424', surface: SURFACE.HARD, indoor: false, courts: 16,
    operator: '국민체육진흥공단',
    link: 'https://www.ksponco.or.kr/online/tennis/index.do',
  },
  {
    sido: '서울', gungu: '중구', dong: '장충동', name: '장충테니스장',
    addr: '서울 중구 동호로 231', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '서울시설공단', searchUrl: YEYAK_SEOUL('장충테니스장'),
  },
  {
    sido: '서울', gungu: '강남구', dong: '삼성동', name: '봉은테니스장',
    addr: '서울 강남구 봉은사로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '강남구도시관리공단',
    link: 'https://life.gangnam.go.kr/fmcs/107',
  },
  {
    sido: '서울', gungu: '강남구', dong: '대치동', name: '탄천 테니스장',
    addr: '서울 강남구 탄천동로', surface: SURFACE.HARD, indoor: false, courts: 8,
    operator: '강남구도시관리공단', searchUrl: 'https://life.gangnam.go.kr/fmcs/104',
  },
  {
    sido: '서울', gungu: '강서구', dong: '가양동', name: '마루공원 테니스장',
    addr: '서울 강서구 양천로 700', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '서울시 공공서비스예약',
    link: yeyakUrl('S210205141719898815'),
  },
  {
    sido: '서울', gungu: '강서구', dong: '화곡동', name: '강서구민회관 테니스장',
    addr: '서울 강서구 곰달래로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '강서구시설관리공단', searchUrl: 'https://sports.gangseo.seoul.kr/fmcs/64',
  },
  {
    sido: '서울', gungu: '서초구', dong: '반포동', name: '반포종합운동장 테니스장',
    addr: '서울 서초구 신반포로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '서초구시설관리공단', searchUrl: YEYAK_SEOUL('반포 테니스장'),
  },
  {
    sido: '서울', gungu: '서초구', dong: '양재동', name: '양재시민의숲 테니스장',
    addr: '서울 서초구 매헌로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '서초구시설관리공단', searchUrl: YEYAK_SEOUL('양재 테니스장'),
  },
  {
    sido: '서울', gungu: '영등포구', dong: '여의도동', name: '여의도공원 테니스장',
    addr: '서울 영등포구 여의공원로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '영등포구시설관리공단', searchUrl: 'https://www.ycs.or.kr/fmcs/4',
  },
  {
    sido: '서울', gungu: '노원구', dong: '상계동', name: '노원구민의숲 테니스장',
    addr: '서울 노원구 동일로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '노원구서비스공단', searchUrl: YEYAK_SEOUL('노원 테니스장'),
  },
  {
    sido: '서울', gungu: '마포구', dong: '상암동', name: '월드컵공원 테니스장',
    addr: '서울 마포구 월드컵로', surface: SURFACE.HARD, indoor: false, courts: 8,
    operator: '서울시설공단', searchUrl: YEYAK_SEOUL('월드컵공원 테니스장'),
  },
  {
    sido: '서울', gungu: '광진구', dong: '구의동', name: '광진구민체육센터 테니스장',
    addr: '서울 광진구 아차산로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '광진구시설관리공단', searchUrl: YEYAK_SEOUL('광진 테니스장'),
  },
  {
    sido: '서울', gungu: '성동구', dong: '성수동', name: '살곶이체육공원 테니스장',
    addr: '서울 성동구 살곶이길', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '성동구도시관리공단', searchUrl: YEYAK_SEOUL('살곶이 테니스장'),
  },
  {
    sido: '서울', gungu: '양천구', dong: '신정동', name: '양천공원 테니스장',
    addr: '서울 양천구 목동동로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '양천구시설관리공단', searchUrl: YEYAK_SEOUL('양천 테니스장'),
  },
  {
    sido: '서울', gungu: '동작구', dong: '사당동', name: '까치산근린공원 테니스장',
    addr: '서울 동작구 사당로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '동작구시설관리공단', searchUrl: YEYAK_SEOUL('동작 테니스장'),
  },
  {
    sido: '서울', gungu: '은평구', dong: '진관동', name: '은평구민체육공원 테니스장',
    addr: '서울 은평구 진관길', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '은평구시설관리공단', searchUrl: YEYAK_SEOUL('은평 테니스장'),
  },
  {
    sido: '서울', gungu: '강동구', dong: '고덕동', name: '고덕천 테니스장',
    addr: '서울 강동구 고덕로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '강동구도시관리공단', searchUrl: YEYAK_SEOUL('강동 테니스장'),
  },
  {
    sido: '서울', gungu: '구로구', dong: '개봉동', name: '개웅산 테니스장',
    addr: '서울 구로구 개봉로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '구로구시설관리공단', searchUrl: YEYAK_SEOUL('구로 테니스장'),
  },
  {
    sido: '서울', gungu: '성북구', dong: '정릉동', name: '정릉 테니스장',
    addr: '서울 성북구 보국문로', surface: SURFACE.CLAY, indoor: false, courts: 4,
    operator: '성북구도시관리공단', searchUrl: YEYAK_SEOUL('성북 테니스장'),
  },
  {
    sido: '서울', gungu: '중랑구', dong: '묵동', name: '중랑구민체육센터 테니스장',
    addr: '서울 중랑구 동일로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '중랑구시설관리공단', searchUrl: YEYAK_SEOUL('중랑 테니스장'),
  },
  {
    sido: '서울', gungu: '관악구', dong: '신림동', name: '관악산 테니스장',
    addr: '서울 관악구 신림로', surface: SURFACE.CLAY, indoor: false, courts: 4,
    operator: '관악구시설관리공단', searchUrl: YEYAK_SEOUL('관악 테니스장'),
  },
  {
    sido: '서울', gungu: '도봉구', dong: '방학동', name: '도봉구민회관 테니스장',
    addr: '서울 도봉구 시루봉로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '도봉구시설관리공단', searchUrl: YEYAK_SEOUL('도봉 테니스장'),
  },

  /* ---------------- 경기 ----------------
     경기도는 시·군마다 예약 시스템이 다르다. 통합 API 가 없어서
     기관별 예약 페이지를 직접 연결한다. */
  {
    sido: '경기', gungu: '과천시', dong: '중앙동', name: '과천시민회관 테니스장',
    addr: '경기 과천시 중앙로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '과천도시공사', searchUrl: GG_SHARE('과천 테니스장'),
  },
  {
    sido: '경기', gungu: '성남시', dong: '분당구 야탑동', name: '탄천종합운동장 테니스장',
    addr: '경기 성남시 분당구 탄천로', surface: SURFACE.HARD, indoor: false, courts: 8,
    operator: '성남도시개발공사',
    link: 'https://res.isdc.co.kr/facilityList.do?facType=29',
  },
  {
    sido: '경기', gungu: '용인시', dong: '기흥구', name: '기흥구 체육시설 테니스장',
    addr: '경기 용인시 기흥구', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '기흥구청', link: 'https://www.giheunggu.go.kr/yiser/sisul.asp',
  },
  {
    sido: '경기', gungu: '광명시', dong: '철산동', name: '광명시민운동장 테니스장',
    addr: '경기 광명시 오리로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '광명도시공사', link: 'https://reserve.gmuc.co.kr',
  },
  {
    sido: '경기', gungu: '포천시', dong: '신읍동', name: '포천종합운동장 테니스장',
    addr: '경기 포천시 중앙로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '포천시통합예약',
    link: 'https://www.pcuc.kr/open_content/reservation/physical/stadium/rent_application_tennis.jsp',
  },
  {
    sido: '경기', gungu: '안양시', dong: '동안구 비산동', name: '평촌 테니스장',
    addr: '경기 안양시 동안구', surface: SURFACE.CLAY, indoor: false, courts: 6,
    operator: '안양도시공사', searchUrl: GG_SHARE('안양 테니스장'),
  },
  {
    sido: '경기', gungu: '수원시', dong: '팔달구 인계동', name: '수원종합운동장 테니스장',
    addr: '경기 수원시 팔달구 월드컵로', surface: SURFACE.HARD, indoor: false, courts: 8,
    operator: '수원도시공사', searchUrl: GG_SHARE('수원 테니스장'),
  },
  {
    sido: '경기', gungu: '고양시', dong: '일산동구 장항동', name: '고양종합운동장 테니스장',
    addr: '경기 고양시 일산서구 중앙로', surface: SURFACE.HARD, indoor: false, courts: 8,
    operator: '고양도시관리공사', searchUrl: GG_SHARE('고양 테니스장'),
  },
  {
    sido: '경기', gungu: '부천시', dong: '원미구 춘의동', name: '부천종합운동장 테니스장',
    addr: '경기 부천시 원미구 삼작로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '부천도시공사', searchUrl: GG_SHARE('부천 테니스장'),
  },
  {
    sido: '경기', gungu: '안산시', dong: '단원구 초지동', name: '안산와스타디움 테니스장',
    addr: '경기 안산시 단원구 화랑로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '안산도시공사', searchUrl: GG_SHARE('안산 테니스장'),
  },
  {
    sido: '경기', gungu: '의정부시', dong: '의정부동', name: '의정부종합운동장 테니스장',
    addr: '경기 의정부시 체육로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '의정부시시설관리공단', searchUrl: GG_SHARE('의정부 테니스장'),
  },
  {
    sido: '경기', gungu: '남양주시', dong: '다산동', name: '남양주종합운동장 테니스장',
    addr: '경기 남양주시 경춘로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '남양주도시공사', searchUrl: GG_SHARE('남양주 테니스장'),
  },
  {
    sido: '경기', gungu: '화성시', dong: '동탄', name: '화성종합경기타운 테니스장',
    addr: '경기 화성시 향남읍', surface: SURFACE.HARD, indoor: false, courts: 8,
    operator: '화성도시공사', searchUrl: GG_SHARE('화성 테니스장'),
  },
  {
    sido: '경기', gungu: '평택시', dong: '비전동', name: '평택종합운동장 테니스장',
    addr: '경기 평택시 경기대로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '평택도시공사', searchUrl: GG_SHARE('평택 테니스장'),
  },
  {
    sido: '경기', gungu: '시흥시', dong: '정왕동', name: '시흥종합운동장 테니스장',
    addr: '경기 시흥시 정왕대로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '시흥도시공사', searchUrl: GG_SHARE('시흥 테니스장'),
  },
  {
    sido: '경기', gungu: '파주시', dong: '금촌동', name: '파주스타디움 테니스장',
    addr: '경기 파주시 청암로', surface: SURFACE.HARD, indoor: false, courts: 6,
    operator: '파주도시관광공사', searchUrl: GG_SHARE('파주 테니스장'),
  },
  {
    sido: '경기', gungu: '김포시', dong: '사우동', name: '김포종합운동장 테니스장',
    addr: '경기 김포시 김포대로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '김포도시관리공사', searchUrl: GG_SHARE('김포 테니스장'),
  },
  {
    sido: '경기', gungu: '군포시', dong: '산본동', name: '군포시민체육광장 테니스장',
    addr: '경기 군포시 고산로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '군포도시공사', searchUrl: GG_SHARE('군포 테니스장'),
  },
  {
    sido: '경기', gungu: '하남시', dong: '신장동', name: '하남종합운동장 테니스장',
    addr: '경기 하남시 대청로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '하남도시공사', searchUrl: GG_SHARE('하남 테니스장'),
  },
  {
    sido: '경기', gungu: '구리시', dong: '교문동', name: '구리시민체육관 테니스장',
    addr: '경기 구리시 아차산로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '구리도시공사', searchUrl: GG_SHARE('구리 테니스장'),
  },
  {
    sido: '경기', gungu: '이천시', dong: '중리동', name: '이천종합운동장 테니스장',
    addr: '경기 이천시 부악로', surface: SURFACE.CLAY, indoor: false, courts: 4,
    operator: '이천시시설관리공단', searchUrl: GG_SHARE('이천 테니스장'),
  },
  {
    sido: '경기', gungu: '오산시', dong: '원동', name: '오산시민운동장 테니스장',
    addr: '경기 오산시 성호대로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '오산시시설관리공단', searchUrl: GG_SHARE('오산 테니스장'),
  },
  {
    sido: '경기', gungu: '의왕시', dong: '내손동', name: '의왕시민체육관 테니스장',
    addr: '경기 의왕시 오전동', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '의왕도시공사', searchUrl: GG_SHARE('의왕 테니스장'),
  },
  {
    sido: '경기', gungu: '양주시', dong: '남방동', name: '양주시민회관 테니스장',
    addr: '경기 양주시 부흥로', surface: SURFACE.HARD, indoor: false, courts: 4,
    operator: '양주도시공사', searchUrl: GG_SHARE('양주 테니스장'),
  },
];

/* ============================================================
   조회 헬퍼 — 화면은 이 함수들만 쓴다
   ============================================================ */

/* API 로 받아 온 서울 목록과 수기 목록을 합친다.
   이름이 겹치면 API 쪽(예약 화면 주소가 정확하다)을 남긴다. */
export const ALL_COURTS = (() => {
  const byName = new Map(PUBLIC_COURTS.map((c) => [c.sido + c.name, c]));
  SEOUL_COURTS.forEach((c) => byName.set(c.sido + c.name, c));
  return [...byName.values()];
})();

/** 코트 한 건을 눌렀을 때 열 주소. 확인된 예약 화면이 먼저다. */
export const courtLink = (c) => c.link || c.searchUrl || '';

/** 예약 링크가 "정확한 예약 화면"인지 "검색 결과"인지 */
export const linkKind = (c) => (c.link ? 'exact' : c.searchUrl ? 'search' : 'none');

/** 목록에 실제로 존재하는 시/도 (데이터가 없는 지역은 안 보여 준다) */
export const courtSidos = (list = ALL_COURTS) =>
  [...new Set(list.map((c) => c.sido))];

/** 그 시/도에 실제로 코트가 있는 시·군·구 */
export const courtGungus = (sido, list = ALL_COURTS) =>
  [...new Set(list.filter((c) => c.sido === sido).map((c) => c.gungu))];

/** 그 시·군·구에 실제로 코트가 있는 동 (빈 값은 제외) */
export const courtDongs = (sido, gungu, list = ALL_COURTS) =>
  [...new Set(list
    .filter((c) => c.sido === sido && c.gungu === gungu && c.dong)
    .map((c) => c.dong))];

/**
 * 코트 검색 — 지역은 위에서부터 좁혀 가고, 아래 단계를 안 고르면 그 위 전체를 본다.
 * (예: 시/도만 고르면 그 시/도 전부, 구까지 고르면 그 구 전부)
 * @param {{sido?, gungu?, dong?, surfaces?: string[], keyword?: string}} q
 */
export const searchCourts = (q = {}, list = ALL_COURTS) => {
  const { sido, gungu, dong, surfaces, keyword } = q;
  const kw = (keyword || '').trim();
  return list.filter((c) => {
    if (sido && c.sido !== sido) return false;
    if (gungu && c.gungu !== gungu) return false;
    if (dong && c.dong !== dong) return false;
    if (surfaces?.length && !surfaces.includes(c.surface)) return false;
    if (kw && !(`${c.name} ${c.addr} ${c.operator || ''}`).includes(kw)) return false;
    return true;
  });
};

/** 지역을 한 줄로 — "서울 서초구 반포동" */
export const courtRegionText = (c) =>
  [c.sido, c.gungu, c.dong].filter(Boolean).join(' ');
