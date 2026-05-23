import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  InsertTransaction,
  InsertUserSettings,
  transactions,
  userSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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

  await db.insert(userSettings).values(values).onDuplicateKeyUpdate({
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

  const rows = await db
    .select({ transactionId: sql<number>`transactionId` })
    .from(sql`excluded_transactions`)
    .where(sql`userId = ${userId}`);

  return new Set(rows.map((r) => Number(r.transactionId)));
}

export async function addExcludedTransaction(userId: number, transactionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`INSERT IGNORE INTO excluded_transactions (userId, transactionId) VALUES (${userId}, ${transactionId})`
  );
}

export async function removeExcludedTransaction(userId: number, transactionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`DELETE FROM excluded_transactions WHERE userId = ${userId} AND transactionId = ${transactionId}`
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
        sql`INSERT IGNORE INTO excluded_transactions (userId, transactionId) VALUES (${userId}, ${id})`
      );
    } else {
      await db.execute(
        sql`DELETE FROM excluded_transactions WHERE userId = ${userId} AND transactionId = ${id}`
      );
    }
  }
}

// ── 필터 상수 ──────────────────────────────────────────────────

export const SAVINGS_CATS = ["저축", "투자"];
export const TRANSFER_TX_TYPES = ["이체"];
export const TRANSFER_CATS = ["내계좌이체", "이체", "카드대금"];
export const TRANSFER_PAYMENT_KEYWORDS = ["통장", "예금", "저축", "청약"];

// ── effectiveCategory 표현식 ───────────────────────────────────

/**
 * 카테고리 우선순위:
 * 1. customCategory (사용자가 직접 수정)
 * 2. category_rules 매핑 규칙 (키워드 기반 자동 분류)
 * 3. 원본 category
 */
