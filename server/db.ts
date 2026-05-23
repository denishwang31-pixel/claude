import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  InsertTransaction,
  InsertUserSettings,
  transactions,
  userSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

const DB_URL = process.env.DATABASE_URL ?? "postgres://budget:budget123@localhost:5432/household_budget";

let _db: ReturnType<typeof drizzle> | null = null;

async function runAutoMigrations(db: ReturnType<typeof drizzle>) {
  const steps = [
    `ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS "ruleType" varchar(20) NOT NULL DEFAULT 'expense'`,
    `ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS "isActive" integer NOT NULL DEFAULT 1`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "category_rules_userId_keyword_idx" ON category_rules ("userId", keyword)`,
  ];
  for (const step of steps) {
    try { await db.execute(sql.raw(step)); } catch {}
  }
}

export async function getDb() {
  if (!_db) {
    try {
      const client = postgres(DB_URL);
      _db = drizzle(client);
      await runAutoMigrations(_db);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ── 사용자 ─────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: updateSet as Partial<typeof users.$inferInsert>,
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── 사용자 설정 ────────────────────────────────────────────────

export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return { excludedCategories: [] as string[], includeTransfer: false };

  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (rows.length === 0) return { excludedCategories: [] as string[], includeTransfer: false };

  let excludedCategories: string[] = [];
  try {
    excludedCategories = JSON.parse(rows[0].excludedCategories ?? "[]");
  } catch {}

  return { excludedCategories, includeTransfer: rows[0].includeTransfer === 1 };
}

export async function saveUserSettings(
  userId: number,
  excludedCategories: string[],
  includeTransfer: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const values: InsertUserSettings = {
    userId,
    excludedCategories: JSON.stringify(excludedCategories),
    includeTransfer: includeTransfer ? 1 : 0,
  };

  await db.insert(userSettings).values(values).onConflictDoUpdate({
    target: userSettings.userId,
    set: {
      excludedCategories: JSON.stringify(excludedCategories),
      includeTransfer: includeTransfer ? 1 : 0,
    },
  });
}

// ── 항목별 제외 관리 ───────────────────────────────────────────

export async function getExcludedTransactionIds(userId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();

  const rows = await db.execute(
    sql`SELECT "transactionId" FROM excluded_transactions WHERE "userId" = ${userId}`
  );
  return new Set((rows as any[]).map((r) => Number(r.transactionId)));
}

export async function addExcludedTransaction(userId: number, transactionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`INSERT INTO excluded_transactions ("userId", "transactionId") VALUES (${userId}, ${transactionId}) ON CONFLICT DO NOTHING`
  );
}

export async function removeExcludedTransaction(userId: number, transactionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`DELETE FROM excluded_transactions WHERE "userId" = ${userId} AND "transactionId" = ${transactionId}`
  );
}

export async function setExcludedTransactions(
  userId: number,
  transactionIds: number[],
  excluded: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  for (const id of transactionIds) {
    if (excluded) {
      await db.execute(
        sql`INSERT INTO excluded_transactions ("userId", "transactionId") VALUES (${userId}, ${id}) ON CONFLICT DO NOTHING`
      );
    } else {
      await db.execute(
        sql`DELETE FROM excluded_transactions WHERE "userId" = ${userId} AND "transactionId" = ${id}`
      );
    }
  }
}

// ── 필터 상수 ──────────────────────────────────────────────────

export const SAVINGS_CATS = ["저축", "투자", "청약", "적금", "예금", "CMA", "ETF", "주식", "펀드", "ISA", "IRP"];
export const TRANSFER_TX_TYPES = ["이체"];
export const TRANSFER_CATS = ["내계좌이체", "이체", "카드대금"];
export const TRANSFER_PAYMENT_KEYWORDS = ["통장", "예금", "저축", "청약"];

// ── effectiveCategory 표현식 ───────────────────────────────────

function buildEffectiveCategoryExpr(userId: number): string {
  return `COALESCE(
    t."customCategory",
    (SELECT cr.category FROM category_rules cr
     WHERE cr."userId" = ${userId}
       AND cr."isActive" = 1
       AND (cr."isExact" = 1 AND t.content = cr.keyword
            OR cr."isExact" = 0 AND t.content LIKE '%' || cr.keyword || '%')
     ORDER BY cr."isExact" DESC, cr.id ASC
     LIMIT 1),
    t.category
  )`;
}

// ── 집계 함수 ──────────────────────────────────────────────────

export async function getExistingHashes(userId: number, hashes: string[]): Promise<Set<string>> {
  const db = await getDb();
  if (!db || hashes.length === 0) return new Set();
  const rows = await db
    .select({ dedupHash: transactions.dedupHash })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.dedupHash} IN (${sql.join(hashes.map((h) => sql`${h}`), sql`, `)})`
      )
    );
  return new Set(rows.map((r) => r.dedupHash));
}

