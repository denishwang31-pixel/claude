import { describe, it, expect } from "vitest";
import { parsePaymentSms } from "./parseSms";

describe("결제 문자 파싱", () => {
  it("신한카드 승인 문자", () => {
    const r = parsePaymentSms("[Web발신]\n신한카드(1234)승인\n홍길동님\n12,000원 일시불\n06/15 14:30\n스타벅스강남점");
    expect(r).toBeTruthy();
    expect(r!.amount).toBe(12000);
    expect(r!.txType).toBe("지출");
    expect(r!.txTime).toBe("14:30");
    expect(r!.issuer).toBe("신한카드");
    expect(r!.content).toContain("스타벅스");
  });

  it("국민카드 승인", () => {
    const r = parsePaymentSms("KB국민카드 승인 5,500원 06/15 14:30 GS25역삼점");
    expect(r!.amount).toBe(5500);
    expect(r!.txType).toBe("지출");
    expect(r!.content).toContain("GS25");
  });

  it("은행 출금 → 지출, 가맹점=상대방", () => {
    const r = parsePaymentSms("[우리은행] 06/16 09:00 출금 50,000원 잔액 3,450,000원 김철수");
    expect(r!.amount).toBe(50000);
    expect(r!.txType).toBe("지출");
    expect(r!.content).toBe("김철수");
  });

  it("급여 입금 → 수입", () => {
    const r = parsePaymentSms("[신한] 06/25 급여 이체입금 3,000,000원 잔액 5,000,000원");
    expect(r!.amount).toBe(3000000);
    expect(r!.txType).toBe("수입");
  });

  it("취소 문자는 [취소] 표기", () => {
    const r = parsePaymentSms("[Web발신] 삼성카드 취소 12,000원 06/17 스타벅스");
    expect(r!.content.startsWith("[취소]")).toBe(true);
  });

  it("금액이 없으면 null", () => {
    expect(parsePaymentSms("안녕하세요 광고 문자입니다")).toBeNull();
  });
});
