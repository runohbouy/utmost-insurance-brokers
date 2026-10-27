import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Multi-policy payment allocation (a single cheque/transfer funding
// several policies at once), premium ageing, commission clawback
// notes, and the brokerage's own operating finance (petty cash,
// office expenses) — distinct from client premium/insurer commission
// money, which the firm never treats as its own. Safe to re-run.
const SQL = `
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS premium_due_date DATE;
ALTER TABLE policy.premium_confirmations ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE finance.financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS finance.payments (
  id                  TEXT PRIMARY KEY,
  party_id            TEXT REFERENCES crm.parties(id),
  total_amount_kes    NUMERIC(14,2) NOT NULL,
  method              TEXT CHECK (method IN ('mpesa','bank','card','cheque','journal')),
  payment_reference   TEXT,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by         TEXT REFERENCES access.staff(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.petty_cash_floats (
  id                    TEXT PRIMARY KEY,
  custodian_staff_id    TEXT REFERENCES access.staff(id),
  opening_balance_kes   NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_balance_kes   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS finance.petty_cash_transactions (
  id                   TEXT PRIMARY KEY,
  float_id             TEXT NOT NULL REFERENCES finance.petty_cash_floats(id),
  transaction_type     TEXT NOT NULL CHECK (transaction_type IN ('replenishment','disbursement')),
  amount_kes           NUMERIC(12,2) NOT NULL,
  purpose              TEXT NOT NULL,
  receipt_document_id  TEXT REFERENCES docs.documents(id),
  recorded_by          TEXT REFERENCES access.staff(id),
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.office_expenses (
  id                  TEXT PRIMARY KEY,
  category            TEXT NOT NULL CHECK (category IN ('rent','utilities','salaries','supplies','marketing','professional_fees','insurance','other')),
  description         TEXT NOT NULL,
  amount_kes          NUMERIC(12,2) NOT NULL,
  vendor              TEXT,
  payment_method      TEXT CHECK (payment_method IN ('mpesa','bank','card','cheque','journal')),
  status              TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','approved','paid')),
  incurred_at         DATE NOT NULL,
  paid_at             TIMESTAMPTZ,
  receipt_document_id TEXT REFERENCES docs.documents(id),
  recorded_by         TEXT REFERENCES access.staff(id),
  approved_by         TEXT REFERENCES access.staff(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE policy.premium_confirmations ADD CONSTRAINT fk_pcf_payment FOREIGN KEY (payment_id) REFERENCES finance.payments(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
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
  console.log("Multi-policy payments, premium ageing, commission-clawback notes and internal operating finance (petty cash, office expenses) added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