function buildEffectiveCategoryExpr(userId: number): string {
  return `COALESCE(
    t.customCategory,
    (SELECT cr.category FROM category_rules cr
     WHERE cr.userId = ${userId}
       AND (cr.isExact = 1 AND t.content = cr.keyword
            OR cr.isExact = 0 AND t.content LIKE CONCAT('%', cr.keyword, '%'))
     ORDER BY cr.isExact DESC, cr.id ASC
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

  const catExclude = [
    ...(includeTransfer ? [] : TRANSFER_CATS),
    ...extraExcluded,
  ].filter((c) => !SAVINGS_CATS.includes(c));

  const catExcludeSQL = catExclude.length > 0
    ? `AND t.category NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const paymentExcludeSQL = !includeTransfer
    ? `AND NOT (t.paymentMethod IS NOT NULL AND (${TRANSFER_PAYMENT_KEYWORDS.filter((k) => k !== "저축").map((k) => `t.paymentMethod LIKE '%${k}%'`).join(" OR ")}) AND COALESCE(t.customCategory, t.category) NOT IN ('저축','투자'))`
    : "";

  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et.userId = ${userId} AND et.transactionId = t.id)`;

  const [incomeRows, expenseRows] = await Promise.all([
    db.execute(sql.raw(
      `SELECT DATE_FORMAT(t.txDate, '%Y-%m') as yearMonth, SUM(ABS(t.amount)) as total
       FROM transactions t
       WHERE t.userId = ${userId}
         AND t.txType = '수입'
         ${catExcludeSQL}
         ${notExcludedSQL}
       GROUP BY DATE_FORMAT(t.txDate, '%Y-%m')
       ORDER BY DATE_FORMAT(t.txDate, '%Y-%m')`
    )) as any,
    db.execute(sql.raw(
      `SELECT DATE_FORMAT(t.txDate, '%Y-%m') as yearMonth, SUM(ABS(t.amount)) as total
       FROM transactions t
       WHERE t.userId = ${userId}
         AND t.txType = '지출'
         ${!includeTransfer ? "AND t.txType != '이체'" : ""}
         ${catExcludeSQL}
         ${paymentExcludeSQL}
         ${notExcludedSQL}
       GROUP BY DATE_FORMAT(t.txDate, '%Y-%m')
       ORDER BY DATE_FORMAT(t.txDate, '%Y-%m')`
    )) as any,
  ]);

  const result: { yearMonth: string; txType: string; total: number }[] = [];
  const incomeArr = Array.isArray(incomeRows) ? incomeRows[0] : [];
  const expenseArr = Array.isArray(expenseRows) ? expenseRows[0] : [];

  for (const r of incomeArr) result.push({ yearMonth: r.yearMonth, txType: "수입", total: Number(r.total) });
  for (const r of expenseArr) result.push({ yearMonth: r.yearMonth, txType: "지출", total: Number(r.total) });

  return result;
}

/** 카테고리별 지출 집계 (저축/투자 포함) */
export async function getCategoryStats(
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
    ? `AND t.category NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const paymentExcludeSQL = !includeTransfer
    ? `AND NOT (t.paymentMethod IS NOT NULL AND (${TRANSFER_PAYMENT_KEYWORDS.filter((k) => k !== "저축").map((k) => `t.paymentMethod LIKE '%${k}%'`).join(" OR ")}) AND COALESCE(t.customCategory, t.category) NOT IN ('저축','투자'))`
    : "";

  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et.userId = ${userId} AND et.transactionId = t.id)`;

  const rows = await db.execute(sql.raw(
    `SELECT sub.effectiveCategory as category, SUM(ABS(sub.amount)) as total, COUNT(*) as cnt
     FROM (
       SELECT t.amount,
              (${effectiveCatExpr}) as effectiveCategory
       FROM transactions t
       WHERE t.userId = ${userId}
         AND (
           (t.txType = '지출'
            ${!includeTransfer ? "AND t.txType != '이체'" : ""}
            ${catExcludeSQL}
            ${paymentExcludeSQL}
            ${notExcludedSQL}
           )
           OR
           (COALESCE(t.customCategory, t.category) IN ('저축', '투자')
            ${notExcludedSQL}
           )
         )
     ) sub
     GROUP BY sub.effectiveCategory
     ORDER BY SUM(ABS(sub.amount)) DESC`
  )) as any;

  const arr = Array.isArray(rows) ? rows[0] : [];
  return arr.map((r: any) => ({ category: r.category, total: Number(r.total), count: Number(r.cnt) }));
}

/** 월별 × 카테고리 피벗 (저축/투자 포함) */
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
    ? `AND t.category NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const paymentExcludeSQL = !includeTransfer
    ? `AND NOT (t.paymentMethod IS NOT NULL AND (${TRANSFER_PAYMENT_KEYWORDS.filter((k) => k !== "저축").map((k) => `t.paymentMethod LIKE '%${k}%'`).join(" OR ")}) AND COALESCE(t.customCategory, t.category) NOT IN ('저축','투자'))`
    : "";

  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et.userId = ${userId} AND et.transactionId = t.id)`;

  const rows = await db.execute(sql.raw(
    `SELECT sub.yearMonth, sub.effectiveCategory as category, SUM(ABS(sub.amount)) as total
     FROM (
       SELECT DATE_FORMAT(t.txDate, '%Y-%m') as yearMonth,
              t.amount,
              (${effectiveCatExpr}) as effectiveCategory
       FROM transactions t
       WHERE t.userId = ${userId}
         AND (
           (t.txType = '지출'
            ${!includeTransfer ? "AND t.txType != '이체'" : ""}
            ${catExcludeSQL}
            ${paymentExcludeSQL}
            ${notExcludedSQL}
           )
           OR
           (COALESCE(t.customCategory, t.category) IN ('저축', '투자')
            ${notExcludedSQL}
           )
         )
     ) sub
     GROUP BY sub.yearMonth, sub.effectiveCategory
     ORDER BY sub.yearMonth`
  )) as any;

  const arr = Array.isArray(rows) ? rows[0] : [];
  return arr.map((r: any) => ({ yearMonth: r.yearMonth, category: r.category, total: Number(r.total) }));
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

  const catExcludeSQL = catExclude.length > 0
    ? `AND t.category NOT IN (${catExclude.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`
    : "";

  const paymentExcludeSQL = !includeTransfer
    ? `AND NOT (t.paymentMethod IS NOT NULL AND (${TRANSFER_PAYMENT_KEYWORDS.filter((k) => k !== "저축").map((k) => `t.paymentMethod LIKE '%${k}%'`).join(" OR ")}) AND COALESCE(t.customCategory, t.category) NOT IN ('저축','투자'))`
    : "";

  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et.userId = ${userId} AND et.transactionId = t.id)`;

  const [incomeRows, expenseRows, monthRows] = await Promise.all([
    db.execute(sql.raw(
      `SELECT SUM(ABS(t.amount)) as total FROM transactions t
       WHERE t.userId = ${userId} AND t.txType = '수입' ${catExcludeSQL} ${notExcludedSQL}`
    )) as any,
    db.execute(sql.raw(
      `SELECT SUM(ABS(t.amount)) as total FROM transactions t
       WHERE t.userId = ${userId}
         AND (
           (t.txType = '지출' ${!includeTransfer ? "AND t.txType != '이체'" : ""} ${catExcludeSQL} ${paymentExcludeSQL} ${notExcludedSQL})
           OR
           (COALESCE(t.customCategory, t.category) IN ('저축','투자') ${notExcludedSQL})
         )`
    )) as any,
    db.execute(sql.raw(
      `SELECT COUNT(DISTINCT DATE_FORMAT(t.txDate, '%Y-%m')) as cnt FROM transactions t WHERE t.userId = ${userId}`
    )) as any,
  ]);

  const incomeArr = Array.isArray(incomeRows) ? incomeRows[0] : [];
  const expenseArr = Array.isArray(expenseRows) ? expenseRows[0] : [];
  const monthArr = Array.isArray(monthRows) ? monthRows[0] : [];

  return {
    totalIncome: Number(incomeArr[0]?.total ?? 0),
    totalExpense: Number(expenseArr[0]?.total ?? 0),
    monthCount: Number(monthArr[0]?.cnt ?? 0),
  };
}

/** 전체 거래 내역 조회 */
export async function getAllTransactions(userId: number, page = 1, pageSize = 50) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0, excludedIds: new Set<number>() };

  const offset = (page - 1) * pageSize;
  const [rows, countRows, excludedIds] = await Promise.all([
    db.select().from(transactions).where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.txDate), desc(transactions.txTime))
      .limit(pageSize).offset(offset),
    db.select({ total: sql<number>`COUNT(*)` }).from(transactions).where(eq(transactions.userId, userId)),
    getExcludedTransactionIds(userId),
  ]);

  return { rows, total: Number(countRows[0]?.total ?? 0), excludedIds };
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
  pageSize = 50
) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const offset = (page - 1) * pageSize;
  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const escapedCategory = category.replace(/'/g, "''");

  // 저축/투자 카테고리는 제외 필터 무시 (사용자가 직접 exclude한 항목만 제외)
  // — 업로드 시 이체로 자동 제외된 저축 항목도 보이도록
  const isSavingsCat = SAVINGS_CATS.includes(category);
  const excludeFilter = isSavingsCat
    ? "" // 저축/투자는 excluded_transactions 무시 (별도로 체크박스로 제어 가능)
    : `AND NOT EXISTS (
         SELECT 1 FROM excluded_transactions et
         WHERE et.userId = ${userId} AND et.transactionId = t.id
       )`;

  const [rows, countRows] = await Promise.all([
    db.execute(sql.raw(
      `SELECT sub.*
       FROM (
         SELECT t.*, (${effectiveCatExpr}) as effectiveCategory
         FROM transactions t
         WHERE t.userId = ${userId}
           ${excludeFilter}
       ) sub
       WHERE sub.effectiveCategory = '${escapedCategory}'
         AND (sub.txType = '지출' OR sub.effectiveCategory IN ('저축', '투자'))
       ORDER BY sub.txDate DESC, sub.txTime DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )) as any,
    db.execute(sql.raw(
      `SELECT COUNT(*) as total
       FROM (
         SELECT t.id, t.txType, (${effectiveCatExpr}) as effectiveCategory
         FROM transactions t
         WHERE t.userId = ${userId}
           ${excludeFilter}
       ) sub
       WHERE sub.effectiveCategory = '${escapedCategory}'
         AND (sub.txType = '지출' OR sub.effectiveCategory IN ('저축', '투자'))`
    )) as any,
  ]);

  const rowArr = Array.isArray(rows) ? rows[0] : [];
  const countArr = Array.isArray(countRows) ? countRows[0] : [];

  return { rows: rowArr, total: Number(countArr[0]?.total ?? 0) };
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

/** 카테고리 수정 (customCategory) */
export async function updateTransactionCategory(
  userId: number,
  transactionId: number,
  newCategory: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`UPDATE transactions SET customCategory = ${newCategory} WHERE id = ${transactionId} AND userId = ${userId}`
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
    sql`UPDATE transactions SET customCategory = NULL WHERE id = ${transactionId} AND userId = ${userId}`
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

  // 저축/투자는 excluded_transactions 필터 적용하지 않음 (상세와 일관성)
  const rows = await db.execute(sql.raw(
    `SELECT
       t.content,
       (${effectiveCatExpr}) as effectiveCategory,
       SUM(ABS(t.amount)) as total,
       COUNT(*) as cnt,
       MAX(DATE_FORMAT(t.txDate, '%Y-%m-%d')) as lastDate
     FROM transactions t
     WHERE t.userId = ${userId}
       AND (${effectiveCatExpr}) IN ('저축', '투자')
     GROUP BY t.content, (${effectiveCatExpr})
     ORDER BY total DESC`
  )) as any;

  const arr = Array.isArray(rows) ? rows[0] : [];
  const items = arr.map((r: any) => ({
    content: String(r.content),
    category: String(r.effectiveCategory),
    total: Number(r.total),
    count: Number(r.cnt),
    lastDate: String(r.lastDate),
  }));

  const grandTotal = items.reduce((s: number, i: any) => s + i.total, 0);
  return { items, grandTotal };
}

// ── 카테고리 매핑 규칙 ─────────────────────────────────────────

export async function getCategoryRules(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(sql.raw(
    `SELECT id, keyword, category, isExact, createdAt FROM category_rules WHERE userId = ${userId} ORDER BY createdAt DESC`
  )) as any;

  const arr = Array.isArray(rows) ? rows[0] : [];
  return arr.map((r: any) => ({
    id: Number(r.id),
    keyword: String(r.keyword),
    category: String(r.category),
    isExact: r.isExact === 1,
    createdAt: r.createdAt,
  }));
}

export async function upsertCategoryRule(
  userId: number,
  keyword: string,
  category: string,
  isExact = false
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const kw = keyword.replace(/'/g, "''");
  const cat = category.replace(/'/g, "''");

  await db.execute(sql.raw(
    `INSERT INTO category_rules (userId, keyword, category, isExact)
     VALUES (${userId}, '${kw}', '${cat}', ${isExact ? 1 : 0})
     ON DUPLICATE KEY UPDATE category = '${cat}', isExact = ${isExact ? 1 : 0}, updatedAt = NOW()`
  ));

  // 기존 거래 내역에 즉시 적용 (customCategory가 없는 항목만)
  if (isExact) {
    await db.execute(sql.raw(
      `UPDATE transactions SET customCategory = '${cat}'
       WHERE userId = ${userId} AND content = '${kw}' AND customCategory IS NULL`
    ));
  } else {
    await db.execute(sql.raw(
      `UPDATE transactions SET customCategory = '${cat}'
       WHERE userId = ${userId} AND content LIKE '%${kw}%' AND customCategory IS NULL`
    ));
  }
}

export async function deleteCategoryRule(userId: number, ruleId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql.raw(
    `DELETE FROM category_rules WHERE id = ${ruleId} AND userId = ${userId}`
  ));
}

export async function applyMappingRulesToNewTransactions(
  userId: number,
  dedupHashes: string[]
): Promise<void> {
  const db = await getDb();
  if (!db || dedupHashes.length === 0) return;

  const hashList = dedupHashes.map((h) => `'${h}'`).join(", ");
  const newTxRows = await db.execute(sql.raw(
    `SELECT id, content FROM transactions WHERE userId = ${userId} AND dedupHash IN (${hashList})`
  )) as any;

  const newTxArr = Array.isArray(newTxRows) ? newTxRows[0] : [];
  if (newTxArr.length === 0) return;

  const rules = await getCategoryRules(userId);
  if (rules.length === 0) return;

  for (const tx of newTxArr) {
    const content = String(tx.content);
    for (const rule of rules) {
      const matches = rule.isExact ? content === rule.keyword : content.includes(rule.keyword);
      if (matches) {
        await db.execute(sql.raw(
          `UPDATE transactions SET customCategory = '${rule.category.replace(/'/g, "''")}'
           WHERE id = ${tx.id} AND customCategory IS NULL`
        ));
        break;
      }
    }
  }
}
