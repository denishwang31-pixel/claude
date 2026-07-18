import { sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getDb } from "./core";

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

const INVITE_TTL_HOURS = 72;

export async function getGroupInfo(userId: number): Promise<{
  inGroup: boolean; isOwner: boolean; inviteCode: string | null; memberCount: number; inviteExpired: boolean;
}> {
  const db = await getDb();
  const empty = { inGroup: false, isOwner: false, inviteCode: null, memberCount: 0, inviteExpired: false };
  if (!db) return empty;
  const rows = (await db.execute(sql`
    SELECT g.id, g."ownerUserId", g."inviteCode", g."inviteCodeExpiresAt" FROM group_members m
    JOIN groups g ON g.id = m."groupId" WHERE m."userId" = ${userId} LIMIT 1
  `)) as any[];
  if (rows.length === 0) return empty;
  const g = rows[0];
  const cnt = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM group_members WHERE "groupId" = ${Number(g.id)}`)) as any[];
  const exp = g.inviteCodeExpiresAt ? new Date(g.inviteCodeExpiresAt) : null;
  return {
    inGroup: true,
    isOwner: Number(g.ownerUserId) === userId,
    inviteCode: String(g.inviteCode),
    memberCount: Number(cnt[0].c),
    inviteExpired: exp ? exp.getTime() < Date.now() : false,
  };
}

/** 동시 호출로 그룹이 중복 생성되지 않도록 userId 기준 advisory lock 안에서 처리. */
export async function createGroup(userId: number): Promise<{ inviteCode: string }> {
  const db = await getDb();
  if (!db) return { inviteCode: "" };
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    const existing = (await tx.execute(sql`
      SELECT g."inviteCode" FROM group_members m JOIN groups g ON g.id = m."groupId"
      WHERE m."userId" = ${userId} LIMIT 1
    `)) as any[];
    if (existing.length > 0) return { inviteCode: String(existing[0].inviteCode) };

    const code = randomBytes(4).toString("hex").toUpperCase(); // 8자리
    const g = (await tx.execute(sql`
      INSERT INTO groups ("inviteCode", "ownerUserId", "inviteCodeExpiresAt")
      VALUES (${code}, ${userId}, NOW() + (${INVITE_TTL_HOURS} || ' hours')::interval) RETURNING id
    `)) as any[];
    const groupId = Number(g[0].id);
    await tx.execute(sql`
      INSERT INTO group_members ("groupId", "userId", role) VALUES (${groupId}, ${userId}, 'owner')
      ON CONFLICT ("userId") DO UPDATE SET "groupId" = ${groupId}, role = 'owner'
    `);
    return { inviteCode: code };
  });
}

/** 소유자가 초대 코드를 재발급(만료 갱신). 소유자만 호출 가능. */
export async function regenerateInviteCode(userId: number): Promise<{ inviteCode: string | null; error?: string }> {
  const db = await getDb();
  if (!db) return { inviteCode: null, error: "서버 오류" };
  const rows = (await db.execute(sql`SELECT id FROM groups WHERE "ownerUserId" = ${userId} LIMIT 1`)) as any[];
  if (rows.length === 0) return { inviteCode: null, error: "소유한 그룹이 없습니다." };
  const code = randomBytes(4).toString("hex").toUpperCase();
  await db.execute(sql`
    UPDATE groups SET "inviteCode" = ${code},
      "inviteCodeExpiresAt" = NOW() + (${INVITE_TTL_HOURS} || ' hours')::interval
    WHERE id = ${Number(rows[0].id)}
  `);
  return { inviteCode: code };
}

export async function joinGroup(userId: number, inviteCode: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "서버 오류" };
  const code = inviteCode.trim().toUpperCase();

  // 내가 이미 멤버가 있는 그룹의 소유자라면, 다른 그룹 참여 시 그 멤버들이 고아가 된다 → 거부.
  const owned = (await db.execute(sql`
    SELECT (SELECT COUNT(*)::int FROM group_members m WHERE m."groupId" = g.id) AS cnt
    FROM groups g WHERE g."ownerUserId" = ${userId} LIMIT 1
  `)) as any[];
  if (owned.length > 0 && Number(owned[0].cnt) > 1) {
    return { ok: false, error: "내 그룹에 참여 중인 가족이 있어 다른 그룹에 참여할 수 없습니다. 먼저 내 그룹을 해체하세요." };
  }

  const rows = (await db.execute(sql`
    SELECT id, "ownerUserId", "inviteCodeExpiresAt" FROM groups WHERE "inviteCode" = ${code} LIMIT 1
  `)) as any[];
  if (rows.length === 0) return { ok: false, error: "초대 코드를 찾을 수 없습니다." };
  const exp = rows[0].inviteCodeExpiresAt ? new Date(rows[0].inviteCodeExpiresAt) : null;
  if (exp && exp.getTime() < Date.now()) {
    return { ok: false, error: "만료된 초대 코드입니다. 소유자에게 재발급을 요청하세요." };
  }
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

