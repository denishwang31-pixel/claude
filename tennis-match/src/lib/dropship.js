/* ============================================================
   용품 — 링크형과 드랍십형

   두 가지 방식이 있고, 성격이 완전히 다르다

     링크형 (지금 쓰는 것, mode='link')
       판매처 주소만 걸어 두고 누르면 그리로 보낸다. 돈이 앱을 거치지
       않으므로 사업자등록도 재고도 필요 없다. 제휴에 가입하면 링크에
       코드가 붙어 수수료가 들어온다(ads.js 가 담당).
       → 초기에는 이것만으로 충분하다.

     드랍십형 (mode='dropship')
       앱에서 주문을 받고, 공급처에 발주해 회원 집으로 바로 보낸다.
       재고를 안 갖는 대신 "판매자"가 되므로 책임이 생긴다.
       사업자등록 · 통신판매업 신고 · 결제수단 · 교환반품 규정이 필요하다.
       법·계약 쪽 준비는 코드로 못 하므로 PRE-LAUNCH.md D 에 적어 두었다.

   이 파일이 하는 일
     두 방식을 한 상품 목록 안에서 섞어 다룰 수 있게 만드는 것.
     드랍십 상품은 마진이 맞는지 계산하고, 팔면 안 되는 상태(공급가가
     판매가보다 비싼 경우 등)를 등록 단계에서 막는다.

   왜 마진 계산을 코드로 하나
     상품이 늘면 "이거 남는 장사였나"를 하나씩 세지 못한다. 등록할 때
     바로 보여 주면 손해 보는 값을 애초에 저장하지 않는다.
   ============================================================ */

export const GEAR_MODE = {
  LINK: 'link',
  DROPSHIP: 'dropship',
};

export const GEAR_MODE_LABEL = {
  [GEAR_MODE.LINK]: '링크형 — 판매처로 보내기',
  [GEAR_MODE.DROPSHIP]: '드랍십 — 앱에서 주문받기',
};

/** 예전에 등록한 상품은 mode 가 없다. 그건 전부 링크형이다. */
export const gearMode = (g) =>
  (g?.mode === GEAR_MODE.DROPSHIP ? GEAR_MODE.DROPSHIP : GEAR_MODE.LINK);

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * 한 건 팔았을 때 남는 돈.
 *
 * fee 는 결제 수수료율(%)이다. PG 를 붙이면 보통 3% 안팎이 빠진다.
 * 이걸 빼지 않고 계산하면 "남는 줄 알았는데 안 남는" 상품이 생긴다.
 */
export function margin(g) {
  const price = num(g?.price);
  const cost = num(g?.cost);
  const ship = num(g?.shipCost);        // 내가 부담하는 배송비
  const shipPaid = num(g?.shipFee);     // 회원에게 받는 배송비
  const feeRate = num(g?.feeRate) / 100;
  const revenue = price + shipPaid;
  const fee = Math.round(revenue * feeRate);
  const profit = revenue - cost - ship - fee;
  const rate = revenue > 0 ? profit / revenue : 0;
  return { revenue, cost: cost + ship, fee, profit, rate };
}

/** 화면에 "3,200원 (12%)" 로 */
export const marginText = (g) => {
  const m = margin(g);
  return `${m.profit.toLocaleString()}원 (${Math.round(m.rate * 100)}%)`;
};

/**
 * 저장해도 되는 상품인가.
 * 링크형은 링크만 있으면 되고, 드랍십형은 값이 앞뒤가 맞아야 한다.
 */
export function gearReady(g) {
  const missing = [];
  if (!String(g?.title || '').trim()) missing.push('상품명');

  if (gearMode(g) === GEAR_MODE.LINK) {
    if (!String(g?.link || '').startsWith('http')) missing.push('판매처 링크');
    return { ok: missing.length === 0, missing, warn: [] };
  }

  if (!String(g?.supplier || '').trim()) missing.push('공급처');
  if (num(g?.price) <= 0) missing.push('판매가');
  if (num(g?.cost) <= 0) missing.push('공급가');

  const warn = [];
  const m = margin(g);
  if (missing.length === 0) {
    if (m.profit <= 0) warn.push('남는 것이 없습니다 — 판매가나 공급가를 다시 보세요');
    else if (m.rate < 0.1) warn.push('마진이 10% 미만입니다');
  }
  return { ok: missing.length === 0, missing, warn };
}

/** 회원에게 보여 줄 상품 — 내려둔 것과 품절은 빼거나 뒤로 */
export const sellableGear = (list) =>
  (list || []).filter((g) => g.active !== false);

export const isSoldOut = (g) =>
  gearMode(g) === GEAR_MODE.DROPSHIP && g?.stock === 0;

/* ---------- 주문 ----------
   드랍십을 켜기 전이라도 구조는 정해 둔다. 나중에 결제를 붙일 때
   상태 이름이 흔들리면 이미 쌓인 주문을 다시 손봐야 한다. */

export const ORDER_STATUS = {
  PLACED: 'placed',       // 회원이 주문함 (입금 확인 전)
  PAID: 'paid',           // 입금 확인됨
  ORDERED: 'ordered',     // 공급처에 발주함
  SHIPPED: 'shipped',     // 송장 나옴
  DONE: 'done',
  CANCELED: 'canceled',
};

export const ORDER_STATUS_LABEL = {
  [ORDER_STATUS.PLACED]: '주문 접수',
  [ORDER_STATUS.PAID]: '입금 확인',
  [ORDER_STATUS.ORDERED]: '발주 완료',
  [ORDER_STATUS.SHIPPED]: '배송 중',
  [ORDER_STATUS.DONE]: '배송 완료',
  [ORDER_STATUS.CANCELED]: '취소',
};

/** 다음으로 갈 수 있는 상태 — 건너뛰거나 되돌아가지 못하게 한다 */
export const nextStatuses = (s) => ({
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.PAID, ORDER_STATUS.CANCELED],
  [ORDER_STATUS.PAID]: [ORDER_STATUS.ORDERED, ORDER_STATUS.CANCELED],
  [ORDER_STATUS.ORDERED]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELED],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DONE],
  [ORDER_STATUS.DONE]: [],
  [ORDER_STATUS.CANCELED]: [],
}[s] || []);

export const canAdvance = (from, to) => nextStatuses(from).includes(to);

/** 주문 한 건 만들기 */
export function newOrder({ gear, qty, buyerUid, buyerName, phone, addr }) {
  const n = Math.max(1, Math.round(num(qty) || 1));
  const m = margin(gear);
  return {
    gearId: gear?.id || '',
    title: gear?.title || '',
    qty: n,
    price: num(gear?.price),
    shipFee: num(gear?.shipFee),
    amount: (num(gear?.price) * n) + num(gear?.shipFee),
    expectedProfit: m.profit * n,
    supplier: gear?.supplier || '',
    buyerUid: buyerUid || '',
    buyerName: buyerName || '',
    phone: String(phone || '').trim(),
    addr: String(addr || '').trim(),
    status: ORDER_STATUS.PLACED,
    createdAt: new Date().toISOString(),
  };
}

/** 주문을 받을 준비가 됐는가 — 배송지 없이 주문받으면 보낼 수 없다 */
export function orderReady(o) {
  const missing = [];
  if (!String(o?.buyerName || '').trim()) missing.push('받는 분');
  if (String(o?.phone || '').replace(/[^0-9]/g, '').length < 9) missing.push('연락처');
  if (!String(o?.addr || '').trim()) missing.push('배송지');
  return { ok: missing.length === 0, missing };
}
