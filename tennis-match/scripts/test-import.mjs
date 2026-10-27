/* 대회 엑셀 불러오기 — xlsx 읽기·쓰기(src/lib/xlsxLite.js) · 양식·검사(src/lib/tourneyImport.js) · 화면 연결
   실행: npm run test:import */
import { readFileSync } from 'node:fs';
import { readXlsx, writeXlsx, fileKind, base64ToBytes, bytesToBase64, colName, cellRef, xmlText } from '../src/lib/xlsxLite.js';
import { buildTemplate, parseImport, importTarget, templateFileName, SHEET } from '../src/lib/tourneyImport.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) { pass += 1; console.log('  ✓', m); } else { fail += 1; console.log('  ✗', m); } };
const eq = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` — ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`}`);
const section = (s) => console.log(`\n[${s}]`);

section('xlsx 읽기·쓰기');
{
  eq('칸 이름', [colName(0), colName(25), colName(26), colName(701)], ['A', 'Z', 'AA', 'ZZ']);
  eq('칸 위치', cellRef('AB12'), { col: 27, row: 11 });
  eq('XML 글자', xmlText('a&amp;b&lt;&#44032;&#xAC00;_x000D_'), 'a&b<가가\r');
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  eq('base64 왕복', [...base64ToBytes(bytesToBase64(bytes))], [...bytes]);
  eq('base64 1·2바이트 끝', [bytesToBase64(new Uint8Array([77])), bytesToBase64(new Uint8Array([77, 97]))], ['TQ==', 'TWE=']);
  const u8 = writeXlsx([
    { name: '참가자', header: true, rows: [['이름', '성별'], ['홍<길>&동', '남'], ['', ''], [3, '여']], lists: [{ col: 1, values: ['남', '여'], strict: true }] },
    { name: '대진', rows: [['타임'], [1]] },
  ]);
  eq('파일 종류', [fileKind(u8), fileKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), fileKind(new Uint8Array([1, 2, 3, 4])), fileKind(new Uint8Array())], ['zip', 'xls', 'other', 'empty']);
  const back = readXlsx(u8);
  eq('쓴 것을 그대로 읽는다', back, { 참가자: [['이름', '성별'], ['홍<길>&동', '남'], [], [3, '여']], 대진: [['타임'], [1]] });
  /* 다른 프로그램(openpyxl — 공유 글자표·서식 글자·떨어진 줄)이 만든 파일 */
  const py = readXlsx(readFileSync(new URL('./fixtures/import-openpyxl.xlsx', import.meta.url)));
  eq('다른 프로그램 파일: 서식 글자 합치기·떨어진 줄', py['참가자'][1].slice(0, 3).concat(py['참가자'][4][0], py['참가자'][4][3]), ['홍길동', '남', '청팀', '떨어진 줄', 7]);
  eq('다른 프로그램 파일: 숫자·특수문자', py['대진'][1], [1, 1, '홍길동', '', '김&<영희>', '', 6, 4]);
  let msg = '';
  try { readXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])); } catch (e) { msg = e.message; }
  ok(/\.xls\)/.test(msg) && /\.xlsx/.test(msg), '예전 형식(.xls)은 알아듣게 거절');
  try { readXlsx(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9])); msg = ''; } catch (e) { msg = e.message; }
  ok(/깨져/.test(msg), '깨진 파일도 알아듣게 거절');
}

/* ---------- 공통 준비 ---------- */
const M = (id, name, gender = 'M', extra = {}) => ({ id, name, gender, status: '활동', busu: '3부', ...extra });
const members = [M('u1', '김철수'), M('u2', '이영희', 'F'), M('u3', '박민수'), M('u4', '최지은', 'F'), M('u5', '정 우성'), M('u6', '한가인', 'F'),
  M('d1', '동명이', 'M'), M('d2', '동명이', 'M'), M('x9', '탈퇴자', 'M', { status: '탈퇴' })];
const personOf = (m) => ({ id: m.id, name: m.name, gender: m.gender, busu: m.busu, grade: '', ntrp: null });
const P = (id) => personOf(members.find((m) => m.id === id));
const sheets = (people, draw) => ({ 안내: [['x']], 참가자: [['이름', '성별', '팀', '부수(선택)'], ...people], ...(draw ? { 대진: [['타임', '코트', 'A선수1', 'A선수2', 'B선수1', 'B선수2', 'A점수', 'B점수'], ...draw] } : {}) });

section('청백전 2팀 — 양식 받기 → 그대로 올리기');
{
  const t = {
    id: 't1', name: '가을 청백전', date: '2026-10-20', format: 'blue_white', stage: 'team', roster: ['u1', 'u2', 'u3', 'u4', 'u5'].map(P), courts: 2,
    team: { teamA: [P('u1'), P('u2')], teamB: [P('u3'), P('u4')], unassigned: [P('u5')], placement: 'manual', format: 'blue_white',
      matches: [{ id: 'cm-1-1', round: 1, court: 1, team: true, teamA: ['u1', 'u2'], teamB: ['u3', 'u4'], score: { a: 6, b: 3 } }] },
  };
  eq('저장 자리', importTarget(t).kind, 'team');
  const tpl = buildTemplate(t);
  eq('양식 시트', tpl.map((s) => s.name), ['안내', '참가자', '대진']);
  eq('참가자 줄(팀·미배정)', tpl[1].rows.slice(1).map((r) => r.slice(0, 3).join('/')), ['김철수/남/청팀', '이영희/여/청팀', '박민수/남/백팀', '최지은/여/백팀', '정 우성/남/']);
  eq('대진 줄(이름·점수)', tpl[2].rows[1], [1, 1, '김철수', '이영희', '박민수', '최지은', 6, 3]);
  ok(tpl[1].lists[0].strict && tpl[1].lists[1].values.join() === '청팀,백팀,홍팀', '성별·팀 고르기 목록');
  ok(templateFileName(t) === '가을_청백전_양식.xlsx' && templateFileName({ name: 'a/b:c?' }) === 'a_b_c_양식.xlsx' && templateFileName({ name: '//' }) === '대회_양식.xlsx', '파일 이름');
  /* 양식을 파일로 만들고 다시 읽어 올린다 — 바뀐 게 없어야 한다 */
  const r = parseImport(readXlsx(writeXlsx(tpl)), { t, members, personOf });
  eq('오류 없음', r.errors, []);
  eq('2팀 그대로', [r.patch.stage, r.patch.team.teamA.map((p) => p.id), r.patch.team.teamB.map((p) => p.id), r.patch.team.unassigned.map((p) => p.id)], ['team', ['u1', 'u2'], ['u3', 'u4'], ['u5']]);
  eq('경기·점수 그대로', r.patch.team.matches.map((m) => [m.round, m.court, m.teamA, m.teamB, m.score, m.typeKey]), [[1, 1, ['u1', 'u2'], ['u3', 'u4'], { a: 6, b: 3 }, 'MX']]);
  ok(r.patch.rosterVer === 1 && r.summary.added === 0 && r.summary.removed === 0 && r.summary.members === 5 && !r.summary.switched, '미리 보기 숫자: 그대로');
  ok(r.patch.team.format === 'blue_white' && r.patch.team.placement === 'manual', '2팀 화면에 필요한 칸');

  /* 거꾸로 적은 경기(백팀이 A쪽) → 뒤집는다(점수도) */
  const rev = parseImport(sheets([['김철수', '남', '청'], ['박민수', '남', '백팀']], [[2, 1, '박민수', '', '김철수', '', 6, 2]]), { t, members, personOf });
  eq('A쪽이 백팀이면 뒤집기', [rev.errors, rev.patch.team.matches[0].teamA, rev.patch.team.matches[0].score, rev.patch.team.matches[0].typeKey], [[], ['u1'], { a: 2, b: 6 }, 'SG']);
  ok(rev.summary.removed === 3 && rev.warnings.some((w) => /점수가 엑셀에 없어|지워집니다/.test(w)) === false, '빠진 사람 수 · 점수 경고는 점수 있는 대진엔 안 뜬다');
  const wipe = parseImport(sheets([['김철수', '남', '청팀'], ['박민수', '남', '백팀']], []), { t, members, personOf });
  ok(wipe.warnings.some((w) => /대진 1경기는 지워집니다/.test(w)), '대진 시트가 비면 지금 대진이 지워진다고 알림');

  /* 3팀으로 — 홍팀을 쓰면 3팀(리그) 화면으로 바뀐다 */
  const three = parseImport(sheets([['김철수', '남', '청팀'], ['이영희', '여', '백팀'], ['박민수', '남', '홍팀'], ['최지은', '여', '홍']]), { t, members, personOf });
  eq('홍팀 → 3팀', [three.errors, three.patch.stage, three.patch.league.config.teamNames, three.patch.league.teams.map((x) => x.players.length), three.summary.switched], [[], 'league', ['청팀', '백팀', '홍팀'], [1, 1, 2], true]);
  ok(!('team' in three.patch), '3팀으로 바꿔도 2팀 기록은 건드리지 않는다');
  const bad = parseImport(sheets([['김철수', '남', '청팀'], ['박민수', '남', '노랑팀']]), { t, members, personOf });
  ok(bad.errors.some((e) => /청팀·백팀·홍팀만/.test(e)) && !bad.patch, '청백전에 다른 팀 이름은 막는다');
  const red2 = parseImport(sheets([['김철수', '남', '청팀'], ['박민수', '남', '홍팀']]), { t, members, personOf });
  ok(red2.errors.some((e) => /홍팀을 쓰려면/.test(e)), '청·홍 2팀은 안 된다(2팀은 청·백)');
}

section('사람 찾기 — 회원·게스트·동명이인');
{
  const t = { id: 't2', name: '리그', format: 'team_league', stage: 'league', roster: [{ id: 'g_old', name: '옛게스트', gender: 'F', guest: true }],
    league: { teams: [{ players: [] }, { players: [] }], config: { teamNames: ['', ''] } } };
  const r = parseImport(sheets([
    ['정우성', '남', 'A'], ['옛 게스트', '', 'B'], ['새손님', '여', 'B', '2부'], ['이영희', '남', 'A'], ['탈퇴자', '남', 'A'],
  ]), { t, members, personOf });
  eq('오류 없음', r.errors, []);
  const ro = r.patch.roster;
  ok(ro[0].id === 'u5', '띄어쓰기 달라도 회원으로(정 우성)');
  ok(ro[1].id === 'g_old', '지금 대회의 게스트는 그대로(같은 id)');
  ok(ro[2].guest && ro[2].gender === 'F' && ro[2].busu === '2부' && /^g_/.test(ro[2].id), '새 사람은 게스트(성별·부수)');
  ok(ro[3].id === 'u2' && ro[3].gender === 'F' && r.warnings.some((w) => /이영희.*회원 정보\(여\)/.test(w)), '성별이 다르면 회원 정보를 쓰고 알림');
  ok(ro[4].guest, '탈퇴한 회원 이름은 회원으로 잡지 않는다');
  eq('팀 이름: 지금 이름(A팀·B팀)에 맞춘다', r.patch.league.config.teamNames, ['A팀', 'B팀']);
  const dup = parseImport(sheets([['동명이', '남', 'A'], ['김철수', '남', 'A'], ['김철수', '남', 'B'], ['모름', '', 'B'], ['아무개', '중', 'B']]), { t, members, personOf });
  ok(dup.errors.some((e) => /「동명이」 이름의 회원이 2명/.test(e)), '같은 이름 회원이 둘이면 막는다');
  ok(dup.errors.some((e) => /4번째 줄.*3번째 줄에도/.test(e)), '엑셀 안 같은 이름 두 줄');
  ok(dup.errors.some((e) => /「모름」.*성별을 적어/.test(e)), '게스트는 성별이 꼭 있어야');
  ok(dup.errors.some((e) => /성별은 「남」 또는 「여」/.test(e)), '이상한 성별 글자');
  ok(dup.patch === null && dup.summary === null, '오류가 있으면 저장할 것이 없다');
  const none = parseImport({ Sheet1: [['a']] }, { t, members, personOf });
  ok(none.errors[0].includes('「참가자」 시트가 없습니다'), '참가자 시트가 없으면');
  const head = parseImport({ 참가자: [['이름 ', '팀']] }, { t, members, personOf });
  ok(head.errors.some((e) => /「성별」 칸이 없습니다/.test(e)), '제목 줄 칸이 빠지면');
}

section('팀 리그 — 대진 검사');
{
  const t = { id: 't3', format: 'team_league', stage: 'league', roster: [], courts: 2, rosterVer: 4,
    league: { teams: [{ players: [] }, { players: [] }, { players: [] }], config: { teamNames: ['', '', ''], roundTypes: { 1: 'MX' } } } };
  const people = [['김철수', '남', 'A팀'], ['이영희', '여', 'A팀'], ['박민수', '남', 'B팀'], ['최지은', '여', 'B팀'], ['정우성', '남', 'C팀'], ['한가인', '여', 'C팀'], ['손님', '남', '']];
  const r = parseImport(sheets(people, [
    [1, 1, '김철수', '이영희', '박민수', '최지은', 6, 4],
    [1, 2, '정우성', '', '손님2', ''],
  ]), { t, members, personOf });
  ok(r.errors.some((e) => /「손님2」이\(가\) 참가자 시트에 없습니다/.test(e)), '참가자에 없는 이름');
  const good = parseImport(sheets(people, [
    [2, 1, '정우성', '한가인', '김철수', '이영희'],
    [1, 1, '김철수', '이영희', '박민수', '최지은', 6, 4],
    [1, 3, '정우성', '', '박민수2', ''].slice(0, 0).concat([]),
    ['', '', '', '', '', ''],
    [3, 4, '최지은', '', '한가인', ''],
  ]), { t, members, personOf });
  eq('오류 없음(빈 줄은 건너뜀)', good.errors, []);
  eq('경기 순서·팀 번호', good.patch.league.matches.map((m) => [m.id, m.teamAIdx, m.teamBIdx, m.typeKey, m.score]), [
    ['xl-1-1', 0, 1, 'MX', { a: 6, b: 4 }], ['xl-2-1', 2, 0, 'MX', null], ['xl-3-4', 1, 2, 'SG', null]]);
  ok(good.patch.league.config.rounds === 3 && good.patch.league.config.courts === 4 && good.patch.courts === 4 && good.patch.league.config.roundTypes[1] === 'MX', '타임·코트 수, 다른 설정은 그대로');
  ok(good.patch.rosterVer === 5 && good.patch.league.unassigned.length === 1 && good.summary.done === 1 && good.summary.games === 3, '미배정·숫자');
  const errs = parseImport(sheets(people, [
    [1, 1, '김철수', '', '박민수', ''],
    [1, 1, '이영희', '', '최지은', ''],
    [2, 1, '김철수', '박민수', '정우성', '한가인'],
    [2, 2, '김철수', '', '이영희', ''],
    [3, 1, '김철수', '이영희', '박민수', ''],
    [3, 2, '손님', '', '정우성', ''],
    [4, 1, '정우성', '', '박민수', '', 6, ''],
    ['x', 1, '정우성', '', '박민수', ''],
    [5, 1, '정우성', '', '박민수', ''],
    [5, 2, '정우성', '', '최지은', ''],
    [6, 1, '정우성', '', '정우성', ''],
    [7, 0, '정우성', '', '박민수', ''],
    [8, 1, '', '', '박민수', ''],
  ]), { t, members, personOf });
  const has = (re, m) => ok(errs.errors.some((e) => re.test(e)), m);
  has(/1타임 1코트가 \d+번째 줄과 겹칩니다/, '같은 타임·코트 두 경기');
  has(/한쪽\(A 또는 B\)에 다른 팀 사람/, '한쪽에 다른 팀 사람');
  has(/A와 B가 같은 팀\(A팀\)/, '같은 팀끼리');
  has(/한쪽은 2명, 다른 쪽은 1명/, '인원이 다른 경기');
  has(/「손님」은\(는\) 팀이 없습니다/, '팀 없는 사람');
  has(/점수는 양쪽 다 숫자로/, '점수 한쪽만');
  has(/타임은 1 이상 숫자/, '타임 숫자 아님');
  has(/「정우성」이\(가\) 5타임에 \d+번째 줄 경기에도/, '한 타임에 두 경기');
  has(/같은 사람이 한 경기에 두 번/, '한 경기에 같은 사람');
  has(/코트는 1 이상 숫자/, '코트 0');
  has(/A·B 양쪽에 선수가 있어야/, '한쪽이 빈 경기');
  ok(errs.errors.every((e) => /^\[대진\] \d+번째 줄/.test(e)), '오류마다 시트·줄 번호');
  const many = parseImport(sheets(people, Array.from({ length: 60 }, (_, i) => [i + 1, 1, '없는사람', '', '박민수', ''])), { t, members, personOf });
  eq('오류는 40개까지만', many.errors.length, 40);
  const nine = parseImport(sheets(Array.from({ length: 9 }, (_, i) => [`게스트${i}`, '남', `${i}조`])), { t, members, personOf });
  ok(nine.errors.some((e) => /팀은 8개까지/.test(e)), '팀은 8개까지');
}

section('교류전 — 상대 클럽은 게스트');
{
  const t = { id: 't4', format: 'club_match', stage: 'team', roster: [], team: { opponentClub: '한강클럽', teamA: [], teamB: [], matches: [] } };
  eq('팀 이름', importTarget(t).names, ['우리 클럽', '한강클럽']);
  const r = parseImport(sheets([['김철수', '남', '우리 클럽'], ['이영희', '여', '우리클럽'], ['김철수2', '남', '한강클럽'], ['박민수', '남', '한강클럽']],
    [[1, 1, '김철수2', '', '김철수', '', 6, 1]]), { t, members, personOf });
  eq('오류 없음', r.errors, []);
  ok(r.patch.team.teamA.map((p) => p.id).join() === 'u1,u2' && r.patch.team.teamB.every((p) => p.guest && p.club === '한강클럽'), '우리 회원 · 상대는 이름이 회원과 같아도 게스트(박민수)');
  eq('상대가 A쪽에 적혀도 우리 클럽이 왼쪽', [r.patch.team.matches[0].teamA, r.patch.team.matches[0].score], [['u1'], { a: 1, b: 6 }]);
  eq('상대 클럽 이름', r.patch.team.opponentClub, '한강클럽');
  const two = parseImport(sheets([['김철수', '남', '우리 클럽'], ['a', '남', '한강'], ['b', '남', '두레']]), { t, members, personOf });
  ok(two.errors.some((e) => /상대 클럽 하나뿐/.test(e)), '상대 클럽이 둘이면 막는다');
}

section('화면 연결');
{
  const ui = readFileSync(new URL('../src/components/TournamentImport.jsx', import.meta.url), 'utf8');
  ok(/requireOptionalNativeModule\('ExpoDocumentPicker'\)/.test(ui) && /requireOptionalNativeModule\('ExpoSharing'\)/.test(ui), '옛 앱(모듈 없음)에서는 버튼 대신 안내 — 앱이 꺼지지 않게');
  ok(!/^import .*expo-document-picker|^import .*expo-sharing/m.test(ui), '파일 고르기·보내기 모듈은 쓸 때만 불러온다');
  ok(/parseFor\(/.test(ui) && /templateFor\(/.test(ui) && /Alert\.alert/.test(ui) && /onPatch\(/.test(ui), '양식 받기 · 미리 보기 · 확인 후 저장(대회 방식에 맞는 양식)');
  ok(/errors\.length/.test(ui) && /disabled=\{!!preview\.errors\.length|preview\.errors\.length \?/.test(ui), '오류가 있으면 저장 버튼을 막는다');
  const ts = readFileSync(new URL('../src/components/TournamentScreen.jsx', import.meta.url), 'utf8');
  ok(/<TournamentImport clubId=\{clubId\} t=\{t\} members=\{members\} flash=\{flash\}/.test(ts), '대회 운영 묶음에 엑셀로 불러오기');
  ok(/isAdmin && !opsExtra && t\.stage === 'draw' && \(\s*<TournamentImport/.test(ts) && /TournamentDraw key=\{`\$\{t\.id\}-\$\{t\.rosterVer \|\| 0\}/.test(ts), '조별리그·토너먼트 대회에도(운영진) · 불러온 뒤 화면을 다시 읽는다');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  ok(pkg.dependencies['expo-document-picker'] && pkg.dependencies['expo-sharing'] && pkg.dependencies.fflate, '필요한 모듈');
}

