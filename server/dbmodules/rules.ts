import { and, eq, sql } from "drizzle-orm";
import {
  getDb, rebakeAutoCategories, OLD_CATEGORY_REMAP, remapOldCategory,
  categoryToRuleType, APP_L3_CATEGORIES, buildEffectiveCategoryExpr,
} from "./core";

/**
 * 활성 매핑 규칙을 거래에 매칭해 그 결과를 ruleCategory 컬럼에 굳힌다.
 * 규칙이 추가/삭제/토글되거나 새 거래가 업로드될 때 호출한다.
 * 우선순위(원래 읽기 서브쿼리와 동일): 완전일치 > 포함, 같은 종류면 낮은 id.
 * 완전일치는 content = keyword 등가조인이라 해시조인으로 O(거래+규칙),
 * 포함(LIKE)은 사용자가 만든 소수의 규칙만 해당되어 부담이 작다.
 */
export async function bakeRuleCategories(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // 1) 초기화
  await db.execute(sql`UPDATE transactions SET "ruleCategory" = NULL WHERE "userId" = ${userId}`);

  // 2) 포함(LIKE) 규칙 먼저 반영 (낮은 우선순위) — 같은 거래에 여러 규칙이
  //    걸리면 낮은 id 우선
  await db.execute(sql.raw(
    `WITH cm AS (
       SELECT DISTINCT ON (t.id) t.id, cr.category
       FROM transactions t
       JOIN category_rules cr
            ON cr."userId" = ${userId} AND cr."isActive"::int = 1 AND cr."isExact"::int = 0
           AND t.content LIKE '%' || cr.keyword || '%'
       WHERE t."userId" = ${userId} AND t.content IS NOT NULL
       ORDER BY t.id, cr.id ASC
     )
     UPDATE transactions t SET "ruleCategory" = cm.category
       FROM cm WHERE t.id = cm.id`
  ));

  // 3) 완전일치 규칙으로 덮어씀 (높은 우선순위)
  await db.execute(sql.raw(
    `WITH em AS (
       SELECT DISTINCT ON (t.id) t.id, cr.category
       FROM transactions t
       JOIN category_rules cr
            ON cr."userId" = ${userId} AND cr."isActive"::int = 1 AND cr."isExact"::int = 1
           AND t.content = cr.keyword
       WHERE t."userId" = ${userId} AND t.content IS NOT NULL
       ORDER BY t.id, cr.id ASC
     )
     UPDATE transactions t SET "ruleCategory" = em.category
       FROM em WHERE t.id = em.id`
  ));
}


// ── 카테고리 매핑 규칙 ─────────────────────────────────────────

export async function getCategoryRules(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(
    sql`SELECT id, keyword, category, "isExact", "ruleType", "isActive", "createdAt" FROM category_rules WHERE "userId" = ${userId} ORDER BY "createdAt" DESC`
  );

  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    keyword: String(r.keyword),
    category: String(r.category),
    isExact: r.isExact === true || r.isExact === 1,
    ruleType: String(r.ruleType ?? "expense"),
    isActive: r.isActive === true || r.isActive === 1 || r.isActive === "1",
    createdAt: r.createdAt,
  }));
}

export async function upsertCategoryRule(
  userId: number,
  keyword: string,
  category: string,
  isExact = false,
  ruleType = "expense"
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(
    sql`INSERT INTO category_rules ("userId", keyword, category, "isExact", "ruleType")
        VALUES (${userId}, ${keyword}, ${category}, ${isExact ? 1 : 0}, ${ruleType})
        ON CONFLICT ("userId", keyword) DO UPDATE SET category = ${category}, "isExact" = ${isExact ? 1 : 0}, "ruleType" = ${ruleType}, "updatedAt" = NOW()`
  );

  // 기존 거래에 즉시 반영 (customCategory가 없는 항목만)
  if (isExact) {
    await db.execute(
      sql`UPDATE transactions SET "customCategory" = ${category}
          WHERE "userId" = ${userId} AND content = ${keyword} AND "customCategory" IS NULL`
    );
  } else {
    await db.execute(
      sql`UPDATE transactions SET "customCategory" = ${category}
          WHERE "userId" = ${userId} AND content LIKE ${'%' + keyword + '%'} AND "customCategory" IS NULL`
    );
  }
}

