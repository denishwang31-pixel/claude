/* ============================================================
   입금 대사 — 은행 거래내역을 붙여넣으면 미납자와 자동으로 맞춰 준다.

   왜 이 방식인가 (붙여넣기 파싱)
     은행 앱 알림을 가로채 읽는 방법도 있지만 쓰지 않는다.
       · iOS 는 타 앱 알림을 읽는 API 자체가 없다 → 아이폰 총무는 못 쓴다
       · 알림 접근 권한은 "앱의 핵심 기능일 때만" 허용된다. 대진표 앱이
         은행 알림을 수집해 서버로 보내면 스토어 심사에서 막힌다
       · 은행마다 문구가 다르고 앱이 업데이트되면 깨진다. 돈 문제라
         한 번 틀리면 신뢰가 끝난다
     붙여넣기는 iOS·안드로이드가 똑같이 동작하고, 권한이 필요 없고,
     총무가 결과를 눈으로 확인한 뒤 확정한다. 월 1회 30초면 끝난다.

   설계 원칙
     · 자동으로 체크하는 것은 "확실한 것"만. 애매하면 후보를 제시하고
       총무가 1탭으로 고른다. 임의로 맞히지 않는다.
     · 총무가 고친 결과는 별칭으로 남는다("김철수 = 김철수부인").
       다음 달부터는 그 이름도 자동으로 붙는다.
   ============================================================ */

/* ---------- 한글 이름 비교 ----------
   "황동현" vs "황동현외1", "김민서" vs "김민써" 처럼 조금씩 다른 입금자명을
   같은 사람으로 보려면 글자 단위가 아니라 자모 단위로 비교해야 한다.
   (김민서/김민써는 글자로는 1글자 차이지만 자모로는 받침 하나 차이다) */

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

/** 한글 문자열을 자모로 펼친다. 한글이 아니면 그대로 둔다. */
export function toJamo(str) {
  let out = '';
  for (const ch of String(str || '')) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) {
      out += CHO[Math.floor(code / 588)]
        + JUNG[Math.floor((code % 588) / 28)]
        + JONG[code % 28].trim();
    } else {
      out += ch;
    }
  }
  return out;
}

/** 편집 거리 (Levenshtein) */
export function editDistance(a, b) {
  const s = String(a || ''), t = String(b || '');
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[t.length];
}

/** 입금자명에서 군더더기를 걷어낸다 — "(주)", "홍길동외1", 공백 */
export function cleanName(raw) {
  return String(raw || '')
    .replace(/\(.*?\)/g, '')       // 괄호 안 설명
    .replace(/외\s*\d+\s*명?/g, '') // "외1", "외 2명"
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .trim();
}

/**
 * 이름 유사도 0~1.
 * 은행은 입금자명을 잘라 보내는 경우가 있어서(계좌주 5자 절삭 등),
 * 한쪽이 다른 쪽의 시작 부분이면 높은 점수를 준다.
 */
export function nameScore(a, b) {
  const x = cleanName(a), y = cleanName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  // 한쪽이 다른 쪽으로 시작 — 절삭된 이름
  if (x.startsWith(y) || y.startsWith(x)) {
    const short = Math.min(x.length, y.length);
    const long = Math.max(x.length, y.length);
    return short >= 2 ? 0.82 + 0.12 * (short / long) : 0.4;
  }

  const jx = toJamo(x), jy = toJamo(y);
  const dist = editDistance(jx, jy);
  const max = Math.max(jx.length, jy.length);
  const sim = max ? 1 - dist / max : 0;
  return sim < 0.5 ? 0 : sim * 0.9;   // 자모 유사도는 정확 일치보다 낮게
}

/* ---------- 거래내역 파싱 ---------- */

/** "30,000원", "30000", "₩30,000" → 30000 */
const toAmount = (s) => {
  const n = String(s || '').replace(/[^\d]/g, '');
  return n ? Number(n) : 0;
};

