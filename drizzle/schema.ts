import {
  bigserial,
  date,
  decimal,
  integer,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // 소셜: "kakao:<id>" / "google:<sub>" / "naver:<id>", 이메일: "email:<email>"
  openId: varchar("openId", { length: 255 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  // 이메일 로그인 전용 — 소셜 로그인 계정은 NULL. scrypt$salt$hash 형식.
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const transactions = pgTable("transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("userId").notNull(),
  txDate: date("txDate").notNull(),
  txTime: varchar("txTime", { length: 8 }),
  txType: varchar("txType", { length: 16 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  customCategory: varchar("customCategory", { length: 64 }),
  // 매핑 규칙 매칭 결과를 저장(materialize)하는 컬럼. 읽기 시점에 규칙
  // 테이블을 행마다 훑는 상관 서브쿼리를 없애기 위한 것 — 규칙이 바뀔
  // 때만 bakeRuleCategories로 갱신한다. 우선순위: customCategory(수동) >
  // ruleCategory(규칙) > 뱅크샐러드 매핑 > 원본.
  ruleCategory: varchar("ruleCategory", { length: 64 }),
  subCategory: varchar("subCategory", { length: 64 }),
  content: varchar("content", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("KRW"),
  paymentMethod: varchar("paymentMethod", { length: 128 }),
  memo: text("memo"),
  // 데이터 소유자 (동현/혜진) — 업로드/수기입력 시 지정, 화면 전체 필터에 사용
  owner: varchar("owner", { length: 16 }),
  dedupHash: varchar("dedupHash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  excludedCategories: text("excludedCategories").default("[]"),
  includeTransfer: smallint("includeTransfer").default(0).notNull(),
  dashboardMemos: text("dashboardMemos").default("{}"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

export const excludedTransactions = pgTable("excluded_transactions", {
  userId: integer("userId").notNull(),
  transactionId: integer("transactionId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 가족 공유 그룹. 멤버는 소유자(ownerUserId)의 데이터셋을 함께 사용한다.
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  inviteCode: varchar("inviteCode", { length: 16 }).notNull().unique(),
  ownerUserId: integer("ownerUserId").notNull(),
  name: varchar("name", { length: 64 }),
  inviteCodeExpiresAt: timestamp("inviteCodeExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const groupMembers = pgTable("group_members", {
  groupId: integer("groupId").notNull(),
  userId: integer("userId").notNull().unique(),
  role: varchar("role", { length: 16 }).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

// 숨긴 계좌(결제수단) — 집계/목록에서 제외.
export const hiddenAccounts = pgTable(
  "hidden_accounts",
  {
    userId: integer("userId").notNull(),
    paymentMethod: varchar("paymentMethod", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ uq: unique().on(t.userId, t.paymentMethod) })
);

// 카테고리별 월 예산 목표 (매월 반복 적용). category = 앱 L3 키.
export const budgets = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    targetAmount: decimal("targetAmount", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({ uq: unique().on(t.userId, t.category) })
);

export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = typeof budgets.$inferInsert;

// 예산 임계치(50/80/90/100%) 알림 발송 기록 — 같은 달·카테고리·임계치는 1회만 알림.
export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    yearMonth: varchar("yearMonth", { length: 7 }).notNull(), // 'YYYY-MM'
    threshold: integer("threshold").notNull(), // 50 / 80 / 90 / 100
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ uq: unique().on(t.userId, t.category, t.yearMonth, t.threshold) })
);

export const categoryRules = pgTable("category_rules", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  isExact: integer("isExact").default(0).notNull(),
  ruleType: varchar("ruleType", { length: 20 }).default("expense").notNull(),
  isActive: integer("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
