import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Which sidebar views a role can see, as permissions named view.<screen> (view.parties, view.claims, ...).
//
//   * Every existing role is granted every view, so nobody's screens change.
//   * A new role starts with only the views it is given.
//   * Views are what a person sees in the menu. What they can DO is still decided by the
//     permissions on each API route (finance.record, claim.decide, ...), so hiding a screen
//     never opens anything up and showing one never lets someone past a route check.
//
// New role: underwriter_desk — the Underwriter's permissions, but only the screens a working
// underwriter needs: no Finance, Receipts, Producers, HR, Complaints or Settings.
const VIEWS: [string, string][] = [
  ["dashboard", "Dashboard"], ["analytics", "Analytics"],
  ["parties", "Parties"], ["opportunities", "Opportunities"], ["producers", "Producers"], ["correspondence", "Correspondence"],
  ["placement", "Placement"], ["policies", "Policies"], ["renewals", "Renewals"], ["insurers", "Insurer panel"],
  ["claims", "Claims"], ["complaints", "Complaints"],
  ["finance", "Finance"], ["receipts", "Receipts & allocation"], ["documents", "Documents"],
  ["tasks", "Tasks"], ["obligations", "Compliance"], ["hr", "HR"], ["settings", "Settings"],
];

const DESK_VIEWS = ["dashboard", "analytics", "parties", "opportunities", "correspondence", "placement", "policies", "renewals", "insurers", "claims", "documents", "tasks", "obligations"];

const list = (rows: string[]) => rows.map((r) => `'${r}'`).join(", ");

const SQL = `
INSERT INTO access.permissions (id, description) VALUES
${VIEWS.map(([id, label]) => `  ('view.${id}', 'Show the ${label} screen in the menu')`).join(",\n")}
ON CONFLICT (id) DO NOTHING;

-- nobody loses a screen: every role that existed before this migration keeps seeing everything
INSERT INTO access.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM access.roles r CROSS JOIN access.permissions p
WHERE p.id LIKE 'view.%' AND r.id <> 'underwriter_desk'
ON CONFLICT DO NOTHING;

INSERT INTO access.roles (id, name, description) VALUES
  ('underwriter_desk', 'Underwriter (desk)', 'Underwriter permissions with a focused menu: CRM, underwriting, claims, documents, tasks and compliance. No finance, HR or settings.')
ON CONFLICT (id) DO NOTHING;

-- same abilities as the Underwriter role (copied, so later changes to that role are not silently inherited)...
INSERT INTO access.role_permissions (role_id, permission_id)
SELECT 'underwriter_desk', permission_id FROM access.role_permissions
WHERE role_id = 'underwriter' AND permission_id NOT LIKE 'view.%'
ON CONFLICT DO NOTHING;

-- ...and only these screens
INSERT INTO access.role_permissions (role_id, permission_id)
SELECT 'underwriter_desk', id FROM access.permissions WHERE id IN (${list(DESK_VIEWS.map((v) => `view.${v}`))})
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
  console.log("Role views: view.* permissions added, existing roles keep every screen, underwriter_desk role created.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
