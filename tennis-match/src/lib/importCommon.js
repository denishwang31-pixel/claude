/* ============================================================
   엑셀 불러오기 공통 — 칸 읽기 · 시트·제목 줄 찾기 · 참가자 찾기

   팀 대항(lib/tourneyImport.js)과 조별리그·토너먼트(lib/bracketImport.js)가 같이 쓴다(2026-10-27).
   사람 찾기 순서: ① 지금 대회 참가자 ② 클럽 회원(이름이 같은 회원이 둘이면 막는다) ③ 없으면 게스트(성별 필요)
   ⚠️ 기기 기능을 부르지 않는다(검사·서버에서도 돈다).
   ============================================================ */
export const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
export const cellStr = (v) => (v === true ? 'TRUE' : v === false ? 'FALSE' : String(v ?? '').trim());
export const genderFromCell = (v) => {
  const s = norm(v);
  if (['남', '남자', 'm', 'male', '男'].includes(s)) return 'M';
  if (['여', '여자', 'f', 'female', '女'].includes(s)) return 'F';
  return null;
};
export const koGender = (g) => (g === 'F' ? '여' : '남');
export const at = (sheet, r) => `[${sheet}] ${r + 1}번째 줄`;

/** 시트 찾기 — 이름 앞뒤 공백·대소문자 무시 */
export function findSheet(sheets, name) {
  const k = Object.keys(sheets || {}).find((x) => norm(x) === norm(name));
  return k ? sheets[k] : null;
}

/** 제목 줄 찾기 — 첫 번째로 비어 있지 않은 줄. 제목 → 칸 번호(괄호 안 설명은 무시) */
export function headerOf(rows, want) {
  const r = (rows || []).findIndex((row) => (row || []).some((v) => cellStr(v)));
  if (r < 0) return { row: -1, col: {} };
  const bare = (s) => norm(s).replace(/\(.*?\)/g, '');
  const col = {};
  (rows[r] || []).forEach((v, i) => {
    const h = bare(cellStr(v));
    const hit = want.find((w) => bare(w) === h);
    if (hit && !(hit in col)) col[hit] = i;
  });
  return { row: r, col };
}

/** 제목 줄 아래의 줄들 — [{ r(0부터), v(제목) }], 완전히 빈 줄은 뺀다 */
export function bodyRows(rows, head) {
  if (!rows || head.row < 0) return [];
  return rows.slice(head.row + 1).map((row, i) => ({
    r: head.row + 1 + i,
    v: (h) => (h in head.col ? (row || [])[head.col[h]] : ''),
    empty: !(row || []).some((x) => cellStr(x)),
  })).filter((x) => !x.empty);
}

/**
 * 「참가자」 시트 → 사람
 * @param opts { t, members, personOf(회원) → 명단 한 사람, guestOf(이름, 성별, 부수) → 새 게스트 }
 * @returns { people:[{ p, row, team }], idOfName: Map(이름 → id), nMember, nGuest, newGuests:[p] }
 *   errors·warnings 는 넘겨받은 배열에 쌓는다(fail·warn)
 */
export function resolvePeople(rows, head, { t, members = [], personOf, guestOf, fail, warn, sheet = '참가자', teamOf = () => '' }) {
  const old = new Map();
  (t?.roster || []).forEach((p) => { if (p?.name) old.set(norm(p.name), p); });
  const byName = new Map();
  (members || []).filter((m) => m && m.id && !m.deleted && m.status !== '탈퇴')
    .forEach((m) => { const k = norm(m.name); byName.set(k, [...(byName.get(k) || []), m]); });

  const people = [];
  const idOfName = new Map();
  const rowOf = new Map();
  const newGuests = [];
  let nMember = 0; let nGuest = 0;
  bodyRows(rows, head).forEach(({ r, v }) => {
    const name = cellStr(v('이름')).slice(0, 20);
    if (!name) return;
    const k = norm(name);
    if (rowOf.has(k)) { fail(`${at(sheet, r)}: 「${name}」이(가) ${rowOf.get(k) + 1}번째 줄에도 있습니다.`); return; }
    rowOf.set(k, r);
    const gRaw = cellStr(v('성별'));
    const gender = genderFromCell(gRaw);
    if (gRaw && !gender) { fail(`${at(sheet, r)}: 성별은 「남」 또는 「여」로 적어 주세요(지금: ${gRaw}).`); return; }
    const busu = cellStr(v('부수(선택)')).slice(0, 10);
    const team = teamOf(v);
    let p = old.get(k) || null;
    if (!p) {
      const hits = byName.get(k) || [];
      if (hits.length > 1) { fail(`${at(sheet, r)}: 「${name}」 이름의 회원이 ${hits.length}명입니다. 회원 이름을 서로 다르게 바꾼 뒤 올려 주세요.`); return; }
      if (hits.length === 1) p = personOf(hits[0]);
    }
    if (p) {
      p = { ...p };
      if (gender && p.gender && gender !== p.gender && !p.guest) {
        warn(`${at(sheet, r)}: 「${name}」 성별이 회원 정보(${koGender(p.gender)})와 다릅니다 — 회원 정보를 씁니다.`);
      }
      if (p.guest) { if (gender) p.gender = gender; if (busu) p.busu = busu; }
    } else {
      if (!gender) { fail(`${at(sheet, r)}: 「${name}」은(는) 회원이 아니라 게스트로 넣습니다 — 성별을 적어 주세요.`); return; }
      p = guestOf(name, gender, busu);
      newGuests.push(p);
    }
    if (p.guest) nGuest += 1; else nMember += 1;
    idOfName.set(k, p.id);
    people.push({ p, row: r, team });
  });
  return { people, idOfName, nMember, nGuest, newGuests };
}

export default { norm, cellStr, genderFromCell, koGender, at, findSheet, headerOf, bodyRows, resolvePeople };