section('엑셀 작업 링크 — 지금 깔린 앱에서 (웹으로 내려받기·올리기)');
{
  const X = await import('../src/lib/excelJob.js');
  eq('링크', X.excelUrl('p1', 'c1', 'j/1'), 'https://p1.web.app/excel?c=c1&j=j%2F1');
  ok(X.validId('AbC_-9') && !X.validId('a/b') && !X.validId('') && !X.validId('x'.repeat(65)), '일감·클럽 id 모양');
  ok(X.jobOpen({ expiresAt: 2000 }, 1000).ok && !X.jobOpen({ expiresAt: 1000 }, 2000).ok && /시간이 지났/.test(X.jobOpen({ expiresAt: 1 }, 2).message) && !X.jobOpen(null).ok, '3시간 지나면 닫힌다');
  const picked = X.pickImportSheets({ ' 참가자 ': [['이름', '성별'], ['가', '남', ...Array(30).fill('x')], ['y'.repeat(300)]], 안내: [['a']], 본선: [['b']], 대진: [[1, true]] });
  ok(Object.keys(picked.sheets).join() === '참가자,본선,대진' && picked.sheets['참가자'][1].length === 20 && picked.sheets['참가자'][2][0].length === 100 && picked.sheets['대진'][0][1] === true, '안내만 빼고 · 칸·글자 수 자르기');
  eq('시트는 8개까지', Object.keys(X.pickImportSheets(Object.fromEntries([['참가자', []], ...Array.from({ length: 12 }, (_, i) => [`s${i}`, []])])).sheets).length, 8);
  eq('JSON 으로 담는다(문서에 배열 안 배열을 못 넣어서)', JSON.parse(picked.json)['대진'], [[1, true]]);
  ok(/참가자」 시트가 없습니다/.test(X.pickImportSheets({ Sheet1: [] }).error), '참가자 시트가 없으면');
  ok(/too|많습니다/.test(X.pickImportSheets({ 참가자: Array.from({ length: 600 }, () => Array(20).fill('가'.repeat(100))) }).error || ''), '너무 크면 거절');
  ok(/filename\*=UTF-8''%EA%B0%80/.test(X.attachmentHeader('가.xlsx')) && !/\r|\n/.test(X.attachmentHeader('a\r\nb')), '내려받기 파일 이름(한글)');
  /* 웹으로 올린 것과 같은 길: 양식 → 파일 → 서버가 읽어 JSON → 앱이 해석 */
  const t = { id: 't9', name: '웹 시험', format: 'blue_white', stage: 'team', roster: [], team: { teamA: [], teamB: [], matches: [] } };
  const server = X.pickImportSheets(readXlsx(writeXlsx([
    { name: '참가자', rows: [['이름', '성별', '팀'], ['김철수', '남', '청팀'], ['손님', '여', '백팀']] },
    { name: '대진', rows: [['타임', '코트', 'A선수1', 'A선수2', 'B선수1', 'B선수2', 'A점수', 'B점수'], [1, 1, '김철수', '', '손님', '', 6, 3]] },
  ])));
  const r = parseImport(JSON.parse(server.json), { t, members, personOf });
  ok(!r.errors.length && r.patch.team.matches[0].score.a === 6 && r.patch.roster.length === 2, '서버를 거쳐도 같은 결과');

  const fx = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const body = fx.slice(fx.indexOf('exports.excelJob'), fx.indexOf('exports.excelJob') + 4000);
  ok(/onRequest\(/.test(body) && /X\.jobOpen\(job\)/.test(body) && /EXCEL_MAX_BYTES/.test(body) && /pickImportSheets/.test(body), '서버: 일감 확인 · 크기 제한 · 쓸 시트만');
  ok(!/collection\('tournaments'\)/.test(body) && /importJobs/.test(body), '서버는 대회를 건드리지 않는다(일감에만 적는다)');
  ok(/'excelJob\.js', 'xlsxLite\.js'/.test(readFileSync(new URL('./copy-functions-shared.mjs', import.meta.url), 'utf8'))
    && JSON.parse(readFileSync(new URL('../functions/package.json', import.meta.url), 'utf8')).dependencies.fflate, '서버로 복사 · 서버에 fflate');
  ok(!/^import /m.test(readFileSync(new URL('../src/lib/excelJob.js', import.meta.url), 'utf8')), 'excelJob.js 는 혼자 선다');
  const fb = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  ok(fb.hosting.rewrites.some((r) => r.source === '/api/excel' && r.function.functionId === 'excelJob'), '호스팅 /api/excel → excelJob');
  ok(/'excel\.html'/.test(readFileSync(new URL('./build-legal.mjs', import.meta.url), 'utf8')), '웹 페이지(/excel)를 배포에 싣는다');
  const page = readFileSync(new URL('../web/excel.html', import.meta.url), 'utf8');
  ok(/&file=template/.test(page) && /method: 'POST'/.test(page) && /application\/octet-stream/.test(page) && /\[이대로 저장\]/.test(page), '웹: 양식 내려받기 · 올리기 · 저장은 앱에서');
  ok(!/<script src=|<link [^>]*href="http/.test(page), '웹: 바깥 라이브러리 없음(카톡 안 브라우저)');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const rj = rules.slice(rules.indexOf('match /importJobs/'), rules.indexOf('match /importJobs/') + 900);
  ok(/allow read: if isClubAdmin\(clubId\)/.test(rj) && /request\.resource\.data\.by == request\.auth\.uid/.test(rj) && /status == 'waiting'/.test(rj) && !/allow update/.test(rj.split('\n      }')[0]), '규칙: 운영진이 만들고, 올라온 내용은 서버만 적는다');
  const ui = readFileSync(new URL('../src/components/TournamentImport.jsx', import.meta.url), 'utf8');
  ok(/createExcelJob\(clubId/.test(ui) && /subExcelJob\(clubId, job\.id/.test(ui) && /JSON\.parse\(d\.sheetsJson\)/.test(ui) && /Share\.share/.test(ui), '앱: 링크 만들기 · 보내기 · 올라오면 미리 보기');
  ok(/\{ready && \(/.test(ui) && ui.indexOf('makeLink') < ui.indexOf('{ready && ('), '앱: 링크 길은 늘, 휴대폰 바로 고르기는 새 앱에서만');
}

section('조별리그 · 토너먼트 — 양식 → 그대로 올리기');
{
  const { buildBracketTemplate, parseBracketImport, bracketSupport, eventKeyOf, groupNameOf } = await import('../src/lib/bracketImport.js');
  const { importKind, templateFor } = await import('../src/lib/excelImport.js');
  const { drawAll } = await import('../src/lib/groupLeague.js');
  const { buildBracket, applyResult } = await import('../src/lib/tournament.js');
  eq('부 이름', ['남복', '남자복식', 'md', '혼복', '단식', '', '배드민턴'].map(eventKeyOf), ['MD', 'MD', 'MD', 'XD', 'OS', '', null]);
  eq('조 이름', ['A', 'b조', '3', ' C 조 ', '', '가', '0'].map(groupNameOf), ['A조', 'B조', 'C조', 'C조', '', null, null]);
  const roster = [...Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `남${i}`, gender: 'M', skill: 3 })), ...Array.from({ length: 4 }, (_, i) => ({ id: `w${i}`, name: `여${i}`, gender: 'F', skill: 3 }))];
  const d = drawAll(roster, { groupCount: 2, advance: 2, knockout: true }, ['MD', 'WD'], { courts: 3 }, () => 0.5);
  d.groups[0].matches[0].score = { a: 6, b: 3 };
  const md = d.entries.filter((e) => e.div === 'MD');
  let br = buildBracket(md.map((e) => e.id));
  br = applyResult(br, br.rounds[0].matches[0].id, 6, 2);
  const t = { id: 't', name: '봄 대회', date: '2026-11-01', stage: 'draw', format: 'group_bracket', events: ['MD', 'WD'], roster, guests: [], entries: d.entries, groups: d.groups,
    ko: { MD: { bracket: br, championId: null } }, courts: 3, rules: { groupCount: 2, advance: 2, knockout: true, groupAdvance: { [d.groups[0].id]: 1, gone: 2 } }, rosterVer: 2 };
  eq('대회 방식 고르기', [importKind(t), importKind({ stage: 'league' }), typeof importKind({ stage: 'draw', rules: { format: 'kdk' } }), typeof importKind({ stage: 'knockout' })], ['bracket', 'team', 'object', 'object']);
  ok(!bracketSupport({ stage: 'draw', kdk: { MD: { matches: [{}] } } }).ok, 'KDK 개인전은 아직');
  const tpl = buildBracketTemplate(t);
  eq('양식 시트', tpl.map((x) => x.name), ['안내', '참가자', '팀', '조별경기', '본선']);
  ok(templateFor(t)[2].name === '팀', '대회 방식에 맞는 양식');
  eq('팀 줄', tpl[2].rows[1].slice(0, 2).concat(tpl[2].rows[1][2] ? 'x' : ''), ['남복', d.groups[0].name, 'x']);
  ok(tpl[4].rows.some((r) => r[1] === '준결승' && r[7] === 6) && tpl[4].rows.some((r) => r[1] === '결승'), '본선 줄(라운드 이름·점수)');
  const r = parseBracketImport(readXlsx(writeXlsx(tpl)), { t, members: [] });
  eq('오류 없음', r.errors, []);
  ok(r.patch.entries.every((e) => d.entries.some((o) => o.id === e.id)) && r.patch.groups.map((g) => g.id).join() === d.groups.map((g) => g.id).join(), '팀·조 id 그대로(다시 올려도 같은 팀)');
  ok(r.patch.groups[0].matches.find((m) => m.id === d.groups[0].matches[0].id)?.score?.a === 6, '조별 결과 그대로');
  const k = r.patch.ko.MD.bracket;
  ok(k.rounds[0].matches[0].a === br.rounds[0].matches[0].a && k.rounds[0].matches[0].score.a === 6 && k.rounds[1].matches[0].a === br.rounds[1].matches[0].a, '본선: 자리·결과·올라간 팀 그대로');
  ok(!r.patch.ko.WD && r.summary.kind === 'bracket' && r.summary.divs.length === 2 && r.patch.rosterVer === 3, '본선이 없는 부는 비워 둔다(조별리그 뒤 앱에서) · 숫자');
  eq('조별 진출 지정은 남은 조만', r.patch.rules.groupAdvance, { [d.groups[0].id]: 1 });
}

section('조별리그 · 토너먼트 — 새로 적어 올리기');
{
  const { parseBracketImport } = await import('../src/lib/bracketImport.js');
  const P = (id, name, g) => ({ id, name, gender: g, status: '활동' });
  const mem = [P('a', '김일', 'M'), P('b', '김이', 'M'), P('c', '김삼', 'M'), P('d', '김사', 'M'), P('e', '이일', 'F'), P('f', '이이', 'F'), P('g', '김오', 'M'), P('h', '김육', 'M')];
  const t = { id: 't2', stage: 'draw', format: 'group_bracket', events: ['MD', 'XD'], roster: [], guests: [], entries: [], groups: [], ko: {}, courts: 2, rules: { groupCount: 1, knockout: true } };
  const people = [['이름', '성별'], ...mem.map((m) => [m.name, m.gender === 'F' ? '여' : '남']), ['손님', '여']];
  const teams = [['부', '조', '선수1', '선수2'], ['남복', 'A', '김일', '김이'], ['남복', 'A', '김삼', '김사'], ['남복', 'B', '김오', '김육'], ['남복', 'B', '김일2', '']];
  const bad = parseBracketImport({ 참가자: people, 팀: teams }, { t, members: mem });
  ok(bad.errors.some((e) => /「김일2」이\(가\) 참가자 시트에 없습니다/.test(e)), '참가자에 없는 선수');
  const t2 = [['부', '조', '선수1', '선수2'], ['남복', 'A', '김일', '김이'], ['남복', 'A', '김삼', '김사'], ['남복', 'B', '김오', '김육'], ['남복', 'B', '김일', '김오'], ['혼복', 'A', '김일', '이일'], ['혼복', 'A', '김이', '손님'], ['남복', '', '김삼', ''], ['배구', 'A', '김일', '김이']];
  const e2 = parseBracketImport({ 참가자: people, 팀: t2 }, { t, members: mem });
  ok(e2.errors.some((e) => /「김일」이\(가\) 남복에서 2번째 줄 팀에도/.test(e)), '한 부에서 두 팀에 든 사람');
  ok(e2.errors.some((e) => /남자복식는 한 팀이 2명/.test(e)), '복식인데 한 명');
  ok(e2.errors.some((e) => /「배구」은\(는\) 모르는 부/.test(e)), '모르는 부');
  /* 조별경기를 비우면 자동으로 — 조마다 풀리그 + 시간표 */
  const okTeams = [['부', '조', '선수1', '선수2', '시드'], ['남복', 'A', '김일', '김이', 1], ['남복', 'A', '김삼', '김사'], ['남복', 'A', '김오', '김육'], ['혼복', 'A', '김일', '이일'], ['혼복', 'A', '김이', '손님'], ['혼복', 'A', '김삼', '이이']];
  const auto = parseBracketImport({ 참가자: people, 팀: okTeams, 조별경기: [['부', '조', '타임', '코트']], 본선: [['부', '라운드']] }, { t, members: mem });
  eq('오류 없음', auto.errors, []);
  ok(auto.summary.auto && auto.patch.groups.length === 2 && auto.patch.groups.every((g) => g.matches.length === 3 && g.matches.every((m) => m.round && m.court)), '조별경기를 비우면 풀리그·시간표 자동');
  ok(auto.patch.guests.length === 1 && auto.patch.guests[0].name === '손님' && auto.patch.roster.some((p) => p.guest && p.name === '손님'), '게스트는 명단·게스트 목록에 함께');
  ok(auto.patch.entries[0].seed === 1 && auto.patch.entries[0].name === '김일 / 김이' && auto.patch.entries.every((e) => e.div), '팀 이름·시드·부');
  eq('부 목록', auto.patch.events, ['MD', 'XD']);
  ok(auto.warnings.some((w) => /이이.*혼합복식에 맞지 않는|김삼 \/ 이이/.test(w)) === false, '혼복 남녀 짝은 경고 없음');
  /* 조별경기를 직접 */
  const games = [['부', '조', '타임', '코트', 'A선수1', 'A선수2', 'B선수1', 'B선수2', 'A점수', 'B점수'],
    ['남복', 'A', 1, 1, '김일', '김이', '김삼', '김사', 6, 2], ['남복', 'A', 2, 1, '김일', '김이', '김오', '김육'], ['남복', 'A', 3, 1, '김삼', '김사', '김오', '김육'],
    ['혼복', 'A', 1, 2, '김오', '이일', '김이', '손님']];
  const ex = parseBracketImport({ 참가자: people, 팀: okTeams, 조별경기: games }, { t, members: mem });
  ok(ex.errors.some((e) => /「김오 \/ 이일」 팀이 「팀」 시트\(혼복\)에 없습니다/.test(e)), '없는 팀(짝이 다름)');
  const ex2 = parseBracketImport({ 참가자: people, 팀: okTeams, 조별경기: [...games.slice(0, 4), ['혼복', 'A', 1, 2, '김일', '이일', '김이', '손님'], ['혼복', 'A', 7, 2, '김이', '손님', '김삼', '이이', 3, 3]] }, { t, members: mem });
  ok(ex2.errors.some((e) => /「김일」이\(가\) 1타임에 \d+번째 줄 경기에도/.test(e)), '남복·혼복에 같은 타임 겹침');
  ok(ex2.errors.some((e) => /무승부가 없습니다/.test(e)), '조별 무승부');
  const ex3 = parseBracketImport({ 참가자: people, 팀: okTeams, 조별경기: [...games.slice(0, 4), ['혼복', 'A', 4, 2, '김일', '이일', '김이', '손님', 6, 1], ['혼복', 'A', 5, 2, '김이', '손님', '김삼', '이이'], ['혼복', 'A', 6, 2, '김일', '이일', '김삼', '이이']] }, { t, members: mem });
  eq('직접 적은 조별경기', ex3.errors, []);
  ok(!ex3.summary.auto && ex3.patch.groups[0].matches[0].score.a === 6 && ex3.patch.groups[1].matches.find((m) => m.round === 4).score.b === 1, '타임·코트·점수 그대로');
  const miss = parseBracketImport({ 참가자: people, 팀: okTeams, 조별경기: games.slice(0, 2) }, { t, members: mem });
  ok(miss.errors.some((e) => /혼합복식 A조 경기가 없습니다/.test(e)), '직접 적으면 모든 조를 적어야');
  /* 본선 — 1라운드 자리 + 점수 */
  const tko = { ...t, useGroupStage: false, events: ['MD'] };
  const kTeams = [['부', '조', '선수1', '선수2'], ['', '', '김일', '김이'], ['', '', '김삼', '김사'], ['', '', '김오', '김육']];
  const autoKo = parseBracketImport({ 참가자: people, 팀: kTeams }, { t: tko, members: mem });
  eq('토너먼트만 — 본선을 비우면 팀 순서로(부전승)', [autoKo.errors, autoKo.patch.ko.MD.bracket.rounds.length, autoKo.patch.groups.length], [[], 2, 0]);
  const ko = [['부', '라운드', '경기', 'A선수1', 'A선수2', 'B선수1', 'B선수2', 'A점수', 'B점수'],
    ['남복', '4강', 1, '김일', '김이', '', '', '', ''], ['남복', '4강', 2, '김삼', '김사', '김오', '김육', 3, 6], ['남복', '결승', 1, '김일', '김이', '김오', '김육', 6, 4]];
  const withKo = parseBracketImport({ 참가자: people, 팀: kTeams, 본선: ko }, { t: tko, members: mem });
  eq('본선 오류 없음', withKo.errors, []);
  const kb = withKo.patch.ko.MD;
  ok(kb.bracket.rounds[0].matches[0].winner && kb.bracket.rounds[1].matches[0].score.a === 6 && kb.championId === kb.bracket.rounds[0].matches[0].a, '부전승 · 결과 · 우승');
  const swapped = parseBracketImport({ 참가자: people, 팀: kTeams, 본선: [...ko.slice(0, 3), ['남복', '결승', 1, '김오', '김육', '김일', '김이', 4, 6]] }, { t: tko, members: mem });
  const champ = (x) => x.patch.entries.find((e) => e.id === x.patch.ko.MD.championId)?.name;
  ok(!swapped.errors.length && champ(swapped) === champ(withKo) && champ(withKo) === '김일 / 김이', '결승 양쪽을 거꾸로 적어도 같은 결과');
  const wrong = parseBracketImport({ 참가자: people, 팀: kTeams, 본선: [...ko.slice(0, 3), ['남복', '결승', 1, '김삼', '김사', '김일', '김이', 6, 4]] }, { t: tko, members: mem });
  ok(wrong.errors.some((e) => /앞 라운드 결과로 올라온 팀과 다릅니다/.test(e)), '진 팀이 다음 라운드에 적히면');
  const early = parseBracketImport({ 참가자: people, 팀: kTeams, 본선: [ko[0], ko[1], ['남복', '4강', 2, '김삼', '김사', '김오', '김육'], ['남복', '결승', 1, '', '', '', '', 6, 4]] }, { t: tko, members: mem });
  ok(early.errors.some((e) => /아직 양쪽 팀이 정해지지 않은/.test(e)), '앞 경기 결과 없이 결승 점수');
  const holes = parseBracketImport({ 참가자: people, 팀: kTeams, 본선: [ko[0], ko[1]] }, { t: tko, members: mem });
  ok(holes.errors.some((e) => /경기 1 ~ 2을 한 줄씩 모두/.test(e)), '1라운드 줄이 빠지면');
  const r9 = parseBracketImport({ 참가자: people, 팀: kTeams, 본선: [ko[0], ko[1], ko[2], ['남복', '9강', 1, '', '', '', '', '', '']] }, { t: tko, members: mem });
  ok(r9.errors.some((e) => /라운드는/.test(e)), '이상한 라운드 이름');
}

console.log(`\n엑셀 불러오기 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
