// Removes exactly the data database/seed-showcase.ts created, using the
// manifest it wrote (database/.showcase-manifest.json). Deletes in
// reverse dependency order since most child tables here have no
// ON DELETE CASCADE (by design — this is an audit-trailed CRM, cascade
// deletes are the exception, not the default).
//
// A few tables are derived rather than read from the manifest, because
// the seed script never captured their individual row ids:
//   - policy.policy_checks: created in bulk by POST /policies/:id/start-check,
//     which returns the checklist array, not tracked item-by-item.
//   - finance.financial_transactions: created server-side as a side
//     effect of POST /premium-confirmations, never returned to the caller.
//   - workflow.cases: opened automatically by POST /claims, /policies,
//     /complaints — polymorphic (entity_type/entity_id), no FK to read.
// All three are deleted by matching policy_id/entity_id against the
// manifest's own policies/claims/complaints ids, so this script only
// ever touches rows that trace back to something the seed script made.
//
// Must run with the dev server stopped (PGlite is single-connection),
// same as every other database/migrate-*.ts script.
import { readFileSync, existsSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, ".showcase-manifest.json");

if (!existsSync(manifestPath)) {
  console.log("No database/.showcase-manifest.json found — nothing to delete.");
  process.exit(0);
}
const manifest: Record<string, string[]> = JSON.parse(readFileSync(manifestPath, "utf-8"));
const ids = (table: string) => manifest[table] || [];
const quoted = (arr: string[]) => arr.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
const inClause = (col: string, arr: string[]) => (arr.length ? `${col} IN (${quoted(arr)})` : "FALSE");

function buildStatements(): string[] {
  const policyIds = ids("policies");
  const claimIds = ids("claims");
  const complaintIds = ids("complaints");
  const entityIds = [...policyIds, ...claimIds, ...complaintIds];

  const statements: string[] = [];
  const del = (table: string, whereClause: string) => statements.push(`DELETE FROM ${table} WHERE ${whereClause};`);

  // Derived child rows first (no ids captured by the seed script).
  del("policy.discrepancies", inClause("policy_id", policyIds));
  del("policy.policy_checks", inClause("policy_id", policyIds));
  del("finance.financial_transactions", inClause("policy_id", policyIds));
  del("workflow.case_transitions", `case_id IN (SELECT id FROM workflow.cases WHERE ${inClause("entity_id", entityIds)})`);
  del("workflow.cases", inClause("entity_id", entityIds));

  // Tracked child rows.
  del("policy.endorsements", inClause("id", ids("endorsements")));
  del("policy.renewals", inClause("id", ids("renewals")));
  del("policy.premium_confirmations", inClause("id", ids("premiumConfirmations")));
  del("claims.claim_checklist_items", inClause("id", ids("claimChecklistItems")));
  del("claims.claim_reserve_lines", inClause("id", ids("claimReserveLines")));
  del("claims.claim_payment_lines", inClause("id", ids("claimPaymentLines")));
  del("claims.claim_diary_entries", inClause("id", ids("claimDiary")));
  del("finance.commission_lines", inClause("id", ids("commissionLines")));
  del("finance.commission_statements", inClause("id", ids("commissionStatements")));
  del("crm.complaints", inClause("id", ids("complaints")));
  del("comms.notifications", inClause("id", ids("notifications")));
  del("docs.documents", inClause("id", ids("documents")));
  del("workflow.tasks", inClause("id", ids("tasks")));
  del("compliance.obligations", inClause("id", ids("obligations")));

  // Claims (cascades to claim_timeline_steps).
  del("claims.claims", inClause("id", claimIds));

  // Placement chain, deepest-first.
  del("sales.recommendations", inClause("id", ids("recommendations")));
  del("sales.quotations", inClause("id", ids("quotations")));
  del("sales.risk_clearances", inClause("id", ids("riskClearances")));
  del("sales.submissions", inClause("id", ids("submissions")));
  del("sales.market_strategies", inClause("id", ids("marketStrategies")));

  // Policies, risks, opportunities.
  del("policy.policies", inClause("id", policyIds));
  del("sales.risks", inClause("id", ids("risks")));
  del("crm.opportunities", inClause("id", ids("opportunities")));

  // Parties and their accounts.
  del("crm.client_accounts", inClause("id", ids("clientAccounts")));
  del("crm.parties", inClause("id", ids("parties")));

  // Independent reference-style additions.
  del("comms.correspondence_templates", inClause("id", ids("correspondenceTemplates")));
  del("product.products", inClause("id", ids("products")));
  del("product.insurer_appetite", inClause("id", ids("insurerAppetite")));
  del("product.insurer_rate_versions", inClause("id", ids("insurerRates")));

  return statements;
}

async function main() {
  const statements = buildStatements();
  const sql = statements.join("\n");

  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(sql);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(sql);
    await pool.end();
  }

  unlinkSync(manifestPath);
  console.log(`Showcase data removed (${statements.length} delete statements run) and manifest deleted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
