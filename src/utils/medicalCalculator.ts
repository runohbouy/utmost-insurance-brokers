import { MedicalQuoteParams, InsuranceQuote } from "../types";

// =================================---------
// RATING CHARTS DERIVED FROM PROVIDED BROCHURES
// =================================---------

/**
 * 1. Star Discover Insurance - "ANGAZA AFYA" Family Medical Insurance Cover
 */
const starDiscoverPlanA = { // Inpatient limit KES 650,000
  "18_29": [18131, 31112, 38789, 46020, 53959, 62598],
  "30_39": [18481, 32766, 44590, 54707, 65234, 75760],
  "40_49": [20486, 36851, 47456, 57490, 67091, 76983],
  "50_59": [24859, 45171, 53574, 61977, 70380, 78783],
  "60_65": [30558, 56226, 64337, 72448, 80559, 88670],
};

const starDiscoverPlanB = { // Inpatient limit KES 1,250,000
  "18_29": [21020, 37231, 47734, 58237, 68740, 79243],
  "30_39": [23712, 41544, 55589, 66728, 79320, 91912],
  "40_49": [24003, 43119, 58206, 68828, 80732, 92636],
  "50_59": [31336, 57098, 68981, 80864, 92748, 104631],
  "60_65": [44295, 78522, 91496, 101855, 112214, 126731],
};

const starDiscoverPlanC = { // Inpatient limit KES 2,250,000
  "18_29": [26278, 45708, 59490, 73371, 87252, 101133],
  "30_39": [28957, 51374, 69253, 83879, 100183, 116914],
  "40_49": [32404, 58501, 76473, 91870, 106357, 123647],
  "50_59": [49571, 86669, 98486, 109873, 121259, 132646],
  "60_65": [53598, 87099, 102940, 115003, 127066, 139129],
};

const starDiscoverPlanE = { // Inpatient limit KES 5,000,000
  "18_29": [35674, 65439, 82711, 101911, 120016, 138120],
  "30_39": [36056, 64138, 89712, 109697, 134869, 155653],
  "40_49": [43704, 78483, 104137, 128103, 145399, 164798],
  "50_59": [52954, 94655, 108133, 128735, 148912, 164456],
  "60_65": [68225, 110321, 144213, 171834, 189376, 206919],
};

const starDiscoverOutpatient = { // Per person limits
  "0_18":  [33326, 32532, 28587, 23633, 17956],
  "19_29": [37462, 35750, 30689, 26400, 20222],
  "30_39": [41278, 37990, 34703, 31239, 25722],
  "40_49": [47861, 45295, 42729, 40355, 27372],
  "50_59": [93630, 81770, 69910, 48775, 32941],
  "60_65": [117457, 96800, 81228, 69044, 37289],
  "66_80": [117457, 101421, 93365, 75000, 45000]
};


/**
 * Helper to retrieve age band string keys
 */
function getAgeBandKey(age: number): string {
  if (age < 18) return "0_18";
  if (age <= 29) return "18_29";
  if (age <= 39) return "30_39";
  if (age <= 49) return "40_49";
  if (age <= 59) return "50_59";
  if (age <= 65) return "60_65";
  return "66_80";
}

// Matches the age-factor breakpoints below, for a human-readable label on the quote card -
// the age band a customer's premium was actually rated against.
function getAgeBracketLabel(age: number): string {
  if (age <= 29) return "18-29";
  if (age <= 39) return "30-39";
  if (age <= 49) return "40-49";
  if (age <= 59) return "50-59";
  if (age <= 65) return "60-65";
  return "66+";
}

// Resolves a benefit-limit band (inpatient or outpatient) and its family-size-indexed premium,
// preferring admin-configured bands (Database Rates Desk) over the hardcoded fallback table when
// an insurer has been given real ones - see AdminPortalView's "Medical Rate Table" section.
// Also returns the matched band's original array index (bandIndex), since the per-member rate
// table (memberRateTable) is index-aligned with inpatientBands - band i's premium grid lives at
// memberRateTable.principal[i], etc. - rather than repeating its own tier list.
function resolveMedicalBand(
  adminBands: Array<{ label: string; maxLimit: number; ratesByFamilySize: number[] }> | undefined,
  limit: number,
  sizeIdx: number,
  fallbackLabel: string,
  fallbackRow: number[]
): { label: string; premium: number; bandIndex: number } {
  if (adminBands && adminBands.length > 0) {
    const withIndex = adminBands.map((b, i) => ({ ...b, __i: i }));
    const sorted = withIndex.sort((a, b) => a.maxLimit - b.maxLimit);
    const match = sorted.find((b) => limit <= b.maxLimit) || sorted[sorted.length - 1];
    const row = match.ratesByFamilySize || [];
    return { label: match.label, premium: row[sizeIdx] ?? row[row.length - 1] ?? 0, bandIndex: match.__i };
  }
  return { label: fallbackLabel, premium: fallbackRow[sizeIdx] ?? fallbackRow[fallbackRow.length - 1] ?? 0, bandIndex: -1 };
}

// Fixed age-band boundaries for Jubilee's real per-member rate cards (J-Care) - not admin
// editable (unlike the benefit-limit bands above), since these mirror the underwriter's actual
// published brackets. Principal/Spouse use one set; the Outpatient rider uses a coarser one.
export const MEMBER_AGE_BANDS = [
  { min: 18, max: 30 },
  { min: 31, max: 40 },
  { min: 41, max: 50 },
  { min: 51, max: 59 },
  { min: 60, max: 64 }
];
export const OUTPATIENT_AGE_BANDS = [
  { min: 0, max: 40 },
  { min: 41, max: 50 },
  { min: 51, max: 59 },
  { min: 60, max: 64 }
];

function resolveAgeBandIndex(age: number, bands: { min: number; max: number }[]): number {
  const idx = bands.findIndex((b) => age >= b.min && age <= b.max);
  if (idx !== -1) return idx;
  return age < bands[0].min ? 0 : bands.length - 1;
}

