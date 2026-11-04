// ---------------------------------------------------------------------------
// Builds the DEMO database: a self-contained, realistic data set for previews and
// training, in Kenya shillings and Nairobi time. It is separate from the real
// development database (database/.pgdata-demo, never database/.pgdata-embedded).
//
//   npm run demo:build        build it if it does not exist yet
//   npm run demo:reset        throw it away and build it again
//   npm run demo              build if needed, then run the ERP on it  (repo root: npm run demo for the site too)
//
// Everything is created through the application's own API (as the staff members
// who would really do each step), so the data obeys the same rules as live data:
// cheques really clear, bounce and reverse; allocations really follow the
// tenant's rules; commission and the ledger are real postings. Afterwards the
// timestamps are spread over the last few weeks so charts and statements have history.
// ---------------------------------------------------------------------------
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TEST_PASSWORD, TEST_USERS } from "./test-users-roster";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_DIR = path.join(root, "database", ".pgdata-demo");
const MARKER = path.join(DEMO_DIR, ".demo-seeded");
const reset = process.argv.includes("--reset");

export const DEMO_STAFF_PASSWORD = "ChangeMe123!";
export const DEMO_PORTAL_PASSWORD = "Demo-Portal-2026";

if (!reset && fs.existsSync(MARKER)) {
  console.log("Demo database is already built (npm run demo:reset rebuilds it).");
  process.exit(0);
}

// ---- 1. an empty database, fully migrated
fs.rmSync(DEMO_DIR, { recursive: true, force: true });
console.log("Building the demo database (migrations)…");
const migrated = spawnSync(process.execPath, ["--import", "tsx", path.join(root, "database", "migrate-all.ts")], {
  cwd: root, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, PGLITE_DEV: "true", PGLITE_DATA_DIR: DEMO_DIR },
});
if (migrated.status !== 0) throw new Error("Could not migrate the demo database.");

// ---- 2. the real application, in this process, on that database
process.env.PGLITE_DEV = "true";
process.env.PGLITE_DATA_DIR = DEMO_DIR;
process.env.VITEST = "1"; // do not bind the dashboard port; no request logging
const { app } = await import("../server");
const server = await new Promise<import("http").Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
const base = `http://127.0.0.1:${(server.address() as import("net").AddressInfo).port}/api`;

