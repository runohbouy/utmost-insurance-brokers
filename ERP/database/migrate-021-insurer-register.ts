import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { ALL } from "./insurer-register";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Makes sure the 62 IRA-licensed insurers exist in product.insurers on every
// database (fresh installs previously only got them from the separate
// `db:seed:insurers` script). Unlike that script this never overwrites an
// existing row, so anything staff have edited since stays as they left it.
const esc = (s: string) => s.replace(/'/g, "''");
const SQL = `
INSERT INTO product.insurers (id, name, insurer_type, authorized_classes, panel_status, active, kyc_status)
VALUES
  ${ALL.map((i) => `('${i.id}', '${esc(i.name)}', '${i.type}', '${esc(JSON.stringify(i.classes))}'::jsonb, 'approved', true, 'verified')`).join(",\n  ")}
ON CONFLICT (id) DO NOTHING;
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
  console.log(`Insurer register ensured (${ALL.length} IRA-licensed insurers).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