export async function insertTransactions(rows: InsertTransaction[]): Promise<number> {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;
  await db.insert(transactions).values(rows);
  return rows.length;
}

/** 월별 수입/지출 집계 */
export async function getMonthlyStats(
  userId: number,
  includeTransfer: boolean,
  extraExcluded: string[],
  _excludedIds: number[]
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

  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)`;

  const [incomeRows, expenseRows] = await Promise.all([
    db.execute(sql.raw(
      `SELECT TO_CHAR(t."txDate", 'YYYY-MM') as "yearMonth", SUM(ABS(t.amount::numeric)) as total
       FROM transactions t
       WHERE t."userId" = ${userId}
         AND t."txType" = '수입'
         ${catExcludeSQL}
         ${notExcludedSQL}
       GROUP BY TO_CHAR(t."txDate", 'YYYY-MM')
       ORDER BY TO_CHAR(t."txDate", 'YYYY-MM')`
    )),
    db.execute(sql.raw(
      `SELECT TO_CHAR(t."txDate", 'YYYY-MM') as "yearMonth", SUM(ABS(t.amount::numeric)) as total
       FROM transactions t
       WHERE t."userId" = ${userId}
         AND t."txType" = '지출'
         ${catExcludeSQL}
         ${notExcludedSQL}
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
  yearMonth?: string
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
  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)`;
  const monthSQL = yearMonth ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "";

  const rows = await db.execute(sql.raw(
    `SELECT sub."effectiveCategory" as category, SUM(ABS(sub.amount::numeric)) as total, COUNT(*) as cnt
     FROM (
       SELECT t.amount,
              (${effectiveCatExpr}) as "effectiveCategory"
       FROM transactions t
       WHERE t."userId" = ${userId}
         ${monthSQL}
         AND (
           (t."txType" = '지출'
            ${catExcludeSQL}
            ${notExcludedSQL}
           )
           OR
           ((${effectiveCatExpr}) IN (${savingsCatsSQL})
            ${notExcludedSQL}
           )
         )
     ) sub
     GROUP BY sub."effectiveCategory"
     ORDER BY SUM(ABS(sub.amount::numeric)) DESC`
  ));

  return (rows as any[]).map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.cnt) }));
}

/** 월별 × 카테고리 피벗 */
export async function getPivotData(
  userId: number,
  includeTransfer: boolean,
  extraExcluded: string[],
  _excludedIds: number[]
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
  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)`;

  const rows = await db.execute(sql.raw(
    `SELECT sub."yearMonth", sub."effectiveCategory" as category, SUM(ABS(sub.amount::numeric)) as total, COUNT(*) as cnt
     FROM (
       SELECT TO_CHAR(t."txDate", 'YYYY-MM') as "yearMonth",
              t.amount,
              (${effectiveCatExpr}) as "effectiveCategory"
       FROM transactions t
       WHERE t."userId" = ${userId}
         AND (
           (t."txType" = '지출'
            ${catExcludeSQL}
            ${notExcludedSQL}
           )
           OR
           ((${effectiveCatExpr}) IN (${savingsCatsSQL})
            ${notExcludedSQL}
           )
         )
     ) sub
     GROUP BY sub."yearMonth", sub."effectiveCategory"
     ORDER BY sub."yearMonth"`
  ));

  return (rows as any[]).map((r) => ({ yearMonth: r.yearMonth, category: r.category, total: Number(r.total), count: Number(r.cnt) }));
}

