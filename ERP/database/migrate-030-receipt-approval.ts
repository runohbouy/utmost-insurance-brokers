import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Maker-checker for receipts. Where the tenant has finance.receiptApproval = 'required', a receipt starts
// 'pending' and is not treated as money (no clearing, no allocation, no ledger entry) until someone OTHER
// than the person who recorded it approves it.
//
//   approval_status   not_required (default: nothing changes for existing receipts), pending, approved, rejected
//   approved_by / approved_at / approval_note   who decided, when, and why (a reason is required to reject)
//
// permission receipt.approve: admin, accountant and supervisor. The four-eyes rule (approver != recorder) is
// enforced by the service, not by the permission, so it also binds an administrator.
const SQL = `
ALTER TABLE finance.receipts
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_by   TEXT REFERENCES access.staff(id),
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT;

CREATE INDEX IF NOT EXISTS receipts_pending_approval_idx ON finance.receipts (tenant_id, received_at DESC) WHERE approval_status = 'pending';

INSERT INTO access.permissions (id, description) VALUES
  ('receipt.approve', 'Approve or reject a receipt recorded by someone else (maker-checker)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'receipt.approve'), ('accountant', 'receipt.approve'), ('supervisor', 'receipt.approve')
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
  console.log("Receipt approval: approval columns on finance.receipts and the receipt.approve permission.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
