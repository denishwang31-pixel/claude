/* ============================================================
   청백전(2팀·3팀) · 팀 리그 — 외부 공개 보기에 내보낼 모양

   2026-10-04 앱 주인: "회원이 다 오프라인이라 결과는 운영진이 넣는다 —
   실시간 결과를 웹 링크로 단톡방에 보내고 싶다". 조별리그·토너먼트·KDK 는
   groupLeague.liveView 가 이미 한다. 여기는 팀 대항 대회 몫.

   대회 문서 모양
     · 2팀 청백전·교류전 (stage 'team')   t.team   = { teamA:[선수], teamB:[선수], matches, opponentClub }
     · 3팀 청백전·팀 리그 (stage 'league') t.league = { teams:[{players}] (예전엔 [[선수]]), matches, config.teamNames }
   경기: { round, court, teamA:[id], teamB:[id], score:{a,b}|null, teamAIdx?, teamBIdx? }

   ⚠️ 내보내는 것: 팀 이름·색, 선수 이름, 타임·코트·유형·점수, 팀 순위. 그 밖의 회원 정보는 없다.
   ⚠️ 앱(src/lib/teamLeague.js)과 같은 규칙 — 순위는 승 → 게임 득실 → 득점, 유형은 실제 선 선수 성별로.
   ⚠️ 원본은 여기(src/lib) — 배포 직전에 scripts/copy-functions-shared.mjs 가 functions/shared/ 로 복사한다
      (functions/shared 는 생성물이라 저장소에 없다). 서버는 ./shared/teamLive.js 로 부른다.
   ⚠️ import 없이 혼자 선다 — 복사된 곳에서도 그대로 돌아야 한다. node 검사(scripts/test-league.mjs)가 돌려 본다.
   ============================================================ */

const PALETTE = ['#1d4ed8', '#be123c', '#0d7a5f', '#b45309', '#6d28d9', '#0f766e', '#a21caf', '#475569'];
const COLOR_WORDS = [
  [/^(청|파랑|파란|블루|blue)/i, '#1d4ed8'],
  [/^(홍|적|빨강|빨간|레드|red)/i, '#be123c'],
  [/^(녹|초록|그린|green)/i, '#0d7a5f'],
  [/^(황|노랑|노란|옐로|yellow)/i, '#b45309'],
  [/^(보라|퍼플|purple)/i, '#6d28d9'],
];
const WHITE = /^(백|흰|하양|화이트|white)/i;
const LETTERS = 'ABCDEFGH';

function teamStyle(name, i) {
  if (WHITE.test(name)) return { color: '#111827', white: true };
  const hit = COLOR_WORDS.find(([re]) => re.test(name));
  return { color: hit ? hit[1] : PALETTE[i % PALETTE.length], white: false };
}

/** 실제로 선 선수 성별로 유형 — 앱의 actualMatchType 과 같다 */
function actualType(m, genderOf) {
  const A = m.teamA || [];
  const B = m.teamB || [];
  const g = (id) => (genderOf(id) === 'F' ? 'F' : 'M');
  const all = [...A, ...B].map(g);
  if (A.length <= 1 && B.length <= 1) {
    if (all.every((x) => x === 'M')) return '남단식';
    if (all.every((x) => x === 'F')) return '여단식';
    return '혼성단식';
  }
  if (all.every((x) => x === 'M')) return '남복';
  if (all.every((x) => x === 'F')) return '여복';
  const mixed = (ids) => ids.length === 2 && new Set(ids.map(g)).size === 2;
  return mixed(A) && mixed(B) ? '혼복' : '잡복';
}

/** 타임 시작 시각 — 대회 문서 timing = { startTime:'HH:MM', roundMinutes } (앱 schedule.tournamentRoundTimes 와 같은 계산).
 *  시작 시간을 안 정했으면 '' */
