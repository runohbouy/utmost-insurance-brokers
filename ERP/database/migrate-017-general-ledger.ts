import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Real general-ledger accounting: chart of accounts, accounting
// periods, and double-entry journal entries/lines — upgrading
// finance.financial_transactions (a flat cash-event log) from being
// the finance module's only record into something a proper trial
// balance/income statement/balance sheet can be computed from.
// Seeded with a minimal chart of accounts covering the transactions
// this service already generates (premium confirmations, office
// expenses, petty cash) so auto-posting has real accounts to post to
// from the moment this migration runs. Safe to re-run.
const SQL = `
CREATE TABLE IF NOT EXISTS finance.gl_accounts (
  code                TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  account_type        TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  normal_balance       TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  parent_account_code TEXT REFERENCES finance.gl_accounts(code),
  is_system_account   BOOLEAN NOT NULL DEFAULT false,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.accounting_periods (
  id          TEXT PRIMARY KEY,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at   TIMESTAMPTZ,
  closed_by   TEXT REFERENCES access.staff(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.journal_entries (
  id                   TEXT PRIMARY KEY,
  period_id            TEXT NOT NULL REFERENCES finance.accounting_periods(id),
  entry_date           DATE NOT NULL,
  reference            TEXT,
  description          TEXT,
  source_type          TEXT NOT NULL DEFAULT 'manual',
  source_id            TEXT,
  status               TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_of_entry_id TEXT REFERENCES finance.journal_entries(id),
  posted_by            TEXT REFERENCES access.staff(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.journal_lines (
  id           BIGSERIAL PRIMARY KEY,
  entry_id     TEXT NOT NULL REFERENCES finance.journal_entries(id),
  account_code TEXT NOT NULL REFERENCES finance.gl_accounts(code),
  debit_kes    NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_kes   NUMERIC(14,2) NOT NULL DEFAULT 0,
  description  TEXT,
  policy_id    TEXT,
  party_id     TEXT,
  CHECK ((debit_kes > 0 AND credit_kes = 0) OR (credit_kes > 0 AND debit_kes = 0))
);

INSERT INTO finance.gl_accounts (code, name, account_type, normal_balance, parent_account_code, is_system_account) VALUES
  ('1000', 'Bank & Cash', 'asset', 'debit', NULL, true),
  ('1010', 'Petty Cash', 'asset', 'debit', NULL, true),
  ('2000', 'Insurer Premiums Payable', 'liability', 'credit', NULL, true),
  ('3000', 'Retained Earnings', 'equity', 'credit', NULL, true),
  ('4000', 'Commission Income', 'income', 'credit', NULL, true),
  ('5000', 'Office Expenses', 'expense', 'debit', NULL, false),
  ('5001', 'Rent', 'expense', 'debit', '5000', true),
  ('5002', 'Utilities', 'expense', 'debit', '5000', true),
  ('5003', 'Salaries', 'expense', 'debit', '5000', true),
  ('5004', 'Supplies', 'expense', 'debit', '5000', true),
  ('5005', 'Marketing', 'expense', 'debit', '5000', true),
  ('5006', 'Professional Fees', 'expense', 'debit', '5000', true),
  ('5007', 'Insurance', 'expense', 'debit', '5000', true),
  ('5008', 'Other Expenses', 'expense', 'debit', '5000', true),
  ('5009', 'Petty Cash Disbursements', 'expense', 'debit', '5000', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO access.permissions (id, description) VALUES
  ('gl.manage', 'Manage the chart of accounts and post/reverse manual journal entries'),
  ('gl.period_close', 'Close an accounting period')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('accountant', 'gl.manage'),
  ('admin', 'gl.manage'),
  ('admin', 'gl.period_close'),
  ('supervisor', 'gl.period_close')
ON CONFLICT DO NOTHING;
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
  console.log("General ledger (chart of accounts, accounting periods, journal entries/lines) added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
