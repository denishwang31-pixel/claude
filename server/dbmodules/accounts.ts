import { sql } from "drizzle-orm";
import { getDb } from "./core";

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

