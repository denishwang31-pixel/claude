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
  const APP_L3_VALUES_SQL = APP_L3_CATEGORIES.map((c) => `'${c.replace(/'/g, "''")}'`).join(",");
  const steps = [
    `ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS "ruleType" varchar(20) NOT NULL DEFAULT 'expense'`,
    `ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS "isActive" integer NOT NULL DEFAULT 1`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "category_rules_userId_keyword_idx" ON category_rules ("userId", keyword)`,
    // Legacy schema drift: isExact was once boolean, the app code compares it
    // with integers (= 1 / = 0) and inserts integers. Normalize to integer so
    // every read/write path works. Idempotent — only runs while still boolean.
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'category_rules'
           AND column_name = 'isExact'
           AND data_type = 'boolean'
       ) THEN
         ALTER TABLE category_rules ALTER COLUMN "isExact" DROP DEFAULT;
         ALTER TABLE category_rules ALTER COLUMN "isExact" TYPE integer USING ("isExact"::integer);
         ALTER TABLE category_rules ALTER COLUMN "isExact" SET DEFAULT 0;
       END IF;
     END $$`,
    // 데이터 정리: customCategory / 규칙에 박힌 뱅크샐러드 대분류 원본(앱 L3가 아닌 값)을 제거.
    // 이런 값은 과거 "거래내역에서 자동 생성"이 content→대분류원본을 저장하면서 생긴 것으로,
    // bankSaladMapSQL 매핑을 덮어써 '기타'로 떨어지게 만든다. 제거하면 매핑이 정상 동작한다.
    `UPDATE transactions SET "customCategory" = NULL
       WHERE "customCategory" IS NOT NULL
         AND "customCategory" NOT IN (${APP_L3_VALUES_SQL})`,
    `DELETE FROM category_rules
       WHERE category NOT IN (${APP_L3_VALUES_SQL})`,
    `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS "dashboardMemos" text DEFAULT '{}'`,
    // 규칙 매칭 결과를 굳혀두는 컬럼 (읽기 시점 상관 서브쿼리 제거용)
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "ruleCategory" varchar(64)`,
  ];
  for (const step of steps) {
    try {
      await db.execute(sql.raw(step));
    } catch (e) {
      console.warn("[Database] migration step failed:", e instanceof Error ? e.message : e);
    }
  }

  // ruleCategory 컬럼이 방금 추가됐고 아직 채워지지 않았다면, 예전에 읽기
  // 시점 규칙 서브쿼리에만 의존하던 사용자의 화면이 그대로 유지되도록
  // 최초 1회 전체 bake를 수행한다. (이미 값이 있으면 건너뜀 — 저렴한 판정)
  try {
    const needBake = (await db.execute(sql.raw(
      `SELECT DISTINCT t."userId" AS uid
         FROM transactions t
        WHERE t."ruleCategory" IS NULL
        LIMIT 50`
    ))) as any[];
    for (const row of needBake) {
      await bakeRuleCategories(Number(row.uid));
    }
  } catch (e) {
    console.warn("[Database] initial ruleCategory bake skipped:", e instanceof Error ? e.message : e);
  }
}

export async function getDb() {
  if (!_db) {
    try {
      // connect_timeout/idle_timeout이 없으면 DB가 꺼져있거나 방화벽에
      // 막힌 경우 OS 수준 TCP 재시도로 수십 초~수 분간 무한정 멈출 수
      // 있다 — 최대 8초 안에 확실히 실패하도록 명시.
      const client = postgres(DB_URL, { connect_timeout: 8, idle_timeout: 20 });
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
  if (!db) return { excludedCategories: [] as string[], includeTransfer: false, dashboardMemos: {} as Record<string, string> };

  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (rows.length === 0) return { excludedCategories: [] as string[], includeTransfer: false, dashboardMemos: {} as Record<string, string> };

  let excludedCategories: string[] = [];
  try {
    excludedCategories = JSON.parse(rows[0].excludedCategories ?? "[]");
  } catch {}

  let dashboardMemos: Record<string, string> = {};
  try {
    dashboardMemos = JSON.parse((rows[0] as any).dashboardMemos ?? "{}");
  } catch {}

  return { excludedCategories, includeTransfer: rows[0].includeTransfer === 1, dashboardMemos };
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

/** 대시보드 KPI별 메모 저장 (key: income/savings/expense/netAsset) */
export async function saveDashboardMemos(userId: number, memos: Record<string, string>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const json = JSON.stringify(memos);
  await db.insert(userSettings).values({ userId, dashboardMemos: json } as InsertUserSettings).onConflictDoUpdate({
    target: userSettings.userId,
    set: { dashboardMemos: json },
  });
}

/** 거래 메모 수정 */
export async function updateTransactionMemo(userId: number, transactionId: number, memo: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`UPDATE transactions SET memo = ${memo} WHERE id = ${transactionId} AND "userId" = ${userId}`
  );
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

/** 사용자의 모든 거래 제외 설정 초기화 */
export async function clearAllExclusions(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const res = await db.execute(
    sql`DELETE FROM excluded_transactions WHERE "userId" = ${userId}`
  );
  return Number((res as any)?.count ?? 0);
}

// ── 필터 상수 ──────────────────────────────────────────────────

export const SAVINGS_CATS = ["저축", "투자", "청약", "적금", "예금", "CMA", "ETF", "주식", "펀드", "ISA", "IRP"];
const SAVINGS_ONLY_CATS = ["저축", "청약", "적금", "예금", "CMA"];
const INVEST_ONLY_CATS = ["투자", "ETF", "주식", "펀드", "ISA", "IRP"];

/** 앱이 최종 사용하는 유효 L3 카테고리 — 이 목록에 없는 값(뱅크샐러드 대분류 원본 등)은
 *  customCategory/규칙에 들어가면 안 된다(자동 정리 대상). */
export const APP_L3_CATEGORIES = [
  // 지출
  "식비", "외식", "배달음식", "카페", "쇼핑", "생활용품", "주거",
  "교통", "통신", "구독", "문화", "교육", "여행", "미용", "의료", "건강",
  "금융", "세금", "기타",
  // 저축/투자
  "저축", "투자", "청약", "적금", "예금", "CMA", "ETF", "주식", "펀드", "ISA", "IRP",
  // 수입 / 이체
  "수입", "이체",
];

/** 카테고리명으로 규칙 타입(income/savings/investment/expense) 추론 */
export function categoryToRuleType(category: string): string {
  if (category === "수입") return "income";
  if (SAVINGS_ONLY_CATS.includes(category)) return "savings";
  if (INVEST_ONLY_CATS.includes(category)) return "investment";
  return "expense";
}

export const TRANSFER_TX_TYPES = ["이체"];
export const TRANSFER_CATS = ["내계좌이체", "이체", "카드대금"];
export const TRANSFER_PAYMENT_KEYWORDS = ["통장", "예금", "저축", "청약"];

// ── effectiveCategory 표현식 ───────────────────────────────────

/** 뱅크샐러드 대분류/소분류 → 앱 카테고리 매핑 (SQL CASE).
 *  mapBanksaladCategory()의 SQL 버전. 이체성 대분류는 '이체'로 → 통계에서 자동 제외. */
function bankSaladMapSQL(): string {
  const sub = `COALESCE(t."subCategory",'')`;
  return `CASE
    WHEN t.category IN ('내계좌이체','이체','카드대금','현금','미분류') THEN '이체'
    WHEN t.category = '생활' AND ${sub} IN ('마트','편의점') THEN '식비'
    WHEN t.category = '생활' THEN '생활용품'
    WHEN t.category = '온라인쇼핑' AND ${sub} IN ('서비스구독','앱스토어') THEN '구독'
    WHEN t.category = '온라인쇼핑' THEN '쇼핑'
    WHEN t.category = '식비' AND ${sub} = '배달' THEN '배달음식'
    WHEN t.category = '식비' AND ${sub} = '식재료' THEN '식비'
    WHEN t.category = '식비' THEN '외식'
    WHEN t.category = '카페/간식' THEN '카페'
    WHEN t.category = '저축' THEN CASE WHEN t.amount::numeric > 0 THEN '수입' ELSE '저축' END
    WHEN t.category = '투자' THEN CASE WHEN t.amount::numeric > 0 THEN '수입' ELSE '투자' END
    WHEN t.category = '금융' AND ${sub} = '세금/과태료' THEN '세금'
    WHEN t.category = '금융' AND ${sub} = '증권/투자' THEN CASE WHEN t.amount::numeric > 0 THEN '수입' ELSE '투자' END
    WHEN t.category = '금융' THEN '금융'
    WHEN t.category IN ('자동차','교통') THEN '교통'
    WHEN t.category = '문화/여가' AND ${sub} = '도서' THEN '교육'
    WHEN t.category = '문화/여가' AND ${sub} = '스포츠' THEN '건강'
    WHEN t.category = '문화/여가' AND ${sub} = '마사지/스파' THEN '미용'
    WHEN t.category = '문화/여가' THEN '문화'
    WHEN t.category = '의료/건강' AND ${sub} = '건강용품' THEN '건강'
    WHEN t.category = '의료/건강' THEN '의료'
    WHEN t.category = '주거/통신' AND ${sub} = '휴대폰' THEN '통신'
    WHEN t.category = '주거/통신' THEN '주거'
    WHEN t.category = '여행/숙박' THEN '여행'
    WHEN t.category = '패션/쇼핑' THEN '쇼핑'
    WHEN t.category = '뷰티/미용' THEN '미용'
    WHEN t.category = '교육/학습' THEN '교육'
    WHEN t.category = '반려동물' THEN '생활용품'
    WHEN t.category = '경조/선물' THEN '기타'
    WHEN t.category = '술/유흥' THEN '외식'
    WHEN t.category IN ('금융수입','급여','사업수입','기타수입') THEN '수입'
    ELSE t.category
  END`;
}

function buildEffectiveCategoryExpr(_userId: number): string {
  // 우선순위: 수동지정 > 규칙매칭(사전 계산된 ruleCategory) > 뱅크샐러드 매핑 > 원본
  //
  // 예전에는 여기서 category_rules를 행마다 훑는 상관 서브쿼리를 돌렸는데,
  // 이 표현식이 집계 쿼리 하나에 5~6번씩 인라인되어 O(거래수 × 규칙수 × N)
  // 이 되었고, 규칙이 수천 개 쌓이면(자동 생성 반복) 대시보드 쿼리가 수십
  // 초로 늘어나 클라이언트 타임아웃을 유발했다. 이제 규칙 매칭 결과는
  // bakeRuleCategories로 ruleCategory 컬럼에 미리 굳혀두고, 읽기 시점에는
  // 컬럼만 참조하므로 규칙 수와 무관하게 O(거래수)로 일정하다.
  return `COALESCE(
    t."customCategory",
    t."ruleCategory",
    ${bankSaladMapSQL()},
    t.category
  )`;
}

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
  const inserted = await db
    .insert(transactions)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: transactions.id });
  return inserted.length;
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
    `SELECT
       CASE WHEN sub.l1 = 'income' THEN '수입' ELSE sub."effectiveCategory" END as category,
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
         AND (
           ((${effectiveCatExpr}) IN (${savingsCatsSQL}) ${notExcludedSQL})
           OR
           ((${effectiveCatExpr}) NOT IN (${savingsCatsSQL}) ${catExcludeSQL} ${notExcludedSQL})
         )
     ) sub
     GROUP BY (CASE WHEN sub.l1 = 'income' THEN '수입' ELSE sub."effectiveCategory" END), sub.l1
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
    `SELECT sub."yearMonth",
            CASE WHEN sub.l1 = 'income' THEN '수입' ELSE sub."effectiveCategory" END as category,
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
         AND (
           ((${effectiveCatExpr}) IN (${savingsCatsSQL}) ${notExcludedSQL})
           OR
           ((${effectiveCatExpr}) NOT IN (${savingsCatsSQL}) ${catExcludeSQL} ${notExcludedSQL})
         )
     ) sub
     GROUP BY sub."yearMonth", (CASE WHEN sub.l1 = 'income' THEN '수입' ELSE sub."effectiveCategory" END), sub.l1
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
  _excludedIds: number[]
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
  const notExcl = `NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)`;

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
     FROM transactions t WHERE t."userId" = ${userId}`
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
  direction?: "income" | "expense"
): Promise<{ content: string; total: number; count: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const escapedCat = category.replace(/'/g, "''");
  const monthSQL = yearMonth ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "";
  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
  // 부호로 방향 일치 (지출=출금/음수, 수입=입금/양수) → 환불이 지출에 섞이지 않음
  const signSQL = direction === "expense" ? "AND t.amount::numeric < 0"
                : direction === "income"  ? "AND t.amount::numeric > 0"
                : "";
  // '수입'은 단일 카테고리로 통합 — 양수·비저축·비이체 전체가 수입
  const catFilter = category === "수입"
    ? `t.amount::numeric > 0 AND (${effectiveCatExpr}) NOT IN (${savingsCatsSQL}) AND (${effectiveCatExpr}) <> '이체'`
    : `(${effectiveCatExpr}) = '${escapedCat}'`;
  const notExcludedSQL = `AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)`;

  const rows = await db.execute(sql.raw(
    `SELECT t.content, ABS(SUM(t.amount::numeric)) as total, COUNT(*) as cnt
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND ${catFilter}
       ${signSQL}
       ${monthSQL}
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
    case "categories": {
      // query = "{l1}|{콤마구분 L3목록}" — 부호로 입출금 방향까지 맞춰 화면 표기와 일치
      const [l1Part, catsPart] = query.includes("|") ? query.split("|") : ["", query];
      const cats = (catsPart ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      const expr = buildEffectiveCategoryExpr(userId);
      const inList = cats.length ? cats.map((c) => `'${esc(c)}'`).join(",") : "''";
      const savings = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
      if (l1Part === "income")  return `t.amount::numeric > 0 AND (${expr}) <> '이체' AND (${expr}) NOT IN (${savings})`;
      if (l1Part === "savings") return `(${expr}) IN (${inList})`;
      if (l1Part === "expense") return `t.amount::numeric < 0 AND (${expr}) IN (${inList}) AND (${expr}) NOT IN (${savings}) AND (${expr}) <> '이체'`;
      if (cats.length === 0) return "TRUE";
      return `(${expr}) IN (${inList})`;
    }
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
  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const hasFilter = !!filter?.query?.trim();
  const filterSQL = hasFilter ? `AND ${buildTxSearchSQL(userId, filter!.field, filter!.query.trim())}` : "";

  const [rows, countRows, excludedIds] = await Promise.all([
    db.execute(sql.raw(
      `SELECT id, "txDate"::text as "txDate", "txTime", "txType", category, "customCategory",
              (${effectiveCatExpr}) as "effectiveCategory",
              content, amount::text as amount, currency, "paymentMethod", memo
       FROM transactions t
       WHERE t."userId" = ${userId} ${filterSQL}
       ORDER BY t."txDate" DESC, t."txTime" DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )),
    db.execute(sql.raw(
      `SELECT COUNT(*) as total FROM transactions t
       WHERE t."userId" = ${userId} ${filterSQL}`
    )),
    getExcludedTransactionIds(userId),
  ]);

  const normalizedRows = (rows as any[]).map((r) => ({
    ...r,
    id: Number(r.id),
    txDate: String(r.txDate),
    amount: String(r.amount),
    customCategory: r.customCategory ?? null,
    effectiveCategory: r.effectiveCategory ?? r.category,
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
  const savingsCatsSQL = SAVINGS_CATS.map((c) => `'${c}'`).join(",");

  const isSavingsCat = SAVINGS_CATS.includes(category);
  const excludeFilter = isSavingsCat
    ? ""
    : `AND NOT EXISTS (
         SELECT 1 FROM excluded_transactions et
         WHERE et."userId" = ${userId} AND et."transactionId" = t.id
       )`;
  const monthFilter = yearMonth ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "";
  // '수입'은 단일 카테고리로 통합 — 양수·비저축·비이체 전체가 수입
  const catMatch = category === "수입"
    ? `sub.amount::numeric > 0 AND sub."effectiveCategory" NOT IN (${savingsCatsSQL}) AND sub."effectiveCategory" <> '이체'`
    : `sub."effectiveCategory" = '${escapedCategory}'`;

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
       WHERE ${catMatch}
       ORDER BY sub."txDate" DESC, sub."txTime" DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )),
    db.execute(sql.raw(
      `SELECT COUNT(*) as total
       FROM (
         SELECT t.id, t.amount, t."txType", (${effectiveCatExpr}) as "effectiveCategory"
         FROM transactions t
         WHERE t."userId" = ${userId}
           ${excludeFilter}
           ${monthFilter}
       ) sub
       WHERE ${catMatch}`
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
       ABS(SUM(t.amount::numeric)) as total,
       COUNT(*) as cnt,
       MAX(TO_CHAR(t."txDate", 'YYYY-MM-DD')) as "lastDate"
     FROM transactions t
     WHERE t."userId" = ${userId}
       AND (${effectiveCatExpr}) IN ('저축', '투자')
       AND NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id)
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
    // ── 수입 ───────────────────────────────────────────────────
    { keyword: "급여", category: "수입", isExact: false, ruleType: "income" },
    { keyword: "월급", category: "수입", isExact: false, ruleType: "income" },
    { keyword: "상여", category: "수입", isExact: false, ruleType: "income" },
    { keyword: "보너스", category: "수입", isExact: false, ruleType: "income" },
    { keyword: "이자", category: "수입", isExact: false, ruleType: "income" },
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

  // 뱅크샐러드 대분류 원본이 아니라 앱 L3로 매핑된 카테고리를 규칙에 저장한다.
  // (과거엔 t.category 원본을 저장해 '온라인쇼핑'·'생활' 같은 값이 규칙에 박혀 '기타'로 떨어졌다)
  const mappedCat = `COALESCE(t."customCategory", ${bankSaladMapSQL()})`;
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

/**
 * 활성 규칙을 모든 거래에 적용해 ruleCategory를 다시 굳힌다.
 * (예전에는 customCategory를 덮어써 수동 지정을 파괴했지만, 이제는
 *  규칙 결과를 별도 컬럼 ruleCategory에만 반영하므로 수동 지정이 보존된다.)
 */
export async function applyRulesToAllTransactions(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

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
