/* ============================================================
   디자인 토큰

   방향 (v2):
     · 화면은 밝게, 카드는 흰색 + 옅은 그림자로 띄운다 (요즘 앱 문법)
     · 헤더도 흰색. 브랜드 딥그린은 "포인트"로만 쓴다
       (예전엔 헤더 전체가 딥그린 + 라임 글씨였는데, 대비가 낮고 무거워 보였다)
     · 라임은 넓은 면적에 쓰지 않는다. 강조 배지·진행바 같은 작은 요소에만
     · 간격·라운드·타이포를 스케일로 고정해 화면마다 제각각이 되는 걸 막는다

   기존 화면 호환을 위해 예전 키(ink/green/lime/bg/text/sub/faint/border…)는
   그대로 남겨두었다. 새 화면은 아래 스케일(S/R/F/SHADOW)을 쓴다.
   ============================================================ */

export const C = {
  /* ---- 브랜드 ---- */
  ink: '#0b2e26',     // 가장 진한 그린 — 제목/다크 카드
  green: '#0d7a5f',   // 메인 — 버튼·활성 탭·강조
  green2: '#0f9d76',  // 보조 — 링크·아이콘
  greenSoft: '#e7f6f1', // 아주 옅은 그린 — 선택 배경·아이콘 타일
  lime: '#bef264',    // 포인트(작은 면적 전용)
  lime2: '#a3e635',

  /* ---- 중립 ---- */
  bg: '#f4f6f5',      // 화면 배경(카드가 떠 보이게 살짝 회색)
  surface: '#ffffff', // 카드/헤더
  text: '#1c1917',    // 본문
  sub: '#6b7280',     // 보조 텍스트
  faint: '#9ca3af',   // 흐린 텍스트/플레이스홀더
  border: '#e8eaed',  // 경계선
  fill: '#f3f4f6',    // 입력창·비활성 배경

  /* ---- 상태 ---- */
  danger: '#e11d48',
  dangerBg: '#ffe4e6',
  warn: '#d97706',
  warnBg: '#fef3c7',
  info: '#2563eb',
  infoBg: '#eff6ff',

  /* ---- 성별 ---- */
  male: '#1d4ed8',
  maleBg: '#eff6ff',
  female: '#be123c',
  femaleBg: '#fff1f2',
};

/** 간격 — 화면 여백은 S.lg(16)을 기본으로 */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/** 모서리 반경 */
export const R = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

/** 타이포 — 한글 가독성 기준으로 잡은 스케일 */
export const F = {
  h1: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  h3: { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: '500', color: C.text },
  bodyBold: { fontSize: 14, fontWeight: '700', color: C.text },
  label: { fontSize: 12, fontWeight: '700', color: C.sub },
  caption: { fontSize: 11, fontWeight: '500', color: C.faint },
  num: { fontSize: 20, fontWeight: '900', color: C.ink, letterSpacing: -0.5 },
};

/** 그림자 — 안드로이드는 elevation, iOS는 shadow* */
export const SHADOW = {
  none: {},
  sm: {
    shadowColor: '#0b2e26', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  md: {
    shadowColor: '#0b2e26', shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  lg: {
    shadowColor: '#0b2e26', shadowOpacity: 0.12, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
};

export default C;
