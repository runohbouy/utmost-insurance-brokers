import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SOP-11 Policy Issuance, Checking and Delivery — a fixed checklist
// that must all pass, and every discrepancy resolved, before a policy
// can be marked Delivered. Safe to re-run.
const SQL = `
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS delivery_method TEXT;
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS client_acknowledged_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS policy.policy_checks (
  id            TEXT PRIMARY KEY,
  policy_id     TEXT NOT NULL REFERENCES policy.policies(id),
  check_item    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','fail')),
  notes         TEXT,
  checked_by    TEXT REFERENCES access.staff(id),
  checked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy.discrepancies (
  id                TEXT PRIMARY KEY,
  policy_id         TEXT NOT NULL REFERENCES policy.policies(id),
  policy_check_id   TEXT REFERENCES policy.policy_checks(id),
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','corrected','waived')),
  raised_by         TEXT REFERENCES access.staff(id),
  resolved_by       TEXT REFERENCES access.staff(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
  console.log("Policy issuance checking: policy_checks, discrepancies, delivery tracking columns added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
