import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Two-step verification (TOTP authenticator codes) for staff and portal users.
//
//   mfa_secret_enc   the authenticator seed, AES-256-GCM encrypted (lib/secretbox.ts). Set when a
//                    person starts enrolment; only counts once mfa_enabled is true.
//   mfa_enabled      already on access.staff as a placeholder; added here for portal users.
//   mfa_last_step    the last 30-second step whose code was accepted, so a code cannot be replayed.
//   mfa_failed_attempts / mfa_locked_until   five wrong codes in a row lock code checking for 5 minutes,
//                    on top of the per-address sign-in limiter (a 6-digit code needs more than an IP cap).
//
// The seed column is never selected by the generic staff/portal queries and never returned by any API.
const SQL = `
ALTER TABLE access.staff
  ADD COLUMN IF NOT EXISTS mfa_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS mfa_last_step  BIGINT,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mfa_locked_until TIMESTAMPTZ;

ALTER TABLE access.portal_users
  ADD COLUMN IF NOT EXISTS mfa_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS mfa_last_step  BIGINT,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mfa_locked_until TIMESTAMPTZ;

INSERT INTO access.permissions (id, description) VALUES
  ('mfa.reset', 'Remove a colleague''s or client''s two-step verification so they can enrol again (lost phone)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id) VALUES ('admin', 'mfa.reset') ON CONFLICT DO NOTHING;
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
  console.log("Two-step verification: authenticator seed/replay columns on staff and portal users, mfa.reset permission.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
