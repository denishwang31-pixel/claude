/* ============================================================
   샘플 팀 리그 넣기·지우기 — GitHub Actions 「테니스매치 샘플 대회」에서 돈다

   무엇을 하나
     다른 도구로 짠 단체전 대진(kunnbledun_schedule 모양 JSON)을 클럽의
     **새 대회 문서 하나**로 넣는다. 앱의 [팀 리그] 화면에서 그대로 열린다.

   ⚠️ 건드리는 것은 그 문서 하나뿐이다.
      · 기존 대회·회원·클럽 설정은 읽기만 한다(클럽을 이름으로 찾을 때)
      · 회원 문서를 만들지 않는다 — 선수는 대회 문서 안에만 있다
      · 대회 문서에는 sample:true 와 sampleKey 를 붙인다. 지울 때는
        이 둘이 맞는 문서만 지운다(같은 이름의 진짜 대회는 지우지 않는다)
      · 대회를 만들어도 알림을 보내는 서버 함수는 없다

   ⚠️ 저장소가 공개라 명단은 암호화한 파일(data/*.enc.json)로만 둔다.
      열쇠는 workflow 입력으로 받고 로그에서 가린다. 로그에는 이름을 찍지 않고 숫자만.

   입력(환경 변수)
     SAMPLE_ACTION  dry(확인만) | create(넣기·다시 넣기) | remove(지우기)
     SAMPLE_CLUB    클럽 이름 (예: 써티포티)
     SAMPLE_TITLE   대회 이름 (예: [샘플] 쿤블던)
     SAMPLE_FILE    암호화한 데이터 파일 경로
     SAMPLE_PASS    열쇠
   ============================================================ */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

/* ---------------- 암호화 (AES-256-GCM, 열쇠는 scrypt) ---------------- */
function keyOf(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 32);
}
function encrypt(obj, pass) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(pass, salt), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function decrypt(box, pass) {
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(pass, Buffer.from(box.salt, 'base64')), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  const out = Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]);
  return JSON.parse(out.toString('utf8'));
}

/* ---------------- 대진 → 앱의 팀 리그 모양 ---------------- */
/* 앱의 팀 리그는 팀 이름을 순서로 붙인다(A팀 파랑 · B팀 빨강 · C팀 초록 …).
   색이 맞게 청 → A, 홍 → B, 백 → C 순으로 세운다. 그 밖의 팀은 나온 순서대로. */
const TEAM_ORDER = ['청팀', '홍팀', '백팀'];
const TYPE = { WD: { key: 'WD', name: '여복' }, MD: { key: 'MD', name: '남복' }, XD: { key: 'MX', name: '혼복' } };

/** 원본 JSON 에서 필요한 것만 — 짝 희망(preference_claims) 같은 것은 버린다 */
function slim(src) {
  const rows = Array.isArray(src?.schedule) ? src.schedule : [];
  return rows.map((m) => ({
    round: Number(m.round),
    time: String(m.time || ''),
    court: String(m.court || ''),
    sport: String(m.sport || m.scheduled_sport || ''),
    a: { team: m.pair_a.team, ids: m.pair_a.player_ids, names: m.pair_a.players },
    b: { team: m.pair_b.team, ids: m.pair_b.player_ids, names: m.pair_b.players },
  }));
}

/** 경기에서 성별을 읽는다 — 여복이면 둘 다 여, 남복이면 둘 다 남, 혼복은 남·여 한 명씩(나머지에서 정한다) */
function genders(matches) {
  const g = {};
  matches.forEach((m) => [m.a, m.b].forEach((p) => {
    if (m.sport === 'WD') p.ids.forEach((id) => { g[id] = 'F'; });
    if (m.sport === 'MD') p.ids.forEach((id) => { g[id] = 'M'; });
  }));
  /* 혼복만 뛴 사람 — 짝이 정해졌으면 그 반대 */
  for (let i = 0; i < 3; i += 1) {
    matches.forEach((m) => {
      if (m.sport !== 'XD') return;
      [m.a, m.b].forEach((p) => {
        const [x, y] = p.ids;
        if (g[x] && !g[y]) g[y] = g[x] === 'M' ? 'F' : 'M';
        if (g[y] && !g[x]) g[x] = g[y] === 'M' ? 'F' : 'M';
      });
    });
  }
  return g;
}

/**
 * @returns {{ roster, league, stats }}  league = 앱 TeamLeagueScreen 이 읽는 {teams, matches, config}
 */
