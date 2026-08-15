/* 코트장 범위 — 화면 사이를 오갈 때 선택이 유지·정리되는 규칙 테스트.

   실제 버그였던 것
     · 홈에서 코트를 골라도 대진표는 전체 코트를 보여줬다
     · 뒤로가기를 누르면 홈이 아니라 "필터 없는 같은 화면"으로 갔다
     · 염곡 → 수도공고로 바꿔도 염곡 대진이 남아 있었다
   원인은 코트 선택을 라우터 파라미터로 넘긴 것. 지금은 앱 상태 한 곳에서만
   관리한다. 여기서는 그 상태 규칙을 순수 함수로 재현해 검증한다. */

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

/* ---- 화면들이 쓰는 실제 규칙을 그대로 옮긴 것 ---- */

/** 범위를 벗어난 코트 id 는 전체(null)로 되돌린다 (useVenueScope) */
const normalizeVenue = (venueId, scopeVenues) => {
  if (!venueId) return null;
  if (!scopeVenues.length) return venueId;          // 아직 로딩 중이면 유지
  return scopeVenues.some((v) => v.id === venueId) ? venueId : null;
};

/** 그 화면이 보여줄 모임 (match/schedule 공통) */
const visibleMeetings = (meetings, scopeVenues, venueId) => {
  const ids = scopeVenues.map((v) => v.id);
  return meetings
    .filter((m) => (!m.venueId ? true : ids.includes(m.venueId)))
    .filter((m) => (venueId ? m.venueId === venueId : true));
};

/** 코트를 바꾸면 골라 둔 모임은 버린다 (첫 렌더 제외) */
const meetingAfterVenueChange = (prevVenue, nextVenue, meetingId) =>
  (prevVenue === nextVenue ? meetingId : null);

const VENUES = [
  { id: 'v1', name: '염곡' },
  { id: 'v2', name: '수도공고' },
];
const MEETINGS = [
  { id: 'm1', venueId: 'v1', date: '2026-09-01' },
  { id: 'm2', venueId: 'v2', date: '2026-09-02' },
  { id: 'm3', venueId: 'v1', date: '2026-09-03' },
  { id: 'm4', venueId: null, date: '2026-09-04' },  // 코트장 미지정
];

console.log('[홈에서 고른 코트가 일정·대진으로 이어진다]');
{
  const v = normalizeVenue('v1', VENUES);
  const list = visibleMeetings(MEETINGS, VENUES, v);
  ok(list.length === 2, `염곡 선택 시 염곡 모임만 (${list.length}건)`);
  ok(list.every((m) => m.venueId === 'v1'), '다른 코트가 섞이지 않는다');
  ok(!list.some((m) => m.id === 'm2'), '수도공고 모임이 안 보인다');
}

console.log('[전체를 고르면 전부 보인다]');
{
  const list = visibleMeetings(MEETINGS, VENUES, normalizeVenue(null, VENUES));
  ok(list.length === 4, `전체 선택 시 전부 (${list.length}건)`);
  ok(list.some((m) => !m.venueId), '코트장 미지정 모임도 보인다');
}

console.log('[코트를 바꾸면 예전 코트 데이터가 남지 않는다]');
{
  // 염곡에서 m1 을 보고 있다가 수도공고로 전환
  ok(meetingAfterVenueChange('v1', 'v2', 'm1') === null,
    '코트가 바뀌면 골라 둔 모임을 버린다');
  const list = visibleMeetings(MEETINGS, VENUES, 'v2');
  ok(!list.some((m) => m.id === 'm1'), '수도공고 목록에 염곡 모임이 없다');
  ok(list.length === 1 && list[0].id === 'm2', '수도공고 모임만 남는다');
  // 같은 코트면 보던 모임을 유지한다
  ok(meetingAfterVenueChange('v1', 'v1', 'm1') === 'm1',
    '코트가 그대로면 보던 모임을 유지한다');
  // 첫 렌더(이전 값 === 현재 값)에서는 홈에서 넘겨준 모임이 살아남는다
  ok(meetingAfterVenueChange('v1', 'v1', 'm3') === 'm3',
    '홈에서 콕 집어 들어온 모임이 첫 렌더에 지워지지 않는다');
}

console.log('[범위를 벗어난 코트는 전체로 되돌린다]');
{
  ok(normalizeVenue('v9', VENUES) === null, '없는 코트장 id → 전체');
  ok(normalizeVenue('v1', [VENUES[1]]) === null, '내 권한 밖 코트장 → 전체');
  ok(normalizeVenue('v1', []) === 'v1', '코트장 로딩 전에는 값을 유지한다');
  ok(normalizeVenue(null, VENUES) === null, '전체는 그대로 전체');
  // 되돌린 뒤에는 목록이 비지 않는다 — 이게 안 되면 화면이 통째로 빈다
  const list = visibleMeetings(MEETINGS, VENUES, normalizeVenue('v9', VENUES));
  ok(list.length === 4, '잘못된 코트 id 때문에 화면이 비지 않는다');
}

console.log('[리드는 담당 코트만]');
{
  const leadScope = [VENUES[0]];
  const list = visibleMeetings(MEETINGS, leadScope, normalizeVenue(null, leadScope));
  ok(list.every((m) => !m.venueId || m.venueId === 'v1'), '담당 코트 밖 모임은 안 보인다');
  ok(!list.some((m) => m.id === 'm2'), '수도공고 모임이 리드에게 안 보인다');
  // 담당 밖 코트를 들고 들어와도 조용히 전체(=담당 범위)로 돌아간다
  ok(normalizeVenue('v2', leadScope) === null, '담당 밖 코트 선택은 해제된다');
}

console.log(`\n코트장 범위 테스트: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
