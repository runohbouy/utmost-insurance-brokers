import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Underwriter query tracker, structured quote capture (extensions/
// conditions/payment terms/special terms — limits/deductibles/
// exclusions/warranties already existed as dormant JSONB columns),
// the internal underwriting approval chain, and a pre-submission
// coverage-verification checklist for claims (distinct from the
// documents checklist). Safe to re-run.
const SQL = `
ALTER TABLE sales.quotations ADD COLUMN IF NOT EXISTS extensions JSONB;
ALTER TABLE sales.quotations ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE sales.quotations ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE sales.quotations ADD COLUMN IF NOT EXISTS special_terms TEXT;

CREATE TABLE IF NOT EXISTS sales.underwriting_queries (
  id                       TEXT PRIMARY KEY,
  submission_id            TEXT NOT NULL REFERENCES sales.submissions(id),
  question                 TEXT NOT NULL,
  received_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  required_response_date   DATE,
  responsible_staff_id     TEXT REFERENCES access.staff(id),
  client_info_required     TEXT,
  response                 TEXT,
  response_document_id     TEXT REFERENCES docs.documents(id),
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','awaiting_client','responded','closed')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales.underwriting_approvals (
  id             TEXT PRIMARY KEY,
  batch_id       TEXT NOT NULL,
  risk_id        TEXT NOT NULL REFERENCES sales.risks(id),
  reason         TEXT NOT NULL,
  stage          TEXT NOT NULL CHECK (stage IN ('team_leader','senior_manager','final')),
  decision       TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected')),
  approver_id    TEXT REFERENCES access.staff(id),
  decided_at     TIMESTAMPTZ,
  comments       TEXT,
  conditions     TEXT,
  requested_by   TEXT REFERENCES access.staff(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims.coverage_verification_items (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims.claims(id),
  check_item   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','fail')),
  notes        TEXT,
  checked_by   TEXT REFERENCES access.staff(id),
  checked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
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
  console.log("Underwriting query tracker, structured quote fields, underwriting approvals, and coverage verification checklist added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