/** KPI 요약 */
export async function getKpiSummary(
  userId: number,
  includeTransfer: boolean,
  extraExcluded: string[],
  _excludedIds: number[]
) {
  const db = await getDb();
  if (!db) return { totalIncome: 0, totalExpense: 0, monthCount: 0 };

  const catExclude = [
    ...(includeTransfer ? [] : TRANSFER_CATS),
    ...extraExcluded,
  ].filter((c) => !SAVINGS_CATS.includes(c));

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const catExcludeSQL = catExclude.length > 0
    ? `AND (${effectiveCatExpr}) NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)`;

  const [incomeRows, expenseRows, monthRows] = await Promise.all([
    db.execute(sql.raw(
      `SELECT SUM(ABS(t.amount::numeric)) as total FROM transactions t
       WHERE t."userId" = ${userId} AND t."txType" = '수입' ${catExcludeSQL} ${notExcludedSQL}`
    )),
    db.execute(sql.raw(
      `SELECT SUM(ABS(t.amount::numeric)) as total FROM transactions t
       WHERE t."userId" = ${userId}
         AND (
           (t."txType" = '지출' ${catExcludeSQL} ${notExcludedSQL})
           OR
           ((${effectiveCatExpr}) IN (${savingsCatsSQL}) ${notExcludedSQL})
         )`
    )),
    db.execute(sql.raw(
      `SELECT COUNT(DISTINCT TO_CHAR(t."txDate", 'YYYY-MM')) as cnt FROM transactions t WHERE t."userId" = ${userId}`
    )),
  ]);

  return {
    totalIncome: Number((incomeRows as any[])[0]?.total ?? 0),
    totalExpense: Number((expenseRows as any[])[0]?.total ?? 0),
    monthCount: Number((monthRows as any[])[0]?.cnt ?? 0),
  };
}

