export interface StaffProfile {
  id: string;
  fullName: string;
  email?: string | null;
  roleId: string | null;
}

export interface StaffSession extends StaffProfile {
  permissions: string[];
}

export interface AuditLogEntry {
  id: number;
  actorStaffId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: unknown;
  afterState: unknown;
  reason: string | null;
  occurredAt: string;
}

export interface Party {
  id: string;
  partyType: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  nationalId: string | null;
  kraPin: string | null;
  companyRegNo: string | null;
  county: string | null;
  physicalAddress: string | null;
  status: string;
  riskRating: string | null;
  leadSource: string | null;
  consentGiven: boolean;
  consentTimestamp: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CLIENT_SEGMENTS = ["retail", "sme", "corporate", "affinity", "group"] as const;
export const KYC_STATUSES = ["pending", "verification", "compliance_review", "approved", "restricted", "rejected", "review_due"] as const;

// Segment/branch/service-tier and its own KYC status — distinct from
// Party.status. One account per party; a corporate party's directors/
// signatories are separate Relationship rows, not separate accounts.
export interface ClientAccount {
  id: string;
  partyId: string;
  segment: string | null;
  branch: string | null;
  serviceTier: string | null;
  ownerStaffId: string | null;
  kycStatus: string;
  preferences: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const RELATIONSHIP_TYPES = [
  "beneficial_owner", "director", "dependant", "authorized_person", "producer", "referrer", "insurer_contact", "provider_contact",
] as const;

export interface Relationship {
  id: string;
  partyId: string;
  relatedPartyId: string | null;
  relationshipType: string;
  ownershipPct: number | null;
  pepStatus: boolean;
  designation: string | null;
  createdAt: string;
}

export const INTERACTION_CHANNELS = ["call", "email", "sms", "whatsapp", "visit", "portal", "other"] as const;

export interface Interaction {
  id: string;
  partyId: string | null;
  staffId: string | null;
  channel: string;
  direction: "inbound" | "outbound";
  subject: string | null;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
}

export const COMMS_CHANNELS = ["email", "sms", "whatsapp", "push"] as const;

// Versioned wording behind a notification. Editing bodyTemplate bumps
// version server-side, so a past notification's rendered copy stays
// traceable to what it was actually sent with.
export interface CorrespondenceTemplate {
  id: string;
  code: string;
  area: string | null;
  channel: string;
  subject: string | null;
  bodyTemplate: string;
  version: number;
  effectiveFrom: string;
  active: boolean;
}

// A queued/sent system notification rendered from a template — no
// real email/SMS/WhatsApp gateway is wired up in this dev build,
// "sent" means a staff member marked it dispatched.
export interface Notification {
  id: string;
  partyId: string | null;
  staffId: string | null;
  channel: string;
  templateCode: string | null;
  payload: Record<string, unknown> | null;
  status: "queued" | "sent" | "delivered" | "failed";
  sentAt: string | null;
  createdAt: string;
}

export const OPPORTUNITY_STAGES = [
  "New", "Contacted", "Qualified", "Discovery", "Data Collection",
  "Marketed", "Quoted", "Presented", "Decision", "Won", "Lost", "Deferred",
] as const;

export interface Opportunity {
  id: string;
  partyId: string | null;
  producerId: string | null;
  source: string | null;
  class: string | null;
  renewalDate: string | null;
  expectedPremiumKes: number | null;
  expectedCommissionKes: number | null;
  stage: string;
  ownerStaffId: string | null;
  outcomeReason: string | null;
  createdAt: string;
  updatedAt: string;
  // Only present on rows from the paged list (?limit=), which joins them in.
  partyName?: string | null;
  producerName?: string | null;
}

export interface Policy {
  id: string;
  quotationId: string | null;
  clientId: string | null;
  insurerId: string | null;
  producerId: string | null;
  category: string;
  premiumAmount: number;
  status: string;
  startDate: string;
  endDate: string;
  deliveredAt: string | null;
  deliveryMethod: string | null;
  clientAcknowledgedAt: string | null;
  premiumDueDate: string | null;
  sumInsuredKes: number | null;
  deductibleKes: number | null;
  valuationMethod: "actual_cash_value" | "replacement_cost" | "agreed_value" | null;
  agreedValueKes: number | null;
  createdAt: string;
  updatedAt: string;
  // Only present on rows from the paged list (?limit=), which joins them in.
  clientName?: string | null;
  insurerName?: string | null;
}

export const KYC_DOCUMENT_LABEL: Record<string, string> = {
  national_id_or_passport: "National ID / Passport",
  kra_pin: "KRA PIN",
  certificate_of_incorporation: "Certificate of Incorporation",
  cr12: "CR12 (directors/shareholders)",
  directors_ids: "Directors' IDs",
  tax_compliance_certificate: "Tax Compliance Certificate",
};

// Onboarding KYC document checklist — auto-seeded per party_type at
// party creation, gating ClientAccount.kycStatus from reaching
// 'approved' until every item here is verified or waived.
export interface KycChecklistItem {
  id: string;
  partyId: string;
  documentType: string;
  status: "pending" | "received" | "verified" | "waived";
  documentId: string | null;
  notes: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

// SOP-11 fixed checklist compared against the placement instruction —
// every item must 'pass', and every Discrepancy resolved, before a
// policy can move to 'Delivered'.
export interface PolicyCheck {
  id: string;
  policyId: string;
  checkItem: string;
  status: "pending" | "pass" | "fail";
  notes: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  createdAt: string;
}

export interface Discrepancy {
  id: string;
  policyId: string;
  policyCheckId: string | null;
  description: string;
  status: "open" | "corrected" | "waived";
  raisedBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export const ENDORSEMENT_STAGES = [
  "Requested", "Information", "Terms", "Client Approval", "Instructed", "Issued", "Checked", "Completed", "Declined",
] as const;

export interface Endorsement {
  id: string;
  policyId: string;
  endorsementCategory: string;
  endorsementType: string;
  description: string | null;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  premiumAdjustmentKes: number | null;
  requestedDate: string;
  effectiveDate: string | null;
  status: string;
  appliedAt: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
}

export interface Renewal {
  id: string;
  policyId: string;
  renewalStatus: "upcoming" | "quoted" | "confirmed" | "lapsed";
  dueDate: string;
  caseOpenedAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  renewedPolicyId: string | null;
  createdAt: string;
}

export interface WorkflowTask {
  id: string;
  caseId: string | null;
  taskType: string;
  queue: string | null;
  ownerStaffId: string | null;
  priority: string;
  dueAt: string | null;
  status: string;
  outcome: string | null;
  escalated: boolean;
  createdAt: string;
  closedAt: string | null;
}

export interface ComplianceObligation {
  id: string;
  obligationType: string;
  source: string | null;
  requirement: string;
  ownerStaffId: string | null;
  dueDate: string;
  recurrence: string | null;
  status: string;
  submittedAt: string | null;
  outcome: string | null;
  nextDueDate: string | null;
  createdAt: string;
}

export const CLAIM_STAGES = [
  "Notified", "Acknowledged", "Documents", "Assessment", "Decision",
  "Offer", "Repudiated", "Payment", "Closed",
] as const;

export interface ClaimTimelineStep {
  id: number;
  claimId: string;
  status: string;
  eventDate: string | null;
  completed: boolean;
  detail: string | null;
  sortOrder: number;
}

export interface Claim {
  id: string;
  policyId: string | null;
  policyNumber: string;
  claimType: string;
  phoneNumber: string | null;
  description: string | null;
  status: string;
  assignedOfficerId: string | null;
  reserveAmountKes: number | null;
  paidAmountKes: number | null;
  excessKes: number | null;
  salvageKes: number | null;
  priorPaymentsKes: number | null;
  settlementReason: string | null;
  requiresManagerReview: boolean;
  managerReviewedBy: string | null;
  managerReviewedAt: string | null;
  reopenedCount: number;
  priority: "red" | "amber" | "green";
  lossDate: string | null;
  reportedDate: string;
  closedDate: string | null;
  fraudFlag: boolean;
  fraudScore: number | null;
  createdAt: string;
  updatedAt: string;
  timeline?: ClaimTimelineStep[];
}

export const RESERVE_PAYMENT_CODES = ["indemnity", "legal_fees", "loss_adjuster_fees", "medical_expenses", "investigation_fees", "salvage_recovery_cost", "other"] as const;

export interface ClaimReserveLine {
  id: string;
  claimId: string;
  reserveCode: string;
  amountKes: number;
  notes: string | null;
  createdAt: string;
}

export interface ClaimPaymentLine {
  id: string;
  claimId: string;
  paymentCode: string;
  amountKes: number;
  paymentReference: string | null;
  paidAt: string;
  notes: string | null;
  createdAt: string;
}

export const CLAIM_CHECKLIST_STATUSES = ["requested", "received", "reviewed", "waived"] as const;

// SOP-15: each document requested from a claimant/insurer/provider,
// tracked through its own status.
export interface ClaimChecklistItem {
  id: string;
  claimId: string;
  documentType: string;
  status: "requested" | "received" | "reviewed" | "waived";
  notes: string | null;
  requestedAt: string;
  receivedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface ClaimDiaryEntry {
  id: number;
  claimId: string;
  staffId: string | null;
  note: string;
  commitmentDueAt: string | null;
  createdAt: string;
}

export const COMPLAINT_STAGES = [
  "Received", "Acknowledged", "Investigation", "Decision", "Remedy", "Verification", "Closed", "Escalated",
] as const;

export interface Complaint {
  id: string;
  partyId: string | null;
  policyId: string | null;
  claimId: string | null;
  category: string | null;
  severity: string | null;
  subject: string | null;
  description: string | null;
  channel: string | null;
  status: string;
  remedy: string | null;
  correctiveAction: string | null;
  receivedDate: string;
  resolvedDate: string | null;
  assignedStaffId: string | null;
  createdAt: string;
}

export interface Insurer {
  id: string;
  name: string;
  insurerType: string;
  authorizedClasses: string[];
  rating: string | null;
  panelStatus: string;
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  aibkMember: boolean;
  kycStatus: string;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  createdAt: string;
}

export interface InsurerRateVersion {
  id: string;
  insurerId: string;
  category: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isProvisional: boolean;
  commissionRatePct: number | null;
  createdAt: string;
}

// PCF, Insurance Training Levy, stamp duty — Kenya Insurance Act /
// IRA-mandated charges applied market-wide, not negotiated per insurer.
// A null category means "applies to every class."
export interface StatutoryLevy {
  id: string;
  levyType: "pcf" | "itl" | "stamp_duty";
  category: string | null;
  calculationMethod: "percentage" | "flat";
  ratePct: number | null;
  flatAmountKes: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string | null;
  createdAt: string;
}

// Commission Guide Insurance.xlsx — the market's own maximum permitted
// commission rate per line of business. classCode maps onto the IRA
// class taxonomy; null where a product doesn't map to a single class.
export interface CommissionGuideEntry {
  id: string;
  category: string;
  policyName: string;
  classCode: string | null;
  maxPermittedCommissionPct: number;
  source: string | null;
  createdAt: string;
}

export interface PremiumConfirmation {
  id: string;
  policyId: string;
  insurerChannel: string | null;
  confirmedAmountKes: number;
  paymentReference: string | null;
  paymentId: string | null;
  verifiedBy: string | null;
  confirmedAt: string;
  createdAt: string;
}

export interface FinancialTransaction {
  id: string;
  policyId: string | null;
  partyId: string | null;
  claimId: string | null;
  transactionType: string;
  direction: string;
  amountKes: number;
  currency: string;
  method: string | null;
  providerReference: string | null;
  matched: boolean;
  status: string;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
}

// A single client payment (one cheque/transfer/M-Pesa transaction)
// that may fund more than one policy's premium at once — see
// PremiumConfirmation.paymentId, which links each allocation back here.
export interface Payment {
  id: string;
  partyId: string | null;
  totalAmountKes: number;
  method: string | null;
  paymentReference: string | null;
  receivedAt: string;
  recordedBy: string | null;
  createdAt: string;
  allocatedKes?: number;
  unallocatedKes?: number;
  allocations?: PremiumConfirmation[];
}

export const PETTY_CASH_TRANSACTION_TYPES = ["replenishment", "disbursement"] as const;

// The brokerage's own operating cash — distinct from client premium/
// insurer commission money, which the firm never treats as its own.
export interface PettyCashFloat {
  id: string;
  custodianStaffId: string | null;
  openingBalanceKes: number;
  currentBalanceKes: number;
  status: "active" | "closed";
  openedAt: string;
  closedAt: string | null;
}

export interface PettyCashTransaction {
  id: string;
  floatId: string;
  transactionType: "replenishment" | "disbursement";
  amountKes: number;
  purpose: string;
  receiptDocumentId: string | null;
  recordedBy: string | null;
  occurredAt: string;
  createdAt: string;
}

export const OFFICE_EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "supplies", "marketing", "professional_fees", "insurance", "other"] as const;

export interface OfficeExpense {
  id: string;
  category: string;
  description: string;
  amountKes: number;
  vendor: string | null;
  paymentMethod: string | null;
  status: "recorded" | "approved" | "paid";
  incurredAt: string;
  paidAt: string | null;
  receiptDocumentId: string | null;
  recordedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
}

export interface GlAccount {
  code: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "income" | "expense";
  normalBalance: "debit" | "credit";
  parentAccountCode: string | null;
  isSystemAccount: boolean;
  active: boolean;
  createdAt: string;
}

export interface AccountingPeriod {
  id: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
}

export interface JournalLine {
  id: number;
  entryId: string;
  accountCode: string;
  debitKes: number;
  creditKes: number;
  description: string | null;
  policyId: string | null;
  partyId: string | null;
}

export interface JournalEntry {
  id: string;
  periodId: string;
  entryDate: string;
  reference: string | null;
  description: string | null;
  sourceType: string;
  sourceId: string | null;
  status: "posted" | "reversed";
  reversalOfEntryId: string | null;
  postedBy: string | null;
  createdAt: string;
  lines: JournalLine[];
}

export interface TrialBalanceRow {
  accountCode: string;
  name: string;
  accountType: string;
  normalBalance: "debit" | "credit";
  totalDebitKes: number;
  totalCreditKes: number;
  balanceKes: number;
}

export interface TrialBalance {
  periodId: string;
  rows: TrialBalanceRow[];
  totalDebitKes: number;
  totalCreditKes: number;
  balanced: boolean;
}

export interface IncomeStatement {
  periodId: string;
  rows: { accountCode: string; name: string; accountType: string; amountKes: number }[];
  totalIncomeKes: number;
  totalExpenseKes: number;
  netIncomeKes: number;
}

export interface BalanceSheet {
  asOfDate: string;
  rows: { accountCode: string; name: string; accountType: string; balanceKes: number }[];
  currentEarningsKes: number;
  totalAssetsKes: number;
  totalLiabilitiesKes: number;
  totalEquityKes: number;
  totalLiabilitiesAndEquityKes: number;
  balanced: boolean;
}

export interface PremiumAgeingRow {
  policyId: string;
  clientId: string | null;
  outstandingKes: number;
  dueDate: string;
  daysPastDue: number;
  bucket: "current" | "early" | "follow_up" | "escalation" | "critical";
  bucketLabel: string;
}

export interface PremiumAgeing {
  rows: PremiumAgeingRow[];
  summary: Record<string, number>;
}

export const COMMISSION_STATEMENT_STAGES = [
  "Imported", "Auto-Matched", "Manual Review", "Discrepancy", "Resolved", "Approved", "Posted", "Closed",
] as const;

export interface CommissionStatement {
  id: string;
  insurerId: string;
  periodStart: string;
  periodEnd: string;
  totalCommissionKes: number | null;
  status: string;
  receivedAt: string | null;
  createdAt: string;
}

export interface CommissionLine {
  id: number;
  statementId: string;
  policyId: string | null;
  commissionRatePct: number | null;
  commissionAmountKes: number | null;
  matchedTransactionId: string | null;
}

export interface DocumentMeta {
  id: string;
  ownerEntityType: string;
  ownerEntityId: string;
  fileName: string;
  mimeType: string | null;
  storageKey: string;
  documentType: string | null;
  sensitivity: string;
  version: number;
  uploadedBy: string | null;
  createdAt: string;
}

export interface Risk {
  id: string;
  partyId: string | null;
  opportunityId: string | null;
  class: string;
  subjectMatter: string | null;
  exposureAttributes: Record<string, unknown> | null;
  valuationKes: number | null;
  createdAt: string;
}

export const SUBMISSION_STAGES = [
  "Draft", "Approved", "Sent", "Acknowledged", "Clarification", "Quote", "Decline", "Comparison Ready", "Closed",
] as const;

export interface Submission {
  id: string;
  riskId: string;
  version: number;
  markets: string[] | null;
  dispatchedAt: string | null;
  deadlineAt: string | null;
  status: string;
  createdAt: string;
  restrictedInsurerWarnings?: string[];
}

export const MARKET_STRATEGY_TYPES = ["incumbent_renewal", "remarketing", "specialist_facility", "co_insurance", "layering"] as const;

// SOP-07: the approved placement approach for a risk, recorded before
// the market submission goes out.
export interface MarketStrategy {
  id: string;
  riskId: string;
  strategyType: string;
  rationale: string;
  singleSourceJustification: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export const APPETITE_LEVELS = ["preferred", "accepted", "restricted", "excluded"] as const;

// SOP-07: business risk appetite per insurer+class — distinct from
// the licence-based authorizedClasses check on Insurer.
export interface InsurerAppetite {
  id: string;
  insurerId: string;
  classCode: string;
  appetiteLevel: "preferred" | "accepted" | "restricted" | "excluded";
  maxCapacityKes: number | null;
  notes: string | null;
  createdAt: string;
}

// Underwriting-Framework-inspired product catalog: a named product an
// insurer actually sells, separate from the raw category/class used
// for pricing.
export interface Product {
  id: string;
  insurerId: string;
  category: string;
  name: string;
  description: string | null;
  wordingDocumentId: string | null;
  active: boolean;
}

export interface Quotation {
  id: string;
  submissionId: string | null;
  clientId: string | null;
  status: string;
  category: string;
  insurerId: string | null;
  insurerName: string | null;
  rateVersionRef: string | null;
  sumInsuredKes: number | null;
  basePremiumKes: number | null;
  pcfLevyKes: number | null;
  itlLevyKes: number | null;
  stampDutyKes: number | null;
  totalPremiumKes: number | null;
  commissionRatePct: number | null;
  limits: Record<string, unknown> | null;
  deductibles: Record<string, unknown> | null;
  exclusions: string[] | null;
  warranties: string[] | null;
  extensions: string[] | null;
  conditions: string | null;
  paymentTerms: string | null;
  specialTerms: string | null;
  validUntil: string | null;
  createdAt: string;
}

export interface Recommendation {
  id: string;
  submissionId: string;
  comparedQuotationIds: string[];
  recommendedQuotationId: string | null;
  reasons: string | null;
  disclosures: string | null;
  limitations: string | null;
  presentedBy: string | null;
  presentedAt: string | null;
  clientDecision: string;
  deviationNotes: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export const SANCTIONS_SCREENING_RESULTS = ["pending", "clear", "hit", "override"] as const;

// SOP-23: sanctions/PEP screening and conflict-of-interest clearance
// for a risk — gates whether a client's recommendation decision can
// be accepted.
export interface RiskClearance {
  id: string;
  riskId: string;
  sanctionsScreeningResult: "pending" | "clear" | "hit" | "override";
  pepStatus: boolean;
  conflictOfInterestChecked: boolean;
  conflictOfInterestNotes: string | null;
  clearedBy: string | null;
  clearedAt: string | null;
  createdAt: string;
}

export const UNDERWRITING_QUERY_STATUSES = ["open", "awaiting_client", "responded", "closed"] as const;

// An insurer's mid-submission information request, tracked as its own
// record: question -> broker reviews -> client info required -> client
// responds -> broker validates -> response sent -> underwriter decision.
export interface UnderwritingQuery {
  id: string;
  submissionId: string;
  question: string;
  receivedAt: string;
  requiredResponseDate: string | null;
  responsibleStaffId: string | null;
  clientInfoRequired: string | null;
  response: string | null;
  responseDocumentId: string | null;
  status: "open" | "awaiting_client" | "responded" | "closed";
  createdAt: string;
}

export const APPROVAL_STAGES = ["team_leader", "senior_manager", "final"] as const;

// Internal sign-off chain for risks outside normal appetite — one row
// per stage, decided in order. Advisory/governance record; it does not
// itself block presenting or accepting a recommendation.
export interface UnderwritingApproval {
  id: string;
  batchId: string;
  riskId: string;
  reason: string;
  stage: "team_leader" | "senior_manager" | "final";
  decision: "pending" | "approved" | "rejected";
  approverId: string | null;
  decidedAt: string | null;
  comments: string | null;
  conditions: string | null;
  requestedBy: string | null;
  createdAt: string;
}

// Pre-submission coverage verification — the policy itself (active?
// loss within period? asset covered? premium paid? within limit?),
// distinct from the claim documents checklist.
export interface CoverageVerificationItem {
  id: string;
  claimId: string;
  checkItem: string;
  status: "pending" | "pass" | "fail";
  notes: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  createdAt: string;
}

export interface ClaimsEscalationRow {
  claimId: string;
  policyId: string | null;
  status: string;
  priority: "red" | "amber" | "green";
  assignedOfficerId: string | null;
  requiresManagerReview: boolean;
  fraudFlag: boolean;
  daysOutstanding: number;
  lastActionDate: string;
  lastActionDetail: string;
  nextActionHint: string;
  escalationLevel: "normal" | "watch" | "escalate" | "critical";
}

export interface ClaimsEscalation {
  rows: ClaimsEscalationRow[];
  summary: Record<string, number>;
}

export interface Staff {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  roleId: string | null;
  supervisorId: string | null;
  approvalLimitKes: number | null;
  active: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface Employee {
  staffId: string;
  jobTitle: string | null;
  department: string | null;
  branch: string | null;
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  employmentStatus: "active" | "on_leave" | "suspended" | "terminated";
  hireDate: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  nationalId: string | null;
  kraPin: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  baseSalaryKes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveType {
  id: string;
  name: string;
  defaultDaysPerYear: number;
  paid: boolean;
}

export interface LeaveBalance {
  id: string;
  staffId: string;
  leaveTypeId: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  carriedOverDays: number;
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason: string | null;
  status: "requested" | "approved" | "rejected" | "cancelled";
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
}

export interface PerformanceReview {
  id: string;
  staffId: string;
  reviewerId: string | null;
  periodStart: string;
  periodEnd: string;
  rating: "exceeds" | "meets" | "below" | "unsatisfactory" | null;
  strengths: string | null;
  areasForImprovement: string | null;
  goals: string | null;
  status: "draft" | "submitted" | "acknowledged";
  submittedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface Producer {
  id: string;
  producerType: "agent" | "sub_broker";
  name: string;
  contactPerson: string | null;
  phoneNumber: string | null;
  email: string | null;
  kraPin: string | null;
  licenceNumber: string | null;
  commissionSplitPct: number;
  status: "active" | "inactive";
  contractStartDate: string | null;
  contractEndDate: string | null;
  targetPremiumKes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  premiumYtdKes: number;
}

export interface ProducerCommissionSplit {
  id: string;
  producerId: string;
  policyId: string;
  premiumConfirmationId: string | null;
  commissionAmountKes: number;
  splitPct: number;
  splitAmountKes: number;
  status: "pending" | "paid";
  paidAt: string | null;
  paymentReference: string | null;
  createdAt: string;
}
