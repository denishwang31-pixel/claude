/* PHASE 4 — 카카오 로컬 API: 주소 → 좌표(위경도) 변환 */
import { KAKAO_REST_KEY } from './keys';

/** 주소 문자열 → {lat, lng} (키 미설정/실패 시 null) */
export async function geocodeAddress(addr) {
  if (!KAKAO_REST_KEY || !addr) return null;
  try {
    const res = await fetch(
      'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(addr),
      { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_KEY } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const doc = json.documents?.[0];
    if (!doc) return null;
    return { lat: +doc.y, lng: +doc.x };
  } catch (e) {
    return null;
  }
}
