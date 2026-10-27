import { pgSchema, text, boolean, timestamp, numeric, date, jsonb, bigserial, integer, customType } from "drizzle-orm/pg-core";

// Mirrors database/schema.sql — one Drizzle table per SQL table this
// service exposes via its API today. Columns are mapped snake_case
// (DB) -> camelCase (JS/API). Tables not yet wired to a route exist in
// schema.sql but aren't declared here yet — add them as each module
// gets its own endpoints.

export const access = pgSchema("access");
export const crm = pgSchema("crm");
export const product = pgSchema("product");
export const sales = pgSchema("sales");
export const policySchema = pgSchema("policy");
export const workflow = pgSchema("workflow");
export const compliance = pgSchema("compliance");
export const claimsSchema = pgSchema("claims");
export const finance = pgSchema("finance");
export const docsSchema = pgSchema("docs");
export const comms = pgSchema("comms");
export const hr = pgSchema("hr");
export const siteSchema = pgSchema("site");

// Postgres bytea <-> Node Buffer (node-postgres returns a Buffer, PGlite a Uint8Array).
const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => value,
  fromDriver: (value) => Buffer.from(value),
});

export const staff = access.table("staff", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  roleId: text("role_id"),
  supervisorId: text("supervisor_id"),
  approvalLimitKes: numeric("approval_limit_kes", { mode: "number", precision: 14, scale: 2 }),
  active: boolean("active").notNull().default(true),
  passwordHash: text("password_hash"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = access.table("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const permissions = access.table("permissions", {
  id: text("id").primaryKey(),
  description: text("description"),
});

export const rolePermissions = access.table("role_permissions", {
  roleId: text("role_id").notNull(),
  permissionId: text("permission_id").notNull(),
});

export const parties = crm.table("parties", {
  id: text("id").primaryKey(),
  partyType: text("party_type").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  nationalId: text("national_id"),
  kraPin: text("kra_pin"),
  companyRegNo: text("company_reg_no"),
  county: text("county"),
  physicalAddress: text("physical_address"),
  status: text("status").notNull().default("active"),
  riskRating: text("risk_rating"),
  leadSource: text("lead_source"),
  consentGiven: boolean("consent_given").notNull().default(false),
  consentTimestamp: timestamp("consent_timestamp", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Client account — segment, branch, service tier, owning staff member
// and its own KYC status, distinct from Party's own status field. A
// corporate party may have several linked individual parties
// (directors, authorized signatories, see relationships below) but
// one client account.
export const clientAccounts = crm.table("client_accounts", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull(),
  segment: text("segment"),
  branch: text("branch"),
  serviceTier: text("service_tier"),
  ownerStaffId: text("owner_staff_id"),
  kycStatus: text("kyc_status").notNull().default("pending"),
  preferences: jsonb("preferences"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Onboarding KYC document checklist — auto-seeded per party_type at
// party creation, gating clientAccounts.kycStatus from reaching
// 'approved' until every item here is verified or waived.
export const kycChecklistItems = crm.table("kyc_checklist_items", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull(),
  documentType: text("document_type").notNull(),
  status: text("status").notNull().default("pending"),
  documentId: text("document_id"),
  notes: text("notes"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One edge in the party graph — director, dependant, beneficial
// owner, authorized signatory, producer, referrer, insurer/provider
// contact. A corporate party can have several of these; a Party
// record itself stays one row per legal person.
export const relationships = crm.table("relationships", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull(),
  relatedPartyId: text("related_party_id"),
  relationshipType: text("relationship_type").notNull(),
  ownershipPct: numeric("ownership_pct", { mode: "number", precision: 5, scale: 2 }),
  pepStatus: boolean("pep_status").notNull().default(false),
  designation: text("designation"),
  idDocumentId: text("id_document_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Logged client contact — call/email/sms/whatsapp/visit/portal —
// distinct from comms.notifications (system-sent messages via a
// template); this is what a staff member did or received, manually
// recorded, not queued/sent by the platform itself.
export const interactions = crm.table("interactions", {
  id: text("id").primaryKey(),
  partyId: text("party_id"),
  staffId: text("staff_id"),
  channel: text("channel").notNull(),
  direction: text("direction").notNull(),
  subject: text("subject"),
  notes: text("notes"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = crm.table("opportunities", {
  id: text("id").primaryKey(),
  partyId: text("party_id"),
  producerId: text("producer_id"),
  source: text("source"),
  class: text("class"),
  renewalDate: date("renewal_date"),
  expectedPremiumKes: numeric("expected_premium_kes", { mode: "number", precision: 14, scale: 2 }),
  expectedCommissionKes: numeric("expected_commission_kes", { mode: "number", precision: 14, scale: 2 }),
  stage: text("stage").notNull().default("New"),
  ownerStaffId: text("owner_staff_id"),
  outcomeReason: text("outcome_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const policies = policySchema.table("policies", {
  id: text("id").primaryKey(),
  quotationId: text("quotation_id"),
  clientId: text("client_id"),
  insurerId: text("insurer_id"),
  producerId: text("producer_id"),
  category: text("category").notNull(),
  premiumAmount: numeric("premium_amount", { mode: "number", precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("Pending"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  policyDocumentId: text("policy_document_id"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deliveryMethod: text("delivery_method"),
  clientAcknowledgedAt: timestamp("client_acknowledged_at", { withTimezone: true }),
  premiumDueDate: date("premium_due_date"),
  sumInsuredKes: numeric("sum_insured_kes", { mode: "number", precision: 14, scale: 2 }),
  deductibleKes: numeric("deductible_kes", { mode: "number", precision: 14, scale: 2 }),
  valuationMethod: text("valuation_method"),
  agreedValueKes: numeric("agreed_value_kes", { mode: "number", precision: 14, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// SOP-11 Policy Issuance, Checking and Delivery — a fixed checklist
// compared against the placement instruction; every item must 'pass'
// (and every policy.discrepancies row must be resolved) before the
// policy can be marked Delivered — enforced server-side, not just a
// UI convention.
export const policyChecks = policySchema.table("policy_checks", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  checkItem: text("check_item").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  checkedBy: text("checked_by"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const discrepancies = policySchema.table("discrepancies", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  policyCheckId: text("policy_check_id"),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  raisedBy: text("raised_by"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Mid-term policy changes (SOP §8/§9 endorsement lifecycle: Requested
// -> Information -> Terms -> Client Approval -> Instructed -> Issued
// -> Checked -> Completed, or Declined at any point before Instructed).
export const endorsements = policySchema.table("endorsements", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  endorsementCategory: text("endorsement_category").notNull(),
  endorsementType: text("endorsement_type").notNull(),
  description: text("description"),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  premiumAdjustmentKes: numeric("premium_adjustment_kes", { mode: "number", precision: 14, scale: 2 }).default(0),
  requestedDate: timestamp("requested_date", { withTimezone: true }).notNull().defaultNow(),
  effectiveDate: date("effective_date"),
  status: text("status").notNull().default("Requested"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  requestedBy: text("requested_by"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The 90-120 day renewal pipeline (SOP §12.2 / wireframe §12.2) — one
// row per policy's upcoming expiry, tracked independently of the
// policy itself so reminder cadence and outcome survive across
// multiple renewal cycles of the same policy.
export const renewals = policySchema.table("renewals", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  renewalStatus: text("renewal_status").notNull().default("upcoming"),
  dueDate: date("due_date").notNull(),
  caseOpenedAt: timestamp("case_opened_at", { withTimezone: true }),
  reminderCount: integer("reminder_count").notNull().default(0),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  renewedPolicyId: text("renewed_policy_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Generic case/task engine (SOP §9) — every workflow (opportunity,
// onboarding, submission, placement, policy, endorsement, claim,
// complaint, reconciliation, finding) opens a case here.
export const cases = workflow.table("cases", {
  id: text("id").primaryKey(),
  workflowType: text("workflow_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  currentState: text("current_state").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closureReason: text("closure_reason"),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  ownerStaffId: text("owner_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const caseTransitions = workflow.table("case_transitions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  caseId: text("case_id").notNull(),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  actorStaffId: text("actor_staff_id"),
  reason: text("reason"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = workflow.table("tasks", {
  id: text("id").primaryKey(),
  caseId: text("case_id"),
  taskType: text("task_type").notNull(),
  queue: text("queue"),
  ownerStaffId: text("owner_staff_id"),
  priority: text("priority").notNull().default("normal"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status").notNull().default("open"),
  outcome: text("outcome"),
  evidenceDocumentId: text("evidence_document_id"),
  escalated: boolean("escalated").notNull().default(false),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const obligations = compliance.table("obligations", {
  id: text("id").primaryKey(),
  obligationType: text("obligation_type").notNull(),
  source: text("source"),
  requirement: text("requirement").notNull(),
  ownerStaffId: text("owner_staff_id"),
  dueDate: date("due_date").notNull(),
  recurrence: text("recurrence"),
  evidenceDocumentId: text("evidence_document_id"),
  status: text("status").notNull().default("open"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  outcome: text("outcome"),
  nextDueDate: date("next_due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = compliance.table("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorStaffId: text("actor_staff_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  reason: text("reason"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

// Claims (SOP §8/§9) — FNOL through settlement: Notified → Acknowledged
// → Documents → Assessment → Decision → Offer/Repudiated → Payment →
// Closed. Each claim also opens a workflow.cases row (workflowType
// 'claim') so it's covered by the same SLA/escalation engine.
export const claims = claimsSchema.table("claims", {
  id: text("id").primaryKey(),
  policyId: text("policy_id"),
  policyNumber: text("policy_number").notNull(),
  claimType: text("claim_type").notNull(),
  phoneNumber: text("phone_number"),
  description: text("description"),
  status: text("status").notNull().default("Notified"),
  assignedOfficerId: text("assigned_officer_id"),
  reserveAmountKes: numeric("reserve_amount_kes", { mode: "number", precision: 14, scale: 2 }),
  paidAmountKes: numeric("paid_amount_kes", { mode: "number", precision: 14, scale: 2 }),
  excessKes: numeric("excess_kes", { mode: "number", precision: 14, scale: 2 }),
  salvageKes: numeric("salvage_kes", { mode: "number", precision: 14, scale: 2 }),
  priorPaymentsKes: numeric("prior_payments_kes", { mode: "number", precision: 14, scale: 2 }),
  settlementReason: text("settlement_reason"),
  requiresManagerReview: boolean("requires_manager_review").notNull().default(false),
  managerReviewedBy: text("manager_reviewed_by"),
  managerReviewedAt: timestamp("manager_reviewed_at", { withTimezone: true }),
  reopenedCount: integer("reopened_count").notNull().default(0),
  priority: text("priority").notNull().default("green"),
  lossDate: date("loss_date"),
  reportedDate: timestamp("reported_date", { withTimezone: true }).notNull().defaultNow(),
  closedDate: timestamp("closed_date", { withTimezone: true }),
  fraudFlag: boolean("fraud_flag").notNull().default(false),
  fraudScore: numeric("fraud_score", { mode: "number", precision: 5, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claimTimelineSteps = claimsSchema.table("claim_timeline_steps", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  claimId: text("claim_id").notNull(),
  status: text("status").notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }),
  completed: boolean("completed").notNull().default(false),
  detail: text("detail"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Pre-submission coverage verification — the policy itself (active?
// loss within period? asset covered? premium paid? within limit?),
// distinct from the documents checklist below.
export const coverageVerificationItems = claimsSchema.table("coverage_verification_items", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull(),
  checkItem: text("check_item").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  checkedBy: text("checked_by"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// SOP-15: each document requested from a claimant/insurer/provider,
// tracked through its own status — not just "was something uploaded" —
// so a stalled request is visible before it becomes a cycle-time
// problem.
export const claimChecklistItems = claimsSchema.table("claim_checklist_items", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull(),
  documentType: text("document_type").notNull(),
  status: text("status").notNull().default("requested"),
  notes: text("notes"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
});

// The claim diary: chronological notes/commitments, distinct from
// claim_timeline_steps' status-change history. commitmentDueAt lets an
// entry carry its own follow-up date, so a stalled claim is visible
// (no update past its own commitment) without a separate escalation job.
export const claimDiaryEntries = claimsSchema.table("claim_diary_entries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  claimId: text("claim_id").notNull(),
  staffId: text("staff_id"),
  note: text("note").notNull(),
  commitmentDueAt: timestamp("commitment_due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Itemized reserve/payment breakdown by cost code — what a claim's
// single reserveAmountKes/paidAmountKes total is actually FOR, not
// just one lump figure. Supplements those totals rather than
// replacing them; the totals stay what the SOP-16 settlement gate
// checks against.
export const claimReserveLines = claimsSchema.table("claim_reserve_lines", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull(),
  reserveCode: text("reserve_code").notNull(),
  amountKes: numeric("amount_kes", { mode: "number", precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claimPaymentLines = claimsSchema.table("claim_payment_lines", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull(),
  paymentCode: text("payment_code").notNull(),
  amountKes: numeric("amount_kes", { mode: "number", precision: 14, scale: 2 }).notNull(),
  paymentReference: text("payment_reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Complaints (SOP §8/§9) — Received → Acknowledged → Investigation →
// Decision → Remedy → Verification → Closed/Escalated.
export const complaints = claimsSchema.table("complaints", {
  id: text("id").primaryKey(),
  partyId: text("party_id"),
  policyId: text("policy_id"),
  claimId: text("claim_id"),
  category: text("category"),
  severity: text("severity"),
  cause: text("cause"),
  subject: text("subject"),
  description: text("description"),
  channel: text("channel"),
  status: text("status").notNull().default("Received"),
  remedy: text("remedy"),
  correctiveAction: text("corrective_action"),
  receivedDate: timestamp("received_date", { withTimezone: true }).notNull().defaultNow(),
  resolvedDate: timestamp("resolved_date", { withTimezone: true }),
  assignedStaffId: text("assigned_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Insurer catalogue (SOP-02: "Use only approved, licensed and suitable
// insurers") — panel status + KYC/licensing fields.
export const insurers = product.table("insurers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  insurerType: text("insurer_type").notNull().default("general"),
  authorizedClasses: jsonb("authorized_classes").notNull().default([]),
  rating: text("rating"),
  panelStatus: text("panel_status").notNull().default("approved"),
  licenseNumber: text("license_number"),
  licenseExpiryDate: date("license_expiry_date"),
  aibkMember: boolean("aibk_member").notNull().default(false),
  kycStatus: text("kyc_status").notNull().default("pending"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // --- how the public website knows and presents this insurer (migrate-022) ---
  siteSlug: text("site_slug"), // short id used by the website and the quote engine, e.g. "icea"
  displayName: text("display_name"), // the name shown on quotes
  ratingLabel: text("rating_label"),
  quotePoolOrder: integer("quote_pool_order"), // set = always quoted, in this order; null = quoted only once it has live rates
  siteOrigin: text("site_origin").$type<"builtin" | "admin">(),
  profile: jsonb("profile").$type<Record<string, unknown> | null>(),
});

// Per insurer+class settings: commission rate and the Kenya-specific
// statutory levies (PCF, Insurance Training Levy, stamp duty).
// Per insurer+class commission terms only — a negotiated business
// rate. Statutory levies (PCF, Training Levy, stamp duty) live in
// statutoryLevies below since they're government-mandated and
// identical across every insurer, not a per-insurer setting.
export const insurerRateVersions = product.table("insurer_rate_versions", {
  id: text("id").primaryKey(),
  insurerId: text("insurer_id").notNull(),
  category: text("category").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isProvisional: boolean("is_provisional").notNull().default(false),
  commissionRatePct: numeric("commission_rate_pct", { mode: "number", precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Statutory levies — set by law/regulation, not negotiated per
// insurer. One rate applies market-wide for a class + effective
// period, regardless of which insurer underwrites the policy.
export const statutoryLevies = product.table("statutory_levies", {
  id: text("id").primaryKey(),
  levyType: text("levy_type").notNull(),
  category: text("category"),
  calculationMethod: text("calculation_method").notNull(),
  ratePct: numeric("rate_pct", { mode: "number", precision: 6, scale: 4 }),
  flatAmountKes: numeric("flat_amount_kes", { mode: "number", precision: 10, scale: 2 }),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Maximum permitted commission rate per line of business, per the
// market's own Commission Guide — a ceiling insurerRateVersions
// .commissionRatePct is validated against for a given class, not a
// rate itself. classCode maps onto the IRA class taxonomy; NULL where
// a product doesn't map to a single class.
export const commissionGuide = product.table("commission_guide", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  policyName: text("policy_name").notNull(),
  classCode: text("class_code"),
  maxPermittedCommissionPct: numeric("max_permitted_commission_pct", { mode: "number", precision: 5, scale: 2 }).notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// SOP-07: business risk appetite, distinct from the licence-based
// authorizedClasses check on insurers — a general insurer may be
// licensed for a class but the brokerage may still not want to place
// there. 'excluded' blocks selection outright; 'restricted' allows it
// with a warning.
export const insurerAppetite = product.table("insurer_appetite", {
  id: text("id").primaryKey(),
  insurerId: text("insurer_id").notNull(),
  classCode: text("class_code").notNull(),
  appetiteLevel: text("appetite_level").notNull().default("accepted"),
  maxCapacityKes: numeric("max_capacity_kes", { mode: "number", precision: 14, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Underwriting-Framework-inspired product catalog: a named product an
// insurer actually sells (as opposed to the raw category/class used
// for pricing), so a new product can be published without a code
// change — "faster deployment of new products".
export const products = product.table("products", {
  id: text("id").primaryKey(),
  insurerId: text("insurer_id").notNull(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  wordingDocumentId: text("wording_document_id"),
  active: boolean("active").notNull().default(true),
});

// Premium confirmation — the evidence gate that unlocks a policy's
// Active status; premiums move through approved insurer channels,
// never broker custody (SOP §1.1).
export const premiumConfirmations = policySchema.table("premium_confirmations", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  insurerChannel: text("insurer_channel"),
  confirmedAmountKes: numeric("confirmed_amount_kes", { mode: "number", precision: 14, scale: 2 }).notNull(),
  paymentReference: text("payment_reference"),
  paymentId: text("payment_id"),
  verifiedBy: text("verified_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Financial transaction — one ledger for premium, commission, tax,
// refund, payment, credit note. A 'commission' row with status
// 'pending' is a projection (premium collected, commission not yet
// insurer-confirmed) rather than a reconciled statement line.
export const financialTransactions = finance.table("financial_transactions", {
  id: text("id").primaryKey(),
  policyId: text("policy_id"),
  partyId: text("party_id"),
  claimId: text("claim_id"),
  transactionType: text("transaction_type").notNull(),
  direction: text("direction").notNull(),
  amountKes: numeric("amount_kes", { mode: "number", precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("KES"),
  method: text("method"),
  providerReference: text("provider_reference"),
  matched: boolean("matched").notNull().default(false),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Commission statement reconciliation — an insurer's own account of
// what they've paid/owe in commission for a period, checked against
// our own projected 'commission' financialTransactions rows (created
// when a premium is confirmed). Matching a line updates the projected
// transaction from 'pending' to 'matched'; an amount mismatch is a
// discrepancy to resolve, not silently overwritten.
export const commissionStatements = finance.table("commission_statements", {
  id: text("id").primaryKey(),
  insurerId: text("insurer_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalCommissionKes: numeric("total_commission_kes", { mode: "number", precision: 14, scale: 2 }),
  status: text("status").notNull().default("Imported"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commissionLines = finance.table("commission_lines", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  statementId: text("statement_id").notNull(),
  policyId: text("policy_id"),
  commissionRatePct: numeric("commission_rate_pct", { mode: "number", precision: 5, scale: 2 }),
  commissionAmountKes: numeric("commission_amount_kes", { mode: "number", precision: 14, scale: 2 }),
  matchedTransactionId: text("matched_transaction_id"),
});

// Producer commission split payable — see producers above and
// migrate-019-producers.ts. Distinct from commissionStatements/
// commissionLines: those reconcile the insurer's own commission
// statement; this tracks our internal distribution of the share we
// keep once earned.
export const producerCommissionSplits = finance.table("producer_commission_splits", {
  id: text("id").primaryKey(),
  producerId: text("producer_id").notNull(),
  policyId: text("policy_id").notNull(),
  premiumConfirmationId: text("premium_confirmation_id"),
  commissionAmountKes: numeric("commission_amount_kes", { mode: "number", precision: 14, scale: 2 }).notNull(),
  splitPct: numeric("split_pct", { mode: "number", precision: 5, scale: 2 }).notNull(),
  splitAmountKes: numeric("split_amount_kes", { mode: "number", precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentReference: text("payment_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A single client payment (one cheque/transfer/M-Pesa transaction)
// that may fund more than one policy's premium at once. Allocation
// happens by creating premiumConfirmations rows with paymentId set to
// this row's id — unallocated balance = totalAmountKes minus the sum
// of those confirmations' confirmedAmountKes.
export const payments = finance.table("payments", {
  id: text("id").primaryKey(),
  partyId: text("party_id"),
  totalAmountKes: numeric("total_amount_kes", { mode: "number", precision: 14, scale: 2 }).notNull(),
  method: text("method"),
  paymentReference: text("payment_reference"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The brokerage's own operating cash — distinct from client premium/
// insurer commission money, which the firm never treats as its own.
export const pettyCashFloats = finance.table("petty_cash_floats", {
  id: text("id").primaryKey(),
  custodianStaffId: text("custodian_staff_id"),
  openingBalanceKes: numeric("opening_balance_kes", { mode: "number", precision: 12, scale: 2 }).notNull().default(0),
  currentBalanceKes: numeric("current_balance_kes", { mode: "number", precision: 12, scale: 2 }).notNull().default(0),
  status: text("status").notNull().default("active"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const pettyCashTransactions = finance.table("petty_cash_transactions", {
  id: text("id").primaryKey(),
  floatId: text("float_id").notNull(),
  transactionType: text("transaction_type").notNull(),
  amountKes: numeric("amount_kes", { mode: "number", precision: 12, scale: 2 }).notNull(),
  purpose: text("purpose").notNull(),
  receiptDocumentId: text("receipt_document_id"),
  recordedBy: text("recorded_by"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Office running costs (rent, utilities, salaries, ...) — the firm's
// own expenses, alongside client premium/commission accounting.
export const officeExpenses = finance.table("office_expenses", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amountKes: numeric("amount_kes", { mode: "number", precision: 12, scale: 2 }).notNull(),
  vendor: text("vendor"),
  paymentMethod: text("payment_method"),
  status: text("status").notNull().default("recorded"),
  incurredAt: date("incurred_at").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  receiptDocumentId: text("receipt_document_id"),
  recordedBy: text("recorded_by"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// General ledger — chart of accounts, accounting periods and
// double-entry journal entries/lines. financialTransactions above is
// a flat cash-event log; this is the real ledger a trial balance,
// income statement and balance sheet are computed from. Premium
// confirmations, office expense payments and petty cash transactions
// auto-post here (see postJournalEntry in server.ts).
export const glAccounts = finance.table("gl_accounts", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull(),
  normalBalance: text("normal_balance").notNull(),
  parentAccountCode: text("parent_account_code"),
  isSystemAccount: boolean("is_system_account").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountingPeriods = finance.table("accounting_periods", {
  id: text("id").primaryKey(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: text("closed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntries = finance.table("journal_entries", {
  id: text("id").primaryKey(),
  periodId: text("period_id").notNull(),
  entryDate: date("entry_date").notNull(),
  reference: text("reference"),
  description: text("description"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceId: text("source_id"),
  status: text("status").notNull().default("posted"),
  reversalOfEntryId: text("reversal_of_entry_id"),
  postedBy: text("posted_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalLines = finance.table("journal_lines", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entryId: text("entry_id").notNull(),
  accountCode: text("account_code").notNull(),
  debitKes: numeric("debit_kes", { mode: "number", precision: 14, scale: 2 }).notNull().default(0),
  creditKes: numeric("credit_kes", { mode: "number", precision: 14, scale: 2 }).notNull().default(0),
  description: text("description"),
  policyId: text("policy_id"),
  partyId: text("party_id"),
});

// Document metadata — files live in object storage (or local disk in
// dev, see server.ts); this row is the pointer + governance metadata.
export const documents = docsSchema.table("documents", {
  id: text("id").primaryKey(),
  ownerEntityType: text("owner_entity_type").notNull(),
  ownerEntityId: text("owner_entity_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  storageKey: text("storage_key").notNull(),
  documentType: text("document_type"),
  sensitivity: text("sensitivity").notNull().default("internal"),
  version: integer("version").notNull().default(1),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Agent/sub-broker who introduces business — see
// migrate-019-producers.ts. opportunities.producerId /
// policies.producerId trace business back here so a commission split
// can be computed when premium is confirmed (server.ts
// confirmPremiumForPolicy).
export const producers = sales.table("producers", {
  id: text("id").primaryKey(),
  producerType: text("producer_type").notNull(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phoneNumber: text("phone_number"),
  email: text("email"),
  kraPin: text("kra_pin"),
  licenceNumber: text("licence_number"),
  commissionSplitPct: numeric("commission_split_pct", { mode: "number", precision: 5, scale: 2 }).notNull().default(0),
  status: text("status").notNull().default("active"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  targetPremiumKes: numeric("target_premium_kes", { mode: "number", precision: 14, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Risk (SOP §8) — the exposure/subject-matter record behind an
// opportunity: what's actually being insured, not just the sales stage.
export const risks = sales.table("risks", {
  id: text("id").primaryKey(),
  partyId: text("party_id"),
  opportunityId: text("opportunity_id"),
  class: text("class").notNull(),
  subjectMatter: text("subject_matter"),
  exposureAttributes: jsonb("exposure_attributes"),
  locations: jsonb("locations"),
  valuationKes: numeric("valuation_kes", { mode: "number", precision: 14, scale: 2 }),
  claimsExperience: jsonb("claims_experience"),
  flags: jsonb("flags"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// SOP-23: sanctions/PEP screening and conflict-of-interest clearance
// for a risk, gating whether a client's recommendation decision can
// be accepted (see PATCH /api/recommendations/:id). 'override' is a
// documented decision to proceed despite a screening hit, not a
// silent bypass.
export const riskClearances = sales.table("risk_clearances", {
  id: text("id").primaryKey(),
  riskId: text("risk_id").notNull(),
  sanctionsScreeningResult: text("sanctions_screening_result").notNull().default("pending"),
  pepStatus: boolean("pep_status").notNull().default(false),
  conflictOfInterestChecked: boolean("conflict_of_interest_checked").notNull().default(false),
  conflictOfInterestNotes: text("conflict_of_interest_notes"),
  clearedBy: text("cleared_by"),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// SOP-07: the approved placement approach for a risk, captured before
// the market submission (below) goes out — not reconstructed after
// the fact. singleSourceJustification is required whenever the
// submission that follows names only one market.
export const marketStrategies = sales.table("market_strategies", {
  id: text("id").primaryKey(),
  riskId: text("risk_id").notNull(),
  strategyType: text("strategy_type").notNull(),
  rationale: text("rationale").notNull(),
  singleSourceJustification: text("single_source_justification"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Submission (SOP §8/§9) — Draft → Approved → Sent → Acknowledged →
// Clarification → Quote/Decline → Comparison Ready → Closed. One risk
// can carry several submission versions (e.g. a re-market at renewal).
export const submissions = sales.table("submissions", {
  id: text("id").primaryKey(),
  riskId: text("risk_id").notNull(),
  version: integer("version").notNull().default(1),
  markets: jsonb("markets"), // insurer ids submitted to
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  questions: jsonb("questions"),
  status: text("status").notNull().default("Draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// An insurer's mid-submission information request, tracked as its own
// record: question -> broker reviews -> client info required -> client
// responds -> broker validates -> response sent -> underwriter decision.
export const underwritingQueries = sales.table("underwriting_queries", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  question: text("question").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  requiredResponseDate: date("required_response_date"),
  responsibleStaffId: text("responsible_staff_id"),
  clientInfoRequired: text("client_info_required"),
  response: text("response"),
  responseDocumentId: text("response_document_id"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Internal sign-off chain for risks outside normal appetite — one row
// per stage, decided in order. Advisory/governance record; it does not
// itself block presenting or accepting a recommendation.
export const underwritingApprovals = sales.table("underwriting_approvals", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  riskId: text("risk_id").notNull(),
  reason: text("reason").notNull(),
  stage: text("stage").notNull(),
  decision: text("decision").notNull().default("pending"),
  approverId: text("approver_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  comments: text("comments"),
  conditions: text("conditions"),
  requestedBy: text("requested_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Quotation (SOP §8) — one insurer's priced response to a submission.
// PCF/ITL/stamp duty/commission are computed from the insurer's active
// product.insurer_rate_versions setting for the risk's class, the same
// settings the Insurer panel manages.
export const quotations = sales.table("quotations", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id"),
  clientId: text("client_id"),
  status: text("status").notNull().default("draft"),
  category: text("category").notNull(),
  insurerId: text("insurer_id"),
  insurerName: text("insurer_name"),
  rateVersionRef: text("rate_version_ref"),
  sumInsuredKes: numeric("sum_insured_kes", { mode: "number", precision: 14, scale: 2 }),
  basePremiumKes: numeric("base_premium_kes", { mode: "number", precision: 14, scale: 2 }),
  pcfLevyKes: numeric("pcf_levy_kes", { mode: "number", precision: 12, scale: 2 }),
  itlLevyKes: numeric("itl_levy_kes", { mode: "number", precision: 12, scale: 2 }),
  stampDutyKes: numeric("stamp_duty_kes", { mode: "number", precision: 12, scale: 2 }),
  totalPremiumKes: numeric("total_premium_kes", { mode: "number", precision: 14, scale: 2 }),
  commissionRatePct: numeric("commission_rate_pct", { mode: "number", precision: 5, scale: 2 }),
  limits: jsonb("limits"),
  deductibles: jsonb("deductibles"),
  exclusions: jsonb("exclusions"),
  warranties: jsonb("warranties"),
  extensions: jsonb("extensions"),
  conditions: text("conditions"),
  paymentTerms: text("payment_terms"),
  specialTerms: text("special_terms"),
  validUntil: date("valid_until"),
  assignedStaffId: text("assigned_staff_id"),
  quoteTimestamp: timestamp("quote_timestamp", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Recommendation (SOP §8) — the suitability record: compared options,
// reasons, disclosures, and the client's actual decision. This is what
// makes "client instruction" defensible later, not just a quote log.
export const recommendations = sales.table("recommendations", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  comparedQuotationIds: jsonb("compared_quotation_ids").notNull(),
  recommendedQuotationId: text("recommended_quotation_id"),
  reasons: text("reasons"),
  disclosures: text("disclosures"),
  limitations: text("limitations"),
  presentedBy: text("presented_by"),
  presentedAt: timestamp("presented_at", { withTimezone: true }),
  clientDecision: text("client_decision").notNull().default("pending"),
  deviationNotes: text("deviation_notes"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// System correspondence template — the wording behind a notification,
// versioned per code+channel. Editing bumps the version so an old
// notification's rendered copy stays traceable to what it was sent
// with, not silently rewritten by a later template edit.
export const correspondenceTemplates = comms.table("correspondence_templates", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  area: text("area"),
  channel: text("channel").notNull(),
  subject: text("subject"),
  bodyTemplate: text("body_template").notNull(),
  version: integer("version").notNull().default(1),
  effectiveFrom: date("effective_from").notNull(),
  active: boolean("active").notNull().default(true),
});

// A queued/sent system notification — distinct from crm.interactions
// (a manually logged call/email/visit): this is the platform's own
// templated message. No real email/SMS/WhatsApp gateway is wired up
// in this dev build (see README) — "sent" here means the operator
// marked it dispatched, not that a provider actually delivered it.
export const notifications = comms.table("notifications", {
  id: text("id").primaryKey(),
  partyId: text("party_id"),
  staffId: text("staff_id"),
  channel: text("channel").notNull(),
  templateCode: text("template_code"),
  payload: jsonb("payload"),
  status: text("status").notNull().default("queued"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// HR: employee profile is a 1:1 extension of access.staff (the login
// identity) — job title, department, employment lifecycle — not a
// replacement for it. See migrate-018-hr.ts.
export const employees = hr.table("employees", {
  staffId: text("staff_id").primaryKey(),
  jobTitle: text("job_title"),
  department: text("department"),
  branch: text("branch"),
  employmentType: text("employment_type").notNull().default("full_time"),
  employmentStatus: text("employment_status").notNull().default("active"),
  hireDate: date("hire_date"),
  terminationDate: date("termination_date"),
  terminationReason: text("termination_reason"),
  nationalId: text("national_id"),
  kraPin: text("kra_pin"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  baseSalaryKes: numeric("base_salary_kes", { mode: "number", precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaveTypes = hr.table("leave_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  defaultDaysPerYear: numeric("default_days_per_year", { mode: "number", precision: 5, scale: 1 }).notNull().default(0),
  paid: boolean("paid").notNull().default(true),
});

export const leaveBalances = hr.table("leave_balances", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  leaveTypeId: text("leave_type_id").notNull(),
  year: integer("year").notNull(),
  allocatedDays: numeric("allocated_days", { mode: "number", precision: 5, scale: 1 }).notNull().default(0),
  usedDays: numeric("used_days", { mode: "number", precision: 5, scale: 1 }).notNull().default(0),
  carriedOverDays: numeric("carried_over_days", { mode: "number", precision: 5, scale: 1 }).notNull().default(0),
});

export const leaveRequests = hr.table("leave_requests", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  leaveTypeId: text("leave_type_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  daysRequested: numeric("days_requested", { mode: "number", precision: 5, scale: 1 }).notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("requested"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNotes: text("decision_notes"),
});

export const performanceReviews = hr.table("performance_reviews", {
  id: text("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  reviewerId: text("reviewer_id"),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  rating: text("rating"),
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  goals: text("goals"),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Premium pricing tables the public quote engine reads — what a customer pays,
// as opposed to insurerRateVersions above (commission the brokerage earns).
// Each change is a new version; the previous one is kept, marked inactive.
export const premiumRateVersions = product.table("premium_rate_versions", {
  id: text("id").primaryKey(),
  insurerId: text("insurer_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  category: text("category").notNull().default("all"),
  status: text("status").$type<"active" | "inactive">().notNull(),
  rates: jsonb("rates").$type<Record<string, any>>().notNull(),
  updatedByStaffId: text("updated_by_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Staff-uploaded insurer logos, kept in the database rather than on disk.
export const insurerLogos = product.table("insurer_logos", {
  insurerKey: text("insurer_key").primaryKey(),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploadedByStaffId: text("uploaded_by_staff_id"),
});

// What the public website captures.
export const customerQuotes = siteSchema.table("customer_quotes", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  category: text("category"),
  insurerId: text("insurer_id"),
  totalPremiumKes: numeric("total_premium_kes", { mode: "number", precision: 14, scale: 2 }),
  assignedStaffId: text("assigned_staff_id"),
  payload: jsonb("payload").$type<Record<string, any>>().notNull(),
});

export const coverNotes = siteSchema.table("cover_notes", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull(),
  category: text("category"),
  insurerId: text("insurer_id"),
  insurerName: text("insurer_name"),
  totalPremiumKes: numeric("total_premium_kes", { mode: "number", precision: 14, scale: 2 }),
  paymentMethod: text("payment_method").notNull().default("full"),
  financeMonths: integer("finance_months"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email"),
});

export const otherLineRequests = siteSchema.table("other_line_requests", {
  id: text("id").primaryKey(),
  referenceNumber: text("reference_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  category: text("category").notNull(),
  subType: text("sub_type").notNull(),
  status: text("status").notNull().default("pending_underwriter_review"),
  eligibleUnderwriters: jsonb("eligible_underwriters").$type<string[]>().notNull().default([]),
  answers: jsonb("answers").$type<Record<string, any>>().notNull(),
});

export const roomScans = siteSchema.table("room_scans", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload").$type<Record<string, any>>().notNull(),
});

export const otpCodes = siteSchema.table("otp_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
});
