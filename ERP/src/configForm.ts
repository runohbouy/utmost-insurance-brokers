// ---------------------------------------------------------------------------
// Pure helpers behind the tenant Settings editor.
//
// The server stores a tenant's configuration as  region pack + overrides.  The
// editor shows complete values, so it needs to (1) rebuild them by merging the
// overrides onto the pack, and (2) turn what the person edited back into the
// SMALLEST set of overrides — so keys the tenant never touched keep following
// the pack (e.g. a levy rate the regulator changes) instead of being frozen.
// The merge rules here mirror lib/config/resolve.ts exactly: objects merge key by
// key; arrays and scalars replace wholesale.
// ---------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (v: unknown): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

export function mergeOverrides<T>(base: T, overrides: unknown): T {
  if (!isObject(base) || !isObject(overrides)) return (overrides === undefined ? base : overrides) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overrides)) out[k] = k in base ? mergeOverrides((base as Record<string, unknown>)[k], v) : v;
  return out as T;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What must be stored on top of `pack` to get `desired`. Empty object means "exactly the pack". */
export function diffOverrides(pack: unknown, desired: unknown): Record<string, unknown> {
  if (!isObject(pack) || !isObject(desired)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, want] of Object.entries(desired)) {
    const have = pack[key];
    if (same(have, want)) continue;
    if (isObject(have) && isObject(want)) {
      const nested = diffOverrides(have, want);
      if (Object.keys(nested).length) out[key] = nested;
    } else out[key] = want;
  }
  return out;
}

export interface Change { path: string; before: string; after: string }

/** Human-reviewable list of differences between two configurations ("brand.primaryColor: #0b5c3b → #123456"). */
export function describeChanges(before: unknown, after: unknown, prefix = ""): Change[] {
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].sort().flatMap((k) => describeChanges(before[k], after[k], prefix ? `${prefix}.${k}` : k));
  }
  if (same(before, after)) return [];
  const show = (v: unknown) => (v === undefined ? "(none)" : typeof v === "string" ? v : JSON.stringify(v));
  return [{ path: prefix, before: show(before), after: show(after) }];
}
