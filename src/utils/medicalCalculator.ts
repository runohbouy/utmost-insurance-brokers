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
 * 2. Britam - "MILELE HEALTH PLAN"
 */
const britamInpatient = {
  "500k": [14731, 25041, 29460, 33880, 38299, 42718],
  "300k": [8793, 14947, 17585, 20223, 22861, 25499],
  "200k": [6395, 10871, 12789, 14707, 16626, 18544],
  "100k": [5598, 9516, 11195, 12874, 14554, 16233]
};

const britamOutpatient = {
  "60k": [15073, 25624, 30146, 34667, 39189, 43711],
  "50k": [12447, 21159, 24893, 28627, 32361, 36095],
  "40k": [11362, 19314, 22724, 26133, 29543, 32952],
  "30k": [10702, 18193, 21403, 24614, 27824, 31000],
  "25k": [10249, 17424, 20499, 23574, 26500, 29500]
};


/**
 * 3. CIC General Insurance - "FAMILY MEDISURE"
 */
const cicInpatientPlat = { // 10M Limit
  "19_29": [48070, 76114, 101249, 123594, 143576, 160555],
  "30_39": [64339, 101876, 135518, 165426, 192171, 214896],
  "40_49": [68453, 108389, 144182, 176002, 204457, 228635],
  "50_59": [86244, 136560, 181657, 221747, 257597, 288059],
};

const cicInpatientComprehensive = { // 1M Limit
  "19_29": [23617, 37395, 49744, 60722, 70539, 78880],
  "30_39": [32472, 51417, 68396, 83490, 96989, 108458],
  "40_49": [37926, 60053, 79884, 97513, 113279, 126744],
  "50_59": [53999, 85503, 113739, 138840, 161287, 180360],
};

const cicOutpatientPlat = { // 300K limit
  "19_29": [45913, 79126, 96906, 114884, 132908, 150245],
  "30_39": [61888, 106656, 130623, 154857, 179151, 202521],
  "40_49": [74537, 128455, 157319, 186507, 215767, 243913],
  "50_59": [85958, 148138, 181425, 215085, 248828, 281287]
};


/**
 * 4. Heritage Insurance - "HERIAFYA COVER"
 */
const heritagePlanA = {
  "18_30": [13500, 11475, 8438, 6750], // Principal, Spouse, Child, Extra
  "31_40": [20250, 17213, 8438, 6750],
  "41_50": [23625, 20081, 8438, 6750],
  "51_60": [27000, 22950, 8438, 6750],
  "61_70": [40500, 34425, 8438, 6750]
};

const heritagePlanC = {
  "18_30": [21600, 18360, 13500, 10800],
  "31_40": [32400, 27540, 13500, 10800],
  "41_50": [37800, 32130, 13500, 10800],
  "51_60": [43200, 36720, 13500, 10800],
  "61_70": [64800, 55080, 13500, 10800]
};

const heritageOutpatient50k = [35269, 45849, 46996, 48170, 49375, 49700];
const heritageOutpatient100k = [38475, 59636, 68582, 78869, 90699, 99000];


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

// =================================---------
// ADDITIONAL RATING TABLES
// =================================---------

const oldMutualInpatient_30_40 = {
  "500k": [33863, 58886, 72815, 86744, 100673, 114602],
  "1m": [35223, 62008, 79110, 96212, 113314, 130416],
  "3m": [52342, 92799, 119594, 146389, 173184, 199979],
  "5m": [56437, 104236, 132732, 161228, 189724, 218220],
  "10m": [64692, 113428, 145006, 176584, 208162, 239740]
};

const oldMutualOutpatient = {
  "50k": [32934, 44986, 48748, 48797, 48846, 49339],
  "60k": [33266, 49269, 54844, 55910, 57804, 58095],
  "100k": [35226, 66533, 82895, 98147, 98245, 99000],
  "150k": [37892, 70452, 88794, 106762, 121829, 136895],
  "200k": [41512, 77987, 92489, 111223, 126966, 142709]
};

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

