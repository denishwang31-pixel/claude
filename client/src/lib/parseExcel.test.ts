import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseTransactionFile, resolveYearlessDate } from "./parseExcel";

function fileFromAoa(aoa: unknown[][], sheetName = "Sheet1"): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return { arrayBuffer: async () => buf, name: "test.xlsx" } as unknown as File;
}

describe("파일 파서 프리셋", () => {
  it("카드 파일(제목행+단일 이용금액)을 지출로 파싱", async () => {
    const f = fileFromAoa([
      ["삼성카드 이용내역"],
      ["이용일자", "이용가맹점", "이용금액", "카드구분"],
      ["2026.06.15", "스타벅스 강남점", "5,500", "삼성카드"],
    ]);
    const { rows, format } = await parseTransactionFile(f);
    expect(format).toContain("일반");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-5500);
    expect(rows[0].txType).toBe("지출");
    expect(rows[0].paymentMethod).toBe("삼성카드");
  });

  it("은행 파일(입금/출금 분리)을 부호까지 파싱", async () => {
    const f = fileFromAoa([
      ["거래일시", "적요", "출금", "입금", "거래후잔액"],
      ["2026-06-15 14:30:00", "월급", "", "3,000,000", "3,500,000"],
      ["2026-06-16 09:00:00", "이체 김철수", "50,000", "", "3,450,000"],
    ]);
    const { rows } = await parseTransactionFile(f);
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(3000000);
    expect(rows[0].txType).toBe("수입");
    expect(rows[1].amount).toBe(-50000);
  });

  it("뱅크샐러드 시트를 인식", async () => {
    const f = fileFromAoa(
      [
        ["날짜", "시간", "타입", "대분류", "소분류", "내용", "금액", "화폐", "결제수단", "메모"],
        ["2026-06-15", "10:00", "지출", "생활", "마트", "이마트", "-20000", "KRW", "현대카드", ""],
      ],
      "가계부 내역"
    );
    const { rows, format } = await parseTransactionFile(f);
    expect(format).toBe("뱅크샐러드");
    expect(rows[0].content).toBe("이마트");
    expect(rows[0].amount).toBe(-20000);
  });
});

describe("연도 없는 날짜 해석(연말·연초)", () => {
  it("오늘보다 미래면 작년으로", () => {
    // 오늘을 1월 5일로 고정
    const RealDate = Date;
    // @ts-expect-error 테스트용 Date 고정
    global.Date = class extends RealDate {
      constructor(...args: unknown[]) {
        // @ts-expect-error
        super(...(args.length ? args : [2026, 0, 5]));
      }
      static now() { return new RealDate(2026, 0, 5).getTime(); }
    } as unknown as DateConstructor;
    try {
      expect(resolveYearlessDate(12, 28)).toBe("2025-12-28"); // 미래 → 작년
      expect(resolveYearlessDate(1, 3)).toBe("2026-01-03");   // 과거 → 올해
    } finally {
      global.Date = RealDate;
    }
  });
});
