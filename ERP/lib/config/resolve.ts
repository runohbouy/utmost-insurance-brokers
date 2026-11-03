// ---------------------------------------------------------------------------
// Layered resolution:   region pack  <-  tenant overrides   =>   resolved slices
//
// Merging is by slice and by key; arrays and scalars in an override REPLACE the
// pack's value wholesale (no element-wise merging — a tenant that sets `taxes`
// has said exactly which taxes apply). The merged result must satisfy the full
// strict schema or resolution fails with every problem listed, which is what
// publish relies on: nothing half-configured ever becomes effective.
// ---------------------------------------------------------------------------
import crypto from "crypto";
import { REGION_PACKS } from "./packs";
import { overridesSchema, resolvedSlices, type ConfigOverrides, type ResolvedSlices } from "./schema";

export interface ConfigIssue { path: string; message: string }
export type Resolution = { ok: true; slices: ResolvedSlices; hash: string } | { ok: false; issues: ConfigIssue[] };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function merge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge(base[k], v) : v;
  return out;
}

/** Stable JSON: keys sorted at every level, so equal content hashes equal. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const hashSlices = (slices: ResolvedSlices) => crypto.createHash("sha256").update(canonicalJson(slices)).digest("hex");

const toIssues = (error: { issues: { path: PropertyKey[]; message: string }[] }): ConfigIssue[] =>
  error.issues.map((i) => ({ path: i.path.map(String).join(".") || "(root)", message: i.message }));

export function resolveConfig(regionPack: string, overrides: unknown): Resolution {
  const pack = REGION_PACKS[regionPack];
  if (!pack) return { ok: false, issues: [{ path: "regionPack", message: `unknown region pack "${regionPack}"` }] };

  const parsedOverrides = overridesSchema.safeParse(overrides ?? {});
  if (!parsedOverrides.success) return { ok: false, issues: toIssues(parsedOverrides.error) };

  const merged = merge(structuredClone(pack), parsedOverrides.data satisfies ConfigOverrides);
  const resolved = resolvedSlices.safeParse(merged);
  if (!resolved.success) return { ok: false, issues: toIssues(resolved.error) };
  return { ok: true, slices: resolved.data, hash: hashSlices(resolved.data) };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