// Finds the benefit-limit band matching a customer's requested cover limit, returning both the
// band and its original array index (bandIndex) - some insurers' per-band premium data lives in
// a second, index-aligned array (see resolveAgeBandedFamilyPremium below and memberRateTable).
function findMatchingBand(
  bands: Array<{ label: string; maxLimit: number; [key: string]: any }> | undefined,
  limit: number
): { band: any; index: number } | null {
  if (!bands || bands.length === 0) return null;
  const withIndex = bands.map((b, i) => ({ ...b, __i: i }));
  const sorted = [...withIndex].sort((a, b) => a.maxLimit - b.maxLimit);
  const match = sorted.find((b) => limit <= b.maxLimit) || sorted[sorted.length - 1];
  return { band: match, index: match.__i };
}

// Real rate cards for Britam/Heritage/CIC price a benefit-limit band differently at every age
// bracket (not a single base rate scaled by a shared multiplier) - band.ratesByAgeBand carries
// that directly, index-aligned with MEMBER_AGE_BANDS. Insurers without real per-age data instead
// carry a single band.ratesByFamilySize row, scaled by the shared ageFactor as an estimate.
function resolveAgeBandedFamilyPremium(
  band: { ratesByAgeBand?: number[][]; ratesByFamilySize?: number[] } | undefined,
  age: number,
  sizeIdx: number,
  ageFactor: number
): number {
  if (!band) return 0;
  if (band.ratesByAgeBand && band.ratesByAgeBand.length > 0) {
    const ageIdx = resolveAgeBandIndex(age, MEMBER_AGE_BANDS);
    const row = band.ratesByAgeBand[ageIdx] || band.ratesByAgeBand[band.ratesByAgeBand.length - 1] || [];
    return row[sizeIdx] ?? row[row.length - 1] ?? 0;
  }
  const row = band.ratesByFamilySize || [];
  return (row[sizeIdx] ?? row[row.length - 1] ?? 0) * ageFactor;
}

// Per-member outpatient, summed across every family member by their own age. Two real shapes
// exist: some insurers (Jubilee) bundle ONE fixed outpatient limit into each inpatient tier, so
// memberRateTable.outpatient[tierIdx][ageIdx] is looked up using the already-resolved IP tier.
// Others (APA) sell outpatient as an independently-chosen limit, unrelated to the IP tier - for
// those, memberRateTable.outpatientByLimit carries its own limit bands, each with its own
// per-age-band row, resolved against the customer's own outpatient limit selection instead.
function resolveMemberOutpatient(
  memberTable: any,
  tierIdx: number,
  opLimit: number,
  members: { age: number }[]
): number {
  const ageBands = memberTable?.outpatientAgeBands?.length ? memberTable.outpatientAgeBands : OUTPATIENT_AGE_BANDS;
  if (memberTable?.outpatientByLimit?.length) {
    const match = findMatchingBand(
      memberTable.outpatientByLimit.map((b: any) => ({ label: b.label || "", maxLimit: b.maxLimit })),
      opLimit
    );
    if (!match) return 0;
    const band = memberTable.outpatientByLimit[match.index];
    return members.reduce((sum, m) => sum + (band.ratesByAge?.[resolveAgeBandIndex(m.age, ageBands)] ?? 0), 0);
  }
  if (memberTable?.outpatient) {
    return members.reduce((sum, m) => sum + (memberTable.outpatient[tierIdx]?.[resolveAgeBandIndex(m.age, ageBands)] ?? 0), 0);
  }
  return 0;
}

// =================================---------
// ADDITIONAL RATING TABLES
// =================================---------

const jubileeInpatient_31_40 = {
  "500k": [22569, 41377, 51659, 61941, 72223, 82505],
  "1m": [26709, 49189, 63088, 76987, 90886, 104785],
  "2m": [32027, 59219, 76139, 93059, 109979, 126899],
  "3m": [40375, 75457, 96752, 118047, 139342, 160637],
  "5m": [50773, 94684, 122128, 149572, 177016, 204460],
  "10m": [58178, 108494, 139942, 171390, 202838, 234286]
};

const jubileeOutpatient_31_40 = {
  "50k": [26555, 36837, 47119, 57401, 67683, 77965],
  "80k": [31982, 45881, 59780, 73679, 87578, 101477],
  "100k": [40354, 55436, 70518, 85600, 100682, 115764],
  "150k": [50175, 69074, 87973, 106872, 125771, 144670],
  "200k": [55168, 77107, 99046, 120985, 142924, 164863]
};

/**
 * Main Medical Underwriting Matrix Calculator Engine
 */
