/* ============================================================
   조별리그 · 토너먼트 엑셀 불러오기 (2026-10-27 앱 주인: "조별리그, 토너먼트도 엑셀로 업로드")

   대회 방식 「조별리그 + 토너먼트」(stage 'draw') — 부(남복·여복·혼복…)마다 팀 → 조 → 조별 경기 → 본선.
   시트
     · 참가자   이름 · 성별 · 부수(선택)
     · 팀       부 · 조 · 선수1 · 선수2(단식은 비움) · 시드(선택)      — 한 줄에 한 팀
     · 조별경기 부 · 조 · 타임 · 코트 · A선수1·2 · B선수1·2 · A점수·B점수(선택)
                 시트를 통째로 비우면 앱이 조마다 경기와 시간표를 자동으로 짠다(앱의 「자동 대진 작성」과 같은 방식)
     · 본선     부 · 라운드(16강·8강·준결승·결승 또는 1·2·3…) · 경기 · A선수1·2 · B선수1·2 · A점수·B점수
                 1라운드 줄이 대진표 자리(한쪽을 비우면 부전승). 다음 라운드는 점수만 보면 된다(올라간 팀은 앱이 계산)
                 비우면: 토너먼트만 진행 → 팀 시트 순서(시드 먼저)로 대진표, 조별리그 → 본선은 나중에 앱에서
   팀은 선수 이름으로 알아본다(같은 부 안에서 선수가 같은 팀). 저장 모양은 TournamentDraw.jsx 와 같다
     (entries · groups · ko[부] · events · roster · guests). KDK 개인전은 아직 지원하지 않는다.
   ⚠️ 기기 기능을 부르지 않는다.
   ============================================================ */
import {
  EVENTS, EVENT_KEYS, eventOf, groupName, buildGroupMatches, schedule, playersOfFn, makeGuest, normRules, PLAY,
} from './groupLeague.js';
import { buildBracket, applyResult, championOf, roundName } from './tournament.js';
import { norm, cellStr, koGender, at, findSheet, headerOf, bodyRows, resolvePeople } from './importCommon.js';

export const B_SHEET = { guide: '안내', people: '참가자', teams: '팀', groupGames: '조별경기', ko: '본선' };
export const B_PEOPLE_HEAD = ['이름', '성별', '부수(선택)'];
export const B_TEAM_HEAD = ['부', '조', '선수1', '선수2', '시드(선택)'];
export const B_GAME_HEAD = ['부', '조', '타임', '코트', 'A선수1', 'A선수2', 'B선수1', 'B선수2', 'A점수', 'B점수'];
export const B_KO_HEAD = ['부', '라운드', '경기', 'A선수1', 'A선수2', 'B선수1', 'B선수2', 'A점수', 'B점수'];

let seq = 0;
const newId = (p) => `${p}_xl${Date.now().toString(36)}${(seq++).toString(36)}`;
const pairKey = (a, b) => [a, b].sort().join('|');
const setKey = (ids) => [...ids].sort().join('+');

/** '남복'·'남자복식'·'MD' → 'MD' */
export function eventKeyOf(raw) {
  const s = norm(raw).toUpperCase();
  if (!s) return '';
  return EVENT_KEYS.find((k) => k === s || norm(EVENTS[k].short).toUpperCase() === s || norm(EVENTS[k].name).toUpperCase() === s) || null;
}
/** 'A' · 'a조' · '1' · '1조' → 'A조' */
export function groupNameOf(raw) {
  const s = norm(raw).replace(/조$/, '');
  if (!s) return '';
  if (/^\d+$/.test(s)) return Number(s) >= 1 && Number(s) <= 26 ? groupName(Number(s) - 1) : null;
  if (/^[a-z]$/i.test(s)) return `${s.toUpperCase()}조`;
  return null;
}

/** 이 대회를 이 양식으로 불러올 수 있나 */
export function bracketSupport(t) {
  if (t?.stage !== 'draw') return { ok: false, reason: '이 대회 방식은 아직 엑셀 불러오기를 지원하지 않습니다.' };
  if (normRules(t.rules).format === 'kdk' || Object.values(t.kdk || {}).some((d) => d?.matches?.length)) {
    return { ok: false, reason: 'KDK 개인전은 아직 엑셀 불러오기를 지원하지 않습니다.' };
  }
  return { ok: true };
}

/* ============================================================
   1) 양식 만들기 — 지금 대회 내용으로 채운다
   ============================================================ */