/** 전체 거래 내역 */
function buildTxSearchSQL(userId: number, field: string, query: string): string {
  const esc = (s: string) => s.replace(/'/g, "''");
  const escLike = (s: string) => esc(s).replace(/%/g, "\\%").replace(/_/g, "\\_");
  switch (field) {
    case "content":      return `t.content ILIKE '%${escLike(query)}%'`;
    case "category": {
      const expr = buildEffectiveCategoryExpr(userId);
      return `(${expr}) ILIKE '%${escLike(query)}%'`;
    }
    case "amount_gte": {
      const n = parseFloat(query.replace(/[^0-9.]/g, ""));
      return isNaN(n) ? "TRUE" : `ABS(t.amount::numeric) >= ${n}`;
    }
    case "paymentMethod": return `t."paymentMethod" ILIKE '%${escLike(query)}%'`;
    case "txType":        return `t."txType" = '${esc(query)}'`;
    case "date":          return `TO_CHAR(t."txDate", 'YYYY-MM') = '${esc(query)}'`;
    default:              return "TRUE";
  }
}

export async function getAllTransactions(
  userId: number,
  page = 1,
  pageSize = 50,
  filter?: { field: string; query: string }
) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0, excludedIds: new Set<number>() };

  const offset = (page - 1) * pageSize;

  if (!filter?.query?.trim()) {
    const [rows, countRows, excludedIds] = await Promise.all([
      db.select().from(transactions).where(eq(transactions.userId, userId))
        .orderBy(desc(transactions.txDate), desc(transactions.txTime))
        .limit(pageSize).offset(offset),
      db.select({ total: sql<number>`COUNT(*)` }).from(transactions).where(eq(transactions.userId, userId)),
      getExcludedTransactionIds(userId),
    ]);
    return { rows, total: Number(countRows[0]?.total ?? 0), excludedIds };
  }

  const filterSQL = buildTxSearchSQL(userId, filter.field, filter.query.trim());
  const [rows, countRows, excludedIds] = await Promise.all([
    db.execute(sql.raw(
      `SELECT id, "txDate"::text as "txDate", "txTime", "txType", category, "customCategory",
              content, amount::text as amount, currency, "paymentMethod", memo
       FROM transactions t
       WHERE t."userId" = ${userId} AND ${filterSQL}
       ORDER BY t."txDate" DESC, t."txTime" DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )),
    db.execute(sql.raw(
      `SELECT COUNT(*) as total FROM transactions t
       WHERE t."userId" = ${userId} AND ${filterSQL}`
    )),
    getExcludedTransactionIds(userId),
  ]);

  const normalizedRows = (rows as any[]).map((r) => ({
    ...r,
    id: Number(r.id),
    txDate: String(r.txDate),
    amount: String(r.amount),
    customCategory: r.customCategory ?? null,
    paymentMethod: r.paymentMethod ?? null,
    memo: r.memo ?? null,
  }));

  return { rows: normalizedRows, total: Number((countRows as any[])[0]?.total ?? 0), excludedIds };
}

/** 전체 거래 내역 (다운로드용) */
export async function getAllTransactionsForExport(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions).where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.txDate), desc(transactions.txTime));
}

/** 특정 카테고리 거래 내역 (드릴다운) */
export async function getCategoryTransactions(
  userId: number,
  category: string,
  page = 1,
  pageSize = 50,
  yearMonth?: string
) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const offset = (page - 1) * pageSize;
  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const escapedCategory = category.replace(/'/g, "''");

  const isSavingsCat = SAVINGS_CATS.includes(category);
  const excludeFilter = isSavingsCat
    ? ""
    : `AND NOT EXISTS (
         SELECT 1 FROM excluded_transactions et
         WHERE et."userId" = ${userId} AND et."transactionId" = t.id
       )`;
  const monthFilter = yearMonth ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "";

  const [rows, countRows] = await Promise.all([
    db.execute(sql.raw(
      `SELECT sub.*
       FROM (
         SELECT t.*, (${effectiveCatExpr}) as "effectiveCategory"
         FROM transactions t
         WHERE t."userId" = ${userId}
           ${excludeFilter}
           ${monthFilter}
       ) sub
       WHERE sub."effectiveCategory" = '${escapedCategory}'
         AND (sub."txType" = '지출' OR sub."effectiveCategory" IN ('저축', '투자'))
       ORDER BY sub."txDate" DESC, sub."txTime" DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )),
    db.execute(sql.raw(
      `SELECT COUNT(*) as total
       FROM (
         SELECT t.id, t."txType", (${effectiveCatExpr}) as "effectiveCategory"
         FROM transactions t
         WHERE t."userId" = ${userId}
           ${excludeFilter}
           ${monthFilter}
       ) sub
       WHERE sub."effectiveCategory" = '${escapedCategory}'
         AND (sub."txType" = '지출' OR sub."effectiveCategory" IN ('저축', '투자'))`
    )),
  ]);

  return { rows: rows as any[], total: Number((countRows as any[])[0]?.total ?? 0) };
}

/** 모든 카테고리 목록 */
export async function getAllCategories(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ category: transactions.category })
    .from(transactions).where(eq(transactions.userId, userId))
    .orderBy(transactions.category);
  return rows.map((r) => r.category);
}

/** 전체 거래 내역 삭제 */
export async function deleteAllTransactions(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  await db.execute(sql`DELETE FROM excluded_transactions WHERE "userId" = ${userId}`);
  const result = await db.execute(sql`DELETE FROM transactions WHERE "userId" = ${userId} RETURNING id`);
  return (result as any[]).length;
}

/** 카테고리 수정 */
export async function updateTransactionCategory(
  userId: number,
  transactionId: number,
  newCategory: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`UPDATE transactions SET "customCategory" = ${newCategory} WHERE id = ${transactionId} AND "userId" = ${userId}`
  );
}

