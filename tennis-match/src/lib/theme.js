/* ============================================================
   디자인 토큰 v3 — "전문 서비스" 톤

   이전 버전의 문제
     · 라임(#bef264)을 배지·글자에 넓게 써서 화면이 형광으로 들떴다
     · 굵기 900을 남발해 숫자·제목이 뭉툭하게 보였다
     · 아이콘이 전부 이모지 — 상용 앱은 UI 아이콘에 이모지를 쓰지 않는다
       (아이콘은 src/components/Icon.jsx 의 벡터 아이콘으로 교체)

   v3 원칙
     · 색은 두 가지뿐: 짙은 그린(브랜드) + 차콜/그레이 중립. 나머지는 상태색
     · 형광 라임 제거. 다크 카드 위 포인트는 채도 낮춘 민트
     · 본문은 거의 검정, 보조는 회색 2단계 — 위계는 색이 아니라 굵기·크기로
     · 기존 키(ink/green/lime/…)는 값만 바꿔 유지 — 모든 화면이 자동으로 따라온다
   ============================================================ */

export const C = {
  /* ---- 브랜드 ---- */
  ink: '#1A2B24',      // 다크 카드/강조 배경 — 그린 기 도는 차콜
  green: '#0E6B4F',    // 주 액션 — 깊고 차분한 그린
  green2: '#0D8A66',   // 링크·보조 강조
  greenSoft: '#EAF4EF',// 선택 배경·아이콘 틴트 (아주 옅게)
  // 형광 라임은 폐기. 레거시 키는 다크 위 포인트/옅은 배지로 재정의
  lime: '#8FD6B8',     // 다크 카드 위 포인트 텍스트 (채도 낮춘 민트)
  lime2: '#BFE3D3',    // 다크 카드 위 보조

  /* ---- 중립 ---- */
  bg: '#F4F5F7',       // 화면 배경
  surface: '#FFFFFF',
  text: '#1B1F27',     // 본문 — 거의 검정
  sub: '#5B6470',      // 보조
  faint: '#98A0AB',    // 흐림/플레이스홀더
  border: '#E9EBEE',
  fill: '#F2F3F5',     // 입력창·비활성

  /* ---- 상태 ---- */
  danger: '#D6455D',
  dangerBg: '#FBEDF0',
  warn: '#B97D26',
  warnBg: '#FAF3E4',
  info: '#3563D9',
  infoBg: '#EFF3FC',

  /* ---- 성별 (구분용 — 낮은 채도) ---- */
  male: '#3A5FA8',
  maleBg: '#EEF2F9',
  female: '#B04A66',
  femaleBg: '#F9EFF2',
};

/** 간격 */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/** 모서리 반경 */
export const R = { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 };

/** 타이포 — 최대 굵기 800. 900 은 쓰지 않는다 */
export const F = {
  h1: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  h3: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: '400', color: C.text },
  bodyBold: { fontSize: 14, fontWeight: '600', color: C.text },
  label: { fontSize: 12, fontWeight: '600', color: C.sub },
  caption: { fontSize: 11.5, fontWeight: '400', color: C.faint },
  num: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
};

/** 그림자 — 옅게 한 단계만 */
export const SHADOW = {
  none: {},
  sm: {
    shadowColor: '#101828', shadowOpacity: 0.04, shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  md: {
    shadowColor: '#101828', shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  lg: {
    shadowColor: '#101828', shadowOpacity: 0.10, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
};

export default C;
