// ---------------------------------------------------------------------------
// Which tenant is this request for?
//
// The ledger, receipts, invoices and configuration are already tenant-scoped in
// the data model and in every query. What staff accounts do not yet carry is a
// tenant assignment (that retrofit is tracked in docs/prd-traceability.md), so
// for now every staff request resolves to the one deployed tenant. When staff
// gain a tenant, this function — the only place that decides — reads it from
// the authenticated principal instead, and nothing else changes.
// ---------------------------------------------------------------------------
import type express from "express";

export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "utmost";

export function tenantOf(_req: express.Request): string {
  return DEFAULT_TENANT_ID;
}