const apaInpatient_30_39 = {
  "500k": [19404, 34927, 43697, 52467, 61237, 70007],
  "1m": [27166, 48899, 61177, 73455, 85733, 98011],
  "2m": [32017, 57631, 72101, 86571, 101041, 115511],
  "3m": [35112, 63202, 79071, 94940, 110809, 126678],
  "5m": [38808, 69854, 87393, 104932, 122471, 140010],
  "10m": [54331, 97796, 129586, 161376, 193166, 224956]
};

const apaOutpatient_30_39 = {
  "50k": [23447, 43836, 64225, 84614, 105003, 125392],
  "75k": [27416, 51256, 75096, 98936, 122776, 146616],
  "100k": [33086, 61856, 90626, 119396, 148166, 176936],
  "150k": [43011, 80413, 117815, 155217, 192619, 230021],
  "200k": [48612, 93229, 137846, 182463, 227080, 271697]
};

/**
 * Main Medical Underwriting Matrix Calculator Engine
 */
export function calculateDynamicMedicalQuotes(params: MedicalQuoteParams, ratesDb?: any): InsuranceQuote[] {
  const age = params.principalAge;
  const deps = Math.min(5, Math.max(0, params.dependantsCount)); // Limit to standard 0-5 indices
  const isMaternity = params.maternityCover;
  const isDentalOpt = params.dentalCover;

  const ageBandStr = getAgeBandKey(age);
  const sizeIdx = deps; // 0 for M, 1 for M+1, etc.
  const selectedIpLimit = params.inpatientLimit;
  const opLimit = params.outpatientLimit;

  // Age multiplier factors
  const ageFactor = age <= 29 ? 0.90 : age <= 39 ? 1.0 : age <= 49 ? 1.15 : age <= 59 ? 1.45 : age <= 65 ? 1.85 : 2.65;

  const quotes: InsuranceQuote[] = [];

  // 1. OLD MUTUAL (AFYAIMARA FAMILY COVER)
  let omIpKey: "500k" | "1m" | "3m" | "5m" | "10m" = "1m";
  if (selectedIpLimit <= 500000) omIpKey = "500k";
  else if (selectedIpLimit <= 1000000) omIpKey = "1m";
  else if (selectedIpLimit <= 3000000) omIpKey = "3m";
  else if (selectedIpLimit <= 5000000) omIpKey = "5m";
  else omIpKey = "10m";

  const omIpRow = oldMutualInpatient_30_40[omIpKey];
  const omIpPremium = Math.round((omIpRow[sizeIdx] || omIpRow[omIpRow.length - 1]) * (ageFactor / 1.0));

  let omOpKey: "50k" | "60k" | "100k" | "150k" | "200k" = "100k";
  if (opLimit <= 50000) omOpKey = "50k";
  else if (opLimit <= 60000) omOpKey = "60k";
  else if (opLimit <= 100000) omOpKey = "100k";
  else if (opLimit <= 150000) omOpKey = "150k";
  else omOpKey = "200k";

  const omOpRow = oldMutualOutpatient[omOpKey];
  const omOpPremium = Math.round((omOpRow[sizeIdx] || omOpRow[omOpRow.length - 1]) * (ageFactor / 1.0));

  let omAddons = 0;
  if (isMaternity) omAddons += Math.round(18000 * ageFactor);
  if (isDentalOpt) omAddons += Math.round(16176); // fixed dental & optical premium for Seniors/Families

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
    excessTerms: "Co-pay KES 2,000 at Nairobi Hospital, Karen, & Aga Khan. KES 500 other centers.",
    mainBenefits: [
      `Plan Level: AfyaImara Inpatient KES ${selectedIpLimit.toLocaleString()}`,
      `Outpatient: KES ${opLimit.toLocaleString()} (Comprehensive Care)`,
      "Meds on wheels platform included for direct home-delivery medicines",
      "Full coverage for pre-existing, chronic & HIV/AIDS ailments after 1 Year",
      "Lodger fees for accompanying parent covered for children up to 12 years"
    ],
    waitingPeriod: "General Illness: 28 days. Pre-existing & Congenital: 1 Year. Accidents: Immediate.",
    isRecommended: age >= 45,
    recommendationReason: "Old Mutual AfyaImara stands out for senior citizens and middle-aged families with Lifetime renewal guarantees.",
    priceTag: "Top Recommended"
  });


  // 2. JUBILEE HEALTH (J-CARE PREMIUM)
  let jubIpKey: "500k" | "1m" | "2m" | "3m" | "5m" | "10m" = "1m";
  if (selectedIpLimit <= 500000) jubIpKey = "500k";
  else if (selectedIpLimit <= 1000000) jubIpKey = "1m";
  else if (selectedIpLimit <= 2000000) jubIpKey = "2m";
  else if (selectedIpLimit <= 3000000) jubIpKey = "3m";
  else if (selectedIpLimit <= 5000000) jubIpKey = "5m";
  else jubIpKey = "10m";

  const jubIpRow = jubileeInpatient_31_40[jubIpKey];
  const jubIpPremium = Math.round((jubIpRow[sizeIdx] || jubIpRow[jubIpRow.length - 1]) * ageFactor);

  let jubOpKey: "50k" | "80k" | "100k" | "150k" | "200k" = "100k";
  if (opLimit <= 50000) jubOpKey = "50k";
  else if (opLimit <= 80000) jubOpKey = "80k";
  else if (opLimit <= 100000) jubOpKey = "100k";
  else if (opLimit <= 150000) jubOpKey = "150k";
  else jubOpKey = "200k";

  const jubOpRow = jubileeOutpatient_31_40[jubOpKey];
  const jubOpPremium = Math.round((jubOpRow[sizeIdx] || jubOpRow[jubOpRow.length - 1]) * ageFactor);

  let jubAddons = 0;
  if (isMaternity) jubAddons += Math.round(34818); // standard J-Care maternity rates
  if (isDentalOpt) jubAddons += Math.round(7151 + 7151); // Dental + Optical co-premiums

  const jubBase = Math.round(jubIpPremium + jubOpPremium + jubAddons);
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
      `J-Care Category: ${jubIpKey.toUpperCase()} Option`,
      `Outpatient: KES ${opLimit.toLocaleString()} (Standalone option)`,
      "Direct access to Maisha Fiti Wellness loyalty rewards & fitness programs",
      "Organ transplant covered up to policy limits after 3 years wait",
      "Automatic enrollment to seniors plan at age 65 years"
    ],
    waitingPeriod: "General Illness: 30 days. Surgical: 6 months. Maternity: 12 months.",
    isRecommended: age < 45,
    recommendationReason: "Jubilee J-Care is excellent for growing nuclear families. Offers maximum health check-up sublimits.",
    priceTag: "Broker's Direct Pick"
  });


  // 3. AAR INSURANCE (AAR RETAIL MEDICAL PLAN)
  let aarIpBaseVal = 24000;
  let aarPlanLabel = "Silver";
  if (selectedIpLimit <= 1000000) {
    aarIpBaseVal = 18500;
    aarPlanLabel = "Cover Me";
  } else if (selectedIpLimit <= 3000000) {
    aarIpBaseVal = 28000;
    aarPlanLabel = "Bronze";
  } else if (selectedIpLimit <= 8000000) {
    aarIpBaseVal = 32000;
    aarPlanLabel = "Silver";
  } else if (selectedIpLimit <= 12000000) {
    aarIpBaseVal = 42000;
    aarPlanLabel = "Silver Plus";
  } else {
    aarIpBaseVal = 56000;
    aarPlanLabel = "Platinum";
  }

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
    excessTerms: "Co-pay KES 500 at AAR Health Centers, Nairobi Hospital, MP Shah. KES 200 elsewhere.",
    mainBenefits: [
      `AAR Tier: ${aarPlanLabel} Inpatient Cover`,
      "14 days waiting period for Outpatient - shortest in Kenya!",
      "Chronic & Pre-existing conditions covered up to standard sublimits",
      "Full inpatient dental & optical accidental emergencies included under Inpatient limits"
    ],
    waitingPeriod: "Outpatient: 14 days. Inpatient Illness: 2 months. Maternity: 12 months.",
    isRecommended: false,
    recommendationReason: "AAR Retail is recommended for swift outpatient approvals and broad network coverage in cities.",
    priceTag: "Fastest Approvals"
  });


  // 4. APA INSURANCE (JAMII PLUS HEALTH COVER)
  let apaIpKey: "500k" | "1m" | "2m" | "3m" | "5m" | "10m" = "1m";
  if (selectedIpLimit <= 500000) apaIpKey = "500k";
  else if (selectedIpLimit <= 1000000) apaIpKey = "1m";
  else if (selectedIpLimit <= 2000000) apaIpKey = "2m";
  else if (selectedIpLimit <= 3000000) apaIpKey = "3m";
  else if (selectedIpLimit <= 5000000) apaIpKey = "5m";
  else apaIpKey = "10m";

  const apaIpRow = apaInpatient_30_39[apaIpKey];
  const apaIpPremium = Math.round((apaIpRow[sizeIdx] || apaIpRow[apaIpRow.length - 1]) * ageFactor);

  let apaOpKey: "50k" | "75k" | "100k" | "150k" | "200k" = "100k";
  if (opLimit <= 50000) apaOpKey = "50k";
  else if (opLimit <= 75000) apaOpKey = "75k";
  else if (opLimit <= 100000) apaOpKey = "100k";
  else if (opLimit <= 150000) apaOpKey = "150k";
  else apaOpKey = "200k";

  const apaOpRow = apaOutpatient_30_39[apaOpKey];
  const apaOpPremium = Math.round((apaOpRow[sizeIdx] || apaOpRow[apaOpRow.length - 1]) * ageFactor);

  let apaAddons = 0;
  if (isMaternity) apaAddons += Math.round(15000 * ageFactor);
  if (isDentalOpt) apaAddons += Math.round(9510);

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
    excessTerms: "Co-pay KES 500 flat at Nairobi Hospital, MP Shah, Aga Khan, Mater, and AAR. Zero elsewhere.",
    mainBenefits: [
      `APA Scheme Option: Jamii Plus Inpatient`,
      "Zero co-payment at any hospital not listed in premium top-tier list",
      "Pre-existing / chronic cover & HIV/AIDS included fully after 12 months",
      "Lumpsum Critical Illness payouts of KES 750,000 optional riders"
    ],
    waitingPeriod: "General Illness: 30 days. Surgical: 90 days. Pre-existing & Congenital: 12 months.",
    isRecommended: false,
    recommendationReason: "APA Jamii Plus offers highly attractive rates for young corporate staff and SACCO executives.",
    priceTag: "Zero Co-pay Option"
  });


  // 5. HERITAGE INSURANCE (HeriAfya Cover)
  let heritageIp = 13500;
  if (selectedIpLimit <= 500000) {
    const band = age > 60 ? "61_70" : ageBandStr === "50_59" ? "51_60" : ageBandStr === "40_49" ? "41_50" : "18_30";
    const row = heritagePlanA[band as keyof typeof heritagePlanA] || heritagePlanA["18_30"];
    heritageIp = row[0] + (deps > 0 ? row[1] + (deps - 1) * row[2] : 0);
  } else {
    const band = age > 60 ? "61_70" : ageBandStr === "50_59" ? "51_60" : ageBandStr === "40_49" ? "41_50" : "18_30";
    const row = heritagePlanC[band as keyof typeof heritagePlanC] || heritagePlanC["18_30"];
    heritageIp = row[0] + (deps > 0 ? row[1] + (deps - 1) * row[2] : 0);
    if (selectedIpLimit > 2000000) {
      heritageIp = Math.round(heritageIp * 1.8);
    }
  }

  let heritageOp = opLimit > 75000 ? heritageOutpatient100k[Math.min(5, deps)] : heritageOutpatient50k[Math.min(5, deps)];
  if (isMaternity) heritageOp += 15000;
  if (isDentalOpt) heritageOp += 6800;

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
    excessTerms: "Co-pay KES 1,000 for top-tier hospitals. KES 500 for other network clinics.",
    mainBenefits: [
      `Inpatient Cover: KES ${selectedIpLimit.toLocaleString()}`,
      "Pre-existing / chronic & congenital limits up to KES 500,000 covered fully after 1 Year",
      "Post-hospitalization treatment covered within 3 weeks of discharge",
      "Funeral expenses per member (death due to covered medical conditions) up to KES 100K included"
    ],
    waitingPeriod: "Acute Illness: 30 days. Pre-existing & Oncology: 12 months. Maternity: 10 months.",
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


  // 7. BRITAM (MILELE MEDICAL COVER)
  let britamIp = 14731;
  let britamPlanLabel = "Milele Platinum (KES 500k Inpatient)";
  if (selectedIpLimit <= 100000) {
    const row = britamInpatient["100k"];
    britamIp = row[sizeIdx] || row[row.length - 1];
    britamPlanLabel = "Milele Essential (100k Inpatient Limit)";
  } else if (selectedIpLimit <= 200000) {
    const row = britamInpatient["200k"];
    britamIp = row[sizeIdx] || row[row.length - 1];
    britamPlanLabel = "Milele Bronze (200k Inpatient Limit)";
  } else if (selectedIpLimit <= 300000) {
    const row = britamInpatient["300k"];
    britamIp = row[sizeIdx] || row[row.length - 1];
    britamPlanLabel = "Milele Silver (300k Inpatient Limit)";
  } else {
    const row = britamInpatient["500k"];
    let rate = row[sizeIdx] || row[row.length - 1];
    if (selectedIpLimit > 2000000) {
      rate = rate * 2.8; // load for 2M+
      britamPlanLabel = "Milele Executive (2.5M Inpatient Limit)";
    } else if (selectedIpLimit > 500000) {
      rate = rate * 1.6; // load for 1M
      britamPlanLabel = "Milele Gold (1.0M Inpatient Limit)";
    } else {
      britamPlanLabel = "Milele Platinum (500k Inpatient Limit)";
    }
    britamIp = rate;
  }

  // Britam outpatient family rates from matrix
  let britamOpLimitLabel = "25k";
  if (opLimit > 50000) britamOpLimitLabel = "60k";
  else if (opLimit > 40000) britamOpLimitLabel = "50k";
  else if (opLimit > 30000) britamOpLimitLabel = "40k";
  else if (opLimit > 25000) britamOpLimitLabel = "30k";

  const opRowBritam = (britamOutpatient as any)[britamOpLimitLabel] || britamOutpatient["25k"];
  let britamOp = opRowBritam[sizeIdx] || opRowBritam[opRowBritam.length - 1];

  let britamAddons = 0;
  if (isMaternity) britamAddons += 12500;
  if (isDentalOpt) britamAddons += 4500;

  const britamBase = Math.round(britamIp + britamOp + britamAddons);
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
    excessTerms: "Co-pay KES 500 at Tier 2 and KES 1,500 at Tier 1 (Nairobi, Aga Khan, Karen).",
    mainBenefits: [
      `Inpatient Policy: ${britamPlanLabel}`,
      `Outpatient: KES ${opLimit.toLocaleString()} (Cashless SMART card)`,
      "Overseas emergency treatment covered up to 8 weeks on travel",
      "Executive suite inpatient accommodations options available",
      "Accidental injuries covered immediately from policy start day"
    ],
    waitingPeriod: "General Illness: 30 days wait. Maternity: 10 months. Organ Transplant: 2 Years.",
    isRecommended: age >= 55,
    recommendationReason: "Britam Milele is a wonderful premium choice with strong critical illness pay-out and cash back models.",
    priceTag: "Immersive Seniors Choice"
  });

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
