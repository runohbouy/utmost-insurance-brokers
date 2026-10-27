import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import crypto from "crypto";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One command that brings any database (embedded PGlite or real Postgres)
// up to date: runs database/migrate.ts (base schema) and then every
// migrate-NNN-*.ts in order, recording each in public.schema_migrations so
// a script runs once per database and a re-run is a no-op.
//
//   npm run db:migrate:all              apply whatever hasn't been applied
//   npm run db:migrate:all -- --baseline  record every script as applied
//                                         WITHOUT running it — use once on a
//                                         database that was migrated by hand
//                                         with the old per-script commands
//
// The scripts themselves stay independently runnable; this only adds
// ordering and bookkeeping on top of them.

const baseline = process.argv.includes("--baseline");

function listMigrations(): string[] {
  const numbered = readdirSync(__dirname)
    .filter((f) => /^migrate-\d{3}-.+\.ts$/.test(f))
    .sort();
  return ["migrate.ts", ...numbered];
}

function checksum(file: string): string {
  return crypto.createHash("sha1").update(readFileSync(path.join(__dirname, file))).digest("hex").slice(0, 12);
}

const TRACKING_SQL = `
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  name       TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

// Opens the target database just long enough to run `fn`, then closes it —
// PGlite is single-process, so it must be released before each child
// script opens the same data directory.
async function withDb<T>(fn: (query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>) => Promise<T>): Promise<T> {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    try {
      return await fn((sql, params) => pglite.query(sql, params as any[]) as Promise<{ rows: any[] }>);
    } finally {
      await pglite.close();
    }
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await fn((sql, params) => pool.query(sql, params as any[]));
  } finally {
    await pool.end();
  }
}

async function appliedSet(): Promise<Set<string>> {
  return withDb(async (query) => {
    await query(TRACKING_SQL);
    const { rows } = await query("SELECT name FROM public.schema_migrations");
    return new Set(rows.map((r) => r.name as string));
  });
}

async function record(file: string) {
  await withDb(async (query) => {
    await query(
      "INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
      [file, checksum(file)],
    );
  });
}

async function main() {
  const applied = await appliedSet();
  let ran = 0;

  for (const file of listMigrations()) {
    if (applied.has(file)) continue;

    if (!baseline) {
      const result = spawnSync(process.execPath, ["--import", "tsx", path.join(__dirname, file)], {
        stdio: ["ignore", "inherit", "inherit"],
        env: process.env,
      });
      if (result.status !== 0) {
        throw new Error(`${file} failed (exit ${result.status}) — later migrations were not run.`);
      }
    }
    await record(file);
    ran++;
    console.log(`${baseline ? "baselined" : "applied"}  ${file}`);
  }

  console.log(ran === 0 ? "Database is up to date." : `${baseline ? "Baselined" : "Applied"} ${ran} migration(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
