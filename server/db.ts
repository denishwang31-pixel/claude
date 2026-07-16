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
import { buildKeywordCaseSQL } from "../shared/keywordCategories";
import { randomBytes } from "crypto";

const DB_URL = process.env.DATABASE_URL ?? "postgres://budget:budget123@localhost:5432/household_budget";

let _db: ReturnType<typeof drizzle> | null = null;

async function runAutoMigrations(db: ReturnType<typeof drizzle>) {
  const APP_L3_VALUES_SQL = APP_L3_CATEGORIES.map((c) => `'${c.replace(/'/g, "''")}'`).join(",");

  // 옛 카테고리(구 체계) → 새 카테고리 키 매핑. customCategory / ruleCategory /
  // category_rules.category 에 남아있는 구 값들을 새 값으로 옮긴다. 자기 자신으로
  // 매핑되는 값(식비/카페/쇼핑/미용/세금)은 대상에서 제외해 매번 쓰지 않게 한다.
  const remapKeys = Object.keys(OLD_CATEGORY_REMAP);
  const remapInList = remapKeys.map((k) => `'${k}'`).join(",");
  const remapCase = (col: string) =>
    `CASE ${col} ` + remapKeys.map((k) => `WHEN '${k}' THEN '${OLD_CATEGORY_REMAP[k]}'`).join(" ") + ` ELSE ${col} END`;
  const remapStep = (table: string, col: string) =>
    `UPDATE ${table} SET "${col}" = ${remapCase(`"${col}"`)} WHERE "${col}" IN (${remapInList})`;

  const steps = [
    // 이메일 로그인용 비밀번호 해시 + openId 길이 확장(이메일 계정은 "email:<email>")
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordHash" varchar(255)`,
    `ALTER TABLE users ALTER COLUMN "openId" TYPE varchar(255)`,
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
    `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS "dashboardMemos" text DEFAULT '{}'`,
    // 규칙 매칭 결과를 굳혀두는 컬럼 (읽기 시점 상관 서브쿼리 제거용)
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "ruleCategory" varchar(64)`,
    // 데이터 소유자 (동현/혜진) — 업로드/수기입력 시 지정
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "owner" varchar(16)`,
    // 구 카테고리 → 새 카테고리 키로 이관 (아래 '정리' 단계보다 먼저 실행되어야 함)
    remapStep("transactions", "customCategory"),
    remapStep("transactions", "ruleCategory"),
    remapStep("category_rules", "category"),
    // 데이터 정리: 앱 L3가 아닌 값(뱅크샐러드 대분류 원본 등)을 제거해 매핑이 정상 동작하게.
    `UPDATE transactions SET "customCategory" = NULL
       WHERE "customCategory" IS NOT NULL
         AND "customCategory" NOT IN (${APP_L3_VALUES_SQL})`,
    `UPDATE transactions SET "ruleCategory" = NULL
       WHERE "ruleCategory" IS NOT NULL
         AND "ruleCategory" NOT IN (${APP_L3_VALUES_SQL})`,
    `DELETE FROM category_rules
       WHERE category NOT IN (${APP_L3_VALUES_SQL})`,
    // 카테고리별 월 예산 목표 + 임계치 알림 기록
    `CREATE TABLE IF NOT EXISTS budgets (
       id serial PRIMARY KEY,
       "userId" integer NOT NULL,
       category varchar(64) NOT NULL,
       "targetAmount" numeric(15,2) NOT NULL,
       "createdAt" timestamp NOT NULL DEFAULT NOW(),
       "updatedAt" timestamp NOT NULL DEFAULT NOW(),
       UNIQUE ("userId", category)
     )`,
    `CREATE TABLE IF NOT EXISTS budget_alerts (
       id serial PRIMARY KEY,
       "userId" integer NOT NULL,
       category varchar(64) NOT NULL,
       "yearMonth" varchar(7) NOT NULL,
       threshold integer NOT NULL,
       "createdAt" timestamp NOT NULL DEFAULT NOW(),
       UNIQUE ("userId", category, "yearMonth", threshold)
     )`,
    // 가족 공유 그룹 — 멤버는 소유자의 데이터셋을 함께 사용한다.
    `CREATE TABLE IF NOT EXISTS groups (
       id serial PRIMARY KEY,
       "inviteCode" varchar(16) NOT NULL UNIQUE,
       "ownerUserId" integer NOT NULL,
       name varchar(64),
       "createdAt" timestamp NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS group_members (
       "groupId" integer NOT NULL,
       "userId" integer NOT NULL UNIQUE,
       role varchar(16) NOT NULL DEFAULT 'member',
       "joinedAt" timestamp NOT NULL DEFAULT NOW()
     )`,
    // 숨긴 계좌(결제수단) — 집계·목록에서 제외할 카드/은행
    `CREATE TABLE IF NOT EXISTS hidden_accounts (
       "userId" integer NOT NULL,
       "paymentMethod" varchar(128) NOT NULL,
       "createdAt" timestamp NOT NULL DEFAULT NOW(),
       UNIQUE ("userId", "paymentMethod")
     )`,
    // 조회 성능 인덱스 — 다사용자에서 유저 전체 스캔을 막는다.
    `CREATE INDEX IF NOT EXISTS "transactions_userId_txDate_idx" ON transactions ("userId", "txDate")`,
    `CREATE INDEX IF NOT EXISTS "transactions_userId_paymentMethod_idx" ON transactions ("userId", "paymentMethod")`,
    `CREATE INDEX IF NOT EXISTS "excluded_userId_txId_idx" ON excluded_transactions ("userId", "transactionId")`,
    // 1회성 마이그레이션 추적 테이블
    `CREATE TABLE IF NOT EXISTS app_migrations (key varchar(64) PRIMARY KEY, "appliedAt" timestamp NOT NULL DEFAULT NOW())`,
  ];
  for (const step of steps) {
    try {
      await db.execute(sql.raw(step));
    } catch (e) {
      console.warn("[Database] migration step failed:", e instanceof Error ? e.message : e);
    }
  }

  // [1회성] 기존 이체성 거래(내계좌이체·카드대금 등)를 제외 체크박스로 이관.
  // '이체' 유사 카테고리 버킷을 없애고 제외 체계를 체크박스 하나로 통일 —
  // 딱 한 번만 실행되므로, 이후 사용자가 체크를 해제한 건 다시 체크되지 않는다.
  try {
    const done = (await db.execute(sql.raw(
      `SELECT 1 FROM app_migrations WHERE key = 'transfer-exclude-v1'`
    ))) as any[];
    if (done.length === 0) {
      await db.execute(sql.raw(
        `INSERT INTO excluded_transactions ("userId", "transactionId")
         SELECT t."userId", t.id FROM transactions t
         WHERE t.category IN ('내계좌이체','이체','카드대금','현금','미분류')
         ON CONFLICT DO NOTHING`
      ));
      await db.execute(sql.raw(
        `INSERT INTO app_migrations (key) VALUES ('transfer-exclude-v1') ON CONFLICT DO NOTHING`
      ));
    }
  } catch (e) {
    console.warn("[Database] transfer-exclude migration failed:", e instanceof Error ? e.message : e);
  }

  // [1회성 v2] v1이 이체 전체를 제외했던 것을 되돌린다 — 자동 제외는
  // '카드대금'(카드 지출과 중복)만 유지하고, 그 외 이체성(내계좌이체·이체·
  // 현금·미분류) 중 쌍 매칭 태그가 없는 건 제외 해제. (이체 지출이 많아
  // 전부 제외하면 안 된다는 요구 반영 — 왕복 쌍은 상호이체 상쇄가 처리.)
  try {
    const done2 = (await db.execute(sql.raw(
      `SELECT 1 FROM app_migrations WHERE key = 'transfer-exclude-v2'`
    ))) as any[];
    if (done2.length === 0) {
      await db.execute(sql.raw(
        `DELETE FROM excluded_transactions et
         USING transactions t
         WHERE et."transactionId" = t.id AND et."userId" = t."userId"
           AND t.category IN ('내계좌이체','이체','현금','미분류')
           AND COALESCE(t.memo,'') NOT LIKE '%상호이체 상쇄%'
           AND COALESCE(t.memo,'') NOT LIKE '%카드 취소%'`
      ));
      await db.execute(sql.raw(
        `INSERT INTO app_migrations (key) VALUES ('transfer-exclude-v2') ON CONFLICT DO NOTHING`
      ));
    }
  } catch (e) {
    console.warn("[Database] transfer-exclude-v2 migration failed:", e instanceof Error ? e.message : e);
  }

  // 서버 시작 시 자동 제외 배치(상호이체 상쇄·카드취소) 실행 — 업로드 없이
  // 실행만 해도 배치가 돌도록. 멱등(처리된 쌍·해제한 쌍은 건드리지 않음)이라
  // 매 시작마다 안전. 첫 요청을 지연시키지 않게 백그라운드로 던진다.
  try {
    const users = (await db.execute(sql.raw(
      `SELECT DISTINCT "userId" AS uid FROM transactions LIMIT 50`
    ))) as any[];
    for (const row of users) {
      runAutoExclusions(Number(row.uid))
        .then((r) => {
          if (r.cardPairs > 0 || r.transferPairs > 0) {
            console.log(`[AutoExclusions] user ${row.uid}: 상호이체 ${r.transferPairs}쌍, 카드취소 ${r.cardPairs}쌍 자동 제외`);
          }
        })
        .catch((e) => console.warn("[AutoExclusions] failed:", e instanceof Error ? e.message : e));
    }
  } catch (e) {
    console.warn("[AutoExclusions] startup batch skipped:", e instanceof Error ? e.message : e);
  }

  // 업그레이드 직후, 규칙은 있는데 ruleCategory가 아직 한 번도 채워지지 않은
  // 사용자만 최초 1회 bake한다. (규칙 매칭된 행이 하나라도 생기면 다음
  // 시작부터는 이 조건이 거짓이 되어 재실행되지 않음 — 매 시작마다 도는
  // 무거운 작업이 되지 않도록.) 첫 요청을 지연시키지 않게 비동기로 던진다.
  try {
    const needBake = (await db.execute(sql.raw(
      `SELECT DISTINCT cr."userId" AS uid
         FROM category_rules cr
        WHERE cr."isActive"::int = 1
          AND NOT EXISTS (
            SELECT 1 FROM transactions t
             WHERE t."userId" = cr."userId" AND t."ruleCategory" IS NOT NULL
          )
        LIMIT 50`
    ))) as any[];
    for (const row of needBake) {
      // 블로킹하지 않도록 백그라운드로 — 실패해도 서버 시작에는 영향 없음
      bakeRuleCategories(Number(row.uid)).catch((e) =>
        console.warn("[Database] bake failed:", e instanceof Error ? e.message : e)
      );
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

/** 이메일로 사용자 조회 (passwordHash 포함 — 로그인 검증용). 없으면 undefined. */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** 이메일 회원가입 — 이미 존재하면 null 반환(중복). 성공 시 생성된 사용자 반환. */
export async function createEmailUser(params: {
  email: string;
  passwordHash: string;
  name: string;
}): Promise<typeof users.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  const email = params.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) return null;

  const openId = `email:${email}`;
  const role = openId === ENV.ownerOpenId || email === ENV.ownerOpenId ? "admin" : "user";
  await db.insert(users).values({
    openId,
    email,
    name: params.name,
    passwordHash: params.passwordHash,
    loginMethod: "email",
    role,
    lastSignedIn: new Date(),
  });
  return (await getUserByOpenId(openId)) ?? null;
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

export const SAVINGS_CATS = ["장기저축", "단기저축", "저축", "투자", "청약", "적금", "예금", "CMA", "ETF", "주식", "펀드", "ISA", "IRP"];
const SAVINGS_ONLY_CATS = ["장기저축", "단기저축", "저축", "청약", "적금", "예금", "CMA"];
const INVEST_ONLY_CATS = ["투자", "ETF", "주식", "펀드", "ISA", "IRP"];

/** 앱이 최종 사용하는 유효 L3 카테고리 — 이 목록에 없는 값(뱅크샐러드 대분류 원본 등)은
 *  customCategory/규칙에 들어가면 안 된다(자동 정리 대상). */
export const APP_L3_CATEGORIES = [
  // 지출 — 생활비
  "식비", "쇼핑", "외식&배달", "카페", "생활비_기타",
  // 교통/통신
  "통신비", "구독비", "교통비", "차량유지비",
  // 교육 (사람별)
  "교육_서준", "교육_재이", "교육_동현", "교육_혜진", "교육_미지정",
  // 여가/문화
  "여행&문화생활", "미용", "운동", "여가_기타",
  // 병원 (사람별)
  "병원_서준", "병원_재이", "병원_동현", "병원_혜진", "병원_미지정",
  // 보험 (사람별, 보장성)
  "보험_동현", "보험_혜진", "보험_서준", "보험_재이", "보험_미지정",
  // 경조사 / 주거 / 개인 용돈 / 기타
  "경조사", "월세", "공과금", "대출이자",
  "용돈_동현", "용돈_혜진", "용돈_미지정",
  "세금", "기타_기타",
  // 저축/투자
  "장기저축", "단기저축", "저축", "투자", "청약", "적금", "예금", "CMA", "ETF", "주식", "펀드", "ISA", "IRP",
  // 수입 (수입 = 미분류 겸용 fallback)
  "근로소득", "수당", "부가소득", "수입",
];

/** 수입 세분류(미분류 '수입' 제외) — 집계에서 '수입'으로 뭉치지 않고 분리 표시 */
export const INCOME_DETAILED = ["근로소득", "수당", "부가소득"];

/** 구 카테고리 → 새 카테고리 키 매핑 (자기 자신으로 가는 것은 생략).
 *  마이그레이션·기본규칙 시드에서 공용으로 사용. */
export const OLD_CATEGORY_REMAP: Record<string, string> = {
  "외식": "외식&배달", "배달음식": "외식&배달", "생활용품": "생활비_기타",
  "주거": "공과금", "교통": "교통비", "통신": "통신비", "구독": "구독비",
  "문화": "여행&문화생활", "교육": "교육_미지정", "여행": "여행&문화생활",
  "의료": "병원_미지정", "건강": "운동", "금융": "기타_기타", "기타": "기타_기타",
};
export function remapOldCategory(cat: string): string { return OLD_CATEGORY_REMAP[cat] ?? cat; }

/** 카테고리명으로 규칙 타입(income/savings/investment/expense) 추론 */
export function categoryToRuleType(category: string): string {
  if (category === "수입" || INCOME_DETAILED.includes(category)) return "income";
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
    -- 이체성 원본은 별도 '이체' 카테고리 없이 '기타_기타'로 두고,
    -- 업로드 시 제외 체크박스에 자동 체크된다(단일 제외 체계).
    WHEN t.category IN ('내계좌이체','이체','카드대금','현금','미분류') THEN '기타_기타'
    -- 생활비
    WHEN t.category = '생활' AND ${sub} IN ('마트','편의점') THEN '식비'
    WHEN t.category = '생활' THEN '생활비_기타'
    WHEN t.category = '반려동물' THEN '생활비_기타'
    WHEN t.category = '식비' AND ${sub} = '배달' THEN '외식&배달'
    WHEN t.category = '식비' AND ${sub} = '식재료' THEN '식비'
    WHEN t.category = '식비' THEN '외식&배달'
    WHEN t.category = '카페/간식' THEN '카페'
    WHEN t.category = '술/유흥' THEN '외식&배달'
    WHEN t.category = '온라인쇼핑' AND ${sub} IN ('서비스구독','앱스토어') THEN '구독비'
    WHEN t.category = '온라인쇼핑' THEN '쇼핑'
    WHEN t.category = '패션/쇼핑' THEN '쇼핑'
    -- 저축/투자/수입
    WHEN t.category = '저축' THEN CASE WHEN t.amount::numeric > 0 THEN '수입' ELSE '저축' END
    WHEN t.category = '투자' THEN CASE WHEN t.amount::numeric > 0 THEN '수입' ELSE '투자' END
    WHEN t.category = '금융' AND ${sub} = '세금/과태료' THEN '세금'
    WHEN t.category = '금융' AND ${sub} = '증권/투자' THEN CASE WHEN t.amount::numeric > 0 THEN '수입' ELSE '투자' END
    WHEN t.category = '금융' THEN '기타_기타'
    -- 교통/차량
    WHEN t.category = '자동차' THEN '차량유지비'
    WHEN t.category = '교통' THEN '교통비'
    -- 여가/문화/교육/운동/미용
    WHEN t.category = '문화/여가' AND ${sub} = '도서' THEN '교육_미지정'
    WHEN t.category = '문화/여가' AND ${sub} = '스포츠' THEN '운동'
    WHEN t.category = '문화/여가' AND ${sub} = '마사지/스파' THEN '미용'
    WHEN t.category = '문화/여가' THEN '여행&문화생활'
    WHEN t.category = '여행/숙박' THEN '여행&문화생활'
    WHEN t.category = '뷰티/미용' THEN '미용'
    WHEN t.category = '교육/학습' THEN '교육_미지정'
    -- 병원
    WHEN t.category = '의료/건강' AND ${sub} = '건강용품' THEN '생활비_기타'
    WHEN t.category = '의료/건강' THEN '병원_미지정'
    -- 주거/통신
    WHEN t.category = '주거/통신' AND ${sub} = '휴대폰' THEN '통신비'
    WHEN t.category = '주거/통신' THEN '공과금'
    -- 경조사 / 세금 / 수입
    WHEN t.category = '경조/선물' THEN '경조사'
    WHEN t.category = '세금' THEN '세금'
    WHEN t.category = '급여' THEN '근로소득'
    WHEN t.category IN ('금융수입','사업수입','기타수입') THEN '수입'
    ELSE NULL
  END`;
}

/** 내용(가맹점명) 키워드 기반 자동 분류 — 뱅크샐러드 대분류가 없는 일반
 *  카드/은행 파일에서도 분류가 되도록 한다. 매칭 실패 시 NULL. */
function keywordMapSQL(): string {
  return buildKeywordCaseSQL(`LOWER(COALESCE(t.content,''))`);
}

/** 자동 분류 최종식(항상 non-null): 뱅크샐러드 대분류 매핑 → 내용 키워드 매핑 → 기타.
 *  뱅크샐러드 파일은 대분류로, 일반 파일은 가맹점명 키워드로 분류된다. */
function autoMapSQL(): string {
  return `COALESCE(${bankSaladMapSQL()}, ${keywordMapSQL()}, '기타_기타')`;
}

function buildEffectiveCategoryExpr(_userId: number): string {
  // 우선순위: 수동지정 > 규칙매칭(사전 계산된 ruleCategory) > 자동분류(대분류/키워드) > 원본
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
    ${autoMapSQL()},
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

// ── 예산 목표 & 임계치 알림 ────────────────────────────────────
export const BUDGET_THRESHOLDS = [50, 80, 90, 100];

/** 카테고리별 월 예산 목표 + 해당 월 지출·달성률. yearMonth='YYYY-MM'. */
export async function getBudgetStatus(
  userId: number,
  yearMonth: string
): Promise<{ category: string; target: number; spent: number; percent: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const budgetRows = (await db.execute(
    sql.raw(`SELECT category, "targetAmount"::numeric as target FROM budgets WHERE "userId" = ${userId}`)
  )) as any[];
  if (budgetRows.length === 0) return [];

  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const notExcludedSQL = `AND (NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;
  const monthSQL = /^\d{4}-\d{2}$/.test(yearMonth) ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "";

  // 이번 달 카테고리별 지출(effectiveCategory 기준, 제외 항목 빼고, 지출만)
  const spendRows = (await db.execute(
    sql.raw(
      `SELECT (${effectiveCatExpr}) as category, ABS(SUM(t.amount::numeric)) as spent
       FROM transactions t
       WHERE t."userId" = ${userId}
         AND t.amount::numeric < 0
         ${monthSQL}
         ${notExcludedSQL}
       GROUP BY (${effectiveCatExpr})`
    )
  )) as any[];
  const spentMap = new Map<string, number>();
  for (const r of spendRows) spentMap.set(String(r.category), Number(r.spent));

  return budgetRows
    .map((b) => {
      const target = Number(b.target);
      const spent = spentMap.get(String(b.category)) ?? 0;
      const percent = target > 0 ? Math.round((spent / target) * 100) : 0;
      return { category: String(b.category), target, spent, percent };
    })
    .sort((a, b) => b.percent - a.percent);
}

export async function setBudget(userId: number, category: string, targetAmount: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    INSERT INTO budgets ("userId", category, "targetAmount", "updatedAt")
    VALUES (${userId}, ${category}, ${targetAmount}, NOW())
    ON CONFLICT ("userId", category)
    DO UPDATE SET "targetAmount" = ${targetAmount}, "updatedAt" = NOW()
  `);
}

export async function deleteBudget(userId: number, category: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`DELETE FROM budgets WHERE "userId" = ${userId} AND category = ${category}`);
  // 알림 기록도 정리 → 나중에 다시 설정하면 임계치 알림을 새로 받을 수 있다.
  await db.execute(sql`DELETE FROM budget_alerts WHERE "userId" = ${userId} AND category = ${category}`);
}

/** 이번 달 새로 넘긴 임계치(50/80/90/100%)를 찾아 기록하고, 새로 발생한 알림만 반환.
 *  같은 달·카테고리·임계치는 한 번만 반환된다(중복 알림 방지). */
export async function detectNewBudgetAlerts(
  userId: number,
  yearMonth: string
): Promise<{ category: string; threshold: number; spent: number; target: number; percent: number }[]> {
  const db = await getDb();
  if (!db || !/^\d{4}-\d{2}$/.test(yearMonth)) return [];

  const status = await getBudgetStatus(userId, yearMonth);
  const newAlerts: { category: string; threshold: number; spent: number; target: number; percent: number }[] = [];

  for (const s of status) {
    if (s.target <= 0) continue;
    for (const th of BUDGET_THRESHOLDS) {
      if (s.percent < th) continue;
      const res = (await db.execute(sql`
        INSERT INTO budget_alerts ("userId", category, "yearMonth", threshold)
        VALUES (${userId}, ${s.category}, ${yearMonth}, ${th})
        ON CONFLICT ("userId", category, "yearMonth", threshold) DO NOTHING
        RETURNING threshold
      `)) as any[];
      if (res.length > 0) {
        newAlerts.push({ category: s.category, threshold: th, spent: s.spent, target: s.target, percent: s.percent });
      }
    }
  }
  // 낮은 임계치부터 정렬(50 → 100)
  return newAlerts.sort((a, b) => a.threshold - b.threshold);
}

// ── 가족 공유 그룹 ─────────────────────────────────────────────
/** 사용자가 그룹에 속하면 그룹 소유자의 userId를, 아니면 자기 자신을 반환.
 *  모든 데이터 접근은 이 값을 기준으로 한다(가족이 같은 데이터를 공유). */
export async function getDataUserId(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return userId;
  try {
    const rows = (await db.execute(sql`
      SELECT g."ownerUserId" AS owner FROM group_members m
      JOIN groups g ON g.id = m."groupId"
      WHERE m."userId" = ${userId} LIMIT 1
    `)) as any[];
    return rows.length > 0 ? Number(rows[0].owner) : userId;
  } catch {
    // groups 테이블이 아직 없거나(초기) 오류 시 자기 자신으로 안전 폴백
    return userId;
  }
}

export async function getGroupInfo(userId: number): Promise<{
  inGroup: boolean; isOwner: boolean; inviteCode: string | null; memberCount: number;
}> {
  const db = await getDb();
  if (!db) return { inGroup: false, isOwner: false, inviteCode: null, memberCount: 0 };
  const rows = (await db.execute(sql`
    SELECT g.id, g."ownerUserId", g."inviteCode" FROM group_members m
    JOIN groups g ON g.id = m."groupId" WHERE m."userId" = ${userId} LIMIT 1
  `)) as any[];
  if (rows.length === 0) return { inGroup: false, isOwner: false, inviteCode: null, memberCount: 0 };
  const g = rows[0];
  const cnt = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM group_members WHERE "groupId" = ${Number(g.id)}`)) as any[];
  return {
    inGroup: true,
    isOwner: Number(g.ownerUserId) === userId,
    inviteCode: String(g.inviteCode),
    memberCount: Number(cnt[0].c),
  };
}

export async function createGroup(userId: number): Promise<{ inviteCode: string }> {
  const db = await getDb();
  if (!db) return { inviteCode: "" };
  const existing = await getGroupInfo(userId);
  if (existing.inGroup && existing.inviteCode) return { inviteCode: existing.inviteCode };
  const code = randomBytes(4).toString("hex").toUpperCase(); // 8자리
  const g = (await db.execute(sql`
    INSERT INTO groups ("inviteCode", "ownerUserId") VALUES (${code}, ${userId}) RETURNING id
  `)) as any[];
  const groupId = Number(g[0].id);
  await db.execute(sql`
    INSERT INTO group_members ("groupId", "userId", role) VALUES (${groupId}, ${userId}, 'owner')
    ON CONFLICT ("userId") DO UPDATE SET "groupId" = ${groupId}, role = 'owner'
  `);
  return { inviteCode: code };
}

export async function joinGroup(userId: number, inviteCode: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "서버 오류" };
  const code = inviteCode.trim().toUpperCase();
  const rows = (await db.execute(sql`SELECT id, "ownerUserId" FROM groups WHERE "inviteCode" = ${code} LIMIT 1`)) as any[];
  if (rows.length === 0) return { ok: false, error: "초대 코드를 찾을 수 없습니다." };
  const groupId = Number(rows[0].id);
  await db.execute(sql`
    INSERT INTO group_members ("groupId", "userId", role)
    VALUES (${groupId}, ${userId}, ${Number(rows[0].ownerUserId) === userId ? "owner" : "member"})
    ON CONFLICT ("userId") DO UPDATE SET "groupId" = ${groupId}
  `);
  return { ok: true };
}

