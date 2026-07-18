import { and, eq, sql } from "drizzle-orm";
import { InsertUser, InsertUserSettings, transactions, userSettings, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "./core";

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

