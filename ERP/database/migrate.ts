import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(sql);
    await pglite.close();
    console.log("database/schema.sql applied to the embedded PGlite database.");
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it, or run `npm run db:up` for the local dev database.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(sql);
  await pool.end();
  console.log("database/schema.sql applied successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
