import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

// ES module imports are hoisted and fully evaluated before the
// importing module's own code runs — server.ts's dotenv.config() call
// would happen too late for this file's module-level env reads below,
// so this file loads its own env instead of relying on the caller.
dotenv.config();

// PGLITE_DEV=true: embedded Postgres (real Postgres compiled to WASM)
// running in-process — zero install, no separate database server or
// socket. Otherwise, a normal pg.Pool against DATABASE_URL. See
// database/migrate.ts and the README for both paths.
function createDb() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(process.cwd(), "database", ".pgdata-embedded"));
    return { db: drizzlePglite(pglite, { schema }), close: () => pglite.close() };
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return { db: drizzleNodePg(pool, { schema }), close: () => pool.end() };
}

const connection = createDb();
export const db = connection.db;

/** Releases the database connection(s). Used by tests and on graceful shutdown. */
export const closeDb = connection.close;