export async function deleteCategoryRule(userId: number, ruleId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`DELETE FROM category_rules WHERE id = ${ruleId} AND "userId" = ${userId}`
  );
}

export async function updateCategoryRuleActive(
  userId: number,
  ruleId: number,
  isActive: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`UPDATE category_rules SET "isActive" = ${isActive ? 1 : 0}, "updatedAt" = NOW()
        WHERE id = ${ruleId} AND "userId" = ${userId}`
  );
}

export async function seedDefaultRules(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const defaultRules: { keyword: string; category: string; isExact: boolean; ruleType: string }[] = [
    // ── 수입 ───────────────────────────────────────────────────
    { keyword: "급여", category: "근로소득", isExact: false, ruleType: "income" },
    { keyword: "월급", category: "근로소득", isExact: false, ruleType: "income" },
    { keyword: "상여", category: "수당", isExact: false, ruleType: "income" },
    { keyword: "보너스", category: "수당", isExact: false, ruleType: "income" },
    { keyword: "이자", category: "부가소득", isExact: false, ruleType: "income" },
    { keyword: "환급", category: "수입", isExact: false, ruleType: "income" },
    // ── 저축 ───────────────────────────────────────────────────
    { keyword: "청약", category: "청약", isExact: false, ruleType: "savings" },
    { keyword: "적금", category: "적금", isExact: false, ruleType: "savings" },
    { keyword: "저축은행", category: "저축", isExact: false, ruleType: "savings" },
    { keyword: "예금", category: "예금", isExact: false, ruleType: "savings" },
    { keyword: "CMA", category: "CMA", isExact: false, ruleType: "savings" },
    // ── 투자 ───────────────────────────────────────────────────
    { keyword: "ETF", category: "ETF", isExact: false, ruleType: "investment" },
    { keyword: "주식", category: "주식", isExact: false, ruleType: "investment" },
    { keyword: "펀드", category: "펀드", isExact: false, ruleType: "investment" },
    { keyword: "ISA", category: "ISA", isExact: false, ruleType: "investment" },
    { keyword: "IRP", category: "IRP", isExact: false, ruleType: "investment" },
    // ── 식비(마트/장보기/편의점) ──────────────────────────────
    { keyword: "편의점", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "GS25", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "CU", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "세븐일레븐", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "정육", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "청과", category: "식비", isExact: false, ruleType: "expense" },
    // ── 외식 ───────────────────────────────────────────────────
    { keyword: "맥도날드", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "버거킹", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "롯데리아", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "KFC", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "서브웨이", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "파파존스", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "피자헛", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "도미노", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "김밥천국", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "식당", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "맛집", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "고깃집", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "한식", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "중식", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "일식", category: "외식", isExact: false, ruleType: "expense" },
    { keyword: "분식", category: "외식", isExact: false, ruleType: "expense" },
    // ── 배달음식 ───────────────────────────────────────────────
    { keyword: "배달의민족", category: "배달음식", isExact: false, ruleType: "expense" },
    { keyword: "배민", category: "배달음식", isExact: false, ruleType: "expense" },
    { keyword: "쿠팡이츠", category: "배달음식", isExact: false, ruleType: "expense" },
    { keyword: "요기요", category: "배달음식", isExact: false, ruleType: "expense" },
    { keyword: "배달", category: "배달음식", isExact: false, ruleType: "expense" },
    // ── 카페 ───────────────────────────────────────────────────
    { keyword: "스타벅스", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "이디야", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "커피빈", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "투썸플레이스", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "메가커피", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "빽다방", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "할리스", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "폴바셋", category: "카페", isExact: false, ruleType: "expense" },
    // ── 생활용품 ───────────────────────────────────────────────
    { keyword: "다이소", category: "생활용품", isExact: false, ruleType: "expense" },
    { keyword: "이케아", category: "생활용품", isExact: false, ruleType: "expense" },
    { keyword: "코스트코", category: "생활용품", isExact: false, ruleType: "expense" },
    { keyword: "생활용품", category: "생활용품", isExact: false, ruleType: "expense" },
    { keyword: "홈데코", category: "생활용품", isExact: false, ruleType: "expense" },
    // ── 쇼핑 ───────────────────────────────────────────────────
    { keyword: "쿠팡", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "이마트", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "홈플러스", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "롯데마트", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "11번가", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "지마켓", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "옥션", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "SSG", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "무신사", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "에이블리", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "지그재그", category: "쇼핑", isExact: false, ruleType: "expense" },
    // ── 미용 ───────────────────────────────────────────────────
    { keyword: "올리브영", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "왓슨스", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "이니스프리", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "에뛰드", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "아이오페", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "헤어", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "미용실", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "네일", category: "미용", isExact: false, ruleType: "expense" },
    { keyword: "피부과", category: "미용", isExact: false, ruleType: "expense" },
    // ── 건강 ───────────────────────────────────────────────────
    { keyword: "헬스장", category: "건강", isExact: false, ruleType: "expense" },
    { keyword: "헬스클럽", category: "건강", isExact: false, ruleType: "expense" },
    { keyword: "필라테스", category: "건강", isExact: false, ruleType: "expense" },
    { keyword: "요가", category: "건강", isExact: false, ruleType: "expense" },
    { keyword: "수영장", category: "건강", isExact: false, ruleType: "expense" },
    { keyword: "PT", category: "건강", isExact: false, ruleType: "expense" },
    { keyword: "약국", category: "의료", isExact: false, ruleType: "expense" },
    // ── 의료 ───────────────────────────────────────────────────
    { keyword: "병원", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "의원", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "치과", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "한의원", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "안과", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "이비인후과", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "정형외과", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "내과", category: "의료", isExact: false, ruleType: "expense" },
    { keyword: "소아과", category: "의료", isExact: false, ruleType: "expense" },
    // ── 교육 ───────────────────────────────────────────────────
    { keyword: "학원", category: "교육", isExact: false, ruleType: "expense" },
    { keyword: "교보문고", category: "교육", isExact: false, ruleType: "expense" },
    { keyword: "영풍문고", category: "교육", isExact: false, ruleType: "expense" },
    { keyword: "알라딘", category: "교육", isExact: false, ruleType: "expense" },
    { keyword: "도서", category: "교육", isExact: false, ruleType: "expense" },
    { keyword: "인강", category: "교육", isExact: false, ruleType: "expense" },
    { keyword: "수강료", category: "교육", isExact: false, ruleType: "expense" },
    // ── 여행 ───────────────────────────────────────────────────
    { keyword: "호텔", category: "여행", isExact: false, ruleType: "expense" },
    { keyword: "항공", category: "여행", isExact: false, ruleType: "expense" },
    { keyword: "여행", category: "여행", isExact: false, ruleType: "expense" },
    { keyword: "펜션", category: "여행", isExact: false, ruleType: "expense" },
    { keyword: "리조트", category: "여행", isExact: false, ruleType: "expense" },
    { keyword: "에어비앤비", category: "여행", isExact: false, ruleType: "expense" },
    { keyword: "야놀자", category: "여행", isExact: false, ruleType: "expense" },
    { keyword: "여기어때", category: "여행", isExact: false, ruleType: "expense" },
    // ── 교통 ───────────────────────────────────────────────────
    { keyword: "카카오택시", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "카카오T", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "우버", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "주유", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "GS칼텍스", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "SK주유소", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "고속도로", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "하이패스", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "T머니", category: "교통", isExact: false, ruleType: "expense" },
    // ── 통신 ───────────────────────────────────────────────────
    { keyword: "SKT", category: "통신", isExact: false, ruleType: "expense" },
    { keyword: "SK텔레콤", category: "통신", isExact: false, ruleType: "expense" },
    { keyword: "KT", category: "통신", isExact: false, ruleType: "expense" },
    { keyword: "LG유플러스", category: "통신", isExact: false, ruleType: "expense" },
    { keyword: "알뜰폰", category: "통신", isExact: false, ruleType: "expense" },
    // ── 구독 ───────────────────────────────────────────────────
    { keyword: "넷플릭스", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "유튜브프리미엄", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "멜론", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "스포티파이", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "왓챠", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "웨이브", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "애플뮤직", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "XBOX", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "플레이스테이션", category: "구독", isExact: false, ruleType: "expense" },
    // ── 문화 ───────────────────────────────────────────────────
    { keyword: "CGV", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "메가박스", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "롯데시네마", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "공연", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "뮤지컬", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "콘서트", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "노래방", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "PC방", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "볼링", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "전시", category: "문화", isExact: false, ruleType: "expense" },
    // ── 주거 ───────────────────────────────────────────────────
    { keyword: "관리비", category: "주거", isExact: false, ruleType: "expense" },
    { keyword: "월세", category: "주거", isExact: false, ruleType: "expense" },
    { keyword: "전기요금", category: "주거", isExact: false, ruleType: "expense" },
    { keyword: "가스요금", category: "주거", isExact: false, ruleType: "expense" },
    { keyword: "수도요금", category: "주거", isExact: false, ruleType: "expense" },
    { keyword: "인터넷", category: "주거", isExact: false, ruleType: "expense" },
    // ── 세금/금융 ──────────────────────────────────────────────
    { keyword: "국세청", category: "세금", isExact: false, ruleType: "expense" },
    { keyword: "지방세", category: "세금", isExact: false, ruleType: "expense" },
    { keyword: "국민건강보험", category: "세금", isExact: false, ruleType: "expense" },
    { keyword: "국민연금", category: "세금", isExact: false, ruleType: "expense" },
    { keyword: "4대보험", category: "세금", isExact: false, ruleType: "expense" },
    { keyword: "카드대금", category: "금융", isExact: false, ruleType: "expense" },
    { keyword: "이체수수료", category: "금융", isExact: false, ruleType: "expense" },
    { keyword: "ATM수수료", category: "금융", isExact: false, ruleType: "expense" },
  ];

  let inserted = 0;
  for (const rule of defaultRules) {
    try {
      await db.execute(
        sql`INSERT INTO category_rules ("userId", keyword, category, "isExact", "ruleType")
            VALUES (${userId}, ${rule.keyword}, ${remapOldCategory(rule.category)}, ${rule.isExact ? 1 : 0}, ${rule.ruleType})
            ON CONFLICT ("userId", keyword) DO NOTHING`
      );
      inserted++;
    } catch {
      // skip on error
    }
  }
  return inserted;
}

