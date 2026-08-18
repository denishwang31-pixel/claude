/* ============================================================
   대진 ↔ 참석 어긋남

   대진을 짜고 나서 사람이 빠지는 일은 늘 있다. 전날 밤에 "내일 못 나갈
   것 같다"가 오고, 당일 아침에 한 명이 더 빠진다. 그런데 대진표는 짤
   때의 명단 그대로라, 코트에 가서야 한 자리가 빈 것을 안다.

   반대도 있다. 대진을 짠 뒤에 참석으로 바꾼 사람은 어느 코트에도 없다.
   본인은 참석이라고 눌렀으니 나왔는데 뛸 자리가 없다.

   그래서 두 명단을 대조해 세 가지를 구분한다.
     빠진 사람   대진에는 있는데 지금은 참석이 아니다 → 자리가 빈다
     남는 사람   참석인데 대진에 없다 → 나왔는데 못 뛴다
     영향받는 경기  그 사람들이 들어 있는 칸

   무엇을 할지는 대진을 어떻게 짰느냐에 따라 다르다.

     자동 편성  다시 돌리면 된다. 규칙이 그대로라 결과가 곧 복구된다.
                빈 자리만 비우는 것도 고를 수 있다 — 다른 코트는 그대로
                두고 싶을 때가 있다.

     수기 편성  다시 돌릴 수 없다. 손으로 짠 데에는 앱이 모르는 이유가
                있다("저 형 무릎", "저 둘은 오랜만"). 그걸 자동으로
                재현할 방법이 없으므로 자동 수정은 하지 않는다.
                영향받는 경기를 지우고 그 자리만 다시 짜게 한다.
   ============================================================ */

/** 지금 참석으로 잡힌 사람 (회원 + 게스트) */
export function attendingIds(meeting, members, yesValue = 'yes') {
  const rsvp = meeting?.rsvp || {};
  const ids = (members || [])
    .filter((m) => m && m.id && rsvp[m.id] === yesValue)
    .map((m) => m.id);
  const guests = (meeting?.guests || [])
    .map((g) => `g:${g.uid || g.name}`)
    .filter(Boolean);
  return [...ids, ...guests];
}

/** 대진표에 이름이 올라 있는 사람 */
export function drawnIds(matches) {
  const set = new Set();
  (matches || []).forEach((m) => {
    [...(m.teamA || []), ...(m.teamB || [])].forEach((id) => set.add(id));
  });
  return [...set];
}

/**
 * 두 명단을 대조한다.
 *
 * @returns {{
 *   ghosts: string[],     대진에 있는데 참석이 아닌 사람
 *   missing: string[],    참석인데 대진에 없는 사람
 *   affected: object[],   ghosts 가 들어 있는 경기
 *   manual: boolean,      수기로 짠 대진인가
 *   inSync: boolean
 * }}
 */
export function diffDraw(matches, attending) {
  const list = matches || [];
  const att = new Set(attending || []);
  const drawn = new Set(drawnIds(list));

  const ghosts = [...drawn].filter((id) => !att.has(id));
  const missing = [...att].filter((id) => !drawn.has(id));
  const ghostSet = new Set(ghosts);
  const affected = list.filter((m) =>
    [...(m.teamA || []), ...(m.teamB || [])].some((id) => ghostSet.has(id)));

  /* 하나라도 손으로 만든 칸이 있으면 수기 대진으로 본다.
     자동으로 짠 뒤 몇 칸만 고친 경우도 여기 걸린다 — 그 고친 의도를
     다시 돌리기로 날려서는 안 된다. */
  const manual = list.some((m) => m.manual);

  return {
    ghosts,
    missing,
    affected,
    manual,
    inSync: ghosts.length === 0 && missing.length === 0,
  };
}

/**
 * 빠진 사람만 빼고 자리를 비운다.
 * 경기는 남긴다 — 그 자리가 비었다는 것이 보여야 사람을 채워 넣는다.
 */
export function removeGhosts(matches, ghosts) {
  const out = new Set(ghosts || []);
  if (!out.size) return matches || [];
  return (matches || []).map((m) => ({
    ...m,
    teamA: (m.teamA || []).filter((id) => !out.has(id)),
    teamB: (m.teamB || []).filter((id) => !out.has(id)),
  }));
}

/** 영향받은 경기를 통째로 지운다 (수기 대진에서 쓴다) */
export function dropAffected(matches, affected) {
  const ids = new Set((affected || []).map((m) => m.id));
  return (matches || []).filter((m) => !ids.has(m.id));
}

/** 한 줄 요약 — 화면 배너에 그대로 쓴다 */
export function describeDiff(diff, nameOf) {
  if (!diff || diff.inSync) return '';
  const name = (id) => (nameOf ? nameOf(id) : id);
  const parts = [];
  if (diff.ghosts.length) {
    parts.push(
      `빠진 사람 ${diff.ghosts.length}명 (${diff.ghosts.slice(0, 3).map(name).join(', ')}`
      + `${diff.ghosts.length > 3 ? ' 외' : ''})`,
    );
  }
  if (diff.missing.length) {
    parts.push(
      `대진에 없는 참석자 ${diff.missing.length}명 (${diff.missing.slice(0, 3).map(name).join(', ')}`
      + `${diff.missing.length > 3 ? ' 외' : ''})`,
    );
  }
  return parts.join(' · ');
}

/** 지금 쓸 수 있는 선택지 — 짠 방식에 따라 다르다 */
export function optionsFor(diff) {
  if (!diff || diff.inSync) return [];
  if (diff.manual) {
    /* 손으로 짠 것은 자동으로 고치지 않는다. 앱이 모르는 이유가 있다. */
    return [
      { key: 'drop', label: `영향받은 ${diff.affected.length}경기 삭제`, tone: 'danger' },
      { key: 'clear', label: '대진표 전체 삭제', tone: 'danger' },
    ];
  }
  return [
    { key: 'regen', label: '대진 다시 편성', tone: 'primary' },
    { key: 'vacate', label: '빠진 사람 자리만 비우기', tone: 'ghost' },
    { key: 'clear', label: '대진표 전체 삭제', tone: 'danger' },
  ];
}

export default {
  attendingIds, drawnIds, diffDraw, removeGhosts, dropAffected,
  describeDiff, optionsFor,
};
