/* ============================================================
   코트에 붙는 정보 — 그 코트에서 운영 중인 클럽 · 레슨 중인 코치

   왜 필요한가
     코트 검색은 지금까지 "예약 링크로 보내 주는" 화면이었다. 그런데
     테니스를 시작하는 사람이 정말 알고 싶은 것은 "여기 가면 누가
     있는가"다 — 들어갈 클럽이 있는지, 배울 코치가 있는지, 몇 시에
     레슨을 하는지. 코트 목록은 이미 있으니 거기에 붙이면 된다.

   어떻게 잇는가 — 코트 키
     코트는 Firestore 문서가 아니라 앱에 내장된 표(courtData)다.
     그래서 문서 id 가 없다. 대신 "시/도 + 이름"을 정규화한 값을 키로 쓴다.
     클럽의 코트장(venues)과 코치의 활동 코트가 이 키를 저장하면
     같은 코트를 가리키게 된다.

     이름 표기가 흔들리는 문제
       "올림픽공원 테니스장" / "올림픽공원테니스장" / "올림픽공원 테니스코트"
       는 사람 눈에 같은 곳이다. 그래서 공백을 지우고, 끝에 붙는
       "테니스장/테니스코트/코트/구장"을 떼고 비교한다. 완벽하지는 않지만
       이 세 표기는 확실히 하나로 모인다.
   ============================================================ */

const TAIL = /(테니스장|테니스코트|테니스클럽|코트장|코트|구장)$/;

const squeeze = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

/** 이름만 정규화 — 키를 만들 때도, 이름끼리 견줄 때도 이걸 쓴다 */
export function normalizeCourtName(name) {
  let s = squeeze(name);
  // 꼬리표는 한 번만 뗀다. "테니스코트장" 같은 겹말도 한 번에 정리된다.
  s = s.replace(TAIL, '');
  return s;
}

/**
 * 코트 키 — 클럽·코치가 저장하는 값.
 * 시/도를 앞에 두는 이유: "중앙테니스장"은 여러 시/도에 있다.
 */
export function courtKey(court) {
  if (!court) return '';
  const name = normalizeCourtName(court.name);
  if (!name) return '';
  return `${squeeze(court.sido)}|${name}`;
}

/** 이름과 지역만 아는 경우(클럽이 손으로 적은 코트장)에도 같은 키를 만든다 */
export const courtKeyOf = (sido, name) => courtKey({ sido, name });

/** 두 코트 표기가 같은 곳을 가리키는가 */
export const sameCourt = (a, b) => {
  const ka = courtKey(a); const kb = courtKey(b);
  return !!ka && ka === kb;
};

/* ------------------------------------------------------------
   클럽 → 코트 키 목록

   클럽이 등록한 코트장(venues)에는 sido 가 없을 수 있다. 주소 첫 단어가
   시/도인 경우가 많아 거기서 건져 보고, 그래도 없으면 클럽의 활동지역을
   쓴다. 아무것도 없으면 지역 없는 키(`|이름`)가 되는데, 그런 키끼리는
   서로 안 맞으므로 조용히 빠진다 — 엉뚱한 코트에 붙는 것보다 낫다.
   ------------------------------------------------------------ */
export function clubCourtKeys(club) {
  const fallback = String(club?.region || '').trim().split(/\s+/)[0] || '';
  return (club?.venues || [])
    .map((v) => {
      const sido = v.sido || String(v.addr || '').trim().split(/\s+/)[0] || fallback;
      return courtKeyOf(sido, v.name);
    })
    .filter((k) => k && !k.startsWith('|'));
}

/**
 * 코트별 색인 — 한 번 만들어 두고 목록을 그릴 때 조회만 한다.
 * 코트 500곳 × 클럽 200개를 매번 훑으면 화면이 버벅인다.
 */
export function buildCourtIndex({ clubs = [], coaches = [] } = {}) {
  const idx = {};
  const slot = (k) => {
    if (!idx[k]) idx[k] = { clubs: [], coaches: [], lessons: [] };
    return idx[k];
  };

  clubs.forEach((c) => {
    clubCourtKeys(c).forEach((k) => {
      const s = slot(k);
      if (!s.clubs.some((x) => x.id === c.id)) s.clubs.push(c);
    });
  });

  coaches.forEach((co) => {
    (co.courts || []).forEach((k) => {
      if (!k) return;
      const s = slot(k);
      if (!s.coaches.some((x) => x.id === co.id)) s.coaches.push(co);
      (co.lessonSlots || []).forEach((ls) => {
        s.lessons.push({ ...ls, coachId: co.id, coachName: co.name });
      });
    });
  });

  return idx;
}

const EMPTY = { clubs: [], coaches: [], lessons: [] };

/** 그 코트에 붙은 것들. 없으면 빈 묶음을 돌려준다(화면이 옵셔널 체이닝을 안 하도록) */
export const courtInfo = (court, index) => index?.[courtKey(court)] || EMPTY;

/** 코트 카드에 한 줄로 — "클럽 2 · 코치 3" */
export function courtInfoLine(info) {
  const parts = [];
  if (info.clubs.length) parts.push(`클럽 ${info.clubs.length}`);
  if (info.coaches.length) parts.push(`코치 ${info.coaches.length}`);
  return parts.join(' · ');
}

/** 레슨 시간을 요일별로 묶는다 — 코트 상세에서 시간표처럼 보여 주려고 */
export function lessonsByDay(lessons) {
  const out = {};
  (lessons || []).forEach((l) => {
    const d = l.day || '?';
    (out[d] = out[d] || []).push(l);
  });
  Object.values(out).forEach((arr) =>
    arr.sort((a, b) => String(a.from || '').localeCompare(String(b.from || ''))));
  return out;
}
