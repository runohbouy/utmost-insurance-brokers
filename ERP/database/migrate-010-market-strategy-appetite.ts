import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SOP-07 Market Strategy and Insurer Selection — insurer risk
// appetite (distinct from the licence-based authorized_classes check)
// and the approved placement strategy captured before a market
// submission goes out. Safe to re-run.
const SQL = `
CREATE TABLE IF NOT EXISTS product.insurer_appetite (
  id                  TEXT PRIMARY KEY,
  insurer_id          TEXT NOT NULL REFERENCES product.insurers(id),
  class_code          TEXT NOT NULL,
  appetite_level      TEXT NOT NULL DEFAULT 'accepted' CHECK (appetite_level IN ('preferred','accepted','restricted','excluded')),
  max_capacity_kes    NUMERIC(14,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales.market_strategies (
  id                            TEXT PRIMARY KEY,
  risk_id                       TEXT NOT NULL REFERENCES sales.risks(id),
  strategy_type                 TEXT NOT NULL CHECK (strategy_type IN ('incumbent_renewal','remarketing','specialist_facility','co_insurance','layering')),
  rationale                     TEXT NOT NULL,
  single_source_justification   TEXT,
  approved_by                   TEXT REFERENCES access.staff(id),
  approved_at                   TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
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
  console.log("Insurer appetite and market strategy tables added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