async function call(method: string, p: string, o: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<any> {
  const res = await fetch(base + p, {
    method,
    headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...o.headers },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 300)}`);
  return json;
}
const tryCall = (...a: Parameters<typeof call>) => call(...a).catch(() => null);

const KES = (major: number) => Math.round(major * 100);
const dayStr = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
let seq = 0;
const key = (what: string) => `demo-${what}-${++seq}`;

// ---- 3. people: the staff who do each job
const admin = (await call("POST", "/auth/login", { body: { email: "amina@utmostbrokers.co.ke", password: DEMO_STAFF_PASSWORD } })).token as string;
const staffSpecs = [
  { fullName: "Faith Wambui", email: "faith@utmostbrokers.co.ke", roleId: "accountant", jobTitle: "Accountant", department: "Finance" },
  { fullName: "David Mutua", email: "david@utmostbrokers.co.ke", roleId: "supervisor", jobTitle: "Finance Supervisor", department: "Finance" },
  { fullName: "Brian Odhiambo", email: "brian@utmostbrokers.co.ke", roleId: "sales_agent", jobTitle: "Sales Agent", department: "Sales" },
  { fullName: "Lucy Chebet", email: "lucy@utmostbrokers.co.ke", roleId: "underwriter_desk", jobTitle: "Underwriter", department: "Underwriting" },
];
for (const s of staffSpecs) {
  await call("POST", "/staff", { token: admin, body: { ...s, password: DEMO_STAFF_PASSWORD, branch: "Nairobi HQ", employmentType: "full_time", hireDate: "2025-03-01" } });
}
// one test account per role as well (see scripts/test-users.ts), so the demo can be explored as any kind of user
for (const u of TEST_USERS) {
  await call("POST", "/staff", { token: admin, body: { fullName: u.fullName, email: u.email, roleId: u.roleId, password: TEST_PASSWORD, jobTitle: u.jobTitle, department: u.department, branch: "Nairobi HQ", employmentType: "full_time", hireDate: "2025-03-01" } });
}
const login = async (email: string) => (await call("POST", "/auth/login", { body: { email, password: DEMO_STAFF_PASSWORD } })).token as string;
const faith = await login("faith@utmostbrokers.co.ke"); // accountant: records receipts, raises invoices
const david = await login("david@utmostbrokers.co.ke"); // supervisor: approves receipts

// ---- 4. the demo is in Kenya shillings and Nairobi time — check, do not assume
const effective = await call("GET", "/config/effective", { token: admin });
if (effective.regional.currency !== "KES" || effective.regional.timeZone !== "Africa/Nairobi") {
  throw new Error(`Demo must be KES / Africa/Nairobi, but the tenant is ${effective.regional.currency} / ${effective.regional.timeZone}`);
}

// ---- 5. insurers, commission and an introducing agent
const insurers: any[] = await call("GET", "/insurers", { token: admin });
const pick = (re: RegExp, fallback: number) => insurers.find((i) => re.test(i.name)) ?? insurers[fallback];
const jubilee = pick(/jubilee/i, 0);
const cic = pick(/\bcic\b/i, 1);
const apa = pick(/\bapa\b/i, 2);
const RATES: Record<string, number> = { "07": 10, "08": 10, "03": 12, "04": 15, "05": 12, "06": 12 };
for (const ins of new Set([jubilee, cic, apa])) {
  for (const [category, commissionRatePct] of Object.entries(RATES)) await tryCall("POST", "/insurer-rates", { token: admin, body: { insurerId: ins.id, category, commissionRatePct } });
}
const agent = await call("POST", "/producers", { token: admin, body: { producerType: "agent", name: "Kamau & Associates Agency", contactPerson: "Joseph Kamau", phoneNumber: "0722 410 118", commissionSplitPct: 30 } });

// ---- helpers for the story
const clients = new Map<string, string>();
async function client(name: string, type: "individual" | "corporate", phone: string, county: string) {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.co.ke`;
  const id = (await call("POST", "/parties", { token: admin, body: { fullName: name, partyType: type, phoneNumber: phone, email, county } })).id as string;
  clients.set(name, id);
  return id;
}
async function policyWithInvoice(token: string, clientId: string, insurer: any, cls: string, netKes: number, opts: { issue: number; due: number; producer?: boolean }) {
  const policy = await call("POST", "/policies", { token: admin, body: { clientId, insurerId: insurer.id, category: cls, premiumAmount: netKes, endDate: dayStr(300), ...(opts.producer ? { producerId: agent.id } : {}) } });
  const invoice = await call("POST", "/invoices", { token, body: { kind: "premium", policyId: policy.id, amountMinor: KES(netKes), issueDate: dayStr(opts.issue), dueDate: dayStr(opts.due) } });
  return { policy, invoice };
}
const receipt = (token: string, clientId: string, kes: number, method: string, daysAgo: number, extra: Record<string, unknown> = {}) =>
  call("POST", "/receipts", { token, headers: { "Idempotency-Key": key("receipt") }, body: { clientId, amountMinor: KES(kes), method, receivedAt: ago(daysAgo), ...(method === "cheque" ? { instrumentNo: extra.cheque } : {}), ...extra, cheque: undefined } });
const act = (token: string, id: string, action: string, body: unknown = {}) => call("POST", `/receipts/${id}/${action}`, { token, body });
async function publish(note: string, finance: Record<string, unknown>) {
  await call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", note, overrides: { brand: { displayName: "Utmost Insurance Brokers" }, finance } } });
  await call("POST", "/config/draft/publish", { token: admin });
}
const FEE = KES(1500);

// ---------------------------------------------------------------------------
// The story. Configuration changes over time (versions 2-4), each receipt keeps the
// version it was created under, and every scenario shows one rule of the system.
// ---------------------------------------------------------------------------
console.log("Seeding the story…");
await publish("Returned-cheque fee introduced (KES 1,500)", { returnedChequeFeeMinor: FEE });

// A. Hazel — one cheque pays several invoices oldest-first; a second cheque bounces and costs a fee
const hazel = await client("Hazel Njeri Kuria", "individual", "0712 345 678", "Nairobi");
const hazelInvoices = [];
for (const [net, due] of [[50_000, 10], [40_000, 20], [30_000, 30]] as const) hazelInvoices.push(await policyWithInvoice(faith, hazel, jubilee, "07", net, { issue: -30, due }));
const chq1 = await receipt(faith, hazel, 70_000, "cheque", 21, { cheque: "004512", drawerBank: "Equity Bank" });
await act(faith, chq1.id, "deposit");
await act(faith, chq1.id, "clear");
const chq2 = await receipt(faith, hazel, 25_000, "cheque", 8, { cheque: "004513", drawerBank: "KCB" });
await act(faith, chq2.id, "deposit");
await act(faith, chq2.id, "bounce", { note: "Refer to drawer" });