export async function leaveGroup(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const info = (await db.execute(sql`
    SELECT g.id, g."ownerUserId" FROM group_members m JOIN groups g ON g.id = m."groupId"
    WHERE m."userId" = ${userId} LIMIT 1
  `)) as any[];
  if (info.length === 0) return;
  const groupId = Number(info[0].id);
  if (Number(info[0].ownerUserId) === userId) {
    // 소유자가 나가면 그룹 해체(데이터는 소유자 것으로 유지, 멤버는 각자 자기 데이터로 복귀)
    await db.execute(sql`DELETE FROM group_members WHERE "groupId" = ${groupId}`);
    await db.execute(sql`DELETE FROM groups WHERE id = ${groupId}`);
  } else {
    await db.execute(sql`DELETE FROM group_members WHERE "userId" = ${userId}`);
  }
}

// ── 계좌(결제수단) 표시/숨김 관리 ──────────────────────────────
/** 결제수단(카드/은행/페이) 목록 + 거래수·합계·숨김 여부.
 *  숨김 필터를 적용하지 않으므로 숨긴 계좌도 관리 화면에 나온다. */
export async function getAccounts(userId: number): Promise<{
  paymentMethod: string; count: number; total: number; hidden: boolean;
}[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = (await db.execute(
    sql.raw(
      `SELECT COALESCE(t."paymentMethod",'') as pm,
              COUNT(*) as cnt,
              ABS(SUM(t.amount::numeric)) as total,
              EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')) as hidden
       FROM transactions t
       WHERE t."userId" = ${userId}
       GROUP BY COALESCE(t."paymentMethod",'')
       ORDER BY COUNT(*) DESC`
    )
  )) as any[];
  return rows
    .filter((r) => String(r.pm).length > 0)
    .map((r) => ({
      paymentMethod: String(r.pm),
      count: Number(r.cnt),
      total: Number(r.total),
      hidden: r.hidden === true || r.hidden === "t",
    }));
}