/** 카테고리 수정 초기화 */
export async function resetTransactionCategory(
  userId: number,
  transactionId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`UPDATE transactions SET "customCategory" = NULL WHERE id = ${transactionId} AND "userId" = ${userId}`
  );
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
       SUM(ABS(t.amount::numeric)) as total,
       COUNT(*) as cnt,
       MAX(TO_CHAR(t."txDate", 'YYYY-MM-DD')) as "lastDate"
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND (${effectiveCatExpr}) IN ('저축', '투자')
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
    // Income rules
    { keyword: "급여", category: "급여", isExact: false, ruleType: "income" },
    { keyword: "월급", category: "급여", isExact: false, ruleType: "income" },
    { keyword: "상여", category: "상여금", isExact: false, ruleType: "income" },
    { keyword: "보너스", category: "상여금", isExact: false, ruleType: "income" },
    { keyword: "이자", category: "이자수입", isExact: false, ruleType: "income" },
    // Savings rules
    { keyword: "청약", category: "청약", isExact: false, ruleType: "savings" },
    { keyword: "적금", category: "적금", isExact: false, ruleType: "savings" },
    { keyword: "저축은행", category: "저축", isExact: false, ruleType: "savings" },
    // Investment rules
    { keyword: "ETF", category: "ETF", isExact: false, ruleType: "investment" },
    { keyword: "주식", category: "주식", isExact: false, ruleType: "investment" },
    { keyword: "펀드", category: "펀드", isExact: false, ruleType: "investment" },
    { keyword: "CMA", category: "CMA", isExact: false, ruleType: "investment" },
    { keyword: "ISA", category: "ISA", isExact: false, ruleType: "investment" },
    { keyword: "IRP", category: "IRP", isExact: false, ruleType: "investment" },
    // Expense rules
    { keyword: "스타벅스", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "이디야", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "커피빈", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "투썸플레이스", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "메가커피", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "빽다방", category: "카페", isExact: false, ruleType: "expense" },
    { keyword: "맥도날드", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "버거킹", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "롯데리아", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "KFC", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "배달의민족", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "쿠팡이츠", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "요기요", category: "식비", isExact: false, ruleType: "expense" },
    { keyword: "카카오택시", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "주유", category: "교통", isExact: false, ruleType: "expense" },
    { keyword: "쿠팡", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "이마트", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "홈플러스", category: "쇼핑", isExact: false, ruleType: "expense" },
    { keyword: "CGV", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "메가박스", category: "문화", isExact: false, ruleType: "expense" },
    { keyword: "넷플릭스", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "유튜브프리미엄", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "멜론", category: "구독", isExact: false, ruleType: "expense" },
    { keyword: "SKT", category: "통신", isExact: false, ruleType: "expense" },
    { keyword: "LG유플러스", category: "통신", isExact: false, ruleType: "expense" },
  ];

  let inserted = 0;
  for (const rule of defaultRules) {
    try {
      await db.execute(
        sql`INSERT INTO category_rules ("userId", keyword, category, "isExact", "ruleType")
            VALUES (${userId}, ${rule.keyword}, ${rule.category}, ${rule.isExact ? 1 : 0}, ${rule.ruleType})
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

  const rows = await db.execute(sql.raw(
    `SELECT t.content, COALESCE(t."customCategory", t.category) as category, t."txType", COUNT(*) as cnt
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND t.content IS NOT NULL AND t.content != '' AND t.content != '-'
     GROUP BY t.content, COALESCE(t."customCategory", t.category), t."txType"
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
  const notExcludedSQL = `NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)`;

  const rows = await db.execute(sql.raw(
    `SELECT (${effectiveCatExpr}) as "effectiveCategory", t."txType", SUM(ABS(t.amount::numeric)) as total, COUNT(*) as cnt
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

export async function applyMappingRulesToNewTransactions(
  userId: number,
  dedupHashes: string[]
): Promise<void> {
  const db = await getDb();
  if (!db || dedupHashes.length === 0) return;

  const newTxRows = await db.execute(
    sql`SELECT id, content FROM transactions WHERE "userId" = ${userId} AND "dedupHash" IN (${sql.join(dedupHashes.map((h) => sql`${h}`), sql`, `)})`
  );

  const newTxArr = newTxRows as any[];
  if (newTxArr.length === 0) return;

  const rules = await getCategoryRules(userId);
  if (rules.length === 0) return;

  for (const tx of newTxArr) {
    const content = String(tx.content);
    for (const rule of rules) {
      const matches = rule.isExact ? content === rule.keyword : content.includes(rule.keyword);
      if (matches) {
        await db.execute(
          sql`UPDATE transactions SET "customCategory" = ${rule.category}
              WHERE id = ${tx.id} AND "customCategory" IS NULL`
        );
        break;
      }
    }
  }
}
