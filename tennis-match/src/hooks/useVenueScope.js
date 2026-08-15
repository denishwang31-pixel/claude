/* 지금 보고 있는 코트장 — 앱 전체가 공유하는 하나의 값.

   왜 훅으로 감싸나
     값 자체는 app/_layout.jsx 의 컨텍스트에 있지만, "그 코트를 내가 볼 수
     있는가"는 화면마다 아는 정보(scopeVenues)로 판단해야 한다. 코트장이
     지워졌거나, 역할이 바뀌어 볼 수 있는 범위가 좁아졌거나, 클럽을 옮겼는데
     예전 코트 id 가 남아 있으면 목록이 통째로 비어 버린다.
     그래서 범위를 벗어난 값은 여기서 조용히 전체(null)로 되돌린다. */
import { useEffect } from 'react';
import { useApp } from '../../app/_layout';

/**
 * @param scopeVenues 내가 볼 수 있는 코트장 목록 (useClub 이 준다)
 * @returns { venueId, setVenueId } — venueId 는 항상 scopeVenues 안의 값이거나 null
 */
export function useVenueScope(scopeVenues = []) {
  const { venueId, setVenueId } = useApp();

  const known = scopeVenues.some((v) => v.id === venueId);
  useEffect(() => {
    /* 코트장 목록이 아직 안 왔을 때(로딩 중)는 건드리지 않는다 */
    if (!venueId || !scopeVenues.length) return;
    if (!known) setVenueId(null);
  }, [venueId, known, scopeVenues.length]);

  return { venueId: known || !venueId ? venueId : null, setVenueId };
}
