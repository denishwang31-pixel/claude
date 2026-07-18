import { sql } from "drizzle-orm";
import {
  getDb, buildEffectiveCategoryExpr, ownerSQL, dateRangeSQL,
  SAVINGS_CATS, TRANSFER_CATS, INCOME_DETAILED,
} from "./core";
import { getCategoryRules } from "./rules";

/** 월별 수입/지출 집계 */
export async function getMonthlyStats(
  userId: number,
  includeTransfer: boolean,
  extraExcluded: string[],
  _excludedIds: number[],
  owner?: string
) {
  const db = await getDb();
  if (!db) return [];

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);

  const catExclude = [
    ...(includeTransfer ? [] : TRANSFER_CATS),
    ...extraExcluded,
  ].filter((c) => !SAVINGS_CATS.includes(c));

  const catExcludeSQL = catExclude.length > 0
    ? `AND (${effectiveCatExpr}) NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const notExcludedSQL = `AND (NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;

  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
  const [incomeRows, expenseRows] = await Promise.all([
    db.execute(sql.raw(
      `SELECT TO_CHAR(t."txDate", 'YYYY-MM') as "yearMonth", ABS(SUM(t.amount::numeric)) as total
       FROM transactions t
       WHERE t."userId" = ${userId}
         AND t.amount::numeric > 0
         AND (${effectiveCatExpr}) NOT IN (${savingsCatsSQL})
         ${catExcludeSQL}
         ${notExcludedSQL}
         ${ownerSQL(owner)}
       GROUP BY TO_CHAR(t."txDate", 'YYYY-MM')
       ORDER BY TO_CHAR(t."txDate", 'YYYY-MM')`
    )),
    db.execute(sql.raw(
      `SELECT TO_CHAR(t."txDate", 'YYYY-MM') as "yearMonth", ABS(SUM(t.amount::numeric)) as total
       FROM transactions t
       WHERE t."userId" = ${userId}
         AND t.amount::numeric < 0
         AND (${effectiveCatExpr}) NOT IN (${savingsCatsSQL})
         ${catExcludeSQL}
         ${notExcludedSQL}
         ${ownerSQL(owner)}
       GROUP BY TO_CHAR(t."txDate", 'YYYY-MM')
       ORDER BY TO_CHAR(t."txDate", 'YYYY-MM')`
    )),
  ]);

  const result: { yearMonth: string; txType: string; total: number }[] = [];
  for (const r of incomeRows as any[]) result.push({ yearMonth: r.yearMonth, txType: "수입", total: Number(r.total) });
  for (const r of expenseRows as any[]) result.push({ yearMonth: r.yearMonth, txType: "지출", total: Number(r.total) });

  return result;
}

/** 카테고리별 지출 집계 */
export async function getCategoryStats(
  userId: number,
  includeTransfer: boolean,
  extraExcluded: string[],
  _excludedIds: number[],
  yearMonth?: string,
  dateStart?: string,
  dateEnd?: string,
  owner?: string
) {
  const db = await getDb();
  if (!db) return [];

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);

  const catExclude = [
    ...(includeTransfer ? [] : TRANSFER_CATS),
    ...extraExcluded,
  ].filter((c) => !SAVINGS_CATS.includes(c));

  const catExcludeSQL = catExclude.length > 0
    ? `AND (${effectiveCatExpr}) NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
  const notExcludedSQL = `AND (NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;
  const monthSQL = yearMonth && /^\d{4}-\d{2}$/.test(yearMonth) ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "";

  const rows = await db.execute(sql.raw(
    `SELECT
       CASE WHEN sub.l1 = 'income' AND sub."effectiveCategory" NOT IN ('근로소득','수당','부가소득') THEN '수입' ELSE sub."effectiveCategory" END as category,
       sub.l1,
       ABS(SUM(sub.amount::numeric)) as total, COUNT(*) as cnt
     FROM (
       SELECT t.amount,
              (${effectiveCatExpr}) as "effectiveCategory",
              CASE
                WHEN (${effectiveCatExpr}) IN (${savingsCatsSQL}) THEN 'savings'
                WHEN t.amount::numeric > 0 THEN 'income'
                ELSE 'expense'
              END as l1
       FROM transactions t
       WHERE t."userId" = ${userId}
         ${monthSQL}
         ${dateRangeSQL(dateStart, dateEnd)}
         ${ownerSQL(owner)}
         AND (
           ((${effectiveCatExpr}) IN (${savingsCatsSQL}) ${notExcludedSQL})
           OR
           ((${effectiveCatExpr}) NOT IN (${savingsCatsSQL}) ${catExcludeSQL} ${notExcludedSQL})
         )
     ) sub
     GROUP BY (CASE WHEN sub.l1 = 'income' AND sub."effectiveCategory" NOT IN ('근로소득','수당','부가소득') THEN '수입' ELSE sub."effectiveCategory" END), sub.l1
     ORDER BY sub.l1, ABS(SUM(sub.amount::numeric)) DESC`
  ));

  return (rows as any[]).map((r) => ({
    category: r.category,
    l1: String(r.l1) as "income" | "savings" | "expense",
    total: Number(r.total),
    count: Number(r.cnt),
  }));
}


