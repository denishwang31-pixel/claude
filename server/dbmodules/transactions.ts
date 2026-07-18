import { and, desc, eq, sql } from "drizzle-orm";
import { InsertTransaction, transactions } from "../../drizzle/schema";
import {
  getDb, buildEffectiveCategoryExpr, buildFiltersSQL, ownerSQL, dateRangeSQL,
  bakeMissingAutoCategories, SAVINGS_CATS, TRANSFER_CATS, TRANSFER_TX_TYPES,
  TRANSFER_PAYMENT_KEYWORDS, OWNERS, APP_L3_CATEGORIES,
} from "./core";

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
  // 자동분류 컬럼 채우기(customCategory가 있어 표시엔 영향 없지만 컬럼 불변식 유지)
  await bakeMissingAutoCategories(userId);
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

