-- =====================================================================
-- Utmost Insurance Brokers — Broker Operations Platform Schema
-- PostgreSQL 15+
--
-- This service is the single system of record — an insurance
-- brokerage ERP: CRM, policy admin,
-- claims, finance, compliance, documents, communications and the
-- workflow/task engine. The public quote-generator app (studio) owns
-- no tables here — it calls this service's API for anything beyond
-- generating a quote number.
--
-- Aligned to Insurance_Brokerage_SOP_and_System_Build_Guide.docx
-- (Kenya, v1.0, July 2026), sections 7 (Functional System Architecture),
-- 8 (Core Data Model), 9 (Workflow States and Task Engine) and
-- 10 (Controls, Approvals and Audit Trail). Entity and state names
-- below intentionally match that document's terminology.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS access;      -- users, roles, permissions
CREATE SCHEMA IF NOT EXISTS crm;         -- parties, relationships, opportunities, interactions
CREATE SCHEMA IF NOT EXISTS product;     -- insurers, rate versions, products
CREATE SCHEMA IF NOT EXISTS sales;       -- quotations, submissions, recommendations
CREATE SCHEMA IF NOT EXISTS policy;      -- policies, endorsements, renewals
CREATE SCHEMA IF NOT EXISTS claims;      -- claims, timeline, complaints
CREATE SCHEMA IF NOT EXISTS finance;     -- payments, commission, financial transactions
CREATE SCHEMA IF NOT EXISTS compliance;  -- KYC, obligations register, audit, regulatory returns
CREATE SCHEMA IF NOT EXISTS docs;        -- document metadata
CREATE SCHEMA IF NOT EXISTS comms;       -- notifications, templates
CREATE SCHEMA IF NOT EXISTS workflow;    -- generic case/task engine (SOP §9)
CREATE SCHEMA IF NOT EXISTS ai;          -- room analyzer, model runs
CREATE SCHEMA IF NOT EXISTS analytics;   -- materialized views / marts

-- =====================================================================
-- ACCESS: staff, roles, permissions
-- =====================================================================

CREATE TABLE access.roles (
  id              TEXT PRIMARY KEY,           -- 'underwriter','supervisor','accountant','claims_officer','admin','sales_agent'
  name            TEXT NOT NULL,
  description     TEXT
);

