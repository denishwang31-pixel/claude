/* ============================================================
   회비 납부 — 간편송금으로 바로 보내기

   무엇을 만들었고 무엇을 못 만들었는가 (먼저 밝힌다)

     만든 것: 송금 앱으로 "받는 계좌와 금액이 채워진 채" 넘어가기.
       회원은 [납부] → [토스로 보내기] 를 누르면 토스가 열리고 계좌·금액이
       이미 입력돼 있다. 확인만 누르면 끝난다. 계약도 수수료도 없다.

     못 만든 것: 앱 안에서 카드로 결제하고 자동으로 납부 처리되는 것.
       그건 PG(결제대행) 계약이 있어야 한다. 사업자등록증·정산계좌·심사가
       필요하고 건당 수수료가 붙는다. PRE-LAUNCH.md D 에 적어 두었다.

   그래서 지금 흐름은 이렇다
     회원이 송금한다 → 총무 계좌에 입금된다 → [입금 대사] 화면이 거래내역을
     읽어 자동으로 납부 처리한다. 대사 기능은 이미 있으므로, 여기서 하는
     일은 "송금을 쉽게 만드는 것"뿐이다.

   왜 방법마다 다르게 처리하나
     토스는 계좌번호로 송금 화면을 바로 열 수 있다. 카카오페이·네이버페이는
     그런 공개 방식이 없어서, 총무가 자기 앱에서 만든 송금 링크를 클럽
     설정에 넣어 두면 그 링크를 연다. 없으면 그 버튼은 아예 안 보인다 —
     눌러도 안 되는 버튼을 두면 사용자는 앱이 고장 났다고 생각한다.
   ============================================================ */

/** 송금 수단 */
export const PAY_METHODS = {
  TOSS: 'toss',
  KAKAOPAY: 'kakaopay',
  NAVERPAY: 'naverpay',
  COPY: 'copy',
};

export const PAY_LABEL = {
  [PAY_METHODS.TOSS]: '토스로 보내기',
  [PAY_METHODS.KAKAOPAY]: '카카오페이로 보내기',
  [PAY_METHODS.NAVERPAY]: '네이버페이로 보내기',
  [PAY_METHODS.COPY]: '계좌번호 복사',
};

/** 은행 목록 — 클럽 설정에서 고르게 해서 표기가 흔들리지 않게 한다 */
export const BANKS = [
  '국민', '신한', '우리', '하나', '농협', '기업', 'SC제일', '씨티',
  '카카오뱅크', '토스뱅크', '케이뱅크',
  '부산', '대구', '경남', '광주', '전북', '제주',
  '새마을', '신협', '우체국', '수협', '산업',
];

const digits = (s) => String(s || '').replace(/[^0-9]/g, '');

/** 계좌 정보가 송금에 쓸 만한가 */
export function accountOk(acc) {
  return !!acc && BANKS.includes(String(acc.bank || '').trim()) && digits(acc.number).length >= 8;
}

/** "신한 110-123-456789 (홍길동)" — 화면과 복사 양쪽에 같은 문구를 쓴다 */
export function accountText(acc) {
  if (!acc?.bank && !acc?.number) return '';
  return [acc.bank, acc.number, acc.holder ? `(${acc.holder})` : ''].filter(Boolean).join(' ');
}

/**
 * 예전에 자유 입력으로 받아 둔 계좌 문자열에서 은행과 번호를 건져 낸다.
 *
 * 왜 필요한가
 *   클럽 설정의 입금 계좌는 지금까지 "신한 110-123-456789 (홍길동)" 처럼
 *   한 줄로 받았다. 새 칸을 만들었다고 기존 클럽이 전부 다시 입력하지는
 *   않는다. 읽어 낼 수 있으면 아무것도 안 해도 송금 버튼이 켜진다.
 *   못 읽으면 조용히 빈 값을 돌려주고, 화면은 계좌 복사만 보여 준다.
 */
export function parseAccountText(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const bank = BANKS.find((b) => s.includes(b));
  const m = s.match(/[0-9][0-9-]{6,}[0-9]/);
  if (!bank || !m) return null;
  const holder = (s.match(/\(([^)]+)\)/) || [])[1] || '';
  return { bank, number: m[0], holder: holder.trim() };
}

/**
 * 클럽 설정에서 송금 정보를 꺼낸다. 새 칸이 있으면 그걸 쓰고,
 * 없으면 예전 자유 입력 문자열에서 건져 본다.
 */
