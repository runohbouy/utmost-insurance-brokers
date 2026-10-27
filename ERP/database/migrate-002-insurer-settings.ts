import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Incremental migration for databases already created by schema.sql
// before insurer KYC and rate/tax settings columns existed. Fresh
// installs get these directly from schema.sql — this just brings an
// existing database up to date. Safe to re-run (IF NOT EXISTS).
const ALTER_SQL = `
ALTER TABLE product.insurers ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE product.insurers ADD COLUMN IF NOT EXISTS license_expiry_date DATE;
ALTER TABLE product.insurers ADD COLUMN IF NOT EXISTS aibk_member BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE product.insurers ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE product.insurer_rate_versions ADD COLUMN IF NOT EXISTS commission_rate_pct NUMERIC(5,2);
ALTER TABLE product.insurer_rate_versions ADD COLUMN IF NOT EXISTS pcf_rate_pct NUMERIC(6,4);
ALTER TABLE product.insurer_rate_versions ADD COLUMN IF NOT EXISTS itl_rate_pct NUMERIC(6,4);
ALTER TABLE product.insurer_rate_versions ADD COLUMN IF NOT EXISTS stamp_duty_kes NUMERIC(10,2);
ALTER TABLE product.insurer_rate_versions ALTER COLUMN rate_table SET DEFAULT '{}';
`;

async function main() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(ALTER_SQL);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(ALTER_SQL);
    await pool.end();
  }
  console.log("Insurer KYC + rate/tax settings columns applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
