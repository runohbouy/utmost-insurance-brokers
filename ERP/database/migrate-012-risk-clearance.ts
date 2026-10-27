import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SOP-23 AML/CFT/CPF, Fraud and Unusual Activity Escalation —
// sanctions/PEP screening and conflict-of-interest clearance for a
// risk, gating whether a client's recommendation decision can be
// accepted. Safe to re-run.
const SQL = `
CREATE TABLE IF NOT EXISTS sales.risk_clearances (
  id                              TEXT PRIMARY KEY,
  risk_id                         TEXT NOT NULL REFERENCES sales.risks(id),
  sanctions_screening_result      TEXT NOT NULL DEFAULT 'pending' CHECK (sanctions_screening_result IN ('pending','clear','hit','override')),
  pep_status                      BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_of_interest_checked    BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_of_interest_notes      TEXT,
  cleared_by                      TEXT REFERENCES access.staff(id),
  cleared_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
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
  console.log("Risk clearance (AML/CFT/sanctions/PEP/conflict-of-interest) table added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
