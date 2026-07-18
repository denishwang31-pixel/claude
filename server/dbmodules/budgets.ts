import { sql } from "drizzle-orm";
import { getDb, buildEffectiveCategoryExpr } from "./core";

// ── 예산 목표 & 임계치 알림 ────────────────────────────────────
export const BUDGET_THRESHOLDS = [50, 80, 90, 100];

/** 달성률(percent)이 넘긴 임계치 목록. detectNewBudgetAlerts 의 판정 로직(테스트용). */
export function crossedThresholds(percent: number): number[] {
  return BUDGET_THRESHOLDS.filter((t) => percent >= t);
}

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

