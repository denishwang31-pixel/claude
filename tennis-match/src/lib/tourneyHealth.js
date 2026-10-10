/* ============================================================
   대회 점검 — 끝난 대회(또는 진행 중)가 멀쩡한지 숫자로 본다

   2026-10-09 앱 주인: "어제 경기 마무리 했는데 이상 없었는지 검토해줘".
   관리자 workflow 「테니스매치 앱 관리자」 action=tourney-check 가 쓴다(scripts/app-admin.cjs).
   ⚠️ 그 로그는 공개 저장소의 Actions 로그다 — 여기서는 숫자만 돌려준다(회원 이름·id 없음).
   ⚠️ import 없이 혼자 선다(관리자 스크립트가 바로 읽는다).
   ============================================================ */

/** 청백전(2팀·교류전) · 팀 리그(3팀+) 대회 → 팀·경기 (teamLive.teamsAndMatches 와 같은 모양) */
function teamsOf(t) {
  if (t?.stage === 'league') {
    const lg = t.league || {};
    return {
      teams: (lg.teams || []).map((x) => (Array.isArray(x) ? x : (x?.players || []))),
      unassigned: lg.unassigned || [],
      matches: lg.matches || [],
    };
  }
  const tm = t?.team || {};
  return {
    teams: [tm.teamA || [], tm.teamB || []],
    unassigned: tm.unassigned || [],
    matches: (tm.matches || []).map((m) => ({ ...m, teamAIdx: m.teamAIdx ?? 0, teamBIdx: m.teamBIdx ?? 1 })),
  };
}

const okScore = (s) => s && [s.a, s.b].every((v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 99);

/**
 * @returns { kind, roster, teams:[인원], unassigned, games, done, left, lastRound, issues:{ 이름: 건수 } }
 *   issues — 0 이면 빠진다. 있으면 앱에서 그 대회를 열어 확인할 것
 */
export function tourneyHealth(t) {
  const team = t?.stage === 'league' || t?.stage === 'team';
  const out = { kind: team ? t.stage : String(t?.stage || '-'), roster: (t?.roster || []).length };
  if (!team) return { ...out, issues: {} };
  const { teams, unassigned, matches } = teamsOf(t);
  const ms = matches.filter(Boolean);
  const teamOf = {};
  teams.forEach((list, i) => (list || []).forEach((p) => { if (p?.id) teamOf[p.id] = i; }));
  const issues = {};
  const add = (k, n = 1) => { issues[k] = (issues[k] || 0) + n; };

  const seen = {};
  const ids = new Set();
  ms.forEach((m) => {
    if (m.id) { if (ids.has(m.id)) add('같은 경기 번호가 두 번'); ids.add(m.id); }
    if (m.score && !okScore(m.score)) add('점수 모양이 이상한 경기');
    if (m.teamAIdx === m.teamBIdx) add('같은 팀끼리 붙은 경기');
    [[m.teamA, m.teamAIdx], [m.teamB, m.teamBIdx]].forEach(([side, idx]) => (side || []).forEach((id) => {
      if (!(id in teamOf)) add('팀에 없는 사람이 들어간 자리');
      else if (teamOf[id] !== idx) add('다른 팀 사람이 들어간 자리');
      const k = `${m.round}|${id}`;
      if (seen[k]) add('한 타임에 두 경기 나간 자리');
      seen[k] = true;
    }));
    if (!(m.teamA || []).length || !(m.teamB || []).length) add('한쪽 사람이 비어 있는 경기');
  });
  const rosterIds = new Set((t.roster || []).map((p) => p?.id).filter(Boolean));
  const placed = Object.keys(teamOf).length + unassigned.length;
  if (rosterIds.size && placed < rosterIds.size) add('참가자인데 팀·미배정 어디에도 없는 사람', rosterIds.size - placed);

  const done = ms.filter((m) => m.score);
  return {
    ...out,
    teams: teams.map((l) => (l || []).length),
    unassigned: unassigned.length,
    games: ms.length,
    done: done.length,
    left: ms.length - done.length,
    lastRound: done.reduce((r, m) => Math.max(r, Number(m.round) || 0), 0),
    issues,
  };
}

export default { tourneyHealth };