// B. Otieno Logistics — an overdue fleet policy, paid down in two M-Pesa instalments; an agent earns a split
const otieno = await client("Otieno Logistics Ltd", "corporate", "0733 220 904", "Mombasa");
await policyWithInvoice(faith, otieno, cic, "08", 850_000, { issue: -75, due: -45, producer: true });
await receipt(faith, otieno, 300_000, "mpesa", 15, { reference: "SJK2L8M9QX" });
await receipt(faith, otieno, 250_000, "mpesa", 6, { reference: "SKB7T2LQ4P" });

// C. Amani Dental — an overpayment waits in SUSPENSE until staff decide; they allocate part of it by hand
const amani = await client("Amani Dental Clinic", "corporate", "0720 118 332", "Nairobi");
await policyWithInvoice(faith, amani, apa, "05", 120_000, { issue: -20, due: -5 });
const overpay = await receipt(faith, amani, 150_000, "bank", 12, { reference: "TRF-88213" });
const amaniSecond = await policyWithInvoice(faith, amani, apa, "03", 20_000, { issue: -3, due: 25 });
await call("POST", `/receipts/${overpay.id}/allocations`, { token: faith, headers: { "Idempotency-Key": key("manual") },
  body: { strategy: "manual", manual: [{ invoiceId: amaniSecond.invoice.id, amountMinor: amaniSecond.invoice.total.amountMinor }] } });

// D. Peter Mwangi — a small cash payment covers only part of the oldest invoice
const peter = await client("Peter Mwangi Njoroge", "individual", "0715 662 019", "Kiambu");
await policyWithInvoice(faith, peter, jubilee, "07", 35_000, { issue: -14, due: 5 });
await policyWithInvoice(faith, peter, jubilee, "03", 18_000, { issue: -14, due: 15 });
await receipt(faith, peter, 10_000, "cash", 3);

await publish("Overpayments now kept as client credit", { returnedChequeFeeMinor: FEE, overpaymentTreatment: "client_credit" });

// E. Kilimani Pharmacy — an overpayment becomes CLIENT CREDIT and pays the next invoice by itself
const kilimani = await client("Kilimani Pharmacy Ltd", "corporate", "0701 334 556", "Nairobi");
await policyWithInvoice(faith, kilimani, cic, "04", 30_000, { issue: -10, due: 4 });
await receipt(faith, kilimani, 40_000, "bank", 2, { reference: "TRF-90177" });
await policyWithInvoice(faith, kilimani, cic, "04", 25_000, { issue: -1, due: 29 }); // the credit is applied the moment this is raised

await publish("Maker-checker introduced: receipts need a second person's approval", { returnedChequeFeeMinor: FEE, overpaymentTreatment: "client_credit", receiptApproval: "required" });

// F. Maker-checker — Faith records, David decides
const rift = await client("Rift Valley Fresh Produce Ltd", "corporate", "0722 905 117", "Nakuru");
await policyWithInvoice(faith, rift, apa, "08", 60_000, { issue: -6, due: 8 });
await receipt(faith, rift, 45_000, "mpesa", 1, { reference: "QKR55TT1" });                       // waits for approval
const duplicate = await receipt(faith, rift, 45_000, "mpesa", 1, { reference: "QKR55TT1" });
await act(david, duplicate.id, "reject", { reason: "Duplicate of QKR55TT1, which is already recorded" });
const nyeri = await client("Nyeri Tea Traders", "corporate", "0711 540 823", "Nyeri");
await policyWithInvoice(faith, nyeri, jubilee, "06", 95_000, { issue: -4, due: 10 });
await receipt(faith, nyeri, 90_000, "cheque", 2, { cheque: "000321", drawerBank: "Co-operative Bank" }); // waits for approval
const approved = await receipt(faith, peter, 8_000, "bank", 1, { reference: "TRF-77120" });
await act(david, approved.id, "approve", { note: "Matches the bank statement" });

// G. Two clients can sign in to the self-service portal
const portalUsers: { name: string; email: string }[] = [];
for (const [name, email] of [["Hazel Njeri Kuria", "hazel@example.co.ke"], ["Otieno Logistics Ltd", "accounts@otienologistics.example"]] as const) {
  const created = await call("POST", "/portal-users", { token: admin, body: { partyId: clients.get(name)!, email } });
  const first = await call("POST", "/portal/auth/login", { body: { email, password: created.temporaryPassword } });
  await call("POST", "/portal/auth/change-password", { token: first.token, body: { currentPassword: created.temporaryPassword, newPassword: DEMO_PORTAL_PASSWORD } });
  portalUsers.push({ name, email });
}

