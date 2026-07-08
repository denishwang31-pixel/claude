import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import {
  getMonthlyStats,
  getCategoryStats,
  getPivotData,
  getKpiSummary,
  getAllTransactions,
  getAllTransactionsForExport,
  getCategoryTransactions,
  getAllCategories,
  updateTransactionCategory,
  resetTransactionCategory,
  getSavingsStats,
  getCategoryRules,
  upsertCategoryRule,
  deleteCategoryRule,
  updateCategoryRuleActive,
  seedDefaultRules,
  getIncomeDistribution,
  getL3Stats,
  generateRulesFromTransactions,
  applyMappingRulesToNewTransactions,
  applyRulesToAllTransactions,
  bakeRuleCategories,
  getExistingHashes,
  insertTransactions,
  setExcludedTransactions,
  clearAllExclusions,
  getUserSettings,
  saveUserSettings,
  saveDashboardMemos,
  updateTransactionMemo,
  getExcludedTransactionIds,
  deleteAllTransactions,
  categoryToRuleType,
} from "./db";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

const TransactionRowSchema = z.object({
  txDate: z.string(),
  txTime: z.string(),
  txType: z.string(),
  category: z.string(),
  subCategory: z.string(),
  content: z.string(),
  amount: z.number(),
  currency: z.string(),
  paymentMethod: z.string(),
  memo: z.string(),
  dedupHash: z.string(),
});

