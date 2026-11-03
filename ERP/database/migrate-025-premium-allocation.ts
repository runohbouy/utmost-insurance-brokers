import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Receipts, invoices and the premium allocation ledger.
//
//   receipts            money received from a client. Cheques move
//                       received -> deposited -> cleared (or bounced / cancelled);
//                       other methods are cleared on receipt. Only CLEARED money
//                       is ever allocated.
//   invoices + lines    what a client owes: a premium invoice (net / tax lines)
//                       per policy, or a brokerage fee invoice (e.g. returned cheque).
//   allocations         how cleared receipts pay invoices. APPEND-ONLY: a mistake
//                       or a bounced cheque is undone by a reversal row that
//                       points at the original, never by editing or deleting it.
//   allocation_lines    the same split, per invoice line (net / tax / fee)
//   commission_accruals commission earned on the NET premium of cleared money,
//                       with matching negative rows when an allocation is reversed
//
// All amounts are integer minor units (BIGINT) with an ISO 4217 currency.
// Balances (invoices.paid_minor, receipts.allocated_minor) are running totals
// that a trigger on finance.allocations maintains, guarded by CHECK constraints
// so a receipt can never be over-allocated nor an invoice over-paid. Line-level
// balances are derived from allocation_lines. Every row carries its tenant and the configuration
// version in force when it was created. Safe to re-run.
const SQL = `
CREATE SEQUENCE IF NOT EXISTS finance.receipt_no_seq;
CREATE SEQUENCE IF NOT EXISTS finance.invoice_no_seq;

CREATE TABLE IF NOT EXISTS finance.receipts (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES config.tenants(id),
  receipt_no        TEXT NOT NULL,
  client_id         TEXT NOT NULL REFERENCES crm.parties(id),
  amount_minor      BIGINT NOT NULL CHECK (amount_minor > 0),
  currency          CHAR(3) NOT NULL,
  method            TEXT NOT NULL CHECK (method IN ('cash','mpesa','bank','card','cheque')),
  reference         TEXT,
  instrument_no     TEXT,
  drawer_bank       TEXT,
  status            TEXT NOT NULL CHECK (status IN ('received','deposited','cleared','bounced','cancelled')),
  received_at       TIMESTAMPTZ NOT NULL,
  deposited_at      TIMESTAMPTZ,
  cleared_at        TIMESTAMPTZ,
  bounced_at        TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  -- what the unallocated balance currently is: suspense (staff must resolve it)
  -- or client credit (applied to the client's next invoice automatically)
  holding_kind      TEXT CHECK (holding_kind IN ('suspense','client_credit')),
  -- maintained by a trigger on finance.allocations (never written by hand); the CHECK makes over-allocation impossible
  allocated_minor   BIGINT NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  config_version_id TEXT NOT NULL REFERENCES config.tenant_config_versions(id),
  idempotency_key   TEXT,
  request_hash      TEXT,
  recorded_by       TEXT REFERENCES access.staff(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, receipt_no),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (method = 'cheque' OR instrument_no IS NULL),
  CHECK (allocated_minor <= amount_minor)
);

CREATE TABLE IF NOT EXISTS finance.receipt_events (
  id          BIGSERIAL PRIMARY KEY,
  receipt_id  TEXT NOT NULL REFERENCES finance.receipts(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    TEXT,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS finance.invoices (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES config.tenants(id),
  invoice_no        TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('premium','fee')),
  policy_id         TEXT REFERENCES policy.policies(id),
  client_id         TEXT NOT NULL REFERENCES crm.parties(id),
  insurer_id        TEXT REFERENCES product.insurers(id),
  product_type      TEXT,
  currency          CHAR(3) NOT NULL,
  issue_date        DATE NOT NULL,
  due_date          DATE NOT NULL,
  total_minor       BIGINT NOT NULL CHECK (total_minor > 0),
  paid_minor        BIGINT NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','void')),
  config_version_id TEXT NOT NULL REFERENCES config.tenant_config_versions(id),
  created_by        TEXT REFERENCES access.staff(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_no),
  CHECK (kind = 'fee' OR policy_id IS NOT NULL),
  CHECK (due_date >= issue_date),
  CHECK (paid_minor <= total_minor)
);

CREATE TABLE IF NOT EXISTS finance.invoice_lines (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL REFERENCES finance.invoices(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('net','tax','fee')),
  code          TEXT NOT NULL,
  description   TEXT NOT NULL,
  amount_minor  BIGINT NOT NULL CHECK (amount_minor > 0),
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance.allocation_batches (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES config.tenants(id),
  receipt_id        TEXT NOT NULL REFERENCES finance.receipts(id),
  trigger           TEXT NOT NULL CHECK (trigger IN ('on_clearing','manual','credit_applied','correction','bounce_reversal')),
  strategy          TEXT,
  idempotency_key   TEXT,
  request_hash      TEXT,
  config_version_id TEXT NOT NULL REFERENCES config.tenant_config_versions(id),
  created_by        TEXT REFERENCES access.staff(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS finance.allocations (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES config.tenants(id),
  batch_id               TEXT NOT NULL REFERENCES finance.allocation_batches(id),
  receipt_id             TEXT NOT NULL REFERENCES finance.receipts(id),
  invoice_id             TEXT NOT NULL REFERENCES finance.invoices(id),
  kind                   TEXT NOT NULL CHECK (kind IN ('apply','reversal')),
  amount_minor           BIGINT NOT NULL,
  currency               CHAR(3) NOT NULL,
  reverses_allocation_id TEXT UNIQUE REFERENCES finance.allocations(id),
  reason                 TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'apply' AND amount_minor > 0 AND reverses_allocation_id IS NULL)
    OR (kind = 'reversal' AND amount_minor < 0 AND reverses_allocation_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS finance.allocation_lines (
  id               BIGSERIAL PRIMARY KEY,
  allocation_id    TEXT NOT NULL REFERENCES finance.allocations(id),
  invoice_line_id  TEXT NOT NULL REFERENCES finance.invoice_lines(id),
  amount_minor     BIGINT NOT NULL CHECK (amount_minor <> 0)
);

CREATE TABLE IF NOT EXISTS finance.commission_accruals (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES config.tenants(id),
  allocation_id         TEXT NOT NULL REFERENCES finance.allocations(id),
  policy_id             TEXT NOT NULL REFERENCES policy.policies(id),
  insurer_id            TEXT REFERENCES product.insurers(id),
  kind                  TEXT NOT NULL CHECK (kind IN ('accrual','reversal')),
  basis_minor           BIGINT NOT NULL,
  rate_bps              INTEGER NOT NULL CHECK (rate_bps >= 0),
  amount_minor          BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,
  producer_split_minor  BIGINT NOT NULL DEFAULT 0,
  reverses_accrual_id   TEXT UNIQUE REFERENCES finance.commission_accruals(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'accrual' AND amount_minor >= 0 AND reverses_accrual_id IS NULL)
    OR (kind = 'reversal' AND amount_minor <= 0 AND reverses_accrual_id IS NOT NULL)
  )
);

-- Append-only: these rows are the financial record. Corrections are new rows.
CREATE OR REPLACE FUNCTION finance.forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: record a reversal instead of changing or deleting rows', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS allocations_append_only ON finance.allocations;
CREATE TRIGGER allocations_append_only BEFORE UPDATE OR DELETE ON finance.allocations
  FOR EACH ROW EXECUTE FUNCTION finance.forbid_change();
DROP TRIGGER IF EXISTS allocation_lines_append_only ON finance.allocation_lines;
CREATE TRIGGER allocation_lines_append_only BEFORE UPDATE OR DELETE ON finance.allocation_lines
  FOR EACH ROW EXECUTE FUNCTION finance.forbid_change();
DROP TRIGGER IF EXISTS commission_accruals_append_only ON finance.commission_accruals;
CREATE TRIGGER commission_accruals_append_only BEFORE UPDATE OR DELETE ON finance.commission_accruals
  FOR EACH ROW EXECUTE FUNCTION finance.forbid_change();
DROP TRIGGER IF EXISTS receipt_events_append_only ON finance.receipt_events;
CREATE TRIGGER receipt_events_append_only BEFORE UPDATE OR DELETE ON finance.receipt_events
  FOR EACH ROW EXECUTE FUNCTION finance.forbid_change();

-- Running totals, kept by the database itself so no code path can forget them or get them wrong.
-- Allocations are append-only and reversals are negative rows, so a plain addition is always right.
CREATE OR REPLACE FUNCTION finance.apply_allocation_totals() RETURNS trigger AS $$
BEGIN
  UPDATE finance.invoices SET paid_minor = paid_minor + NEW.amount_minor WHERE id = NEW.invoice_id;
  UPDATE finance.receipts SET allocated_minor = allocated_minor + NEW.amount_minor WHERE id = NEW.receipt_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS allocations_totals ON finance.allocations;
CREATE TRIGGER allocations_totals AFTER INSERT ON finance.allocations
  FOR EACH ROW EXECUTE FUNCTION finance.apply_allocation_totals();

-- Indexes chosen from the actual access paths (see docs/adr/0003 for the EXPLAIN evidence).
CREATE INDEX IF NOT EXISTS receipts_list_idx          ON finance.receipts (tenant_id, received_at DESC, id);
CREATE INDEX IF NOT EXISTS receipts_client_idx        ON finance.receipts (tenant_id, client_id, received_at DESC);
CREATE INDEX IF NOT EXISTS receipts_cleared_idx       ON finance.receipts (tenant_id, cleared_at) WHERE status = 'cleared';
CREATE INDEX IF NOT EXISTS receipts_status_idx        ON finance.receipts (tenant_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS receipts_holding_idx       ON finance.receipts (tenant_id, client_id) WHERE status = 'cleared' AND holding_kind IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_client_open_idx   ON finance.invoices (tenant_id, client_id, due_date, id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS invoices_policy_idx        ON finance.invoices (policy_id) WHERE policy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_due_idx           ON finance.invoices (tenant_id, due_date) WHERE status = 'open' AND paid_minor < total_minor;
CREATE INDEX IF NOT EXISTS invoices_list_idx          ON finance.invoices (tenant_id, due_date, id);
CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx  ON finance.invoice_lines (invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS allocations_receipt_idx    ON finance.allocations (receipt_id);
CREATE INDEX IF NOT EXISTS allocations_invoice_idx    ON finance.allocations (invoice_id);
CREATE INDEX IF NOT EXISTS allocations_batch_idx      ON finance.allocations (batch_id);
CREATE INDEX IF NOT EXISTS allocation_lines_line_idx  ON finance.allocation_lines (invoice_line_id);
CREATE INDEX IF NOT EXISTS allocation_lines_alloc_idx ON finance.allocation_lines (allocation_id);
CREATE INDEX IF NOT EXISTS commission_accruals_alloc_idx  ON finance.commission_accruals (allocation_id);
CREATE INDEX IF NOT EXISTS commission_accruals_policy_idx ON finance.commission_accruals (tenant_id, policy_id, created_at);
CREATE INDEX IF NOT EXISTS receipt_events_receipt_idx ON finance.receipt_events (receipt_id, occurred_at);

-- Ledger accounts the allocation postings need.
--   2100  money held for clients that is not yet applied to an invoice (suspense and client credit)
--   2200  statutory levies / premium taxes collected, owed to the authorities
--   4100  brokerage fee income (e.g. returned-cheque fees)
INSERT INTO finance.gl_accounts (code, name, account_type, normal_balance, parent_account_code, is_system_account) VALUES
  ('2100', 'Unallocated Client Receipts', 'liability', 'credit', NULL, true),
  ('2200', 'Statutory Levies Payable', 'liability', 'credit', NULL, true),
  ('4100', 'Fee Income', 'income', 'credit', NULL, true)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE finance.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE finance.journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN ('manual','premium_confirmation','office_expense','petty_cash_transaction','producer_commission_split','reversal','receipt','allocation'));

INSERT INTO access.permissions (id, description) VALUES
  ('receipt.record', 'Record receipts and move cheques through deposited / cleared / bounced / cancelled'),
  ('allocation.manage', 'Preview and apply manual allocations, and reverse an allocation'),
  ('invoice.manage', 'Raise and void invoices')
ON CONFLICT (id) DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'receipt.record'), ('accountant', 'receipt.record'),
  ('admin', 'allocation.manage'), ('accountant', 'allocation.manage'),
  ('admin', 'invoice.manage'), ('accountant', 'invoice.manage')
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
  console.log("Premium allocation: receipts, invoices, append-only allocations, commission accruals, GL accounts 2100/2200/4100.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
