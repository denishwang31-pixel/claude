import {
  bigint,
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  tinyint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const transactions = mysqlTable("transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  txDate: date("txDate").notNull(),
  txTime: varchar("txTime", { length: 8 }),
  txType: varchar("txType", { length: 16 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  customCategory: varchar("customCategory", { length: 64 }),
  subCategory: varchar("subCategory", { length: 64 }),
  content: varchar("content", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("KRW"),
  paymentMethod: varchar("paymentMethod", { length: 128 }),
  memo: text("memo"),
  dedupHash: varchar("dedupHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  excludedCategories: text("excludedCategories").default("[]"),
  includeTransfer: tinyint("includeTransfer").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;
