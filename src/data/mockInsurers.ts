export interface InsurerProfile {
  id: string;
  name: string;
  tradingName: string;
  logoEmoji: string;
  established: number;
  licenseYear: number;
  licenseStatus: "Active" | "Under Review";
  iraLicenseMotor: string;
  iraLicenseMedical: string;
  odpcRegistered: boolean;
  memberOfAibk: boolean;
  rating: string;
  strengthReason: string;
  availableProducts: string[];
  claimTurnaroundDays: number;
  emergencyPhone: string;
  // IRA class codes (see IRA_CLASS_LABELS below) this insurer is authorised to transact,
  // per the IRA "Licensed Entities" 2026 notice. Omitted where no confident match to that
  // notice was found (e.g. an insurer's general-insurance arm wasn't listed under this name) -
  // treat missing/undefined as "unrestricted / not yet verified" rather than "not licensed".
  licensedGeneralClasses?: string[];
  licensedLifeClasses?: string[];
}

// IRA class codes from the Insurance Act (Cap 487) "Licensed Entities" 2026 notice.
// General Insurance Business classes are 2-digit codes; Long-Term (Life) Insurance
// Business classes are numbered 31-37 (33 and 37 split into a/b sub-classes).
export const IRA_CLASS_LABELS: Record<string, string> = {
  "01": "Aviation",
  "02": "Engineering",
  "03": "Fire Domestic",
  "04": "Fire Industrial",
  "05": "Liability",
  "06": "Marine",
  "07": "Motor Private",
  "08": "Motor Commercial",
  "09": "Personal Accident",
  "10": "Theft",
  "11": "Workmen's Compensation (WIBA)",
  "12": "Medical",
  "13": "Micro Insurance",
  "14": "Miscellaneous",
  "31": "Life Assurance",
  "32": "Annuities",
  "33a": "Personal Pension",
  "33b": "Deposit Administration",
  "34": "Group Life",
  "35": "Group Credit",
  "36": "Permanent Health",
  "37a": "Unit-Linked Investment",
  "37b": "Non-Linked Investment"
};

