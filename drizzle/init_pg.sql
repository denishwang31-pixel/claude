-- PostgreSQL 초기화 스크립트 (모든 테이블 생성, 멱등적)
-- 새 데이터베이스에서 앱이 필요로 하는 전체 스키마를 만든다.
-- 이미 있으면 건너뛰므로 매번 실행해도 안전하다.

-- 역할 enum
DO $$ BEGIN
  CREATE TYPE role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  "openId" varchar(64) NOT NULL UNIQUE,
  name text,
  email varchar(320),
  "loginMethod" varchar(64),
  role role NOT NULL DEFAULT 'user',
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW(),
  "lastSignedIn" timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id bigserial PRIMARY KEY,
  "userId" integer NOT NULL,
  "txDate" date NOT NULL,
  "txTime" varchar(8),
  "txType" varchar(16) NOT NULL,
  category varchar(64) NOT NULL,
  "customCategory" varchar(64),
  "ruleCategory" varchar(64),
  "subCategory" varchar(64),
  content varchar(255) NOT NULL,
  amount decimal(15,2) NOT NULL,
  currency varchar(8) DEFAULT 'KRW',
  "paymentMethod" varchar(128),
  memo text,
  "dedupHash" varchar(64) NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL UNIQUE,
  "excludedCategories" text DEFAULT '[]',
  "includeTransfer" smallint NOT NULL DEFAULT 0,
  "dashboardMemos" text DEFAULT '{}',
  "updatedAt" timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS excluded_transactions (
  "userId" integer NOT NULL,
  "transactionId" bigint NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId", "transactionId")
);

CREATE TABLE IF NOT EXISTS category_rules (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL,
  keyword varchar(255) NOT NULL,
  category varchar(50) NOT NULL,
  "isExact" integer NOT NULL DEFAULT 0,
  "ruleType" varchar(20) NOT NULL DEFAULT 'expense',
  "isActive" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", keyword)
);
