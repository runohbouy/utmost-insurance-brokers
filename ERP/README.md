> This is the backend, part of the Utmost monorepo — see the [root README](../README.md) and [deployment guide](../docs/DEPLOYMENT.md).

# erp

Utmost Insurance Brokers' insurance brokerage ERP: CRM, policy
administration, claims, finance, compliance and the workflow/task
engine. This service owns the Postgres database and is the single
system of record. The public quote-generator app (`studio`) is a
client of this API for anything beyond generating a quote number — it
does not touch the database directly.

Built to the entity and workflow definitions in
`Insurance_Brokerage_SOP_and_System_Build_Guide.docx` (Kenya, v1.0,
July 2026) and the screen/navigation structure in
`Insurance_Brokerage_System_Wireframe_and_UI_Specification.docx` — see
`database/schema.sql` for section references.

The insurer panel is seeded from the real IRA Kenya licensed-entities
register (`licensed-entities-2026.pdf`, 30 March 2026 — The Insurance
Act, Cap 487, s.184): 62 actual licensed insurers with their real
authorized classes. Insurer class codes (`src/data/insuranceClasses.ts`)
are the IRA's own numbering (01 Aviation … 14 Miscellaneous, 31 Life
Assurance … 37b Investment), not an internal taxonomy — the placement
flow enforces against it, so an insurer only appears as a market for a
risk if it's actually licensed for that class.

## Run locally

With Docker:

```
npm install
npm run db:up        # starts local Postgres via Docker
cp .env.example .env # then set INTERNAL_API_KEY and JWT_SECRET to real secrets
npm run db:migrate    # applies database/schema.sql
npm run dev            # starts the API + dashboard on :3100
```

Without Docker — PGlite (real Postgres compiled to WASM) running
in-process, zero install, no separate database server, data persisted
to `database/.pgdata-embedded/`:

```
npm install
cp .env.example .env  # set PGLITE_DEV="true"
npm run db:migrate
npm run db:migrate:insurer-settings  # one-off: adds insurer KYC + rate/tax columns
npm run db:migrate:insurer-classes   # one-off: adds insurer_type + authorized_classes
npm run db:migrate:statutory-levies  # one-off: splits PCF/ITL/stamp duty into their own market-wide table
npm run db:migrate:commission-guide  # one-off: seeds the max permitted commission rate per line of business
npm run db:seed:insurers             # seeds the 62 real IRA-licensed insurers
npm run dev
```

Set `PGLITE_DEV` back to `"false"` (or unset it) and point
`DATABASE_URL` at a real Postgres to switch back — nothing else in
the app changes (see `db/client.ts`). Uploaded documents are stored
under `storage/documents/` on local disk in this configuration; swap
for S3/MinIO in production without changing the API shape.

## What's implemented so far

SOP roadmap (§15) Phase 1 (Foundation), Phase 3 (Claims and
servicing), the insurer-panel piece of Phase 2, and the premium/
commission piece of Phase 4 — plus, now, the core of Phase 2 itself:
the Risk → Submission → Quotation → Recommendation placement chain.

- **Parties** (`/api/parties`) — client/prospect master record
- **Opportunities** (`/api/opportunities`) — the sales pipeline, using
  the SOP §9 state machine (New → Contacted → Qualified → Discovery →
  Data Collection → Marketed → Quoted → Presented → Decision →
  Won/Lost/Deferred)
