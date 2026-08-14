// Shared catalog of non-motor/non-medical IRA product line categories, used by both the admin
// rate editor (AdminPortalView.tsx) and the customer-facing quote intake (OtherLinesQuoteView.tsx)
// so the two can't drift out of sync. IDs for domestic_package/fire/medical are kept stable so
// already-saved MUA/Cannon rate data still loads; "code" is the matching IRA class code (see
// IRA_CLASS_LABELS in mockInsurers.ts) used to filter by an insurer's actual license.
export interface OtherLineCategory {
  id: string;
  label: string;
  code: string;
  kind: "general" | "life";
}

export const OTHER_LINE_CATEGORIES: OtherLineCategory[] = [
  { id: "aviation", label: "Aviation", code: "01", kind: "general" },
  { id: "engineering", label: "Engineering", code: "02", kind: "general" },
  { id: "domestic_package", label: "Fire Domestic (Domestic Package)", code: "03", kind: "general" },
  { id: "fire", label: "Fire Industrial (Fire & Perils)", code: "04", kind: "general" },
  { id: "liability", label: "Liability", code: "05", kind: "general" },
  { id: "marine", label: "Marine", code: "06", kind: "general" },
  { id: "personal_accident", label: "Personal Accident", code: "09", kind: "general" },
  { id: "theft", label: "Theft", code: "10", kind: "general" },
  { id: "wiba", label: "Workmen's Compensation (WIBA)", code: "11", kind: "general" },
  { id: "medical", label: "Health / Medical Insurance", code: "12", kind: "general" },
  { id: "miscellaneous", label: "Miscellaneous", code: "14", kind: "general" },
  { id: "life_assurance", label: "Life Assurance", code: "31", kind: "life" },
  { id: "annuities", label: "Annuities", code: "32", kind: "life" },
  { id: "pensions", label: "Pensions", code: "33a", kind: "life" },
  { id: "group_life", label: "Group Life", code: "34", kind: "life" },
  { id: "group_credit", label: "Group Credit", code: "35", kind: "life" },
  { id: "investment", label: "Investment (Unit/Non-Linked)", code: "37a", kind: "life" }
];

// Categories that currently have a real customer-facing intake form (informed by an actual
// Kenyan-market proposal form) - see otherLineFormDefs.ts. The remaining categories above
// (domestic_package, medical, and the annuities/pensions/group_life/group_credit Life classes)
// stay admin-configured only: domestic_package/medical already have dedicated live journeys
// elsewhere in the app (RoomAnalyzerView, QuoteJourneyView); the remaining Life classes have no
// source brochure on file for any insurer yet. fire and aviation were added once real CIC (Fire
// & Perils) and Kenindia/QBE (Aircraft Insurance) proposal forms were located in the binder - see
// Underwriter-Binder/General. life_assurance and investment were added once real Old Mutual Life
// product fliers (Life, Critical Illness, Last Expense, Education, Savings & Investment) were
// located in Underwriter-Binder/Life Brochures.
export const OTHER_LINE_LIVE_CATEGORY_IDS = [
  "liability",
  "engineering",
  "marine",
  "theft",
  "wiba",
  "personal_accident",
  "miscellaneous",
  "fire",
  "aviation",
  "life_assurance",
  "investment"
];