export async function setAccountHidden(userId: number, paymentMethod: string, hidden: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (hidden) {
    await db.execute(sql`
      INSERT INTO hidden_accounts ("userId", "paymentMethod") VALUES (${userId}, ${paymentMethod})
      ON CONFLICT ("userId", "paymentMethod") DO NOTHING
    `);
  } else {
    await db.execute(sql`DELETE FROM hidden_accounts WHERE "userId" = ${userId} AND "paymentMethod" = ${paymentMethod}`);
  }
}

// ── 정기결제·구독 감지 ─────────────────────────────────────────
/** 같은 가맹점·비슷한 금액이 월 간격으로 반복되면 구독으로 판정한다.
 *  (별도 테이블 없이 거래 내역에서 즉시 계산 — 읽기 전용) */
export async function getSubscriptions(userId: number): Promise<{
  merchant: string;
  amount: number;
  count: number;
  cycleDays: number;
  lastCharged: string;
  nextDue: string;
}[]> {
  const db = await getDb();
  if (!db) return [];

  const notExcludedSQL = `AND (NOT EXISTS (SELECT 1 FROM excluded_transactions et WHERE et."userId" = ${userId} AND et."transactionId" = t.id) AND NOT EXISTS (SELECT 1 FROM hidden_accounts ha WHERE ha."userId" = ${userId} AND ha."paymentMethod" = COALESCE(t."paymentMethod",'')))`;
  // 같은 내용(가맹점) + 반올림 금액으로 묶고, 3회 이상 나온 것만 후보로.
  const rows = (await db.execute(
    sql.raw(
      `SELECT t.content as merchant, ROUND(ABS(t.amount::numeric)) as amt,
              ARRAY_AGG(t."txDate" ORDER BY t."txDate") as dates, COUNT(*) as cnt
       FROM transactions t
       WHERE t."userId" = ${userId}
         AND t.amount::numeric < 0
         AND t.content IS NOT NULL AND t.content <> '' AND t.content <> '-'
         ${notExcludedSQL}
       GROUP BY t.content, ROUND(ABS(t.amount::numeric))
       HAVING COUNT(*) >= 3`
    )
  )) as any[];

  const result: { merchant: string; amount: number; count: number; cycleDays: number; lastCharged: string; nextDue: string }[] = [];

  for (const r of rows) {
    const raw = Array.isArray(r.dates) ? r.dates : [];
    const dates = raw
      .map((d: unknown) => (d instanceof Date ? d : new Date(String(d))))
      .filter((d: Date) => !isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    if (dates.length < 3) continue;

    const diffs: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      diffs.push(Math.round((dates[i].getTime() - dates[i - 1].getTime()) / 86_400_000));
    }
    // 월 간격(25~35일) 판정 — 과반이 월 간격이어야 구독으로 인정
    const monthly = diffs.filter((d) => d >= 25 && d <= 35).sort((a, b) => a - b);
    if (monthly.length < 2 || monthly.length / diffs.length < 0.5) continue;

    const cycle = monthly[Math.floor(monthly.length / 2)]; // 중앙값 주기
    const last = dates[dates.length - 1];
    const next = new Date(last.getTime() + cycle * 86_400_000);
    result.push({
      merchant: String(r.merchant),
      amount: Number(r.amt),
      count: Number(r.cnt),
      cycleDays: cycle,
      lastCharged: last.toISOString().slice(0, 10),
      nextDue: next.toISOString().slice(0, 10),
    });
  }

  result.sort((a, b) => b.amount - a.amount);
  return result;
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

/** 소유자 필터 SQL — 'AND ...' 형태, 유효한 값(동현/혜진)일 때만 적용 */
export const OWNERS = ["동현", "혜진"];
function ownerSQL(owner?: string): string {
  if (!owner || !OWNERS.includes(owner)) return "";
  return `AND t."owner" = '${owner}'`;
}

/** 기간(날짜) 필터 SQL 조건 — 'AND ...' 형태로 반환, 값이 없으면 빈 문자열.
 *  대시보드/카테고리별 화면에서 기간별 집계를 위해 각 WHERE에 주입한다. */
function dateRangeSQL(dateStart?: string, dateEnd?: string): string {
  const parts: string[] = [];
  if (dateStart && /^\d{4}-\d{2}-\d{2}$/.test(dateStart)) parts.push(`t."txDate" >= '${dateStart}'`);
  if (dateEnd && /^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) parts.push(`t."txDate" <= '${dateEnd}'`);
  return parts.length ? "AND " + parts.join(" AND ") : "";
}

/** JSON 배열 문자열 → string[] (실패 시 빈 배열) */
function parseJsonList(query: string): string[] {
  try {
    const v = JSON.parse(query);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch { return []; }
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
    case "dateRange": {
      // query = "YYYY-MM-DD|YYYY-MM-DD" (시작|종료, 둘 다 포함)
      const [s, e] = query.split("|");
      const conds: string[] = [];
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) conds.push(`t."txDate" >= '${esc(s)}'`);
      if (e && /^\d{4}-\d{2}-\d{2}$/.test(e)) conds.push(`t."txDate" <= '${esc(e)}'`);
      return conds.length ? conds.join(" AND ") : "TRUE";
    }
    // ── 엑셀식 컬럼 필터 (값은 JSON 배열 문자열) ──────────────
    case "catIn": {   // 카테고리(L3 키) 다중 선택
      const list = parseJsonList(query);
      if (!list.length) return "TRUE";
      const expr = buildEffectiveCategoryExpr(userId);
      return `(${expr}) IN (${list.map((c) => `'${esc(c)}'`).join(",")})`;
    }
    case "pmIn": {    // 결제수단 다중 선택 ("(없음)" = 빈 값)
      const list = parseJsonList(query);
      if (!list.length) return "TRUE";
      return `COALESCE(t."paymentMethod",'') IN (${list.map((c) => `'${esc(c === "(없음)" ? "" : c)}'`).join(",")})`;
    }
    case "typeIn": {  // 타입 다중 선택
      const list = parseJsonList(query);
      if (!list.length) return "TRUE";
      return `t."txType" IN (${list.map((c) => `'${esc(c)}'`).join(",")})`;
    }
    case "categories": {
      // query = "{l1}|{콤마구분 L3목록}" — 부호로 입출금 방향까지 맞춰 화면 표기와 일치
      const [l1Part, catsPart] = query.includes("|") ? query.split("|") : ["", query];
      const cats = (catsPart ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      const expr = buildEffectiveCategoryExpr(userId);
      const inList = cats.length ? cats.map((c) => `'${esc(c)}'`).join(",") : "''";
      const savings = SAVINGS_CATS.map((c) => `'${c}'`).join(",");
      if (l1Part === "income") {
        const base = `t.amount::numeric > 0 AND (${expr}) NOT IN (${savings})`;
        if (!cats.length) return base;
        const detailedList = INCOME_DETAILED.map((c) => `'${c}'`).join(",");
        const chosen = cats.filter((c) => INCOME_DETAILED.includes(c));
        const parts: string[] = [];
        if (chosen.length) parts.push(`(${expr}) IN (${chosen.map((c) => `'${esc(c)}'`).join(",")})`);
        if (cats.includes("수입")) parts.push(`(${expr}) NOT IN (${detailedList})`);
        return parts.length ? `${base} AND (${parts.join(" OR ")})` : base;
      }
      if (l1Part === "savings") return `(${expr}) IN (${inList})`;
      if (l1Part === "expense") return `t.amount::numeric < 0 AND (${expr}) IN (${inList}) AND (${expr}) NOT IN (${savings}) AND (${expr}) <> '이체'`;
      if (cats.length === 0) return "TRUE";
      return `(${expr}) IN (${inList})`;
    }
    default:              return "TRUE";
  }
}

/** 검색 필터 목록 → 'AND ...' SQL (모두 AND 결합) */
function buildFiltersSQL(userId: number, filters?: { field: string; query: string }[], owner?: string): string {
  const parts: string[] = [];
  for (const f of filters ?? []) {
    if (f?.query?.trim()) parts.push(`AND ${buildTxSearchSQL(userId, f.field, f.query.trim())}`);
  }
  const os = ownerSQL(owner);
  if (os) parts.push(os);
  return parts.join(" ");
}

export async function getAllTransactions(
  userId: number,
  page = 1,
  pageSize = 50,
  filters?: { field: string; query: string }[],
  owner?: string
) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0, excludedIds: new Set<number>() };

  const offset = (page - 1) * pageSize;
  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const filterSQL = buildFiltersSQL(userId, filters, owner);

  const [rows, countRows, excludedIds] = await Promise.all([
    db.execute(sql.raw(
      `SELECT id, "txDate"::text as "txDate", "txTime", "txType", category, "customCategory",
              (${effectiveCatExpr}) as "effectiveCategory",
              content, amount::text as amount, currency, "paymentMethod", memo, "owner"
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
  // 대시보드와 동일한 effectiveCategory(수동지정 > 규칙 > 뱅크샐러드 매핑 > 원본)를
  // 함께 반환해 엑셀의 분류가 화면과 일치하도록 한다.
  const effectiveCatExpr = buildEffectiveCategoryExpr(userId);
  const rows = await db.execute(sql.raw(
    `SELECT id, "txDate"::text as "txDate", "txTime", "txType",
            category, "subCategory", "customCategory",
            (${effectiveCatExpr}) as "effectiveCategory",
            content, amount::text as amount, currency, "paymentMethod", memo, "owner", "dedupHash"
     FROM transactions t
     WHERE t."userId" = ${userId}
     ORDER BY t."txDate" DESC, t."txTime" DESC`
  ));
  return rows as any[];
}

/** 특정 카테고리 거래 내역 (드릴다운) */
export async function getCategoryTransactions(
  userId: number,
  category: string,
  page = 1,
  pageSize = 50,
  yearMonth?: string,
  dateStart?: string,
  dateEnd?: string,
  owner?: string
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
  const monthFilter = (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth) ? `AND TO_CHAR(t."txDate", 'YYYY-MM') = '${yearMonth}'` : "")
    + " " + dateRangeSQL(dateStart, dateEnd) + " " + ownerSQL(owner);
  // '수입'은 단일 카테고리로 통합 — 양수·비저축·비이체 전체가 수입
  const catMatch = category === "수입"
    ? `sub.amount::numeric > 0 AND sub."effectiveCategory" NOT IN (${savingsCatsSQL}) AND sub."effectiveCategory" NOT IN ('근로소득','수당','부가소득') AND sub."effectiveCategory" <> '이체'`
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

/** 전체 리셋 — 거래·제외·매핑규칙·설정(메모/제외카테고리)까지 모두 삭제해 빈 상태로 되돌린다. */
export async function resetAllData(userId: number): Promise<{ transactions: number; rules: number }> {
  const db = await getDb();
  if (!db) return { transactions: 0, rules: 0 };
  await db.execute(sql`DELETE FROM excluded_transactions WHERE "userId" = ${userId}`);
  const tx = await db.execute(sql`DELETE FROM transactions WHERE "userId" = ${userId} RETURNING id`);
  const rules = await db.execute(sql`DELETE FROM category_rules WHERE "userId" = ${userId} RETURNING id`);
  await db.execute(sql`DELETE FROM user_settings WHERE "userId" = ${userId}`);
  return { transactions: (tx as any[]).length, rules: (rules as any[]).length };
}

/** 선택한 거래들의 카테고리를 일괄 변경 (체크박스 선택 기반) */
export async function updateCategoryBulkByIds(userId: number, ids: number[], newCategory: string): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  const idList = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  const res = await db.execute(sql`
    UPDATE transactions SET "customCategory" = ${newCategory}
    WHERE "userId" = ${userId} AND id IN (${idList})
    RETURNING id
  `);
  return (res as any[]).length;
}

/** 거래 1건 삭제 (제외 표시도 함께 정리) */
export async function deleteTransaction(userId: number, transactionId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`DELETE FROM excluded_transactions WHERE "userId" = ${userId} AND "transactionId" = ${transactionId}`);
  const res = await db.execute(
    sql`DELETE FROM transactions WHERE "userId" = ${userId} AND id = ${transactionId} RETURNING id`
  );
  return (res as any[]).length > 0;
}

/** 수기 입력 거래 추가. 선택한 카테고리는 customCategory로 저장되어
 *  effectiveCategory 최우선으로 반영된다. dedupHash는 무작위 suffix로 충돌 방지. */
export async function addManualTransaction(userId: number, input: {
  txDate: string; txTime?: string; txType: string; category: string;
  content: string; amount: number; paymentMethod: string; memo?: string; owner?: string;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const { createHash } = await import("node:crypto");
  const dedupHash = createHash("sha256")
    .update(`manual|${userId}|${input.txDate}|${input.content}|${input.amount}|${Date.now()}|${Math.random()}`)
    .digest("hex");
  const res = await db.execute(sql`
    INSERT INTO transactions ("userId", "txDate", "txTime", "txType", category, "customCategory",
                              content, amount, currency, "paymentMethod", memo, "owner", "dedupHash")
    VALUES (${userId}, ${input.txDate}, ${input.txTime ?? ""}, ${input.txType}, ${"수기입력"}, ${input.category},
            ${input.content}, ${String(input.amount)}, ${"KRW"}, ${input.paymentMethod}, ${input.memo ?? ""},
            ${input.owner ?? null}, ${dedupHash})
    RETURNING id
  `);
  return Number((res as any[])[0]?.id ?? null);
}

/** 현재 검색 필터에 매칭되는 모든 거래를 일괄 제외/제외해제 (페이지 무관, 전체 결과 대상) */
export async function setExcludedByFilters(
  userId: number,
  filters: { field: string; query: string }[],
  owner: string | undefined,
  excluded: boolean
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const filterSQL = buildFiltersSQL(userId, filters, owner);
  if (excluded) {
    const res = await db.execute(sql.raw(
      `INSERT INTO excluded_transactions ("userId", "transactionId")
       SELECT ${userId}, t.id FROM transactions t
       WHERE t."userId" = ${userId} ${filterSQL}
       ON CONFLICT DO NOTHING
       RETURNING "transactionId"`
    ));
    return (res as any[]).length;
  } else {
    const res = await db.execute(sql.raw(
      `DELETE FROM excluded_transactions et
       WHERE et."userId" = ${userId}
         AND et."transactionId" IN (
           SELECT t.id FROM transactions t WHERE t."userId" = ${userId} ${filterSQL}
         )
       RETURNING "transactionId"`
    ));
    return (res as any[]).length;
  }
}

/** 업로드 시 제외 체크박스 자동 체크 대상 — '카드대금'만.
 *  (카드사 출금은 개별 카드 지출이 이미 업로드되므로 중복 → 항상 제외.
 *   그 외 이체는 실제 지출인 경우가 많아 자동 제외하지 않는다 —
 *   계좌 간 왕복은 상호이체 상쇄(±5분) 규칙이 쌍으로만 제외.) */
export const TRANSFER_RAW_CATS = ["카드대금"];

/** 방금 업로드된(dedupHash 목록) 거래 중 이체성 원본을 제외 체크박스에 자동 체크 */
export async function autoExcludeTransfersForHashes(userId: number, dedupHashes: string[]): Promise<number> {
  const db = await getDb();
  if (!db || dedupHashes.length === 0) return 0;
  const hashList = sql.join(dedupHashes.map((h) => sql`${h}`), sql`, `);
  const catList = TRANSFER_RAW_CATS.map((c) => `'${c}'`).join(",");
  const res = await db.execute(sql`
    INSERT INTO excluded_transactions ("userId", "transactionId")
    SELECT t."userId", t.id FROM transactions t
    WHERE t."userId" = ${userId} AND t."dedupHash" IN (${hashList})
      AND t.category IN (${sql.raw(catList)})
    ON CONFLICT DO NOTHING
    RETURNING "transactionId"
  `);
  return (res as any[]).length;
}

/** 자동 제외 검사 — 전체 데이터를 훑어 두 종류의 쌍을 찾아 둘 다 제외 처리한다.
 *  1) 카드 취소: 결제수단에 '카드'가 포함된 양수 거래 ↔ 같은 결제수단·같은 금액의
 *     음수 거래(±90일 내 가장 가까운 것). 메모에 '카드 취소' 기록.
 *  2) 상호이체 상쇄: 금액 +X / −X 가 5분 이내에 발생한 쌍(소유자 무관 —
 *     동현→혜진 교차 업로드 포함). 메모에 '상호이체 상쇄' 기록.
 *  1:1 그리디 매칭(가장 가까운 시각 우선)이라 한 거래가 두 번 상쇄되지 않는다.
 *  멱등: 이미 제외된 건 ON CONFLICT 무시, 메모 태그는 중복 기록하지 않음. */
export async function runAutoExclusions(userId: number): Promise<{ cardPairs: number; transferPairs: number }> {
  const db = await getDb();
  if (!db) return { cardPairs: 0, transferPairs: 0 };

  const rows = (await db.execute(sql`
    SELECT t.id,
           EXTRACT(EPOCH FROM (t."txDate"::timestamp + COALESCE(NULLIF(t."txTime",''),'00:00:00')::interval)) AS ts,
           t.amount::numeric AS amount,
           COALESCE(t."paymentMethod",'') AS pm,
           COALESCE(t.memo,'') AS memo,
           (et."transactionId" IS NOT NULL)::int AS excl
    FROM transactions t
    LEFT JOIN excluded_transactions et
      ON et."userId" = t."userId" AND et."transactionId" = t.id
    WHERE t."userId" = ${userId}
    ORDER BY 2
  `)) as any[];

  type R = { id: number; ts: number; amount: number; pm: string; memo: string; excl: boolean };
  const arr: R[] = rows.map((r) => ({
    id: Number(r.id), ts: Number(r.ts) * 1000, amount: Number(r.amount), pm: String(r.pm), memo: String(r.memo),
    excl: Number(r.excl) === 1,
  }));

  const matched = new Set<number>();
  const toExclude: number[] = [];
  const memoTags = new Map<number, string>();

  // 같은 |금액| 그룹으로 후보를 좁혀 O(n²) 회피
  const byAbs = new Map<string, R[]>();
  for (const r of arr) {
    const k = Math.abs(r.amount).toFixed(2);
    if (!byAbs.has(k)) byAbs.set(k, []);
    byAbs.get(k)!.push(r);
  }

  function pairUp(
    isCandidate: (r: R) => boolean,
    counterpartOk: (p: R, n: R) => boolean,
    maxDtMs: number,
    tag: string
  ): number {
    let pairs = 0;
    for (const group of byAbs.values()) {
      const positives = group.filter((r) => r.amount > 0 && !matched.has(r.id) && isCandidate(r));
      for (const p of positives) {
        if (matched.has(p.id)) continue;
        let best: R | null = null, bestDt = Infinity;
        for (const n of group) {
          if (n.amount !== -p.amount || matched.has(n.id)) continue;
          if (!counterpartOk(p, n)) continue;
          const dt = Math.abs(n.ts - p.ts);
          if (dt <= maxDtMs && dt < bestDt) { best = n; bestDt = dt; }
        }
        if (best) {
          matched.add(p.id); matched.add(best.id);
          // 이미 양쪽 다 태그된 쌍은 과거에 처리된 것 — 다시 건드리지 않는다.
          // (사용자가 체크를 해제했더라도 배치 재실행 시 재체크되지 않도록)
          const alreadyTagged = p.memo.includes(tag) && best.memo.includes(tag);
          if (!alreadyTagged) {
            toExclude.push(p.id, best.id);
            memoTags.set(p.id, tag); memoTags.set(best.id, tag);
            pairs++;
          }
        }
      }
    }
    return pairs;
  }

  // 1) 카드 취소: 같은 카드(결제수단 동일) + 같은 금액, ±90일
  const cardPairs = pairUp(
    (r) => r.pm.includes("카드"),
    (p, n) => n.pm === p.pm,
    90 * 24 * 3600 * 1000,
    "카드 취소"
  );
  // 2) 상호이체 상쇄: 아무 거래나 +X/−X 5분 이내 (소유자·결제수단 무관)
  const transferPairs = pairUp(
    () => true,
    () => true,
    5 * 60 * 1000,
    "상호이체 상쇄"
  );

  if (toExclude.length > 0) {
    const values = toExclude.map((id) => `(${userId}, ${id})`).join(",");
    await db.execute(sql.raw(
      `INSERT INTO excluded_transactions ("userId", "transactionId") VALUES ${values} ON CONFLICT DO NOTHING`
    ));
    // 메모 태그 기록 (이미 같은 태그가 있으면 중복 기록하지 않음)
    for (const [id, tag] of memoTags) {
      const row = arr.find((r) => r.id === id);
      if (row && row.memo.includes(tag)) continue;
      const newMemo = row && row.memo ? `${row.memo} / ${tag}` : tag;
      await db.execute(sql`UPDATE transactions SET memo = ${newMemo} WHERE "userId" = ${userId} AND id = ${id}`);
    }
  }

  return { cardPairs, transferPairs };
}

/** 컬럼 필터 드롭다운용 고유값 목록 (결제수단/타입/소유자) */
export async function getFilterOptions(userId: number): Promise<{
  paymentMethods: string[]; txTypes: string[]; owners: string[];
}> {
  const db = await getDb();
  if (!db) return { paymentMethods: [], txTypes: [], owners: [] };
  const [pms, types, owners] = await Promise.all([
    db.execute(sql`SELECT DISTINCT COALESCE("paymentMethod",'') AS v FROM transactions WHERE "userId" = ${userId} ORDER BY v`),
    db.execute(sql`SELECT DISTINCT "txType" AS v FROM transactions WHERE "userId" = ${userId} ORDER BY v`),
    db.execute(sql`SELECT DISTINCT COALESCE("owner",'') AS v FROM transactions WHERE "userId" = ${userId} ORDER BY v`),
  ]);
  const norm = (rows: any) => (rows as any[]).map((r) => String(r.v) === "" ? "(없음)" : String(r.v));
  return { paymentMethods: norm(pms), txTypes: (types as any[]).map((r) => String(r.v)), owners: norm(owners) };
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
  // (과거엔 t.category 원본을 저장해 '온라인쇼핑'·'생활' 같은 값이 규칙에 박혀 '기타'로 떨어졌다)
  const mappedCat = `COALESCE(t."customCategory", ${autoMapSQL()})`;
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