CREATE TABLE access.staff (
  id                  TEXT PRIMARY KEY,        -- e.g. 'staff-1'
  full_name           TEXT NOT NULL,
  email               TEXT UNIQUE,
  phone_number        TEXT,
  role_id             TEXT REFERENCES access.roles(id),
  supervisor_id       TEXT REFERENCES access.staff(id),
  approval_limit_kes  NUMERIC(14,2),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash       TEXT,
  mfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE access.permissions (
  id    TEXT PRIMARY KEY,                      -- e.g. 'policy.issue','claim.approve_reserve'
  description TEXT
);

CREATE TABLE access.role_permissions (
  role_id       TEXT REFERENCES access.roles(id) ON DELETE CASCADE,
  permission_id TEXT REFERENCES access.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- =====================================================================
-- CRM: party master, relationships, opportunities, activity (SOP §8)
-- =====================================================================

-- "Party" — SOP §8: type, legal name, identifiers, tax, contacts,
-- addresses, status and risk rating. One record per natural/legal
-- person the brokerage deals with (client, director, beneficial
-- owner, producer, referrer — see crm.relationships for the graph).
CREATE TABLE crm.parties (
  id                  TEXT PRIMARY KEY,        -- e.g. 'client-1'
  party_type          TEXT NOT NULL CHECK (party_type IN ('individual','corporate')),
  full_name           TEXT NOT NULL,
  email               TEXT,
  phone_number        TEXT,
  national_id         TEXT,
  kra_pin             TEXT,
  company_reg_no      TEXT,
  county              TEXT,
  physical_address    TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','dormant','offboarded')),
  risk_rating         TEXT CHECK (risk_rating IN ('low','medium','high')),
  lead_source         TEXT,
  consent_given       BOOLEAN NOT NULL DEFAULT FALSE,
  consent_timestamp   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Client account" — SOP §8: segment, owner, branch, service tier,
-- KYC status, preferences and relationship plan. Distinct from Party:
-- a corporate party may have several linked individual parties
-- (directors, authorized signatories) but one client account.
CREATE TABLE crm.client_accounts (
  id                  TEXT PRIMARY KEY,
  party_id            TEXT NOT NULL REFERENCES crm.parties(id),
  segment             TEXT CHECK (segment IN ('retail','sme','corporate','affinity','group')),
  branch              TEXT,
  service_tier        TEXT,
  owner_staff_id      TEXT REFERENCES access.staff(id),
  kyc_status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (kyc_status IN ('pending','verification','compliance_review','approved','restricted','rejected','review_due')),
  preferences         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding KYC document checklist — auto-seeded per party_type at
-- party creation (individual: national ID/passport + KRA PIN;
-- corporate: certificate of incorporation, KRA PIN, CR12, directors'
-- IDs, tax compliance certificate), plus any ad-hoc item a broker adds
-- for a specific client. Gates client_accounts.kyc_status from
-- reaching 'approved' until every item here is verified or waived —
-- same "companion checklist + status-transition guard" pattern as
-- policy.policy_checks and claims.coverage_verification_items.
CREATE TABLE crm.kyc_checklist_items (
  id             TEXT PRIMARY KEY,
  party_id       TEXT NOT NULL REFERENCES crm.parties(id),
  document_type  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','verified','waived')),
  document_id    TEXT,                              -- FK to docs.documents, added below
  notes          TEXT,
  verified_by    TEXT REFERENCES access.staff(id),
  verified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Relationship" — SOP §8: beneficial owner, director, dependant,
-- authorized person, producer, referrer, insurer or provider
-- relationship. One row per edge in the party graph.
CREATE TABLE crm.relationships (
  id                  TEXT PRIMARY KEY,
  party_id            TEXT NOT NULL REFERENCES crm.parties(id) ON DELETE CASCADE,
  related_party_id    TEXT REFERENCES crm.parties(id),
  relationship_type   TEXT NOT NULL CHECK (relationship_type IN
                        ('beneficial_owner','director','dependant','authorized_person','producer','referrer','insurer_contact','provider_contact')),
  ownership_pct       NUMERIC(5,2),
  pep_status          BOOLEAN NOT NULL DEFAULT FALSE,
  designation         TEXT,
  id_document_id      TEXT,                     -- FK to docs.documents, added below
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Opportunity" — SOP §8 + §9: source, class, renewal date, expected
-- premium/commission, stage, owner and outcome. State machine matches
-- SOP §9 exactly: New → Contacted → Qualified → Discovery →
-- Data Collection → Marketed → Quoted → Presented → Decision →
-- Won / Lost / Deferred.
CREATE TABLE crm.opportunities (
  id                  TEXT PRIMARY KEY,
  party_id            TEXT REFERENCES crm.parties(id),
  producer_id         TEXT,                    -- FK to sales.producers, added below (sales section comes after crm)
  source              TEXT,
  class                TEXT,                     -- insurance class/product line
  renewal_date         DATE,
  expected_premium_kes NUMERIC(14,2),
  expected_commission_kes NUMERIC(14,2),
  stage               TEXT NOT NULL DEFAULT 'New' CHECK (stage IN
                        ('New','Contacted','Qualified','Discovery','Data Collection',
                         'Marketed','Quoted','Presented','Decision','Won','Lost','Deferred')),
  owner_staff_id      TEXT REFERENCES access.staff(id),
  outcome_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE crm.interactions (
  id            TEXT PRIMARY KEY,
  party_id      TEXT REFERENCES crm.parties(id),
  staff_id      TEXT REFERENCES access.staff(id),
  channel       TEXT NOT NULL CHECK (channel IN ('call','email','sms','whatsapp','visit','portal','other')),
  direction     TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject       TEXT,
  notes         TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- PRODUCT: insurer panel, rate versions, product catalogue
-- =====================================================================

-- Insurer KYC/governance fields (SOP-02: "Use only approved, licensed
-- and suitable insurers" — licence, agreements, annual review).
-- insurer_type / authorized_classes mirror the IRA's own published
-- register (The Insurance Act, Cap 487, s.184): a general insurer is
-- licensed for classes 01-14, a long-term (life) insurer for 31-37,
-- and a micro insurer for 13 only — a broker cannot lawfully submit a
-- motor risk to a life-only insurer, so this is an enforceable list,
-- not a label.
CREATE TABLE product.insurers (
  id                    TEXT PRIMARY KEY,             -- e.g. 'icea-general','jubilee-life'
  name                  TEXT NOT NULL,
  insurer_type          TEXT NOT NULL DEFAULT 'general' CHECK (insurer_type IN ('general','life','micro','reinsurer')),
  authorized_classes    JSONB NOT NULL DEFAULT '[]',   -- e.g. ["01","02","07"] — IRA class codes
  rating                TEXT,
  panel_status          TEXT NOT NULL DEFAULT 'approved' CHECK (panel_status IN ('approved','under_review','suspended')),
  license_number        TEXT,
  license_expiry_date   DATE,
  aibk_member           BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_status            TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','verified','expired','rejected')),
  contact_email         TEXT,
  contact_phone         TEXT,
  api_endpoint          TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per insurer+class commission terms — a negotiated business rate,
-- genuinely specific to each insurer. rate_table carries the full
-- rating engine payload when there is one; defaults to '{}' for a
-- settings record that's just commission configuration.
--
-- Deliberately does NOT carry PCF, Insurance Training Levy or stamp
-- duty — those are statutory, government-mandated and identical
-- across every insurer in the market (see product.statutory_levies
-- below). An earlier version of this schema conflated the two, which
-- would have let two different insurers end up with two different PCF
-- rates on paper — a modeling error, not a business reality.
CREATE TABLE product.insurer_rate_versions (
  id                  TEXT PRIMARY KEY,          -- e.g. 'rate-ver-jubilee-initial'
  insurer_id          TEXT NOT NULL REFERENCES product.insurers(id),
  category            TEXT NOT NULL,             -- 'motor','medical','other_line:<x>'
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  is_provisional      BOOLEAN NOT NULL DEFAULT FALSE,
  loading_factor      NUMERIC(6,4),
  commission_rate_pct NUMERIC(5,2),
  rate_table          JSONB NOT NULL DEFAULT '{}',
  created_by          TEXT REFERENCES access.staff(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Statutory levies and taxes — set by law/regulation (Insurance Act,
-- PCF regulations, Stamp Duty Act), not negotiated per insurer. One
-- rate applies market-wide for a given class and effective period,
-- regardless of which insurer underwrites the policy. category NULL
-- means "applies to all general classes."
CREATE TABLE product.statutory_levies (
  id                  TEXT PRIMARY KEY,          -- e.g. 'levy-pcf-2026'
  levy_type           TEXT NOT NULL CHECK (levy_type IN ('pcf', 'itl', 'stamp_duty')),
  category            TEXT,                       -- IRA class code, or NULL for "all classes"
  calculation_method  TEXT NOT NULL CHECK (calculation_method IN ('percentage', 'flat')),
  rate_pct            NUMERIC(6,4),                -- used when calculation_method = 'percentage'
  flat_amount_kes     NUMERIC(10,2),               -- used when calculation_method = 'flat'
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  source              TEXT,                        -- e.g. 'IRA Circular ...', 'Insurance Act Cap 487'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Maximum permitted commission rate per line of business, per the
-- market's own Commission Guide — a ceiling on what insurer_rate_versions
-- .commission_rate_pct may be negotiated up to for a given class, not a
-- rate itself. class_code maps the guide's product name onto the IRA
-- class taxonomy (src/data/insuranceClasses.ts); NULL where a product
-- (e.g. a combined/cross-border cover) doesn't map to a single class.
CREATE TABLE product.commission_guide (
  id                            TEXT PRIMARY KEY,     -- e.g. 'cg-motor-private'
  category                      TEXT NOT NULL,         -- guide's own grouping, e.g. 'MOTOR'
  policy_name                   TEXT NOT NULL,         -- e.g. 'Motor Private'
  class_code                    TEXT,                  -- IRA class code, or NULL if unmapped
  max_permitted_commission_pct  NUMERIC(5,2) NOT NULL,
  source                        TEXT,                  -- e.g. 'Commission Guide Insurance'
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOP-07 Market Strategy and Insurer Selection — business risk
-- appetite, distinct from the licence-based authorized_classes check
-- on product.insurers: a general insurer may be licensed for Motor but
-- the brokerage may still not want to place there (poor claims
-- service, capacity concerns). 'excluded' insurers can't be selected
-- as a market at all; 'restricted' ones can, with a warning.
CREATE TABLE product.insurer_appetite (
  id                  TEXT PRIMARY KEY,
  insurer_id          TEXT NOT NULL REFERENCES product.insurers(id),
  class_code          TEXT NOT NULL,
  appetite_level      TEXT NOT NULL DEFAULT 'accepted' CHECK (appetite_level IN ('preferred','accepted','restricted','excluded')),
  max_capacity_kes    NUMERIC(14,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product.products (
  id                  TEXT PRIMARY KEY,
  insurer_id          TEXT NOT NULL REFERENCES product.insurers(id),
  category            TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  wording_document_id TEXT,                       -- FK to docs.documents, added below
  active              BOOLEAN NOT NULL DEFAULT TRUE
);

-- =====================================================================
-- SALES: risk data, market submission, quotation, recommendation
-- (SOP §8: Risk, Submission, Quotation, Recommendation are distinct
-- entities — a submission can carry several insurer quotations, which
-- are compared into one recommendation the client decides on.)
-- =====================================================================

-- Agency/sub-broker management (blueprint §2 "Agency, Producer &
-- Sub-Broker Management"): an external party who introduces business,
-- earning a negotiated split of the commission the brokerage earns on
-- policies traced back to them via opportunities.producer_id /
-- policies.producer_id below. Deliberately no separate contracts or
-- targets tables — contract essentials (licence, split rate, dates)
-- live on the producer row itself, and "target vs actual" is a
-- derived read against policies.premium_amount, not a stored figure.
CREATE TABLE sales.producers (
  id                    TEXT PRIMARY KEY,
  producer_type         TEXT NOT NULL CHECK (producer_type IN ('agent','sub_broker')),
  name                  TEXT NOT NULL,
  contact_person        TEXT,
  phone_number          TEXT,
  email                 TEXT,
  kra_pin               TEXT,
  licence_number        TEXT,                -- IRA agent/broker licence number
  commission_split_pct  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (commission_split_pct >= 0 AND commission_split_pct <= 100),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  contract_start_date   DATE,
  contract_end_date     DATE,
  target_premium_kes    NUMERIC(14,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales.risks (
  id                  TEXT PRIMARY KEY,
  party_id            TEXT REFERENCES crm.parties(id),
  opportunity_id      TEXT REFERENCES crm.opportunities(id),
  class               TEXT NOT NULL,
  subject_matter       TEXT,
  exposure_attributes  JSONB,
  locations             JSONB,
  valuation_kes         NUMERIC(14,2),
  claims_experience     JSONB,
  flags                 JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOP-23 AML/CFT/CPF, Fraud and Unusual Activity Escalation —
-- sanctions/PEP screening and conflict-of-interest clearance for a
-- risk, gating the moment a client's decision can actually be
-- accepted (see PATCH /api/recommendations/:id): "identify and manage
-- financial-crime, identity, claims and payment risks" at High-risk
-- onboarding is a trigger this system didn't check at all before this
-- table existed — the KYC status on crm.client_accounts covers
-- onboarding, not the placement-specific sanctions/PEP/conflict check
-- this represents. 'override' exists for a documented decision to
-- proceed despite a screening hit (e.g. a false positive, resolved
-- and recorded) — never a silent bypass.
CREATE TABLE sales.risk_clearances (
  id                              TEXT PRIMARY KEY,
  risk_id                         TEXT NOT NULL REFERENCES sales.risks(id),
  sanctions_screening_result      TEXT NOT NULL DEFAULT 'pending' CHECK (sanctions_screening_result IN ('pending','clear','hit','override')),
  pep_status                      BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_of_interest_checked    BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_of_interest_notes      TEXT,
  cleared_by                      TEXT REFERENCES access.staff(id),
  cleared_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOP-07 Market Strategy and Insurer Selection — the approved
-- placement approach for a risk, captured before the market
-- submission goes out (SOP-08), not reconstructed after the fact.
-- single_source_justification is required (enforced in POST
-- /api/submissions) whenever the submission that follows names only
-- one market — "single-market placement requires justification."
CREATE TABLE sales.market_strategies (
  id                            TEXT PRIMARY KEY,
  risk_id                       TEXT NOT NULL REFERENCES sales.risks(id),
  strategy_type                 TEXT NOT NULL CHECK (strategy_type IN ('incumbent_renewal','remarketing','specialist_facility','co_insurance','layering')),
  rationale                     TEXT NOT NULL,
  single_source_justification   TEXT,
  approved_by                   TEXT REFERENCES access.staff(id),
  approved_at                   TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales.submissions (
  id                  TEXT PRIMARY KEY,
  risk_id             TEXT NOT NULL REFERENCES sales.risks(id),
  version             INT NOT NULL DEFAULT 1,
  markets             JSONB,                       -- insurer ids submitted to
  dispatched_at       TIMESTAMPTZ,
  deadline_at         TIMESTAMPTZ,
  questions           JSONB,
  status              TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN
                        ('Draft','Approved','Sent','Acknowledged','Clarification','Quote','Decline','Comparison Ready','Closed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales.quotations (
  id                          TEXT PRIMARY KEY,    -- e.g. 'quote-pers-...'
  submission_id                TEXT REFERENCES sales.submissions(id),
  client_id                    TEXT REFERENCES crm.parties(id),
  status                       TEXT NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','submitted','accepted','declined','expired')),
  category                     TEXT NOT NULL,
  insurer_id                   TEXT REFERENCES product.insurers(id),
  insurer_name                 TEXT,
  rate_version_ref              TEXT REFERENCES product.insurer_rate_versions(id),
  sum_insured_kes               NUMERIC(14,2),
  base_premium_kes              NUMERIC(14,2),
  pcf_levy_kes                  NUMERIC(12,2),
  itl_levy_kes                  NUMERIC(12,2),
  stamp_duty_kes                 NUMERIC(12,2),
  total_premium_kes              NUMERIC(14,2),
  commission_rate_pct            NUMERIC(5,2),
  limits                          JSONB,
  deductibles                     JSONB,
  exclusions                      JSONB,
  warranties                      JSONB,
  extensions                      JSONB,
  conditions                      TEXT,
  payment_terms                   TEXT,
  special_terms                   TEXT,
  valid_until                     DATE,
  vehicle_use                     TEXT,
  vehicle_type                    TEXT,
  is_provisional_rate             BOOLEAN NOT NULL DEFAULT FALSE,
  provisional_loading_factor      NUMERIC(6,4),
  rider_breakdown                 JSONB,
  assigned_staff_id               TEXT REFERENCES access.staff(id),
  quote_timestamp                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales.quotation_assignment_history (
  id            BIGSERIAL PRIMARY KEY,
  quotation_id  TEXT NOT NULL REFERENCES sales.quotations(id) ON DELETE CASCADE,
  staff_id      TEXT REFERENCES access.staff(id),
  assigned_by   TEXT,                              -- 'system' or staff id
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason        TEXT
);

-- "Recommendation" — SOP §8: compared options, score, reasons,
-- disclosures, limitations and client decision. This is the suitability
-- record: why the client was advised to pick a given quotation.
CREATE TABLE sales.recommendations (
  id                  TEXT PRIMARY KEY,
  submission_id       TEXT NOT NULL REFERENCES sales.submissions(id),
  compared_quotation_ids JSONB NOT NULL,           -- array of sales.quotations.id
  recommended_quotation_id TEXT REFERENCES sales.quotations(id),
  reasons              TEXT,
  disclosures           TEXT,
  limitations            TEXT,
  presented_by            TEXT REFERENCES access.staff(id),
  presented_at             TIMESTAMPTZ,
  client_decision           TEXT CHECK (client_decision IN ('accepted','deviated','declined','pending')),
  deviation_notes            TEXT,
  decided_at                  TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOP-06/underwriting: an insurer's mid-submission information
-- request, tracked as its own record so it can't get lost in an email
-- chain — "underwriter question -> broker reviews -> client info
-- required -> client responds -> broker validates -> response sent ->
-- underwriter decision."
CREATE TABLE sales.underwriting_queries (
  id                       TEXT PRIMARY KEY,         -- e.g. 'uq-...'
  submission_id            TEXT NOT NULL REFERENCES sales.submissions(id),
  question                 TEXT NOT NULL,
  received_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  required_response_date   DATE,
  responsible_staff_id     TEXT REFERENCES access.staff(id),
  client_info_required     TEXT,
  response                 TEXT,
  response_document_id     TEXT,                      -- FK to docs.documents, added below
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','awaiting_client','responded','closed')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal sign-off chain for risks outside normal appetite (high
-- value, high-risk industry, large discount, unusual terms, high
-- commission, adverse claims history) — one row per stage, decided in
-- order (team_leader before senior_manager before final). An advisory/
-- governance record: it does not itself block presenting or accepting
-- a recommendation (unlike the SOP-23 risk-clearance gate), since
-- which risks need this is a judgment call, not a fixed rule.
CREATE TABLE sales.underwriting_approvals (
  id             TEXT PRIMARY KEY,                   -- e.g. 'appr-...'
  batch_id       TEXT NOT NULL,                       -- groups the 3 stage rows from one "request approval" action
  risk_id        TEXT NOT NULL REFERENCES sales.risks(id),
  reason         TEXT NOT NULL,                       -- why approval was sought
  stage          TEXT NOT NULL CHECK (stage IN ('team_leader','senior_manager','final')),
  decision       TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected')),
  approver_id    TEXT REFERENCES access.staff(id),
  decided_at     TIMESTAMPTZ,
  comments       TEXT,
  conditions     TEXT,                                -- conditions attached to the approval, if any
  requested_by   TEXT REFERENCES access.staff(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales.other_line_quote_requests (
  id                  TEXT PRIMARY KEY,             -- e.g. 'oline-...'
  reference_number    TEXT UNIQUE,                  -- e.g. 'OL-FIR-...'
  category             TEXT NOT NULL,
  client_id            TEXT REFERENCES crm.parties(id),
  form_data             JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'received',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- POLICY: cover activation, policy register, endorsements, renewals
-- =====================================================================

-- Active-policy status must never be reachable without placement +
-- premium evidence (SOP §1.1 core design principle / §15.1 go-live
-- criterion) — enforced at the application layer via the workflow
-- engine (a policy's case must pass through "Awaiting Premium" /
-- "Awaiting Cover" before "Active"), not by a DB trigger alone.
CREATE TABLE policy.policies (
  id                  TEXT PRIMARY KEY,             -- e.g. 'UTM-POL-9824'
  quotation_id         TEXT REFERENCES sales.quotations(id),
  client_id             TEXT REFERENCES crm.parties(id),
  insurer_id             TEXT REFERENCES product.insurers(id),
  producer_id             TEXT REFERENCES sales.producers(id), -- who introduced this business, if any
  category                TEXT NOT NULL,
  premium_amount            NUMERIC(14,2) NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'Pending'
                                CHECK (status IN ('Pending','Received','Under Check','Discrepancy','Corrected','Delivered','Active','Expired','Cancelled','Lapsed')),
  start_date                  DATE NOT NULL,
  end_date                     DATE NOT NULL,
  policy_document_id            TEXT,                -- FK to docs.documents, added below
  delivered_at                   TIMESTAMPTZ,          -- SOP-11: secure delivery evidence
  delivery_method                 TEXT,                -- 'email','portal','courier','hand'
  client_acknowledged_at           TIMESTAMPTZ,
  premium_due_date                 DATE,                -- when premium is due; ageing is computed against this, not start_date
  sum_insured_kes                  NUMERIC(14,2),       -- the policy's own current sum insured — starts from the winning quotation but can drift via endorsements after bind, so it's tracked here rather than only on sales.quotations
  deductible_kes                   NUMERIC(14,2),
  valuation_method                 TEXT CHECK (valuation_method IN ('actual_cash_value','replacement_cost','agreed_value')),
  agreed_value_kes                 NUMERIC(14,2),       -- only meaningful when valuation_method = 'agreed_value'
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOP-11 Policy Issuance, Checking and Delivery — a fixed checklist of
-- what must be compared against the placement instruction before a
-- policy can be marked Delivered (schedule/wording/clauses, names and
-- interests, limits/deductibles/exclusions, premium, sum insured,
-- dates). One row per item per policy; server rejects a 'Delivered'
-- status update unless every item here is 'pass' and every row in
-- policy.discrepancies below is resolved — "cannot mark fully issued
-- before check and critical discrepancy resolution."
CREATE TABLE policy.policy_checks (
  id            TEXT PRIMARY KEY,
  policy_id     TEXT NOT NULL REFERENCES policy.policies(id),
  check_item    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','fail')),
  notes         TEXT,
  checked_by    TEXT REFERENCES access.staff(id),
  checked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A discrepancy found during policy checking — independent of which
-- checklist item (if any) surfaced it, since some are found by
-- inspection rather than a specific check. 'waived' exists for a
-- documented decision to proceed despite a minor discrepancy; it is
-- not the same as silently ignoring one.
CREATE TABLE policy.discrepancies (
  id                TEXT PRIMARY KEY,
  policy_id         TEXT NOT NULL REFERENCES policy.policies(id),
  policy_check_id   TEXT REFERENCES policy.policy_checks(id),
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','corrected','waived')),
  raised_by         TEXT REFERENCES access.staff(id),
  resolved_by       TEXT REFERENCES access.staff(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Endorsement taxonomy — five categories matching how mid-term policy
-- changes are actually grouped (financial/valuation, coverage added,
-- coverage removed, contractual/legal, administrative), each with its
-- own fixed set of types. before_value/after_value capture whatever
-- structured data that specific type needs (e.g. {sumInsuredKes: ...}
-- for adjust_sum_insured, {correctedName: ...} for correct_legal_name)
-- — the shape isn't itself constrained since it varies by type, but
-- reaching status 'Completed' is what actually applies the effect to
-- policy.policies (or crm.parties for the two name/address types), not
-- just recording history. See applyEndorsementEffect in server.ts.
CREATE TABLE policy.endorsements (
  id                      TEXT PRIMARY KEY,           -- e.g. 'UTM-END-1234'
  policy_id               TEXT NOT NULL REFERENCES policy.policies(id),
  endorsement_category    TEXT NOT NULL CHECK (endorsement_category IN
                            ('financial_valuation','coverage_expansion','coverage_restriction','contractual_legal','administrative')),
  endorsement_type        TEXT NOT NULL CHECK (endorsement_type IN (
                            'adjust_sum_insured','alter_deductible','switch_valuation_method','lock_agreed_value','modify_premium_rate','apply_premium_credit',
                            'schedule_new_asset','include_excluded_peril','extend_geographic_boundary','add_insured_party','increase_sub_limit','attach_rider',
                            'delete_removed_asset','exclude_peril','remove_insured_party','decrease_sub_limit',
                            'amend_policy_language','extend_policy_lifespan','cancel_policy_midterm','reinstate_lapsed_coverage',
                            'correct_legal_name','update_physical_address','modify_payment_schedule'
                          )),
  description             TEXT,
  before_value             JSONB,
  after_value               JSONB,
  premium_adjustment_kes  NUMERIC(14,2) DEFAULT 0,
  requested_date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date          DATE,
  status                  TEXT NOT NULL DEFAULT 'Requested'
                            CHECK (status IN ('Requested','Information','Terms','Client Approval','Instructed','Issued','Checked','Completed','Declined')),
  applied_at               TIMESTAMPTZ,                 -- when the effect was actually applied to the policy/party — distinct from completed status in case that ever needs to happen retroactively
  requested_by            TEXT REFERENCES access.staff(id),
  approved_by              TEXT REFERENCES access.staff(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE policy.premium_adjustments (
  id            TEXT PRIMARY KEY,
  policy_id     TEXT NOT NULL REFERENCES policy.policies(id),
  reason        TEXT,
  amount_kes    NUMERIC(14,2) NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Premium confirmation" — SOP §8: insurer channel, reference, amount,
-- date, evidence, matched policy and verifier. This is the evidence
-- gate that unlocks Active status; premiums move through approved
-- insurer channels, never broker custody (SOP §1.1).
CREATE TABLE policy.premium_confirmations (
  id                   TEXT PRIMARY KEY,               -- e.g. 'pcf-...'
  policy_id            TEXT NOT NULL REFERENCES policy.policies(id),
  insurer_channel       TEXT,
  confirmed_amount_kes  NUMERIC(14,2) NOT NULL,
  payment_reference      TEXT,
  payment_id              TEXT,                          -- FK to finance.payments, added below — set when this confirmation is one allocation of a larger client payment (e.g. a single cheque split across several policies)
  evidence_document_id    TEXT,                          -- FK to docs.documents, added below
  verified_by               TEXT REFERENCES access.staff(id),
  confirmed_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE policy.renewals (
  id                  TEXT PRIMARY KEY,
  policy_id           TEXT NOT NULL REFERENCES policy.policies(id),
  renewal_status      TEXT NOT NULL DEFAULT 'upcoming'
                        CHECK (renewal_status IN ('upcoming','quoted','confirmed','lapsed')),
  due_date            DATE NOT NULL,
  case_opened_at      TIMESTAMPTZ,                       -- SLA: 90-120 days before expiry
  reminder_count      INT NOT NULL DEFAULT 0,
  last_reminder_at    TIMESTAMPTZ,
  renewed_policy_id   TEXT REFERENCES policy.policies(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- CLAIMS: FNOL through settlement, complaints
-- =====================================================================

CREATE TABLE claims.claims (
  id                  TEXT PRIMARY KEY,               -- e.g. 'UTM-CLM-8419'
  policy_id           TEXT REFERENCES policy.policies(id),
  policy_number       TEXT NOT NULL,
  claim_type          TEXT NOT NULL,
  phone_number        TEXT,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'Notified'
                        CHECK (status IN ('Notified','Acknowledged','Documents','Assessment','Decision','Offer','Repudiated','Payment','Closed')),
  assigned_officer_id TEXT REFERENCES access.staff(id),
  reserve_amount_kes  NUMERIC(14,2),
  paid_amount_kes     NUMERIC(14,2),
  excess_kes          NUMERIC(14,2),                  -- SOP-16 settlement breakdown
  salvage_kes         NUMERIC(14,2),
  prior_payments_kes  NUMERIC(14,2),
  settlement_reason   TEXT,                           -- required before Closed
  requires_manager_review BOOLEAN NOT NULL DEFAULT FALSE,
  manager_reviewed_by     TEXT REFERENCES access.staff(id),
  manager_reviewed_at     TIMESTAMPTZ,
  reopened_count          INT NOT NULL DEFAULT 0,
  priority                TEXT NOT NULL DEFAULT 'green' CHECK (priority IN ('red','amber','green')),
  loss_date           DATE,
  reported_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_date         TIMESTAMPTZ,
  fraud_flag          BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_score         NUMERIC(5,4),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims.claim_timeline_steps (
  id            BIGSERIAL PRIMARY KEY,
  claim_id      TEXT NOT NULL REFERENCES claims.claims(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  event_date    TIMESTAMPTZ,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  detail        TEXT,
  sort_order    INT NOT NULL DEFAULT 0
);

-- Pre-submission coverage verification — distinct from the documents
-- checklist below: this checks the policy itself (active? loss within
-- period? asset covered? premium paid? within limit? excess/exclusion
-- applicable?) before a claim ever goes to the insurer, not the
-- paperwork supporting it. One fixed set of items per claim, seeded by
-- POST /api/claims/:id/start-coverage-check.
CREATE TABLE claims.coverage_verification_items (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims.claims(id),
  check_item   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','fail')),
  notes        TEXT,
  checked_by   TEXT REFERENCES access.staff(id),
  checked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOP-15 Claim Documentation, Follow-Up and Advocacy — each document
-- requested from a claimant/insurer/provider is tracked through its
-- own status (not just "was something uploaded"), so a stalled request
-- is visible before it becomes a cycle-time problem.
CREATE TABLE claims.claim_checklist_items (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL REFERENCES claims.claims(id),
  document_type   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','reviewed','waived')),
  notes           TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at     TIMESTAMPTZ,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT REFERENCES access.staff(id)
);

-- The claim diary: chronological notes and commitments, distinct from
-- claim_timeline_steps (status-change history). "Provide regular
-- updates even with no movement" — commitment_due_at lets an entry
-- carry a follow-up date so ageing (no update past its own commitment)
-- is visible without a separate escalation job.
CREATE TABLE claims.claim_diary_entries (
  id                BIGSERIAL PRIMARY KEY,
  claim_id          TEXT NOT NULL REFERENCES claims.claims(id) ON DELETE CASCADE,
  staff_id          TEXT REFERENCES access.staff(id),
  note              TEXT NOT NULL,
  commitment_due_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itemized reserve/payment breakdown by cost code — what a claim's
-- single reserve_amount_kes/paid_amount_kes total is actually FOR
-- (indemnity vs legal fees vs loss adjuster vs medical), not just one
-- lump figure. Supplements those totals rather than replacing them:
-- the totals stay the authoritative numbers the settlement gate
-- (SOP-16) checks against, these lines are the supporting detail.
CREATE TABLE claims.claim_reserve_lines (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL REFERENCES claims.claims(id),
  reserve_code    TEXT NOT NULL CHECK (reserve_code IN ('indemnity','legal_fees','loss_adjuster_fees','medical_expenses','investigation_fees','salvage_recovery_cost','other')),
  amount_kes      NUMERIC(14,2) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims.claim_payment_lines (
  id                  TEXT PRIMARY KEY,
  claim_id            TEXT NOT NULL REFERENCES claims.claims(id),
  payment_code        TEXT NOT NULL CHECK (payment_code IN ('indemnity','legal_fees','loss_adjuster_fees','medical_expenses','investigation_fees','salvage_recovery_cost','other')),
  amount_kes          NUMERIC(14,2) NOT NULL,
  payment_reference   TEXT,
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims.complaints (
  id                  TEXT PRIMARY KEY,               -- e.g. 'UTM-COMP-1234'
  party_id            TEXT REFERENCES crm.parties(id),
  policy_id           TEXT REFERENCES policy.policies(id),
  claim_id            TEXT REFERENCES claims.claims(id),
  category             TEXT,
  severity              TEXT CHECK (severity IN ('low','medium','high','critical')),
  cause                  TEXT,
  subject               TEXT,
  description           TEXT,
  channel                TEXT,
  status                  TEXT NOT NULL DEFAULT 'Received'
                            CHECK (status IN ('Received','Acknowledged','Investigation','Decision','Remedy','Verification','Closed','Escalated')),
  remedy                    TEXT,
  corrective_action           TEXT,
  received_date                TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_date                 TIMESTAMPTZ,
  assigned_staff_id               TEXT REFERENCES access.staff(id),
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- FINANCE: financial transactions, commission, reconciliation
-- =====================================================================

-- "Financial transaction" — SOP §8: statement line, debit/credit,
-- commission, tax, refund, payment, match and currency. One ledger
-- for everything finance needs to reconcile.
CREATE TABLE finance.financial_transactions (
  id                  TEXT PRIMARY KEY,
  policy_id           TEXT REFERENCES policy.policies(id),
  party_id            TEXT REFERENCES crm.parties(id),
  claim_id            TEXT REFERENCES claims.claims(id),
  transaction_type    TEXT NOT NULL CHECK (transaction_type IN
                        ('premium','commission','tax','refund','payment','credit_note','write_off')),
  direction            TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_kes           NUMERIC(14,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'KES',
  method                 TEXT CHECK (method IN ('mpesa','bank','card','cheque','journal')),
  provider_reference       TEXT,
  matched                   BOOLEAN NOT NULL DEFAULT FALSE,
  matched_statement_line_id  TEXT,
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','disputed','posted')),
  notes                         TEXT,                    -- e.g. the reason behind a commission clawback/reversal entry
  occurred_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.commission_statements (
  id                    TEXT PRIMARY KEY,
  insurer_id            TEXT NOT NULL REFERENCES product.insurers(id),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  total_commission_kes  NUMERIC(14,2),
  status                TEXT NOT NULL DEFAULT 'Imported'
                          CHECK (status IN ('Imported','Auto-Matched','Manual Review','Discrepancy','Resolved','Approved','Posted','Closed')),
  received_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.commission_lines (
  id                    BIGSERIAL PRIMARY KEY,
  statement_id          TEXT NOT NULL REFERENCES finance.commission_statements(id) ON DELETE CASCADE,
  policy_id             TEXT REFERENCES policy.policies(id),
  commission_rate_pct   NUMERIC(5,2),
  commission_amount_kes NUMERIC(14,2),
  matched_transaction_id TEXT REFERENCES finance.financial_transactions(id)
);

-- Producer/sub-broker commission split payable — how much of a
-- policy's commission is owed to whoever introduced it (see
-- sales.producers, policies.producer_id). Kept separate from the
-- insurer-side commission_statements/commission_lines above: those
-- reconcile the FULL commission received from the insurer against
-- what we projected; this tracks the internal distribution of our own
-- share once earned. Created when premium is confirmed for a policy
-- with a producer_id (server.ts confirmPremiumForPolicy), paid via
-- POST /api/producer-commission-splits/:id/pay.
CREATE TABLE finance.producer_commission_splits (
  id                       TEXT PRIMARY KEY,
  producer_id              TEXT NOT NULL REFERENCES sales.producers(id),
  policy_id                TEXT NOT NULL REFERENCES policy.policies(id),
  premium_confirmation_id  TEXT REFERENCES policy.premium_confirmations(id),
  commission_amount_kes    NUMERIC(14,2) NOT NULL,
  split_pct                NUMERIC(5,2) NOT NULL,
  split_amount_kes         NUMERIC(14,2) NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at                  TIMESTAMPTZ,
  payment_reference        TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A single payment (one cheque, one bank transfer, one M-Pesa
-- transaction) from a client, which may fund more than one policy's
-- premium at once — "client has 3 policies, pays one cheque covering
-- all three." total_amount_kes is the money actually received;
-- policy.premium_confirmations rows carrying this payment's id in
-- payment_id are the allocation lines against it. Unallocated balance
-- = total_amount_kes - SUM(those confirmations' confirmed_amount_kes).
CREATE TABLE finance.payments (
  id                  TEXT PRIMARY KEY,             -- e.g. 'pay-...'
  party_id            TEXT REFERENCES crm.parties(id),
  total_amount_kes    NUMERIC(14,2) NOT NULL,
  method              TEXT CHECK (method IN ('mpesa','bank','card','cheque','journal')),
  payment_reference   TEXT,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by         TEXT REFERENCES access.staff(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The brokerage's own operating cash — distinct from client premium/
-- insurer commission money above, which the firm never treats as its
-- own (SOP §1.1). One float per custodian (e.g. office administrator);
-- replenishment tops it up, disbursement draws it down. current_balance_kes
-- is maintained by the application, not derived on read, so a
-- disbursement that would take it negative can be rejected at write time.
CREATE TABLE finance.petty_cash_floats (
  id                    TEXT PRIMARY KEY,           -- e.g. 'float-...'
  custodian_staff_id    TEXT REFERENCES access.staff(id),
  opening_balance_kes   NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_balance_kes   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ
);

CREATE TABLE finance.petty_cash_transactions (
  id                   TEXT PRIMARY KEY,            -- e.g. 'pct-...'
  float_id             TEXT NOT NULL REFERENCES finance.petty_cash_floats(id),
  transaction_type     TEXT NOT NULL CHECK (transaction_type IN ('replenishment','disbursement')),
  amount_kes           NUMERIC(12,2) NOT NULL,
  purpose              TEXT NOT NULL,
  receipt_document_id  TEXT,                          -- FK to docs.documents, added below
  recorded_by          TEXT REFERENCES access.staff(id),
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Office running costs (rent, utilities, salaries, ...) — the firm's
-- own expenses, tracked so "the workings of the firm" show up
-- alongside client premium/commission accounting, not just outside it
-- in someone's personal spreadsheet.
CREATE TABLE finance.office_expenses (
  id                  TEXT PRIMARY KEY,             -- e.g. 'exp-...'
  category            TEXT NOT NULL CHECK (category IN ('rent','utilities','salaries','supplies','marketing','professional_fees','insurance','other')),
  description         TEXT NOT NULL,
  amount_kes          NUMERIC(12,2) NOT NULL,
  vendor              TEXT,
  payment_method      TEXT CHECK (payment_method IN ('mpesa','bank','card','cheque','journal')),
  status              TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','approved','paid')),
  incurred_at         DATE NOT NULL,
  paid_at             TIMESTAMPTZ,
  receipt_document_id TEXT,                           -- FK to docs.documents, added below
  recorded_by         TEXT REFERENCES access.staff(id),
  approved_by         TEXT REFERENCES access.staff(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- General ledger: chart of accounts, accounting periods and
-- double-entry journal entries/lines. financial_transactions above is
-- a flat cash-event log (one row per premium/commission/refund); this
-- is a real ledger a trial balance, income statement and balance
-- sheet can be computed from. Premium confirmations, office expense
-- payments and petty cash transactions auto-post a balanced journal
-- entry here (see postJournalEntry in server.ts) — best-effort, same
-- as the audit log: a posting failure never blocks the business
-- operation it describes.
CREATE TABLE finance.gl_accounts (
  code                TEXT PRIMARY KEY,             -- e.g. '1000', '5001'
  name                TEXT NOT NULL,
  account_type        TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  normal_balance      TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  parent_account_code TEXT REFERENCES finance.gl_accounts(code),
  is_system_account   BOOLEAN NOT NULL DEFAULT false, -- posted to by server.ts; not user-deletable
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.accounting_periods (
  id          TEXT PRIMARY KEY,                     -- e.g. '2026-07'
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at   TIMESTAMPTZ,
  closed_by   TEXT REFERENCES access.staff(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.journal_entries (
  id                   TEXT PRIMARY KEY,             -- e.g. 'je-...'
  period_id            TEXT NOT NULL REFERENCES finance.accounting_periods(id),
  entry_date           DATE NOT NULL,
  reference            TEXT,
  description          TEXT,
  source_type          TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','premium_confirmation','office_expense','petty_cash_transaction','reversal')),
  source_id            TEXT,                          -- id of the record that triggered an auto-posting
  status               TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_of_entry_id TEXT REFERENCES finance.journal_entries(id),
  posted_by            TEXT REFERENCES access.staff(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finance.journal_lines (
  id           BIGSERIAL PRIMARY KEY,
  entry_id     TEXT NOT NULL REFERENCES finance.journal_entries(id),
  account_code TEXT NOT NULL REFERENCES finance.gl_accounts(code),
  debit_kes    NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_kes   NUMERIC(14,2) NOT NULL DEFAULT 0,
  description  TEXT,
  policy_id    TEXT,                                  -- optional drill-down dimension, not a hard FK
  party_id     TEXT,
  CHECK ((debit_kes > 0 AND credit_kes = 0) OR (credit_kes > 0 AND debit_kes = 0))
);

INSERT INTO finance.gl_accounts (code, name, account_type, normal_balance, parent_account_code, is_system_account) VALUES
  ('1000', 'Bank & Cash', 'asset', 'debit', NULL, true),
  ('1010', 'Petty Cash', 'asset', 'debit', NULL, true),
  ('2000', 'Insurer Premiums Payable', 'liability', 'credit', NULL, true),
  ('2010', 'Producer Commissions Payable', 'liability', 'credit', NULL, true),
  ('3000', 'Retained Earnings', 'equity', 'credit', NULL, true),
  ('4000', 'Commission Income', 'income', 'credit', NULL, true),
  ('5000', 'Office Expenses', 'expense', 'debit', NULL, false),
  ('5001', 'Rent', 'expense', 'debit', '5000', true),
  ('5002', 'Utilities', 'expense', 'debit', '5000', true),
  ('5003', 'Salaries', 'expense', 'debit', '5000', true),
  ('5004', 'Supplies', 'expense', 'debit', '5000', true),
  ('5005', 'Marketing', 'expense', 'debit', '5000', true),
  ('5006', 'Professional Fees', 'expense', 'debit', '5000', true),
  ('5007', 'Insurance', 'expense', 'debit', '5000', true),
  ('5008', 'Other Expenses', 'expense', 'debit', '5000', true),
  ('5009', 'Petty Cash Disbursements', 'expense', 'debit', '5000', true)
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- COMPLIANCE: KYC audit trail, obligations register, regulatory returns
-- =====================================================================

-- "Compliance obligation" — SOP §8 / SOP-01: source, requirement, owner,
-- due date, evidence, submission and outcome. The recurring regulatory
-- calendar (licences, filings, credential renewals) — start reminders
-- >= 90 days before due date per SOP-01's stated service level.
CREATE TABLE compliance.obligations (
  id                  TEXT PRIMARY KEY,
  obligation_type     TEXT NOT NULL,                  -- 'licence','filing','credential','returns'
  source               TEXT,                            -- e.g. 'Insurance Act', 'IRA'
  requirement           TEXT NOT NULL,
  owner_staff_id          TEXT REFERENCES access.staff(id),
  due_date                 DATE NOT NULL,
  recurrence                 TEXT,                        -- 'annual','quarterly','one_off'
  evidence_document_id         TEXT,                        -- FK to docs.documents, added below
  status                        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','accepted','rejected','overdue')),
  submitted_at                    TIMESTAMPTZ,
  outcome                           TEXT,
  next_due_date                       DATE,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance.compliance_audit_log (
  id            TEXT PRIMARY KEY,                     -- e.g. 'log-...'
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  action        TEXT NOT NULL,
  performed_by  TEXT REFERENCES access.staff(id),
  details       JSONB,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- General audit event — SOP §10 audit standard: actor, timestamp,
-- object, previous/new value, reason, approval, evidence. Ordinary
-- users must not be able to edit rows here (enforce via DB role grants
-- in the deployment environment, not just app logic).
CREATE TABLE compliance.audit_log (
  id              BIGSERIAL PRIMARY KEY,
  actor_staff_id  TEXT REFERENCES access.staff(id),
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  before_state    JSONB,
  after_state     JSONB,
  reason          TEXT,
  ip_address      INET,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance.regulatory_returns (
  id                  TEXT PRIMARY KEY,
  return_type         TEXT NOT NULL,                   -- 'IRA_QUARTERLY','AML_STR','FRC_RETURN'
  period              TEXT NOT NULL,                   -- 'Q1-2026'
  submitted_at        TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','accepted','rejected')),
  file_document_id    TEXT,                             -- FK to docs.documents, added below
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- DOCS: polymorphic document/correspondence metadata (files live in
-- object storage — S3/MinIO — this table stores the pointer + metadata)
-- =====================================================================

CREATE TABLE docs.documents (
  id                  TEXT PRIMARY KEY,
  owner_entity_type   TEXT NOT NULL,                    -- 'party','policy','claim','product','obligation'
  owner_entity_id     TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  mime_type           TEXT,
  storage_key         TEXT NOT NULL,
  document_type       TEXT CHECK (document_type IN
                        ('policy_wording','kyc','claim_evidence','correspondence','regulatory','other')),
  sensitivity         TEXT NOT NULL DEFAULT 'internal' CHECK (sensitivity IN ('public','internal','restricted')),
  version             INT NOT NULL DEFAULT 1,
  content_hash        TEXT,
  retention_until      DATE,
  legal_hold            BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by             TEXT REFERENCES access.staff(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm.relationships          ADD CONSTRAINT fk_rel_doc  FOREIGN KEY (id_document_id) REFERENCES docs.documents(id);
ALTER TABLE product.products           ADD CONSTRAINT fk_prod_doc FOREIGN KEY (wording_document_id) REFERENCES docs.documents(id);
ALTER TABLE policy.policies            ADD CONSTRAINT fk_pol_doc FOREIGN KEY (policy_document_id) REFERENCES docs.documents(id);
ALTER TABLE policy.premium_confirmations ADD CONSTRAINT fk_pcf_doc FOREIGN KEY (evidence_document_id) REFERENCES docs.documents(id);
ALTER TABLE policy.premium_confirmations ADD CONSTRAINT fk_pcf_payment FOREIGN KEY (payment_id) REFERENCES finance.payments(id);
ALTER TABLE finance.petty_cash_transactions ADD CONSTRAINT fk_pct_doc FOREIGN KEY (receipt_document_id) REFERENCES docs.documents(id);
ALTER TABLE finance.office_expenses     ADD CONSTRAINT fk_exp_doc FOREIGN KEY (receipt_document_id) REFERENCES docs.documents(id);
ALTER TABLE sales.underwriting_queries  ADD CONSTRAINT fk_uq_doc FOREIGN KEY (response_document_id) REFERENCES docs.documents(id);
ALTER TABLE crm.kyc_checklist_items     ADD CONSTRAINT fk_kyc_doc FOREIGN KEY (document_id) REFERENCES docs.documents(id);
ALTER TABLE compliance.obligations     ADD CONSTRAINT fk_obl_doc FOREIGN KEY (evidence_document_id) REFERENCES docs.documents(id);
ALTER TABLE crm.opportunities          ADD CONSTRAINT fk_opp_producer FOREIGN KEY (producer_id) REFERENCES sales.producers(id);
ALTER TABLE compliance.regulatory_returns ADD CONSTRAINT fk_reg_doc FOREIGN KEY (file_document_id) REFERENCES docs.documents(id);

-- =====================================================================
-- COMMS: multi-channel notifications and templates
-- =====================================================================

CREATE TABLE comms.correspondence_templates (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  area            TEXT,                               -- 'client_and_lead','placement','policy','claims','compliance','finance'
  channel         TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','push')),
  subject         TEXT,
  body_template   TEXT NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE comms.notifications (
  id              TEXT PRIMARY KEY,
  party_id        TEXT REFERENCES crm.parties(id),
  staff_id        TEXT REFERENCES access.staff(id),
  channel         TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','push')),
  template_code   TEXT REFERENCES comms.correspondence_templates(code),
  payload         JSONB,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- WORKFLOW: the generic case/task engine required by SOP §9 — every
-- workflow in the SOP (Opportunity, Onboarding, Submission, Placement,
-- Policy, Endorsement, Claim, Complaint, Reconciliation, Finding) opens
-- a case here, and every state transition drives tasks with an owner,
-- due date, priority, evidence and escalation. "The system must control
-- work, not merely store it." (SOP §1, critical rule)
-- =====================================================================

CREATE TABLE workflow.cases (
  id              TEXT PRIMARY KEY,
  workflow_type   TEXT NOT NULL CHECK (workflow_type IN
                    ('opportunity','onboarding','submission','placement','policy',
                     'endorsement','claim','complaint','reconciliation','finding')),
  entity_type     TEXT NOT NULL,                        -- table this case tracks, e.g. 'policy','claim'
  entity_id       TEXT NOT NULL,
  current_state   TEXT NOT NULL,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  closure_reason  TEXT,
  sla_due_at      TIMESTAMPTZ,
  owner_staff_id  TEXT REFERENCES access.staff(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow.case_transitions (
  id              BIGSERIAL PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES workflow.cases(id) ON DELETE CASCADE,
  from_state      TEXT,
  to_state        TEXT NOT NULL,
  actor_staff_id  TEXT REFERENCES access.staff(id),
  reason          TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Covers both ordinary tasks and maker-checker approvals
-- (task_type = 'approval') — SOP §8 treats Task and Approval as one
-- entity. A task cannot close without an outcome (SOP §9).
CREATE TABLE workflow.tasks (
  id                      TEXT PRIMARY KEY,
  case_id                 TEXT REFERENCES workflow.cases(id) ON DELETE CASCADE,
  task_type               TEXT NOT NULL,                -- 'review','approval','call','document_check', ...
  queue                    TEXT,                          -- e.g. required approver role for approval tasks
  owner_staff_id            TEXT REFERENCES access.staff(id),
  priority                   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at                      TIMESTAMPTZ,
  status                       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','done','cancelled')),
  outcome                       TEXT,
  evidence_document_id            TEXT REFERENCES docs.documents(id),
  escalated                         BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at                        TIMESTAMPTZ,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at                               TIMESTAMPTZ,
  CHECK (status <> 'done' OR outcome IS NOT NULL)
);

-- =====================================================================
-- AI: room analyzer results + generic model run log (for auditable ML)
-- =====================================================================

CREATE TABLE ai.room_scan_results (
  id                          TEXT PRIMARY KEY,          -- e.g. 'scan-...'
  party_id                    TEXT REFERENCES crm.parties(id),
  room_type                   TEXT,
  status                      TEXT,
  clutter_score               NUMERIC(5,2),
  organization_suggestions    JSONB,
  safety_hazards              JSONB,
  estimated_items             JSONB,
  total_contents_value_kes    NUMERIC(14,2),
  indicative_premium_kes      NUMERIC(14,2),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai.model_runs (
  id              BIGSERIAL PRIMARY KEY,
  model_name      TEXT NOT NULL,                         -- 'lapse_propensity_v1','claim_fraud_score_v2'
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  input_features  JSONB,
  output          JSONB NOT NULL,
  score           NUMERIC(6,4),
  model_version   TEXT,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- HR: employee profiles, leave management, performance reviews
-- =====================================================================

-- The blueprint's "employee record" is distinct from access.staff's
-- "user account" — this is a 1:1 HR extension of a staff row (job
-- title, department, employment lifecycle), not a replacement for it.
-- Recruitment/payroll/attendance/training are deliberately out of
-- scope for this pass — see README.
CREATE SCHEMA hr;

CREATE TABLE hr.employees (
  staff_id                TEXT PRIMARY KEY REFERENCES access.staff(id),
  job_title               TEXT,
  department              TEXT,
  branch                  TEXT,
  employment_type         TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','intern')),
  employment_status       TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','on_leave','suspended','terminated')),
  hire_date               DATE,
  termination_date        DATE,
  termination_reason      TEXT,
  national_id             TEXT,
  kra_pin                 TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  base_salary_kes         NUMERIC(12,2),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reference data: how many days per year each leave type grants and
-- whether it's paid. Kenyan Employment Act-inspired defaults.
CREATE TABLE hr.leave_types (
  id                    TEXT PRIMARY KEY,   -- 'annual','sick','maternity','paternity','compassionate','unpaid'
  name                  TEXT NOT NULL,
  default_days_per_year NUMERIC(5,1) NOT NULL DEFAULT 0,
  paid                  BOOLEAN NOT NULL DEFAULT true
);

-- One row per staff+leave type+year. used_days is incremented when a
-- leave_requests row is approved and decremented if an approved
-- request is later cancelled — never derived by summing requests on
-- read, so a request stuck mid-workflow can't silently change a
-- balance no one approved.
CREATE TABLE hr.leave_balances (
  id                 TEXT PRIMARY KEY,
  staff_id           TEXT NOT NULL REFERENCES access.staff(id),
  leave_type_id      TEXT NOT NULL REFERENCES hr.leave_types(id),
  year               INTEGER NOT NULL,
  allocated_days     NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days          NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_over_days  NUMERIC(5,1) NOT NULL DEFAULT 0,
  UNIQUE (staff_id, leave_type_id, year)
);

CREATE TABLE hr.leave_requests (
  id              TEXT PRIMARY KEY,
  staff_id        TEXT NOT NULL REFERENCES access.staff(id),
  leave_type_id   TEXT NOT NULL REFERENCES hr.leave_types(id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days_requested  NUMERIC(5,1) NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','cancelled')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by      TEXT REFERENCES access.staff(id),
  decided_at      TIMESTAMPTZ,
  decision_notes  TEXT
);

CREATE TABLE hr.performance_reviews (
  id                    TEXT PRIMARY KEY,
  staff_id              TEXT NOT NULL REFERENCES access.staff(id),
  reviewer_id           TEXT REFERENCES access.staff(id),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  rating                TEXT CHECK (rating IN ('exceeds','meets','below','unsatisfactory')),
  strengths             TEXT,
  areas_for_improvement TEXT,
  goals                 TEXT,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','acknowledged')),
  submitted_at          TIMESTAMPTZ,
  acknowledged_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO hr.leave_types (id, name, default_days_per_year, paid) VALUES
  ('annual', 'Annual leave', 21, true),
  ('sick', 'Sick leave', 14, true),
  ('maternity', 'Maternity leave', 90, true),
  ('paternity', 'Paternity leave', 14, true),
  ('compassionate', 'Compassionate leave', 5, true),
  ('unpaid', 'Unpaid leave', 0, false)
ON CONFLICT (id) DO NOTHING;

-- (HR employee + leave-balance seed rows live at the end of this file: they reference access.staff rows seeded below.)

-- =====================================================================
-- INDEXES
-- =====================================================================

CREATE INDEX idx_parties_status              ON crm.parties (status);
CREATE INDEX idx_client_accounts_party        ON crm.client_accounts (party_id);
CREATE INDEX idx_client_accounts_owner        ON crm.client_accounts (owner_staff_id);
CREATE INDEX idx_relationships_party          ON crm.relationships (party_id);
CREATE INDEX idx_opportunities_stage_owner    ON crm.opportunities (stage, owner_staff_id);

CREATE INDEX idx_quotations_client            ON sales.quotations (client_id);
CREATE INDEX idx_quotations_status            ON sales.quotations (status);
CREATE INDEX idx_submissions_risk             ON sales.submissions (risk_id);

CREATE INDEX idx_policies_client              ON policy.policies (client_id);
CREATE INDEX idx_policies_status_enddate      ON policy.policies (status, end_date);
CREATE INDEX idx_renewals_due                 ON policy.renewals (renewal_status, due_date);

CREATE INDEX idx_claims_status                ON claims.claims (status);
CREATE INDEX idx_claims_officer               ON claims.claims (assigned_officer_id);
CREATE INDEX idx_claims_policy                ON claims.claims (policy_id);
CREATE INDEX idx_claim_timeline_claim         ON claims.claim_timeline_steps (claim_id);

CREATE INDEX idx_fin_txn_policy               ON finance.financial_transactions (policy_id);
CREATE INDEX idx_fin_txn_status               ON finance.financial_transactions (status);
CREATE INDEX idx_commission_lines_policy      ON finance.commission_lines (policy_id);

CREATE INDEX idx_obligations_due              ON compliance.obligations (status, due_date);
CREATE INDEX idx_audit_entity                 ON compliance.audit_log (entity_type, entity_id);
CREATE INDEX idx_docs_owner                   ON docs.documents (owner_entity_type, owner_entity_id);

CREATE INDEX idx_cases_type_state             ON workflow.cases (workflow_type, current_state);
CREATE INDEX idx_cases_entity                 ON workflow.cases (entity_type, entity_id);
CREATE INDEX idx_cases_sla_due                ON workflow.cases (sla_due_at) WHERE closed_at IS NULL;
CREATE INDEX idx_tasks_owner_status           ON workflow.tasks (owner_staff_id, status);
CREATE INDEX idx_tasks_case                   ON workflow.tasks (case_id);
CREATE INDEX idx_tasks_due                    ON workflow.tasks (due_at) WHERE status NOT IN ('done','cancelled');

-- =====================================================================
-- ANALYTICS — illustrative materialized views feeding dashboards in
-- SOP §12 (loss ratio informs the insurer scorecard, renewal pipeline
-- feeds the operations dashboard, agent performance feeds sales).
-- Refresh nightly via cron/Airflow with REFRESH MATERIALIZED VIEW.
-- =====================================================================

CREATE MATERIALIZED VIEW analytics.mv_loss_ratio_by_insurer AS
SELECT
  i.id                                          AS insurer_id,
  i.name                                        AS insurer_name,
  date_trunc('month', p.start_date)::date       AS underwriting_month,
  SUM(p.premium_amount)                         AS written_premium_kes,
  COALESCE(SUM(c.paid_amount_kes), 0)           AS incurred_claims_kes,
  ROUND(
    COALESCE(SUM(c.paid_amount_kes), 0) / NULLIF(SUM(p.premium_amount), 0) * 100, 2
  )                                              AS loss_ratio_pct
FROM policy.policies p
JOIN product.insurers i ON i.id = p.insurer_id
LEFT JOIN claims.claims c ON c.policy_id = p.id
GROUP BY i.id, i.name, date_trunc('month', p.start_date);

CREATE MATERIALIZED VIEW analytics.mv_renewal_pipeline AS
SELECT
  r.id                AS renewal_id,
  r.policy_id,
  p.client_id,
  cr.full_name        AS client_name,
  p.category,
  p.premium_amount,
  r.due_date,
  r.renewal_status,
  (r.due_date - CURRENT_DATE)  AS days_to_due
FROM policy.renewals r
JOIN policy.policies p ON p.id = r.policy_id
JOIN crm.parties cr     ON cr.id = p.client_id
WHERE r.renewal_status <> 'lapsed';

CREATE MATERIALIZED VIEW analytics.mv_agent_performance AS
SELECT
  s.id                       AS staff_id,
  s.full_name,
  COUNT(DISTINCT q.id)       AS quotations_written,
  COUNT(DISTINCT pol.id)     AS policies_bound,
  SUM(pol.premium_amount)    AS total_premium_kes,
  ROUND(
    COUNT(DISTINCT pol.id)::numeric / NULLIF(COUNT(DISTINCT q.id), 0) * 100, 2
  )                          AS quote_to_bind_pct
FROM access.staff s
LEFT JOIN sales.quotations q   ON q.assigned_staff_id = s.id
LEFT JOIN policy.policies pol ON pol.quotation_id = q.id
GROUP BY s.id, s.full_name;

CREATE MATERIALIZED VIEW analytics.mv_overdue_tasks AS
SELECT
  t.id, t.task_type, t.queue, t.owner_staff_id, s.full_name AS owner_name,
  t.due_at, t.priority, c.workflow_type, c.entity_type, c.entity_id,
  (now() - t.due_at) AS overdue_by
FROM workflow.tasks t
JOIN workflow.cases c ON c.id = t.case_id
LEFT JOIN access.staff s ON s.id = t.owner_staff_id
WHERE t.status NOT IN ('done','cancelled') AND t.due_at < now();

-- =====================================================================
-- SEED: default system actor. Every write endpoint falls back to
-- actor id 'staff-1' when no real staff session exists yet (there is
-- no staff auth/RBAC UI built — see README). Without this row, that
-- fallback violates audit_log's FK and the write itself would still
-- succeed since addAuditLog failures are non-fatal, but the audit
-- trail would silently have gaps. Safe to re-run.
-- =====================================================================

INSERT INTO access.roles (id, name, description) VALUES
  ('system', 'System', 'Automated/system actions before real staff auth exists')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.staff (id, full_name, role_id, active) VALUES
  ('staff-1', 'System (default actor)', 'system', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- SEED: real staff logins (JWT + RBAC, see server.ts POST /api/auth/login).
-- Password for all three is "ChangeMe123!" — change it (and the hash
-- below) before this points at anything but a local dev database.
-- Distinct from 'staff-1' above, which stays the fallback actor for
-- writes with no logged-in human behind them (e.g. the public
-- quote-generator app's service-to-service calls).
-- =====================================================================

INSERT INTO access.roles (id, name, description) VALUES
  ('admin', 'Admin', 'Full access — staff, roles, insurer panel, reconciliation, compliance'),
  ('underwriter', 'Underwriter', 'Placement, insurer rates, commission guide'),
  ('claims_officer', 'Claims Officer', 'Claims assessment through payment'),
  ('accountant', 'Accountant', 'Premium confirmations, commission statement reconciliation'),
  ('supervisor', 'Supervisor', 'Recommendation and compliance sign-off'),
  ('sales_agent', 'Sales Agent', 'Parties, opportunities, day-to-day CRM work')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.permissions (id, description) VALUES
  ('insurer_rate.manage', 'Create/update insurer commission rates and statutory levies'),
  ('recommendation.decide', 'Record a client''s decision on a recommendation and bind the resulting policy'),
  ('claim.decide', 'Move a claim through Decision/Offer/Repudiated/Payment'),
  ('commission_statement.reconcile', 'Import and reconcile insurer commission statements'),
  ('obligation.manage', 'Create/update compliance obligations'),
  ('gl.manage', 'Manage the chart of accounts and post/reverse manual journal entries'),
  ('gl.period_close', 'Close an accounting period'),
  ('employee.manage', 'Create/edit employee profiles and leave types'),
  ('leave.decide', 'Approve/reject leave requests'),
  ('performance_review.manage', 'Create, submit and acknowledge performance reviews'),
  ('producer.manage', 'Create/edit producers and pay out producer commission splits')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id)
  SELECT 'admin', id FROM access.permissions
ON CONFLICT DO NOTHING;
INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('underwriter', 'insurer_rate.manage'),
  ('claims_officer', 'claim.decide'),
  ('accountant', 'commission_statement.reconcile'),
  ('supervisor', 'recommendation.decide'),
  ('supervisor', 'obligation.manage'),
  ('accountant', 'gl.manage'),
  ('supervisor', 'gl.period_close'),
  ('supervisor', 'leave.decide'),
  ('supervisor', 'performance_review.manage'),
  ('accountant', 'producer.manage')
ON CONFLICT DO NOTHING;

INSERT INTO access.staff (id, full_name, email, role_id, active, password_hash) VALUES
  ('staff-admin', 'Amina Hassan', 'amina@utmostbrokers.co.ke', 'admin', true, '$2b$10$AXyc30GmaOGZxU25jVhG8OenSgJ2LjAyZMp49E8OCd1f5AzOQVdua'),
  ('staff-underwriter', 'Peter Otieno', 'peter@utmostbrokers.co.ke', 'underwriter', true, '$2b$10$AXyc30GmaOGZxU25jVhG8OenSgJ2LjAyZMp49E8OCd1f5AzOQVdua'),
  ('staff-claims', 'Grace Njeri', 'grace@utmostbrokers.co.ke', 'claims_officer', true, '$2b$10$AXyc30GmaOGZxU25jVhG8OenSgJ2LjAyZMp49E8OCd1f5AzOQVdua')
ON CONFLICT (id) DO NOTHING;

-- SEED: current statutory levy rates for general classes. These are
-- published rates, not estimates — update the row (with a new
-- effective_from) when the regulator revises them; never edit history.
INSERT INTO product.statutory_levies (id, levy_type, category, calculation_method, rate_pct, flat_amount_kes, effective_from, source) VALUES
  ('levy-pcf-general', 'pcf', NULL, 'percentage', 0.25, NULL, '2026-01-01', 'Policyholders Compensation Fund Regulations'),
  ('levy-itl-general', 'itl', NULL, 'percentage', 0.20, NULL, '2026-01-01', 'Insurance Training Levy'),
  ('levy-stamp-duty-general', 'stamp_duty', NULL, 'flat', NULL, 40, '2026-01-01', 'Stamp Duty Act')
ON CONFLICT (id) DO NOTHING;

-- Commission Guide Insurance.xlsx — the market's own maximum permitted
-- commission rate per line of business. class_code maps each product
-- onto the IRA class taxonomy; NULL where a product spans classes or
-- doesn't map to a single one (Motor COMESA, combined packages).
INSERT INTO product.commission_guide (id, category, policy_name, class_code, max_permitted_commission_pct, source) VALUES
  ('cg-contractors-all-risks', 'ENGINEERING', 'Contractors All Risks', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-electronic-equipment', 'ENGINEERING', 'Electronic Equipment', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-machinery-breakdown', 'ENGINEERING', 'Machinery Breakdown', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-machinery-consequential-loss', 'ENGINEERING', 'Machinery Consequential Loss', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-erection-all-risks', 'ENGINEERING', 'Erection All Risks', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-contractors-plant-machinery', 'ENGINEERING', 'Contractors Plant & Machinery', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-deterioration-of-stock', 'ENGINEERING', 'Deterioration of Stock', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-domestic-package', 'FIRE DOMESTIC', 'Domestic Package', '03', 20.00, 'Commission Guide Insurance'),
  ('cg-fire-and-perils', 'FIRE COMMERCIAL', 'Fire and Perils', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-industrial-all-risks', 'FIRE COMMERCIAL', 'Industrial All Risks', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-fire-consequential-loss', 'FIRE COMMERCIAL', 'Fire Consequential Loss', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-assets-all-risks', 'FIRE COMMERCIAL', 'Assets All Risks', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-public-liability', 'LIABILITY', 'Public Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-professional-indemnity', 'LIABILITY', 'Professional Indemnity', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-employers-liability', 'LIABILITY', 'Employers Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-products-liability', 'LIABILITY', 'Products Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-contractual-liability', 'LIABILITY', 'Contractual Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-carriers-liability', 'LIABILITY', 'Carriers Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-directors-officers-liability', 'LIABILITY', 'Directors & Officers Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-pension-trustees-liability', 'LIABILITY', 'Pension Trustees Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-marine-cargo-sea', 'MARINE', 'Marine Cargo Sea', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-marine-cargo-air', 'MARINE', 'Marine Cargo Air', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-marine-open-cover', 'MARINE', 'Marine open Cover', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-marine-hull', 'MARINE', 'Marine Hull', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-goods-in-transit', 'MARINE', 'Goods in Transit', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-motor-private', 'MOTOR', 'Motor Private', '07', 10.00, 'Commission Guide Insurance'),
  ('cg-private-motor-cycle', 'MOTOR', 'Private Motor Cycle', '07', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-own-goods', 'MOTOR', 'Motor Commercial Own Goods', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-agric-vehicles', 'MOTOR', 'Motor Commercial Agric. vehicles', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-trade', 'MOTOR', 'Motor Trade', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-psv-chauffeur-driven', 'MOTOR', 'PSV Chauffeur Driven', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-petroleum-tankers-own-goods', 'MOTOR', 'Petroleum Tankers Own Goods', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-petroleum-tankers-hire-reward', 'MOTOR', 'Petroleum Tankers for Hire/Reward', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-general-cartage', 'MOTOR', 'Motor Commercial General Cartage', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-special-vehicles', 'MOTOR', 'Motor Commercial Special vehicles', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-psv-motor-asset', 'MOTOR', 'PSV Motor Asset', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-comesa', 'MOTOR', 'Motor (COMESA)', NULL, 5.00, 'Commission Guide Insurance'),
  ('cg-personal-accident', 'ACCIDENT', 'Personal Accident', '09', 20.00, 'Commission Guide Insurance'),
  ('cg-group-personal-accident', 'ACCIDENT', 'Group Personal Accident', '09', 20.00, 'Commission Guide Insurance'),
  ('cg-money', 'THEFT', 'Money', '10', 10.00, 'Commission Guide Insurance'),
  ('cg-burglary', 'THEFT', 'Burglary', '10', 20.00, 'Commission Guide Insurance'),
  ('cg-fidelity-guarantee', 'THEFT', 'Fidelity Guarantee', '10', 10.00, 'Commission Guide Insurance'),
  ('cg-theft-all-risks', 'THEFT', 'All Risks', '10', 10.00, 'Commission Guide Insurance'),
  ('cg-wiba', 'WIBA', 'Work Injury Benefits Act', '11', 20.00, 'Commission Guide Insurance'),
  ('cg-micro-health', 'HEALTHCARE/MEDICAL', 'Micro Health (Micro Medical Insurance)', '13', 10.00, 'Commission Guide Insurance'),
  ('cg-group-medical-schemes', 'HEALTHCARE/MEDICAL', 'Group Medical Schemes', '12', 10.00, 'Commission Guide Insurance'),
  ('cg-smes-business-combined', 'PACKAGE/COMBINED', 'SMEs Business combined', NULL, 20.00, 'Commission Guide Insurance'),
  ('cg-business-combined', 'PACKAGE/COMBINED', 'Business Combined', NULL, 20.00, 'Commission Guide Insurance'),
  ('cg-plate-glass', 'MISCELLANEOUS', 'Plate Glass', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-political-violence-terrorism', 'MISCELLANEOUS', 'Political Violence & Terrorism', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-travel', 'MISCELLANEOUS', 'Travel', '14', 20.00, 'Commission Guide Insurance'),
  ('cg-tender-bid-bond', 'MISCELLANEOUS', 'Tender/Bid Bond', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-security-immigration-bond', 'MISCELLANEOUS', 'Security/Immigration Bond', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-custom-bond', 'MISCELLANEOUS', 'Custom Bond', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-performance-bond', 'MISCELLANEOUS', 'Performance Bond', '14', 10.00, 'Commission Guide Insurance')
ON CONFLICT (id) DO NOTHING;

-- HR seed rows for the seeded staff logins (must come after access.staff inserts above).
INSERT INTO hr.employees (staff_id, job_title, department, branch, employment_type, employment_status, hire_date) VALUES
  ('staff-admin', 'Operations Director', 'Management', 'Nairobi HQ', 'full_time', 'active', '2022-01-10'),
  ('staff-underwriter', 'Underwriter', 'Underwriting', 'Nairobi HQ', 'full_time', 'active', '2023-03-01'),
  ('staff-claims', 'Claims Officer', 'Claims', 'Nairobi HQ', 'full_time', 'active', '2023-06-15')
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO hr.leave_balances (id, staff_id, leave_type_id, year, allocated_days) VALUES
  ('lb-staff-admin-annual-2026', 'staff-admin', 'annual', 2026, 21),
  ('lb-staff-admin-sick-2026', 'staff-admin', 'sick', 2026, 14),
  ('lb-staff-underwriter-annual-2026', 'staff-underwriter', 'annual', 2026, 21),
  ('lb-staff-underwriter-sick-2026', 'staff-underwriter', 'sick', 2026, 14),
  ('lb-staff-claims-annual-2026', 'staff-claims', 'annual', 2026, 21),
  ('lb-staff-claims-sick-2026', 'staff-claims', 'sick', 2026, 14)
ON CONFLICT (staff_id, leave_type_id, year) DO NOTHING;

-- Route-permission audit (migrate-020): permissions gating money-moving and sensitive-read routes.
INSERT INTO access.permissions (id, description) VALUES
  ('finance.record', 'Record payments, allocations, premium confirmations, clawbacks, petty cash and office expenses'),
  ('finance.view', 'View internal finance: general ledger, journal entries, petty cash and office expenses'),
  ('underwriting.approve', 'Approve or reject a stage of an underwriting approval'),
  ('audit.view', 'Read the audit log'),
  ('document.restricted', 'Read documents marked as restricted')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'finance.record'), ('accountant', 'finance.record'),
  ('admin', 'finance.view'), ('accountant', 'finance.view'), ('supervisor', 'finance.view'),
  ('admin', 'underwriting.approve'), ('underwriter', 'underwriting.approve'), ('supervisor', 'underwriting.approve'),
  ('admin', 'audit.view'),
  ('admin', 'document.restricted'), ('supervisor', 'document.restricted')
ON CONFLICT DO NOTHING;
