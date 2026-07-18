import { sql } from "drizzle-orm";
import { getDb } from "./core";

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