export function buildBracketTemplate(t) {
  const events = (t?.events || []).filter((k) => EVENTS[k]);
  const roster = t?.roster || [];
  const guestOf = new Map((t?.guests || []).map((g) => [g.id, g]));
  /* 명단에 적힌 이름 그대로 — 다시 올렸을 때 같은 사람으로 알아보게(게스트는 「이름(클럽)」) */
  const nameOfP = new Map(roster.map((p) => [p.id, p.name || '']));
  const entries = t?.entries || [];
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const pn = (e, i) => nameOfP.get(e?.players?.[i]) || '';
  const groups = t?.groups || [];
  const groupOfEntry = new Map();
  groups.forEach((g) => (g.entryIds || []).forEach((id) => groupOfEntry.set(id, g.name)));
  const short = (k) => eventOf(k).short || '';
  const useGroups = t?.useGroupStage !== false;

  const people = roster.map((p) => [nameOfP.get(p.id), koGender(p.gender), guestOf.get(p.id)?.busu || p.busu || '']);
  const teamRows = entries.map((e) => [short(e.div), useGroups ? (groupOfEntry.get(e.id) || '').replace(/\s*\(.*\)$/, '') : '', pn(e, 0), pn(e, 1), e.seed || '']);
  const gameRows = groups.flatMap((g) => (g.matches || []).map((m) => ({ g, m })))
    .sort((x, y) => (Number(x.m.round) || 0) - (Number(y.m.round) || 0) || (Number(x.m.court) || 0) - (Number(y.m.court) || 0))
    .map(({ g, m }) => {
      const A = entryById.get(m.a); const B = entryById.get(m.b);
      return [short(g.div), String(g.name || '').replace(/\s*\(.*\)$/, ''), Number(m.round) || '', Number(m.court) || '', pn(A, 0), pn(A, 1), pn(B, 0), pn(B, 1),
        m.score ? Number(m.score.a) : '', m.score ? Number(m.score.b) : ''];
    });
  const koRows = [];
  events.forEach((k) => {
    const rounds = t?.ko?.[k]?.bracket?.rounds || [];
    rounds.forEach((r, ri) => (r.matches || []).forEach((m, mi) => {
      const A = entryById.get(m.a); const B = entryById.get(m.b);
      if (ri > 0 && !A && !B && !m.score) return;
      koRows.push([short(k), roundName(ri, rounds.length), mi + 1, pn(A, 0), pn(A, 1), pn(B, 0), pn(B, 1),
        m.score ? Number(m.score.a) : '', m.score ? Number(m.score.b) : '']);
    }));
  });

  const shorts = events.map(short);
  const guide = [
    [`Court 대회 양식 — ${t?.name || ''} (${t?.date || ''}) · 조별리그·토너먼트`],
    [''],
    ['쓰는 법'],
    ['1. 「참가자」 → 「팀」 → 「조별경기」 → 「본선」 순서로 적습니다. 지금 대회 내용이 미리 들어 있습니다.'],
    ['2. 저장할 때 형식은 「Excel 통합 문서(.xlsx)」. 시트 이름과 첫 줄(제목 줄)은 바꾸지 마세요.'],
    ['3. 앱 → 대회 → 엑셀로 불러오기 → [엑셀 작업 링크 만들기]의 페이지에서 올리면, 앱에 미리 보기가 뜹니다.'],
    [''],
    ['참가자 시트'],
    ['· 이름: 앱의 회원 이름과 똑같이(띄어쓰기는 무시). 회원이 아니면 게스트로 들어갑니다 — 게스트는 성별을 꼭 적어 주세요.'],
    [''],
    ['팀 시트 — 한 줄에 한 팀'],
    [`· 부: ${shorts.join(' · ') || '남복 · 여복 · 혼복 · 복식 · 남단 · 여단 · 단식'}${shorts.length === 1 ? ' (부가 하나면 비워도 됩니다)' : ''}`],
    [useGroups ? '· 조: A, B, C … (A조라고 써도 됩니다)' : '· 조: 이 대회는 토너먼트만 진행해 비워 둡니다'],
    ['· 선수1·선수2: 참가자 시트의 이름. 단식은 선수1만. 시드는 숫자(1이 가장 높음, 비워도 됨)'],
    [''],
    ['조별경기 시트'],
    ['· 통째로 비워 두면 앱이 조마다 경기와 시간표(타임·코트)를 자동으로 짭니다.'],
    ['· 직접 적으면 모든 조의 경기를 적어야 합니다. 팀은 선수 이름으로 적습니다. 점수는 끝난 경기만(무승부 없음).'],
    [''],
    ['본선 시트'],
    ['· 라운드: 16강 · 8강 · 준결승 · 결승 (또는 1 · 2 · 3 …). 경기: 그 라운드의 몇 번째 경기인지(1부터).'],
    ['· 1라운드 줄이 대진표 자리입니다. 한쪽을 비우면 부전승. 다음 라운드는 점수만 적으면 됩니다(올라간 팀은 앱이 계산).'],
    [useGroups ? '· 비워 두면 조별리그가 끝난 뒤 앱에서 본선을 만듭니다.' : '· 비워 두면 팀 시트 순서(시드 먼저)로 대진표를 만듭니다.'],
    [''],
    ['⚠️ 올리면 이 대회의 참가자·팀·조·경기·본선이 엑셀 내용으로 바뀝니다. 실수했으면 대회 화면의 「되돌리기(서버 백업)」로 되돌릴 수 있습니다.'],
  ];
  const evList = shorts.length ? shorts : EVENT_KEYS.map(short);
  return [
    { name: B_SHEET.guide, rows: guide, widths: [110], wrap: true },
    { name: B_SHEET.people, header: true, widths: [14, 6, 10], rows: [B_PEOPLE_HEAD, ...people], lists: [{ col: 1, values: ['남', '여'], strict: true }] },
    { name: B_SHEET.teams, header: true, widths: [7, 6, 12, 12, 9], rows: [B_TEAM_HEAD, ...teamRows], lists: [{ col: 0, values: evList }] },
    { name: B_SHEET.groupGames, header: true, widths: [7, 6, 6, 6, 12, 12, 12, 12, 7, 7], rows: [B_GAME_HEAD, ...gameRows], lists: [{ col: 0, values: evList }] },
    { name: B_SHEET.ko, header: true, widths: [7, 8, 6, 12, 12, 12, 12, 7, 7], rows: [B_KO_HEAD, ...koRows], lists: [{ col: 0, values: evList }] },
  ];
}