/** 여러 형태의 날짜를 YYYY-MM-DD 로. 연도가 없으면 기준연도를 쓴다. */
export function toDate(raw, baseYear = new Date().getFullYear()) {
  const s = String(raw || '').trim();
  let m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})[-./](\d{1,2})/);
  if (m) return `${baseYear}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

/** 출금으로 보이는 줄은 버린다 */
const WITHDRAW = /출금|이체출금|카드|결제|수수료|출금액/;
/** 표 머리글 줄 */
const HEADER = /거래일|날짜|적요|입금액|출금액|잔액|내용|기재/;

/**
 * 붙여넣은 거래내역을 {date, amount, name, raw} 목록으로.
 *
 * 은행마다 열 순서가 달라서 열 위치를 고정하지 않는다.
 * 한 줄에서 "가장 큰 숫자 = 잔액", "그 다음 숫자 = 금액", "한글 덩어리 = 이름"
 * 이라는 규칙 대신, 숫자 후보와 이름 후보를 모아 가장 그럴듯한 조합을 고른다.
 */
export function parseStatement(text, opts = {}) {
  const baseYear = opts.baseYear || new Date().getFullYear();
  const rows = [];

  String(text || '').split(/\r?\n/).forEach((line) => {
    const raw = line.trim();
    if (!raw) return;
    if (HEADER.test(raw) && !/\d{2,}/.test(raw.replace(/[^\d]/g, ''))) return;
    if (WITHDRAW.test(raw) && !/입금/.test(raw)) return;

    const date = toDate(raw, baseYear);
    if (!date) return;

    /* 금액 후보 — 3자리 콤마가 있거나 4자리 이상인 수. 날짜 부분은 뺀다 */
    const withoutDate = raw.replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/, ' ')
      .replace(/\b\d{1,2}[-./]\d{1,2}\b/, ' ')
      .replace(/\d{1,2}:\d{2}(:\d{2})?/, ' ');
    const nums = (withoutDate.match(/[\d,]{3,}/g) || [])
      .map(toAmount)
      .filter((n) => n >= 1000);
    if (!nums.length) return;

    /* 잔액이 같이 붙는 형식이면 보통 잔액이 더 크다 → 가장 작은 값을 금액으로.
       (회비보다 잔액이 작은 경우는 거의 없다) */
    const amount = Math.min(...nums);

    /* 이름 후보 — 한글 2~5자 또는 영문 이름. 은행명·적요어는 제외 */
    const NOISE = /^(입금|출금|이체|잔액|계좌|은행|타행|자동|신한|국민|우리|하나|농협|기업|카카오|토스|새마을|수협|우체국|씨티|케이|현금|원|월|회비)$/;
    const names = (withoutDate.match(/[가-힣]{2,6}|[A-Za-z]{2,20}/g) || [])
      .filter((w) => !NOISE.test(w));
    const name = names.length ? names[names.length - 1] : '';

    rows.push({ date, amount, name: cleanName(name), raw });
  });

  return rows;
}

/* ---------- 미납자 매칭 ---------- */

export const MATCH = {
  AUTO: 'auto',       // 확실 — 자동 체크
  SUGGEST: 'suggest', // 애매 — 총무가 고른다
  NONE: 'none',       // 후보 없음
};

/** 신뢰도 경계 — 돈 문제라 자동 처리 문턱을 높게 잡는다 */
const AUTO_MIN = 0.92;
const SUGGEST_MIN = 0.55;

/**
 * 거래내역 한 건을 회원 목록에 맞춰 본다.
 *
 * @param row      parseStatement 결과 한 줄
 * @param members  [{id, name}]
 * @param opts.amount   기대 회비 (맞으면 가산점)
 * @param opts.unpaid   미납자 id 집합 — 미납자를 우선한다
 * @param opts.aliases  { '입금자명': memberId } 총무가 고쳐 준 별칭
 */
export function matchRow(row, members, opts = {}) {
  const { amount: expected = 0, unpaid = null, aliases = {} } = opts;

  /* 별칭이 있으면 그게 정답이다 — 총무가 직접 고쳐 준 것 */
  const aliasId = aliases[cleanName(row.name)];
  if (aliasId && members.some((m) => m.id === aliasId)) {
    return {
      kind: MATCH.AUTO, memberId: aliasId, score: 1, byAlias: true, candidates: [],
    };
  }

  const amountFits = expected > 0 && row.amount === expected;
  const scored = members.map((m) => {
    let s = nameScore(row.name, m.name);
    if (s <= 0) return { id: m.id, name: m.name, score: 0 };
    if (amountFits) s += 0.06;                                  // 금액이 딱 맞으면
    if (unpaid && unpaid.has(m.id)) s += 0.05;                  // 미납자면
    else if (unpaid && !unpaid.has(m.id)) s -= 0.25;            // 이미 낸 사람이면 낮춘다
    return { id: m.id, name: m.name, score: Math.min(1, Math.max(0, s)) };
  }).filter((c) => c.score >= SUGGEST_MIN)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { kind: MATCH.NONE, memberId: null, score: 0, candidates: [] };

  const top = scored[0];
  const second = scored[1];
  /* 1등이 확실히 앞서야 자동. 비슷한 후보가 둘이면 사람이 고른다
     (동명이인에서 잘못 체크되는 것을 막는다) */
  const clear = !second || top.score - second.score >= 0.12;

  return {
    kind: top.score >= AUTO_MIN && clear ? MATCH.AUTO : MATCH.SUGGEST,
    memberId: top.id,
    score: top.score,
    byAlias: false,
    candidates: scored.slice(0, 4),
  };
}

/**
 * 붙여넣은 전체 내역을 대사한다.
 *
 * @returns {
 *   rows: [{ ...row, match }],           화면에 그대로 뿌린다
 *   autoPaid: { memberId: true },        바로 체크할 사람
 *   summary: { total, matched, needCheck, unknown, amountSum }
 * }
 */
export function reconcile(text, members, opts = {}) {
  const parsed = parseStatement(text, opts);
  const unpaid = opts.paid
    ? new Set(members.filter((m) => !opts.paid[m.id]).map((m) => m.id))
    : null;

  const taken = new Set();          // 한 사람이 두 줄에 중복 매칭되지 않게
  const rows = parsed.map((row) => {
    const m = matchRow(row, members, { ...opts, unpaid });
    if (m.memberId && taken.has(m.memberId)) {
      /* 이미 다른 줄이 가져간 회원 — 자동 확정은 취소하고 후보로만 남긴다 */
      return { ...row, match: { ...m, kind: MATCH.SUGGEST, duplicate: true } };
    }
    if (m.kind === MATCH.AUTO && m.memberId) taken.add(m.memberId);
    return { ...row, match: m };
  });

  const autoPaid = {};
  rows.forEach((r) => {
    if (r.match.kind === MATCH.AUTO && r.match.memberId) autoPaid[r.match.memberId] = true;
  });

  return {
    rows,
    autoPaid,
    summary: {
      total: rows.length,
      matched: rows.filter((r) => r.match.kind === MATCH.AUTO).length,
      needCheck: rows.filter((r) => r.match.kind === MATCH.SUGGEST).length,
      unknown: rows.filter((r) => r.match.kind === MATCH.NONE).length,
      amountSum: rows.reduce((t, r) => t + r.amount, 0),
    },
  };
}

/** 총무가 고른 결과를 별칭으로 남긴다 — 다음 달부터 자동으로 붙는다 */
export const learnAlias = (aliases, rawName, memberId) => {
  const key = cleanName(rawName);
  if (!key || !memberId) return aliases;
  return { ...aliases, [key]: memberId };
};
