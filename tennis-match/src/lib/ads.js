/* ============================================================
   광고 · 제휴 링크

   지금은 링크를 직접 넣어 판매처(네이버 스마트스토어·쿠팡 등)로 그냥 보낸다.
   나중에 제휴 수수료를 붙이려면 링크에 파트너 코드만 얹으면 되도록
   "링크를 만드는 지점"을 이 파일 한 곳으로 모아 두었다.

   나중에 붙일 때 할 일은 두 가지뿐이다
     1) PARTNERS 에 파트너 코드 채우기
     2) (선택) logImpression / logClick 안에서 집계 컬렉션에 기록

   화면 코드는 이미 buildAdUrl / openAd 만 호출하므로 손댈 필요가 없다.
   ============================================================ */
import { Linking } from 'react-native';
import { doc, increment, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

/** 배너가 붙는 자리 — 자리마다 다른 상품을 태울 수 있다 */
export const AD_SLOTS = {
  HOME: 'home',       // 홈 상단
  SCHEDULE: 'schedule', // 일정 목록
  MATCH: 'match',     // 대진표 하단
  GEAR: 'gear',       // 용품 탭
};

/**
 * 제휴 파트너 설정.
 * code 를 비워 두면 링크를 그대로 연다(지금 상태).
 * 나중에 제휴에 가입하면 code 만 채우면 된다.
 */
export const PARTNERS = {
  naver: { host: /(^|\.)(naver|smartstore\.naver)\.com$/i, param: 'NaPm', code: '' },
  coupang: { host: /(^|\.)coupang\.com$/i, param: 'lptag', code: '' },
};

const hostOf = (url) => {
  try { return new URL(url).hostname; } catch (e) { return ''; }
};

/** 판매처 표시용 이름 */
export function sellerName(url) {
  const h = hostOf(url);
  if (!h) return '';
  if (/naver/i.test(h)) return '네이버';
  if (/coupang/i.test(h)) return '쿠팡';
  if (/11st/i.test(h)) return '11번가';
  if (/gmarket/i.test(h)) return 'G마켓';
  return h.replace(/^www\./, '');
}

/**
 * 최종 이동 URL. 파트너 코드가 설정돼 있으면 추적 파라미터를 붙인다.
 * 코드가 없으면 원본 링크를 그대로 반환한다.
 */
export function buildAdUrl(url, { slot } = {}) {
  if (!url) return '';
  const h = hostOf(url);
  const partner = Object.values(PARTNERS).find((p) => p.host.test(h) && p.code);
  if (!partner) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(partner.param, partner.code);
    if (slot) u.searchParams.set('utm_content', slot);
    u.searchParams.set('utm_source', 'tennismatch');
    u.searchParams.set('utm_medium', 'app');
    return u.toString();
  } catch (e) {
    return url;
  }
}

/* ---- 집계 ----
   지금은 gear 문서에 카운터만 올린다. 규칙상 회원은 gear 를 쓸 수 없으므로
   실패해도 조용히 넘어가고, 나중에 Cloud Functions 로 옮길 자리다. */
const bump = async (adId, field) => {
  if (!adId) return;
  try {
    await setDoc(doc(db, 'adStats', adId), { [field]: increment(1) }, { merge: true });
  } catch (e) { /* 집계 실패가 사용자 흐름을 막지 않도록 무시 */ }
};

export const logImpression = (adId) => bump(adId, 'impressions');
export const logClick = (adId) => bump(adId, 'clicks');

/** 광고/용품을 눌렀을 때 — 집계하고 판매처로 이동 */
export async function openAd(ad, slot) {
  if (!ad?.link) return false;
  logClick(ad.id);
  const url = buildAdUrl(ad.link, { slot });
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/** 슬롯에 맞는 광고만 추리기 — slots 미지정 광고는 어디에나 노출 */
export function adsForSlot(ads, slot) {
  return (ads || [])
    .filter((a) => a.active !== false)
    .filter((a) => !a.slots?.length || a.slots.includes(slot));
}
