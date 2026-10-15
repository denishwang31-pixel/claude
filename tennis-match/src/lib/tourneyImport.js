/* ============================================================
   대회 엑셀 불러오기 — 참가자·팀·대진(점수는 선택)을 엑셀 양식으로

   2026-10-15 앱 주인: "대회할 때 참석 인원·대진표를 엑셀로 업로드하면 앱에 저장되게.
   그러려면 정해진 양식 템플릿 받기가 먼저 있어야 하고, 그 양식대로 저장해서 업로드".
   정한 것(같은 날): 팀 대항(청백전 2·3팀 · 팀 리그 · 교류전)만 · 이미 만든 대회에 채우기 ·
   점수 칸은 선택.

   흐름
     1) buildTemplate(t)  — 지금 대회 내용을 채운 양식(안내·참가자·대진 시트) → xlsxLite.writeXlsx
     2) 운영진이 PC 엑셀에서 고쳐 .xlsx 로 저장 → 휴대폰으로 받아 앱에서 고르기
     3) parseImport(시트, { t, members, personOf }) — 검사하고, 문제없으면 대회 문서에 쓸 patch
        (미리 보기를 보여 준 뒤 운영진이 [이대로 저장]을 눌러야 쓴다)

   사람 찾기(이름) — ① 지금 대회 참가자 ② 클럽 회원(이름이 같은 회원이 둘이면 막는다) ③ 없으면 게스트(성별 필요)
   교류전 상대 클럽 쪽 사람은 늘 게스트다(우리 회원과 이름이 같아도).
   ⚠️ 저장은 참가자·팀·대진을 통째로 바꾼다 — 실수하면 대회 화면의 [되돌리기(서버 백업)]로 되돌린다.
   ⚠️ 기기 기능을 부르지 않는다(검사·서버에서도 돈다). 파일 고르기·보내기는 TournamentImport.jsx.
   ============================================================ */
import { TOURNAMENT_FORMAT, TEAM_SIDES } from './constants.js';
import { cleanTeamName, teamLook, packLeague, MAX_TEAMS, MIN_TEAMS, BLUE_WHITE_RED } from './teamLeague.js';
import { makeGuest } from './groupLeague.js';
import { tourneyHealth } from './tourneyHealth.js';

export const SHEET = { guide: '안내', people: '참가자', draw: '대진' };
export const PEOPLE_HEAD = ['이름', '성별', '팀', '부수(선택)'];
export const DRAW_HEAD = ['타임', '코트', 'A선수1', 'A선수2', 'B선수1', 'B선수2', 'A점수', 'B점수'];
const OUR = '우리 클럽';

const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const teamKey = (s) => norm(s).replace(/팀$/, '');
const cellStr = (v) => (v === true ? 'TRUE' : v === false ? 'FALSE' : String(v ?? '').trim());
const genderOf = (v) => {
  const s = norm(v);
  if (['남', '남자', 'm', 'male', '男'].includes(s)) return 'M';
  if (['여', '여자', 'f', 'female', '女'].includes(s)) return 'F';
  return null;
};
const ko = (g) => (g === 'F' ? '여' : '남');

/** 이 대회가 쓰는 팀 이름·저장 자리 */
export function importTarget(t) {
  const format = t?.format;
  const club = format === TOURNAMENT_FORMAT.TEAM_CLUB;
  if (club) {
    return { kind: 'team', club: true, format, allowed: null, names: [OUR, String(t?.team?.opponentClub || '').trim() || '상대 클럽'] };
  }
  if (format === TOURNAMENT_FORMAT.TEAM_BLUE_WHITE) {
    return { kind: t?.stage === 'league' ? 'league' : 'team', blueWhite: true, format, allowed: BLUE_WHITE_RED, names: t?.stage === 'league' ? leagueNames(t) : ['청팀', '백팀'] };
  }
  return { kind: 'league', format, allowed: null, names: leagueNames(t) };
}
function leagueNames(t) {
  const lg = t?.league || {};
  const n = Math.max(MIN_TEAMS, (lg.teams || []).length);
  return Array.from({ length: n }, (_, i) => teamLook(i, lg.config?.teamNames).name);
}