/** 월별 × 카테고리 피벗 */
export async function getPivotData(
  userId: number,
  includeTransfer: boolean,
  extraExcluded: string[],
  _excludedIds: number[],
  dateStart?: string,
  dateEnd?: string,
  owner?: string
) {
  const db = await getDb();
  if (!db) return [];

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);

  const catExclude = [
    ...(includeTransfer ? [] : TRANSFER_CATS),
    ...extraExcluded,
  ].filter((c) => !SAVINGS_CATS.includes(c));

  const catExcludeSQL = catExclude.length > 0
    ? `AND (${effectiveCatExpr}) NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
  const notExcludedSQL = `AND (NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;

  const rows = await db.execute(sql.raw(
    `SELECT sub."yearMonth",
            CASE WHEN sub.l1 = 'income' AND sub."effectiveCategory" NOT IN ('근로소득','수당','부가소득') THEN '수입' ELSE sub."effectiveCategory" END as category,
            sub.l1,
            ABS(SUM(sub.amount::numeric)) as total, COUNT(*) as cnt
     FROM (
       SELECT TO_CHAR(t."txDate", 'YYYY-MM') as "yearMonth",
              t.amount,
              (${effectiveCatExpr}) as "effectiveCategory",
              CASE
                WHEN (${effectiveCatExpr}) IN (${savingsCatsSQL}) THEN 'savings'
                WHEN t.amount::numeric > 0 THEN 'income'
                ELSE 'expense'
              END as l1
       FROM transactions t
       WHERE t."userId" = ${userId}
         ${dateRangeSQL(dateStart, dateEnd)}
         ${ownerSQL(owner)}
         AND (
           ((${effectiveCatExpr}) IN (${savingsCatsSQL}) ${notExcludedSQL})
           OR
           ((${effectiveCatExpr}) NOT IN (${savingsCatsSQL}) ${catExcludeSQL} ${notExcludedSQL})
         )
     ) sub
     GROUP BY sub."yearMonth", (CASE WHEN sub.l1 = 'income' AND sub."effectiveCategory" NOT IN ('근로소득','수당','부가소득') THEN '수입' ELSE sub."effectiveCategory" END), sub.l1
     ORDER BY sub."yearMonth"`
  ));

  return (rows as any[]).map((r) => ({
    yearMonth: r.yearMonth,
    category: r.category,
    l1: String(r.l1) as "income" | "savings" | "expense",
    total: Number(r.total),
    count: Number(r.cnt),
  }));
}

