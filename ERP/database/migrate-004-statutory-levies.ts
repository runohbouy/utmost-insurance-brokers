import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Splits statutory levies (PCF, Insurance Training Levy, stamp duty —
// government-mandated, identical for every insurer) out of the
// per-insurer commission rate table, where they never belonged. Safe
// to re-run: DROP COLUMN IF EXISTS / CREATE TABLE IF NOT EXISTS /
// ON CONFLICT DO NOTHING throughout.
const SQL = `
ALTER TABLE product.insurer_rate_versions DROP COLUMN IF EXISTS pcf_rate_pct;
ALTER TABLE product.insurer_rate_versions DROP COLUMN IF EXISTS itl_rate_pct;
ALTER TABLE product.insurer_rate_versions DROP COLUMN IF EXISTS stamp_duty_kes;

CREATE TABLE IF NOT EXISTS product.statutory_levies (
  id                  TEXT PRIMARY KEY,
  levy_type           TEXT NOT NULL CHECK (levy_type IN ('pcf', 'itl', 'stamp_duty')),
  category            TEXT,
  calculation_method  TEXT NOT NULL CHECK (calculation_method IN ('percentage', 'flat')),
  rate_pct            NUMERIC(6,4),
  flat_amount_kes     NUMERIC(10,2),
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  source              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO product.statutory_levies (id, levy_type, category, calculation_method, rate_pct, flat_amount_kes, effective_from, source) VALUES
  ('levy-pcf-general', 'pcf', NULL, 'percentage', 0.25, NULL, '2026-01-01', 'Policyholders Compensation Fund Regulations'),
  ('levy-itl-general', 'itl', NULL, 'percentage', 0.20, NULL, '2026-01-01', 'Insurance Training Levy'),
  ('levy-stamp-duty-general', 'stamp_duty', NULL, 'flat', NULL, 40, '2026-01-01', 'Stamp Duty Act')
ON CONFLICT (id) DO NOTHING;
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
  console.log("Statutory levies split out of insurer_rate_versions into product.statutory_levies.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
