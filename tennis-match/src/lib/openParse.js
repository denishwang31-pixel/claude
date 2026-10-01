/* ============================================================
   KATO 대회 목록 읽기 — AI 없이, 사이트 모양 그대로

   왜 따로 두나
     매일 02시 갱신은 Claude 가 웹을 찾아 정리한다. 그런데 API 키 문제처럼
     Claude 쪽이 막히면 목록이 통째로 비어 버린다. KATO(한국테니스발전협의회)는
     첫 화면에 「접수중인 대회」「접수예정 대회」를 늘 같은 모양으로 올려서,
     그 부분만큼은 규칙대로 읽을 수 있다. 그래서 이것을 늘 먼저 읽고,
     Claude 가 찾은 것을 그 위에 더한다(같은 대회는 planSync 가 하나로 친다).

   읽는 곳
     https://kato.kr/          카드: 상태 띠(접수중·부분접수중) · 이름(줄임) · 부서 · 대회 기간
                               카드를 누르면 /openGame/번호 로 간다(onClick)
     https://kato.kr/openList  1년 목록: <a href="/openGame/번호">온전한 이름</a>
     https://kato.kr/openGame/번호  요강: 장소·주최·접수 개시일·취소/환불 마감일·참가비·부서별 접수 상태
                               ⚠️ KATO 는 「접수 마감일」을 따로 적지 않는다(부서별 정원이 차면 마감).
                                  그래서 접수 시작일과 취소·환불 마감일을 같이 보여 준다.
   ⚠️ 사이트 모양이 바뀌면 0건이 나온다 — 그때는 조용히 넘어가고 Claude 결과만 쓴다.
   ============================================================ */

export const KATO_HOME = 'https://kato.kr/';
export const KATO_LIST = 'https://kato.kr/openList';
export const katoGameUrl = (id) => `https://kato.kr/openGame/${id}`;

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const truncated = (s) => /(\.\.\.?|…)$/.test(String(s || '').trim());
const unDot = (s) => String(s || '').replace(/(\.\.\.?|…)$/, '').trim();

/** 1년 목록에서 번호 → 온전한 이름 */
export function katoNames(listHtml) {
  const out = {};
  const re = /<a[^>]*href=["']\/openGame\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(listHtml || '')))) {
    const name = strip(m[2]);
    if (!name || truncated(name) || /^대회/.test(name)) continue;   // "대회종료" 같은 버튼 글자는 이름이 아니다
    if (!out[m[1]]) out[m[1]] = name;
  }
  return out;
}

/**
 * 첫 화면 카드 → 대회 목록(openSync.cleanItem 이 받는 모양)
 * @param homeHtml  https://kato.kr/ 원문
 * @param names     katoNames(openList 원문) — 없으면 줄인 이름을 그대로 쓴다
 */
export function parseKatoHome(homeHtml, names = {}) {
  const html = String(homeHtml || '');
  const openAt = html.indexOf('접수중인 대회');
  const soonAt = html.indexOf('접수예정 대회');
  if (openAt < 0) return [];
  const items = [];
  const re = /location\.href=['"]\/openGame\/(\d+)['"]([\s\S]*?)<h3>([\s\S]*?)<\/h3>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m.index < openAt) continue;                       // 「경기중인 대회」 등 위쪽 칸은 건너뛴다
    const soon = soonAt > 0 && m.index > soonAt;
    /* 상태 띠 — class 가 정확히 "ribbon …"인 것(바깥 "ribbon-wrapper" 말고) */
    const ribbon = strip((/class=["']ribbon(?:\s[^"']*)?["'][^>]*>([^<]*)</i.exec(m[2]) || [])[1]);
    if (!soon && ribbon && !/접수중/.test(ribbon)) continue;   // 마감 띠가 붙은 카드는 뺀다
    const id = m[1];
    const short = strip(m[3]);
    const [from, to] = strip(m[5]).split('~').map((x) => x.trim());
    items.push({
      name: names[id] || unDot(short),
      org: 'KATO',
      host: '한국테니스발전협의회(KATO)',
      divisions: strip(m[4]).split(',').map((x) => x.trim()).filter(Boolean),
      startDate: from || '',
      endDate: to || '',
      signupStatus: soon ? 'soon' : '',
      note: ribbon === '부분접수중' ? '일부 부서는 접수 마감 — 요강에서 부서별로 확인' : '',
      link: katoGameUrl(id),
      sourceUrl: katoGameUrl(id),
    });
  }
  return items;
}

/* 요강 표를 글로 — 칸 경계는 ' | ' (예: "| 장 소 | 만석공원테니스장 외 |") */
const cells = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<\/(td|th|li|dt|dd|p|div|tr|h\d)>/gi, ' | ')
  .replace(/<br\s*\/?>/gi, ' / ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .replace(/(\s*\|\s*)+/g, ' | ');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
/** 칸 이름 다음 칸의 글 — 이름 글자 사이 띄어쓰기("장 소")는 무시 */
const field = (text, label) => {
  const re = new RegExp(`\\|\\s*${label.split('').join('\\s*')}\\s*\\|\\s*([^|]*)\\|`);
  const m = re.exec(text);
  return m ? m[1].trim() : '';
};
/** '2026년 10월 8일 ... 12시' 들 → [{date, hour}] */
const datesIn = (seg) => {
  const out = [];
  const re = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([^)]*\))?([^년]*?)(?=\d{4}\s*년|$)/g;
  let m;
  while ((m = re.exec(seg))) {
    const h = /(\d{1,2})\s*시/.exec(m[4]);
    out.push({ date: ymd(m[1], m[2], m[3]), hour: h ? Number(h[1]) : null, tail: m[4] });
  }
  return out;
};
const hourText = (h) => (h !== null && h >= 0 && h < 24 ? `${pad(h)}:00` : '');

