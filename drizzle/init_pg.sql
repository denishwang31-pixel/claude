-- PostgreSQL 초기화 스크립트

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
  "isExact" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", keyword)
);