export const mockInsurers: InsurerProfile[] = [
  {
    id: "jubilee",
    // Per IRA Licensed Entities 2026 notice: there is no "Jubilee Insurance Company of Kenya
    // Limited" in either the General or Long-Term insurer lists. The two real Jubilee entities
    // are "Jubilee Health Insurance Limited" (General, class 12/Medical ONLY - no Motor 07/08,
    // no Fire 03/04) and "Jubilee Life Insurance Limited" (Long-Term, classes 31-35 & 37a,
    // a separate entity not modeled here). Restricted to Medical-only per class 12 licensing -
    // Motor/Domestic Package/Group Life removed from availableProducts and the live quote
    // engines (server.ts motor list, RoomAnalyzerView Domestic Package carriers).
    name: "Jubilee Health Insurance Limited",
    tradingName: "Jubilee Health Insurance",
    logoEmoji: "🌍",
    established: 1937,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "Not Licensed for Motor (classes 07/08 not held)",
    iraLicenseMedical: "IRA/12/032/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "A+ Rated (AM Best credit assessment)",
    strengthReason: "Market leader with largest asset reserve, direct digital system integration, and rapid outpatient checkups.",
    availableProducts: ["Family Medical Schemes"],
    licensedGeneralClasses: ["12"],
    claimTurnaroundDays: 5,
    emergencyPhone: "+254 703 300000"
  },
  {
    id: "icea",
    name: "ICEA LION General Insurance Company Limited",
    tradingName: "ICEA LION Group",
    logoEmoji: "🦁",
    established: 1964,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/154/2026",
    iraLicenseMedical: "IRA/12/029/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "A Rated (Global Credit Ratings agency GCR)",
    strengthReason: "Highly recommended for property coverage, contents inventories, and generous multi-vehicle premium discounts.",
    availableProducts: ["Motor Commercial Goods", "Erection All Risks", "Standard Domestic Package", "Marine Open Cargo Sea/Air"],
    // Per IRA notice: ICEA LION General is licensed 01-12 & 14 (full general breadth);
    // ICEA LION Life Assurance Company Limited (separate entity) covers the life side.
    licensedGeneralClasses: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    licensedLifeClasses: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"],
    claimTurnaroundDays: 6,
    emergencyPhone: "+254 719 071000"
  },
  {
    id: "heritage",
    // Corrected per IRA Licensed Entities 2026 notice, which lists this entity as
    // "The Heritage Insurance Company Limited" (leading "The", no "Kenya").
    name: "The Heritage Insurance Company Limited",
    tradingName: "Heritage Insurance",
    logoEmoji: "🐆",
    established: 1976,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/201/2026",
    iraLicenseMedical: "IRA/12/014/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "A- Rated (Excellent claims honoring reputation)",
    strengthReason: "Guaranteed tow cover within 45 mins in major towns and highly flexible medical co-pay reductions.",
    availableProducts: ["Motor Private", "Individual Health Scheme", "Domestic Package", "Contractors All Risks"],
    // Per IRA notice: The Heritage Insurance Company Limited is licensed 01-12 & 14
    // (full general breadth). No separate Heritage life entity is listed.
    licensedGeneralClasses: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    claimTurnaroundDays: 4,
    emergencyPhone: "+254 711 037000"
  },
  {
    id: "britam",
    // Corrected: "Britam Holdings PLC" is the parent listed holding company, not the licensed
    // underwriter. Per IRA Licensed Entities 2026 notice, the entity actually authorised to
    // transact the General/Motor business this profile represents is "Britam General Insurance
    // Company (K) Limited" (life business sits under the separate "Britam Life Assurance
    // Company (K) Limited", already reflected in licensedLifeClasses below).
    name: "Britam General Insurance Company (K) Limited",
    tradingName: "Britam",
    logoEmoji: "🛡️",
    established: 1965,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/110/2026",
    iraLicenseMedical: "IRA/12/045/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "A Rated (Excellent long-term stability)",
    strengthReason: "With you every step of the way. Market leader in asset management and comprehensive individual life planning covers.",
    availableProducts: ["Motor Private", "Individual Health Scheme", "Domestic Package", "Group Life Schemes"],
    // Per IRA notice: Britam General Insurance Company (K) Limited is licensed 01-12 & 14
    // (full general breadth); Britam Life Assurance Company (K) Limited covers the life side
    // (full breadth incl. Permanent Health/36); Britam Microinsurance covers class 13 separately.
    licensedGeneralClasses: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    licensedLifeClasses: ["31", "32", "33a", "33b", "34", "35", "36", "37a", "37b"],
    claimTurnaroundDays: 4,
    emergencyPhone: "+254 705 100100"
  },
  {
    id: "cic",
    name: "CIC General Insurance Limited",
    tradingName: "CIC Group",
    logoEmoji: "🤝",
    established: 1978,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/232/2026",
    iraLicenseMedical: "IRA/12/006/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "BBB+ Rated (Highly resilient micro-insurer)",
    strengthReason: "Popular choices with broad SACCO relationships, pocket-friendly premiums, and low waiting thresholds.",
    availableProducts: ["Motor Private", "SME Medical schemes", "Burglary & Perils", "Crop Insurance"],
    // Per IRA notice: CIC General Insurance Limited is licensed 02-12 & 14 (no Aviation/01);
    // CIC Life Assurance Limited covers the life side; CIC Microinsurance covers class 13 separately.
    licensedGeneralClasses: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    licensedLifeClasses: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"],
    claimTurnaroundDays: 8,
    emergencyPhone: "+254 703 099121"
  },
  {
    id: "madison",
    // Split from a single blended "Madison" profile into the two real, separately-licensed
    // entities (matching the Jubilee precedent above): this one is the General arm - motor,
    // medical, fire etc. - and does NOT sell life products. See "madison-life" below for the
    // Long-Term arm. Previously this single entry was branded "Madison Life Assurance" while
    // actually offering Motor Private/SME Medical/Burglary/Crop Insurance - a life-branded
    // name showing general products, which is exactly the kind of mismatch being corrected.
    name: "Madison General Insurance Kenya Limited",
    tradingName: "Madison General Insurance",
    logoEmoji: "🏢",
    established: 1988,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/188/2026",
    iraLicenseMedical: "IRA/12/055/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "BBB+ Rated (Highly responsive retail insurer)",
    strengthReason: "Strong SME and retail general insurance book with fast claims approval across motor, medical and property lines.",
    availableProducts: ["Motor Private", "SME Medical schemes", "Burglary & Perils", "Crop Insurance"],
    // Per IRA notice: Madison General Insurance Kenya Limited is licensed 02-12 & 14 (no Aviation/01).
    licensedGeneralClasses: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    claimTurnaroundDays: 5,
    emergencyPhone: "+254 709 922000"
  },
  {
    id: "madison-life",
    name: "Madison Life Assurance Kenya Limited",
    tradingName: "Madison Life",
    logoEmoji: "🏢",
    established: 1988,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "Not Licensed (Long Term Insurer only - no General class authorisation)",
    iraLicenseMedical: "Not Licensed (Long Term Insurer only - no General class authorisation)",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "BBB+ Rated (Established long-term underwriter)",
    strengthReason: "Pioneers in high-value group life plans and flexible school fees educational policies, with fast claims approval.",
    availableProducts: ["Life Assurance", "Group Life Schemes", "Personal Pension", "Deposit Administration", "Group Credit Life"],
    // Per IRA notice: Madison Life Assurance Kenya Limited is a separate Long-Term-only entity,
    // licensed for classes 31, 33a, 33b, 34, 35, 37a, 37b - no General class authorisation, so it
    // must never appear as an option for motor, medical, or any other general-class product.
    licensedLifeClasses: ["31", "33a", "33b", "34", "35", "37a", "37b"],
    claimTurnaroundDays: 6,
    emergencyPhone: "+254 709 922010"
  },
  {
    id: "kenindia",
    name: "Kenindia Assurance Company Limited",
    tradingName: "Kenindia Assurance",
    logoEmoji: "🐘",
    established: 1978,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/189/2026",
    iraLicenseMedical: "IRA/12/077/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "BBB Rated (Unsurpassed corporate liability stability)",
    strengthReason: "Favored list for large-scale parastatals, municipal transport, and machinery breakdown schemes.",
    availableProducts: ["Motor Commercial Cartage", "Industrial All Risks", "Group Medical Schemes", "Public Liability"],
    // Per IRA notice: Kenindia Assurance Company Limited appears under the same name in BOTH the
    // General (01-12 & 14, full breadth) and Long-Term (31,32,33a,33b,34,35,37b) lists - a genuinely
    // dual-licensed single entity, unlike Britam/Madison/CIC which split general and life into
    // separately-named sister companies.
    licensedGeneralClasses: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    licensedLifeClasses: ["31", "32", "33a", "33b", "34", "35", "37b"],
    claimTurnaroundDays: 7,
    emergencyPhone: "+254 722 204125"
  },
  {
    id: "geminia",
    name: "Geminia Insurance Company Limited",
    tradingName: "Geminia Insurance",
    logoEmoji: "💎",
    established: 1981,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/102/2026",
    iraLicenseMedical: "IRA/12/011/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "BBB Rated (Excellent corporate & retail reputation)",
    strengthReason: "Strong asset reserve, known for flexible sum-insured bands with zero body-type penalties.",
    // Per IRA notice: Geminia Insurance Company Limited (general) is licensed 01-11 & 14 -
    // notably NOT class 12 Medical, so "Individual Health Scheme" was removed from the products
    // list below (it's a separate Geminia Life Insurance Company Limited entity that holds
    // classes 31,33a,33b,34,35,37a and doesn't sell individual medical schemes either).
    availableProducts: ["Motor Private", "Domestic Package", "Fire & Perils", "Personal Accident"],
    licensedGeneralClasses: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"],
    licensedLifeClasses: ["31", "33a", "33b", "34", "35", "37a"],
    claimTurnaroundDays: 6,
    emergencyPhone: "+254 709 883000"
  },
  {
    id: "mua",
    // Corrected per IRA Licensed Entities 2026 notice: "MUA Insurance (Kenya) Limited"
    // (parenthesised "(Kenya)", not "Kenya" run into the name).
    name: "MUA Insurance (Kenya) Limited",
    tradingName: "MUA Insurance",
    logoEmoji: "🇲🇺",
    established: 1952,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/167/2026",
    iraLicenseMedical: "IRA/12/089/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "A Rated (Excellent solvency and local claim honoring speed)",
    strengthReason: "Renowned for robust commercial transport portfolios, institutional schedules, and comprehensive windscreen buyback structures.",
    // Per IRA Licensed Entities 2026 notice, MUA is authorised for classes 01-12 & 14
    // (Aviation, Engineering, Fire Domestic/Industrial, Liability, Marine, Motor Private/Commercial,
    // Personal Accident, Theft, WIBA, Medical, Miscellaneous) - near the full general insurance breadth.
    availableProducts: ["Motor Private", "Motor Commercial Goods", "Motor Commercial General Cartage", "Institutional Group Motor", "Domestic Package", "Fire & Perils", "Marine Cargo", "Personal Accident", "Medical Insurance", "Work Injury Benefits (WIBA)"],
    licensedGeneralClasses: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    claimTurnaroundDays: 5,
    emergencyPhone: "+254 703 021000"
  },
  {
    id: "cannon",
    // Corrected per IRA Licensed Entities 2026 notice: "Cannon General Insurance Company
    // Limited" - the app's prior name omitted "Company".
    name: "Cannon General Insurance Company Limited",
    tradingName: "Cannon General Insurance",
    logoEmoji: "🎯",
    established: 1974,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/098/2026",
    iraLicenseMedical: "Not Licensed (Class 12 Medical not authorised)",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "B+ Rated (Established underwriter, competitive commercial fleet terms)",
    strengthReason: "Strong scheme-based motor terms for own goods, general cartage and institutional fleets, with no-blame-no-excess and free windscreen/side mirror cover bundled into every comprehensive policy.",
    // Per IRA Licensed Entities 2026 notice, Cannon General is authorised for classes 02-11 & 14
    // (Engineering, Fire Domestic/Industrial, Liability, Marine, Motor Private/Commercial, Personal
    // Accident, Theft, WIBA, Miscellaneous) - notably excluding Aviation (01) and Medical (12).
    availableProducts: ["Motor Private", "Motor Commercial Goods", "Motor Commercial General Cartage", "Institutional Group Motor", "Motor Cycle", "Domestic Package", "Fire & Perils", "Marine Cargo", "Public Liability", "Personal Accident", "Work Injury Benefits (WIBA)"],
    licensedGeneralClasses: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"],
    claimTurnaroundDays: 5,
    emergencyPhone: "+254 020 3966000"
  },
  {
    id: "pioneer",
    name: "Pioneer General Insurance Limited",
    tradingName: "Pioneer Insurance",
    logoEmoji: "🦁",
    established: 1968,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/205/2026",
    iraLicenseMedical: "IRA/12/067/2026",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "BBB+ Rated (Established composite underwriter with broad class authorisation)",
    strengthReason: "One of the few carriers authorised across nearly every general insurance class, from aviation and marine to medical and motor - useful for clients consolidating varied risk profiles under one underwriter.",
    // Per IRA Licensed Entities 2026 notice, Pioneer General is authorised for classes 01-12 & 14
    // (the full general insurance breadth, including Aviation and Medical). Pioneer Assurance Company
    // Limited (the separate life arm, classes 31-37) is not modeled here - this profile is General only.
    availableProducts: ["Motor Private", "Motor Commercial Goods", "Domestic Package", "Fire & Perils", "Marine Cargo", "Personal Accident", "Medical Insurance", "Aviation Insurance"],
    licensedGeneralClasses: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "14"],
    claimTurnaroundDays: 7,
    emergencyPhone: "+254 020 2811000"
  },
  {
    id: "monarch",
    name: "The Monarch Insurance Company Limited",
    tradingName: "The Monarch Insurance",
    logoEmoji: "👑",
    established: 1996,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "IRA/06/241/2026",
    iraLicenseMedical: "Not Licensed (Class 12 Medical not authorised)",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "BBB Rated (Dual-licensed general and long-term underwriter)",
    strengthReason: "One of the rare dual-licensed underwriters, transacting both general classes (motor, fire, liability, marine) and long-term life business (life assurance, group life, pensions) under the same entity.",
    // Per IRA Licensed Entities 2026 notice, Monarch holds BOTH a General license (classes 02-11 & 14 -
    // excluding Aviation & Medical) AND a Long-Term license (classes 31, 32, 33a, 33b, 34, 35, 37a -
    // Life Assurance, Annuities, Pensions, Group Life, Group Credit, Unit-Linked Investment).
    availableProducts: ["Motor Private", "Motor Commercial Goods", "Domestic Package", "Fire & Perils", "Personal Accident", "Life Assurance", "Group Life Schemes", "Pensions"],
    licensedGeneralClasses: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"],
    licensedLifeClasses: ["31", "32", "33a", "33b", "34", "35", "37a"],
    claimTurnaroundDays: 8,
    emergencyPhone: "+254 020 2245266"
  },
  {
    id: "capex",
    name: "Capex Life Assurance Company Limited",
    tradingName: "Capex Life Assurance",
    logoEmoji: "💠",
    established: 2004,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "Not Licensed (Long Term Insurer only - no General class authorisation)",
    iraLicenseMedical: "Not Licensed (Long Term Insurer only - no General class authorisation)",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "Unrated (Specialist long-term underwriter)",
    strengthReason: "Focused purely on long-term savings and protection products - life assurance, annuities, pensions and group life/credit schemes - with no general insurance class exposure.",
    // Per IRA Licensed Entities 2026 notice, Capex Life is authorised only for Long-Term classes
    // 31, 32, 33a, 33b, 34, 35 (Life Assurance, Annuities, Personal Pension, Deposit Administration,
    // Group Life, Group Credit) - notably no Unit-Linked/Non-Linked Investment authorisation (37a/37b).
    availableProducts: ["Life Assurance", "Annuities", "Personal Pension", "Deposit Administration", "Group Life Schemes", "Group Credit Life"],
    licensedLifeClasses: ["31", "32", "33a", "33b", "34", "35"],
    claimTurnaroundDays: 10,
    emergencyPhone: "+254 020 2723210"
  },
  {
    id: "liberty",
    name: "Liberty Life Assurance Kenya Limited",
    tradingName: "Liberty Life",
    logoEmoji: "🗽",
    established: 1997,
    licenseYear: 2026,
    licenseStatus: "Active",
    iraLicenseMotor: "Not Licensed (Long Term Insurer only - no General class authorisation)",
    iraLicenseMedical: "Not Licensed (Long Term Insurer only - no General class authorisation)",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "A- Rated (Established long-term underwriter, full investment-linked authorisation)",
    strengthReason: "Full long-term product breadth including both unit-linked and non-linked investment authorisation, on top of standard life, pension and group schemes - suited to clients wanting investment-linked policies.",
    // Per IRA Licensed Entities 2026 notice, Liberty Life is authorised for Long-Term classes
    // 31, 32, 33a, 33b, 34, 35, 37a, 37b - the full long-term breadth including both Unit-Linked
    // and non-linked Investment authorisation (unlike Capex, which lacks 37a/37b).
    availableProducts: ["Life Assurance", "Annuities", "Personal Pension", "Deposit Administration", "Group Life Schemes", "Group Credit Life", "Unit-Linked Investment"],
    licensedLifeClasses: ["31", "32", "33a", "33b", "34", "35", "37a", "37b"],
    claimTurnaroundDays: 9,
    emergencyPhone: "+254 020 2894000"
  },
  {
    id: "ncba",
    // New onboarding, added from binder rate documents (MOTOR RATING 2025 - NCBAIG.pdf and the
    // AIG-NCBA motor raters). Legal name and "subsidiary of NCBA Group PLC, regulated by the
    // Insurance Regulatory Authority" per the binder's own letterhead footer.
    name: "NCBA Insurance Company Limited",
    tradingName: "NCBA-AIG Insurance",
    logoEmoji: "🏦",
    established: 1962,
    licenseYear: 2026,
    licenseStatus: "Active",
    // Not yet cross-checked against the IRA Licensed Entities 2026 notice by name (unlike the
    // profiles above, which cite it directly) - licensed class codes below are inferred from
    // the binder covering full private/commercial motor and TPO, not sourced from the notice.
    iraLicenseMotor: "Not yet verified against IRA notice - binder confirms Motor Private & Commercial",
    iraLicenseMedical: "Not offered per binder (motor lines only)",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "Unrated (pending verification)",
    strengthReason: "Formerly AIG Kenya Insurance Company Limited, now a subsidiary of NCBA Group PLC - broad private and commercial motor rating including fleet, institutional and PSV/tonnage-tiered TPO.",
    availableProducts: ["Motor Private", "Motor Commercial Own Goods", "Motor Commercial General Cartage", "Institutional Group Motor", "Motorcycle"],
    licensedGeneralClasses: ["07", "08"],
    claimTurnaroundDays: 7,
    emergencyPhone: "+254 20 3676000"
  },
  {
    id: "directline",
    // New onboarding, added from binder rate document (MOTOR TERMS 2025-DIRECTLINE.pdf).
    name: "Directline Assurance Company Limited",
    tradingName: "Directline Assurance",
    logoEmoji: "🚦",
    established: 2011,
    licenseYear: 2026,
    licenseStatus: "Active",
    // Not yet cross-checked against the IRA Licensed Entities 2026 notice by name - licensed
    // class codes below are inferred from the binder covering full private/commercial motor,
    // not sourced from the notice.
    iraLicenseMotor: "Not yet verified against IRA notice - binder confirms Motor Private & Commercial",
    iraLicenseMedical: "Not offered per binder (motor lines only)",
    odpcRegistered: true,
    memberOfAibk: true,
    rating: "Unrated (pending verification)",
    strengthReason: "Motor-focused underwriter with own goods, general cartage, institutional/school bus and PSV/matatu terms.",
    availableProducts: ["Motor Private", "Motor Commercial Own Goods", "Motor Commercial General Cartage", "Institutional Group Motor", "PSV Motor Asset"],
    licensedGeneralClasses: ["07", "08"],
    claimTurnaroundDays: 7,
    emergencyPhone: "+254 20 4443364"
  }
];
