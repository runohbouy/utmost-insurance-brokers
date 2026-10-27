import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Structured endorsement taxonomy (5 categories, ~23 types) replacing
// free-text endorsement_type, plus the policy fields (sum insured,
// deductible, valuation method, agreed value) endorsements need to
// actually take effect against once completed, instead of being
// purely historical. The new CHECK constraints are added NOT VALID —
// a plain ADD CONSTRAINT ... CHECK scans and validates every existing
// row, which would fail outright on pre-existing free-text
// endorsement_type values (e.g. "Add dependant") predating this
// migration; NOT VALID skips that scan while still enforcing the
// constraint on every row inserted or updated from now on. Safe to
// re-run.
const SQL = `
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS sum_insured_kes NUMERIC(14,2);
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS deductible_kes NUMERIC(14,2);
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS valuation_method TEXT;
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS agreed_value_kes NUMERIC(14,2);

DO $$ BEGIN
  ALTER TABLE policy.policies ADD CONSTRAINT policies_valuation_method_check
    CHECK (valuation_method IN ('actual_cash_value','replacement_cost','agreed_value')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE policy.endorsements ADD COLUMN IF NOT EXISTS endorsement_category TEXT;
ALTER TABLE policy.endorsements ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE policy.endorsements ADD CONSTRAINT endorsements_category_check
    CHECK (endorsement_category IN ('financial_valuation','coverage_expansion','coverage_restriction','contractual_legal','administrative')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE policy.endorsements ADD CONSTRAINT endorsements_type_check
    CHECK (endorsement_type IN (
      'adjust_sum_insured','alter_deductible','switch_valuation_method','lock_agreed_value','modify_premium_rate','apply_premium_credit',
      'schedule_new_asset','include_excluded_peril','extend_geographic_boundary','add_insured_party','increase_sub_limit','attach_rider',
      'delete_removed_asset','exclude_peril','remove_insured_party','decrease_sub_limit',
      'amend_policy_language','extend_policy_lifespan','cancel_policy_midterm','reinstate_lapsed_coverage',
      'correct_legal_name','update_physical_address','modify_payment_schedule',
      'other'
    )) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function main() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(SQL);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(SQL);
    await pool.end();
  }
  console.log("Endorsement taxonomy and policy valuation fields (sum insured, deductible, valuation method, agreed value) added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
