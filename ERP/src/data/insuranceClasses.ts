// IRA Kenya's own class-of-business codes (The Insurance Act, Cap 487,
// s.184 licensed-entities register). These aren't an internal
// taxonomy — an insurer's authorizedClasses on its licence determine
// which risks it may lawfully be submitted, so the placement flow
// enforces against this list rather than free text.

export interface InsuranceClass {
  code: string;
  name: string;
}

export const GENERAL_CLASSES: InsuranceClass[] = [
  { code: "01", name: "Aviation" },
  { code: "02", name: "Engineering" },
  { code: "03", name: "Fire Domestic" },
  { code: "04", name: "Fire Industrial" },
  { code: "05", name: "Liability" },
  { code: "06", name: "Marine" },
  { code: "07", name: "Motor Private" },
  { code: "08", name: "Motor Commercial" },
  { code: "09", name: "Personal Accident" },
  { code: "10", name: "Theft" },
  { code: "11", name: "Workmen's Compensation" },
  { code: "12", name: "Medical" },
  { code: "13", name: "Micro Insurance" },
  { code: "14", name: "Miscellaneous" },
];

export const LIFE_CLASSES: InsuranceClass[] = [
  { code: "31", name: "Life Assurance" },
  { code: "32", name: "Annuities" },
  { code: "33a", name: "Pensions — Personal Pension" },
  { code: "33b", name: "Pensions — Deposit Administration" },
  { code: "34", name: "Group Life" },
  { code: "35", name: "Group Credit" },
  { code: "36", name: "Permanent Health" },
  { code: "37a", name: "Investment — Unit Linked" },
  { code: "37b", name: "Investment — Non-Linked" },
];

export const ALL_CLASSES: InsuranceClass[] = [...GENERAL_CLASSES, ...LIFE_CLASSES];

export function className(code: string): string {
  return ALL_CLASSES.find((c) => c.code === code)?.name || code;
}
