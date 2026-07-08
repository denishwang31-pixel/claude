import postgres from 'postgres';
const pw = process.env.HB_PGPW || '';
const SCHEMA = `
DO $$ BEGIN CREATE TYPE role AS ENUM ('user','admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, "openId" varchar(64) NOT NULL UNIQUE, name text, email varchar(320), "loginMethod" varchar(64), role role NOT NULL DEFAULT 'user', "createdAt" timestamp NOT NULL DEFAULT NOW(), "updatedAt" timestamp NOT NULL DEFAULT NOW(), "lastSignedIn" timestamp NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS transactions (id bigserial PRIMARY KEY, "userId" integer NOT NULL, "txDate" date NOT NULL, "txTime" varchar(8), "txType" varchar(16) NOT NULL, category varchar(64) NOT NULL, "customCategory" varchar(64), "ruleCategory" varchar(64), "subCategory" varchar(64), content varchar(255) NOT NULL, amount decimal(15,2) NOT NULL, currency varchar(8) DEFAULT 'KRW', "paymentMethod" varchar(128), memo text, "dedupHash" varchar(64) NOT NULL UNIQUE, "createdAt" timestamp NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS user_settings (id serial PRIMARY KEY, "userId" integer NOT NULL UNIQUE, "excludedCategories" text DEFAULT '[]', "includeTransfer" smallint NOT NULL DEFAULT 0, "dashboardMemos" text DEFAULT '{}', "updatedAt" timestamp NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS excluded_transactions ("userId" integer NOT NULL, "transactionId" bigint NOT NULL, "createdAt" timestamp NOT NULL DEFAULT NOW(), PRIMARY KEY ("userId","transactionId"));
CREATE TABLE IF NOT EXISTS category_rules (id serial PRIMARY KEY, "userId" integer NOT NULL, keyword varchar(255) NOT NULL, category varchar(50) NOT NULL, "isExact" integer NOT NULL DEFAULT 0, "ruleType" varchar(20) NOT NULL DEFAULT 'expense', "isActive" integer NOT NULL DEFAULT 1, "createdAt" timestamp NOT NULL DEFAULT NOW(), "updatedAt" timestamp NOT NULL DEFAULT NOW(), UNIQUE ("userId", keyword));
`;
async function ready() {
  const a = postgres({ host:'localhost', port:5432, user:'budget', password:'budget123', database:'household_budget', connect_timeout:8, onnotice:()=>{} });
  try { await a.unsafe(SCHEMA); await a`SELECT 1`; await a.end(); return true; }
  catch { try { await a.end(); } catch {} return false; }
}
if (await ready()) { console.log('[OK] Database is already set up. Nothing to do.'); process.exit(0); }
if (!pw) { console.log('[SETUP] Need the postgres admin password to create the account.'); process.exit(2); }
const admin = postgres({ host:'localhost', port:5432, user:'postgres', password:pw, database:'postgres', connect_timeout:8, onnotice:()=>{} });
try {
  const [{ exists }] = await admin`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='budget') AS exists`;
  if (exists) await admin.unsafe("ALTER ROLE budget WITH LOGIN PASSWORD 'budget123'");
  else await admin.unsafe("CREATE ROLE budget WITH LOGIN PASSWORD 'budget123'");
  const dbs = await admin`SELECT 1 FROM pg_database WHERE datname='household_budget'`;
  if (dbs.length === 0) await admin.unsafe("CREATE DATABASE household_budget OWNER budget");
  await admin.unsafe("GRANT ALL PRIVILEGES ON DATABASE household_budget TO budget");
  await admin.end();
} catch (e) {
  console.error('[FAILED] ' + (e && e.message ? e.message : e));
  console.error('-> The postgres admin password was likely wrong.');
  try { await admin.end(); } catch {}
  process.exit(1);
}
if (await ready()) console.log('[DONE] Setup complete! Now run the launcher.');
else { console.error('[FAILED] Created account but cannot connect.'); process.exit(1); }
