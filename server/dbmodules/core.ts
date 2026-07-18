import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ENV } from "../_core/env";
import { buildKeywordCaseSQL } from "../../shared/keywordCategories";

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
    // 자동분류(뱅크샐러드 대분류/키워드) 결과를 굳혀두는 컬럼 (읽기 시점 31KB CASE 제거용)
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "autoCategory" varchar(64)`,
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
       "inviteCodeExpiresAt" timestamp,
       "createdAt" timestamp NOT NULL DEFAULT NOW()
     )`,
    // 기존 배포에 만료 컬럼 보강
    `ALTER TABLE groups ADD COLUMN IF NOT EXISTS "inviteCodeExpiresAt" timestamp`,
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
    // 자동분류 컬럼 백필(최초 1회) — 아직 비어있는(구버전) 행만 계산해 채운다.
    `UPDATE transactions t SET "autoCategory" = (${autoMapSQL()}) WHERE t."autoCategory" IS NULL`,
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
    // transactions.ts 는 core 를 임포트하므로 정적 임포트 시 순환 → 런타임 동적 임포트.
    const { runAutoExclusions } = await import("./transactions");
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
    if (needBake.length > 0) {
      // rules.ts 는 core 를 임포트하므로 정적 임포트 시 순환이 된다 → 런타임 동적 임포트.
      const { bakeRuleCategories } = await import("./rules");
      for (const row of needBake) {
        // 블로킹하지 않도록 백그라운드로 — 실패해도 서버 시작에는 영향 없음
        bakeRuleCategories(Number(row.uid)).catch((e) =>
          console.warn("[Database] bake failed:", e instanceof Error ? e.message : e)
        );
      }
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
export function bankSaladMapSQL(): string {
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
export function keywordMapSQL(): string {
  return buildKeywordCaseSQL(`LOWER(COALESCE(t.content,''))`);
}

/** 자동 분류 최종식(항상 non-null): 뱅크샐러드 대분류 매핑 → 내용 키워드 매핑 → 기타.
 *  뱅크샐러드 파일은 대분류로, 일반 파일은 가맹점명 키워드로 분류된다. */
export function autoMapSQL(): string {
  return `COALESCE(${bankSaladMapSQL()}, ${keywordMapSQL()}, '기타_기타')`;
}

export function buildEffectiveCategoryExpr(_userId: number): string {
  // 우선순위: 수동지정 > 규칙매칭(ruleCategory) > 자동분류(autoCategory) > 원본
  //
  // ruleCategory 와 마찬가지로 자동분류 결과도 autoCategory 컬럼에 미리 굳혀둔다
  // (bakeMissingAutoCategories / 마이그레이션 백필). 예전에는 여기에 31KB 키워드
  // CASE 를 담은 autoMapSQL() 을 인라인했는데, 이 표현식이 집계 쿼리 하나에 5~6번
  // 들어가 요청당 쿼리 텍스트가 최대 ~200KB로 불어나 매 요청 파싱 비용이 컸다.
  // 이제 읽기 시점에는 컬럼만 참조하므로 쿼리가 가볍고 일정하다.
  return `COALESCE(
    t."customCategory",
    t."ruleCategory",
    t."autoCategory",
    t.category
  )`;
}

/** 자동분류 결과를 autoCategory 컬럼에 채운다(아직 비어있는 행만).
 *  업로드/수기입력 직후 호출 — 새 행에만 계산이 돌아 O(신규건수)로 저렴하다.
 *  autoMapSQL() 은 t.category/subCategory/content 에만 의존하므로 userId 무관. */
export async function bakeMissingAutoCategories(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql.raw(
    `UPDATE transactions t SET "autoCategory" = (${autoMapSQL()})
       WHERE t."userId" = ${userId} AND t."autoCategory" IS NULL`
  ));
}

/** 키워드 사전이 바뀌었을 때 전체 재계산(관리용). 사용자 전체 행을 다시 굳힌다. */
export async function rebakeAutoCategories(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql.raw(
    `UPDATE transactions t SET "autoCategory" = (${autoMapSQL()})
       WHERE t."userId" = ${userId}`
  ));
}


/** 소유자 필터 SQL — 'AND ...' 형태, 유효한 값(동현/혜진)일 때만 적용 */
export const OWNERS = ["동현", "혜진"];
export function ownerSQL(owner?: string): string {
  if (!owner || !OWNERS.includes(owner)) return "";
  return `AND t."owner" = '${owner}'`;
}

/** 기간(날짜) 필터 SQL 조건 — 'AND ...' 형태로 반환, 값이 없으면 빈 문자열.
 *  대시보드/카테고리별 화면에서 기간별 집계를 위해 각 WHERE에 주입한다. */
export function dateRangeSQL(dateStart?: string, dateEnd?: string): string {
  const parts: string[] = [];
  if (dateStart && /^\d{4}-\d{2}-\d{2}$/.test(dateStart)) parts.push(`t."txDate" >= '${dateStart}'`);
  if (dateEnd && /^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) parts.push(`t."txDate" <= '${dateEnd}'`);
  return parts.length ? "AND " + parts.join(" AND ") : "";
}

/** JSON 배열 문자열 → string[] (실패 시 빈 배열) */
export function parseJsonList(query: string): string[] {
  try {
    const v = JSON.parse(query);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch { return []; }
}

/** 전체 거래 내역 */
export function buildTxSearchSQL(userId: number, field: string, query: string): string {
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
export function buildFiltersSQL(userId: number, filters?: { field: string; query: string }[], owner?: string): string {
  const parts: string[] = [];
  for (const f of filters ?? []) {
    if (f?.query?.trim()) parts.push(`AND ${buildTxSearchSQL(userId, f.field, f.query.trim())}`);
  }
  const os = ownerSQL(owner);
  if (os) parts.push(os);
  return parts.join(" ");
}

