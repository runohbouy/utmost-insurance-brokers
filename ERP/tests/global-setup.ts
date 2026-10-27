import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

// Builds the test database once and caches it. Every test file then gets a
// private copy (see helpers.startApp), so a run costs one migration pass at
// most — and none at all while the schema, migrations and seed data are unchanged.
//
// Two engines, same suite:
//   default               embedded Postgres (PGlite): a data directory is built and copied per file
//   TEST_DATABASE_URL     a real PostgreSQL server: a template database is built and cloned per file

const root = process.cwd();
export const TEMPLATE_DIR = path.join(root, "database", ".pgdata-test-template");
export const PG_TEMPLATE_NAME = "erp_test_template";
const HASH_FILE = path.join(TEMPLATE_DIR, ".migrations-hash");

function migrationsHash(): string {
  const dir = path.join(root, "database");
  // Anything a migration step reads counts: the SQL, the scripts, the insurer register and the seed data files.
  const files = [
    ...fs.readdirSync(dir).filter((f) => f === "schema.sql" || f === "insurer-register.ts" || /^migrate(-\d{3}-.+)?\.ts$/.test(f)),
    ...fs.readdirSync(path.join(dir, "seeds")).map((f) => path.join("seeds", f)),
  ].sort();
  const hash = crypto.createHash("sha1");
  for (const f of files) hash.update(f).update(fs.readFileSync(path.join(dir, f)));
  return hash.digest("hex");
}

function runMigrations(env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(root, "database", "migrate-all.ts")], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error("Could not build the test database — see migration output above.");
}

// ---- embedded (PGlite)
function setupEmbedded(wanted: string) {
  if (fs.existsSync(HASH_FILE) && fs.readFileSync(HASH_FILE, "utf8") === wanted) return;
  console.log("[tests] building test database from migrations (cached after the first run)…");
  fs.rmSync(TEMPLATE_DIR, { recursive: true, force: true });
  runMigrations({ PGLITE_DEV: "true", PGLITE_DATA_DIR: TEMPLATE_DIR });
  fs.writeFileSync(HASH_FILE, wanted);
}

// ---- real PostgreSQL server
const quote = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

function withDatabase(adminUrl: string, database: string): string {
  const u = new URL(adminUrl);
  u.pathname = `/${database}`;
  return u.toString();
}

async function setupServer(adminUrl: string, wanted: string) {
  const admin = new Pool({ connectionString: adminUrl });
  try {
    const { rows } = await admin.query(
      "SELECT shobj_description(oid, 'pg_database') AS hash FROM pg_database WHERE datname = $1",
      [PG_TEMPLATE_NAME],
    );
    if (rows[0]?.hash === wanted) return; // template is current

    console.log("[tests] building template database on the PostgreSQL server (cached after the first run)…");
    await admin.query(`DROP DATABASE IF EXISTS ${quote(PG_TEMPLATE_NAME)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${quote(PG_TEMPLATE_NAME)}`);
    runMigrations({ PGLITE_DEV: "", DATABASE_URL: withDatabase(adminUrl, PG_TEMPLATE_NAME) });
    await admin.query(`COMMENT ON DATABASE ${quote(PG_TEMPLATE_NAME)} IS '${wanted}'`);
  } finally {
    await admin.end();
  }
}

export default async function setup() {
  const wanted = migrationsHash();
  if (process.env.TEST_DATABASE_URL) await setupServer(process.env.TEST_DATABASE_URL, wanted);
  else setupEmbedded(wanted);
}
