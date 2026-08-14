// IRA 2026 licensed general/life classes for built-in insurers that have no full profile in
// mockInsurers.ts (stardiscover, aar, oldmutual, apa - referenced only by id/name in server.ts
// and AdminPortalView.tsx). Shared here so the live quote engine (server.ts) and the admin
// licensing filters (AdminPortalView.tsx) can't drift out of sync with each other.
export const EXTRA_LICENSED_CLASSES: Record<string, { general?: string[]; life?: string[] }> = {
  stardiscover: { general: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  // AAR Insurance (Kenya) Limited: per IRA Licensed Entities 2026, classes 07/08 (Motor
  // Private/Commercial) are NOT held - restricted here, and AAR removed from the live motor
  // quote engine in server.ts accordingly.
  aar: { general: ["02", "03", "04", "05", "06", "09", "10", "11", "12", "14"] },
  // Life classes evidenced directly by 5 real Old Mutual Life product fliers in the binder
  // (Life Cover, Critical Illness, Last Expense, Education Plan, Savings & Investment Plan) -
  // 31 (Life Assurance: term/whole life, critical illness, last expense) and 37a (Unit-Linked
  // Investment: the Lengo/Elimika/Hakika savings plans). Other life classes (annuities, pensions,
  // group life/credit) left unlisted since no source document for them was found.
  oldmutual: { general: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"], life: ["31", "37a"] },
  // APA Insurance Limited: kept deliberately narrow to only classes with direct evidence in this
  // codebase - 12 (Medical, already live via medicalCalculator.ts's real Jamii Plus data) and 14
  // (Miscellaneous, evidenced by APA's own real Animal/Pet Cover product profile in the binder).
  // No IRA notice cross-reference was done for APA's full class list, so broader classes (motor,
  // fire, marine, etc.) are intentionally left unlisted rather than guessed.
  apa: { general: ["12", "14"] }
};