// ---------------------------------------------------------------------------
// Spread the timestamps over the last weeks so charts, statements and ageing have
// history. The money tables are append-only by design (database triggers), so for
// this one-off pass the demo database lifts those triggers and puts them back.
// ---------------------------------------------------------------------------
const { db } = await import("../db/client");
const { sql } = await import("drizzle-orm");
const run = (q: string) => db.execute(sql.raw(q));
const guarded = [["finance.receipt_events", "receipt_events_append_only"], ["finance.allocations", "allocations_append_only"], ["finance.commission_accruals", "commission_accruals_append_only"]];
for (const [t, trg] of guarded) await run(`ALTER TABLE ${t} DISABLE TRIGGER ${trg}`);
await run(`UPDATE finance.receipts SET deposited_at = received_at + interval '1 day' WHERE deposited_at IS NOT NULL`);
await run(`UPDATE finance.receipts SET cleared_at = CASE WHEN method = 'cheque' THEN received_at + interval '3 days' WHEN approval_status = 'approved' THEN received_at + interval '3 hours' ELSE received_at END WHERE cleared_at IS NOT NULL`);
await run(`UPDATE finance.receipts SET bounced_at = received_at + interval '4 days' WHERE bounced_at IS NOT NULL`);
await run(`UPDATE finance.receipts SET cancelled_at = received_at + interval '2 hours' WHERE cancelled_at IS NOT NULL`);
await run(`UPDATE finance.receipts SET approved_at = received_at + interval '3 hours' WHERE approved_at IS NOT NULL`);
await run(`UPDATE finance.receipt_events e SET occurred_at = CASE e.to_status
    WHEN 'received' THEN r.received_at WHEN 'deposited' THEN r.received_at + interval '1 day' WHEN 'cleared' THEN r.cleared_at
    WHEN 'bounced' THEN r.bounced_at WHEN 'approved' THEN r.approved_at WHEN 'rejected' THEN r.approved_at
    WHEN 'cancelled' THEN COALESCE(r.cancelled_at, r.received_at + interval '2 hours') ELSE e.occurred_at END
  FROM finance.receipts r WHERE r.id = e.receipt_id`);
await run(`UPDATE finance.allocations a SET created_at = CASE b.trigger
    WHEN 'on_clearing' THEN r.cleared_at WHEN 'bounce_reversal' THEN r.bounced_at WHEN 'manual' THEN LEAST(r.cleared_at + interval '1 day', now())
    ELSE a.created_at END
  FROM finance.allocation_batches b, finance.receipts r WHERE b.id = a.batch_id AND r.id = a.receipt_id AND r.cleared_at IS NOT NULL`);
await run(`UPDATE finance.commission_accruals c SET created_at = a.created_at FROM finance.allocations a WHERE a.id = c.allocation_id`);
for (const [t, trg] of guarded) await run(`ALTER TABLE ${t} ENABLE TRIGGER ${trg}`);
await run(`UPDATE finance.invoices SET created_at = (issue_date::timestamp AT TIME ZONE 'Africa/Nairobi') + interval '9 hours' WHERE kind = 'premium'`);

// ---- done: a summary, and a marker so `npm run demo` does not rebuild it
const count = async (table: string) => Number(((await db.execute(sql.raw(`SELECT COUNT(*)::int n FROM ${table}`))) as unknown as { rows: { n: number }[] }).rows[0].n);
const summary = {
  clients: await count("crm.parties"), policies: await count("policy.policies"), invoices: await count("finance.invoices"),
  receipts: await count("finance.receipts"), allocations: await count("finance.allocations"), configVersions: await count("config.tenant_config_versions"),
};
console.log("\nDemo database ready:", JSON.stringify(summary));
console.log(`Currency KES · time zone Africa/Nairobi · staff password ${DEMO_STAFF_PASSWORD} · portal password ${DEMO_PORTAL_PASSWORD}`);
console.log("Portal logins:", portalUsers.map((p) => p.email).join(", "));
fs.writeFileSync(MARKER, new Date().toISOString());
await new Promise<void>((r) => server.close(() => r()));
const { closeDb } = await import("../db/client");
await closeDb();
process.exit(0);
