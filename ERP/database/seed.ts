import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same seed block schema.sql applies on a fresh install — kept here too
// so it can be re-applied to a database that was migrated before the
// seed existed, without re-running the (non-idempotent) full schema.
const SEED_SQL = `
INSERT INTO access.roles (id, name, description) VALUES
  ('system', 'System', 'Automated/system actions before real staff auth exists')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.staff (id, full_name, role_id, active) VALUES
  ('staff-1', 'System (default actor)', 'system', true)
ON CONFLICT (id) DO NOTHING;
`;

async function main() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(SEED_SQL);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set.");
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(SEED_SQL);
    await pool.end();
  }
  console.log("Default system actor (staff-1) seeded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
