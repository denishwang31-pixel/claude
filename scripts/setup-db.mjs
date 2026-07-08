// Node-based DB setup — no psql.exe needed (works wherever PostgreSQL is installed).
// Ensures the "budget" role + "household_budget" database + tables exist.
// Messages are ASCII English so they render under any console codepage.
import postgres from "postgres";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const initSql = readFileSync(path.join(__dirname, "..", "drizzle", "init_pg.sql"), "utf8");

async function ensureTablesAndConnect() {
  const app = postgres({
    host: "localhost", port: 5432, user: "budget", password: "budget123",
    database: "household_budget", connect_timeout: 8, onnotice: () => {},
  });
  try {
    await app.unsafe(initSql); // create tables (idempotent)
    await app`SELECT 1`;
    await app.end();
    return true;
  } catch {
    try { await app.end(); } catch {}
    return false;
  }
}

console.log("Checking household-budget database...");

if (await ensureTablesAndConnect()) {
  console.log("[OK] Database is ready.");
  process.exit(0);
}

console.log("");
console.log("The 'budget' database account does not exist yet. Creating it now.");
console.log("Enter the PostgreSQL admin (postgres) password you set during install.");
const rl = readline.createInterface({ input: stdin, output: stdout });
const pw = await rl.question("postgres password: ");
rl.close();

const admin = postgres({
  host: "localhost", port: 5432, user: "postgres", password: pw,
  database: "postgres", connect_timeout: 8, onnotice: () => {},
});
try {
  const [{ exists }] = await admin`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='budget') AS exists`;
  if (exists) await admin.unsafe("ALTER ROLE budget WITH LOGIN PASSWORD 'budget123'");
  else await admin.unsafe("CREATE ROLE budget WITH LOGIN PASSWORD 'budget123'");
  const dbs = await admin`SELECT 1 FROM pg_database WHERE datname='household_budget'`;
  if (dbs.length === 0) await admin.unsafe("CREATE DATABASE household_budget OWNER budget");
  await admin.unsafe("GRANT ALL PRIVILEGES ON DATABASE household_budget TO budget");
  await admin.end();
} catch (e) {
  console.error("");
  console.error("[FAILED] " + (e && e.message ? e.message : e));
  console.error("-> The postgres admin password was likely wrong. Try again, or ask for help resetting it.");
  try { await admin.end(); } catch {}
  process.exit(1);
}

if (await ensureTablesAndConnect()) {
  console.log("");
  console.log("[DONE] Database setup complete.");
  process.exit(0);
} else {
  console.error("[FAILED] Created the account but could not connect afterwards.");
  process.exit(1);
}
