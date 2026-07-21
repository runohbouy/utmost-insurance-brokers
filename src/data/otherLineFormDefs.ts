// Field definitions for the non-motor "Other Product Lines" customer intake forms.
// Sourced from real Kenyan-market general insurance proposal forms (CIC General Insurance Ltd
// specimen forms, held in the parent Proposal_forms folder) to ensure the questions asked
// actually match what an underwriter needs to rate each class - not invented fields. These are
// used as a generic Kenyan-market reference for the underwriting questions themselves; no rates
// or figures from any specific insurer are attributed here. Each insurer's actual premium, once
// negotiated, is entered independently by admin staff in the Database Rates Desk per line item.

export type OtherLineFieldType = "text" | "number" | "textarea" | "select" | "boolean" | "date";

export interface OtherLineFieldDef {
  id: string;
  label: string;
  type: OtherLineFieldType;
  options?: string[];
  required?: boolean;
  unit?: string;
  helpText?: string;
}

export interface OtherLineSubType {
  id: string;
  label: string;
  sourceForm: string;
  // Field whose numeric value is used as the primary rating basis (sum insured / indemnity
  // limit / annual wage roll / annual carry, depending on class) when calculating a premium
  // against an insurer's configured rate for this category.
  ratingBasisFieldId: string;
  fields: OtherLineFieldDef[];
}

export interface OtherLineCategoryFormDef {
  categoryId: string;
  subTypes: OtherLineSubType[];
}