function toLeague(rows) {
  const teamNames = [...new Set(rows.flatMap((m) => [m.a.team, m.b.team]))]
    .sort((x, y) => {
      const ix = TEAM_ORDER.indexOf(x); const iy = TEAM_ORDER.indexOf(y);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || String(x).localeCompare(String(y));
    });
  const g = genders(rows);
  const players = {};
  rows.forEach((m) => [m.a, m.b].forEach((p) => p.ids.forEach((id, i) => {
    if (!players[id]) players[id] = { id, name: String(p.names[i] || '?').slice(0, 20), gender: g[id] || '', team: p.team };
  })));
  const teams = teamNames.map((tn) => Object.values(players)
    .filter((p) => p.team === tn)
    .map(({ id, name, gender }) => ({ id, name, gender, busu: '', grade: '', ntrp: null })));
  const courtLetters = [...new Set(rows.map((m) => m.court))].sort();
  const matches = rows
    .slice()
    .sort((x, y) => x.round - y.round || courtLetters.indexOf(x.court) - courtLetters.indexOf(y.court))
    .map((m) => {
      const t = TYPE[m.sport] || TYPE.XD;
      const court = courtLetters.indexOf(m.court) + 1;
      return {
        id: `lg-${m.round}-${court}`,
        round: m.round,
        court,
        time: m.time,
        league: true,
        teamAIdx: teamNames.indexOf(m.a.team),
        teamBIdx: teamNames.indexOf(m.b.team),
        typeKey: t.key,
        type: t.name,
        teamA: m.a.ids.slice(),
        teamB: m.b.ids.slice(),
        score: null,
      };
    });
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  const roundTimes = {};
  rows.forEach((m) => { roundTimes[m.round] = m.time; });
  return {
    roster: teams.flat(),
    league: { teams, matches, config: { courts: courtLetters.length, rounds, roundTypes: {}, roundTimes, courtLetters } },
    stats: {
      teams: teamNames.map((tn, i) => ({ as: ['A팀', 'B팀', 'C팀', 'D팀'][i] || `${i + 1}팀`, from: tn, players: teams[i].length })),
      players: Object.keys(players).length,
      matches: matches.length,
      rounds,
      courts: courtLetters.length,
      noGender: Object.values(players).filter((p) => !p.gender).length,
    },
  };
}

/* ---------------- 실행 ---------------- */
async function main() {
  const action = String(process.env.SAMPLE_ACTION || 'dry').trim();
  const clubName = String(process.env.SAMPLE_CLUB || '').trim();
  const title = String(process.env.SAMPLE_TITLE || '').trim();
  const file = String(process.env.SAMPLE_FILE || '').trim();
  const pass = String(process.env.SAMPLE_PASS || '');
  if (!['dry', 'create', 'remove'].includes(action)) throw new Error(`모르는 동작: ${action}`);
  if (!clubName || !title) throw new Error('클럽 이름과 대회 이름을 넣어 주세요.');
  const sampleKey = crypto.createHash('sha256').update(`${clubName}|${title}`).digest('hex').slice(0, 16);

  let built = null;
  if (action !== 'remove') {
    if (!pass) throw new Error('열쇠(passphrase)를 넣어 주세요.');
    let data;
    try { data = decrypt(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')), pass); } catch (e) {
      throw new Error('데이터를 풀지 못했습니다 — 열쇠가 맞는지 확인해 주세요.');
    }
    built = toLeague(data.rows || []);
    const s = built.stats;
    console.log(`데이터: 선수 ${s.players}명 · 경기 ${s.matches} · ${s.rounds}타임 · 코트 ${s.courts}면 · 성별 모름 ${s.noGender}명`);
    s.teams.forEach((t) => console.log(`  앱의 ${t.as} = ${t.from} (${t.players}명)`));
  }

  const req = (m) => require(require.resolve(m, { paths: [path.join(__dirname, '..', 'functions')] }));
  const { initializeApp } = req('firebase-admin/app');
  const { getFirestore, FieldValue } = req('firebase-admin/firestore');
  initializeApp();
  const db = getFirestore();

  /* 클럽은 이름으로 찾는다 — 읽기만 */
  const clubs = await db.collection('clubs').where('name', '==', clubName).get();
  if (clubs.size !== 1) throw new Error(`이름이 「${clubName}」인 클럽이 ${clubs.size}개입니다. 정확히 하나여야 합니다.`);
  const clubRef = clubs.docs[0].ref;
  const col = clubRef.collection('tournaments');
  const mine = (await col.where('sampleKey', '==', sampleKey).get()).docs.filter((d) => d.data().sample === true);
  console.log(`클럽 찾음 · 이 샘플 대회: ${mine.length ? '있음' : '없음'}`);

  if (action === 'dry') {
    console.log('확인만 했습니다. 아무것도 바꾸지 않았습니다.');
    return;
  }
  if (action === 'remove') {
    for (const d of mine) await d.ref.delete();
    console.log(mine.length ? `샘플 대회 ${mine.length}개를 지웠습니다. 다른 것은 건드리지 않았습니다.` : '지울 샘플 대회가 없습니다.');
    return;
  }

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const doc = {
    name: title,
    date: today,
    format: 'team_league',
    stage: 'league',
    courts: built.league.config.courts,
    busuLimit: '',
    status: 'ongoing',
    roster: built.roster,
    league: built.league,
    entries: [], groups: [], bracket: null,
    sample: true,
    sampleKey,
    importedFrom: 'kunnbledun_schedule',
  };
  if (mine.length) {
    await mine[0].ref.set({ ...doc, createdAt: mine[0].data().createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    for (const d of mine.slice(1)) await d.ref.delete();
    console.log('있던 샘플 대회를 새 데이터로 다시 넣었습니다(점수는 비워짐).');
  } else {
    await col.add({ ...doc, createdAt: FieldValue.serverTimestamp() });
    console.log('샘플 대회를 넣었습니다. 앱 → 대회 목록에서 열어 보세요.');
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}

module.exports = { encrypt, decrypt, slim, toLeague, genders };
