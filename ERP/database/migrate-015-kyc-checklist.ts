import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Onboarding KYC document checklist — auto-seeded per party_type,
// gating client_accounts.kyc_status from reaching 'approved' until
// every item is verified or waived. Safe to re-run.
const SQL = `
CREATE TABLE IF NOT EXISTS crm.kyc_checklist_items (
  id             TEXT PRIMARY KEY,
  party_id       TEXT NOT NULL REFERENCES crm.parties(id),
  document_type  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','verified','waived')),
  document_id    TEXT REFERENCES docs.documents(id),
  notes          TEXT,
  verified_by    TEXT REFERENCES access.staff(id),
  verified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
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
  console.log("KYC document checklist table added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
