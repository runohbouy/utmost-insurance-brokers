import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { ALL, GENERAL, LIFE, MICRO } from "./insurer-register";

function buildSql(): string {
  const values = ALL.map((i) => {
    const classesJson = JSON.stringify(i.classes).replace(/'/g, "''");
    const nameEscaped = i.name.replace(/'/g, "''");
    return `('${i.id}', '${nameEscaped}', '${i.type}', '${classesJson}'::jsonb, 'approved', true, 'verified')`;
  }).join(",\n  ");

  return `
INSERT INTO product.insurers (id, name, insurer_type, authorized_classes, panel_status, active, kyc_status)
VALUES
  ${values}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  insurer_type = EXCLUDED.insurer_type,
  authorized_classes = EXCLUDED.authorized_classes;
`;
}

async function main() {
  const sql = buildSql();
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(sql);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(sql);
    await pool.end();
  }
  console.log(`Seeded ${ALL.length} IRA-licensed insurers (${GENERAL.length} general, ${LIFE.length} life, ${MICRO.length} micro).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
