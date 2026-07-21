// IRA 2026 licensed general/life classes for built-in insurers that have no full profile in
// mockInsurers.ts (stardiscover, aar, oldmutual - referenced only by id/name in server.ts and
// AdminPortalView.tsx). Shared here so the live quote engine (server.ts) and the admin licensing
// filters (AdminPortalView.tsx) can't drift out of sync with each other.
export const EXTRA_LICENSED_CLASSES: Record<string, { general?: string[]; life?: string[] }> = {
  stardiscover: { general: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  // AAR Insurance (Kenya) Limited: per IRA Licensed Entities 2026, classes 07/08 (Motor
  // Private/Commercial) are NOT held - restricted here, and AAR removed from the live motor
  // quote engine in server.ts accordingly.
  aar: { general: ["02", "03", "04", "05", "06", "09", "10", "11", "12", "14"] },
  oldmutual: { general: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] }
};
