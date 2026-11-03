import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { resolveConfig } from "../lib/config/resolve";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tenant configuration. A tenant (an organisation using the platform) has a
// chain of immutable, versioned configuration snapshots:
//
//   draft      the one working copy: a region pack + the tenant's overrides
//   published  the version in force — its fully-resolved, validated slices are
//              frozen in `resolved`; a database trigger refuses any edit
//   superseded a former published version, kept for the record: money
//              documents reference the version they were created under
//
// Exactly one published version per tenant (partial unique index). Nothing
// reads configuration from anywhere but the published snapshot.
//
// This migration also creates the 'utmost' tenant and publishes its first
// version from the Kenya region pack, so the existing deployment is configured
// explicitly rather than by defaults buried in code.
const SQL = `
CREATE SCHEMA IF NOT EXISTS config;

CREATE TABLE IF NOT EXISTS config.tenants (
  id          TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_-]{1,40}$'),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config.tenant_config_versions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES config.tenants(id),
  version       INTEGER NOT NULL CHECK (version > 0),
  status        TEXT NOT NULL CHECK (status IN ('draft','published','superseded')),
  region_pack   TEXT NOT NULL,
  overrides     JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved      JSONB,
  content_hash  TEXT,
  effective_from TIMESTAMPTZ,
  note          TEXT,
  created_by    TEXT REFERENCES access.staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by  TEXT REFERENCES access.staff(id),
  published_at  TIMESTAMPTZ,
  UNIQUE (tenant_id, version),
  CHECK (
    (status = 'draft' AND resolved IS NULL AND content_hash IS NULL)
    OR (status <> 'draft' AND resolved IS NOT NULL AND content_hash IS NOT NULL AND effective_from IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_config_one_published ON config.tenant_config_versions (tenant_id) WHERE status = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS tenant_config_one_draft ON config.tenant_config_versions (tenant_id) WHERE status = 'draft';

-- A published version is evidence of what rules applied when money moved, so it
-- is frozen: the only change ever allowed is published -> superseded.
CREATE OR REPLACE FUNCTION config.protect_published_versions() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'a published configuration version cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'published' AND NEW.status = 'superseded'
     AND NEW.tenant_id = OLD.tenant_id AND NEW.version = OLD.version AND NEW.region_pack = OLD.region_pack
     AND NEW.overrides = OLD.overrides AND NEW.resolved = OLD.resolved AND NEW.content_hash = OLD.content_hash
     AND NEW.effective_from = OLD.effective_from THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'a published configuration version is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_published_versions ON config.tenant_config_versions;
CREATE TRIGGER protect_published_versions
  BEFORE UPDATE OR DELETE ON config.tenant_config_versions
  FOR EACH ROW EXECUTE FUNCTION config.protect_published_versions();

INSERT INTO config.tenants (id, name) VALUES ('utmost', 'Utmost Insurance Brokers') ON CONFLICT (id) DO NOTHING;

INSERT INTO access.permissions (id, description) VALUES
  ('tenant_config.manage', 'Edit, validate and publish the tenant configuration (region, tax, localization, brand, entitlements, finance rules)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id) VALUES ('admin', 'tenant_config.manage') ON CONFLICT DO NOTHING;
`;

const FIRST_OVERRIDES = {
  brand: { displayName: "Utmost Insurance Brokers" },
};

async function run(exec: (sql: string) => Promise<unknown>, query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>) {
  await exec(SQL);
  const { rows } = await query("SELECT 1 FROM config.tenant_config_versions WHERE tenant_id = 'utmost' LIMIT 1");
  if (rows.length > 0) return;

  const resolved = resolveConfig("KE", FIRST_OVERRIDES);
  if ("issues" in resolved) throw new Error(`Kenya region pack does not validate: ${JSON.stringify(resolved.issues)}`);
  await query(
    `INSERT INTO config.tenant_config_versions
       (id, tenant_id, version, status, region_pack, overrides, resolved, content_hash, effective_from, note, published_at)
     VALUES ('cfg-utmost-1', 'utmost', 1, 'published', 'KE', $1::jsonb, $2::jsonb, $3, now(), 'Initial configuration from the Kenya region pack', now())
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(FIRST_OVERRIDES), JSON.stringify(resolved.slices), resolved.hash],
  );
}

async function main() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await run((sql) => pglite.exec(sql), (sql, params) => pglite.query(sql, params as any[]) as Promise<{ rows: any[] }>);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await run((sql) => pool.query(sql), (sql, params) => pool.query(sql, params as any[]));
    await pool.end();
  }
  console.log("Tenant configuration: config.tenants + versioned immutable config; 'utmost' published from the KE pack.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
