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
    return { items: parseKatoHome(home, katoNames(list)), note: '' };
  } catch (e) {
    return { items: [], note: String(e?.message || e) };
  }
}

export default { katoNames, parseKatoHome, fetchKatoList, katoGameUrl };
