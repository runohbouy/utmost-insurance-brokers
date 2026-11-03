// ---------------------------------------------------------------------------
// Upgrading old published snapshots.
//
// A published configuration version is frozen (a database trigger refuses edits), yet
// the platform keeps gaining settings. When a setting is added, every snapshot published
// BEFORE it existed lacks the field, and the strict schema would refuse to load it.
//
// So each addition is recorded here, once, as an explicit step that fills the new field with
// the value that reproduces how the platform behaved when that version was published. The stored
// row is never touched; the upgrade happens as the snapshot is read. This is the only place a
// value is ever filled in for a tenant, and every one is listed below.
//
//   receiptApproval  added with maker-checker receipts. Earlier versions had no approval step: "none".
//   security.mfa     added with two-step verification. Earlier versions did not require it: "optional".
// ---------------------------------------------------------------------------

type Json = Record<string, any>;

export function upgradeSnapshot(resolved: unknown): unknown {
  if (typeof resolved !== "object" || resolved === null) return resolved;
  const s = structuredClone(resolved) as Json;
  if (s.finance && s.finance.receiptApproval === undefined) s.finance.receiptApproval = "none";
  if (s.security === undefined) s.security = { mfa: "optional" };
  return s;
}