/* ============================================================
   2) 읽어서 검사하기
   ============================================================ */
/** 1라운드 자리(엔트리 id 또는 null=부전승)로 대진표 — tournament.js buildBracket 과 같은 모양 */
function bracketFromSlots(slots) {
  const rounds = [];
  let current = [];
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i]; const b = slots[i + 1];
    current.push({ id: newId('tm'), round: 1, a, b, score: null, winner: a && !b ? a : (!a && b ? b : null) });
  }
  rounds.push({ index: 0, matches: current });
  let roundNo = 2;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push({
        id: newId('tm'), round: roundNo, a: current[i].winner || null, b: current[i + 1]?.winner || null,
        score: null, winner: null, fromA: current[i].id, fromB: current[i + 1]?.id || null,
      });
    }
    rounds.push({ index: roundNo - 1, matches: next });
    current = next;
    roundNo += 1;
  }
  return { rounds };
}

/** 라운드 글자 → 0부터의 번호. total = 전체 라운드 수 */
function roundIndexOf(raw, total) {
  const s = norm(raw);
  if (/^\d+$/.test(s)) return Number(s) - 1;
  if (s === '결승') return total - 1;
  if (s === '준결승' || s === '4강') return total - 2;
  const m = /^(\d+)강$/.exec(s);
  if (m) { const n = Number(m[1]); const k = Math.log2(n); return Number.isInteger(k) ? total - k : -1; }
  return -1;
}
const sizeHint = (raw) => {
  const s = norm(raw);
  if (s === '결승') return 2;
  if (s === '준결승' || s === '4강') return 4;
  const m = /^(\d+)강$/.exec(s);
  return m && Number.isInteger(Math.log2(Number(m[1]))) ? Number(m[1]) : 0;
};

/**
 * @param opts { t, members, personOf(회원) → 명단 한 사람({ id, name, gender, skill }) }
 * @returns { errors, warnings, summary, patch|null }
 */