export async function generateRulesFromTransactions(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const SAVINGS_KEYWORDS = ["청약", "적금", "저축", "예금", "CMA"];
  const INVEST_KEYWORDS = ["ETF", "주식", "펀드", "ISA", "IRP", "투자"];

  // 뱅크샐러드 대분류 원본이 아니라 앱 L3로 매핑된 카테고리를 규칙에 저장한다.
  // (autoCategory에 이미 굳혀둔 자동분류 결과 재사용 — 읽기 비용 절감)
  const mappedCat = `COALESCE(t."customCategory", t."autoCategory", '기타_기타')`;
  const rows = await db.execute(sql.raw(
    `SELECT t.content, ${mappedCat} as category, t."txType", COUNT(*) as cnt
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND t.content IS NOT NULL AND t.content != '' AND t.content != '-'
     GROUP BY t.content, ${mappedCat}, t."txType"
     ORDER BY cnt DESC`
  ));

  let inserted = 0;
  for (const r of rows as any[]) {
    const keyword = String(r.content).trim();
    const category = String(r.category).trim();
    const txType = String(r.txType);
    if (!keyword || !category || keyword.length > 255) continue;

    let ruleType = "expense";
    if (txType === "수입") ruleType = "income";
    else if (SAVINGS_KEYWORDS.some((k) => category.includes(k))) ruleType = "savings";
    else if (INVEST_KEYWORDS.some((k) => category.includes(k))) ruleType = "investment";

    try {
      await db.execute(
        sql`INSERT INTO category_rules ("userId", keyword, category, "isExact", "ruleType", "isActive")
            VALUES (${userId}, ${keyword}, ${category}, 1, ${ruleType}, 1)
            ON CONFLICT ("userId", keyword) DO NOTHING`
      );
      inserted++;
    } catch { /* skip */ }
  }
  return inserted;
}


