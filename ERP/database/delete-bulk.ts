// Removes exactly the data database/seed-bulk.ts created, using the
// manifest it wrote (database/.bulk-manifest.json). Mirrors
// delete-showcase.ts's approach and caveats — see that file's header
// comment for the general pattern (derived rows, reverse dependency
// order, PGlite single-connection requirement).
//
// One additional caveat specific to this script: bulk-generated leave
// requests are scoped to the staff this run created (see seed-bulk.ts),
// specifically so approving one never mutates a pre-existing staff
// member's real leave balance — so unlike financial_transactions
// below, hr.leave_balances rows are deleted by matching staff_id
// against this run's own tracked staff ids, not derived from policy/
// claim/complaint ids.
import { readFileSync, existsSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, ".bulk-manifest.json");

if (!existsSync(manifestPath)) {
  console.log("No database/.bulk-manifest.json found — nothing to delete.");
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
  const officeExpenseIds = ids("officeExpenses");
  const pettyCashTxnIds = ids("pettyCashTransactions");
  const pettyCashFloatIds = ids("pettyCashFloats");
  const premiumConfirmationIds = ids("premiumConfirmations");
  const staffIds = ids("staff");

  const statements: string[] = [];
  const del = (table: string, whereClause: string) => statements.push(`DELETE FROM ${table} WHERE ${whereClause};`);

  // Derived child rows first (no ids captured by the seed script).
  del("policy.discrepancies", inClause("policy_id", policyIds));
  del("policy.policy_checks", inClause("policy_id", policyIds));
  del("finance.financial_transactions", inClause("policy_id", policyIds));
  del("workflow.case_transitions", `case_id IN (SELECT id FROM workflow.cases WHERE ${inClause("entity_id", entityIds)})`);
  del("workflow.cases", inClause("entity_id", entityIds));

  // GL journal lines/entries — auto-posted against premium
  // confirmations, office expense payments and petty cash
  // transactions/float openings (source_id), plus the tracked manual
  // entries from step 18.
  const glSourceIds = [...premiumConfirmationIds, ...officeExpenseIds, ...pettyCashTxnIds, ...pettyCashFloatIds];
  const glEntryIdSubquery = `SELECT id FROM finance.journal_entries WHERE ${inClause("source_id", glSourceIds)} OR ${inClause("id", ids("journalEntries"))}`;
  del("finance.journal_lines", `entry_id IN (${glEntryIdSubquery})`);
  del("finance.journal_entries", `${inClause("source_id", glSourceIds)} OR ${inClause("id", ids("journalEntries"))}`);

  // Tracked child rows.
  del("policy.endorsements", inClause("id", ids("endorsements")));
  del("policy.renewals", inClause("id", ids("renewals")));
  del("policy.premium_confirmations", inClause("id", premiumConfirmationIds));
  del("claims.claim_checklist_items", inClause("id", ids("claimChecklistItems")));
  del("claims.claim_reserve_lines", inClause("id", ids("claimReserveLines")));
  del("claims.claim_payment_lines", inClause("id", ids("claimPaymentLines")));
  del("finance.commission_lines", inClause("id", ids("commissionLines")));
  del("finance.commission_statements", inClause("id", ids("commissionStatements")));
  del("crm.complaints", inClause("id", complaintIds));
  del("comms.notifications", inClause("id", ids("notifications")));
  del("docs.documents", inClause("id", ids("documents")));
  del("workflow.tasks", inClause("id", ids("tasks")));
  del("compliance.obligations", inClause("id", ids("obligations")));
  del("finance.office_expenses", inClause("id", officeExpenseIds));
  del("finance.petty_cash_transactions", inClause("id", pettyCashTxnIds));
  del("finance.petty_cash_floats", inClause("id", pettyCashFloatIds));

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

  // HR — leave/performance rows for this run's own staff only (see
  // header comment), then the employee profiles and staff logins
  // themselves.
  del("hr.leave_requests", inClause("id", ids("leaveRequests")));
  del("hr.leave_balances", inClause("staff_id", staffIds));
  del("hr.performance_reviews", inClause("id", ids("performanceReviews")));
  del("hr.employees", inClause("staff_id", staffIds));
  del("access.staff", inClause("id", staffIds));

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
  console.log(`Bulk data removed (${statements.length} delete statements run) and manifest deleted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
