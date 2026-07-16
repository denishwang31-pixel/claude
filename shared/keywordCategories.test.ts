import { describe, it, expect } from "vitest";
import { classifyByKeywords, buildKeywordCaseSQL, KEYWORD_CATEGORY_RULES } from "./keywordCategories";

describe("가맹점 키워드 자동분류", () => {
  const cases: [string, string][] = [
    ["스타벅스 강남점", "카페"],
    ["GS25 역삼", "식비"],
    ["이마트 성수점", "식비"],
    ["CU 편의점", "식비"],
    ["카카오택시", "교통비"],
    ["우리운수(주)", "교통비"],
    ["넷플릭스", "구독비"],
    ["배달의민족", "외식&배달"],
    ["SK주유소", "차량유지비"],
    ["KT 통신요금", "통신비"],
    ["올리브영", "미용"],
    ["메가박스 코엑스", "여행&문화생활"],
    ["삼성생명보험", "보험_미지정"],
    ["한국전력공사", "공과금"],
    ["쿠팡", "쇼핑"],
    ["다이소 홍대", "쇼핑"],
    ["서울대학교병원", "병원_미지정"],
    ["김밥천국", "외식&배달"],
    ["스파오 매장", "쇼핑"],
    ["토스증권", "투자"],
    ["급여 (주)회사", "근로소득"],
    ["국민카드 카드대금", "기타_기타"],
    ["미래에셋증권 적금", "투자"],
    ["헬스장 등록", "운동"],
    ["현대오일뱅크", "차량유지비"],
    ["알수없는가맹점XYZ", null as unknown as string],
  ];

  it.each(cases)("%s → %s", (content, expected) => {
    expect(classifyByKeywords(content)).toBe(expected);
  });

  it("벅스뮤직↔스타벅스 부분문자열 충돌이 없다", () => {
    expect(classifyByKeywords("스타벅스")).toBe("카페");
  });

  it("생성된 SQL CASE 가 유효한 형태다", () => {
    const sql = buildKeywordCaseSQL("LOWER(t.content)");
    expect(sql.startsWith("CASE")).toBe(true);
    expect(sql).toContain("ELSE NULL");
    expect(KEYWORD_CATEGORY_RULES.length).toBeGreaterThan(20);
  });
});
