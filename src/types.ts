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
  riderBreakdown?: {
    excessProtector: number;
    pvt: number;
    windscreen: number;
  };
  riderStatus?: {
    excessProtector: "included" | "selected" | "available" | "unavailable";
    pvt: "included" | "selected" | "available" | "unavailable";
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
  excessProtector?: boolean;
  pvt?: boolean;
  windscreen?: boolean;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
}

export interface MedicalQuoteParams {
  principalName: string;
  principalAge: number;
  principalPhone: string;
  principalEmail: string;
  principalCounty: string;
  dependantsCount: number;
  inpatientLimit: number;
  outpatientLimit: number;
  maternityCover: boolean;
  dentalCover: boolean;
}