export function paySettings(settings) {
  const p = settings?.payment || {};
  /* 설정 화면은 payment 를 납작하게 저장한다({bank, number, holder, ...}).
     앞으로 중첩 형태({account:{...}})로 넘어올 수도 있어 둘 다 받는다 —
     한쪽만 읽으면 저장은 되는데 버튼이 안 생기는 조용한 고장이 난다. */
  const flat = { bank: p.bank, number: p.number, holder: p.holder };
  const account = accountOk(p.account) ? p.account
    : accountOk(flat) ? flat
      : parseAccountText(settings?.feeAccount);
  return {
    account: account || null,
    kakaoPayLink: p.kakaoPayLink || '',
    naverPayLink: p.naverPayLink || '',
  };
}

/**
 * 토스 송금 주소.
 *
 * ⚠️ 이 주소 형식은 토스가 문서로 공개한 것이 아니라 널리 쓰이는 방식이다.
 *    실기기에서 한 번은 직접 눌러 확인해야 한다. 열리지 않으면 아래
 *    openPay 가 실패를 돌려주고 화면은 계좌 복사로 떨어진다 —
 *    회원이 막다른 길에 갇히지는 않는다.
 */
export function tossUrl(acc, amount) {
  if (!accountOk(acc)) return '';
  const p = new URLSearchParams({
    bank: String(acc.bank).trim(),
    accountNo: digits(acc.number),
  });
  const n = Number(amount);
  if (Number.isFinite(n) && n > 0) p.set('amount', String(Math.round(n)));
  return `supertoss://send?${p.toString()}`;
}

/**
 * 그 클럽에서 지금 쓸 수 있는 송금 수단.
 * pay = 클럽 설정의 { account: {bank, number, holder}, kakaoPayLink, naverPayLink }
 */
export function availableMethods(pay) {
  const out = [];
  if (accountOk(pay?.account)) out.push(PAY_METHODS.TOSS);
  if (String(pay?.kakaoPayLink || '').startsWith('http')) out.push(PAY_METHODS.KAKAOPAY);
  if (String(pay?.naverPayLink || '').startsWith('http')) out.push(PAY_METHODS.NAVERPAY);
  if (accountText(pay?.account)) out.push(PAY_METHODS.COPY);
  return out;
}

/**
 * 그 수단으로 열 주소. COPY 는 주소가 아니라 복사할 문자열을 돌려준다.
 * 화면은 kind 를 보고 Linking.openURL 과 Clipboard 중 하나를 고른다.
 */
export function payTarget(method, pay, amount) {
  if (method === PAY_METHODS.TOSS) {
    const url = tossUrl(pay?.account, amount);
    return url ? { kind: 'url', value: url } : null;
  }
  if (method === PAY_METHODS.KAKAOPAY) {
    const url = String(pay?.kakaoPayLink || '');
    return url.startsWith('http') ? { kind: 'url', value: url } : null;
  }
  if (method === PAY_METHODS.NAVERPAY) {
    const url = String(pay?.naverPayLink || '');
    return url.startsWith('http') ? { kind: 'url', value: url } : null;
  }
  if (method === PAY_METHODS.COPY) {
    const t = accountText(pay?.account);
    return t ? { kind: 'copy', value: t } : null;
  }
  return null;
}

/**
 * 송금하고 나면 무엇이 남아야 하는가.
 *
 * 회원이 "보냈다"고 눌러도 그것만으로 납부 처리하지 않는다. 실제 입금은
 * [입금 대사]가 거래내역을 보고 확인한다. 여기서는 "이 회원이 이 달치를
 * 얼마 보냈다고 말했다"는 기록만 남긴다 — 총무가 대조할 때 단서가 된다.
 */
export function payClaim({ uid, name, month, amount, method }) {
  return {
    uid: uid || '',
    name: name || '',
    month: month || '',
    amount: Number(amount) || 0,
    method: method || '',
    claimedAt: new Date().toISOString(),
    confirmed: false,       // 대사에서 확인되면 true 로 바뀐다
  };
}

/** 회원이 보냈다고 한 금액과 실제 입금이 맞는가 — 대사 화면에서 쓴다 */
export function claimMatches(claim, deposit) {
  if (!claim || !deposit) return false;
  return Number(claim.amount) === Number(deposit.amount)
    && String(claim.month) === String(deposit.month || claim.month);
}