/** 지금 대회의 팀·미배정·경기 (저장 모양 그대로 풀어서) */
function currentState(t) {
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

/* ============================================================
   1) 양식 만들기
   ============================================================ */
export function buildTemplate(t) {
  const target = importTarget(t);
  const { teams, unassigned, matches } = currentState(t);
  const hasTeams = teams.some((l) => (l || []).length);
  const names = target.names;
  const people = [];
  const seen = new Set();
  const push = (p, team) => {
    if (!p?.id || seen.has(p.id)) return;
    seen.add(p.id);
    people.push([p.name || '', ko(p.gender), team, p.busu || '']);
  };
  if (hasTeams) teams.forEach((list, i) => (list || []).forEach((p) => push(p, names[i] || teamLook(i).name)));
  unassigned.forEach((p) => push(p, ''));
  (t?.roster || []).forEach((p) => push(p, ''));

  const nameOf = {};
  [...teams.flat(), ...unassigned, ...(t?.roster || [])].forEach((p) => { if (p?.id) nameOf[p.id] = p.name || ''; });
  const draw = [...matches].filter(Boolean)
    .sort((a, b) => (Number(a.round) - Number(b.round)) || (Number(a.court) - Number(b.court)))
    .map((m) => {
      const A = (m.teamA || []).map((id) => nameOf[id] || '');
      const B = (m.teamB || []).map((id) => nameOf[id] || '');
      return [Number(m.round) || '', Number(m.court) || '', A[0] || '', A[1] || '', B[0] || '', B[1] || '',
        m.score ? Number(m.score.a) : '', m.score ? Number(m.score.b) : ''];
    });

  const teamRule = target.club
    ? `· 팀 칸: 「${OUR}」 또는 상대 클럽 이름(예: ${names[1]}). 상대 클럽 사람은 게스트로 들어갑니다.`
    : target.blueWhite
      ? '· 팀 칸: 청팀 · 백팀 (3팀이면 홍팀까지). 비우면 미배정.'
      : `· 팀 칸: 팀 이름(지금: ${names.join(', ')}). 새 이름을 쓰면 팀이 늘어납니다(최대 ${MAX_TEAMS}팀). 비우면 미배정.`;
  const guide = [
    [`Court 대회 양식 — ${t?.name || ''} (${t?.date || ''})`],
    [''],
    ['쓰는 법'],
    ['1. 「참가자」 시트에 한 줄에 한 명씩 적습니다. 지금 대회 내용이 미리 들어 있습니다.'],
    ['2. 「대진」 시트에 한 줄에 한 경기씩 적습니다. 복식은 선수1·2, 단식은 선수1만.'],
    ['3. 저장할 때 형식은 「Excel 통합 문서(.xlsx)」. 시트 이름과 첫 줄(제목 줄)은 바꾸지 마세요.'],
    ['4. 휴대폰으로 보낸 뒤 앱 → 대회 → ⚙️ 대회 운영 → 엑셀로 불러오기 → [엑셀 파일 고르기].'],
    ['   저장하기 전에 미리 보기가 나옵니다. 문제가 있으면 줄 번호와 함께 알려 줍니다.'],
    [''],
    ['참가자 시트'],
    ['· 이름: 앱의 회원 이름과 똑같이(띄어쓰기는 무시). 회원이 아니면 게스트로 들어갑니다 — 게스트는 성별을 꼭 적어 주세요.'],
    ['· 성별: 남 / 여'],
    [teamRule],
    ['· 부수: 게스트만 쓰입니다(회원은 앱에 있는 정보를 씁니다).'],
    [''],
    ['대진 시트'],
    ['· 타임·코트: 숫자(1, 2, 3 …). 같은 타임·코트에 두 경기를 넣을 수 없습니다.'],
    ['· A선수·B선수: 참가자 시트에 있는 이름. 한쪽은 같은 팀끼리, 양쪽은 다른 팀이어야 합니다.'],
    ['· A점수·B점수: 끝난 경기만(예: 6, 4). 아직 안 한 경기는 비워 둡니다.'],
    [''],
    ['⚠️ 올리면 이 대회의 참가자·팀·대진이 엑셀 내용으로 바뀝니다. 실수했으면 대회 화면의 「되돌리기(서버 백업)」로 되돌릴 수 있습니다.'],
  ];
  const teamList = target.club ? [OUR, names[1]] : target.blueWhite ? BLUE_WHITE_RED : names;
  return [
    { name: SHEET.guide, rows: guide, widths: [110], wrap: true },
    {
      name: SHEET.people, header: true, widths: [14, 6, 12, 10],
      rows: [PEOPLE_HEAD, ...people],
      lists: [{ col: 1, values: ['남', '여'], strict: true }, { col: 2, values: teamList, strict: !!target.blueWhite }],
    },
    { name: SHEET.draw, header: true, widths: [6, 6, 12, 12, 12, 12, 7, 7], rows: [DRAW_HEAD, ...draw] },
  ];
}

/** 파일 이름 — 대회 이름_양식.xlsx (파일에 못 쓰는 글자는 뺀다) */
export const templateFileName = (t) => `${String(t?.name || '대회').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || '대회'}_양식.xlsx`;

/* ============================================================
   2) 읽어서 검사하기
   ============================================================ */
/** 시트 찾기 — 이름 앞뒤 공백·대소문자 무시 */
function findSheet(sheets, name) {
  const k = Object.keys(sheets || {}).find((x) => norm(x) === norm(name));
  return k ? sheets[k] : null;
}
/** 제목 줄 찾기 — 첫 번째로 비어 있지 않은 줄. 제목 → 칸 번호 */
function headerOf(rows, want) {
  const r = (rows || []).findIndex((row) => (row || []).some((v) => cellStr(v)));
  if (r < 0) return { row: -1, col: {} };
  const col = {};
  (rows[r] || []).forEach((v, i) => {
    const h = norm(cellStr(v)).replace(/\(.*?\)/g, '');
    const hit = want.find((w) => norm(w).replace(/\(.*?\)/g, '') === h);
    if (hit && !(hit in col)) col[hit] = i;
  });
  return { row: r, col };
}

/**
 * @param sheets  readXlsx 결과 { 시트이름: [[칸]] }
 * @param opts    { t: 대회 문서(id 포함), members: 클럽 회원, personOf: (회원) → 명단 한 사람 }
 * @returns { errors:[문장], warnings:[문장], summary, patch|null }
 */
export function parseImport(sheets, { t, members = [], personOf = (m) => ({ id: m.id, name: m.name, gender: m.gender || 'M' }) } = {}) {
  const errors = [];
  const warnings = [];
  const fail = (s) => { if (errors.length < 40) errors.push(s); };
  const target = importTarget(t);
  const at = (sheet, r) => `[${sheet}] ${r + 1}번째 줄`;

  /* ---------- 참가자 ---------- */
  const pRows = findSheet(sheets, SHEET.people);
  if (!pRows) {
    fail(`「${SHEET.people}」 시트가 없습니다. 앱에서 받은 양식에 적어 올려 주세요(시트 이름은 바꾸지 마세요).`);
    return { errors, warnings, summary: null, patch: null };
  }
  const ph = headerOf(pRows, PEOPLE_HEAD);
  ['이름', '성별'].forEach((h) => { if (!(h in ph.col)) fail(`「${SHEET.people}」 시트 첫 줄에 「${h}」 칸이 없습니다.`); });
  if (errors.length) return { errors, warnings, summary: null, patch: null };

  const old = new Map();
  (t?.roster || []).forEach((p) => { if (p?.name) old.set(norm(p.name), p); });
  const activeMembers = (members || []).filter((m) => m && m.id && !m.deleted && m.status !== '탈퇴');
  const byName = new Map();
  activeMembers.forEach((m) => { const k = norm(m.name); byName.set(k, [...(byName.get(k) || []), m]); });

  const entries = [];       // { row, name, gender, team, busu }
  const rowOfName = new Map();
  pRows.slice(ph.row + 1).forEach((row, i) => {
    const r = ph.row + 1 + i;
    const name = cellStr(row?.[ph.col['이름']]).slice(0, 20);
    if (!name) return;
    const k = norm(name);
    if (rowOfName.has(k)) { fail(`${at(SHEET.people, r)}: 「${name}」이(가) ${rowOfName.get(k) + 1}번째 줄에도 있습니다.`); return; }
    rowOfName.set(k, r);
    const gRaw = cellStr(row?.[ph.col['성별']]);
    const gender = genderOf(gRaw);
    if (gRaw && !gender) fail(`${at(SHEET.people, r)}: 성별은 「남」 또는 「여」로 적어 주세요(지금: ${gRaw}).`);
    const teamRaw = '팀' in ph.col ? cleanTeamName(cellStr(row?.[ph.col['팀']])) : '';
    entries.push({ row: r, name, gender, team: teamRaw === '미배정' ? '' : teamRaw, busu: cellStr(row?.[ph.col['부수(선택)']]).slice(0, 10) });
  });
  if (!entries.length) fail(`「${SHEET.people}」 시트에 참가자가 한 명도 없습니다.`);

  /* 팀 이름 → 번호 */
  const teamNames = [];
  const teamIdx = (raw) => teamNames.findIndex((n) => teamKey(n) === teamKey(raw));
  if (target.club) {
    teamNames.push(OUR);
    const others = [...new Set(entries.map((e) => e.team).filter((x) => x && teamKey(x) !== teamKey(OUR)))];
    if (others.length > 1) fail(`교류전은 팀이 「${OUR}」와 상대 클럽 하나뿐입니다(지금 상대 쪽 이름: ${others.join(', ')}).`);
    teamNames.push(others[0] || target.names[1]);
  } else {
    /* 지금 쓰는 이름을 먼저(순서·색 유지), 새 이름은 나온 순서대로 */
    const used = entries.map((e) => e.team).filter(Boolean);
    const known = target.allowed || target.names;
    known.forEach((n) => { if (used.some((u) => teamKey(u) === teamKey(n))) teamNames.push(n); });
    used.forEach((u) => { if (teamIdx(u) < 0) teamNames.push(u); });
    if (target.blueWhite) {
      const bad = teamNames.filter((n) => !BLUE_WHITE_RED.some((x) => teamKey(x) === teamKey(n)));
      if (bad.length) fail(`청백전 팀 칸에는 청팀·백팀·홍팀만 쓸 수 있습니다(지금: ${bad.join(', ')}).`);
      /* 2팀이면 청·백, 3팀이면 청·백·홍 — 순서는 고정 */
      teamNames.sort((a, b) => BLUE_WHITE_RED.findIndex((x) => teamKey(x) === teamKey(a)) - BLUE_WHITE_RED.findIndex((x) => teamKey(x) === teamKey(b)));
    }
    if (teamNames.length > MAX_TEAMS) fail(`팀은 ${MAX_TEAMS}개까지입니다(지금 ${teamNames.length}개: ${teamNames.join(', ')}).`);
  }
  const blueWhiteThree = target.blueWhite && teamNames.length >= 3;
  const kind = target.blueWhite ? (blueWhiteThree ? 'league' : 'team') : target.kind;
  if (kind === 'team') {
    /* 2팀 화면은 팀이 둘로 정해져 있다 — 한 팀만 썼어도 두 칸을 둔다 */
    const fixed = target.club ? teamNames : ['청팀', '백팀'];
    if (target.blueWhite && teamNames.some((n) => teamKey(n) === teamKey('홍팀'))) fail('홍팀을 쓰려면 청팀·백팀도 함께 있어야 합니다.');
    teamNames.splice(0, teamNames.length, ...fixed);
  } else if (teamNames.length < MIN_TEAMS && entries.some((e) => e.team)) {
    warnings.push(`팀이 ${teamNames.length}개뿐입니다 — 대진을 짜려면 ${MIN_TEAMS}팀 이상이 필요합니다.`);
  }

  /* 사람 찾기 */
  const people = [];
  const idOfName = new Map();
  let nMember = 0; let nGuest = 0;
  entries.forEach((e) => {
    const k = norm(e.name);
    const opponent = target.club && e.team && teamKey(e.team) !== teamKey(OUR);
    let p = old.get(k) || null;
    if (p && opponent && !p.guest) p = null;            // 상대 클럽 쪽은 우리 회원이 아니다
    if (!p && !opponent) {
      const hits = byName.get(k) || [];
      if (hits.length > 1) { fail(`${at(SHEET.people, e.row)}: 「${e.name}」 이름의 회원이 ${hits.length}명입니다. 회원 이름을 서로 다르게 바꾼 뒤 올려 주세요.`); return; }
      if (hits.length === 1) p = personOf(hits[0]);
    }
    if (p) {
      p = { ...p };
      if (e.gender && p.gender && e.gender !== p.gender && !p.guest) {
        warnings.push(`${at(SHEET.people, e.row)}: 「${e.name}」 성별이 회원 정보(${ko(p.gender)})와 다릅니다 — 회원 정보를 씁니다.`);
      }
      if (p.guest) { if (e.gender) p.gender = e.gender; if (e.busu) p.busu = e.busu; }
    } else {
      if (!e.gender) { fail(`${at(SHEET.people, e.row)}: 「${e.name}」은(는) 회원이 아니라 게스트로 넣습니다 — 성별을 적어 주세요.`); return; }
      const g = makeGuest(e.name, opponent ? e.team : '');
      p = { ...g, gender: e.gender, busu: e.busu || '', grade: '', ntrp: null };
    }
    if (p.guest) nGuest += 1; else nMember += 1;
    if ([...idOfName.values()].includes(p.id)) { fail(`${at(SHEET.people, e.row)}: 「${e.name}」이(가) 다른 줄의 사람과 같은 사람으로 잡혔습니다.`); return; }
    idOfName.set(k, p.id);
    people.push({ p, team: e.team ? teamIdx(e.team) : -1, row: e.row });
  });

  const teams = teamNames.map(() => []);
  const unassigned = [];
  people.forEach(({ p, team }) => { if (team >= 0) teams[team].push(p); else unassigned.push(p); });
  const personById = {};
  people.forEach(({ p, team }) => { personById[p.id] = { p, team }; });

  /* ---------- 대진 ---------- */
  const matches = [];
  const dRows = findSheet(sheets, SHEET.draw);
  if (!dRows) warnings.push(`「${SHEET.draw}」 시트가 없어 대진 없이 참가자·팀만 넣습니다.`);
  else {
    const dh = headerOf(dRows, DRAW_HEAD);
    const need = ['타임', '코트', 'A선수1', 'B선수1'];
    const miss = need.filter((h) => !(h in dh.col));
    if (dh.row >= 0 && miss.length) fail(`「${SHEET.draw}」 시트 첫 줄에 ${miss.map((h) => `「${h}」`).join(' ')} 칸이 없습니다.`);
    else if (dh.row >= 0) {
      const slot = new Map();
      const busy = new Map();
      dRows.slice(dh.row + 1).forEach((row, i) => {
        const r = dh.row + 1 + i;
        const v = (h) => (h in dh.col ? row?.[dh.col[h]] : '');
        const names = ['A선수1', 'A선수2', 'B선수1', 'B선수2'].map((h) => cellStr(v(h)));
        if (!names.some(Boolean) && !cellStr(v('타임')) && !cellStr(v('코트'))) return;
        const where = at(SHEET.draw, r);
        const round = Number(cellStr(v('타임')));
        const court = Number(cellStr(v('코트')));
        if (!Number.isInteger(round) || round < 1 || round > 99) { fail(`${where}: 타임은 1 이상 숫자로 적어 주세요.`); return; }
        if (!Number.isInteger(court) || court < 1 || court > 99) { fail(`${where}: 코트는 1 이상 숫자로 적어 주세요.`); return; }
        const sk = `${round}|${court}`;
        if (slot.has(sk)) { fail(`${where}: ${round}타임 ${court}코트가 ${slot.get(sk) + 1}번째 줄과 겹칩니다.`); return; }
        slot.set(sk, r);
        const side = (a, b) => [a, b].filter(Boolean).map((n) => ({ n, id: idOfName.get(norm(n)) }));
        const A = side(names[0], names[1]);
        const B = side(names[2], names[3]);
        const unknown = [...A, ...B].filter((x) => !x.id).map((x) => x.n);
        if (unknown.length) { fail(`${where}: ${unknown.map((n) => `「${n}」`).join(', ')}이(가) 참가자 시트에 없습니다.`); return; }
        if (!A.length || !B.length) { fail(`${where}: A·B 양쪽에 선수가 있어야 합니다.`); return; }
        if (A.length !== B.length) { fail(`${where}: 한쪽은 ${A.length}명, 다른 쪽은 ${B.length}명입니다(복식은 2명씩, 단식은 1명씩).`); return; }
        const ids = [...A, ...B].map((x) => x.id);
        if (new Set(ids).size !== ids.length) { fail(`${where}: 같은 사람이 한 경기에 두 번 들어 있습니다.`); return; }
        const tA = [...new Set(A.map((x) => personById[x.id].team))];
        const tB = [...new Set(B.map((x) => personById[x.id].team))];
        const noTeam = [...A, ...B].filter((x) => personById[x.id].team < 0).map((x) => x.n);
        if (noTeam.length) { fail(`${where}: ${noTeam.map((n) => `「${n}」`).join(', ')}은(는) 팀이 없습니다(참가자 시트의 팀 칸).`); return; }
        if (tA.length > 1 || tB.length > 1) { fail(`${where}: 한쪽(A 또는 B)에 다른 팀 사람이 섞여 있습니다.`); return; }
        if (tA[0] === tB[0]) { fail(`${where}: A와 B가 같은 팀(${teamNames[tA[0]]})입니다.`); return; }
        for (const x of [...A, ...B]) {
          const bk = `${round}|${x.id}`;
          if (busy.has(bk)) { fail(`${where}: 「${x.n}」이(가) ${round}타임에 ${busy.get(bk) + 1}번째 줄 경기에도 있습니다.`); return; }
        }
        ids.forEach((id) => busy.set(`${round}|${id}`, r));
        const sa = cellStr(v('A점수')); const sb = cellStr(v('B점수'));
        let score = null;
        if (sa || sb) {
          const a = Number(sa); const b = Number(sb);
          if (!sa || !sb || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) {
            fail(`${where}: 점수는 양쪽 다 숫자로 적거나(예: 6, 4) 둘 다 비워 두세요.`); return;
          }
          score = { a, b };
        }
        let teamA = A.map((x) => x.id); let teamB = B.map((x) => x.id);
        let ai = tA[0]; let bi = tB[0];
        /* 2팀 화면은 왼쪽이 늘 첫 팀(청팀·우리 클럽) — 거꾸로 적었으면 뒤집는다(점수도 같이) */
        if (kind === 'team' && ai === 1) {
          [teamA, teamB] = [teamB, teamA]; [ai, bi] = [bi, ai];
          if (score) score = { a: score.b, b: score.a };
        }
        const gs = [...teamA, ...teamB].map((id) => personById[id].p.gender === 'F' ? 'F' : 'M');
        const typeKey = teamA.length === 1 ? 'SG' : gs.every((g) => g === 'M') ? 'MD' : gs.every((g) => g === 'F') ? 'WD' : 'MX';
        matches.push({
          id: `xl-${round}-${court}`, round, court,
          ...(kind === 'league' ? { league: true } : { team: true }),
          manual: true, teamAIdx: ai, teamBIdx: bi, typeKey,
          type: { SG: '단식', MD: '남복', WD: '여복', MX: '혼복' }[typeKey],
          teamA, teamB, score,
        });
      });
    }
  }
  matches.sort((a, b) => a.round - b.round || a.court - b.court);
  if (errors.length) return { errors, warnings, summary: null, patch: null };

  /* ---------- 저장할 모양 ---------- */
  const roster = people.map(({ p }) => p);
  const maxR = matches.reduce((n, m) => Math.max(n, m.round), 0);
  const maxC = matches.reduce((n, m) => Math.max(n, m.court), 0);
  const patch = { roster, rosterVer: (Number(t?.rosterVer) || 0) + 1, stage: kind };
  if (maxC) patch.courts = Math.max(Number(t?.courts) || 0, maxC);
  if (kind === 'team') {
    patch.team = {
      ...(t?.team || {}),
      teamA: teams[0] || [], teamB: teams[1] || [], unassigned, matches, placement: 'manual', format: t?.format,
      ...(target.club ? { opponentClub: teamNames[1] === '상대 클럽' ? String(t?.team?.opponentClub || '') : teamNames[1] } : {}),
    };
  } else {
    const prev = t?.league || {};
    patch.league = packLeague({
      ...prev,
      teams, unassigned, matches,
      config: { ...(prev.config || {}), teamNames: [...teamNames], placement: 'manual', ...(maxR ? { rounds: maxR, courts: maxC } : {}) },
    });
  }

  /* ---------- 미리 보기 ---------- */
  const oldIds = new Set((t?.roster || []).map((p) => p?.id));
  const newIds = new Set(roster.map((p) => p.id));
  const before = currentState(t);
  if (before.matches.length && !matches.length) warnings.push(`지금 대진 ${before.matches.length}경기는 지워집니다(엑셀의 대진 시트가 비어 있음).`);
  if (before.matches.some((m) => m?.score) && matches.length && !matches.some((m) => m.score)) warnings.push('지금 넣어 둔 점수가 엑셀에 없어 모두 지워집니다.');
  const health = tourneyHealth({ ...t, ...patch });
  Object.entries(health.issues || {}).forEach(([k, n]) => warnings.push(`확인: ${k} ${n}건`));
  const summary = {
    people: roster.length, members: nMember, guests: nGuest,
    added: roster.filter((p) => !oldIds.has(p.id)).length,
    removed: [...oldIds].filter((id) => id && !newIds.has(id)).length,
    teams: teamNames.map((name, i) => ({ name, n: teams[i].length })),
    unassigned: unassigned.length,
    games: matches.length, done: matches.filter((m) => m.score).length,
    kind, switched: kind !== (t?.stage === 'league' ? 'league' : 'team'),
  };
  return { errors, warnings, summary, patch };
}

export default { buildTemplate, parseImport, importTarget, templateFileName, SHEET, PEOPLE_HEAD, DRAW_HEAD };
