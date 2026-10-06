/* ============================================================
   대회 현황(대시보드) 계산 — 청백전(2팀·3팀) · 팀 리그

   2026-10-06 앱 주인이 보낸 엑셀 '대시보드' 시트를 앱으로 옮긴 것.
     · 진행: 끝난 경기 / 전체, 마지막으로 결과가 들어간 타임
     · 팀 순위: 승점(승 1 · 무 0.5 · 패 0) → 득실차 → 딴 게임
       ⚠️ 앱 주인: "승점 기준은 이번에만 — 출시 전에 승패·득실로 할지, 무승부 포함 승점으로 할지,
          아니면 고를 수 있게 둘지 한 번 더 정하자". 그래서 rule 로 받는다(기본 'points').
          'wins' = 예전 앱 기준(이긴 경기 → 득실차 → 딴 게임).
     · 종목별 승점(남복·여복·혼복…) · 맞대결 승점(행 팀 기준)
     · 개인 순위: 승률((승 + 무×0.5) ÷ 경기) → 득실차 → 딴 게임. 남녀 따로. 경기 없는 사람은 순위 없음
     · 오늘의 MVP: 남·여 1위
   ⚠️ import 없이 혼자 선다 — 서버(functions/shared)로 복사돼 공개 링크도 같은 계산을 쓴다.
   ============================================================ */

export const TEAM_RANK_RULE = 'points';   // 'points' | 'wins' — 위 주석
export const TYPE_ORDER = ['남복', '여복', '혼복', '잡복', '남단식', '여단식', '혼성단식'];

const ratio = (gf, ga) => (ga > 0 ? Math.round((gf / ga) * 100) / 100 : (gf > 0 ? null : 0));   // null = 무실점

/**
 * @param teams   [{ idx, players:[{ id, name, gender }] }]
 * @param matches [{ round, teamAIdx, teamBIdx, teamA:[id], teamB:[id], score:{a,b}|null, type }]
 * @param opts    { rule: 'points'|'wins', top: 5 }
 */
