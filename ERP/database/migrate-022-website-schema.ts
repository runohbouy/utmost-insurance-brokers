import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One database for the whole business. The public website used to keep its
// own state in JSON files (premium rate tables, custom insurers, logos,
// quotes, OTP codes, an audit log) next to a hard-coded insurer list — a
// second, parallel copy of data the ERP already owns. This moves all of it
// into the ERP database:
//
//   product.insurers               gains the website's attributes (short id, display
//                                  name, rating label, public profile, quote-pool order)
//                                  so there is ONE insurer table, not a register plus a list
//   product.premium_rate_versions  versioned premium pricing tables the quote engine reads
//                                  (what customers pay — distinct from the commission
//                                  rates the brokerage negotiates, product.insurer_rate_versions)
//   product.insurer_logos          staff-uploaded logos, stored in the database
//   site.*                         what the public site captures: quotes, cover-note
//                                  requests, other-line requests, room scans, OTP codes
//
// Levies come from product.statutory_levies and the audit trail from
// ops.audit_log — no second copy of either.
const SQL = `
CREATE SCHEMA IF NOT EXISTS site;

ALTER TABLE product.insurers
  ADD COLUMN IF NOT EXISTS site_slug         TEXT,
  ADD COLUMN IF NOT EXISTS display_name      TEXT,
  ADD COLUMN IF NOT EXISTS rating_label      TEXT,
  ADD COLUMN IF NOT EXISTS quote_pool_order  INTEGER,
  ADD COLUMN IF NOT EXISTS site_origin       TEXT CHECK (site_origin IN ('builtin','admin')),
  ADD COLUMN IF NOT EXISTS profile           JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS insurers_site_slug_key ON product.insurers (site_slug) WHERE site_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS product.premium_rate_versions (
  id                 TEXT PRIMARY KEY,
  insurer_id         TEXT NOT NULL REFERENCES product.insurers(id),
  version_number     INTEGER NOT NULL,
  category           TEXT NOT NULL DEFAULT 'all',
  status             TEXT NOT NULL CHECK (status IN ('active','inactive')),
  rates              JSONB NOT NULL,
  updated_by_staff_id TEXT REFERENCES access.staff(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (insurer_id, version_number)
);
-- An insurer has at most one live pricing table; a new version retires the old one.
CREATE UNIQUE INDEX IF NOT EXISTS premium_rate_versions_one_active ON product.premium_rate_versions (insurer_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS product.insurer_logos (
  insurer_key         TEXT PRIMARY KEY,
  mime_type           TEXT NOT NULL,
  data                BYTEA NOT NULL,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_staff_id TEXT REFERENCES access.staff(id)
);

CREATE TABLE IF NOT EXISTS site.customer_quotes (
  id                 TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  category           TEXT,
  insurer_id         TEXT,
  total_premium_kes  NUMERIC(14,2),
  assigned_staff_id  TEXT REFERENCES access.staff(id),
  payload            JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_quotes_created_idx ON site.customer_quotes (created_at DESC);

CREATE TABLE IF NOT EXISTS site.cover_notes (
  id                 TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             TEXT NOT NULL,
  category           TEXT,
  insurer_id         TEXT,
  insurer_name       TEXT,
  total_premium_kes  NUMERIC(14,2),
  payment_method     TEXT NOT NULL DEFAULT 'full' CHECK (payment_method IN ('full','ipf')),
  finance_months     INTEGER,
  contact_name       TEXT NOT NULL,
  contact_phone      TEXT NOT NULL,
  contact_email      TEXT
);

CREATE TABLE IF NOT EXISTS site.other_line_requests (
  id                    TEXT PRIMARY KEY,
  reference_number      TEXT NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  category              TEXT NOT NULL,
  sub_type              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending_underwriter_review',
  eligible_underwriters JSONB NOT NULL DEFAULT '[]',
  answers               JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS site.room_scans (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload     JSONB NOT NULL
);

-- Email one-time codes: only a hash is stored, and wrong guesses are counted.
CREATE TABLE IF NOT EXISTS site.otp_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
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
  console.log("Website schema added: insurer website columns, premium rate versions, insurer logos, site.* tables.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
