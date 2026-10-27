import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev-only credentials for the three demo logins below — password is
// "ChangeMe123!" for all three (bcrypt hash below, matches the one in
// database/schema.sql so a fresh install and this migration produce
// the same login). Change both (and regenerate the hash) before this
// ever points at anything but a local dev database.
const DEV_PASSWORD_HASH = "$2b$10$AXyc30GmaOGZxU25jVhG8OenSgJ2LjAyZMp49E8OCd1f5AzOQVdua";

async function main() {
  const SQL = `
INSERT INTO access.roles (id, name, description) VALUES
  ('admin', 'Admin', 'Full access — staff, roles, insurer panel, reconciliation, compliance'),
  ('underwriter', 'Underwriter', 'Placement, insurer rates, commission guide'),
  ('claims_officer', 'Claims Officer', 'Claims assessment through payment'),
  ('accountant', 'Accountant', 'Premium confirmations, commission statement reconciliation'),
  ('supervisor', 'Supervisor', 'Recommendation and compliance sign-off'),
  ('sales_agent', 'Sales Agent', 'Parties, opportunities, day-to-day CRM work')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.permissions (id, description) VALUES
  ('insurer_rate.manage', 'Create/update insurer commission rates and statutory levies'),
  ('recommendation.decide', 'Record a client''s decision on a recommendation and bind the resulting policy'),
  ('claim.decide', 'Move a claim through Decision/Offer/Repudiated/Payment'),
  ('commission_statement.reconcile', 'Import and reconcile insurer commission statements'),
  ('obligation.manage', 'Create/update compliance obligations')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id)
  SELECT 'admin', id FROM access.permissions
ON CONFLICT DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('underwriter', 'insurer_rate.manage'),
  ('claims_officer', 'claim.decide'),
  ('accountant', 'commission_statement.reconcile'),
  ('supervisor', 'recommendation.decide'),
  ('supervisor', 'obligation.manage')
ON CONFLICT DO NOTHING;

INSERT INTO access.staff (id, full_name, email, role_id, active, password_hash) VALUES
  ('staff-admin', 'Amina Hassan', 'amina@utmostbrokers.co.ke', 'admin', true, '${DEV_PASSWORD_HASH}'),
  ('staff-underwriter', 'Peter Otieno', 'peter@utmostbrokers.co.ke', 'underwriter', true, '${DEV_PASSWORD_HASH}'),
  ('staff-claims', 'Grace Njeri', 'grace@utmostbrokers.co.ke', 'claims_officer', true, '${DEV_PASSWORD_HASH}')
ON CONFLICT (id) DO NOTHING;
`;

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
  console.log("Auth seeded: roles, permissions, and 3 staff logins (password: ChangeMe123!).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
