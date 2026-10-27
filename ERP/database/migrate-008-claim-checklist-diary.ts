import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SOP-15 Claim Documentation, Follow-Up and Advocacy — per-document
// status tracking (not just "was something uploaded") and a
// chronological claim diary distinct from claim_timeline_steps'
// status-change history. Safe to re-run.
const SQL = `
CREATE TABLE IF NOT EXISTS claims.claim_checklist_items (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL REFERENCES claims.claims(id),
  document_type   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','reviewed','waived')),
  notes           TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at     TIMESTAMPTZ,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT REFERENCES access.staff(id)
);

CREATE TABLE IF NOT EXISTS claims.claim_diary_entries (
  id                BIGSERIAL PRIMARY KEY,
  claim_id          TEXT NOT NULL REFERENCES claims.claims(id) ON DELETE CASCADE,
  staff_id          TEXT REFERENCES access.staff(id),
  note              TEXT NOT NULL,
  commitment_due_at TIMESTAMPTZ,
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
  console.log("Claim checklist items and diary entries tables added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
