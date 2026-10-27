// Endorsement taxonomy — five categories matching how mid-term policy
// changes are actually grouped, each type driving its own dynamic
// afterValue form (mirrors the class-specific risk fields pattern).
// Kept in sync by hand with ENDORSEMENT_TYPES_BY_CATEGORY in
// server.ts, which enforces category/type consistency and applies the
// effect once an endorsement reaches 'Completed'.
export interface EndorsementField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select";
  options?: string[];
}

export const ENDORSEMENT_CATEGORIES: { id: string; label: string }[] = [
  { id: "financial_valuation", label: "Financial & Valuation Changes" },
  { id: "coverage_expansion", label: "Coverage Expansions" },
  { id: "coverage_restriction", label: "Coverage Restrictions" },
  { id: "contractual_legal", label: "Contractual & Legal Adjustments" },
  { id: "administrative", label: "Administrative Updates" },
];

export const ENDORSEMENT_TYPES_BY_CATEGORY: Record<string, string[]> = {
  financial_valuation: ["adjust_sum_insured", "alter_deductible", "switch_valuation_method", "lock_agreed_value", "modify_premium_rate", "apply_premium_credit"],
  coverage_expansion: ["schedule_new_asset", "include_excluded_peril", "extend_geographic_boundary", "add_insured_party", "increase_sub_limit", "attach_rider"],
  coverage_restriction: ["delete_removed_asset", "exclude_peril", "remove_insured_party", "decrease_sub_limit"],
  contractual_legal: ["amend_policy_language", "extend_policy_lifespan", "cancel_policy_midterm", "reinstate_lapsed_coverage"],
  administrative: ["correct_legal_name", "update_physical_address", "modify_payment_schedule"],
};

export const ENDORSEMENT_TYPE_LABEL: Record<string, string> = {
  adjust_sum_insured: "Adjust sum insured",
  alter_deductible: "Alter deductible amount",
  switch_valuation_method: "Switch valuation method",
  lock_agreed_value: "Lock in agreed value",
  modify_premium_rate: "Modify premium rate",
  apply_premium_credit: "Apply premium credit",
  schedule_new_asset: "Schedule new asset",
  include_excluded_peril: "Include excluded peril",
  extend_geographic_boundary: "Extend geographic boundary",
  add_insured_party: "Add insured party",
  increase_sub_limit: "Increase sub-limit",
  attach_rider: "Attach specialized rider",
  delete_removed_asset: "Delete removed asset",
  exclude_peril: "Exclude specific peril",
  remove_insured_party: "Remove insured party",
  decrease_sub_limit: "Decrease sub-limit",
  amend_policy_language: "Amend policy language",
  extend_policy_lifespan: "Extend policy lifespan",
  cancel_policy_midterm: "Cancel policy mid-term",
  reinstate_lapsed_coverage: "Reinstate lapsed coverage",
  correct_legal_name: "Correct legal name",
  update_physical_address: "Update physical address",
  modify_payment_schedule: "Modify payment schedule",
};

// The effect each type actually applies once Completed — shown in the
// UI so a broker knows what will happen, not just what's recorded.
export const ENDORSEMENT_TYPE_EFFECT: Record<string, string> = {
  adjust_sum_insured: "Updates the policy's sum insured.",
  alter_deductible: "Updates the policy's deductible.",
  switch_valuation_method: "Updates the policy's valuation method.",
  lock_agreed_value: "Sets valuation method to Agreed Value and records the fixed payout amount.",
  modify_premium_rate: "Applies the premium adjustment to the policy's premium amount.",
  apply_premium_credit: "Applies the premium adjustment (credit) to the policy's premium amount.",
  extend_policy_lifespan: "Updates the policy's expiry date.",
  cancel_policy_midterm: "Sets the policy status to Cancelled.",
  reinstate_lapsed_coverage: "Sets the policy status back to Active (from Cancelled/Lapsed/Expired).",
  correct_legal_name: "Updates the client's legal name on file.",
  update_physical_address: "Updates the client's physical address on file.",
};

export const ENDORSEMENT_TYPE_FIELDS: Record<string, EndorsementField[]> = {
  adjust_sum_insured: [{ key: "sumInsuredKes", label: "New sum insured (KES)", type: "number" }],
  alter_deductible: [{ key: "deductibleKes", label: "New deductible (KES)", type: "number" }],
  switch_valuation_method: [{ key: "valuationMethod", label: "New valuation method", type: "select", options: ["actual_cash_value", "replacement_cost"] }],
  lock_agreed_value: [{ key: "agreedValueKes", label: "Agreed value (KES)", type: "number" }],
  modify_premium_rate: [],
  apply_premium_credit: [],
  schedule_new_asset: [{ key: "assetDescription", label: "Asset description", type: "text" }, { key: "assetValueKes", label: "Asset value (KES)", type: "number" }],
  include_excluded_peril: [{ key: "peril", label: "Peril to include (e.g. flood, earthquake, cyber)", type: "text" }],
  extend_geographic_boundary: [{ key: "territory", label: "New geographic territory", type: "text" }],
  add_insured_party: [{ key: "partyName", label: "Party name", type: "text" }, { key: "role", label: "Role (e.g. loss payee, additional insured)", type: "text" }],
  increase_sub_limit: [{ key: "subLimitCategory", label: "Sub-limit category (e.g. jewelry, electronics, cash)", type: "text" }, { key: "newSubLimitKes", label: "New sub-limit (KES)", type: "number" }],
  attach_rider: [{ key: "riderType", label: "Rider type (e.g. business interruption, roadside assistance)", type: "text" }],
  delete_removed_asset: [{ key: "assetDescription", label: "Asset removed", type: "text" }],
  exclude_peril: [{ key: "peril", label: "Peril to exclude", type: "text" }],
  remove_insured_party: [{ key: "partyName", label: "Party name to remove", type: "text" }],
  decrease_sub_limit: [{ key: "subLimitCategory", label: "Sub-limit category", type: "text" }, { key: "newSubLimitKes", label: "New sub-limit (KES)", type: "number" }],
  amend_policy_language: [{ key: "clause", label: "Clause/definition amended", type: "textarea" }],
  extend_policy_lifespan: [{ key: "newEndDate", label: "New expiry date", type: "date" }],
  cancel_policy_midterm: [],
  reinstate_lapsed_coverage: [],
  correct_legal_name: [{ key: "correctedName", label: "Corrected legal name", type: "text" }],
  update_physical_address: [{ key: "newAddress", label: "New physical address", type: "text" }],
  modify_payment_schedule: [{ key: "newSchedule", label: "New payment schedule details", type: "textarea" }],
};
