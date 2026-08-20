export interface RoomItem {
  itemName: string;
  estimatedValueKES: number;
  insuranceTip: string;
}

export interface SafetyHazard {
  hazardName: string;
  description: string;
  fixAction: string;
}

export interface RoomAnalysis {
  roomType: string;
  status: string;
  clutterScore: number;
  organizationSuggestions: string[];
  safetyHazards: SafetyHazard[];
  estimatedItems: RoomItem[];
  totalContentsValueKES: number;
  domesticPackageIndicativePremiumKES: number;
}

export interface InsuranceQuote {
  insurerName: string;
  insurerId: string;
  rating: string;
  sumInsured: number;
  basePremium: number;
  pcf: number;
  trainingLevy: number;
  stampDuty: number;
  totalPremium: number;
  excessTerms: string;
  mainBenefits: string[];
  waitingPeriod: string;
  isRecommended: boolean;
  recommendationReason: string;
  priceTag: string; // e.g., "Lowest Premium", "Best Value", etc.
  vehicleUse?: string;
  vehicleType?: string;
  isProvisionalRate?: boolean;
  provisionalLoadingFactor?: number;
  rateVersionId?: string;
  isHighExposureApplied?: boolean;
  highExposureNote?: string;
  isTonnageRated?: boolean;
  riderBreakdown?: {
    excessProtector: number;
    pvt: number;
    windscreen: number;
  };
  riderStatus?: {
    excessProtector: "included" | "selected" | "available" | "unavailable";
    pvt: "included" | "selected" | "available" | "unavailable";
  };
  // Medical-only, structured equivalent of the motor riderStatus/riderBreakdown pair above -
  // Excess Protector/PVT don't apply to medical cover, so the comparison view shows these
  // benefit limits instead. Dental and optical are still one bundled co-pay addon in this
  // app's schema (a single "dentalCover" toggle selects both together), so
  // dentalIncluded/opticalIncluded always move in lockstep - but each is tracked and
  // displayed separately since they can carry their own KES sub-limit per insurer.
  // dentalLimit/opticalLimit are only present for insurers with a confirmed, sourced figure.
  medicalBenefits?: {
    inpatientLimit: number;
    outpatientLimit: number;
    maternityIncluded: boolean;
    dentalIncluded: boolean;
    opticalIncluded: boolean;
    dentalLimit?: number;
    opticalLimit?: number;
  };
}

export interface ClaimTimelineStep {
  status: string;
  date: string | null;
  completed: boolean;
  detail: string;
}

export interface ClaimSubmissionResponse {
  claimId: string;
  timestamp: string;
  policyNumber: string;
  claimType: string;
  status: string;
  assignedOfficer: string;
  officerDetails: string;
  actionGuidance: string[];
  timeline: ClaimTimelineStep[];
}

export type ActiveTab = 
  | "home"
  | "room-analyzer"
  | "motor-quotes"
  | "medical-quotes"
  | "other-lines-quotes"
  | "claims"
  | "portal"
  | "admin"
  | "insurance-products"
  | "compare-quotes"
  | "renewals"
  | "business-solutions"
  | "insurers"
  | "resources"
  | "about-us"
  | "contact-us"
  | "get-a-quote"
  | "product-details"
  | "category-details";

export interface MotorQuoteParams {
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel: string;
  mfgYear: number;
  vehicleValue: number;
  coverType: "comprehensive" | "third_party";
  vehicleUse: "private" | "commercial_goods" | "psv_chaufeur" | "commercial_general_cartage" | "institutional" | "motorcycle" | "tricycle";
  vehicleType?: "saloon" | "suv" | "pickup" | "sports";
  // Tonnage is how underwriters actually tier commercial goods/cartage rates (both
  // comprehensive and TPO) - only meaningful for commercial_goods/commercial_general_cartage.
  vehicleTonnage?: number;
  excessProtector?: boolean;
  pvt?: boolean;
  windscreen?: boolean;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
}

export interface MedicalDependant {
  relationship: "spouse" | "child";
  age: number;
}

export interface MedicalQuoteParams {
  principalName: string;
  principalAge: number;
  principalPhone: string;
  principalEmail: string;
  principalCounty: string;
  dependantsCount: number;
  // Per-member breakdown (relationship + own age) - drives insurers whose real rate cards
  // price each family member individually by age (e.g. Jubilee J-Care), rather than a single
  // family-size lookup. Optional so older callers/insurers that only need the headcount keep
  // working off dependantsCount unchanged.
  dependants?: MedicalDependant[];
  inpatientLimit: number;
  outpatientLimit: number;
  maternityCover: boolean;
  dentalCover: boolean;
}