- **Placement** (`/api/risks`, `/api/market-strategies`,
  `/api/submissions`, `/api/quotations`, `/api/recommendations`) — the
  market placement chain (SOP §8): a Risk records what's actually
  being insured behind an opportunity. **Class-specific risk data
  collection**: what's actually needed to assess a risk varies by
  class — Motor (registration number, make/model, year, usage),
  Medical (date of birth, pre-existing conditions declaration), Fire
  (construction type, occupancy), Liability (business activity,
  turnover) each get their own dynamic questionnaire in Placement,
  driven by `src/data/riskClassFields.ts` and stored in the risk's own
  `exposure_attributes` JSONB (a column that existed from the original
  schema but was never read or written by any route until now).
  Classes with no defined field set just skip the questionnaire.
  `POST /api/submissions` rejects a risk missing any required field for
  its class with a 400 listing exactly which ones — "identify missing
  mandatory information before the risk can proceed to market," not
  leave it for the insurer to discover. A **market strategy** (SOP-07 —
  incumbent renewal, remarketing, specialist facility, co-insurance or
  layering, with a rationale) must be recorded before a Submission can
  go out at all (`POST /api/submissions` rejects one otherwise); a
  Submission goes to one or more insurers on the panel — the picker is
  filtered by **insurer appetite** (`/api/insurer-appetite`, Insurer
  panel), a business-risk-appetite layer per insurer+class distinct
  from the licence-based `authorizedClasses` check: an insurer can be
  licensed for a class and still be "excluded" (hidden from the picker
  entirely) or "restricted" (selectable, but flagged with a warning
  banner on the created submission); naming only one market requires a
  documented single-source justification, captured inline in the
  picker and backfilled onto the strategy record — all validation
  happens before any write, so a request that ultimately fails a later
  check (e.g. appetite) never leaves a partial justification behind.
  Each Quotation is priced automatically from the insurer's rate/tax
  settings (base premium + PCF + Insurance Training Levy + stamp duty
  = total premium); a Recommendation compares quotations, records
  reasons and disclosures, and captures the client's actual decision.
  Accepting a recommendation exposes a **Bind to policy** action that
  issues the policy from the winning quotation and moves the
  opportunity to Won — the dashboard walks this whole chain in one
  screen. Inspired by the Digital Marketplace Insurance Underwriter
  Framework's "Clearance evaluation" step, `PATCH
  /api/recommendations/:id` gates `clientDecision: "accepted"` behind a
  **risk clearance** (SOP-23 — AML/CFT/CPF, fraud and unusual-activity
  escalation): `sales.risk_clearances` (`/api/risk-clearances`) records
  a sanctions/PEP screening result and a conflict-of-interest check
  against the risk behind the recommendation. Accepting is rejected
  with a 400 unless the latest clearance's screening result is
  `clear`/`override` (not `pending`/`hit`) *and* the conflict-of-interest
  check is marked done — `override` is a documented decision to proceed
  despite a screening hit (e.g. a resolved false positive), never a
  silent bypass. Recorded in Placement's Clearance panel, shown
  alongside the Recommendation while the client's decision is still
  pending.
- **Insurer panel** (`/api/insurers`, `/api/insurer-rates`) — seeded
  from the real IRA licensed-entities register (62 insurers: 35
  general, 22 life, 5 micro), with KYC/licensing fields (SOP-02:
  licence number/expiry, AIBK membership, KYC status), and a
  per-insurer+class negotiated commission rate. Each insurer's
  `authorizedClasses` are the IRA's own class codes — the placement
  flow's insurer picker only shows insurers actually licensed for the
  risk's class (`src/data/insuranceClasses.ts`), not just the whole
  panel.
- **Statutory levies & taxes** (`/api/statutory-levies`) — PCF,
  Insurance Training Levy and stamp duty are government-mandated and
  identical across the whole market, not something negotiated per
  insurer — they live in their own table (`product.statutory_levies`),
  separate from `insurer_rate_versions`, matched by class (or `NULL`
  for "every class") and effective date. Quotation pricing (base
  premium + PCF + ITL + stamp duty = total premium) reads the
  commission rate from the insurer's rate version and the three levies
  from this table.
- **Product catalog** (`/api/products`, Insurer panel) — Underwriting-
  Framework-inspired "faster deployment of new products": a named
  product an insurer actually sells (e.g. "AAR Motor Comprehensive
  Plus"), separate from the raw class/category quotations are priced
  against. Publishing or retiring one (the Active toggle) is a data
  change, not a code change; the class picker in the create form is
  filtered to the chosen insurer's own `authorizedClasses`, same as the
  commission-rate form above.
- **Commission guide** (`/api/commission-guide`, read-only reference
  data) — the market's own maximum permitted commission rate per line
  of business (`Commission Guide Insurance.xlsx`, 55 lines across 12
  categories), mapped onto the IRA class taxonomy via `classCode`
  (`NULL` for products that don't map to a single class — Motor
  COMESA, combined packages). `POST`/`PATCH /api/insurer-rates`
  enforce against it: a negotiated `commissionRatePct` above the
  guide's ceiling for that class (the highest rate among the guide's
  policy lines mapped to it, since one class can bundle several
  products at different caps — Theft covers both Money at 10% and
  Burglary at 20%) is rejected with a 400. The Insurer panel's
  commission-rate table shows a Guide max column alongside it.
- **Policies** (`/api/policies`) — issuable directly from the dashboard
  or via Placement's "Bind to policy", using the SOP §8 state machine
  (Pending → … → Active → Expired/Cancelled/Lapsed); also still
  receives policies from `studio`'s quote flow
- **Premium confirmations & commission projections**
  (`/api/premium-confirmations`, `/api/financial-transactions`) — the
  evidence gate (SOP §1.1/§15.1: cover is never Active on instruction
  alone) that moves a policy to Active on confirmed payment, records
  the premium as a financial transaction, and projects the commission
  the brokerage should earn from the insurer's rate setting — a
  `pending` commission row, not yet an insurer-confirmed statement line
- **Claims** (`/api/claims`, `src/components/ClaimDetailView.tsx`) —
  FNOL through settlement, using the SOP §9 state machine (Notified →
  Acknowledged → Documents → Assessment → Decision → Offer/Repudiated →
  Payment → Closed). Every status change is logged to
  `claims.claim_timeline_steps` — the claim's own progress trail,
  separate from the general audit log. Clicking a claim opens its own
  detail screen (SOP-15) with a **Documents Checklist** tab — each
  document requested from a claimant/insurer/provider tracked through
  its own status (requested → received → reviewed, or waived), not
  just a generic upload — and a **Diary** tab: chronological notes with
  an optional "next update due" date, so a claim with no updates past
  its own commitment is flagged (`Overdue update`) right in the header,
  without a separate background job computing it. A **Settlement** tab
  (SOP-16) records the breakdown (excess, salvage, prior payments) and
  a settlement/repudiation reason, and enforces the SOP's closure
  gate server-side: a claim that's `Repudiated`, or whose payment is a
  material partial of its reserve (paid under 80% of reserved —
  computed automatically, not self-reported), is flagged
  `requiresManagerReview` and can't move to `Closed` until that review
  is recorded (`POST /api/claims/:id/manager-review`) *and* a
  settlement reason is set — "no closure without outcome evidence."
  `POST /api/claims/:id/reopen` is the only way back from `Closed`,
  always with a reason logged to the timeline and a `reopenedCount`
  that makes a repeatedly-reopened claim visible as its own signal.
  Two more additions, inspired by B-SAFE (the Digital Marketplace
  claims-management listing): a **RAG priority flag**
  (red/amber/green, manually set, shown as a colored dot in the
  Claims list and a selector in the detail header — no automatic
  severity scoring, since that would need a fraud/exposure model this
  system doesn't have) and an itemized **reserve/payment breakdown**
  by cost code (`/api/claim-reserve-lines`, `/api/claim-payment-lines`
  — indemnity, legal fees, loss adjuster fees, medical expenses,
  investigation fees, salvage recovery cost, other), shown in the
  Settlement tab alongside the existing `reserveAmountKes`/
  `paidAmountKes` totals. The itemized lines are supplementary detail,
  not the source of truth — they don't replace or auto-sync with the
  totals the SOP-16 settlement gate actually checks, so entering lines
  that don't add up to the total doesn't silently change anything.
  A third B-SAFE-inspired addition: `PATCH /api/claims/:id` auto-queues
  a notification on every status change, if an active correspondence
  template exists whose `code` follows the convention
  `claim_<status_lowercase_underscored>` (e.g. `claim_documents` for
  the `Documents` stage) and whose `area` is `'claims'` — resolved to
  the claim's policyholder via `policy.clientId`. Best-effort: a
  missing template or unresolvable policyholder never blocks the
  status update itself, matching how the audit log's own write
  failures are handled elsewhere in this file.
- **Complaints** (`/api/complaints`) — Received → Acknowledged →
  Investigation → Decision → Remedy → Verification → Closed/Escalated
- **Documents** (`/api/documents`) — upload/list/download, polymorphic
  (attaches to any party/policy/claim/complaint/insurer), local disk
  storage in dev
- **Workflow cases & tasks** (`/api/cases`, `/api/tasks`) — the generic
  case/task engine required by SOP §9; opportunities, policies, claims,
  complaints and submissions all open a case here rather than inventing
  their own status column
- **Compliance obligations** (`/api/obligations`) — the recurring
  regulatory calendar from SOP-01
- **Audit log** (`/api/audit-log`, read-only) — every write above logs
  a before/after audit event; a failed audit write never blocks the
  business operation it was describing

- **Endorsements & renewals** (`/api/endorsements`, `/api/renewals`) —
  mid-term policy changes (SOP endorsement lifecycle: Requested →
  Information → Terms → Client Approval → Instructed → Issued →
  Checked → Completed, or Declined) and the renewal pipeline, both
  reachable from a policy's own detail screen (see Policy Detail
  below). Tracked as their own records, independent of the policy row,
  so reminder cadence, status history and outcome survive across
  multiple endorsements/renewal cycles of the same policy.
  **Structured taxonomy, not free text**: `endorsement_category` (one
  of five — Financial & Valuation Changes, Coverage Expansions,
  Coverage Restrictions, Contractual & Legal Adjustments,
  Administrative Updates) and `endorsement_type` (~23 specific types
  within them, e.g. `adjust_sum_insured`, `schedule_new_asset`,
  `cancel_policy_midterm`, `correct_legal_name`) are both enforced by
  a DB check constraint and by `POST /api/endorsements` rejecting a
  type that doesn't belong to the chosen category. Each type drives its
  own dynamic form in Policy Detail's Endorse action (same
  data-driven-field pattern as the class-specific risk questionnaire,
  `src/data/endorsementFields.ts`), capturing only what that type
  actually needs into a `before_value`/`after_value` JSONB pair instead
  of one generic description field. Critically, an endorsement is no
  longer purely historical: `PATCH /api/endorsements/:id` setting
  `status: "Completed"` applies the type's real effect once
  (idempotent — re-saving an already-`Completed` endorsement doesn't
  reapply it) and stamps `applied_at` — updating the policy's sum
  insured, deductible, valuation method (including locking in an
  agreed value), premium (rate change or credit), or expiry date;
  setting the policy to `Cancelled` or, for the first time, back to
  `Active` from `Cancelled`/`Lapsed`/`Expired` via a new **Reinstate**
  action on Policy Detail; or correcting the client party's legal name
  or physical address. Coverage-expansion/restriction types (new
  assets, perils, insured parties, sub-limits, riders) are recorded
  with full structured detail for the audit trail but don't yet write
  to a normalized assets/insureds/perils table, since none exists in
  the schema — the Endorsements tab is where they're read back today.
  The policy's own current sum insured/deductible/valuation method now
  live on `policy.policies` itself (`sum_insured_kes`, `deductible_kes`,
  `valuation_method`, `agreed_value_kes`, seeded from the winning
  quotation at bind time), separate from the immutable quotation
  snapshot it was bound from — Cover Details shows both side by side.
- **Policy issuance checking** (`/api/policies/:id/start-check`,
  `/api/policy-checks`, `/api/discrepancies`, Policy Detail's Issuance
  Check tab) — SOP-11: a fixed 7-item checklist (policy number/dates,
  class/subject matter, premium, sum insured/limits, names/interests,
  deductibles/warranties/exclusions, wording/clauses/certificates)
  compared against the placement instruction, plus a discrepancy
  register. `PATCH /api/policies/:id` rejects a `Delivered` status
  update unless every checklist item is `pass` and every discrepancy
  is `corrected`/`waived` — "cannot mark fully issued before check and
  critical discrepancy resolution" is enforced server-side, not left
  to a UI convention a route could bypass. A failed check item flips
  the policy to `Discrepancy` (unless it's already `Active`/
  `Delivered` — a check run late against an in-force policy shouldn't
  retroactively yank its status). Delivery method and client
  acknowledgement timestamp are also tracked here.
- **Commission statement reconciliation** (`/api/commission-statements`,
  `/api/commission-lines`, Finance view) — checks an insurer's own
  commission statement for a period against our own projected
  `commission` `financial_transactions` rows (created when a premium is
  confirmed — see Premium confirmations above). Adding lines to a
  statement and clicking **Reconcile** matches each line to the
  matching policy's pending projection: an amount that agrees (within
  KES 1, to absorb rounding) flips the projection to `matched`; a
  mismatch flips it to `disputed` instead of silently overwriting it,
  and the statement itself lands on `Discrepancy` rather than
  `Auto-Matched`. A policy with no pending projection at all leaves the
  statement on `Manual Review`.

- **General ledger** (`/api/gl-accounts`, `/api/accounting-periods`,
  `/api/journal-entries`, `/api/gl/trial-balance`,
  `/api/gl/income-statement`, `/api/gl/balance-sheet`, Finance's
  General ledger tab) — real double-entry accounting on top of
  `financial_transactions` above, which is a flat cash-event log, not
  a ledger a trial balance can be computed from. A seeded chart of
  accounts (Bank & Cash, Petty Cash, Insurer Premiums Payable,
  Retained Earnings, Commission Income, and Office Expenses split into
  the same eight categories `office_expenses.category` already uses,
  plus Petty Cash Disbursements) backs every journal line. Three
  existing operations auto-post a balanced entry the moment they
  happen — `postJournalEntry()` in server.ts, the same "derived record
  of an already-completed event" relationship the audit log has to
  every other write, so a posting failure never blocks the operation
  it's describing: a **premium confirmation** splits the amount
  received between what's still owed to the insurer and the
  commission the brokerage retains at source; a **petty cash float
  opening** or **replenishment/disbursement** moves money between Bank
  and Petty Cash (or a Petty Cash Disbursements expense); an **office
  expense marked Paid** debits its category's expense account and
  credits Bank (idempotent — re-marking an already-paid expense never
  double-posts). Auto-posting opens the calendar-month accounting
  period itself if none exists yet, so it never depends on someone
  having set up periods in advance; a **manual journal entry** (a bank
  charge, a year-end adjustment) instead requires picking an existing
  *open* period, and is rejected with a 400 if its debit and credit
  lines don't balance to the cent. Posted entries are immutable —
  correcting one means **reversing** it (a compensating entry with
  every line's debit/credit swapped), the same "never edit history"
  rule already used for commission clawbacks and claim reopening.
  **Closing a period** (`gl.period_close` permission — a stronger
  sign-off than day-to-day posting, `gl.manage`, reflecting the SOP
  blueprint's own segregation-of-duties principle) blocks any further
  entry, manual or automatic, from landing in it; closing again, or
  posting into a closed period, is rejected rather than silently
  no-op'd or double-applied. The trial balance and income statement
  are single-period views; the balance sheet is a cumulative
  as-of-date snapshot instead, since assets/liabilities/equity persist
  across periods while income/expense reset each one. Scope boundary:
  period close does not sweep income/expense into Retained Earnings,
  so the balance sheet shows that gap explicitly as "current earnings
  (unclosed)" on the equity side rather than silently folding it in —
  a real closing-entry procedure is a larger piece of work than this
  build covers.

- **Multi-policy payment allocation** (`/api/payments`, Finance's
  Payments & allocation section) — answers "client has 3 policies,
  pays one cheque covering all three": `finance.payments` records the
  money actually received (total amount, method, reference); each
  `POST /api/payments/:id/allocations` call applies part of it to one
  policy via the exact same evidence-gate/ledger/commission-projection
  logic as `POST /api/premium-confirmations` (now a shared
  `confirmPremiumForPolicy` helper), tagging the resulting
  `premium_confirmations` row with `payment_id`. An allocation that
  would exceed the payment's unallocated balance is rejected with a
  400, not silently capped.
- **Premium ageing** (`/api/premium-ageing`, Finance) — outstanding
  premium (policy's `premium_amount` minus its confirmed-so-far total)
  bucketed by days past `premium_due_date` (Current/1-30/31-60/61-90/
  90+). Crossing into the two most overdue buckets auto-creates a
  `collect_outstanding_premium` task against the policy's own case —
  idempotently, so calling the endpoint repeatedly never creates a
  second open task for the same policy.
- **Commission clawback** (`/api/commission-clawbacks`, Finance) — an
  insurer reversal of previously-paid commission (e.g. a cancelled or
  short-rated policy), recorded as its own debit `commission`
  transaction with a reason in `notes`, never by editing the original
  credit row.
- **Internal operating finance** (`/api/petty-cash-floats`,
  `/api/petty-cash-transactions`, `/api/office-expenses`, Finance) —
  the brokerage's own running costs, kept separate from client premium
  and insurer commission money above, which the firm never treats as
  its own. A petty cash float tracks `current_balance_kes` itself
  (not derived on read), so a disbursement that would take it negative
  is rejected at write time rather than allowed and reconciled later.
  Office expenses carry a category, vendor and a
  recorded → approved → paid status.
- **Underwriter query tracker** (`/api/underwriting-queries`,
  Placement) — an insurer's mid-submission information request,
  tracked as its own record instead of living only in an email thread:
  question, required response date, client info required, response.
  Recording a response without an explicit status move auto-advances
  the query to `responded`, so a broker doesn't need two separate
  updates for one action.
- **Structured quote capture** (Placement's quote form/cards) —
  `sales.quotations`' `limits`/`deductibles`/`exclusions`/`warranties`
  JSONB columns existed in the schema from the original build but were
  never read or written by any route; `extensions`/`conditions`/
  `payment_terms`/`special_terms` are new alongside them. All eight are
  now wired through `POST`/`PATCH /api/quotations` and shown on each
  quotation card, so a quote's actual terms (not just sum insured and
  premium) are comparable side by side.
- **Underwriting approval workflow** (`/api/underwriting-approvals`,
  Placement) — an internal sign-off chain for risks outside normal
  appetite (high value, high-risk industry, large discount, unusual
  terms, high commission, adverse claims history): one "request
  approval" action opens all three stages (`team_leader` →
  `senior_manager` → `final`) at once, and a stage can only be decided
  once every earlier stage in the same batch is `approved` — enforced
  server-side, not just button ordering in the UI. Advisory: unlike the
  SOP-23 risk-clearance gate, it does not itself block presenting or
  accepting a recommendation, since which risks actually need this is
  a judgment call, not a fixed rule.
- **Claims escalation dashboard** (`/api/claims-escalation`, Claims'
  Escalation tab) — every open claim's days outstanding, last action
  (from its own timeline), a next-action hint keyed off its stage, and
  an escalation level. Entirely computed from data that already exists:
  age drives the level (watch at 7 days, escalate at 14, critical at
  30), but a red-priority or fraud-flagged claim escalates regardless
  of age.
- **Coverage verification checklist** (`/api/coverage-verification-items`,
  Claim Detail's Coverage Check tab) — a fixed pre-submission checklist
  (policy active at loss date, loss within period, asset listed,
  premium paid, within limit, excess identified, no exclusion applies)
  distinct from the documents checklist: this checks the policy itself,
  not the paperwork supporting it. Purely informational — unlike the
  SOP-16 settlement gate, it doesn't block any status transition, since
  a broker may reasonably submit before every item is confirmed.

- **Client accounts** (`/api/client-accounts`, Client Profile's
  Overview tab) — segment, branch, service tier and its own KYC status
  (separate from a Party's own `status` field). One account per party;
  a corporate party's directors and authorized signatories are
  separate Relationship rows, not separate accounts.
- **Onboarding KYC document checklist** (`/api/kyc-checklist-items`,
  Client Profile's KYC tab) — `POST /api/parties` auto-seeds the
  requisite documents for that party's type the moment it's created:
  individual (National ID/Passport, KRA PIN) or corporate (Certificate
  of Incorporation, KRA PIN, CR12, directors' IDs, tax compliance
  certificate) — plus any ad-hoc item a broker adds for a specific
  client. Uploading a file for an item creates the actual
  `docs.documents` row (`documentType: 'kyc'`) and links it back via
  `documentId`, moving the item to `received`; a staff member then
  marks it `verified` or `waived`. Both `POST` and `PATCH
  /api/client-accounts` reject `kycStatus: 'approved'` with a 400
  (listing exactly which document types are still outstanding) unless
  every checklist item for that party is `verified` or `waived` — the
  same "companion checklist + status-transition guard" pattern as the
  SOP-11 policy issuance checklist and the claims coverage-verification
  checklist, so KYC approval can't be reached by picking a dropdown
  value alone.
- **Correspondence & notifications** (`/api/correspondence-templates`,
  `/api/notifications`, the Correspondence nav item, and the Client
  Profile's Communications tab) — `comms.correspondence_templates` is
  the wording behind a system message (code, area, channel, subject,
  body); editing the body bumps the template's version so a
  notification already sent stays traceable to the wording it actually
  went out with, rather than silently inheriting a later edit. Queuing
  a notification against a party renders no further than picking a
  template — there is **no real email/SMS/WhatsApp gateway wired up**
  in this dev build, so "sent" only means a staff member marked it
  dispatched; the data model and workflow are real, the transport
  isn't. That's a deliberate scope boundary, not an oversight — wiring
  an actual provider (SES/SNS, Africa's Talking, Twilio, etc.) is a
  separate, larger piece of work with its own credentials and
  reliability concerns.

- **HR** (`/api/staff`, `/api/roles`, `/api/employees`,
  `/api/leave-types`, `/api/leave-balances`, `/api/leave-requests`,
  `/api/performance-reviews`, the HR nav item) — the blueprint treats
  an "employee record" as distinct from a "user account"; `hr.employees`
  is a 1:1 HR extension of an `access.staff` login (job title,
  department, branch, employment type/status, hire/termination dates,
  national ID, KRA PIN, emergency contact, base salary), not a
  replacement for it. There was no staff CRUD anywhere in this build
  before now — creating an employee here creates the backing staff
  login in the same action (password optional: the blueprint's model
  allows an employee to exist without system access). **Leave**
  balances are tracked per staff+leave type+year (annual/sick/
  maternity/paternity/compassionate/unpaid, seeded with Kenyan
  Employment Act-inspired defaults) and only change on an explicit
  decision, never by summing requests on read: approving a request
  increments `used_days` after checking `allocated + carried_over -
  used` actually covers the days requested (rejected with a 400
  otherwise, auto-creating that year's balance row from the leave
  type's default allocation if none exists yet); cancelling a
  previously-approved request gives the days back. A fixed transition
  table (`requested` → `approved`/`rejected`/`cancelled`, `approved` →
  `cancelled` only) rejects anything else, e.g. reopening a rejected
  request. **Performance reviews** move `draft` → `submitted` →
  `acknowledged`: content edits and submitting need the
  `performance_review.manage` permission (the reviewer/supervisor's
  action), but acknowledging needs none, since that's the reviewee
  confirming they've read it, not a managerial decision. **Terminating**
  an employee (`employmentStatus: 'terminated'`) revokes their staff
  login (`active: false`); moving them back to `active` restores it —
  the same reverse-effect pattern as the endorsement Reinstate action.
  Recruitment/candidates, payroll/payslips, attendance/timesheets and
  training are deliberately out of scope for this pass: each is a
  substantial module in its own right (payroll alone needs statutory
  deduction tables and its own General Ledger postings), not a
  gap-filling addition to what's here.

- **Producers & sub-brokers** (`/api/producers`,
  `/api/producer-commission-splits`, the Producers nav item) — the
  blueprint's "Agency, Producer & Sub-Broker Management": an external
  agent or sub-broker who introduces business, earning a negotiated
  share of the commission the brokerage earns on it. No separate
  contracts or targets tables — contract essentials (IRA licence
  number, split %, contract dates) live on the producer row itself,
  and "premium YTD vs target" is a derived read against
  `policies.premium_amount`, not a stored figure. `opportunities` and
  `policies` both carry an optional `producer_id`; binding a policy
  from a placement chain (`POST /api/policies` with a `quotationId`)
  inherits the producer from the opportunity that started it
  (quotation → submission → risk → opportunity) automatically, since
  there's no separate UI step to re-pick one at bind time. When
  premium is confirmed for a policy with a producer attached,
  `confirmPremiumForPolicy` computes the split
  (`commission × producer.commissionSplitPct`), records it as its own
  payable (`finance.producer_commission_splits` — kept separate from
  `commission_statements`/`commission_lines` above, which reconcile
  the insurer's own statement in full; this tracks our internal
  distribution of the share we keep) and reduces the GL's Commission
  Income line by exactly that amount, crediting a new liability
  account (`2010 Producer Commissions Payable`) instead — so
  recognized income already reflects the real net share, not the
  gross commission received. **Paying** a split
  (`POST .../:id/pay`, `producer.manage` permission) clears that
  liability against Bank & Cash and is rejected if already paid.

(Reinsurance isn't actually a separate module in the schema, just an
`insurer_type` value on `product.insurers` — an earlier version of
this note listed it as a pending module by mistake.)

## Screens from the wireframe spec

`Insurance_Brokerage_System_Wireframe_and_UI_Specification.docx`
describes several screens; all four are now built, though a few of
their finer details (below) are still open.

- ~~**Client Profile**~~ — done: clicking a party in the Parties list
  opens a 360° profile (`src/components/PartyProfileView.tsx`) with
  tabs for Overview (now also showing the client account — segment,
  branch, service tier, KYC status), Policies, Opportunities, Claims
  (cross-referenced through the client's policies), Complaints,
  Contacts, Communications and Documents — the wireframe's design
  principle #1, "one client record." Contacts (`/api/relationships`)
  records the edges in the party graph — directors, beneficial owners,
  authorized signatories, dependants — either against another Party
  record or, more often in practice, just a free-text designation
  ("Daughter, age 12") when the related person isn't a client in their
  own right. Communications combines a manually logged call/email/sms/
  whatsapp/visit/portal contact (`/api/interactions`) with the
  platform's own system-sent notifications (`/api/notifications`,
  templates managed under the Correspondence nav item) in the same
  tab. ~~History~~ (wireframe §7.2) is done too — it correlates
  `compliance.audit_log` across every entity type tied to the party
  (the party's own row, its policies, opportunities, claims,
  complaints, endorsements and renewals), not just events on the
  party's own record, sorted into one chronological timeline. Doesn't
  yet reach into the risk → submission → recommendation chain (a
  recommendation's audit trail isn't correlated back to the party that
  owns the opportunity behind it) — that would need walking party →
  opportunity → risk → submission → recommendation, one join deeper
  than the rest of History's direct party → entity links.
- ~~**Policy Detail**~~ — done: clicking a policy in the Policies list
  opens `src/components/PolicyDetailView.tsx` (wireframe §9.2) with
  tabs for Summary, Cover Details (the policy's own current sum
  insured/deductible/valuation method, alongside the immutable
  quotation-as-bound snapshot: commission rate, PCF/ITL/stamp duty),
  **Endorsements** (every endorsement against the policy with its
  category-aware type label, premium adjustment, effective date and a
  status-progression dropdown), Documents, Transactions (premium
  confirmations + financial transactions) and History (a chronological
  feed of endorsements, renewals and premium confirmations). Endorse
  opens a category → type → dynamic-fields form (see Endorsements
  above) that posts to `/api/endorsements`; Renew posts to
  `/api/renewals`; Cancel sets the policy to `Cancelled` directly, and
  a **Reinstate** action (shown only when the policy is Cancelled/
  Lapsed/Expired) records a `reinstate_lapsed_coverage` endorsement and
  immediately completes it, returning the policy to `Active`. Actions
  are hidden once a policy is Cancelled/Expired/Lapsed, except
  Reinstate, which only shows in exactly that state.
- ~~**Renewals workspace**~~ — done: `src/components/RenewalsView.tsx`
  (wireframe §12.2 / SOP §12.2), a new top-level "Renewals" nav item.
  Every Active policy expiring within 90 days is grouped into Overdue /
  0-30 / 31-60 / 61-90-day buckets; a policy with no `policy.renewals`
  row yet shows "Not started" with an **Open renewal case** action, and
  once a case exists its status (`upcoming`/`quoted`/`confirmed`/
  `lapsed`) is editable inline and a **Send reminder** action tracks
  `reminderCount`/`lastReminderAt`. Clicking a policy opens the same
  `PolicyDetailView` as the Policies list. Prior-year premium and
  claims experience aren't shown yet — that needs the renewal to carry
  a reference back to the expiring policy's own claims history, not
  just its ID.
- ~~**Quote Comparison screen**~~ — done: Placement's quotation table
  (`src/components/PlacementView.tsx`) is now the wireframe's (§8.3)
  side-by-side insurer-card layout, one card per quotation (sum
  insured, base premium, levies, total premium, commission), each with
  its own **Select** / **Reject** / **Request clarification** actions
  instead of a compare-checkbox column. Select pre-fills the
  recommendation form with this quotation plus every other still-active
  (non-declined) one, so the broker only has to add reasons/disclosures;
  Reject sets that single quotation to `declined` (`sales.quotations`
  already had this status — no schema change needed) and the card
  greys out with its actions hidden; Request clarification bumps the
  *submission's* status to `Clarification` (there's no per-quotation
  clarification state in the schema, and the submission already has
  this as a valid SOP stage, so it was reused rather than adding a
  column for a single insurer-card button).

> **Note for anyone extending this further:** when a column has a
> Drizzle `.default(...)` that isn't `defaultNow()`, confirm the actual
> SQL column in `database/schema.sql` has a matching `DEFAULT` clause,
> or set the value explicitly in the insert. One of these
> (`recommendations.client_decision`) was declared as a Drizzle-only
> default and silently inserted `NULL` instead of `'pending'` until an
> explicit value was added to the `POST /api/recommendations` handler.

> **Note on rate vs. tax:** `insurer_rate_versions` originally carried
> PCF/ITL/stamp-duty columns alongside the negotiated commission rate,
> which modeled a statutory, government-mandated charge as if it were
> something each insurer could set independently. It isn't — PCF,
> Insurance Training Levy and stamp duty are fixed by the Insurance
> Act/IRA for the whole market. They were split out into
> `product.statutory_levies` (`database/migrate-004-statutory-levies.ts`),
> keyed by levy type + class (nullable = "every class") + effective
> date, independent of any insurer.

## Auth

Two ways to call the API, answering two different questions:

- **Staff session** (`POST /api/auth/login` → JWT signed with
  `JWT_SECRET`, sent as `Authorization: Bearer <token>`) — "which staff
  member is this?" This is what the dashboard uses, and it needs **no API
  key**. The token carries only the staff id; every request re-reads the
  staff record, so deactivating or terminating someone cuts off access
  immediately and a role change applies on the next call. Used for
  audit-trail attribution (`actorId()`) and RBAC (`requirePermission()` /
  `hasPermission()`). An invalid or expired token is rejected outright.
- **`x-api-key`** (`INTERNAL_API_KEY`) — "is this an approved server?" For
  the external quote-generator app only, which has no staff session. A
  key-only caller can reach just `GET/POST /api/parties`,
  `PATCH /api/parties/:id` and the same three on `/api/policies`
  (`SERVICE_CALLER_ROUTES` in `server.ts`); every other route answers 401
  without a staff session. The key is never sent from the browser, so it is
  not in the client bundle.

Public: `GET /api/health` (also checks the database) and
`POST /api/auth/login` (rate-limited: 10 failed attempts per 15 minutes per IP).

### Permissions

Every route is either open to any signed-in staff member (day-to-day CRM
work) or gated by a permission. A caller without a session holds no
permissions. Roles: admin (everything), underwriter, claims_officer,
accountant, supervisor, sales_agent.

| Permission | Gates | Roles |
|---|---|---|
| `finance.record` | payments, allocations, premium confirmations, clawbacks, petty cash, office expenses | admin, accountant |
| `finance.view` | GL, journals, trial balance, petty cash, office expenses (and the Finance menu) | admin, accountant, supervisor |
| `gl.manage` / `gl.period_close` | chart of accounts, manual journals / closing a period | admin, accountant / admin, supervisor |
| `commission_statement.reconcile` | commission statements, lines, reconciliation | admin, accountant |
| `claim.decide` | claim decision stages, reserve and payment lines, manager review, reopen | admin, claims_officer |
| `insurer_rate.manage` | insurers (create/edit/delete), rates, levies, appetite, products | admin, underwriter |
| `underwriting.approve` | deciding an underwriting approval stage (not your own request) | admin, underwriter, supervisor |
| `recommendation.decide` | client decision on a recommendation, risk clearance | admin, supervisor |
| `obligation.manage` | compliance obligations | admin, supervisor |
| `employee.manage` | staff and employee records, and seeing salary/ID numbers | admin |
| `leave.decide`, `performance_review.manage` | leave decisions (never your own), review management | admin, supervisor |
| `producer.manage` | producers and commission payouts | admin, accountant |
| `audit.view` | the audit log | admin |
| `document.restricted` | documents marked restricted | admin, supervisor |

Other rules enforced in code: staff request leave only for themselves,
only the requester or an approver cancels it, only the reviewee
acknowledges a performance review, reviews are visible only to the
reviewee, the reviewer and review managers, and salary / national ID / KRA
PIN are hidden from everyone but HR and the employee. `tests/api/permissions.test.ts`
is the executable version of this table.

Three dev logins ship seeded (password `ChangeMe123!` — change it, and the
bcrypt hash, before this points at anything but a local dev database):

| Email | Role |
|---|---|
| `amina@utmostbrokers.co.ke` | Admin |
| `peter@utmostbrokers.co.ke` | Underwriter |
| `grace@utmostbrokers.co.ke` | Claims Officer |

The dashboard (`src/useAuth.ts`, `src/components/LoginView.tsx`) gates
the whole app behind a login screen, persists the session token in
`localStorage`, and shows the signed-in staff member + a sign-out
button in the sidebar footer.

### Production checklist

With `NODE_ENV=production` the server **refuses to start** unless
`JWT_SECRET` and `INTERNAL_API_KEY` are random values of 32+ characters
(the `dev-only-change-me` placeholders are rejected) and `ALLOWED_ORIGIN`
is set. Generate secrets with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Set `TRUST_PROXY` to the number of proxy hops in front of the server so the rate limits see real client IPs. Responses carry
`helmet` security headers (including a Content-Security-Policy), uploaded files
are served as downloads with a safe content type, and every request logs one
JSON line (method, path, status, ms, staff id) to stdout.

## Website API (`/api/site/*`)

The public quote site (`../studio`) is a static front end; this server is its only
backend, reached on a subdomain of the main domain (`api.<domain>`). `site/router.ts` holds what used to be the studio app's own Express
server: the quote engine, the AI room analyser / advisor chat / claims assistant,
lead email and OTP, claim intake, and the rates desk. It is mounted in `server.ts`
before the dashboard's middleware, with its own body parser (large photo uploads)
and **per-endpoint rate limits** — AI and email endpoints cost real money, so e.g.
OTP requests are capped at 5 per 10 minutes per IP and AI calls at 20.

- **Public** (no login): `GET /insurers`, `GET /insurer-logos`, `POST /generate-quotes`,
  `/other-line-quotes`, `/quote-selected`, `/quotes`, `/cover-notes`, `/auth/send-otp`,
  `/auth/verify-otp`, `/analyze-room`, `/insurance-advisor-chat`, `/claims-assistant`,
  `/claims-photo-review`, `/submit-claim`, and the uploaded logo files at `/files/logos/*`.
- **Staff** (the dashboard's JWT; sign in at `POST /api/site/staff/login` with an ERP
  email + password): the rates desk, insurer admin and logo upload/delete need
  `insurer_rate.manage`; the audit register needs `audit.view`; the claims, room-scan
  and staff-directory reads need any staff login.
- The studio app's old open endpoints (list every party, policy, claim, quote,
  complaint, endorsement...) and its hard-coded shared-password staff accounts were
  **not carried over** — nothing used them and they exposed client data to anyone.
- **One database, no files.** The website's state lives in the same PostgreSQL database as
  the ERP: insurers in `product.insurers` (the website's short id, display name, rating and
  public profile are columns on the ERP's own insurer register — there is no second insurer
  list), versioned premium rate tables in `product.premium_rate_versions`, statutory levies in
  `product.statutory_levies`, staff-uploaded logos in `product.insurer_logos`, claims in
  `claims.claims` (a customer's notification *is* an ERP claim, linked to the policy when the
  number matches), the audit trail in `compliance.audit_log`, and what only the public site
  captures (quotes, cover-note and other-line requests, room scans, OTP codes) in `site.*`.
  The quote engine reads its insurers, rates and levies from those tables on every request; the
  rates desk writes new versions to them (the live version is retired, never overwritten). The
  one-time load of the original data is `database/migrate-023-website-data.ts`, fed by
  `database/seeds/*.json` — seed files only; nothing reads or writes a data file at runtime.
- `GET /api/site/config` serves the quote-engine settings the front end needs (product-line
  categories, medical age bands), and `GET /api/site/insurers` the insurer profiles, so the site
  bundles no copy of either.
- `tests/api/site.test.ts` replays quote requests and compares the engine's output with
  output captured from the old studio server, so the move is provably behaviour-identical.

## Database migrations

`npm run db:migrate:all` applies `database/schema.sql` and then every
`migrate-NNN-*.ts` in order, recording each in `public.schema_migrations` so
it runs once per database. On a database that was migrated by hand with the
older per-script commands, run `npm run db:migrate:all -- --baseline` once
to record them all as applied without re-running anything. `schema.sql` is a
full snapshot for fresh installs; the numbered scripts upgrade existing
databases and are idempotent.

## Tests

`npm test` (Vitest) boots the real Express app against an embedded Postgres
(PGlite) built from `schema.sql` plus every migration — so it also proves a
fresh install works. Set `TEST_DATABASE_URL` to a PostgreSQL server (e.g.
`postgres://uib:uib_dev_password@localhost:5432/postgres` after `docker compose up -d`) and the
same suite runs against that real server instead — each test file gets its own database cloned
from a migrated template. CI runs both. The database is built once and cached in
`database/.pgdata-test-template` (rebuilt automatically when schema or
migrations change); each test file gets its own copy, so files run in
parallel and never touch your dev data.

- `tests/unit/` — list helpers (paging, search matching)
- `tests/api/auth.test.ts` — API-key rules, login, forged/expired tokens, instant revocation, rate limit
- `tests/api/permissions.test.ts` — the role × route permission matrix (276 cases)
- `tests/api/finance.test.ts` — premium → commission → producer split → balanced ledger, journal validation, id uniqueness under concurrency
- `tests/api/hr-and-documents.test.ts` — leave and review rules, salary redaction, restricted/unsafe documents
- `tests/api/pagination.test.ts` — server-side paging and search
- `tests/api/site.test.ts` — the website API: quote-engine output vs the old server, staff auth and permissions, removed endpoints, logo handling
- `tests/api/site-database.test.ts` — the website's data really lives in the one database: insurer register, versioned rate tables, levies, quotes, OTP codes, claims, audit trail

CI (`.github/workflows/ci.yml`) runs type-check, tests, build and a production
dependency audit on every push and pull request.
