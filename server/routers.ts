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
  bakeMissingAutoCategories,
  setExcludedTransactions,
  clearAllExclusions,
  getUserSettings,
  saveUserSettings,
  saveDashboardMemos,
  updateTransactionMemo,
  getExcludedTransactionIds,
  deleteAllTransactions,
  resetAllData,
  deleteTransaction,
  updateCategoryBulkByIds,
  addManualTransaction,
  setExcludedByFilters,
  getFilterOptions,
  autoExcludeTransfersForHashes,
  runAutoExclusions,
  categoryToRuleType,
  getBudgetStatus,
  setBudget,
  deleteBudget,
  detectNewBudgetAlerts,
  getSubscriptions,
  getAccounts,
  setAccountHidden,
  getGroupInfo,
  createGroup,
  joinGroup,
  leaveGroup,
} from "./db";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

// 날짜 관련 입력은 raw SQL 에 들어가므로 형식을 강제한다(SQL 인젝션 이중 방어).
const zYearMonth = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM 형식이어야 합니다");
const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");

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
    const txRow = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM transactions WHERE "userId" = ${ctx.dataUserId}`)) as any[];
    const ruleRow = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM category_rules WHERE "userId" = ${ctx.dataUserId}`)) as any[];
    const timings = {
      getKpiSummary: await time(() => getKpiSummary(ctx.dataUserId, false, [], [])),
      getCategoryStats: await time(() => getCategoryStats(ctx.dataUserId, false, [], [])),
      getPivotData: await time(() => getPivotData(ctx.dataUserId, false, [], [])),
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
        owner: z.enum(["동현", "혜진"]),
        // 여러 청크로 나눠 올릴 때, 전체 재검사(runAutoExclusions)는 마지막 청크에서만.
        finalize: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.dataUserId;

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
        owner: input.owner,
        dedupHash: r.dedupHash,
      }));

      const insertedCount = await insertTransactions(dbRows);

      // 자동분류(뱅크샐러드/키워드) 결과를 autoCategory 컬럼에 굳힌다(새 행만).
      await bakeMissingAutoCategories(userId);

      // Apply mapping rules to newly inserted transactions
      const newHashes = newRows.map((r) => r.dedupHash);
      await applyMappingRulesToNewTransactions(userId, newHashes);

      // 1) 이체성 원본(내계좌이체·카드대금 등)은 제외 체크박스 자동 체크 (청크마다 OK — 해시 한정)
      const autoExcluded = await autoExcludeTransfersForHashes(userId, newHashes);
      // 2) 전체 데이터 재검사: 상호이체 상쇄(±5분)·카드 취소 쌍 자동 제외 (전체 스캔 →
      //    마지막 청크에서 한 번만 실행해 대량 업로드 성능 저하를 막는다)
      const pairs = input.finalize
        ? await runAutoExclusions(userId)
        : { transferPairs: 0, cardPairs: 0 };

      return {
        inserted: insertedCount,
        skipped: input.rows.length - insertedCount,
        autoExcluded,
        transferPairs: pairs.transferPairs,
        cardPairs: pairs.cardPairs,
      };
    }),

  // ── 데이터 전체 삭제 ─────────────────────────────────────────
  deleteAllTransactions: protectedProcedure.mutation(async ({ ctx }) => {
    const deleted = await deleteAllTransactions(ctx.dataUserId);
    return { deleted };
  }),

  // ── 전체 리셋 (거래·규칙·제외·설정 모두 삭제) ───────────────
  resetAllData: protectedProcedure.mutation(async ({ ctx }) => {
    return resetAllData(ctx.dataUserId);
  }),

  // ── 선택 거래 카테고리 일괄 변경 ─────────────────────────────
  updateCategoryBulk: protectedProcedure
    .input(z.object({
      transactionIds: z.array(z.number().int()).min(1),
      newCategory: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await updateCategoryBulkByIds(ctx.dataUserId, input.transactionIds, input.newCategory);
      return { count };
    }),

  // ── 거래 1건 삭제 ────────────────────────────────────────────
  deleteTransaction: protectedProcedure
    .input(z.object({ transactionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteTransaction(ctx.dataUserId, input.transactionId);
      return { ok };
    }),

  // ── 수기 입력 추가 ───────────────────────────────────────────
  addTransaction: protectedProcedure
    .input(
      z.object({
        txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        txTime: z.string().optional(),
        txType: z.enum(["수입", "지출"]),
        category: z.string().min(1),
        content: z.string().min(1),
        amount: z.number(),
        paymentMethod: z.enum(["카드", "이체", "현금"]),
        memo: z.string().optional(),
        owner: z.enum(["동현", "혜진"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await addManualTransaction(ctx.dataUserId, input);
      return { id };
    }),

  // ── 검색결과 일괄 제외/해제 (페이지 무관 전체 매칭 대상) ─────
  setExcludedByFilters: protectedProcedure
    .input(
      z.object({
        filters: z.array(z.object({ field: z.string(), query: z.string() })).default([]),
        owner: z.string().optional(),
        excluded: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const count = await setExcludedByFilters(ctx.dataUserId, input.filters, input.owner, input.excluded);
      return { count };
    }),

  // ── 자동 제외 검사 (상호이체 상쇄 ±5분 · 카드 취소 쌍) ───────
  runAutoExclusions: protectedProcedure.mutation(async ({ ctx }) => {
    return runAutoExclusions(ctx.dataUserId);
  }),

  // ── 컬럼 필터 옵션 (고유값 목록) ─────────────────────────────
  getFilterOptions: protectedProcedure.query(async ({ ctx }) => {
    return getFilterOptions(ctx.dataUserId);
  }),

  // ── 현재 사용자 ──────────────────────────────────────────────
  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ?? null;
  }),

  // ── 사용자 설정 ──────────────────────────────────────────────
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    return getUserSettings(ctx.dataUserId);
  }),

  saveDashboardMemos: protectedProcedure
    .input(z.object({ memos: z.record(z.string(), z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await saveDashboardMemos(ctx.dataUserId, input.memos);
      return { success: true };
    }),

  updateMemo: protectedProcedure
    .input(z.object({ transactionId: z.number().int(), memo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await updateTransactionMemo(ctx.dataUserId, input.transactionId, input.memo);
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
      await saveUserSettings(ctx.dataUserId, input.excludedCategories, input.includeTransfer);
      return { success: true };
    }),

  // ── KPI ──────────────────────────────────────────────────────
  getKpiSummary: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
        dateStart: zDate.optional(),
        dateEnd: zDate.optional(),
        owner: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getKpiSummary(ctx.dataUserId, input.includeTransfer, input.excludedCategories, [], input.dateStart, input.dateEnd, input.owner);
    }),

  // ── 월별 통계 ────────────────────────────────────────────────
  getMonthlyStats: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
        owner: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getMonthlyStats(ctx.dataUserId, input.includeTransfer, input.excludedCategories, [], input.owner);
    }),

  // ── 카테고리별 통계 ──────────────────────────────────────────
  getCategoryStats: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
        yearMonth: zYearMonth.optional(),
        dateStart: zDate.optional(),
        dateEnd: zDate.optional(),
        owner: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getCategoryStats(ctx.dataUserId, input.includeTransfer, input.excludedCategories, [], input.yearMonth, input.dateStart, input.dateEnd, input.owner);
    }),

  // ── 피벗 데이터 ──────────────────────────────────────────────
  getPivotData: protectedProcedure
    .input(
      z.object({
        includeTransfer: z.boolean().default(false),
        excludedCategories: z.array(z.string()).default([]),
        dateStart: zDate.optional(),
        dateEnd: zDate.optional(),
        owner: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getPivotData(ctx.dataUserId, input.includeTransfer, input.excludedCategories, [], input.dateStart, input.dateEnd, input.owner);
    }),

  // ── 저축/투자 통계 ───────────────────────────────────────────
  getSavingsStats: protectedProcedure.query(async ({ ctx }) => {
    return getSavingsStats(ctx.dataUserId);
  }),

  // ── 전체 내역 ────────────────────────────────────────────────
  getTransactions: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(200).default(50),
        filter: z.object({ field: z.string(), query: z.string() }).optional(),
        filters: z.array(z.object({ field: z.string(), query: z.string() })).optional(),
        owner: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const allFilters = [
        ...(input.filter ? [input.filter] : []),
        ...(input.filters ?? []),
      ];
      const { rows, total, excludedIds } = await getAllTransactions(
        ctx.dataUserId,
        input.page,
        input.pageSize,
        allFilters,
        input.owner
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
        yearMonth: zYearMonth.optional(),
        dateStart: zDate.optional(),
        dateEnd: zDate.optional(),
        owner: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getCategoryTransactions(
        ctx.dataUserId,
        input.category,
        input.page,
        input.pageSize,
        input.yearMonth,
        input.dateStart,
        input.dateEnd,
        input.owner
      );
    }),

  // ── 엑셀 다운로드용 전체 내역 ────────────────────────────────
  getAllTransactionsForExport: protectedProcedure.query(async ({ ctx }) => {
    const [rows, excludedIds] = await Promise.all([
      getAllTransactionsForExport(ctx.dataUserId),
      getExcludedTransactionIds(ctx.dataUserId),
    ]);
    return { rows, excludedIds: Array.from(excludedIds) };
  }),

  // ── 모든 카테고리 목록 ───────────────────────────────────────
  getAllCategories: protectedProcedure.query(async ({ ctx }) => {
    return getAllCategories(ctx.dataUserId);
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

      // 같은 내역(content)의 "이 거래와 그 이전(과거)" 건만 일괄 변경.
      // 이후(더 최신) 건은 건드리지 않는다 — 같은 내역명이라도 시점에 따라
      // 분류가 달라지는 경우(예: 회사 지급이 근로소득→부가소득으로 바뀜)를
      // 지원: 최신 건부터 지정해 내려가면 구간별로 다른 카테고리가 유지된다.
      if (input.keyword && input.applyToSame && db) {
        await db.execute(sql`
          UPDATE transactions t SET "customCategory" = ${input.newCategory}
          FROM (SELECT "txDate", COALESCE("txTime",'') AS tt FROM transactions
                WHERE id = ${input.transactionId} AND "userId" = ${ctx.dataUserId}) base
          WHERE t."userId" = ${ctx.dataUserId} AND t.content = ${input.keyword}
            AND (t."txDate" < base."txDate"
                 OR (t."txDate" = base."txDate" AND COALESCE(t."txTime",'') <= base.tt))
        `);
      } else {
        await updateTransactionCategory(ctx.dataUserId, input.transactionId, input.newCategory);
      }

      // 매핑 규칙 생성/업데이트 (실시간 반영) — 사용자가 체크한 경우에만
      if (input.keyword && input.saveAsRule) {
        try {
          const ruleType = categoryToRuleType(input.newCategory);
          await upsertCategoryRule(ctx.dataUserId, input.keyword, input.newCategory, input.isExact, ruleType);
          // 새 규칙을 다른 기존 거래에도 반영
          await bakeRuleCategories(ctx.dataUserId);
        } catch (e) {
          console.warn("[updateCategory] Rule upsert failed:", e);
        }
      }

      // 사용자가 직접 카테고리를 지정하면 "집계 대상"으로 보고 제외를 해제
      if (db) {
        await db.execute(sql.raw(
          `DELETE FROM excluded_transactions WHERE "userId" = ${ctx.dataUserId} AND "transactionId" = ${input.transactionId}`
        ));
      }

      return { success: true };
    }),

  // ── 카테고리 수정 초기화 ─────────────────────────────────────
  resetCategory: protectedProcedure
    .input(z.object({ transactionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await resetTransactionCategory(ctx.dataUserId, input.transactionId);
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
      await setExcludedTransactions(ctx.dataUserId, input.transactionIds, input.excluded);
      return { success: true };
    }),

  // ── 제외 전체 해제 ───────────────────────────────────────────
  clearAllExclusions: protectedProcedure.mutation(async ({ ctx }) => {
    const cleared = await clearAllExclusions(ctx.dataUserId);
    return { cleared };
  }),

  // ── 카테고리 매핑 규칙 ───────────────────────────────────────
  getCategoryRules: protectedProcedure.query(async ({ ctx }) => {
    return getCategoryRules(ctx.dataUserId);
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
      await upsertCategoryRule(ctx.dataUserId, input.keyword, input.category, input.isExact, input.ruleType);
      // 규칙 변경 결과를 기존 거래의 ruleCategory에 즉시 반영
      await bakeRuleCategories(ctx.dataUserId);
      return { success: true };
    }),

  deleteCategoryRule: protectedProcedure
    .input(z.object({ ruleId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCategoryRule(ctx.dataUserId, input.ruleId);
      await bakeRuleCategories(ctx.dataUserId);
      return { success: true };
    }),

  updateRuleActive: protectedProcedure
    .input(z.object({ ruleId: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateCategoryRuleActive(ctx.dataUserId, input.ruleId, input.isActive);
      await bakeRuleCategories(ctx.dataUserId);
      return { success: true };
    }),

  seedDefaultRules: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await seedDefaultRules(ctx.dataUserId);
      await bakeRuleCategories(ctx.dataUserId);
      return { count };
    }),

  generateRulesFromTransactions: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await generateRulesFromTransactions(ctx.dataUserId);
      await bakeRuleCategories(ctx.dataUserId);
      return { count };
    }),

  applyRulesToAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await applyRulesToAllTransactions(ctx.dataUserId);
      return { count };
    }),

  getIncomeDistribution: protectedProcedure.query(async ({ ctx }) => {
    return getIncomeDistribution(ctx.dataUserId);
  }),

  getL3Stats: protectedProcedure
    .input(z.object({ category: z.string(), yearMonth: zYearMonth.optional(), direction: z.enum(["income", "expense"]).optional(), dateStart: zDate.optional(), dateEnd: zDate.optional(), owner: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return getL3Stats(ctx.dataUserId, input.category, input.yearMonth, input.direction, input.dateStart, input.dateEnd, input.owner);
    }),

  // ── 예산 목표 & 알림 ─────────────────────────────────────────
  getBudgets: protectedProcedure
    .input(z.object({ yearMonth: zYearMonth }))
    .query(async ({ ctx, input }) => getBudgetStatus(ctx.dataUserId, input.yearMonth)),

  setBudget: protectedProcedure
    .input(z.object({ category: z.string().min(1), targetAmount: z.number().nonnegative() }))
    .mutation(async ({ ctx, input }) => {
      await setBudget(ctx.dataUserId, input.category, input.targetAmount);
      return { ok: true };
    }),

  deleteBudget: protectedProcedure
    .input(z.object({ category: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await deleteBudget(ctx.dataUserId, input.category);
      return { ok: true };
    }),

  // 이번 달 새로 넘긴 임계치 알림을 조회(+기록). 앱 진입/업로드 후 호출.
  checkBudgetAlerts: protectedProcedure
    .input(z.object({ yearMonth: zYearMonth }))
    .mutation(async ({ ctx, input }) => detectNewBudgetAlerts(ctx.dataUserId, input.yearMonth)),

  // 정기결제·구독 감지 (거래 내역 기반)
  getSubscriptions: protectedProcedure.query(async ({ ctx }) => getSubscriptions(ctx.dataUserId)),

  // ── 주간/월간 리포트 ─────────────────────────────────────────
  // 기간(현재/직전)을 클라이언트가 로컬 기준으로 계산해 전달 → 기존 집계 재사용.
  getReport: protectedProcedure
    .input(z.object({
      curStart: zDate, curEnd: zDate,
      prevStart: zDate, prevEnd: zDate,
    }))
    .query(async ({ ctx, input }) => {
      const uid = ctx.dataUserId;
      const cur = await getKpiSummary(uid, false, [], [], input.curStart, input.curEnd);
      const prev = await getKpiSummary(uid, false, [], [], input.prevStart, input.prevEnd);
      const cats = await getCategoryStats(uid, false, [], [], undefined, input.curStart, input.curEnd);
      const topCategories = cats
        .filter((c) => c.l1 === "expense")
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((c) => ({ category: c.category, total: c.total }));
      return {
        curExpense: cur.totalExpense,
        prevExpense: prev.totalExpense,
        curIncome: cur.totalIncome,
        curSavings: cur.totalSavings,
        topCategories,
      };
    }),

  // ── 계좌(결제수단) 표시/숨김 ──────────────────────────────────
  getAccounts: protectedProcedure.query(async ({ ctx }) => getAccounts(ctx.dataUserId)),
  setAccountHidden: protectedProcedure
    .input(z.object({ paymentMethod: z.string().min(1), hidden: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setAccountHidden(ctx.dataUserId, input.paymentMethod, input.hidden);
      return { ok: true };
    }),

  // ── 가족 공유 그룹 (신원 기준 = 실제 사용자 id) ───────────────
  getGroup: protectedProcedure.query(async ({ ctx }) => getGroupInfo(ctx.user.id)),
  createGroup: protectedProcedure.mutation(async ({ ctx }) => createGroup(ctx.user.id)),
  joinGroup: protectedProcedure
    .input(z.object({ inviteCode: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => joinGroup(ctx.user.id, input.inviteCode)),
  leaveGroup: protectedProcedure.mutation(async ({ ctx }) => {
    await leaveGroup(ctx.user.id);
    return { ok: true };
  }),
});

export const appRouter = router({
  system: systemRouter,
  budget: budgetRouter,
});

export type AppRouter = typeof appRouter;
