// The IRA-licensed insurer register, shared by the seed scripts.
// Source: "The Insurance Act (Cap 487)" — IRA Kenya licensed entities
// register, 30 March 2026 (licensed-entities-2026.pdf). Class codes are
// the IRA's own numbering, not an internal convention:
//   General: 01 Aviation, 02 Engineering, 03 Fire Domestic, 04 Fire
//   Industrial, 05 Liability, 06 Marine, 07 Motor Private,
//   08 Motor Commercial, 09 Personal Accident, 10 Theft,
//   11 Workmen's Compensation, 12 Medical, 13 Micro Insurance, 14 Misc.
//   Long-term: 31 Life Assurance, 32 Annuities, 33a/33b Pensions,
//   34 Group Life, 35 Group Credit, 36 Permanent Health,
//   37a/37b Investment.
// Two entities (Kenindia, The Kenyan Alliance, The Monarch) hold both a
// general and a life licence — each gets its own row with a suffixed id.

export type InsurerSeed = { id: string; name: string; type: "general" | "life" | "micro"; classes: string[] };

export const GENERAL: InsurerSeed[] = [
  { id: "aar-general", name: "AAR Insurance (Kenya) Limited", type: "general", classes: ["02", "03", "04", "05", "06", "09", "10", "11", "12", "14"] },
  { id: "africa-merchant-general", name: "Africa Merchant Assurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "apa-general", name: "APA Insurance Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "britam-general", name: "Britam General Insurance Company (K) Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "bupa-global", name: "Bupa Global Insurance Limited", type: "general", classes: ["12"] },
  { id: "cannon-general", name: "Cannon General Insurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "cic-general", name: "CIC General Insurance Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "directline-general", name: "Directline Assurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "definite-general", name: "Definite Assurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "equity-general", name: "Equity General Insurance (Kenya) Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "equity-health", name: "Equity Health Insurance (Kenya) Limited", type: "general", classes: ["12"] },
  { id: "fidelity-shield-general", name: "Fidelity Shield Insurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "first-assurance-general", name: "First Assurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "ga-general", name: "GA Insurance Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "geminia-general", name: "Geminia Insurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "icea-lion-general", name: "ICEA LION General Insurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "intra-africa-general", name: "Intra Africa Assurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "jubilee-health", name: "Jubilee Health Insurance Limited", type: "general", classes: ["12"] },
  { id: "kenindia-general", name: "Kenindia Assurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "kenya-orient-general", name: "Kenya Orient Insurance Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "madison-general", name: "Madison General Insurance Kenya Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "mayfair-general", name: "Mayfair Insurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "mua-general", name: "MUA Insurance (Kenya) Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "ncba-general", name: "NCBA Insurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "occidental-general", name: "Occidental Insurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
  { id: "old-mutual-general", name: "Old Mutual General Insurance Kenya Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "pacis-general", name: "Pacis Insurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "pioneer-general", name: "Pioneer General Insurance Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "sanlam-allianz-general", name: "Sanlam Allianz General Insurance (Kenya) Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "star-discover-general", name: "Star Discover Insurance Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "takaful-general", name: "Takaful Insurance of Africa Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "tausi-general", name: "Tausi Assurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "heritage-general", name: "The Heritage Insurance Company Limited", type: "general", classes: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "kenyan-alliance-general", name: "The Kenyan Alliance Insurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"] },
  { id: "monarch-general", name: "The Monarch Insurance Company Limited", type: "general", classes: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"] },
];

export const LIFE: InsurerSeed[] = [
  { id: "absa-life", name: "ABSA Life Assurance Kenya Limited", type: "life", classes: ["31", "34", "35"] },
  { id: "apa-life", name: "APA Life Assurance Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "britam-life", name: "Britam Life Assurance Company (K) Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "36", "37a", "37b"] },
  { id: "cannon-life", name: "Cannon Life Assurance (K) Limited", type: "life", classes: ["31", "34", "35", "37a", "37b"] },
  { id: "capex-life", name: "Capex Life Assurance Company Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35"] },
  { id: "cic-life", name: "CIC Life Assurance Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "equity-life", name: "Equity Life Assurance (Kenya) Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "36", "37a", "37b"] },
  { id: "ga-life", name: "GA Life Assurance Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35"] },
  { id: "geminia-life", name: "Geminia Life Insurance Company Limited", type: "life", classes: ["31", "33a", "33b", "34", "35", "37a"] },
  { id: "icea-lion-life", name: "ICEA LION Life Assurance Company Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "jubilee-life", name: "Jubilee Life Insurance Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a"] },
  { id: "kenindia-life", name: "Kenindia Assurance Company Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37b"] },
  { id: "kenya-orient-life", name: "Kenya Orient Life Assurance Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35"] },
  { id: "liberty-life", name: "Liberty Life Assurance Kenya Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "madison-life", name: "Madison Life Assurance Kenya Limited", type: "life", classes: ["31", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "old-mutual-life", name: "Old Mutual Life Assurance Kenya Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "pioneer-life", name: "Pioneer Assurance Company Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "prudential-life", name: "Prudential Life Assurance Kenya Limited", type: "life", classes: ["31", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "sanlam-allianz-life", name: "Sanlam Allianz Life Insurance (Kenya) Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "36", "37a", "37b"] },
  { id: "star-discover-life", name: "Star Discover Life Insurance Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"] },
  { id: "kenyan-alliance-life", name: "The Kenyan Alliance Insurance Company Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37b"] },
  { id: "monarch-life", name: "The Monarch Insurance Company Limited", type: "life", classes: ["31", "32", "33a", "33b", "34", "35", "37a"] },
];

export const MICRO: InsurerSeed[] = [
  { id: "apa-micro", name: "APA Microinsurance Limited", type: "micro", classes: ["13"] },
  { id: "birdview-micro", name: "Birdview Micro Insurance Limited", type: "micro", classes: ["13"] },
  { id: "britam-micro", name: "Britam Microinsurance Company (K) Limited", type: "micro", classes: ["13"] },
  { id: "cic-micro", name: "CIC Microinsurance Limited", type: "micro", classes: ["13"] },
  { id: "turaco-micro", name: "Turaco Microinsurance Limited", type: "micro", classes: ["13"] },
];

export const ALL = [...GENERAL, ...LIFE, ...MICRO];
