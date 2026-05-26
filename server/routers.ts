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
  getExistingHashes,
  insertTransactions,
  setExcludedTransactions,
  clearAllExclusions,
  getUserSettings,
  saveUserSettings,
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
  // ── 업로드 ──────────────────────────────────────────────────
  uploadTransactions: protectedProcedure
    .input(
      z.object({
        rows: z.array(TransactionRowSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

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

      await insertTransactions(dbRows);

      // Apply mapping rules to newly inserted transactions
      await applyMappingRulesToNewTransactions(userId, newRows.map((r) => r.dedupHash));

      // 이체 일괄 제외 안 함 — 부호(입출금)와 뱅크샐러드 대분류 매핑으로 분류.
      // 내계좌이체/카드대금은 매핑상 '이체'로 통계에서 자동 제외됨.
      return { inserted: newRows.length, skipped: input.rows.length - newRows.length, autoExcluded: 0 };
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
        keyword: z.string().optional(),
        isExact: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateTransactionCategory(ctx.user.id, input.transactionId, input.newCategory);

      if (input.saveAsRule && input.keyword) {
        try {
          const ruleType = categoryToRuleType(input.newCategory);
          await upsertCategoryRule(ctx.user.id, input.keyword, input.newCategory, input.isExact, ruleType);
        } catch (e) {
          console.warn("[updateCategory] Rule upsert failed:", e);
        }
      }

      // 사용자가 직접 카테고리를 지정하면 "집계 대상"으로 보고 제외를 해제
      // (이체로 자동 제외됐던 거래를 수입/지출 등으로 끌어올 수 있게)
      const db = await getDb();
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
      return { success: true };
    }),

  deleteCategoryRule: protectedProcedure
    .input(z.object({ ruleId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCategoryRule(ctx.user.id, input.ruleId);
      return { success: true };
    }),

  updateRuleActive: protectedProcedure
    .input(z.object({ ruleId: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateCategoryRuleActive(ctx.user.id, input.ruleId, input.isActive);
      return { success: true };
    }),

  seedDefaultRules: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await seedDefaultRules(ctx.user.id);
      return { count };
    }),

  generateRulesFromTransactions: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await generateRulesFromTransactions(ctx.user.id);
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
