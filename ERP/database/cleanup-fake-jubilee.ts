import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One-off cleanup: an early test insurer ("Jubilee Insurance",
// id insurer-1784619719070) was created by hand before the real IRA
// panel was seeded. It doesn't correspond to any actually licensed
// entity — the real ones are Jubilee Health Insurance Limited (medical
// only) and Jubilee Life Insurance Limited (life classes only), and
// neither is licensed for Motor, which is what this test data used.
// Reassign its dependents to APA Insurance Limited (apa-general),
// which is genuinely IRA-licensed for Motor Private, then remove it.
const FAKE_ID = "insurer-1784619719070";
const REPLACEMENT_ID = "apa-general";

const SQL = `
UPDATE policy.policies SET insurer_id = '${REPLACEMENT_ID}' WHERE insurer_id = '${FAKE_ID}';
UPDATE sales.quotations SET insurer_id = '${REPLACEMENT_ID}', insurer_name = (SELECT name FROM product.insurers WHERE id = '${REPLACEMENT_ID}') WHERE insurer_id = '${FAKE_ID}';
UPDATE product.insurer_rate_versions SET insurer_id = '${REPLACEMENT_ID}' WHERE insurer_id = '${FAKE_ID}';
DELETE FROM product.insurers WHERE id = '${FAKE_ID}';
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
  console.log(`Reassigned dependents of ${FAKE_ID} to ${REPLACEMENT_ID} and removed the fake insurer.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
