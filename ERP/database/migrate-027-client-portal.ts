import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Client self-service portal accounts. A portal user is a CLIENT (a crm.parties
// row), not staff: it has its own table, its own tokens and its own routes, and
// can only ever see records belonging to its own party. Staff create the account
// and hand over a one-time password that must be changed at first sign-in.
//
//   portal_users   one login per client contact, scoped to a tenant and a party
//   permission     portal.manage — create, disable and reset portal accounts
const SQL = `
CREATE TABLE IF NOT EXISTS access.portal_users (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES config.tenants(id),
  party_id              TEXT NOT NULL REFERENCES crm.parties(id),
  email                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  must_change_password  BOOLEAN NOT NULL DEFAULT TRUE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  password_changed_at   TIMESTAMPTZ,
  created_by            TEXT REFERENCES access.staff(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_users_email_key ON access.portal_users (tenant_id, email);
CREATE INDEX IF NOT EXISTS portal_users_party_idx ON access.portal_users (party_id);

INSERT INTO access.permissions (id, description) VALUES
  ('portal.manage', 'Create, disable and reset client portal accounts')
ON CONFLICT (id) DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'portal.manage'), ('supervisor', 'portal.manage')
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
  console.log("Client portal: access.portal_users and the portal.manage permission added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