export const OTHER_LINE_FORM_DEFS: Record<string, OtherLineCategoryFormDef> = {
  liability: {
    categoryId: "liability",
    subTypes: [
      {
        id: "public_liability",
        label: "Public Liability",
        sourceForm: "Public Liability Proposal Form",
        ratingBasisFieldId: "indemnityLimit",
        fields: [
          { id: "natureOfBusiness", label: "Nature of business", type: "text", required: true },
          { id: "propertyAddress", label: "Address of premises covered", type: "text", required: true },
          { id: "specialRisks", label: "Special risks requiring cover (lifts, cranes, watercraft, aircraft, etc.)", type: "textarea" },
          { id: "previouslyInsured", label: "Has this risk been previously insured?", type: "boolean" },
          { id: "previousInsurer", label: "If so, by whom?", type: "text" },
          { id: "everDeclinedOrLoaded", label: "Has any insurer declined, refused to renew, or demanded increased premium for this risk?", type: "boolean" },
          { id: "claimsHistory", label: "Claims in the past 3 years (details)", type: "textarea" },
          { id: "indemnityLimit", label: "Indemnity required for any one accident", type: "number", unit: "KES", required: true }
        ]
      },
      {
        id: "employers_liability",
        label: "Employer's Liability",
        sourceForm: "Employer's Liability Proposal Form",
        ratingBasisFieldId: "annualWageRoll",
        fields: [
          { id: "businessDescription", label: "Business / particulars of work", type: "text", required: true },
          { id: "employeeCount", label: "Number of employees covered", type: "number", required: true },
          { id: "annualWageRoll", label: "Estimated annual wages, salaries & other earnings", type: "number", unit: "KES", required: true },
          { id: "hasWibaPolicy", label: "Do you currently hold a WIBA / Workmen's Compensation policy?", type: "boolean" },
          { id: "priorClaims3yr", label: "Accidents/claims to employees in the past 3 years", type: "textarea" },
          { id: "everDeclinedOrLoaded", label: "Has any insurer declined, withdrawn, or loaded a prior proposal/renewal?", type: "boolean" }
        ]
      },
      {
        id: "professional_indemnity",
        label: "Professional Indemnity",
        sourceForm: "Professional Indemnity Proposal Form",
        ratingBasisFieldId: "indemnityLimitAggregate",
        fields: [
          { id: "profession", label: "Profession", type: "text", required: true },
          { id: "yearEstablished", label: "Year firm established", type: "number" },
          { id: "partnerCount", label: "Total number of partners", type: "number" },
          { id: "qualifiedStaffCount", label: "Total number of professionally qualified employees", type: "number" },
          { id: "grossFeeIncome", label: "Gross fee income - last 12 months", type: "number", unit: "KES", required: true },
          { id: "indemnityLimitPerEvent", label: "Indemnity required - per any one event", type: "number", unit: "KES", required: true },
          { id: "indemnityLimitAggregate", label: "Indemnity required - in the aggregate during period of insurance", type: "number", unit: "KES", required: true },
          { id: "retroactiveCoverYears", label: "Retroactive cover required (years, if any)", type: "number" }
        ]
      },
      {
        id: "directors_officers",
        label: "Directors & Officers Liability",
        sourceForm: "D&O Liability Proposal Form",
        ratingBasisFieldId: "indemnityLimit",
        fields: [
          { id: "companyName", label: "Name of company", type: "text", required: true },
          { id: "yearsInBusiness", label: "Years the company has continually carried on business", type: "number" },
          { id: "listingStatus", label: "Listing status", type: "select", options: ["Private", "Public - Listed on NSE", "Listed elsewhere", "Traded in unlisted securities market"], required: true },
          { id: "pendingMergerOrAcquisition", label: "Any acquisition, merger, or tender offer pending or under consideration?", type: "boolean" },
          { id: "priorDoClaims", label: "Have claims ever been made against any past or present director/officer?", type: "boolean" },
          { id: "priorClaimsDetail", label: "If yes, details", type: "textarea" },
          { id: "indemnityLimit", label: "Amount of indemnity required", type: "select", options: ["5,000,000", "10,000,000", "15,000,000", "20,000,000", "25,000,000", "50,000,000", "75,000,000", "100,000,000", "150,000,000"], unit: "KES", required: true }
        ]
      }
    ]
  },
  engineering: {
    categoryId: "engineering",
    subTypes: [
      {
        id: "contractors_all_risk",
        label: "Contractors' All Risks (CAR)",
        sourceForm: "CAR Proposal Form",
        ratingBasisFieldId: "totalSumInsured",
        fields: [
          { id: "contractTitle", label: "Title of contract / project", type: "text", required: true },
          { id: "projectLocation", label: "Project site / location", type: "text", required: true },
          { id: "contractValue", label: "Contract value / price / amount", type: "number", unit: "KES", required: true },
          { id: "plantEquipmentValue", label: "Construction plant & equipment value", type: "number", unit: "KES" },
          { id: "constructionMachineryValue", label: "Construction machinery value", type: "number", unit: "KES" },
          { id: "debrisRemovalLimit", label: "Clearance/removal of debris limit", type: "number", unit: "KES" },
          { id: "totalSumInsured", label: "Total sum insured (contract + plant + machinery + debris)", type: "number", unit: "KES", required: true },
          { id: "commencementDate", label: "Date of commencement of work", type: "date", required: true },
          { id: "completionDate", label: "Date of completion", type: "date", required: true },
          { id: "constructionMaterials", label: "Construction materials to be used", type: "textarea" },
          { id: "earthquakeExposure", label: "Have earthquakes been observed in this area?", type: "boolean" },
          { id: "thirdPartyLiabilityLimit", label: "Third party / public liability limit required", type: "number", unit: "KES" }
        ]
      },
      {
        id: "erection_all_risk",
        label: "Erection All Risks (EAR)",
        sourceForm: "EAR Proposal Form",
        ratingBasisFieldId: "totalSumInsured",
        fields: [
          { id: "contractTitle", label: "Title of contract / project", type: "text", required: true },
          { id: "projectLocation", label: "Project site / location", type: "text", required: true },
          { id: "contractValue", label: "Contract value of plant/machinery to be erected", type: "number", unit: "KES", required: true },
          { id: "totalSumInsured", label: "Total sum insured", type: "number", unit: "KES", required: true },
          { id: "preStoragePeriod", label: "Pre-storage period before commencement of erection", type: "text" },
          { id: "commencementDate", label: "Date of commencement of erection", type: "date", required: true },
          { id: "completionDate", label: "Date of completion", type: "date", required: true },
          { id: "thirdPartyLiabilityLimit", label: "Third party / public liability limit required", type: "number", unit: "KES" }
        ]
      },
      {
        id: "machinery_breakdown",
        label: "Machinery Breakdown",
        sourceForm: "Machinery Breakdown Proposal Form",
        ratingBasisFieldId: "replacementValue",
        fields: [
          { id: "natureOfBusiness", label: "Nature of business", type: "text", required: true },
          { id: "machineryDescription", label: "Description of machinery (manufacturer, type, output, capacity)", type: "textarea", required: true },
          { id: "yearOfManufacture", label: "Year of manufacture", type: "number" },
          { id: "replacementValue", label: "Replacement value of machinery", type: "number", unit: "KES", required: true },
          { id: "priorBreakdowns", label: "Previous breakdowns/failures in last 3 years", type: "textarea" },
          { id: "operatorsQualified", label: "Are all operators qualified and licensed?", type: "boolean" },
          { id: "thirdPartyLiabilityLimit", label: "Third party / public liability limit required", type: "number", unit: "KES" }
        ]
      }
    ]
  },
  marine: {
    categoryId: "marine",
    subTypes: [
      {
        id: "goods_in_transit",
        label: "Goods In Transit",
        sourceForm: "GIT Proposal Form",
        ratingBasisFieldId: "annualDispatchValue",
        fields: [
          { id: "tradeBusiness", label: "Trade & business", type: "text", required: true },
          { id: "goodsDescription", label: "Description of goods dispatched and how packed", type: "textarea", required: true },
          { id: "annualDispatchValue", label: "Estimated total value of goods dispatched during the year", type: "number", unit: "KES", required: true },
          { id: "ownVehicleProportion", label: "Value dispatched by own vehicle", type: "number", unit: "KES" },
          { id: "haulageContractorProportion", label: "Value dispatched by road haulage contractors", type: "number", unit: "KES" },
          { id: "maxValuePerPackage", label: "Maximum value of one package", type: "number", unit: "KES" },
          { id: "maxValuePerConsignment", label: "Total value of any one consignment dispatched at any one time", type: "number", unit: "KES" },
          { id: "lossHistory3yr", label: "Losses/damage to goods in transit in the past 3 years", type: "textarea" },
          { id: "importExport", label: "Do you import or export goods?", type: "boolean" }
        ]
      }
    ]
  },
  theft: {
    categoryId: "theft",
    subTypes: [
      {
        id: "burglary",
        label: "Burglary",
        sourceForm: "CIC General Burglary Proposal Form",
        ratingBasisFieldId: "totalSumInsured",
        fields: [
          { id: "businessTrade", label: "Trade / business carried out", type: "text", required: true },
          { id: "wallsConstruction", label: "Construction of walls", type: "text" },
          { id: "roofConstruction", label: "Construction of roof", type: "text" },
          { id: "perimeterFence", label: "Do the premises have a perimeter fence?", type: "boolean" },
          { id: "doorWindowSecurity", label: "How are doors and windows secured?", type: "text" },
          { id: "hasWatchman", label: "Do you have a watchman / security guard?", type: "boolean" },
          { id: "hasAlarm", label: "Do you have an alarm / security back-up system?", type: "boolean" },
          { id: "stockSumInsured", label: "Sum insured - stocks", type: "number", unit: "KES" },
          { id: "goodsInTrustSumInsured", label: "Sum insured - goods held in trust", type: "number", unit: "KES" },
          { id: "furnitureSumInsured", label: "Sum insured - furniture, fixtures & fittings", type: "number", unit: "KES" },
          { id: "officeEquipmentSumInsured", label: "Sum insured - office equipment", type: "number", unit: "KES" },
          { id: "totalSumInsured", label: "Total sum insured", type: "number", unit: "KES", required: true },
          { id: "claimsHistory3yr", label: "Claims/losses in the last 3 years", type: "textarea" }
        ]
      }
    ]
  },
  wiba: {
    categoryId: "wiba",
    subTypes: [
      {
        id: "wiba_standard",
        label: "Work Injury Benefits (WIBA)",
        sourceForm: "WIBA Proposal Form",
        ratingBasisFieldId: "annualWageRoll",
        fields: [
          { id: "natureOfBusiness", label: "Nature of business / occupation", type: "text", required: true },
          { id: "employeeCount", label: "Number of employees covered", type: "number", required: true },
          { id: "annualWageRoll", label: "Estimated annual wages, salaries & other earnings on which premium is based", type: "number", unit: "KES", required: true },
          { id: "hasApprentices", label: "Do you have apprentices or trainees?", type: "boolean" },
          { id: "preExistingConditions", label: "Any employees with pre-existing medical conditions?", type: "boolean" },
          { id: "priorClaims3yr", label: "Accidents/claims to employees in the past 3 years", type: "textarea" },
          { id: "everDeclinedOrLoaded", label: "Has any insurer declined, withdrawn, or loaded a prior proposal/renewal?", type: "boolean" }
        ]
      }
    ]
  },
  personal_accident: {
    categoryId: "personal_accident",
    subTypes: [
      {
        id: "group_personal_accident",
        label: "Group Personal Accident",
        sourceForm: "Group Personal Accident Proposal Form",
        ratingBasisFieldId: "totalAnnualEmoluments",
        fields: [
          { id: "businessOccupation", label: "Business / occupation", type: "text", required: true },
          { id: "personsCovered", label: "Number of persons to be insured", type: "number", required: true },
          { id: "totalAnnualEmoluments", label: "Estimated gross total emoluments per annum (all persons)", type: "number", unit: "KES", required: true },
          { id: "highestIndividualEmolument", label: "Highest emoluments paid to any one individual per annum", type: "number", unit: "KES" },
          { id: "deathBenefit", label: "Death benefit required per person", type: "number", unit: "KES" },
          { id: "permanentDisablementBenefit", label: "Permanent disablement benefit required per person", type: "number", unit: "KES" },
          { id: "medicalExpensesBenefit", label: "Medical expenses benefit required per person", type: "number", unit: "KES" },
          { id: "travelsByAirOrMachinery", label: "Will any insured persons travel considerably by air, or use machinery?", type: "boolean" },
          { id: "priorAccidents3yr", label: "Accidents in the last 3 years involving persons to be insured", type: "textarea" },
          { id: "everDeclinedOrLoaded", label: "Has any insurer declined, withdrawn, or loaded a prior policy?", type: "boolean" }
        ]
      }
    ]
  },
  miscellaneous: {
    categoryId: "miscellaneous",
    subTypes: [
      {
        id: "fidelity_guarantee",
        label: "Fidelity Guarantee",
        sourceForm: "CIC General Fidelity Guarantee Proposal Form",
        ratingBasisFieldId: "aggregateLimit",
        fields: [
          { id: "occupationBusiness", label: "Occupation / business", type: "text", required: true },
          { id: "yearsInOperation", label: "How long has the business been in operation?", type: "number" },
          { id: "employeeCount", label: "Number of employees currently engaged", type: "number" },
          { id: "hasVettingSystem", label: "Do you vet prospective employees for trustworthiness?", type: "boolean" },
          { id: "hasInternalAudit", label: "Do you have an internal audit function?", type: "boolean" },
          { id: "sumGuaranteedPerPerson", label: "Amount to be guaranteed per person (sum insured)", type: "number", unit: "KES" },
          { id: "aggregateLimit", label: "Maximum liability (aggregate limit) during one period of insurance", type: "number", unit: "KES", required: true },
          { id: "priorFraudLoss3yr", label: "Losses from fraud/dishonesty of employees in the last 3 years", type: "textarea" }
        ]
      },
      {
        id: "money",
        label: "Money Insurance",
        sourceForm: "CIC General Money Insurance Proposal Form",
        ratingBasisFieldId: "estimatedAnnualCarry",
        fields: [
          { id: "premisesType", label: "Type of premises (warehouse, shop, offices, factory, etc.)", type: "text", required: true },
          { id: "premisesLocation", label: "Location of premises", type: "text", required: true },
          { id: "hasSafeOrStrongroom", label: "Do you require cover for cash in a locked safe or strong room?", type: "boolean" },
          { id: "transitInPremisesHoursSumInsured", label: "Limit - money in premises during business hours", type: "number", unit: "KES" },
          { id: "transitOutOfHoursSumInsured", label: "Limit - money in premises out of business hours (locked)", type: "number", unit: "KES" },
          { id: "transitToBankSumInsured", label: "Limit - money in transit to/from bank", type: "number", unit: "KES" },
          { id: "inHandsOfStaffSumInsured", label: "Limit - money in hands of staff collecting sales proceeds", type: "number", unit: "KES" },
          { id: "estimatedAnnualCarry", label: "Estimated annual carry (total money handled per year)", type: "number", unit: "KES", required: true },
          { id: "transitMethod", label: "How is money conveyed?", type: "select", options: ["By employees", "By security firm", "Police escort", "Other"] },
          { id: "lossHistory3yr", label: "Losses in the last 3 years connected with this cover", type: "textarea" }
        ]
      }
    ]
  }
};
