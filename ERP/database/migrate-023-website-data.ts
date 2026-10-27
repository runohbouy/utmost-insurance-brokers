import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Loads the website's reference data into the ERP database: which insurers the
// quote engine prices (and how they are presented), and each insurer's premium
// rate tables. The JSON files in database/seeds are only the *source* for this
// one-time load — at runtime the application reads and writes the database
// and never touches a file.
//
// Safe to re-run: insurer attributes are only filled in where the insurer has
// no website slug yet, and rate versions are keyed by id, so anything staff
// have changed through the rates desk since is left exactly as they made it.

interface WebsiteInsurer {
  slug: string;
  insurerId: string;
  displayName: string;
  ratingLabel: string | null;
  quotePoolOrder: number | null;
  profile: Record<string, unknown> | null;
}
interface RateVersion {
  id: string; versionNumber: number; insurerId: string; category: string;
  status: "active" | "inactive"; timestamp: string; updatedByStaffId: string | null; rates: Record<string, unknown>;
}

const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(__dirname, "seeds", file), "utf8"));

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

async function load(query: Query) {
  const insurers = read<WebsiteInsurer[]>("website-insurers.json");
  const { versions } = read<{ versions: RateVersion[] }>("premium-rates.json");
  const erpIdBySlug = new Map(insurers.map((i) => [i.slug, i.insurerId]));

  for (const i of insurers) {
    await query(
      `UPDATE product.insurers
          SET site_slug = $2, display_name = $3, rating_label = $4, quote_pool_order = $5, site_origin = 'builtin', profile = $6::jsonb
        WHERE id = $1 AND site_slug IS NULL`,
      [i.insurerId, i.slug, i.displayName, i.ratingLabel, i.quotePoolOrder, i.profile ? JSON.stringify(i.profile) : null],
    );
  }

  let inserted = 0;
  for (const v of versions) {
    const insurerId = erpIdBySlug.get(v.insurerId);
    if (!insurerId) throw new Error(`Rate version ${v.id} refers to unknown insurer '${v.insurerId}'.`);
    const result = await query(
      `INSERT INTO product.premium_rate_versions (id, insurer_id, version_number, category, status, rates, updated_by_staff_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [v.id, insurerId, v.versionNumber, v.category, v.status, JSON.stringify(v.rates), v.updatedByStaffId, v.timestamp],
    );
    inserted += result.rows.length;
  }
  // The change history that explains those versions (who changed what, when). Each
  // entry is skipped if it is already there, so a re-run never duplicates history.
  const history = read<{ timestamp: string; action: string; entityType: string; entityId: string; actorId: string; actorType: string; details: unknown }[]>("rate-audit-history.json");
  for (const h of history) {
    await query(
      `INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, after_state, occurred_at)
       SELECT $1, $2, $3, $4, $5::jsonb, $6
        WHERE NOT EXISTS (SELECT 1 FROM compliance.audit_log WHERE action = $2 AND entity_id = $4 AND occurred_at = $6)`,
      [h.actorId, h.action, h.entityType, h.entityId, JSON.stringify({ actorType: h.actorType, actorId: h.actorId, details: h.details }), h.timestamp],
    );
  }
  return { insurers: insurers.length, versions: versions.length, inserted, history: history.length };
}

async function main() {
  let summary: Awaited<ReturnType<typeof load>>;
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    try {
      summary = await load((sql, params) => pglite.query(sql, params as any[]) as Promise<{ rows: any[] }>);
    } finally {
      await pglite.close();
    }
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      summary = await load((sql, params) => pool.query(sql, params as any[]));
    } finally {
      await pool.end();
    }
  }
  console.log(`Website data loaded: ${summary.insurers} insurers configured, ${summary.inserted} of ${summary.versions} premium rate versions inserted, ${summary.history} rate-change history entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
