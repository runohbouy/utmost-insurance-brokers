import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Permissions added by the route-permission audit. Until now a number of
// money-moving and sensitive-read routes were open to any signed-in staff
// member (a sales agent could record a payment, read the audit log, or see
// every colleague's salary). Each new permission below gates one of those
// groups; existing permissions (claim.decide, insurer_rate.manage,
// commission_statement.reconcile, ...) cover the rest.
//
//   finance.record      Record money movements: payments, allocations, premium
//                       confirmations, clawbacks, petty cash, office expenses
//   finance.view        Read internal finance: GL, journals, petty cash, expenses
//   underwriting.approve  Decide a stage of an underwriting approval
//   audit.view          Read the audit log
//   document.restricted Read documents marked sensitivity = 'restricted'
//
// Admin is granted every new permission explicitly (the original seed only
// granted admin whatever existed at that moment).
const SQL = `
INSERT INTO access.permissions (id, description) VALUES
  ('finance.record', 'Record payments, allocations, premium confirmations, clawbacks, petty cash and office expenses'),
  ('finance.view', 'View internal finance: general ledger, journal entries, petty cash and office expenses'),
  ('underwriting.approve', 'Approve or reject a stage of an underwriting approval'),
  ('audit.view', 'Read the audit log'),
  ('document.restricted', 'Read documents marked as restricted')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'finance.record'),
  ('accountant', 'finance.record'),
  ('admin', 'finance.view'),
  ('accountant', 'finance.view'),
  ('supervisor', 'finance.view'),
  ('admin', 'underwriting.approve'),
  ('underwriter', 'underwriting.approve'),
  ('supervisor', 'underwriting.approve'),
  ('admin', 'audit.view'),
  ('admin', 'document.restricted'),
  ('supervisor', 'document.restricted')
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
  console.log("Route-permission audit: finance.record, finance.view, underwriting.approve, audit.view, document.restricted added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