/**
 * 활성 규칙을 모든 거래에 적용해 ruleCategory를 다시 굳힌다.
 * (예전에는 customCategory를 덮어써 수동 지정을 파괴했지만, 이제는
 *  규칙 결과를 별도 컬럼 ruleCategory에만 반영하므로 수동 지정이 보존된다.)
 */
export async function applyRulesToAllTransactions(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // 자동분류(키워드 사전 갱신 반영)도 함께 재계산 → '전체 재적용'이 분류를 최신화한다.
  await rebakeAutoCategories(userId);
  await bakeRuleCategories(userId);

  // 규칙이 실제로 매칭된 거래 수 반환
  const result = (await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM transactions
     WHERE "userId" = ${userId} AND "ruleCategory" IS NOT NULL
  `)) as any[];
  return Number(result[0]?.cnt ?? 0);
}

export async function applyMappingRulesToNewTransactions(
  userId: number,
  dedupHashes: string[]
): Promise<void> {
  const db = await getDb();
  if (!db || dedupHashes.length === 0) return;

  // 새로 들어온 거래에만 규칙 매칭 결과(ruleCategory)를 반영한다.
  // 범위를 dedupHash 목록으로 한정해 청크 크기(≈200)에 비례하는 비용만 든다.
  const hashList = sql.join(dedupHashes.map((h) => sql`${h}`), sql`, `);

  // 포함(LIKE) 규칙 → 낮은 우선순위
  await db.execute(sql`
    WITH cm AS (
      SELECT DISTINCT ON (t.id) t.id, cr.category
      FROM transactions t
      JOIN category_rules cr
           ON cr."userId" = ${userId} AND cr."isActive"::int = 1 AND cr."isExact"::int = 0
          AND t.content LIKE '%' || cr.keyword || '%'
      WHERE t."userId" = ${userId} AND t."dedupHash" IN (${hashList}) AND t.content IS NOT NULL
      ORDER BY t.id, cr.id ASC
    )
    UPDATE transactions t SET "ruleCategory" = cm.category
      FROM cm WHERE t.id = cm.id
  `);

  // 완전일치 규칙 → 높은 우선순위(덮어씀)
  await db.execute(sql`
    WITH em AS (
      SELECT DISTINCT ON (t.id) t.id, cr.category
      FROM transactions t
      JOIN category_rules cr
           ON cr."userId" = ${userId} AND cr."isActive"::int = 1 AND cr."isExact"::int = 1
          AND t.content = cr.keyword
      WHERE t."userId" = ${userId} AND t."dedupHash" IN (${hashList}) AND t.content IS NOT NULL
      ORDER BY t.id, cr.id ASC
    )
    UPDATE transactions t SET "ruleCategory" = em.category
      FROM em WHERE t.id = em.id
  `);
}
