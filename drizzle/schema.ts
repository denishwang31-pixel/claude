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
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
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