export function tourneyDashboard(teams, matches, { rule = TEAM_RANK_RULE, top = 5 } = {}) {
  const T = (teams || []).map((t, i) => ({ idx: t?.idx ?? i, players: t?.players || [] }));
  const ms = (matches || []).filter(Boolean);
  const done = ms.filter((m) => m.score);

  /* 진행 */
  const lastRound = done.reduce((r, m) => Math.max(r, Number(m.round) || 0), 0);
  const progress = { done: done.length, total: ms.length, lastRound };

  /* 팀 */
  const rows = {};
  T.forEach((t) => { rows[t.idx] = { idx: t.idx, players: t.players.length, played: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0 }; });
  const pt = (x, y) => (x > y ? 1 : x === y ? 0.5 : 0);
  done.forEach((m) => {
    const a = rows[m.teamAIdx]; const b = rows[m.teamBIdx];
    if (!a || !b) return;
    const sa = Number(m.score.a) || 0; const sb = Number(m.score.b) || 0;
    a.played += 1; b.played += 1;
    a.gf += sa; a.ga += sb; b.gf += sb; b.ga += sa;
    a.pts += pt(sa, sb); b.pts += pt(sb, sa);
    if (sa > sb) { a.w += 1; b.l += 1; } else if (sb > sa) { b.w += 1; a.l += 1; } else { a.d += 1; b.d += 1; }
  });
  const teamKey = (r) => (rule === 'wins' ? [r.w, r.diff, r.gf] : [r.pts, r.diff, r.gf]);
  const cmp = (ka, kb) => { for (let i = 0; i < ka.length; i += 1) { if (kb[i] !== ka[i]) return kb[i] - ka[i]; } return 0; };
  const sortedTeams = Object.values(rows)
    .map((r) => ({ ...r, diff: r.gf - r.ga, ratio: ratio(r.gf, r.ga) }))
    .sort((x, y) => cmp(teamKey(x), teamKey(y)) || x.idx - y.idx);
  const standings = sortedTeams.map((r, i) => {
    const prev = sortedTeams[i - 1];
    return { ...r, rank: prev && cmp(teamKey(prev), teamKey(r)) === 0 ? null : i + 1 };
  });
  standings.forEach((r, i) => { if (r.rank == null) r.rank = standings[i - 1].rank; });

  /* 종목별 승점 */
  const types = TYPE_ORDER.filter((ty) => ms.some((m) => m.type === ty))
    .concat([...new Set(ms.map((m) => m.type).filter((ty) => ty && !TYPE_ORDER.includes(ty)))]);
  const byType = types.map((ty) => {
    const pts = {};
    T.forEach((t) => { pts[t.idx] = 0; });
    const of = ms.filter((m) => m.type === ty);
    of.filter((m) => m.score).forEach((m) => {
      const sa = Number(m.score.a) || 0; const sb = Number(m.score.b) || 0;
      if (m.teamAIdx in pts) pts[m.teamAIdx] += pt(sa, sb);
      if (m.teamBIdx in pts) pts[m.teamBIdx] += pt(sb, sa);
    });
    return { type: ty, pts, done: of.filter((m) => m.score).length, total: of.length };
  });

  /* 맞대결 승점 — h2h[i][j] = i 팀이 j 팀을 상대로 딴 승점 */
  const h2h = {};
  T.forEach((a) => { h2h[a.idx] = {}; T.forEach((b) => { if (a.idx !== b.idx) h2h[a.idx][b.idx] = 0; }); });
  done.forEach((m) => {
    const sa = Number(m.score.a) || 0; const sb = Number(m.score.b) || 0;
    if (h2h[m.teamAIdx] && m.teamBIdx in h2h[m.teamAIdx]) h2h[m.teamAIdx][m.teamBIdx] += pt(sa, sb);
    if (h2h[m.teamBIdx] && m.teamAIdx in h2h[m.teamBIdx]) h2h[m.teamBIdx][m.teamAIdx] += pt(sb, sa);
  });

  /* 개인 */
  const P = {};
  T.forEach((t) => t.players.forEach((p) => {
    if (!p?.id) return;
    P[p.id] = { id: p.id, name: String(p.name || ''), gender: p.gender === 'F' ? 'F' : 'M', team: t.idx, games: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  }));
  done.forEach((m) => {
    const sa = Number(m.score.a) || 0; const sb = Number(m.score.b) || 0;
    [[m.teamA, sa, sb], [m.teamB, sb, sa]].forEach(([ids, gf, ga]) => (ids || []).forEach((id) => {
      const r = P[id];
      if (!r) return;
      r.games += 1; r.gf += gf; r.ga += ga;
      if (gf > ga) r.w += 1; else if (gf < ga) r.l += 1; else r.d += 1;
    }));
  });
  const pKey = (r) => [r.rate, r.diff, r.gf];
  const rankGroup = (g) => {
    const list = Object.values(P).filter((r) => r.gender === g)
      .map((r) => ({ ...r, pts: r.w + r.d * 0.5, diff: r.gf - r.ga, ratio: ratio(r.gf, r.ga), rate: r.games ? (r.w + r.d * 0.5) / r.games : 0 }));
    const played = list.filter((r) => r.games > 0).sort((x, y) => cmp(pKey(x), pKey(y)) || x.name.localeCompare(y.name, 'ko'));
    played.forEach((r, i) => { r.rank = i && cmp(pKey(played[i - 1]), pKey(r)) === 0 ? played[i - 1].rank : i + 1; });
    const idle = list.filter((r) => !r.games).sort((x, y) => x.name.localeCompare(y.name, 'ko')).map((r) => ({ ...r, rank: null }));
    return [...played, ...idle];
  };
  const players = { M: rankGroup('M'), F: rankGroup('F') };
  const topOf = (g) => players[g].filter((r) => r.rank != null && r.rank <= top);
  /* 공동 1위면 모두(승률·득실차·딴 게임이 같을 때) */
  const mvpOf = (g) => players[g].filter((r) => r.rank === 1);

  return {
    rule, progress, standings, byType, h2h, players,
    top: { M: topOf('M'), F: topOf('F') },
    mvp: { M: mvpOf('M'), F: mvpOf('F') },
  };
}

export const pct = (x) => `${Math.round((Number(x) || 0) * 1000) / 10}%`;
export const ratioText = (r) => (r === null ? '무실점' : (Number(r) || 0).toFixed(2));
export const ptsText = (p) => (Number.isInteger(p) ? String(p) : (Number(p) || 0).toFixed(1));

export default { tourneyDashboard, TEAM_RANK_RULE, TYPE_ORDER, pct, ratioText, ptsText };
