import { Product } from "./allProducts";

export interface PolicyCoverItem {
  title: string;
  description: string;
}

export interface CategoryDetailContent {
  coversIntro: string;
  covers: PolicyCoverItem[];
  exclusionsIntro: string;
  exclusions: string[];
  claimsStep: string;
}

// Content sourced from understandinsurance.co.ke (AKI's consumer insurance
// education site) for Motor, Medical, Home/Domestic Package, Travel, Personal
// Accident/GPA, WIBA, and Life/Pension. Classes not published on that site
// (Marine Cargo, Bonds & Guarantees, Construction & Engineering, Agriculture,
// Liability, Specialist, Business/Fidelity/Burglary) are grounded in general,
// well-established Kenyan insurance industry practice instead - flagged here
// so this distinction isn't lost if this file is edited later.
const SOURCED_FROM_REFERENCE_SITE = new Set([
  "motor-tpo", "motor-comprehensive", "medical", "property-home", "travel",
  "employee-benefits-pa", "employee-benefits-wiba", "life-pension"
]);
export { SOURCED_FROM_REFERENCE_SITE };

const CONTENT: Record<string, CategoryDetailContent> = {
  "motor-comprehensive": {
    coversIntro: "Underwritten by A+ IRA approved carriers, this policy covers both your own vehicle and third parties:",
    covers: [
      { title: "Accidental Loss or Harm", description: "Protection against sudden physical crash damage, water damage, fire or collapse to your own vehicle." },
      { title: "Third Party Civil Shield", description: "Covering legal claims arising out of third party property damages up to statutory standards KES 3,000,000, plus unlimited bodily injury liability." },
      { title: "Optional Extensions", description: "Excess Protector and Political Violence & Terrorism (PVT) can be added as riders where not already included in the base rate - see the quote comparison for which underwriters bundle these free." }
    ],
    exclusionsIntro: "Please note that standard comprehensive motor policies do not cover damages resulting from:",
    exclusions: [
      "Driving under the influence of alcohol or drugs, or without a valid driving licence",
      "Willful, fraudulent, or grossly negligent use of the vehicle",
      "War, nuclear risk, or unapproved civil uprising",
      "Wear and tear or gradual mechanical/electrical breakdown not caused by an accident",
      "The driver's own injury or death - motor policies do not cover the driver; a separate Personal Accident cover is needed for that"
    ],
    claimsStep: "An assessor determines whether your vehicle will be repaired or written off, and repairs proceed once the insurer approves the assessment."
  },
  "motor-tpo": {
    coversIntro: "Underwritten by A+ IRA approved carriers, this Third Party Only policy meets the mandatory legal minimum standard:",
    covers: [
      { title: "Third Party Civil Shield", description: "Covering legal claims arising out of third party property damages up to statutory standards KES 3,000,000." },
      { title: "Third Party Bodily Injury", description: "Unlimited liability cover for death or bodily injury to third parties under Kenyan Cap 405." },
      { title: "Standard Cover Note", description: "Immediate legal compliance certificate issuance upon placement." }
    ],
    exclusionsIntro: "Third Party Only cover is deliberately narrow - it does not pay for:",
    exclusions: [
      "Any damage to your own vehicle, regardless of fault",
      "Your own medical expenses or injuries as the driver",
      "Driving under the influence of alcohol or drugs, or without a valid driving licence",
      "War, nuclear risk, or unapproved civil uprising"
    ],
    claimsStep: "Utmost Claims specialists liaise directly with the underwriter to process the third party's liability settlement."
  },
  "medical": {
    coversIntro: "Medical insurance reimburses or directly settles the medical expenses of the insured and their declared dependants:",
    covers: [
      { title: "Inpatient & Outpatient Treatment", description: "Hospital admission (inpatient) and walk-in consultations (outpatient) at network hospitals, depending on the plan you choose." },
      { title: "Optional Extensions", description: "Most schemes can be extended to cover optical, dental, maternity, congenital defects, chronic ailments, and psychiatric conditions - each priced separately." },
      { title: "Waiting Periods Apply", description: "Pre-existing and chronic conditions are typically covered only after a waiting period stated in your policy schedule, not from day one." }
    ],
    exclusionsIntro: "Most medical covers exclude:",
    exclusions: [
      "Cosmetic surgery or treatment not medically necessary",
      "Age-related senility or insanity",
      "Family planning and contraception",
      "Treatment not administered by a registered medical practitioner"
    ],
    claimsStep: "Present your medical card at a network hospital for cashless treatment, or submit bills, a discharge summary, and pre-authorization (for planned admissions) for reimbursement."
  },
  "property-home": {
    coversIntro: "Also known as Domestic Package insurance, this policy is structured into distinct sections you can pick and choose from depending on whether you're a tenant, homeowner, or landlord:",
    covers: [
      { title: "Building Structure", description: "Covers the structure of your home against risks such as fire, floods, and earthquake." },
      { title: "Household Contents & All Risks", description: "Covers belongings like electronics, jewellery, furniture and clothing at home, plus items you move with outside the house (phones, laptops, watches) against accidental damage and theft." },
      { title: "Domestic Worker & Public Liability", description: "Covers domestic workers for injury or death while undertaking domestic work, and protects you against lawsuits for injury or property damage caused to other people on your property." }
    ],
    exclusionsIntro: "Please note that standard home/domestic package policies do not cover:",
    exclusions: [
      "Wear and tear, or gradual deterioration of the building or contents",
      "Damage that existed, or items not yet declared in your inventory, before the policy started",
      "War, terrorism, and nuclear risks (unless specifically extended)",
      "Loss while the premises are left unoccupied beyond the period stated in your policy"
    ],
    claimsStep: "Provide your home inventory and receipts for the affected items, alongside photos of the damage, to support your claim - this is why keeping an up-to-date inventory matters."
  },
  "property-fire": {
    coversIntro: "Standard industrial cover for structures, stock and machinery at business premises:",
    covers: [
      { title: "Fire, Lightning & Explosion", description: "Standard named-peril cover for structures and machinery, including explosion of boilers used for domestic purposes." },
      { title: "Extraneous Perils", description: "Storm, flood, earthquake and impact damage can typically be added as extensions to the base fire policy." },
      { title: "Business Stock & Fixtures", description: "Covers factory equipment, trade stock, and fittings at the insured premises." }
    ],
    exclusionsIntro: "Standard fire & perils policies do not cover:",
    exclusions: [
      "Wear and tear or gradual deterioration",
      "War, terrorism, and nuclear risks (unless specifically extended)",
      "Consequential loss such as loss of profit - that's covered separately under Business Interruption, not this policy",
      "Property not declared, or under-declared, in the sum insured schedule"
    ],
    claimsStep: "Notify your insurer immediately, secure the site, and provide a property inventory with valuations to support the claim."
  },
  "employee-benefits-wiba": {
    coversIntro: "A legal requirement under the Work Injury Benefits Act (WIBA) for every registered employer in Kenya:",
    covers: [
      { title: "Work-Related Injury & Disease", description: "Medical treatment, compensation for permanent disability, and cover for occupational diseases contracted in the course of employment." },
      { title: "Occupational Funeral Disbursements", description: "Contribution toward funeral costs if an employee dies as a result of a workplace incident." },
      { title: "Legal Compliance", description: "Satisfies the statutory cover every employer in Kenya must carry under WIBA - this is not optional." }
    ],
    exclusionsIntro: "WIBA cover does not extend to:",
    exclusions: [
      "Injuries occurring outside the course and scope of employment",
      "Self-inflicted injury or the employee's own willful misconduct",
      "Injury sustained while the employee was engaged in unlawful employment"
    ],
    claimsStep: "Report the incident to the Directorate of Occupational Safety and Health Services (DOSHS) and your insurer within the statutory timeframe, together with medical reports."
  },
  "employee-benefits-pa": {
    coversIntro: "Personal Accident and Group Personal Accident cover provides financial compensation if you suffer bodily injury, disability, or death solely due to an accident:",
    covers: [
      { title: "Accidental Death & Disability", description: "Lump sum benefits for temporary or permanent disability, and to dependants in the event of accidental death." },
      { title: "24/7 Worldwide Cover", description: "Most policies cover accidents anywhere, anytime - at home, at work, or while travelling, not only during working hours." },
      { title: "Medical Reimbursement & Education Benefits", description: "Many covers reimburse medical costs (surgery, consultation, X-rays) from the accident, and some offer school fee support for dependants." }
    ],
    exclusionsIntro: "Personal accident cover typically excludes:",
    exclusions: [
      "Death or illness from natural causes rather than an accident",
      "Self-inflicted injury, suicide, or intentional self-harm",
      "High-risk occupations or activities not declared at application, which may be excluded or attract a premium loading",
      "Ages outside the policy's stated limits - many policies cover ages 18 to 65"
    ],
    claimsStep: "Notify your insurer promptly and provide a police abstract (for accidents) or medical report confirming the injury and its cause."
  },
  "life-pension": {
    coversIntro: "Life and pension products fall into a few standard structures:",
    covers: [
      { title: "Term Assurance, Whole Life & Endowment", description: "Term Assurance protects only for a set period with no payout if you survive it; Whole Life offers life-long protection; Endowment combines protection with investment, paying out at maturity or on death." },
      { title: "Regulated Retirement Savings", description: "Contributions to a registered scheme earn a guaranteed minimum return and are regulated by the Retirement Benefits Authority (RBA)." },
      { title: "Flexible Payout at Retirement", description: "A pension scheme pays up to a third of the fund as a lump sum with the rest as a monthly annuity; a provident scheme pays the full fund as a lump sum, subject to applicable tax." }
    ],
    exclusionsIntro: "Life and pension policies commonly exclude or restrict:",
    exclusions: [
      "Suicide within the policy's exclusion period (commonly the first year - check your specific wording)",
      "Non-disclosure of material health or lifestyle information at application",
      "Benefits on a lapsed policy where premiums have not been kept up to date"
    ],
    claimsStep: "Beneficiaries submit a death certificate, the original policy document, and identification to the insurer to process a claim."
  },
  "travel": {
    coversIntro: "Travel insurance covers specific events during the course of travel - covered risks and exclusions vary by policy, insurer, and destination:",
    covers: [
      { title: "Trip Disruptions", description: "Trip interruptions, cancellations (whole trip or a section), and carrier or service provider failures." },
      { title: "Baggage & Belongings", description: "Lost or delayed baggage during your journey." },
      { title: "Medical Treatment & Emergency Evacuation", description: "Medical treatment for injuries caused by travel, and emergency evacuation due to physical threats or medical emergencies." },
      { title: "Accidental Death", description: "Including the cost of transporting remains." }
    ],
    exclusionsIntro: "Travel policies typically do not cover:",
    exclusions: [
      "Natural disasters and severe weather",
      "Crimes committed against you or a member of your travelling party",
      "Lost travel documents or identification papers",
      "Civil unrest or unannounced strikes that render your carrier unable to operate"
    ],
    claimsStep: "Report the incident to your travel insurer's emergency assistance line as soon as possible, and keep all receipts, police reports, or carrier confirmations."
  },
  "agriculture": {
    coversIntro: "Agricultural covers are priced around named perils or yield indices (general industry practice - not published on our third-party consumer reference site):",
    covers: [
      { title: "Crop Loss", description: "Protection against drought, pests, disease, hail, frost and storm damage to insured crops." },
      { title: "Livestock & Herd Loss", description: "Death of livestock from disease, epidemics, accidental injury, or emergency slaughter." },
      { title: "Index-Based Triggers", description: "Some covers pay out automatically against rainfall or yield indices rather than requiring a physical loss assessment." }
    ],
    exclusionsIntro: "Agricultural policies commonly exclude:",
    exclusions: [
      "Losses from poor farming practices or failure to follow recommended agronomic guidance",
      "Pre-existing disease or condition present before the policy started",
      "War, civil commotion, and nuclear risks",
      "Acreage or herd numbers not declared on your schedule"
    ],
    claimsStep: "Report losses promptly so an assessor or veterinary officer can inspect the affected crop or livestock before further deterioration."
  },
  "construction-engineering": {
    coversIntro: "Construction and engineering covers protect ongoing works, plant, and machinery (general industry practice - not published on our third-party consumer reference site):",
    covers: [
      { title: "Contractors All Risks (CAR)", description: "Physical loss or damage to construction works, materials, and plant on site, plus third-party liability arising from the works." },
      { title: "Machinery Breakdown", description: "Sudden and unforeseen physical damage to machinery from electrical or mechanical failure." },
      { title: "Erection All Risks", description: "Cover during installation or erection of new plant and machinery." }
    ],
    exclusionsIntro: "Construction & engineering policies commonly exclude:",
    exclusions: [
      "The cost of correcting faulty design, materials, or workmanship itself (though resulting damage may still be covered)",
      "Wear and tear, gradual deterioration, rust or corrosion",
      "Delay penalties or consequential loss, unless specifically extended",
      "War, terrorism, and nuclear risks (unless specifically extended)"
    ],
    claimsStep: "Notify your insurer and site engineer immediately, preserve the damaged area for inspection, and submit contract documents with your claim."
  },
  "marine-cargo": {
    coversIntro: "Marine and transit covers follow standard international clause structures (general industry practice - not published on our third-party consumer reference site):",
    covers: [
      { title: "Marine Cargo (Institute Cargo Clauses)", description: "Physical loss or damage to goods in transit by sea or air, typically under Institute Cargo Clauses A (all risks), B, or C (named perils)." },
      { title: "Goods in Transit (Local)", description: "Loss or damage to goods while being loaded, carried, or discharged on local commercial delivery routes." },
      { title: "General Average & Salvage", description: "Contribution toward jointly incurred sacrifices or expenditure made to save a voyage." }
    ],
    exclusionsIntro: "Marine and transit covers commonly exclude:",
    exclusions: [
      "Inherent vice or nature of the goods (e.g. natural spoilage)",
      "Insufficient or improper packing",
      "Delay, even where caused by an insured peril",
      "War and strikes risks, unless specifically extended at additional premium"
    ],
    claimsStep: "Notify the carrier and insurer immediately, do not dispose of damaged goods, and obtain a survey report before the cargo is moved or discarded."
  },
  "liability": {
    coversIntro: "Liability covers protect you against claims from third parties or regulators (general industry practice - not published on our third-party consumer reference site):",
    covers: [
      { title: "Public Liability", description: "Legal costs and compensation if a member of the public is injured, or their property is damaged, on your premises or by your operations." },
      { title: "Professional Indemnity", description: "Defense costs and damages for claims of negligence, errors, or omissions in professional advice or services." },
      { title: "Directors & Officers (D&O)", description: "Personal legal defense and settlement costs for company directors facing claims of wrongful acts in managing the business." }
    ],
    exclusionsIntro: "Liability policies commonly exclude:",
    exclusions: [
      "Deliberate, dishonest, or criminal acts",
      "Liability assumed under a contract that wouldn't otherwise exist at law",
      "Fines, penalties, and punitive damages (in most cases these are not insurable)",
      "Claims arising from circumstances you were already aware of before the policy started"
    ],
    claimsStep: "Notify your insurer of the claim, or circumstances that could give rise to one, as soon as you become aware - most liability policies are claims-made and require prompt notification."
  },
  "business": {
    coversIntro: "Business covers in this group protect cash, stock, and fixtures against fraud, break-ins and transit loss (general industry practice - not published on our third-party consumer reference site):",
    covers: [
      { title: "Fidelity Guarantee", description: "Covers financial loss from fraud, theft, or dishonesty committed by your own salaried staff." },
      { title: "Burglary & Housebreaking", description: "Covers loss or damage to stock, fixtures, and equipment following forcible and violent entry or exit." },
      { title: "Money / Cash in Transit", description: "Covers cash, cheques, and securities while in transit or held in a locked safe on your premises." }
    ],
    exclusionsIntro: "These business covers commonly exclude:",
    exclusions: [
      "Loss discovered but not reported within the timeframe stated in your policy",
      "Theft or dishonesty by a director or partner of the business, unless specifically extended",
      "Loss where there is no sign of forcible or violent entry (for burglary cover)",
      "Shortages only discovered through stocktaking, with no other evidence of theft"
    ],
    claimsStep: "Report the incident to the police immediately to obtain an OB number, and notify your insurer with a full inventory of the loss."
  },
  "specialist": {
    coversIntro: "Specialist covers address risks most standard policies don't reach (general industry practice - not published on our third-party consumer reference site):",
    covers: [
      { title: "Cyber Risk", description: "First-party costs for system restoration, ransom-extortion response, and regulatory or legal costs following a cyber breach." },
      { title: "Political Violence & Terrorism (PVT)", description: "Physical damage to property and consequential business interruption from riots, civil commotion, strikes, or malicious sabotage." }
    ],
    exclusionsIntro: "Specialist covers commonly exclude:",
    exclusions: [
      "War between named states (a distinct risk usually excluded even from PVT covers)",
      "Loss from outdated or unpatched systems where basic security measures were not maintained (cyber)",
      "Gradual or preventable loss you knew about but failed to act on"
    ],
    claimsStep: "Notify your insurer immediately, preserve evidence (system logs for cyber, photos for physical damage), and file a police report where applicable."
  },
  "bonds-guarantees": {
    coversIntro: "Bonds and guarantees provide financial security to a project owner or client (general industry practice - not published on our third-party consumer reference site):",
    covers: [
      { title: "Bid / Tender Bonds", description: "Guarantees a bidder will honor their tender if awarded the contract, in line with public procurement (PPADA) rules." },
      { title: "Performance Bonds", description: "Guarantees a contractor will complete works according to the terms of the awarded contract." },
      { title: "Advance Payment Bonds", description: "Guarantees that mobilization funds advanced to a contractor are used for the stated project." }
    ],
    exclusionsIntro: "Bonds and guarantees commonly exclude:",
    exclusions: [
      "Contract variations not disclosed to the guarantor/insurer",
      "Losses arising after the bond's validity period has expired",
      "Disputes on contract terms unrelated to the specific guaranteed obligation"
    ],
    claimsStep: "The beneficiary (project owner) submits a formal demand under the bond, supported by evidence that the contractor defaulted on the guaranteed obligation."
  }
};

// Resolves the right content block for a product, handling the categories
// that split into materially different sub-types (motor comp vs TPO, home
// vs industrial fire, WIBA vs voluntary personal accident).
export function getCategoryDetailContent(product: Product): CategoryDetailContent {
  if (product.category === "motor") {
    const isThirdPartyOnly = /third.?party/i.test(product.name) && !/comprehensive/i.test(product.name);
    return CONTENT[isThirdPartyOnly ? "motor-tpo" : "motor-comprehensive"];
  }
  if (product.category === "property") {
    return CONTENT[product.id === "fire-perils" ? "property-fire" : "property-home"];
  }
  if (product.category === "employee-benefits") {
    return CONTENT[product.id === "work-injury-benefits" ? "employee-benefits-wiba" : "employee-benefits-pa"];
  }
  return CONTENT[product.category] || CONTENT["liability"];
}
