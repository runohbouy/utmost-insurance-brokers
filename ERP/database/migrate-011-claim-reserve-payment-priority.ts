import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// B-SAFE-inspired claims upgrades: itemized reserve/payment breakdown
// by cost code (supplementing, not replacing, the single reserve/paid
// totals the SOP-16 settlement gate checks against), and a RAG
// priority flag. Safe to re-run.
const SQL = `
ALTER TABLE claims.claims ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'green' CHECK (priority IN ('red','amber','green'));

CREATE TABLE IF NOT EXISTS claims.claim_reserve_lines (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL REFERENCES claims.claims(id),
  reserve_code    TEXT NOT NULL CHECK (reserve_code IN ('indemnity','legal_fees','loss_adjuster_fees','medical_expenses','investigation_fees','salvage_recovery_cost','other')),
  amount_kes      NUMERIC(14,2) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims.claim_payment_lines (
  id                  TEXT PRIMARY KEY,
  claim_id            TEXT NOT NULL REFERENCES claims.claims(id),
  payment_code        TEXT NOT NULL CHECK (payment_code IN ('indemnity','legal_fees','loss_adjuster_fees','medical_expenses','investigation_fees','salvage_recovery_cost','other')),
  amount_kes          NUMERIC(14,2) NOT NULL,
  payment_reference   TEXT,
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
  console.log("Claim reserve/payment lines and priority column added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