const budgetRouter = router({
  // ── 진단 (화면에서 원인 확인용) ──────────────────────────────
  diagnostics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const version = "rulecat-v2";
    if (!db) {
      return { version, dbConnected: false, txCount: 0, ruleCount: 0, timings: {} as Record<string, number> };
    }
    const time = async (fn: () => Promise<unknown>) => {
      const s = Date.now();
      try { await fn(); } catch { /* 측정만 */ }
      return Date.now() - s;
    };
    const txRow = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM transactions WHERE "userId" = ${ctx.user.id}`)) as any[];
    const ruleRow = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM category_rules WHERE "userId" = ${ctx.user.id}`)) as any[];
    const timings = {
      getKpiSummary: await time(() => getKpiSummary(ctx.user.id, false, [], [])),
      getCategoryStats: await time(() => getCategoryStats(ctx.user.id, false, [], [])),
      getPivotData: await time(() => getPivotData(ctx.user.id, false, [], [])),
    };
    return {
      version,
      dbConnected: true,
      txCount: Number(txRow[0]?.c ?? 0),
      ruleCount: Number(ruleRow[0]?.c ?? 0),
      timings,
    };
  }),

  // ── 업로드 ──────────────────────────────────────────────────
  uploadTransactions: protectedProcedure
    .input(
      z.object({
        rows: z.array(TransactionRowSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // DB가 꺼져있으면 이후 함수들이 조용히 0건/빈 값을 반환해
      // "업로드 성공"처럼 보이는 거짓 성공 응답이 나간다 — 명확한
      // 에러로 실패시켜 사용자가 원인(DB 미실행)을 바로 알 수 있게 한다.
      const dbCheck = await getDb();
      if (!dbCheck) {
        throw new Error("데이터베이스에 연결할 수 없습니다. PostgreSQL이 실행 중인지 확인해주세요.");
      }

      const hashes = input.rows.map((r) => r.dedupHash);
      const existingHashes = await getExistingHashes(userId, hashes);
      const newRows = input.rows.filter((r) => !existingHashes.has(r.dedupHash));

      if (newRows.length === 0) return { inserted: 0, skipped: input.rows.length, autoExcluded: 0 };

      const dbRows = newRows.map((r) => ({
        userId,
        txDate: r.txDate,
        txTime: r.txTime,
        txType: r.txType,
        category: r.category,
        subCategory: r.subCategory,
        content: r.content,
        amount: String(r.amount),
        currency: r.currency,
        paymentMethod: r.paymentMethod,
        memo: r.memo,
        dedupHash: r.dedupHash,
      }));

      const insertedCount = await insertTransactions(dbRows);

      // Apply mapping rules to newly inserted transactions
      await applyMappingRulesToNewTransactions(userId, newRows.map((r) => r.dedupHash));

      // 이체 일괄 제외 안 함 — 부호(입출금)와 뱅크샐러드 대분류 매핑으로 분류.
      // 내계좌이체/카드대금은 매핑상 '이체'로 통계에서 자동 제외됨.
      return { inserted: insertedCount, skipped: input.rows.length - insertedCount, autoExcluded: 0 };
    }),

  // ── 데이터 전체 삭제 ─────────────────────────────────────────
  deleteAllTransactions: protectedProcedure.mutation(async ({ ctx }) => {
    const deleted = await deleteAllTransactions(ctx.user.id);
    return { deleted };
  }),

  // ── 현재 사용자 ──────────────────────────────────────────────
  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ?? null;
  }),

  // ── 사용자 설정 ──────────────────────────────────────────────
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    return getUserSettings(ctx.user.id);
  }),

  saveDashboardMemos: protectedProcedure
    .input(z.object({ memos: z.record(z.string(), z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await saveDashboardMemos(ctx.user.id, input.memos);
      return { success: true };
    }),

  updateMemo: protectedProcedure
    .input(z.object({ transactionId: z.number().int(), memo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await updateTransactionMemo(ctx.user.id, input.transactionId, input.memo);
      return { success: true };
    }),

  saveSettings: protectedProcedure
    .input(
      z.object({
        excludedCategories: z.array(z.string()),
        includeTransfer: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await saveUserSettings(ctx.user.id, input.excludedCategories, input.includeTransfer);
      return { success: true };
    }),

  // ── KPI ──────────────────────────────────────────────────────
  getKpiSummary: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
      })
    )
    .query(async ({ ctx, input }) => {
      return getKpiSummary(ctx.user.id, input.includeTransfer, input.excludedCategories, []);
    }),

  // ── 월별 통계 ────────────────────────────────────────────────
  getMonthlyStats: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
      })
    )
    .query(async ({ ctx, input }) => {
      return getMonthlyStats(ctx.user.id, input.includeTransfer, input.excludedCategories, []);
    }),

  // ── 카테고리별 통계 ──────────────────────────────────────────
  getCategoryStats: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
        yearMonth: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getCategoryStats(ctx.user.id, input.includeTransfer, input.excludedCategories, [], input.yearMonth);
    }),

  // ── 피벗 데이터 ──────────────────────────────────────────────
  getPivotData: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
      })
    )
    .query(async ({ ctx, input }) => {
      return getPivotData(ctx.user.id, input.includeTransfer, input.excludedCategories, []);
    }),

  // ── 저축/투자 통계 ───────────────────────────────────────────
  getSavingsStats: protectedProcedure.query(async ({ ctx }) => {
    return getSavingsStats(ctx.user.id);
  }),

  // ── 전체 내역 ────────────────────────────────────────────────
  getTransactions: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(200).default(50),
        filter: z.object({ field: z.string(), query: z.string() }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { rows, total, excludedIds } = await getAllTransactions(
        ctx.user.id,
        input.page,
        input.pageSize,
        input.filter
      );
      return {
        rows,
        total,
        excludedIds: Array.from(excludedIds),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ── 카테고리별 드릴다운 ──────────────────────────────────────
  getCategoryTransactions: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(200).default(50),
        yearMonth: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getCategoryTransactions(
        ctx.user.id,
        input.category,
        input.page,
        input.pageSize,
        input.yearMonth
      );
    }),

  // ── 엑셀 다운로드용 전체 내역 ────────────────────────────────
  getAllTransactionsForExport: protectedProcedure.query(async ({ ctx }) => {
    const [rows, excludedIds] = await Promise.all([
      getAllTransactionsForExport(ctx.user.id),
      getExcludedTransactionIds(ctx.user.id),
    ]);
    return { rows, excludedIds: Array.from(excludedIds) };
  }),

  // ── 모든 카테고리 목록 ───────────────────────────────────────
  getAllCategories: protectedProcedure.query(async ({ ctx }) => {
    return getAllCategories(ctx.user.id);
  }),

  // ── 카테고리 수정 ────────────────────────────────────────────
  updateCategory: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int(),
        newCategory: z.string().min(1),
        saveAsRule: z.boolean().default(false),
        applyToSame: z.boolean().default(true),
        keyword: z.string().optional(),
        isExact: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      // 같은 내역(content)을 가진 모든 거래의 카테고리를 한 번에 변경
      if (input.keyword && input.applyToSame && db) {
        await db.execute(
          sql`UPDATE transactions SET "customCategory" = ${input.newCategory} WHERE "userId" = ${ctx.user.id} AND content = ${input.keyword}`
        );
      } else {
        await updateTransactionCategory(ctx.user.id, input.transactionId, input.newCategory);
      }

      // 매핑 규칙 생성/업데이트 (실시간 반영) — 사용자가 체크한 경우에만
      if (input.keyword && input.saveAsRule) {
        try {
          const ruleType = categoryToRuleType(input.newCategory);
          await upsertCategoryRule(ctx.user.id, input.keyword, input.newCategory, input.isExact, ruleType);
          // 새 규칙을 다른 기존 거래에도 반영
          await bakeRuleCategories(ctx.user.id);
        } catch (e) {
          console.warn("[updateCategory] Rule upsert failed:", e);
        }
      }

      // 사용자가 직접 카테고리를 지정하면 "집계 대상"으로 보고 제외를 해제
      if (db) {
        await db.execute(sql.raw(
          `DELETE FROM excluded_transactions WHERE "userId" = ${ctx.user.id} AND "transactionId" = ${input.transactionId}`
        ));
      }

      return { success: true };
    }),

  // ── 카테고리 수정 초기화 ─────────────────────────────────────
  resetCategory: protectedProcedure
    .input(z.object({ transactionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await resetTransactionCategory(ctx.user.id, input.transactionId);
      return { success: true };
    }),

  // ── 제외 거래 토글 ───────────────────────────────────────────
  toggleExcluded: protectedProcedure
    .input(
      z.object({
        transactionIds: z.array(z.number().int()),
        excluded: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await setExcludedTransactions(ctx.user.id, input.transactionIds, input.excluded);
      return { success: true };
    }),

  // ── 제외 전체 해제 ───────────────────────────────────────────
  clearAllExclusions: protectedProcedure.mutation(async ({ ctx }) => {
    const cleared = await clearAllExclusions(ctx.user.id);
    return { cleared };
  }),

  // ── 카테고리 매핑 규칙 ───────────────────────────────────────
  getCategoryRules: protectedProcedure.query(async ({ ctx }) => {
    return getCategoryRules(ctx.user.id);
  }),

  addCategoryRule: protectedProcedure
    .input(
      z.object({
        keyword: z.string().min(1),
        category: z.string().min(1),
        isExact: z.boolean().default(false),
        ruleType: z.string().default("expense"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertCategoryRule(ctx.user.id, input.keyword, input.category, input.isExact, input.ruleType);
      // 규칙 변경 결과를 기존 거래의 ruleCategory에 즉시 반영
      await bakeRuleCategories(ctx.user.id);
      return { success: true };
    }),

  deleteCategoryRule: protectedProcedure
    .input(z.object({ ruleId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCategoryRule(ctx.user.id, input.ruleId);
      await bakeRuleCategories(ctx.user.id);
      return { success: true };
    }),

  updateRuleActive: protectedProcedure
    .input(z.object({ ruleId: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateCategoryRuleActive(ctx.user.id, input.ruleId, input.isActive);
      await bakeRuleCategories(ctx.user.id);
      return { success: true };
    }),

  seedDefaultRules: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await seedDefaultRules(ctx.user.id);
      await bakeRuleCategories(ctx.user.id);
      return { count };
    }),

  generateRulesFromTransactions: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await generateRulesFromTransactions(ctx.user.id);
      await bakeRuleCategories(ctx.user.id);
      return { count };
    }),

  applyRulesToAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await applyRulesToAllTransactions(ctx.user.id);
      return { count };
    }),

  getIncomeDistribution: protectedProcedure.query(async ({ ctx }) => {
    return getIncomeDistribution(ctx.user.id);
  }),

  getL3Stats: protectedProcedure
    .input(z.object({ category: z.string(), yearMonth: z.string().optional(), direction: z.enum(["income", "expense"]).optional() }))
    .query(async ({ ctx, input }) => {
      return getL3Stats(ctx.user.id, input.category, input.yearMonth, input.direction);
    }),
});

export const appRouter = router({
  system: systemRouter,
  budget: budgetRouter,
});

export type AppRouter = typeof appRouter;
