# Demo database: a guided tour

A self-contained, realistic data set for previews and training. **Kenya shillings, Nairobi time**
(the tenant's published configuration is `KES` / `Africa/Nairobi` / `en-KE`; the build script refuses to
finish if it is anything else). It is completely separate from your development data.

```bash
npm run demo          # from the repo root: builds it on first use, then runs the ERP (3101) and the website (3000)
npm run demo:reset    # throw it away and rebuild it
```

* ERP dashboard: http://localhost:3101  ·  public website + client portal: http://localhost:3000
* The demo runs on **port 3101** so it can run beside the normal dev server on 3100. Its data lives in
  `ERP/database/.pgdata-demo` (git-ignored). Resetting never touches `.pgdata-embedded`, your real dev database.
* Everything was created through the application's own API by the staff who would really do each step, so
  the data obeys the same rules as live data. Timestamps were then spread over the last few weeks so charts,
  statements and ageing have history.

## Who can sign in

Staff (password for all: `ChangeMe123!`)

| Person | Email | Role | Try this |
|---|---|---|---|
| Amina Hassan | amina@utmostbrokers.co.ke | Admin | Everything, including Settings |
| Faith Wambui | faith@utmostbrokers.co.ke | Accountant | Records receipts, raises invoices, allocates |
| David Mutua | david@utmostbrokers.co.ke | Supervisor | Approves or rejects receipts |
| Peter Otieno | peter@utmostbrokers.co.ke | Underwriter | Placement, insurer rates |
| Lucy Chebet | lucy@utmostbrokers.co.ke | Underwriter (desk) | A focused menu: no finance, HR or settings |
| Grace | grace@utmostbrokers.co.ke | Claims officer | Claims |
| Brian Odhiambo | brian@utmostbrokers.co.ke | Sales agent | CRM only |

One account per role, for testing (same password, `ChangeMe123!`). The `.test` domain is reserved, so mail to these can never reach a real inbox. `npm run test-users` creates them in any local ERP and prints each one's menu.

| Role | Email | Menu |
|---|---|---|
| Administrator | test.admin@utmostbrokers.test | All 19 screens |
| Accountant | test.accountant@utmostbrokers.test | CRM, underwriting, claims, Finance, Receipts |
| Finance supervisor | test.supervisor@utmostbrokers.test | As accountant, plus Settings |
| Underwriter | test.underwriter@utmostbrokers.test | CRM, underwriting, claims, compliance |
| Underwriter (desk) | test.deskunderwriter@utmostbrokers.test | Focused: no finance, HR, settings |
| Claims analyst | test.claims@utmostbrokers.test | Claims and servicing |
| Operations | test.operations@utmostbrokers.test | Policies, renewals, claims, complaints, obligations |
| HR officer | test.hr@utmostbrokers.test | Dashboard, tasks, HR |
| Sales agent | test.sales@utmostbrokers.test | CRM and placement |

Clients (portal password for both: `Demo-Portal-2026`), at the website's **Customer Portal**

* hazel@example.co.ke (Hazel Njeri Kuria)
* accounts@otienologistics.example (Otieno Logistics Ltd)

Sign in as different people to see how the same data looks to each role: the menu, and what each is allowed to do.

## The scenarios (Receipts & allocation, Invoices, Analytics)

Each client demonstrates one rule. Open **Receipts & allocation** and click the receipt number.

| Client | What to look at | The rule it shows |
|---|---|---|
| **Hazel Njeri Kuria** | RCT-2026-000001 (cheque 004512, KES 70,000) | A cheque moves received, deposited, cleared. Only when it **clears** is it allocated, **oldest invoice first**: one invoice paid in full, the next part-paid. |
| | RCT-2026-000002 (cheque 004513, KES 25,000) | A **bounced** cheque: allocations, commission and ledger entries are reversed and a **KES 1,500 returned-cheque fee** is invoiced. The History shows every step. |
| **Otieno Logistics Ltd** | One large **overdue** fleet invoice; two M-Pesa payments | Part payments, overdue ageing (Analytics → Overdue premium), and an **agent's 30% commission split** (Producers). |
| **Amani Dental Clinic** | RCT-2026-000005 (bank, KES 150,000) | An **overpayment** waits in **suspense** until staff decide. A manual allocation (Preview, then Apply) has already placed part of it; the rest is still held. |
| **Peter Mwangi Njoroge** | RCT-2026-000006 (cash, KES 10,000) | A small payment covering only **part** of the oldest invoice. |
| **Kilimani Pharmacy Ltd** | RCT-2026-000007 (bank, KES 40,000) | An overpayment kept as **client credit** (after configuration v3). It paid the next invoice **automatically** the moment it was raised. |
| **Rift Valley Fresh Produce / Nyeri Tea Traders** | Filter **Awaiting approval** | **Maker-checker** (after configuration v4): Faith recorded them, so they are **not money yet**. Sign in as David (supervisor) to approve or reject. Faith cannot approve her own. One duplicate was already rejected, with a reason. |

Things to try as David: approve the Rift Valley M-Pesa receipt and watch it clear, allocate and reduce what the client
owes. **Print receipt** on any receipt shows the controlled document: amount in words, ORIGINAL then DUPLICATE copies,
and a "not valid" banner for anything that is not yet real money.

## Settings: how the business rules changed over time

Sign in as Amina, then **Settings → Version history** shows four configuration versions:

1. v1 Kenya region pack (KES, Nairobi, levies added on top of the premium).
2. v2 Returned-cheque fee of KES 1,500.
3. v3 Overpayments kept as client credit.
4. v4 Receipts need a second person's approval.

Every receipt and invoice keeps the version it was created under, so history never changes when the rules do.
Open a receipt: its figures were produced by the rules in force when it was recorded.

## What the numbers add up to

* **Analytics** (as Amina or Faith): cleared receipts, premium billed, collection rate, overdue premium, suspense balance,
  commission earned and returned cheques, with weekly trends. Days are Nairobi days.
* **Finance → Journal entries / Trial balance**: every receipt and allocation is a balanced double-entry posting
  (cash, unallocated receipts, insurer premiums payable, commission income, levies payable, fee income).
* **Client portal** (as Hazel): her own balance, invoices (with their levy lines), payments, policies and a statement
  whose last line is what she owes. Another client's records are invisible to her.

## Notes

* The demo uses a fixed password so it is easy to share. Never use these accounts or passwords with real data.
* Receipts dated in the past were back-dated after creation (the money tables are append-only, so the build lifts
  that protection for this one pass and restores it). Ledger entries are dated on the day the demo was built.
* Resetting rebuilds the same story with new ids and dates relative to "today".
