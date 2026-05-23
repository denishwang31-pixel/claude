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
  applyMappingRulesToNewTransactions,
  getExistingHashes,
  insertTransactions,
  setExcludedTransactions,
  getUserSettings,
  saveUserSettings,
  getExcludedTransactionIds,
  deleteAllTransactions,
  SAVINGS_CATS,
  TRANSFER_CATS,
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

      // Auto-exclude transfer items — but NOT savings/investment items
      const db = await getDb();
      if (db) {
        const hashList = newRows.map((r) => `'${r.dedupHash.replace(/'/g, "''")}'`).join(", ");

        // Get IDs of inserted transactions
        const insertedRows = await db.execute(sql.raw(
          `SELECT id, category, "customCategory", "txType", "paymentMethod" FROM transactions
           WHERE "userId" = ${userId} AND "dedupHash" IN (${hashList})`
        ));
        const insertedArr = insertedRows as any[];

        // Auto-exclude: transfers and card payments, but skip savings/investment
        const toExclude: number[] = [];
        for (const row of insertedArr) {
          const effectiveCat = row.customCategory ?? row.category;
          if (SAVINGS_CATS.includes(effectiveCat)) continue; // never auto-exclude savings

          const isTransferType = row.txType === "이체";
          const isTransferCat = TRANSFER_CATS.includes(effectiveCat);
          if (isTransferType || isTransferCat) {
            toExclude.push(Number(row.id));
          }
        }

        if (toExclude.length > 0) {
          await setExcludedTransactions(userId, toExclude, true);
        }

        // Also remove from excluded any items that mapped to savings/investment
        await db.execute(sql.raw(
          `DELETE FROM excluded_transactions et
           USING transactions t
           WHERE et."transactionId" = t.id
             AND et."userId" = ${userId}
             AND COALESCE(t."customCategory", t.category) IN ('저축', '투자')
             AND t."dedupHash" IN (${hashList})`
        ));

        return {
          inserted: newRows.length,
          skipped: input.rows.length - newRows.length,
          autoExcluded: toExclude.length,
        };
      }

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
      })
    )
    .query(async ({ ctx, input }) => {
      const { rows, total, excludedIds } = await getAllTransactions(
        ctx.user.id,
        input.page,
        input.pageSize
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
        await upsertCategoryRule(ctx.user.id, input.keyword, input.newCategory, input.isExact);
      }

      // If new category is savings/investment, remove from excluded_transactions
      const db = await getDb();
      if (db && SAVINGS_CATS.includes(input.newCategory)) {
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertCategoryRule(ctx.user.id, input.keyword, input.category, input.isExact);
      return { success: true };
    }),

  deleteCategoryRule: protectedProcedure
    .input(z.object({ ruleId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCategoryRule(ctx.user.id, input.ruleId);
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  budget: budgetRouter,
});

export type AppRouter = typeof appRouter;