/** KPI 요약 */
export async function getKpiSummary(
  userId: number,
  includeTransfer: boolean,
  extraExcluded: string[],
  _excludedIds: number[],
  dateStart?: string,
  dateEnd?: string,
  owner?: string
) {
  const db = await getDb();
  if (!db) return { totalIncome: 0, totalSavings: 0, totalExpense: 0, monthCount: 0 };

  const catExclude = [
    ...(includeTransfer ? [] : TRANSFER_CATS),
    ...extraExcluded,
  ].filter((c) => !SAVINGS_CATS.includes(c));

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
  // 이체/사용자 제외 카테고리 (저축은 제외하지 않음 — 저축은 별도 집계)
  const transferExcludeSQL = catExclude.length > 0
    ? catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")
    : "''";
  const notExcl = `(NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;

  // 입금(양수)=수입(단, 저축 카테고리 제외), 저축 카테고리는 입출금 net=저축, 그 외 출금=지출
  const rows = await db.execute(sql.raw(
    `SELECT
       SUM(CASE WHEN t.amount::numeric > 0
                     AND (${effectiveCatExpr}) NOT IN (${savingsCatsSQL})
                     AND (${effectiveCatExpr}) NOT IN (${transferExcludeSQL}) AND ${notExcl}
                THEN t.amount::numeric ELSE 0 END) as income,
       SUM(CASE WHEN (${effectiveCatExpr}) IN (${savingsCatsSQL}) AND ${notExcl}
                THEN -t.amount::numeric ELSE 0 END) as savings,
       SUM(CASE WHEN t.amount::numeric < 0
                     AND (${effectiveCatExpr}) NOT IN (${savingsCatsSQL})
                     AND (${effectiveCatExpr}) NOT IN (${transferExcludeSQL}) AND ${notExcl}
                THEN -t.amount::numeric ELSE 0 END) as expense,
       COUNT(DISTINCT TO_CHAR(t."txDate", 'YYYY-MM')) as months
     FROM transactions t WHERE t."userId" = ${userId} ${dateRangeSQL(dateStart, dateEnd)} ${ownerSQL(owner)}`
  ));

  const r = (rows as any[])[0];
  return {
    totalIncome:  Number(r?.income  ?? 0),
    totalSavings: Number(r?.savings ?? 0),
    totalExpense: Number(r?.expense ?? 0),
    monthCount:   Number(r?.months  ?? 0),
  };
}

/** L3(가맹점별) 집계 */
export async function getL3Stats(
  userId: number,
  category: string,
  yearMonth?: string,
  direction?: "income" | "expense",
  dateStart?: string,
  dateEnd?: string,
  owner?: string
): Promise<{ content: string; total: number; count: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const escapedCat = category.replace(/'/g, "''");
  const monthSQL = yearMonth && /^\d{4}-\d{2}$/.test(yearMonth) ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "";
  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
  // 부호로 방향 일치 (지출=출금/음수, 수입=입금/양수) → 환불이 지출에 섞이지 않음
  const signSQL = direction === "expense" ? "AND t.amount::numeric < 0"
                : direction === "income"  ? "AND t.amount::numeric > 0"
                : "";
  // '수입'은 단일 카테고리로 통합 — 양수·비저축·비이체 전체가 수입
  const catFilter = category === "수입"
    ? `t.amount::numeric > 0 AND (${effectiveCatExpr}) NOT IN (${savingsCatsSQL}) AND (${effectiveCatExpr}) NOT IN ('근로소득','수당','부가소득') AND (${effectiveCatExpr}) <> '이체'`
    : `(${effectiveCatExpr}) = '${escapedCat}'`;
  const notExcludedSQL = `AND (NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;

  const rows = await db.execute(sql.raw(
    `SELECT t.content, ABS(SUM(t.amount::numeric)) as total, COUNT(*) as cnt
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND ${catFilter}
       ${signSQL}
       ${monthSQL}
       ${dateRangeSQL(dateStart, dateEnd)}
       ${ownerSQL(owner)}
       ${notExcludedSQL}
     GROUP BY t.content
     ORDER BY total DESC`
  ));

  return (rows as any[]).map((r) => ({
    content: String(r.content),
    total: Number(r.total),
    count: Number(r.cnt),
  }));
}


/** 저축/투자 항목 집계 */
export async function getSavingsStats(userId: number): Promise<{
  items: { content: string; category: string; total: number; count: number; lastDate: string }[];
  grandTotal: number;
}> {
  const db = await getDb();
  if (!db) return { items: [], grandTotal: 0 };

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);

  const rows = await db.execute(sql.raw(
    `SELECT
       t.content,
       (${effectiveCatExpr}) as "effectiveCategory",
       ABS(SUM(t.amount::numeric)) as total,
       COUNT(*) as cnt,
       MAX(TO_CHAR(t."txDate", 'YYYY-MM-DD')) as "lastDate"
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND (${effectiveCatExpr}) IN ('저축', '투자')
       AND (NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))
     GROUP BY t.content, (${effectiveCatExpr})
     ORDER BY total DESC`
  ));

  const arr = rows as any[];
  const items = arr.map((r) => ({
    content: String(r.content),
    category: String(r.effectiveCategory),
    total: Number(r.total),
    count: Number(r.cnt),
    lastDate: String(r.lastDate),
  }));

  const grandTotal = items.reduce((s, i) => s + i.total, 0);
  return { items, grandTotal };
}


export async function getIncomeDistribution(userId: number): Promise<{
  income: { category: string; total: number; count: number }[];
  expenses: { category: string; total: number; count: number }[];
  savings: { category: string; total: number; count: number }[];
  investments: { category: string; total: number; count: number }[];
}> {
  const db = await getDb();
  if (!db) return { income: [], expenses: [], savings: [], investments: [] };

  const rules = await getCategoryRules(userId);
  const incomeCats = new Set(rules.filter((r) => r.ruleType === "income").map((r) => r.category));
  const savingsCats = new Set(rules.filter((r) => r.ruleType === "savings").map((r) => r.category));
  const investmentCats = new Set(rules.filter((r) => r.ruleType === "investment").map((r) => r.category));

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const notExcludedSQL = `(NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;

  const rows = await db.execute(sql.raw(
    `SELECT (${effectiveCatExpr}) as "effectiveCategory", t."txType", ABS(SUM(t.amount::numeric)) as total, COUNT(*) as cnt
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND ${notExcludedSQL}
     GROUP BY (${effectiveCatExpr}), t."txType"
     ORDER BY total DESC`
  ));

  const income: { category: string; total: number; count: number }[] = [];
  const expenses: { category: string; total: number; count: number }[] = [];
  const savings: { category: string; total: number; count: number }[] = [];
  const investments: { category: string; total: number; count: number }[] = [];

  for (const r of rows as any[]) {
    const category = String(r.effectiveCategory);
    const total = Number(r.total);
    const count = Number(r.cnt);
    const txType = String(r.txType);

    if (txType === "수입" || incomeCats.has(category)) {
      income.push({ category, total, count });
    } else if (savingsCats.has(category)) {
      savings.push({ category, total, count });
    } else if (investmentCats.has(category)) {
      investments.push({ category, total, count });
    } else if (txType === "지출") {
      expenses.push({ category, total, count });
    }
  }

  return { income, expenses, savings, investments };
}