function roundStart(timing, round) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timing?.startTime || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  const per = Math.min(180, Math.max(5, Number(timing.roundMinutes) || 30));
  const v = ((+m[1] * 60 + +m[2] + (Number(round) - 1) * per) % 1440 + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** 대회 문서 → 팀·경기 (2팀·3팀 공통 모양) */
export function teamsAndMatches(t) {
  if (t?.stage === 'league') {
    const lg = t.league || {};
    const teams = (lg.teams || []).map((x) => (Array.isArray(x) ? x : (x?.players || [])));
    const names = teams.map((_, i) => String(lg.config?.teamNames?.[i] || '').trim() || `${LETTERS[i] || i + 1}팀`);
    return { teams, names, matches: lg.matches || [] };
  }
  const tm = t?.team || {};
  const club = t?.format === 'club_match';
  return {
    teams: [tm.teamA || [], tm.teamB || []],
    names: club ? ['우리 클럽', String(tm.opponentClub || '').trim() || '상대 클럽'] : ['청팀', '백팀'],
    matches: (tm.matches || []).map((m) => ({ ...m, teamAIdx: m.teamAIdx ?? 0, teamBIdx: m.teamBIdx ?? 1 })),
  };
}

/** 외부 공개 보기 — /api/live 가 그대로 돌려준다 */
export function teamLiveView(t, clubName = '') {
  const { teams, names, matches } = teamsAndMatches(t || {});
  const people = {};
  teams.forEach((list) => (list || []).forEach((p) => { if (p?.id) people[p.id] = p; }));
  const nameOf = (id) => String(people[id]?.name || '');
  const genderOf = (id) => people[id]?.gender || '';
  const courtName = (c) => String((t?.courtNames || [])[Number(c) - 1] || '').trim() || String(c);

  const rows = teams.map((list, i) => ({
    idx: i, name: names[i], ...teamStyle(names[i], i), players: (list || []).length,
    played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0,
  }));
  matches.forEach((m) => {
    if (!m.score) return;
    const a = rows[m.teamAIdx];
    const b = rows[m.teamBIdx];
    if (!a || !b) return;
    const sa = Number(m.score.a) || 0;
    const sb = Number(m.score.b) || 0;
    a.played += 1; b.played += 1;
    a.gf += sa; a.ga += sb; b.gf += sb; b.ga += sa;
    if (sa > sb) { a.wins += 1; b.losses += 1; } else if (sb > sa) { b.wins += 1; a.losses += 1; } else { a.draws += 1; b.draws += 1; }
  });
  const standings = rows
    .map((r) => ({ ...r, diff: r.gf - r.ga }))
    .sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.gf - x.gf || x.idx - y.idx)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const byRound = {};
  const types = {};
  [...matches]
    .sort((x, y) => (Number(x.round) - Number(y.round)) || (Number(x.court) - Number(y.court)))
    .forEach((m) => {
      const type = actualType(m, genderOf);
      types[type] = (types[type] || 0) + 1;
      (byRound[m.round] = byRound[m.round] || []).push({
        court: courtName(m.court),
        c: Number(m.court) || 0,            // 대진표 열 순서(이름 말고 번호로 줄 세운다)
        type,
        aTeam: m.teamAIdx,
        bTeam: m.teamBIdx,
        a: (m.teamA || []).map(nameOf).join('·'),
        b: (m.teamB || []).map(nameOf).join('·'),
        score: m.score ? { a: Number(m.score.a) || 0, b: Number(m.score.b) || 0 } : null,
      });
    });

  return {
    kind: 'teams',
    name: String(t?.name || ''),
    date: String(t?.date || ''),
    club: String(clubName || ''),
    status: t?.status === 'finished' ? 'finished' : 'ongoing',
    stage: t?.stage || '',
    teams: rows.map(({ idx, name, color, white }) => ({ idx, name, color, white })),
    standings: standings.map(({ idx, name, color, white, players, played, wins, draws, losses, gf, ga, diff, rank }) => ({
      idx, name, color, white, players, played, wins, draws, losses, gf, ga, diff, rank,
    })),
    rounds: Object.keys(byRound).map(Number).sort((a, b) => a - b).map((r) => ({ round: r, time: roundStart(t?.timing, r), matches: byRound[r] })),
    total: matches.length,
    done: matches.filter((m) => m.score).length,
    types,
  };
}

/**
 * 설치 페이지(/app?code=초대코드)의 [실시간 경기 현황] — 그 클럽이 공개한 대회 목록
 * (2026-10-05 앱 주인: "설치 화면에 실시간 경기 현황 보기 링크도 같이").
 * 진행 중인 대회 먼저(날짜 가까운 순), 끝난 대회는 7일 안의 것만. 최대 5개.
 * ⚠️ 내보내는 것: 대회 이름·날짜·진행/종료·링크에 쓸 id 뿐. 명단·결과는 /live 가 따로 준다.
 * @param list   [{ id, ...대회 문서 }]  (publicView 가 켜진 것만 넘어오지만 여기서도 거른다)
 * @param today  'YYYY-MM-DD' (KST)
 */
export function publicTournamentList(list, today) {
  const day = (s) => Date.parse(`${String(s || '').slice(0, 10)}T00:00:00Z`) || 0;
  const t0 = day(today);
  const rows = (Array.isArray(list) ? list : [])
    .filter((t) => t && t.publicView === true && t.id)
    .map((t) => ({
      t: String(t.id),
      name: String(t.name || '대회'),
      date: String(t.date || ''),
      time: String(t.timing?.startTime || ''),
      status: t.status === 'finished' ? 'finished' : 'ongoing',
      ...(t.c ? { c: String(t.c), club: String(t.club || '') } : {}),
    }))
    .filter((r) => r.status === 'ongoing' || (t0 && day(r.date) && t0 - day(r.date) <= 7 * 86400000));
  const gap = (r) => Math.abs(day(r.date) - t0);
  rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'ongoing' ? -1 : 1) || gap(a) - gap(b) || b.date.localeCompare(a.date));
  return rows.slice(0, 5);
}

/**
 * 초대코드 없이 /app 만 열었을 때 — 어느 클럽인지 모르므로, 공개를 켠 대회 중 오늘 전후 하루 안의 것만
 * 클럽 이름과 함께(2026-10-05 앱 주인: "앱 다운로드 링크에서 클릭하면 들어갈 수 있게").
 * 날짜가 지난 '진행 중'(끝내기를 잊은 대회)이 끝없이 남지 않게 진행 여부와 상관없이 날짜로 자른다.
 * @param list   [{ id, c(클럽 id), club(클럽 이름), ...대회 문서 }]
 */
export function todayPublicTournaments(list, today) {
  const day = (s) => Date.parse(`${String(s || '').slice(0, 10)}T00:00:00Z`) || 0;
  const t0 = day(today);
  const near = (Array.isArray(list) ? list : []).filter((t) => t && t.c && day(t.date) && Math.abs(day(t.date) - t0) <= 86400000);
  return publicTournamentList(near, today);
}

export default { teamLiveView, teamsAndMatches, publicTournamentList, todayPublicTournaments };