export function parseBracketImport(sheets, { t, members = [], personOf = (m) => ({ id: m.id, name: m.name, gender: m.gender || 'M', skill: 3 }) } = {}) {
  const errors = [];
  const warnings = [];
  const fail = (s) => { if (errors.length < 40) errors.push(s); };
  const warn = (s) => { if (warnings.length < 30) warnings.push(s); };
  const done = () => ({ errors, warnings, summary: null, patch: null });
  const sup = bracketSupport(t);
  if (!sup.ok) { fail(sup.reason); return done(); }
  const useGroups = t?.useGroupStage !== false;
  const rules = normRules(t?.rules);

  /* ---------- 참가자 ---------- */
  const pRows = findSheet(sheets, B_SHEET.people);
  if (!pRows) { fail(`「${B_SHEET.people}」 시트가 없습니다. 앱에서 받은 양식에 적어 올려 주세요(시트 이름은 바꾸지 마세요).`); return done(); }
  const ph = headerOf(pRows, B_PEOPLE_HEAD);
  ['이름', '성별'].forEach((h) => { if (!(h in ph.col)) fail(`「${B_SHEET.people}」 시트 첫 줄에 「${h}」 칸이 없습니다.`); });
  if (errors.length) return done();
  const guestRow = new Map();
  const ppl = resolvePeople(pRows, ph, {
    t, members, personOf, fail, warn, sheet: B_SHEET.people,
    guestOf: (name, gender, busu) => {
      const g = { ...makeGuest(name), gender, ...(busu ? { busu } : {}) };
      guestRow.set(g.id, g);
      return { id: g.id, name: g.name, gender, skill: 3, guest: true };
    },
  });
  if (!ppl.people.length && !errors.length) fail(`「${B_SHEET.people}」 시트에 참가자가 한 명도 없습니다.`);
  const personById = new Map(ppl.people.map(({ p }) => [p.id, p]));
  const idOf = (name) => ppl.idOfName.get(norm(name)) || null;

  /* ---------- 부 ---------- */
  const events = (t?.events || []).filter((k) => EVENTS[k]);
  const divOf = (raw, where) => {
    const s = cellStr(raw);
    if (!s) {
      if (events.length === 1) return events[0];
      fail(`${where}: 「부」를 적어 주세요(${events.map((k) => eventOf(k).short).join('·') || '남복·여복…'}).`);
      return null;
    }
    const k = eventKeyOf(s);
    if (!k) { fail(`${where}: 「${s}」은(는) 모르는 부입니다(남복·여복·혼복·복식·남단·여단·단식).`); return null; }
    return k;
  };

  /* ---------- 팀 ---------- */
  const tRows = findSheet(sheets, B_SHEET.teams);
  if (!tRows) { fail(`「${B_SHEET.teams}」 시트가 없습니다. 앱에서 받은 양식에 적어 올려 주세요.`); return done(); }
  const th = headerOf(tRows, B_TEAM_HEAD);
  ['선수1'].forEach((h) => { if (!(h in th.col)) fail(`「${B_SHEET.teams}」 시트 첫 줄에 「${h}」 칸이 없습니다.`); });
  if (errors.length) return done();
  const oldEntries = t?.entries || [];
  const oldEntryByKey = new Map(oldEntries.map((e) => [`${e.div}:${setKey(e.players || [])}`, e]));
  const entries = [];
  const entryByKey = new Map();                 // `${div}:${선수 id 묶음}` → 엔트리
  const groupOfEntry = new Map();
  const inDiv = new Map();                      // `${div}:${선수 id}` → 줄
  const usedEvents = [];
  bodyRows(tRows, th).forEach(({ r, v }) => {
    const where = at(B_SHEET.teams, r);
    const names = [cellStr(v('선수1')), cellStr(v('선수2'))].filter(Boolean);
    if (!names.length) { fail(`${where}: 선수 이름이 없습니다.`); return; }
    const div = divOf(v('부'), where);
    if (!div) return;
    const ev = eventOf(div);
    const ids = names.map(idOf);
    const unknown = names.filter((_, i) => !ids[i]);
    if (unknown.length) { fail(`${where}: ${unknown.map((n) => `「${n}」`).join(', ')}이(가) 참가자 시트에 없습니다.`); return; }
    const need = ev.play === PLAY.SINGLES ? 1 : 2;
    if (ids.length !== need) { fail(`${where}: ${ev.name}는 한 팀이 ${need}명입니다(지금 ${ids.length}명).`); return; }
    if (need === 2 && ids[0] === ids[1]) { fail(`${where}: 같은 사람이 두 번 적혀 있습니다.`); return; }
    for (const id of ids) {
      const k = `${div}:${id}`;
      if (inDiv.has(k)) { fail(`${where}: 「${personById.get(id).name}」이(가) ${ev.short}에서 ${inDiv.get(k) + 1}번째 줄 팀에도 있습니다.`); return; }
    }
    ids.forEach((id) => inDiv.set(`${div}:${id}`, r));
    const gs = ids.map((id) => personById.get(id).gender);
    const bad = (ev.gender === 'M' && gs.some((g) => g !== 'M')) || (ev.gender === 'F' && gs.some((g) => g !== 'F'))
      || (ev.gender === 'X' && need === 2 && gs[0] === gs[1]);
    if (bad) warn(`${where}: ${names.join(' / ')} — ${ev.name}에 맞지 않는 성별입니다(그대로 넣습니다).`);
    const gRaw = cellStr(v('조'));
    let gName = '';
    if (useGroups) {
      gName = groupNameOf(gRaw);
      if (gName === null) { fail(`${where}: 조는 A, B, C … 로 적어 주세요(지금: ${gRaw}).`); return; }
      if (!gName) { fail(`${where}: 조를 적어 주세요(조별리그 대회).`); return; }
    } else if (gRaw) warn(`${where}: 토너먼트만 진행하는 대회라 조 칸은 쓰지 않습니다.`);
    const seedRaw = cellStr(v('시드(선택)'));
    const seed = seedRaw ? Number(seedRaw) : null;
    if (seedRaw && (!Number.isInteger(seed) || seed < 1)) { fail(`${where}: 시드는 1 이상 숫자로 적어 주세요.`); return; }
    const key = `${div}:${setKey(ids)}`;
    const prev = oldEntryByKey.get(key);
    const skills = ids.map((id) => Number(personById.get(id).skill) || 3);
    const e = {
      ...(prev || {}),
      id: prev?.id || newId('e'), div,
      name: ids.map((id) => personById.get(id).name).join(' / '),
      players: ids, seed: seed || null,
      skill: prev?.skill ?? Math.round((skills.reduce((s, x) => s + x, 0) / skills.length) * 100) / 100,
    };
    entries.push(e);
    entryByKey.set(key, e);
    if (gName) groupOfEntry.set(e.id, gName);
    if (!usedEvents.includes(div)) usedEvents.push(div);
  });
  if (!entries.length && !errors.length) fail(`「${B_SHEET.teams}」 시트에 팀이 한 줄도 없습니다.`);
  const evOrder = [...events.filter((k) => usedEvents.includes(k)), ...EVENT_KEYS.filter((k) => usedEvents.includes(k) && !events.includes(k))];
  evOrder.forEach((k) => { if (entries.filter((e) => e.div === k).length < 2) fail(`${eventOf(k).name} 팀이 2팀 이상이어야 합니다.`); });
  if (errors.length) return done();

  /* 선수 이름(1~2명) → 그 부의 팀 */
  const entryOfNames = (div, names, where) => {
    const ns = names.filter(Boolean);
    if (!ns.length) return null;
    const ids = ns.map(idOf);
    const unknown = ns.filter((_, i) => !ids[i]);
    if (unknown.length) { fail(`${where}: ${unknown.map((n) => `「${n}」`).join(', ')}이(가) 참가자 시트에 없습니다.`); return undefined; }
    const e = entryByKey.get(`${div}:${setKey(ids)}`);
    if (!e) { fail(`${where}: 「${ns.join(' / ')}」 팀이 「${B_SHEET.teams}」 시트(${eventOf(div).short})에 없습니다.`); return undefined; }
    return e;
  };

  /* ---------- 조 ---------- */
  const oldGroups = t?.groups || [];
  const groups = [];
  if (useGroups) {
    evOrder.forEach((div) => {
      const names = [...new Set(entries.filter((e) => e.div === div).map((e) => groupOfEntry.get(e.id)))].sort();
      names.forEach((name) => {
        const prev = oldGroups.find((g) => g.div === div && String(g.name || '').replace(/\s*\(.*\)$/, '') === name);
        const ids = entries.filter((e) => e.div === div && groupOfEntry.get(e.id) === name).map((e) => e.id);
        if (ids.length < 2) warn(`${eventOf(div).name} ${name}에 팀이 ${ids.length}팀뿐이라 조별 경기가 없습니다.`);
        groups.push({
          ...(prev ? { id: prev.id, ...(prev.courts ? { courts: prev.courts } : {}), ...(prev.grade ? { grade: prev.grade } : {}) } : { id: newId('grp') }),
          name: prev?.name && String(prev.name).replace(/\s*\(.*\)$/, '') === name ? prev.name : name,
          div, entryIds: ids, matches: [],
          ...((prev?.perTeam || rules.perTeam) ? { perTeam: prev?.perTeam || rules.perTeam } : {}),
          _old: prev?.matches || [],
        });
      });
    });
  }
  const groupByEntry = new Map();
  groups.forEach((g) => g.entryIds.forEach((id) => groupByEntry.set(id, g)));

  /* ---------- 조별경기 ---------- */
  let courts = Math.max(1, Number(t?.courts) || 2);
  const gRows = findSheet(sheets, B_SHEET.groupGames);
  const gh = gRows ? headerOf(gRows, B_GAME_HEAD) : { row: -1, col: {} };
  const gameRows = gRows ? bodyRows(gRows, gh) : [];
  let auto = useGroups && !gameRows.length;
  if (!useGroups && gameRows.length) warn(`토너먼트만 진행하는 대회라 「${B_SHEET.groupGames}」 시트는 쓰지 않습니다.`);
  if (useGroups && gameRows.length) {
    const miss = ['타임', '코트', 'A선수1', 'B선수1'].filter((h) => !(h in gh.col));
    if (miss.length) fail(`「${B_SHEET.groupGames}」 시트 첫 줄에 ${miss.map((h) => `「${h}」`).join(' ')} 칸이 없습니다.`);
    const slot = new Map();
    const busy = new Map();
    if (!miss.length) gameRows.forEach(({ r, v }) => {
      const where = at(B_SHEET.groupGames, r);
      const div = divOf(v('부'), where);
      if (!div) return;
      const round = Number(cellStr(v('타임'))); const court = Number(cellStr(v('코트')));
      if (!Number.isInteger(round) || round < 1 || round > 99) { fail(`${where}: 타임은 1 이상 숫자로 적어 주세요.`); return; }
      if (!Number.isInteger(court) || court < 1 || court > 40) { fail(`${where}: 코트는 1 이상 숫자로 적어 주세요.`); return; }
      const A = entryOfNames(div, [cellStr(v('A선수1')), cellStr(v('A선수2'))], where);
      const B = entryOfNames(div, [cellStr(v('B선수1')), cellStr(v('B선수2'))], where);
      if (A === undefined || B === undefined) return;
      if (!A || !B) { fail(`${where}: A·B 양쪽에 선수가 있어야 합니다.`); return; }
      if (A.id === B.id) { fail(`${where}: 같은 팀끼리 붙어 있습니다.`); return; }
      const g = groupByEntry.get(A.id);
      if (!g || g !== groupByEntry.get(B.id)) { fail(`${where}: 「${A.name}」와 「${B.name}」은(는) 같은 조가 아닙니다(팀 시트의 조).`); return; }
      const gRaw = cellStr(v('조'));
      if (gRaw && groupNameOf(gRaw) !== String(g.name).replace(/\s*\(.*\)$/, '')) warn(`${where}: 조 칸(${gRaw})과 팀 시트의 조(${g.name})가 다릅니다 — 팀 시트를 따릅니다.`);
      const sk = `${round}|${court}`;
      if (slot.has(sk)) { fail(`${where}: ${round}타임 ${court}코트가 ${slot.get(sk) + 1}번째 줄과 겹칩니다.`); return; }
      if (g.matches.some((m) => pairKey(m.a, m.b) === pairKey(A.id, B.id))) { fail(`${where}: 「${A.name}」 대 「${B.name}」 경기가 두 번 있습니다.`); return; }
      for (const pid of [...A.players, ...B.players]) {
        if (busy.has(`${round}|${pid}`)) { fail(`${where}: 「${personById.get(pid).name}」이(가) ${round}타임에 ${busy.get(`${round}|${pid}`) + 1}번째 줄 경기에도 있습니다.`); return; }
      }
      const sa = cellStr(v('A점수')); const sb = cellStr(v('B점수'));
      let score = null;
      if (sa || sb) {
        const a = Number(sa); const b = Number(sb);
        if (!sa || !sb || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) { fail(`${where}: 점수는 양쪽 다 숫자로 적거나(예: 6, 4) 둘 다 비워 두세요.`); return; }
        if (a === b) { fail(`${where}: 조별리그는 무승부가 없습니다(${a}:${b}).`); return; }
        score = { a, b };
      }
      slot.set(sk, r);
      [...A.players, ...B.players].forEach((pid) => busy.set(`${round}|${pid}`, r));
      const prev = g._old.find((m) => pairKey(m.a, m.b) === pairKey(A.id, B.id));
      g.matches.push({ id: prev?.id || newId('gm'), groupId: g.id, a: A.id, b: B.id, rr: round, round, court, score, div });
      courts = Math.max(courts, court);
    });
    groups.forEach((g) => {
      if (!g.matches.length && g.entryIds.length >= 2) fail(`「${B_SHEET.groupGames}」 시트에 ${eventOf(g.div).name} ${g.name} 경기가 없습니다. 모든 조를 적거나, 시트를 통째로 비우면 앱이 자동으로 짭니다.`);
    });
    auto = false;
  }
  if (errors.length) return done();
  let outGroups = groups.map(({ _old, ...g }) => g);
  if (auto) {
    outGroups = schedule(groups.map(({ _old, ...g }) => ({ ...g, matches: buildGroupMatches(g, _old).map((m) => ({ ...m, div: g.div })) })),
      courts, { playersOf: playersOfFn(entries) });
  } else {
    outGroups = outGroups.map((g) => ({ ...g, matches: [...g.matches].sort((x, y) => x.round - y.round || x.court - y.court) }));
  }

  /* ---------- 본선 ---------- */
  const ko = {};
  const kRows = findSheet(sheets, B_SHEET.ko);
  const kh = kRows ? headerOf(kRows, B_KO_HEAD) : { row: -1, col: {} };
  const koRows = kRows ? bodyRows(kRows, kh) : [];
  if (koRows.length) {
    const miss = ['라운드', '경기', 'A선수1', 'B선수1'].filter((h) => !(h in kh.col));
    if (miss.length) { fail(`「${B_SHEET.ko}」 시트 첫 줄에 ${miss.map((h) => `「${h}」`).join(' ')} 칸이 없습니다.`); return done(); }
  }
  const byDiv = new Map();
  koRows.forEach((row) => {
    const div = divOf(row.v('부'), at(B_SHEET.ko, row.r));
    if (div) byDiv.set(div, [...(byDiv.get(div) || []), row]);
  });
  byDiv.forEach((rows, div) => {
    const ev = eventOf(div);
    if (!evOrder.includes(div)) { fail(`[${B_SHEET.ko}] ${ev.name} 팀이 팀 시트에 없습니다.`); return; }
    /* 대진표 크기 — 1라운드 줄 수 × 2, 또는 '8강'처럼 적힌 가장 큰 숫자 */
    const firstNum = rows.filter((x) => norm(x.v('라운드')) === '1').length;
    const size = firstNum ? firstNum * 2 : Math.max(0, ...rows.map((x) => sizeHint(x.v('라운드'))));
    const total = Math.log2(size);
    if (!size || !Number.isInteger(total) || size < 2) { fail(`[${B_SHEET.ko}] ${ev.name}: 1라운드(첫 라운드) 경기 수가 맞지 않습니다(2·4·8·16강).`); return; }
    const parsed = [];
    for (const x of rows) {
      const where = at(B_SHEET.ko, x.r);
      const ri = roundIndexOf(x.v('라운드'), total);
      const mi = Number(cellStr(x.v('경기'))) - 1;
      if (!(ri >= 0 && ri < total)) { fail(`${where}: 라운드는 ${roundName(0, total)} · … · 결승(또는 1 · 2 …)으로 적어 주세요(지금: ${cellStr(x.v('라운드'))}).`); return; }
      if (!Number.isInteger(mi) || mi < 0 || mi >= size / 2 ** (ri + 1)) { fail(`${where}: ${roundName(ri, total)}은(는) 경기 1 ~ ${size / 2 ** (ri + 1)}입니다.`); return; }
      const A = entryOfNames(div, [cellStr(x.v('A선수1')), cellStr(x.v('A선수2'))], where);
      const B = entryOfNames(div, [cellStr(x.v('B선수1')), cellStr(x.v('B선수2'))], where);
      if (A === undefined || B === undefined) return;
      const sa = cellStr(x.v('A점수')); const sb = cellStr(x.v('B점수'));
      let score = null;
      if (sa || sb) {
        const a = Number(sa); const b = Number(sb);
        if (!sa || !sb || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) { fail(`${where}: 점수는 양쪽 다 숫자로 적거나 둘 다 비워 두세요.`); return; }
        if (a === b) { fail(`${where}: 본선은 무승부가 없습니다(${a}:${b}).`); return; }
        score = { a, b };
      }
      parsed.push({ where, ri, mi, A, B, score });
    }
    const first = parsed.filter((x) => x.ri === 0);
    if (first.length !== size / 2 || new Set(first.map((x) => x.mi)).size !== first.length) {
      fail(`[${B_SHEET.ko}] ${ev.name} ${roundName(0, total)}: 경기 1 ~ ${size / 2}을 한 줄씩 모두 적어 주세요(부전승은 한쪽을 비움).`); return;
    }
    const slots = Array(size).fill(null);
    const seen = new Set();
    for (const x of first) {
      if (!x.A && !x.B) { fail(`${x.where}: 양쪽이 모두 비어 있습니다.`); return; }
      for (const e of [x.A, x.B].filter(Boolean)) {
        if (seen.has(e.id)) { fail(`${x.where}: 「${e.name}」 팀이 1라운드에 두 번 있습니다.`); return; }
        seen.add(e.id);
      }
      slots[x.mi * 2] = x.A?.id || null; slots[x.mi * 2 + 1] = x.B?.id || null;
    }
    let bracket = bracketFromSlots(slots);
    /* 점수를 라운드 순서대로 — 다음 라운드의 팀은 앞 결과로 정해진다 */
    for (const x of [...parsed].sort((p, q) => p.ri - q.ri || p.mi - q.mi)) {
      if (!x.score) continue;
      const m = bracket.rounds[x.ri].matches[x.mi];
      if (!m.a || !m.b) { fail(`${x.where}: 아직 양쪽 팀이 정해지지 않은 경기입니다(앞 라운드 점수를 확인하세요).`); return; }
      let { a, b } = x.score;
      if (x.ri > 0 && (x.A || x.B)) {
        const same = (!x.A || x.A.id === m.a) && (!x.B || x.B.id === m.b);
        const swapped = (!x.A || x.A.id === m.b) && (!x.B || x.B.id === m.a);
        if (!same && swapped) [a, b] = [b, a];
        else if (!same) { fail(`${x.where}: 앞 라운드 결과로 올라온 팀과 다릅니다.`); return; }
      }
      bracket = applyResult(bracket, m.id, a, b);
    }
    ko[div] = { bracket, championId: championOf(bracket) || null };
  });
  if (!useGroups) {
    evOrder.forEach((div) => {
      if (ko[div]) return;
      const es = entries.filter((e) => e.div === div);
      const ordered = [...es.filter((e) => e.seed).sort((a, b) => a.seed - b.seed), ...es.filter((e) => !e.seed)];
      ko[div] = { bracket: buildBracket(ordered.map((e) => e.id)), championId: null };
    });
  } else {
    evOrder.forEach((div) => {
      if (!ko[div] || !ko[div].bracket.rounds[0]) return;
      const inGroups = new Set(entries.filter((e) => e.div === div).map((e) => e.id));
      if (ko[div].bracket.rounds[0].matches.some((m) => (m.a && !inGroups.has(m.a)) || (m.b && !inGroups.has(m.b)))) fail(`[${B_SHEET.ko}] ${eventOf(div).name}: 팀 시트에 없는 팀이 있습니다.`);
    });
  }
  if (errors.length) return done();

  /* ---------- 저장할 모양 ---------- */
  const roster = ppl.people.map(({ p }) => p);
  const usedIds = new Set(entries.flatMap((e) => e.players));
  roster.filter((p) => !usedIds.has(p.id)).forEach((p) => warn(`「${p.name}」은(는) 어느 팀에도 없습니다(참가자로만 남습니다).`));
  const keptGroupIds = new Set(outGroups.map((g) => g.id));
  const guests = [
    ...(t?.guests || []).filter((g) => roster.some((p) => p.id === g.id)).map((g) => {
      const p = roster.find((x) => x.id === g.id);
      return { ...g, gender: p.gender || g.gender, ...(p.busu ? { busu: p.busu } : {}) };
    }),
    ...ppl.newGuests.map((p) => guestRow.get(p.id)),
  ];
  const patch = {
    roster, guests, rosterVer: (Number(t?.rosterVer) || 0) + 1,
    events: [...new Set([...events.filter((k) => evOrder.includes(k)), ...evOrder])],
    entries, groups: outGroups, ko, courts,
    rules: { ...(t?.rules || {}), groupAdvance: Object.fromEntries(Object.entries(rules.groupAdvance || {}).filter(([gid]) => keptGroupIds.has(gid))) },
  };
  const oldIds = new Set((t?.roster || []).map((p) => p?.id));
  const newIds = new Set(roster.map((p) => p.id));
  const hadResults = oldGroups.some((g) => (g.matches || []).some((m) => m.score)) || Object.values(t?.ko || {}).some((k) => k?.bracket?.rounds?.some((r) => r.matches.some((m) => m.score)));
  const nowResults = outGroups.some((g) => g.matches.some((m) => m.score)) || Object.values(ko).some((k) => k.bracket.rounds.some((r) => r.matches.some((m) => m.score)));
  if (hadResults && !nowResults) warn('지금 넣어 둔 결과가 엑셀에 없어 모두 지워집니다.');
  if (useGroups && Object.keys(t?.ko || {}).length && !Object.keys(ko).length) warn('지금 만들어 둔 본선 대진은 지워집니다(본선 시트가 비어 있음).');
  const divs = evOrder.map((div) => {
    const gs = outGroups.filter((g) => g.div === div);
    const ms = gs.flatMap((g) => g.matches);
    const k = ko[div];
    const kms = k ? k.bracket.rounds.flatMap((r) => r.matches) : [];
    return {
      key: div, name: eventOf(div).name, teams: entries.filter((e) => e.div === div).length,
      groups: gs.length, games: ms.length, done: ms.filter((m) => m.score).length,
      ko: k ? { size: 2 ** k.bracket.rounds.length, done: kms.filter((m) => m.score).length } : null,
    };
  });
  const summary = {
    kind: 'bracket', people: roster.length, members: ppl.nMember, guests: ppl.nGuest,
    added: roster.filter((p) => !oldIds.has(p.id)).length,
    removed: [...oldIds].filter((id) => id && !newIds.has(id)).length,
    divs, auto,
    games: divs.reduce((n, d) => n + d.games + (d.ko ? d.ko.size - 1 : 0), 0),
    done: divs.reduce((n, d) => n + d.done + (d.ko ? d.ko.done : 0), 0),
  };
  return { errors, warnings, summary, patch };
}

export default { buildBracketTemplate, parseBracketImport, bracketSupport, eventKeyOf, groupNameOf, B_SHEET };
