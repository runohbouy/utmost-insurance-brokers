import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The KPI library's access rules and the indexes its queries need.
//
//   analytics.view     operational KPIs (receipts volume, cheque turnaround)
//   analytics.finance  money KPIs (collections, outstanding, commission)
//
// Each KPI declares which of these it needs; the API shows a user only the KPIs
// their role may see. Indexes below were chosen from EXPLAIN output on the KPI
// queries (docs/adr/0003-performance-and-indexes.md).
const SQL = `
INSERT INTO access.permissions (id, description) VALUES
  ('analytics.view', 'View operational KPIs'),
  ('analytics.finance', 'View financial KPIs: collections, outstanding premium, commission')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'analytics.view'), ('admin', 'analytics.finance'),
  ('accountant', 'analytics.view'), ('accountant', 'analytics.finance'),
  ('supervisor', 'analytics.view'), ('supervisor', 'analytics.finance'),
  ('underwriter', 'analytics.view'),
  ('claims_officer', 'analytics.view')
ON CONFLICT DO NOTHING;

-- KPI series scan receipt_events by status and time; a partial index keeps it to the two statuses that matter.
CREATE INDEX IF NOT EXISTS receipt_events_kpi_idx ON finance.receipt_events (occurred_at) WHERE to_status IN ('cleared','bounced');
CREATE INDEX IF NOT EXISTS invoices_issue_idx ON finance.invoices (tenant_id, issue_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS commission_accruals_created_idx ON finance.commission_accruals (tenant_id, created_at);
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
  console.log("Analytics: analytics.view / analytics.finance permissions and KPI indexes added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
