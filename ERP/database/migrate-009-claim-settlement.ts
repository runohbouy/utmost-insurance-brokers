import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SOP-16 Claim Settlement, Repudiation and Closure — settlement
// breakdown fields, a manager-review gate for material partial/
// repudiated claims, and a reopen counter. Safe to re-run.
const SQL = `
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS excess_kes NUMERIC(14,2);
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS salvage_kes NUMERIC(14,2);
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS prior_payments_kes NUMERIC(14,2);
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS settlement_reason TEXT;
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS requires_manager_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS manager_reviewed_by TEXT REFERENCES access.staff(id);
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS manager_reviewed_at TIMESTAMPTZ;
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS reopened_count INT NOT NULL DEFAULT 0;
`;

async function main() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(SQL);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(SQL);
    await pool.end();
  }
  console.log("Claim settlement columns added: excess/salvage/prior payments, settlement reason, manager review, reopen count.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
