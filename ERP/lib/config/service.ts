// ---------------------------------------------------------------------------
// Tenant configuration, persisted. The only way platform code learns how a
// tenant operates is getEffectiveConfig(): the PUBLISHED snapshot, deep-frozen,
// cached briefly. Drafts are never visible to it.
// ---------------------------------------------------------------------------
import { db } from "../../db/client";
import { newId, one, rows, sql, type Executor } from "../sql";
import { conflict, fromZod, notFound, Problem } from "../http/problem";
import { REGION_PACK_CODES } from "./packs";
import { deepFreeze, resolveConfig } from "./resolve";
import { overridesSchema, resolvedSlices, type EffectiveTenantConfig } from "./schema";
import { upgradeSnapshot } from "./upgrade";

const CACHE_TTL_MS = 30_000; // bounds staleness if another instance publishes
const cache = new Map<string, { at: number; config: EffectiveTenantConfig }>();
export const clearConfigCache = () => cache.clear();

interface VersionRow {
  id: string; tenant_id: string; version: number; status: string; region_pack: string;
  overrides: unknown; resolved: unknown; content_hash: string | null; effective_from: string | Date | null;
  note: string | null; created_by: string | null; created_at: string | Date; published_by: string | null; published_at: string | Date | null;
}

function toEffective(row: VersionRow): EffectiveTenantConfig {
  const parsed = resolvedSlices.parse(upgradeSnapshot(row.resolved)); // a stored snapshot must always re-validate (older ones are upgraded as read, see upgrade.ts)
  return deepFreeze({
    ...structuredClone(parsed),
    tenantId: row.tenant_id,
    versionId: row.id,
    version: row.version,
    regionPack: row.region_pack,
    effectiveFrom: new Date(row.effective_from as string).toISOString(),
    hash: row.content_hash as string,
  });
}

export async function getEffectiveConfig(tenantId: string, ex: Executor = db as unknown as Executor): Promise<EffectiveTenantConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.config;
  const row = await one<VersionRow>(ex, sql`SELECT * FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} AND status = 'published'`);
  if (!row) throw conflict("config-not-published", "No published configuration", `Tenant ${tenantId} has no published configuration`);
  const config = toEffective(row);
  cache.set(tenantId, { at: Date.now(), config });
  return config;
}

/** 403 unless the tenant's entitlements include the module (e.g. analytics, portal). */
export async function requireModule(tenantId: string, module: EffectiveTenantConfig["entitlements"]["modules"][number]): Promise<EffectiveTenantConfig> {
  const config = await getEffectiveConfig(tenantId);
  if (!config.entitlements.modules.includes(module)) {
    throw new Problem(403, "module-not-enabled", "Module not enabled", `The ${module} module is not part of this tenant's plan`);
  }
  return config;
}

/** The exact snapshot a historical document was created under. */
export async function getConfigVersion(versionId: string, ex: Executor = db as unknown as Executor): Promise<EffectiveTenantConfig> {
  const row = await one<VersionRow>(ex, sql`SELECT * FROM config.tenant_config_versions WHERE id = ${versionId} AND status <> 'draft'`);
  if (!row) throw notFound(`Configuration version ${versionId}`);
  return toEffective(row);
}

const summary = (r: VersionRow) => ({
  id: r.id, tenantId: r.tenant_id, version: r.version, status: r.status, regionPack: r.region_pack, note: r.note,
  contentHash: r.content_hash, effectiveFrom: r.effective_from ? new Date(r.effective_from).toISOString() : null,
  createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString(),
  publishedBy: r.published_by, publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
});

export async function listVersions(tenantId: string) {
  const list = await rows<VersionRow>(db as unknown as Executor, sql`SELECT * FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} ORDER BY version DESC`);
  return list.map(summary);
}

export async function getDraft(tenantId: string) {
  const row = await one<VersionRow>(db as unknown as Executor, sql`SELECT * FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} AND status = 'draft'`);
  if (!row) return null;
  const r = resolveConfig(row.region_pack, row.overrides);
  return { ...summary(row), overrides: row.overrides, validation: "issues" in r ? { valid: false, issues: r.issues } : { valid: true, issues: [] as never[], preview: r.slices } };
}

/** Create or replace the tenant's working draft. Structure must parse; semantic problems are reported, and block publish. */
export async function saveDraft(tenantId: string, input: { regionPack: string; overrides: unknown; note?: string }, staffId: string) {
  if (!REGION_PACK_CODES.includes(input.regionPack)) throw new Problem(422, "validation-failed", "Request validation failed", undefined, [{ field: "regionPack", message: `must be one of ${REGION_PACK_CODES.join(", ")}` }]);
  const shape = overridesSchema.safeParse(input.overrides ?? {});
  if (!shape.success) throw fromZod(shape.error, "Configuration overrides are malformed");
  const overrides = JSON.stringify(shape.data);

  await db.transaction(async (tx) => {
    const draft = await one<{ id: string }>(tx, sql`SELECT id FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} AND status = 'draft' FOR UPDATE`);
    if (draft) {
      await tx.execute(sql`UPDATE config.tenant_config_versions SET region_pack = ${input.regionPack}, overrides = ${overrides}::jsonb, note = ${input.note ?? null}, created_by = ${staffId} WHERE id = ${draft.id}`);
    } else {
      const next = await one<{ v: number }>(tx, sql`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM config.tenant_config_versions WHERE tenant_id = ${tenantId}`);
      await tx.execute(sql`INSERT INTO config.tenant_config_versions (id, tenant_id, version, status, region_pack, overrides, note, created_by)
        VALUES (${newId("cfg")}, ${tenantId}, ${Number(next!.v)}, 'draft', ${input.regionPack}, ${overrides}::jsonb, ${input.note ?? null}, ${staffId})`);
    }
  });
  return getDraft(tenantId);
}

