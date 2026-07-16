/* ============================================================
   디자인 토큰 — 화면 전반에서 C.* 로 참조.
   원본 프로토타입의 emerald/lime/stone 팔레트를 RN hex 로 이식.
   ============================================================ */
export const C = {
  // 브랜드(딥그린 + 라임)
  ink: '#022c22',     // emerald-950  — 다크 헤더/카드 배경
  green: '#064e3b',   // emerald-900  — 강조 배경
  green2: '#047857',  // emerald-700  — 보조 강조/링크
  lime: '#bef264',    // lime-300     — 다크 위 텍스트/포인트
  lime2: '#a3e635',   // lime-400     — 프로그레스/버튼

  // 중립
  bg: '#fafaf9',      // stone-50     — 화면 배경
  text: '#292524',    // stone-800    — 본문
  sub: '#78716c',     // stone-500    — 보조 텍스트
  faint: '#a8a29e',   // stone-400    — 흐린 텍스트
  border: '#e7e5e4',  // stone-200    — 경계선

  danger: '#dc2626',  // red-600

  // 성별 아바타
  male: '#075985',    // sky-800
  maleBg: '#f0f9ff',  // sky-50
  female: '#be123c',  // rose-700
  femaleBg: '#fff1f2',// rose-50
};

export default C;
