import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Incremental migration for databases already created by schema.sql
// before insurer_type/authorized_classes existed. Fresh installs get
// these directly from schema.sql. Safe to re-run (IF NOT EXISTS).
const ALTER_SQL = `
ALTER TABLE product.insurers ADD COLUMN IF NOT EXISTS insurer_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE product.insurers ADD COLUMN IF NOT EXISTS authorized_classes JSONB NOT NULL DEFAULT '[]';
`;

async function main() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(ALTER_SQL);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(ALTER_SQL);
    await pool.end();
  }
  console.log("Insurer type + authorized classes columns applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