export function calculateDynamicMedicalQuotes(params: MedicalQuoteParams, ratesDb?: any): InsuranceQuote[] {
  const age = params.principalAge;
  // Prefer the real per-member list (relationship + age) when supplied - falls back to the
  // plain headcount for callers/insurers that only ever needed a family size.
  const dependants = params.dependants || [];
  const rawDepsCount = params.dependants ? dependants.length : params.dependantsCount;
  const deps = Math.min(5, Math.max(0, rawDepsCount)); // Limit to standard 0-5 indices
  const isMaternity = params.maternityCover;
  const isDentalOpt = params.dentalCover;

  const ageBandStr = getAgeBandKey(age);
  const sizeIdx = deps; // 0 for M, 1 for M+1, etc.
  const selectedIpLimit = params.inpatientLimit;
  const opLimit = params.outpatientLimit;

  // Age multiplier factors
  const ageFactor = age <= 29 ? 0.90 : age <= 39 ? 1.0 : age <= 49 ? 1.15 : age <= 59 ? 1.45 : age <= 65 ? 1.85 : 2.65;

  const quotes: InsuranceQuote[] = [];

  // 1. OLD MUTUAL (AFYAIMARA FAMILY COVER) - real AfyaImara rates price Principal, Spouse and
  // Child individually by their own age (memberRateTable), summed - not a single family-size
  // lookup. Outpatient in the real rate card IS family-size indexed (a hybrid product), so it
  // uses the medicalRateTable/ratesByAgeBand path via resolveAgeBandedFamilyPremium instead.
  const omRateConfig = ratesDb?.rates?.find((r: any) => r.insurerId === "oldmutual");
  const omIpBands = omRateConfig?.medicalRateTable?.inpatientBands;
  const omOpBands = omRateConfig?.medicalRateTable?.outpatientBands;
  const omMemberTable = omRateConfig?.memberRateTable;

  const omIpMatch = findMatchingBand(omIpBands, selectedIpLimit);
  const omTierIdx = omIpMatch?.index ?? -1;
  const omHasMemberTable = !!omMemberTable && omTierIdx !== -1 && Array.isArray(omMemberTable.principal?.[omTierIdx]);

  let omIpPremium = 0;
  if (omHasMemberTable) {
    const omAgeBands = omMemberTable.ageBands?.length ? omMemberTable.ageBands : MEMBER_AGE_BANDS;
    const principalAgeIdx = resolveAgeBandIndex(age, omAgeBands);
    omIpPremium = omMemberTable.principal[omTierIdx][principalAgeIdx] ?? 0;
    for (const dep of dependants) {
      if (dep.relationship === "spouse") {
        const sIdx = resolveAgeBandIndex(dep.age, omAgeBands);
        omIpPremium += omMemberTable.spouse?.[omTierIdx]?.[sIdx] ?? 0;
      } else {
        omIpPremium += omMemberTable.child?.[omTierIdx] ?? 0;
      }
    }
  }

  const omOpMatch = findMatchingBand(omOpBands, opLimit);
  const omOpPremium = omOpMatch ? resolveAgeBandedFamilyPremium(omOpMatch.band, age, sizeIdx, ageFactor) : 0;

  let omAddons = 0;
  if (isMaternity) omAddons += omMemberTable?.maternity?.[omTierIdx] ?? 0;
  if (isDentalOpt) omAddons += omMemberTable?.dental?.[omTierIdx] ?? 0;

  const omBase = Math.round(omIpPremium + omOpPremium + omAddons);
  const omPcf = Math.round(omBase * 0.0025);
  const omTl = Math.round(omBase * 0.0020);
  const omTotal = omBase + omPcf + omTl + 40;

  quotes.push({
    insurerName: "Old Mutual General Insurance Kenya Limited",
    insurerId: "oldmutual",
    rating: "AfyaImara Family Cover - Elite Retail Scheme",
    sumInsured: selectedIpLimit,
    basePremium: omBase,
    pcf: omPcf,
    trainingLevy: omTl,
    stampDuty: 40,
    totalPremium: omTotal,
    excessTerms: "Co-pay KES 2,000 at Nairobi Hospital, Aga Khan, Pandya, Karen, AAR Healthcare & MP Shah. KES 500 all other providers.",
    mainBenefits: [
      `Plan Option: ${omIpMatch?.band?.label || "AfyaImara"} - Inpatient KES ${selectedIpLimit.toLocaleString()}`,
      `Principal and spouse rated individually by their own age; children at a flat member rate`,
      `Outpatient: KES ${opLimit.toLocaleString()} (Comprehensive Care)`,
      "Full coverage for pre-existing, chronic & HIV/AIDS ailments after 1 Year",
      "Lodger fees for accompanying parent covered for children up to 12 years"
    ],
    waitingPeriod: "General Illness: 28 days. Surgical: 60 days. Pre-existing & Congenital: 1 Year.",
    isRecommended: age >= 45,
    recommendationReason: "Old Mutual AfyaImara stands out for senior citizens and middle-aged families with Lifetime renewal guarantees.",
    priceTag: "Top Recommended"
  });


  // 2. JUBILEE HEALTH (J-CARE PREMIUM) - benefit-limit bands are admin-configurable (Database
  // Rates Desk "Medical Rate Table"); falls back to the hardcoded J-Care schedule below for
  // insurers/versions that haven't been given a real band table yet. Where a full per-member
  // rate table is also configured (memberRateTable), this rates each family member individually
  // by their own age - matching Jubilee's real J-Care rate card - rather than one family-size
  // lookup shared with every other insurer here.
  const jubRateConfig = ratesDb?.rates?.find((r: any) => r.insurerId === "jubilee");
  const jubIpBands = jubRateConfig?.medicalRateTable?.inpatientBands;
  const jubOpBands = jubRateConfig?.medicalRateTable?.outpatientBands;
  const jubMemberTable = jubRateConfig?.memberRateTable;

  let jubIpFallbackKey: "500k" | "1m" | "2m" | "3m" | "5m" | "10m" = "1m";
  if (selectedIpLimit <= 500000) jubIpFallbackKey = "500k";
  else if (selectedIpLimit <= 1000000) jubIpFallbackKey = "1m";
  else if (selectedIpLimit <= 2000000) jubIpFallbackKey = "2m";
  else if (selectedIpLimit <= 3000000) jubIpFallbackKey = "3m";
  else if (selectedIpLimit <= 5000000) jubIpFallbackKey = "5m";
  else jubIpFallbackKey = "10m";

  const jubIpResolved = resolveMedicalBand(jubIpBands, selectedIpLimit, sizeIdx, jubIpFallbackKey.toUpperCase(), jubileeInpatient_31_40[jubIpFallbackKey]);

  const jubTierIdx = jubIpResolved.bandIndex;
  const jubHasMemberTable = !!jubMemberTable && jubTierIdx !== -1 && Array.isArray(jubMemberTable.principal?.[jubTierIdx]);

  let jubBase: number;
  let jubBenefitLines: string[];

  if (jubHasMemberTable) {
    // Per-member rating: Principal + Spouse (each by their own age band) + a flat Child rate,
    // then a per-person Outpatient rider (also by own age) for every family member. Age bands are
    // carried on the member table itself (each insurer's real rate card uses its own breakpoints);
    // falls back to the shared J-Care-shaped default when an insurer hasn't customised them.
    const jubAgeBands = jubMemberTable.ageBands?.length ? jubMemberTable.ageBands : MEMBER_AGE_BANDS;
    const jubOpAgeBands = jubMemberTable.outpatientAgeBands?.length ? jubMemberTable.outpatientAgeBands : OUTPATIENT_AGE_BANDS;
    const principalAgeIdx = resolveAgeBandIndex(age, jubAgeBands);
    let total = jubMemberTable.principal[jubTierIdx][principalAgeIdx] ?? 0;

    let spouseCount = 0;
    let childCount = 0;
    for (const dep of dependants) {
      if (dep.relationship === "spouse") {
        const sIdx = resolveAgeBandIndex(dep.age, jubAgeBands);
        total += jubMemberTable.spouse?.[jubTierIdx]?.[sIdx] ?? 0;
        spouseCount++;
      } else {
        total += jubMemberTable.child?.[jubTierIdx] ?? 0;
        childCount++;
      }
    }

    if (jubMemberTable.outpatient) {
      const allAges = [age, ...dependants.map((d) => d.age)];
      for (const a of allAges) {
        const opIdx = resolveAgeBandIndex(a, jubOpAgeBands);
        total += jubMemberTable.outpatient[jubTierIdx]?.[opIdx] ?? 0;
      }
    }

    if (isMaternity) total += jubMemberTable.maternity?.[jubTierIdx] ?? 0;
    if (isDentalOpt) total += (jubMemberTable.dental?.[jubTierIdx] ?? 0) + (jubMemberTable.optical?.[jubTierIdx] ?? 0);

    jubBase = Math.round(total);
    jubBenefitLines = [
      `J-Care Plan Tier: ${jubIpResolved.label}`,
      `Principal rated individually at ${age} yrs${spouseCount ? `, spouse at their own age` : ""}${childCount ? `, ${childCount} ${childCount === 1 ? "child" : "children"} at a flat member rate` : ""}`,
      `Outpatient rider included per-person, bundled with the ${jubIpResolved.label} tier`
    ];
  } else {
    const jubIpPremium = Math.round(jubIpResolved.premium * ageFactor);

    let jubOpFallbackKey: "50k" | "80k" | "100k" | "150k" | "200k" = "100k";
    if (opLimit <= 50000) jubOpFallbackKey = "50k";
    else if (opLimit <= 80000) jubOpFallbackKey = "80k";
    else if (opLimit <= 100000) jubOpFallbackKey = "100k";
    else if (opLimit <= 150000) jubOpFallbackKey = "150k";
    else jubOpFallbackKey = "200k";

    const jubOpResolved = resolveMedicalBand(jubOpBands, opLimit, sizeIdx, jubOpFallbackKey.toUpperCase(), jubileeOutpatient_31_40[jubOpFallbackKey]);
    const jubOpPremium = Math.round(jubOpResolved.premium * ageFactor);

    let jubAddons = 0;
    if (isMaternity) jubAddons += Math.round(34818); // standard J-Care maternity rates
    if (isDentalOpt) jubAddons += Math.round(7151 + 7151); // Dental + Optical co-premiums

    jubBase = Math.round(jubIpPremium + jubOpPremium + jubAddons);
    jubBenefitLines = [
      `J-Care Plan Tier: ${jubIpResolved.label} Inpatient Band`,
      `Age Bracket Rated: ${getAgeBracketLabel(age)} years (${ageFactor.toFixed(2)}x rate factor)`,
      `Outpatient: KES ${opLimit.toLocaleString()} (${jubOpResolved.label} Band)`
    ];
  }

  const jubPcf = Math.round(jubBase * 0.0025);
  const jubTl = Math.round(jubBase * 0.0020);
  const jubTotal = jubBase + jubPcf + jubTl + 40;

  quotes.push({
    insurerName: "Jubilee Health Insurance Limited",
    insurerId: "jubilee",
    rating: "J-Care Premium Plan - AA- Rated (Largest Health Carrier)",
    sumInsured: selectedIpLimit,
    basePremium: jubBase,
    pcf: jubPcf,
    trainingLevy: jubTl,
    stampDuty: 40,
    totalPremium: jubTotal,
    excessTerms: "Co-pay KES 1,000 at Aga Khan, MP Shah, Nairobi Hospital. KES 500 elsewhere.",
    mainBenefits: [
      ...jubBenefitLines,
      "Direct access to Maisha Fiti Wellness loyalty rewards & fitness programs",
      "Organ transplant covered up to policy limits after 3 years wait",
      "Automatic enrollment to seniors plan at age 65 years"
    ],
    waitingPeriod: "General Illness: 30 days. Surgical: 6 months. Maternity: 12 months.",
    isRecommended: age < 45,
    recommendationReason: "Jubilee J-Care is excellent for growing nuclear families. Offers maximum health check-up sublimits.",
    priceTag: "Broker's Direct Pick"
  });


  // 3. AAR INSURANCE (AAR RETAIL MEDICAL PLAN) - AAR's only source document (AAR Individual
  // Cover brochure) publishes benefit tiers/sub-limits/waiting periods/co-pay but NOT a premium
  // rate card, so unlike the other insurers below, no real per-age premium table exists to seed.
  // Tier names, real limits and a placeholder base premium (clearly flagged as an estimate, admin
  // editable) live in medicalRateTable; the age/dependant loading formula is retained as the best
  // available approximation until AAR supplies real rates.
  const aarRateConfig = ratesDb?.rates?.find((r: any) => r.insurerId === "aar");
  const aarIpBands = aarRateConfig?.medicalRateTable?.inpatientBands;
  const aarIpMatch = findMatchingBand(aarIpBands, selectedIpLimit);
  const aarPlanLabel = aarIpMatch?.band?.label || "Cover Me";
  const aarIpBaseVal = aarIpMatch ? (aarIpMatch.band.ratesByFamilySize?.[0] ?? 0) : 0;

  const aarIpPremium = Math.round(aarIpBaseVal * ageFactor * (1 + deps * 0.65));
  const aarOpPremium = Math.round(opLimit * 0.16 * ageFactor * (1 + deps * 0.60));

  let aarAddons = 0;
  if (isMaternity) aarAddons += Math.round(18000 * ageFactor);
  if (isDentalOpt) aarAddons += Math.round(8500);

  const aarBase = Math.round(aarIpPremium + aarOpPremium + aarAddons);
  const aarPcf = Math.round(aarBase * 0.0025);
  const aarTl = Math.round(aarBase * 0.0020);
  const aarTotal = aarBase + aarPcf + aarTl + 40;

  quotes.push({
    insurerName: "AAR Insurance (Kenya) Limited",
    insurerId: "aar",
    rating: "AAR Retail Health - Industry Standard Wellness Leader",
    sumInsured: selectedIpLimit,
    basePremium: aarBase,
    pcf: aarPcf,
    trainingLevy: aarTl,
    stampDuty: 40,
    totalPremium: aarTotal,
    excessTerms: "Co-pay KES 500 at AAR Healthcare, Nairobi Hospital, Aga Khan, Mater, Karen, MP Shah & Gertrude's. KES 200 all other providers.",
    mainBenefits: [
      `AAR Tier: ${aarPlanLabel} Inpatient Cover`,
      "14 days waiting period for Outpatient - shortest in Kenya!",
      "Chronic, pre-existing & congenital conditions covered after 12 months to standard sub-limits",
      "Full inpatient dental & optical accidental emergencies included under Inpatient limits"
    ],
    waitingPeriod: "Outpatient: 14 days. Inpatient Illness: 2 months. Maternity: 12 months. Organ Transplant: 5 years.",
    isRecommended: false,
    recommendationReason: "AAR Retail is recommended for swift outpatient approvals and broad network coverage in cities.",
    priceTag: "Fastest Approvals"
  });


  // 4. APA INSURANCE (JAMII PLUS HEALTH COVER) - real Jamii Plus rates (2023 revision) price
  // Principal and Spouse individually across 7 real age bands (21-40, 41-54, 55-65, 66-70, 71-75,
  // 76-80, plus a flat Child rate) - a per-member structure like Jubilee/Old Mutual, not the old
  // family-size lookup this insurer used to share with everyone else in this file.
  const apaRateConfig = ratesDb?.rates?.find((r: any) => r.insurerId === "apa");
  const apaIpBands = apaRateConfig?.medicalRateTable?.inpatientBands;
  const apaMemberTable = apaRateConfig?.memberRateTable;

  const apaIpMatch = findMatchingBand(apaIpBands, selectedIpLimit);
  const apaTierIdx = apaIpMatch?.index ?? -1;
  const apaHasMemberTable = !!apaMemberTable && apaTierIdx !== -1 && Array.isArray(apaMemberTable.principal?.[apaTierIdx]);

  let apaIpPremium = 0;
  if (apaHasMemberTable) {
    const apaAgeBands = apaMemberTable.ageBands?.length ? apaMemberTable.ageBands : MEMBER_AGE_BANDS;
    const principalAgeIdx = resolveAgeBandIndex(age, apaAgeBands);
    apaIpPremium = apaMemberTable.principal[apaTierIdx][principalAgeIdx] ?? 0;
    for (const dep of dependants) {
      if (dep.relationship === "spouse") {
        const sIdx = resolveAgeBandIndex(dep.age, apaAgeBands);
        apaIpPremium += apaMemberTable.spouse?.[apaTierIdx]?.[sIdx] ?? 0;
      } else {
        apaIpPremium += apaMemberTable.child?.[apaTierIdx] ?? 0;
      }
    }
  }

  // APA sells outpatient as an independently-chosen limit (not bundled with the inpatient tier
  // like Jubilee) - resolved per-member, summed across principal + every dependant by their own age.
  const apaOpPremium = resolveMemberOutpatient(apaMemberTable, apaTierIdx, opLimit, [{ age }, ...dependants.map((d) => ({ age: d.age }))]);

  let apaAddons = 0;
  if (isMaternity) apaAddons += apaMemberTable?.maternity?.[apaTierIdx] ?? 0;
  if (isDentalOpt) apaAddons += (apaMemberTable?.dental?.[apaTierIdx] ?? 0) + (apaMemberTable?.optical?.[apaTierIdx] ?? 0);

  const apaBase = Math.round(apaIpPremium + apaOpPremium + apaAddons);
  const apaPcf = Math.round(apaBase * 0.0025);
  const apaTl = Math.round(apaBase * 0.0020);
  const apaTotal = apaBase + apaPcf + apaTl + 40;

  quotes.push({
    insurerName: "APA Insurance Limited",
    insurerId: "apa",
    rating: "Jamii Plus Health Cover - Reputable Private Underwriting",
    sumInsured: selectedIpLimit,
    basePremium: apaBase,
    pcf: apaPcf,
    trainingLevy: apaTl,
    stampDuty: 40,
    totalPremium: apaTotal,
    excessTerms: "Co-pay KES 500 at AAR Healthcare, Gertrude's, Mater & MP Shah. KES 1,000 at Aga Khan Nairobi & Nairobi Hospital. Zero elsewhere.",
    mainBenefits: [
      `APA Scheme: Jamii Plus Inpatient KES ${selectedIpLimit.toLocaleString()}`,
      "Principal and spouse rated individually by their own age; children at a flat member rate",
      "Zero co-payment at any hospital not listed in the premium top-tier list",
      "Pre-existing / chronic cover & HIV/AIDS included fully after 12 months",
      "Lumpsum Critical Illness payouts of KES 750,000 optional riders"
    ],
    waitingPeriod: "General Illness: 30 days. Pre-existing, Chronic & HIV/AIDS: 12 months. Organ Transplant: 24 months.",
    isRecommended: false,
    recommendationReason: "APA Jamii Plus offers highly attractive rates for young corporate staff and SACCO executives.",
    priceTag: "Zero Co-pay Option"
  });


  // 5. HERITAGE INSURANCE (HeriAfya Cover) - real HeriAfya rates give Principal, Spouse, Child
  // and "Extra" (2nd+ additional child) their own per-age-band rate, summed - a per-member
  // structure like Jubilee's, not a family-size lookup. Outpatient IS family-size indexed in the
  // real rate card, so it uses the medicalRateTable/ratesByAgeBand path instead.
  const heritageRateConfig = ratesDb?.rates?.find((r: any) => r.insurerId === "heritage");
  const heritageIpBands = heritageRateConfig?.medicalRateTable?.inpatientBands;
  const heritageOpBands = heritageRateConfig?.medicalRateTable?.outpatientBands;
  const heritageMemberTable = heritageRateConfig?.memberRateTable;

  const heritageIpMatch = findMatchingBand(heritageIpBands, selectedIpLimit);
  const heritageTierIdx = heritageIpMatch?.index ?? -1;
  const heritageHasMemberTable = !!heritageMemberTable && heritageTierIdx !== -1 && Array.isArray(heritageMemberTable.principal?.[heritageTierIdx]);

  let heritageIp = 0;
  if (heritageHasMemberTable) {
    const heritageAgeBands = heritageMemberTable.ageBands?.length ? heritageMemberTable.ageBands : MEMBER_AGE_BANDS;
    const principalAgeIdx = resolveAgeBandIndex(age, heritageAgeBands);
    heritageIp = heritageMemberTable.principal[heritageTierIdx][principalAgeIdx] ?? 0;
    let childrenSeen = 0;
    for (const dep of dependants) {
      if (dep.relationship === "spouse") {
        const sIdx = resolveAgeBandIndex(dep.age, heritageAgeBands);
        heritageIp += heritageMemberTable.spouse?.[heritageTierIdx]?.[sIdx] ?? 0;
      } else {
        childrenSeen++;
        heritageIp += childrenSeen === 1
          ? (heritageMemberTable.child?.[heritageTierIdx] ?? 0)
          : (heritageMemberTable.extraChild?.[heritageTierIdx] ?? heritageMemberTable.child?.[heritageTierIdx] ?? 0);
      }
    }
  }

  const heritageOpMatch = findMatchingBand(heritageOpBands, opLimit);
  let heritageOp = heritageOpMatch ? resolveAgeBandedFamilyPremium(heritageOpMatch.band, age, sizeIdx, ageFactor) : 0;
  if (isMaternity) heritageOp += heritageMemberTable?.maternity?.[heritageTierIdx] ?? 0;
  if (isDentalOpt) heritageOp += (heritageMemberTable?.dental?.[heritageTierIdx] ?? 0) + (heritageMemberTable?.optical?.[heritageTierIdx] ?? 0);

  const heritageBase = Math.round(heritageIp + heritageOp);
  const heritagePcf = Math.round(heritageBase * 0.0025);
  const heritageTl = Math.round(heritageBase * 0.0020);
  const heritageTotal = heritageBase + heritagePcf + heritageTl + 40;

  quotes.push({
    insurerName: "The Heritage Insurance Company Limited",
    insurerId: "heritage",
    rating: "HeriAfya Better Health - Liberty Group Underwriting",
    sumInsured: selectedIpLimit,
    basePremium: heritageBase,
    pcf: heritagePcf,
    trainingLevy: heritageTl,
    stampDuty: 40,
    totalPremium: heritageTotal,
    excessTerms: "Co-pay KES 1,000 at Aga Khan (Nairobi/Kisumu/Mombasa), Nairobi Hospital, Gertrude's, MP Shah, Mater & Karen Hospital. KES 500 all other providers.",
    mainBenefits: [
      `Inpatient Cover: KES ${selectedIpLimit.toLocaleString()} - ${heritageIpMatch?.band?.label || "Option"}`,
      "Principal and spouse rated individually by their own age; children at a flat member rate",
      "Pre-existing / chronic & congenital conditions covered after 12 months to standard sub-limits",
      "Post-hospitalization treatment covered within 3 weeks of discharge"
    ],
    waitingPeriod: "Acute Illness: 30 days. Pre-existing & Chronic: 12 months. Major Diseases (Cancer/Organ Transplant): 24 months. Maternity: 10 months.",
    isRecommended: false,
    recommendationReason: "Heritage HeriAfya features rapid claims settlement with strong corporate benefits.",
    priceTag: "Standard Choice"
  });


  // 6. STAR DISCOVER INSURANCE (Angaza Afya)
  let starIpBase = 18131;
  let starPlanLabel = "Plan A (KES 650,000)";

  if (selectedIpLimit <= 650000) {
    const table: any = starDiscoverPlanA;
    const band = age > 65 ? "60_65" : ageBandStr;
    const row = table[band] || table["30_39"];
    starIpBase = row[sizeIdx] || row[0];
    starPlanLabel = "Plan A (KES 650,000)";
  } else if (selectedIpLimit <= 1250000) {
    const table: any = starDiscoverPlanB;
    const band = age > 65 ? "60_65" : ageBandStr;
    const row = table[band] || table["30_39"];
    starIpBase = row[sizeIdx] || row[0];
    starPlanLabel = "Plan B (KES 1.25M)";
  } else if (selectedIpLimit <= 2250000) {
    const table: any = starDiscoverPlanC;
    const band = age > 65 ? "60_65" : ageBandStr;
    const row = table[band] || table["30_39"];
    starIpBase = row[sizeIdx] || row[0];
    starPlanLabel = "Plan C (KES 2.25M)";
  } else {
    const table: any = starDiscoverPlanE;
    const band = age > 65 ? "60_65" : ageBandStr;
    const row = table[band] || table["30_39"];
    starIpBase = row[sizeIdx] || row[0];
    starPlanLabel = "Plan E (KES 5.0M)";
  }

  let starOpBase = 0;
  let starOpIdx = 4; // default to 50k (index 4)
  if (opLimit > 150000) starOpIdx = 0; // 200k
  else if (opLimit > 100000) starOpIdx = 1; // 150k
  else if (opLimit > 75000) starOpIdx = 2; // 100k
  else if (opLimit > 50000) starOpIdx = 3; // 75k

  const bandKey = ageBandStr;
  const opRow = (starDiscoverOutpatient as any)[bandKey] || starDiscoverOutpatient["30_39"];
  starOpBase = opRow[starOpIdx] * (1 + deps * 0.70); // Addon family bundling formula

  let starAddons = 0;
  if (isMaternity) {
    starAddons += starOpIdx === 0 ? 36665 : starOpIdx === 1 ? 25655 : starOpIdx === 2 ? 23238 : 17214;
  }
  if (isDentalOpt) {
    starAddons += 5329 + 5164; // Optical 15k & Dental 15k premiums
  }

  const starDiscoverBase = Math.round(starIpBase + starOpBase + starAddons);
  const starDiscoverPcf = Math.round(starDiscoverBase * 0.0025);
  const starDiscoverTl = Math.round(starDiscoverBase * 0.0020);
  const starDiscoverTotal = starDiscoverBase + starDiscoverPcf + starDiscoverTl + 40;

  quotes.push({
    insurerName: "Star Discover Insurance Limited",
    insurerId: "stardiscover",
    rating: "Angaza Afya Family Scheme - Licensed under IRA ID 06/334",
    sumInsured: selectedIpLimit,
    basePremium: starDiscoverBase,
    pcf: starDiscoverPcf,
    trainingLevy: starDiscoverTl,
    stampDuty: 40,
    totalPremium: starDiscoverTotal,
    excessTerms: "KES 500 flat copay Nyali Children's, Avenue, Premier. KES 1,000 Karen & Aga Khan.",
    mainBenefits: [
      `Plan: ${starPlanLabel}`,
      `Outpatient: KES ${opLimit.toLocaleString()} limit`,
      "COVID-19 covered fully up to inpatient limit net of NHIF",
      "Baby friendly vaccines covered at KES 10,000 for children <= 1.5 years",
      "Dental & Optical stand-alone limits computed under Standard panel option"
    ],
    waitingPeriod: "Accidents: Immediate coverage. General Disease: 30 days. Pre-existing & Congenital: 12 months.",
    isRecommended: age < 40,
    recommendationReason: "Star Discover Angaza Afya offers the best rates for young families with high baby immunization limits.",
    priceTag: "Best Value Option"
  });


  // 7. BRITAM (MILELE MEDICAL COVER) - Milele's real rate card prices each benefit-limit band
  // differently at every age bracket AND by family size (M, M+1...M+5) - a genuine age x
  // family-size matrix, not a single base rate scaled by the shared ageFactor. Britam actually
  // sells 4 named tiers (Platinum/Gold/Silver/Bronze); only the flagship Platinum tier is modeled
  // here for now (medicalRateTable doesn't yet support multiple tiers per insurer) - Gold/Silver/
  // Bronze are a follow-up.
  const britamRateConfig = ratesDb?.rates?.find((r: any) => r.insurerId === "britam");
  const britamIpBands = britamRateConfig?.medicalRateTable?.inpatientBands;
  const britamOpBands = britamRateConfig?.medicalRateTable?.outpatientBands;
  const britamMemberTable = britamRateConfig?.memberRateTable;

  const britamIpMatch = findMatchingBand(britamIpBands, selectedIpLimit);
  const britamTierIdx = britamIpMatch?.index ?? -1;
  const britamIp = britamIpMatch ? resolveAgeBandedFamilyPremium(britamIpMatch.band, age, sizeIdx, ageFactor) : 0;
  const britamPlanLabel = britamIpMatch?.band?.label ? `Milele ${britamIpMatch.band.label} (KES ${selectedIpLimit.toLocaleString()} Inpatient)` : "Milele";

  const britamOpMatch = findMatchingBand(britamOpBands, opLimit);
  let britamOp = britamOpMatch ? resolveAgeBandedFamilyPremium(britamOpMatch.band, age, sizeIdx, ageFactor) : 0;
  if (isMaternity) britamOp += britamMemberTable?.maternity?.[britamTierIdx] ?? 0;
  if (isDentalOpt) britamOp += (britamMemberTable?.dental?.[britamTierIdx] ?? 0) + (britamMemberTable?.optical?.[britamTierIdx] ?? 0);

  const britamBase = Math.round(britamIp + britamOp);
  const britamPcf = Math.round(britamBase * 0.0025);
  const britamTl = Math.round(britamBase * 0.0020);
  const britamTotal = britamBase + britamPcf + britamTl + 40;

  quotes.push({
    insurerName: "Britam General Insurance Company (K) Limited",
    insurerId: "britam",
    rating: "Milele Health Plan - Premium Retail Health Package",
    sumInsured: selectedIpLimit,
    basePremium: britamBase,
    pcf: britamPcf,
    trainingLevy: britamTl,
    stampDuty: 40,
    totalPremium: britamTotal,
    excessTerms: "SmartCard co-insurance model: 100% reimbursement within the panel; 80% of customary rates when using a non-panel provider.",
    mainBenefits: [
      `Inpatient Policy: ${britamPlanLabel}`,
      `Outpatient: KES ${opLimit.toLocaleString()} (Cashless SMART card)`,
      "Overseas emergency treatment covered up to 8 weeks on travel",
      "Direct access to Paediatricians & Gynaecologists without GP referral",
      "Accidental injuries covered immediately from policy start day"
    ],
    waitingPeriod: "General Illness/Outpatient/Dental/Optical: 30 days. Pre-existing & Chronic: 12 months. Maternity: 10 months. Organ Transplant: 24 months.",
    isRecommended: age >= 55,
    recommendationReason: "Britam Milele is a wonderful premium choice with strong critical illness pay-out and cash back models.",
    priceTag: "Immersive Seniors Choice"
  });


  // 8. CIC GENERAL INSURANCE (FAMILY MEDISURE) - newly onboarded to the medical quote engine.
  // CIC's real rate card spans 7 named tiers (Essential/Standard/Comprehensive/Superior/Premier/
  // Prestige/Platinum, KES 300K-10M); only the flagship Platinum tier is modeled for now, same
  // simplification as Britam above - the other 6 tiers are extracted but not yet wired in.
  const cicRateConfig = ratesDb?.rates?.find((r: any) => r.insurerId === "cic");
  const cicIpBands = cicRateConfig?.medicalRateTable?.inpatientBands;
  const cicOpBands = cicRateConfig?.medicalRateTable?.outpatientBands;
  const cicMemberTable = cicRateConfig?.memberRateTable;

  const cicIpMatch = findMatchingBand(cicIpBands, selectedIpLimit);
  const cicTierIdx = cicIpMatch?.index ?? -1;
  const cicIp = cicIpMatch ? resolveAgeBandedFamilyPremium(cicIpMatch.band, age, sizeIdx, ageFactor) : 0;

  const cicOpMatch = findMatchingBand(cicOpBands, opLimit);
  let cicOp = cicOpMatch ? resolveAgeBandedFamilyPremium(cicOpMatch.band, age, sizeIdx, ageFactor) : 0;
  if (isMaternity) cicOp += cicMemberTable?.maternity?.[cicTierIdx] ?? 0;
  if (isDentalOpt) cicOp += (cicMemberTable?.dental?.[cicTierIdx] ?? 0) + (cicMemberTable?.optical?.[cicTierIdx] ?? 0);

  const cicBase = Math.round(cicIp + cicOp);
  const cicPcf = Math.round(cicBase * 0.0025);
  const cicTl = Math.round(cicBase * 0.0020);
  const cicTotal = cicBase + cicPcf + cicTl + 40;

  if (cicIpMatch) {
    quotes.push({
      insurerName: "CIC General Insurance Limited",
      insurerId: "cic",
      rating: "Family Medisure - CIC Group Underwriting",
      sumInsured: selectedIpLimit,
      basePremium: cicBase,
      pcf: cicPcf,
      trainingLevy: cicTl,
      stampDuty: 40,
      totalPremium: cicTotal,
      excessTerms: "Standard CIC panel co-payment terms apply per the Family Medisure policy document.",
      mainBenefits: [
        `Plan Tier: ${cicIpMatch.band.label} - Inpatient KES ${selectedIpLimit.toLocaleString()}`,
        `Outpatient: KES ${opLimit.toLocaleString()}`,
        "Family Medisure 2.0 - enhanced limits for chronic conditions including cancer",
        "Seniors Mediplan variant available separately for members aged 60 and above"
      ],
      waitingPeriod: "General Illness: 30 days. Pre-existing & Chronic: 12 months. Maternity: per policy schedule.",
      isRecommended: false,
      recommendationReason: "CIC Family Medisure offers a wide 7-tier plan range from Essential to Platinum, suiting varied budgets.",
      priceTag: "New to Platform"
    });
  }

  // isRecommended above is set independently per insurer against its own age threshold
  // (Old Mutual >=45, Jubilee <45, Star Discover <40, Britam >=55) - those ranges overlap
  // (a 35-year-old satisfies both Jubilee's <45 and Star Discover's <40; a 60-year-old
  // satisfies both Old Mutual's >=45 and Britam's >=55), so two cards could end up
  // highlighted as "the" recommended pick at once. Enforce exactly one winner, preferring
  // the narrower/more specific age band in each overlapping pair.
  quotes.forEach((q: any) => { q.isRecommended = false; });
  const recommendedId = age < 40 ? "stardiscover" : age < 45 ? "jubilee" : age < 55 ? "oldmutual" : "britam";
  const recommendedQuote = quotes.find((q: any) => q.insurerId === recommendedId);
  if (recommendedQuote) recommendedQuote.isRecommended = true;

  // Structured benefit-limit summary for the comparison view - Excess Protector/PVT are a motor
  // concept and don't apply here, so the comparison view shows Inpatient/Outpatient/Maternity/
  // Dental & Optical instead. Same for every insurer since these come straight from the
  // customer's own selections/inputs, not a per-insurer lookup.
  const medicalBenefitsBase = {
    inpatientLimit: selectedIpLimit,
    outpatientLimit: opLimit,
    maternityIncluded: !!isMaternity,
    dentalIncluded: !!isDentalOpt,
    opticalIncluded: !!isDentalOpt
  };
  quotes.forEach((q: any) => { q.medicalBenefits = { ...medicalBenefitsBase }; });

  // CIC is the only insurer with a confirmed, sourced Dental/Optical sub-limit right now -
  // Ksh 30,000 each, per the Platinum tier in "New CIC Family Medisure 2024.pdf" (the only
  // tier this app models for CIC - see the CIC block above). Every other insurer here only
  // tracks whether the customer selected the Dental & Optical addon, not its own KES limit -
  // fabricating a number for them isn't safe without their real rate cards.
  const cicQuote = quotes.find((q: any) => q.insurerId === "cic");
  if (cicQuote) {
    cicQuote.medicalBenefits = { ...cicQuote.medicalBenefits, dentalLimit: 30000, opticalLimit: 30000 };
  }

  if (ratesDb && ratesDb.rates) {
    const levies = ratesDb.levies || { pcfRate: 0.0025, itlRate: 0.0020, stampDuty: 40 };
    // Publish toggle: an insurer explicitly unchecked from public quoting in the Database Rates
    // Desk is pulled out of medical results too, not just motor. Insurers with no rate record at
    // all are unaffected (not everything here is admin-managed - see calculateDynamicMedicalQuotes).
    return quotes
      .filter((q: any) => {
        const underwriterRates = ratesDb.rates.find((r: any) => r.insurerId === q.insurerId);
        return !underwriterRates || underwriterRates.isPublished !== false;
      })
      .map((q: any) => {
        const underwriterRates = ratesDb.rates.find((r: any) => r.insurerId === q.insurerId);
        if (!underwriterRates) return q;

        const multiplier = underwriterRates.medicalMultiplier ?? 1.0;
        const basePremium = Math.round(q.basePremium * multiplier);
        const pcf = Math.round(basePremium * levies.pcfRate);
        const trainingLevy = Math.round(basePremium * levies.itlRate);
        const totalPremium = basePremium + pcf + trainingLevy + levies.stampDuty;

        return {
          ...q,
          basePremium,
          pcf,
          trainingLevy,
          stampDuty: levies.stampDuty,
          totalPremium
        };
      });
  }

  return quotes;
}
