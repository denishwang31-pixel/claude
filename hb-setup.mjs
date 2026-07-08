import postgres from 'postgres';
const pw = process.env.HB_PGPW || '';
const TABLES = ['users','transactions','category_rules','user_settings','excluded_transactions'];
const SCHEMA = `
DO $$ BEGIN CREATE TYPE role AS ENUM ('user','admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, "openId" varchar(64) NOT NULL UNIQUE, name text, email varchar(320), "loginMethod" varchar(64), role role NOT NULL DEFAULT 'user', "createdAt" timestamp NOT NULL DEFAULT NOW(), "updatedAt" timestamp NOT NULL DEFAULT NOW(), "lastSignedIn" timestamp NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS transactions (id bigserial PRIMARY KEY, "userId" integer NOT NULL, "txDate" date NOT NULL, "txTime" varchar(8), "txType" varchar(16) NOT NULL, category varchar(64) NOT NULL, "customCategory" varchar(64), "ruleCategory" varchar(64), "subCategory" varchar(64), content varchar(255) NOT NULL, amount decimal(15,2) NOT NULL, currency varchar(8) DEFAULT 'KRW', "paymentMethod" varchar(128), memo text, "dedupHash" varchar(64) NOT NULL UNIQUE, "createdAt" timestamp NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS user_settings (id serial PRIMARY KEY, "userId" integer NOT NULL UNIQUE, "excludedCategories" text DEFAULT '[]', "includeTransfer" smallint NOT NULL DEFAULT 0, "dashboardMemos" text DEFAULT '{}', "updatedAt" timestamp NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS excluded_transactions ("userId" integer NOT NULL, "transactionId" bigint NOT NULL, "createdAt" timestamp NOT NULL DEFAULT NOW(), PRIMARY KEY ("userId","transactionId"));
CREATE TABLE IF NOT EXISTS category_rules (id serial PRIMARY KEY, "userId" integer NOT NULL, keyword varchar(255) NOT NULL, category varchar(50) NOT NULL, "isExact" integer NOT NULL DEFAULT 0, "ruleType" varchar(20) NOT NULL DEFAULT 'expense', "isActive" integer NOT NULL DEFAULT 1, "createdAt" timestamp NOT NULL DEFAULT NOW(), "updatedAt" timestamp NOT NULL DEFAULT NOW(), UNIQUE ("userId", keyword));
`;

let lastError = null;

// budget 계정이 "실제로 모든 테이블을 읽을 수 있는지" 확인한다.
// (예전엔 접속만 확인해서, 테이블이 postgres 소유라 접근 불가여도 정상으로
//  오판하고 소유권 이전을 건너뛰는 버그가 있었다.)
async function budgetCanAccess() {
  const a = postgres({ host:'localhost', port:5432, user:'budget', password:'budget123', database:'household_budget', connect_timeout:8, onnotice:()=>{} });
  try {
    for (const t of TABLES) await a.unsafe('SELECT 1 FROM ' + t + ' LIMIT 1');
    await a.end();
    return true;
  } catch (e) { lastError = e; try { await a.end(); } catch {} return false; }
}

if (await budgetCanAccess()) { console.log('[OK] Database is already set up. Nothing to do.'); process.exit(0); }
if (!pw) { console.log('[SETUP] Need the postgres admin password to create/repair the account.'); process.exit(2); }

// 1) 관리자로 롤 + DB 생성 (없을 때만)
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

// 2) 관리자로 household_budget에 접속: 스키마/테이블/소유권을 budget에 맞춘다.
//    - public 스키마 소유/권한 부여
//    - 없는 테이블 생성 (이 시점엔 postgres 소유로 생길 수 있음)
//    - 그 다음 모든 테이블/시퀀스/타입 소유권을 budget으로 이전 (기존+신규 모두)
//    - ruleCategory 칼럼 보강
const adminDb = postgres({ host:'localhost', port:5432, user:'postgres', password:pw, database:'household_budget', connect_timeout:8, onnotice:()=>{} });
try {
  await adminDb.unsafe("ALTER SCHEMA public OWNER TO budget").catch(() => {});
  await adminDb.unsafe("GRANT ALL ON SCHEMA public TO budget").catch(() => {});
  await adminDb.unsafe(SCHEMA);
  await adminDb.unsafe(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO budget';
      END LOOP;
      FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='public' LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequencename) || ' OWNER TO budget';
      END LOOP;
      BEGIN EXECUTE 'ALTER TYPE public.role OWNER TO budget'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END $$;
  `);
  await adminDb.unsafe('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "ruleCategory" varchar(64)').catch(() => {});
  await adminDb.end();
} catch (e) {
  console.error('[warn] schema/ownership adjust: ' + (e && e.message ? e.message : e));
  try { await adminDb.end(); } catch {}
}

if (await budgetCanAccess()) {
  console.log('[DONE] Setup complete! Now run the launcher.');
} else {
  console.error('[FAILED] Created account but budget still cannot access tables.');
  console.error('Reason: ' + (lastError && lastError.message ? lastError.message : 'unknown'));
  process.exit(1);
}