/**
 * 대회 요강 페이지 → 목록 카드에 더할 것
 * @returns { place, host, signupFrom, signupFromTime, refundTo, refundToTime, fee, closedDivisions }
 */
export function parseKatoGame(html) {
  const text = cells(html);
  const out = {};
  const place = field(text, '장소').replace(/[▣◈◎※]/g, ' ').replace(/\s+/g, ' ').trim();
  if (place && place !== '.') out.place = place.slice(0, 80);
  const host = field(text, '주최');
  if (host && host !== '.') out.host = host.slice(0, 80);

  /* 「접수개시 및 환불마감」 칸: "▣ 접수 개시일 : 2026년 10월 8일 ·여자부서-12시 ·남자부서-13시 / ▣ 취소 및 환불 마감일 : …" */
  const openAt = text.search(/접수\s*개시일/);
  if (openAt >= 0) {
    const seg = text.slice(openAt).split(/▣|\|/)[0];
    const [first] = datesIn(seg);
    if (first) {
      out.signupFrom = first.date;
      /* 부서마다 여는 시각이 다르면 가장 이른 시각 — 그때부터 누군가는 신청할 수 있다 */
      const hours = [...first.tail.matchAll(/(\d{1,2})\s*시/g)].map((x) => Number(x[1]));
      if (hours.length) out.signupFromTime = hourText(Math.min(...hours));
    }
  }
  const refundAt = text.search(/환불\s*마감일/);
  if (refundAt >= 0) {
    const seg = text.slice(refundAt).split(/▣|\|/)[0];
    /* 부서마다 다르면("개나리부 9월 11일 … 마스터스부 10월 2일") 가장 늦은 날 — 아직 열린 부서 기준 */
    const all = datesIn(seg).sort((a, b) => a.date.localeCompare(b.date));
    const last = all[all.length - 1];
    if (last) {
      out.refundTo = last.date;
      if (last.hour !== null) out.refundToTime = hourText(last.hour);
    }
  }
  const fee = /([\d,]{4,})\s*원/.exec(field(text, '참가비'));
  if (fee) out.fee = Number(fee[1].replace(/,/g, '')) || 0;

  /* 대회일정목록: "| 개나리부 | 2026년 09월 15일 (화) 09:00 | 화성 볼리테니스장 외 | 접수마감 참가목록 151 / 96 |" */
  const listAt = text.indexOf('대회일정목록');
  if (listAt >= 0) {
    const closed = [];
    const re = /\|\s*([^|]+?)\s*\|\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일[^|]*\|\s*[^|]*\|\s*(접수마감|참가신청|접수예정|접수대기)/g;
    let m;
    const tail = text.slice(listAt);
    while ((m = re.exec(tail))) if (m[2] === '접수마감' && !closed.includes(m[1])) closed.push(m[1]);
    out.closedDivisions = closed;
  }
  return out;
}

/** 목록 카드에 요강 내용을 더한다 */
export function withKatoGame(item, game) {
  if (!game) return item;
  const next = { ...item };
  ['place', 'host', 'signupFrom', 'signupFromTime', 'refundTo', 'refundToTime'].forEach((k) => {
    if (game[k]) next[k] = game[k];
  });
  if (game.fee > 0) next.fee = game.fee;
  /* 접수 시작일을 알면 '접수 예정' 표시는 날짜가 대신한다 */
  if (game.signupFrom) next.signupStatus = '';
  const closed = game.closedDivisions || [];
  if (closed.length && !item.signupStatus) next.note = `접수 마감된 부서: ${closed.join(', ')} — 나머지 부서는 신청 가능`;
  return next;
}

/** 두 페이지를 열어 목록을 만든다(실패하면 빈 목록) */
export async function fetchKatoList(fetchImpl = fetch) {
  const get = async (url) => {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0 (tennis-match tournament sync)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  try {
    const [home, list] = await Promise.all([get(KATO_HOME), get(KATO_LIST).catch(() => '')]);
    const items = parseKatoHome(home, katoNames(list));
    /* 대회마다 요강을 열어 장소·접수 일정을 더한다 — 넷씩 나눠서(사이트에 부담 주지 않게).
       요강을 못 읽은 대회는 목록 카드 내용만으로 둔다. */
    const out = [];
    for (let i = 0; i < items.length; i += 4) {
      const chunk = items.slice(i, i + 4);
      // eslint-disable-next-line no-await-in-loop
      const games = await Promise.all(chunk.map((t) => get(t.link).then(parseKatoGame).catch(() => null)));
      chunk.forEach((t, k) => out.push(withKatoGame(t, games[k])));
    }
    return { items: out, note: '' };
  } catch (e) {
    return { items: [], note: String(e?.message || e) };
  }
}

export default { katoNames, parseKatoHome, parseKatoGame, withKatoGame, fetchKatoList, katoGameUrl };
