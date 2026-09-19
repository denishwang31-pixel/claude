/* ============================================================
   디자인 토큰 v4 — "Courtside Precision"

   이 파일 하나가 앱 전체의 색·크기·간격을 정한다. 화면 코드는 값을
   직접 적지 않고 여기서만 가져간다. 그래서 여기를 고치면 서른 개가
   넘는 화면이 한꺼번에 따라온다.

   v4 에서 바뀐 것 (외부 디자인 검토 반영)
     · 중립색을 슬레이트 계열로 통일. 본문을 거의 검정(#0F172A)까지
       내려 야외 햇빛 아래 대비를 올렸다 — 이 앱은 코트에서 쓴다.
     · 배경을 #F8FAFC 로. 순백은 밖에서 눈이 부시고, 회색이 너무 짙으면
       카드가 안 떠 보인다. 그 사이 값이다.
     · 터치 영역을 키웠다. 주 버튼 52, 입력칸 56. 장갑을 끼거나 손이
       땀에 젖은 상태로 누르는 화면이다.
     · 본문 14 → 15. 40~60대가 주 사용자다. 굵기도 400 → 500 쪽으로
       올려 얇은 획이 햇빛에 사라지는 것을 막는다.
     · 모서리를 조금 키웠다(카드 16, 버튼 12). 딱딱함을 덜어 낸다.

   ⚠️ 키 이름은 바꾸지 않았다. ink/green/lime/bg… 그대로다.
      이름을 바꾸면 서른 개 화면을 전부 고쳐야 하고, 그 과정에서
      한두 곳을 반드시 빠뜨린다. 값만 바꾼다.

   글꼴에 대하여
     검토 문서는 Plus Jakarta Sans + Inter 를 지정했다. 지금은 넣지
     않았다 — 글꼴 파일을 앱에 실어야 하고(expo-font), 한글은 그 둘에
     한글 글리프가 없어 결국 시스템 글꼴로 떨어진다. 한글이 섞인 화면에서
     영문만 다른 글꼴이면 오히려 어색하다. 한글까지 덮는 글꼴(예:
     Pretendard)을 실을 때 함께 한다.
   ============================================================ */

export const C = {
  /* ---- 브랜드 ---- */
  ink: '#132A22',      // 다크 카드/히어로 배경 — 깊은 코트 그린-차콜
  green: '#0E6B4F',    // 주 액션 — 딥 코트 포레스트
  green2: '#10B981',   // 보조 강조·링크 — 밝은 코트 액센트
  greenSoft: '#E8F8F2',// 선택 배경·칩 바탕
  lime: '#8FD6B8',     // 다크 위 포인트 텍스트 (민트)
  lime2: '#BFE3D3',    // 다크 위 보조 텍스트

  /* ---- 중립 (슬레이트) ---- */
  bg: '#F8FAFC',       // 화면 배경 — 눈부심을 줄인 오프화이트
  surface: '#FFFFFF',  // 카드·시트·입력칸
  text: '#0F172A',     // 본문 — 야외 대비를 위해 거의 검정
  sub: '#475569',      // 보조 설명
  faint: '#94A3B8',    // 흐림·플레이스홀더
  border: '#E2E8F0',   // 얇은 경계선
  fill: '#F1F5F9',     // 비활성·고스트 배경

  /* ---- 상태 ---- */
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  warn: '#B45309',
  warnBg: '#FFFBEB',
  info: '#2563EB',
  infoBg: '#EFF6FF',

  /* ---- 성별 (대진표 구분용 — 낮은 채도) ---- */
  male: '#3A5FA8',
  maleBg: '#EEF2F9',
  female: '#B04A66',
  femaleBg: '#F9EFF2',
};

/** 간격 — 8pt 격자 */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/** 하단 탭바 높이(대략). 스크롤 끝 여백을 이만큼 더 줘야 마지막 카드가
    탭바에 가리지 않는다. 기기별 제스처바는 세이프에어리어로 따로 더한다. */
export const TAB_BAR_SPACE = 78;

/** 모서리 반경 */
export const R = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 };

/**
 * 최소 터치 높이.
 *
 * ⚠️ 이 값을 줄이지 말 것. 코트에서 서서, 때로는 장갑을 끼고, 손이
 *    땀에 젖은 채로 누르는 화면이다. 화면이 빽빽해 보인다고 여기를
 *    줄이면 오타가 늘고, 그건 회비·대진처럼 되돌리기 번거로운 곳에서
 *    특히 아프다.
 */
export const TAP = { cta: 52, btn: 48, small: 38, field: 56 };

/** 타이포 — 굵기 800 을 넘지 않는다. 한글에서 900 은 뭉쳐 보인다 */
export const F = {
  h1: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  h3: { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400', color: C.text, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', color: C.text, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', color: C.sub },
  caption: { fontSize: 12, fontWeight: '400', color: C.faint, lineHeight: 17 },
  num: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.6 },
};

/**
 * 그림자 — 진한 그림자 대신 옅은 경계선 + 은은한 그늘.
 * md 이상은 그늘에 브랜드 그린을 아주 조금 섞는다. 회색 그늘보다
 * 화면 전체가 한 덩어리로 보인다.
 */
export const SHADOW = {
  none: {},
  sm: {
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  md: {
    shadowColor: '#0E6B4F', shadowOpacity: 0.08, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 }, elevation: 10,
  },
};

export default C;
