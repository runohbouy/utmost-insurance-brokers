import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Two more roles so every job in the business has an account type that fits it.
//
//   operations   policy servicing and back office: policies, renewals, claims intake and complaints,
//                documents, tasks, correspondence and compliance obligations. No finance, HR, settings,
//                underwriting placement or insurer rates.
//   hr_officer   people management: employee profiles, leave decisions and performance reviews. Sees
//                little else.
//
// Like the other role-view migration, a role's menu is its view.<screen> permissions and what it can do is
// its ordinary permissions; the server enforces the latter on every route.
const OPERATIONS_VIEWS = ["dashboard", "analytics", "parties", "correspondence", "policies", "renewals", "claims", "complaints", "documents", "tasks", "obligations"];
const HR_VIEWS = ["dashboard", "tasks", "hr"];
const list = (rows: string[]) => rows.map((r) => `'view.${r}'`).join(", ");

const SQL = `
INSERT INTO access.roles (id, name, description) VALUES
  ('operations', 'Operations', 'Policy servicing and back office: policies, renewals, claims intake, documents, tasks and compliance. No finance, HR or settings.'),
  ('hr_officer', 'HR Officer', 'People management: employee profiles, leave decisions and performance reviews.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('operations', 'obligation.manage'), ('operations', 'analytics.view'),
  ('hr_officer', 'employee.manage'), ('hr_officer', 'leave.decide'), ('hr_officer', 'performance_review.manage')
ON CONFLICT DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id)
SELECT 'operations', id FROM access.permissions WHERE id IN (${list(OPERATIONS_VIEWS)})
ON CONFLICT DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id)
SELECT 'hr_officer', id FROM access.permissions WHERE id IN (${list(HR_VIEWS)})
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
  console.log("Roles: operations and hr_officer added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