/** Start editing from what is in force now, so a change is a delta on the live configuration rather than a rewrite. Returns the existing draft if there already is one. */
export async function startDraftFromCurrent(tenantId: string, staffId: string) {
  const existing = await getDraft(tenantId);
  if (existing) return existing;
  const current = await one<VersionRow>(db as unknown as Executor, sql`SELECT * FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} AND status = 'published'`);
  if (!current) throw conflict("config-not-published", "No published configuration");
  return saveDraft(tenantId, { regionPack: current.region_pack, overrides: current.overrides, note: `Edit of version ${current.version}` }, staffId);
}

export async function discardDraft(tenantId: string) {
  const removed = await rows(db as unknown as Executor, sql`DELETE FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} AND status = 'draft' RETURNING id`);
  if (removed.length === 0) throw notFound("A draft configuration");
}

/** Validate the draft in full, freeze it as the next published version, retire the previous one. */
export async function publishDraft(tenantId: string, staffId: string) {
  const published = await db.transaction(async (tx) => {
    const draft = await one<VersionRow>(tx, sql`SELECT * FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} AND status = 'draft' FOR UPDATE`);
    if (!draft) throw notFound("A draft configuration");

    const resolution = resolveConfig(draft.region_pack, draft.overrides);
    if ("issues" in resolution) {
      throw new Problem(422, "config-invalid", "Configuration cannot be published", `${resolution.issues.length} problem(s) must be fixed first`,
        resolution.issues.map((i) => ({ field: i.path, message: i.message })));
    }

    const current = await one<VersionRow>(tx, sql`SELECT * FROM config.tenant_config_versions WHERE tenant_id = ${tenantId} AND status = 'published' FOR UPDATE`);
    if (current && current.content_hash === resolution.hash) {
      throw conflict("config-unchanged", "Nothing to publish", "The draft resolves to exactly the configuration already in force");
    }
    // Amounts are stored as minor units of the tenant's currency; reinterpreting them in another currency would silently corrupt every balance.
    const currentCurrency = (current?.resolved as { regional?: { currency?: string } } | null)?.regional?.currency;
    if (current && currentCurrency && currentCurrency !== resolution.slices.regional.currency) {
      const used = await one(tx, sql`SELECT 1 AS used FROM finance.receipts WHERE tenant_id = ${tenantId} UNION ALL SELECT 1 FROM finance.invoices WHERE tenant_id = ${tenantId} LIMIT 1`);
      if (used) throw conflict("currency-change-blocked", "Currency cannot change", `This tenant already has receipts or invoices in ${currentCurrency}; a different currency needs a new tenant`);
    }
    if (current) await tx.execute(sql`UPDATE config.tenant_config_versions SET status = 'superseded' WHERE id = ${current.id}`);

    await tx.execute(sql`UPDATE config.tenant_config_versions
      SET status = 'published', resolved = ${JSON.stringify(resolution.slices)}::jsonb, content_hash = ${resolution.hash},
          effective_from = now(), published_by = ${staffId}, published_at = now()
      WHERE id = ${draft.id}`);
    await tx.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, before_state, after_state)
      VALUES (${staffId}, 'CONFIG_PUBLISHED', 'tenant_config', ${draft.id},
              ${JSON.stringify(current ? { version: current.version, hash: current.content_hash } : null)}::jsonb,
              ${JSON.stringify({ version: draft.version, hash: resolution.hash, regionPack: draft.region_pack })}::jsonb)`);
    return draft.id;
  });
  clearConfigCache();
  return getConfigVersion(published);
}

/** CSS custom properties for the tenant's brand, served to the dashboard and portal. */
export function brandCss(config: EffectiveTenantConfig): string {
  const b = config.brand;
  return [
    `/* ${config.tenantId} v${config.version} (${config.hash.slice(0, 12)}) */`,
    ":root {",
    `  --brand-primary: ${b.primaryColor};`,
    `  --brand-on-primary: ${b.onPrimaryColor};`,
    `  --brand-accent: ${b.accentColor};`,
    `  --brand-surface: ${b.surfaceColor};`,
    `  --brand-text: ${b.textColor};`,
    `  --brand-font: ${b.fontFamily};`,
    "}",
    "",
  ].join("\n");
}

/** The slice of configuration safe to show anyone who is signed in (no entitlements limits, no finance rules). */
export function publicView(config: EffectiveTenantConfig) {
  return {
    tenantId: config.tenantId, version: config.version, hash: config.hash, effectiveFrom: config.effectiveFrom,
    regional: config.regional, localization: config.localization, brand: config.brand,
    tax: { pricing: config.tax.pricing, taxes: config.tax.taxes },
    receiptApproval: config.finance.receiptApproval,
    modules: config.entitlements.modules,
  };
}
