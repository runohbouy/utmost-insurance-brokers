import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";
import { upgradeSnapshot } from "../../lib/config/upgrade";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;
let accountant: string;
let supervisor: string;
let sales: string;
let insurerId: string;

const KES = (major: number) => Math.round(major * 100);
let counter = 0;

async function q<T = any>(text: string): Promise<T[]> {
  const { db } = await import("../../db/client");
  const { sql } = await import("drizzle-orm");
  return ((await db.execute(sql.raw(text))) as unknown as { rows: T[] }).rows;
}
const balance = async (account: string) => {
  const [r] = await q<{ d: string; c: string }>(`SELECT COALESCE(SUM(debit_kes),0)::text d, COALESCE(SUM(credit_kes),0)::text c FROM finance.journal_lines WHERE account_code='${account}'`);
  return Math.round((Number(r.d) - Number(r.c)) * 100);
};

async function newClient(name = `Client ${++counter}`) {
  return (await api.call("POST", "/parties", { body: { fullName: name, partyType: "individual" } })).json.id as string;
}
async function owe(clientId: string, netKes: number) {
  const p = await api.call("POST", "/policies", { body: { clientId, insurerId, category: "07", premiumAmount: netKes, endDate: "2027-12-31" } });
  const inv = await api.call("POST", "/invoices", { token: accountant, body: { kind: "premium", policyId: p.json.id, amountMinor: KES(netKes), dueDate: "2027-03-01", issueDate: "2027-01-01" } });
  expect(inv.status, inv.text).toBe(201);
  return inv.json;
}
const record = (token: string, clientId: string, kes: number, method = "mpesa") =>
  api.call("POST", "/receipts", { token, body: { clientId, amountMinor: KES(kes), method, ...(method === "cheque" ? { instrumentNo: `A${++counter}` } : {}) } });
const position = async (clientId: string) => (await api.call("GET", `/clients/${clientId}/position`, { token: accountant })).json;
const act = (token: string, id: string, action: string, body: unknown = {}) => api.call("POST", `/receipts/${id}/${action}`, { token, body });
const print = (token: string, id: string) => api.call("POST", `/receipts/${id}/print`, { token, body: {} });

async function publish(overrides: unknown) {
  expect((await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides } })).status).toBe(200);
  const pub = await api.call("POST", "/config/draft/publish", { token: admin });
  expect(pub.status, pub.text).toBe(201);
}

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
  accountant = await api.login("accountant@test.local");
  supervisor = await api.login("supervisor@test.local");
  sales = await api.login("sales@test.local");
  insurerId = (await api.call("POST", "/insurers", { token: admin, body: { name: "Approval Insurer", authorizedClasses: ["07"] } })).json.id;
  await api.call("POST", "/insurer-rates", { token: admin, body: { insurerId, category: "07", commissionRatePct: 10 } });
});
afterAll(() => app.close());

describe("without the approval setting (the default)", () => {
  it("a receipt counts the moment it is recorded", async () => {
    await publish({ tax: { taxes: [] } });
    const c = await newClient();
    await owe(c, 5_000);
    const r = await record(accountant, c, 5_000);
    expect(r.json).toMatchObject({ status: "cleared", approvalStatus: "not_required" });
    expect(r.json.allocated.amountMinor).toBe(KES(5_000));
  });
});

describe("maker-checker", () => {
  beforeAll(async () => { await publish({ tax: { taxes: [] }, finance: { receiptApproval: "required" } }); });

  it("a recorded receipt waits: no clearing, no allocation, no ledger entry", async () => {
    const c = await newClient();
    await owe(c, 10_000);
    const before = await balance("1000");
    const r = await record(accountant, c, 10_000);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ status: "received", approvalStatus: "pending" });
    expect(r.json.allocated.amountMinor).toBe(0);
    expect((await position(c)).outstanding.amountMinor).toBe(KES(10_000));
    expect(await balance("1000")).toBe(before);
    const pending = await api.call("GET", "/receipts?approval=pending&limit=50", { token: supervisor });
    expect(pending.json.map((x: any) => x.id)).toContain(r.json.id);
  });

  it("the person who recorded it cannot approve or reject it — even an administrator", async () => {
    const c = await newClient();
    const r = await record(admin, c, 1_000);
    for (const [action, body] of [["approve", {}], ["reject", { reason: "changed my mind" }]] as const) {
      const res = await act(admin, r.json.id, action, body);
      expect(res.status).toBe(403);
      expect(res.json.type).toMatch(/approval-same-person$/);
    }
  });

  it("cannot be banked or cleared while awaiting approval, but the maker can withdraw it", async () => {
    const c = await newClient();
    const chq = await record(accountant, c, 1_000, "cheque");
    for (const action of ["deposit", "clear", "bounce"]) {
      const res = await act(accountant, chq.json.id, action);
      expect(res.status, action).toBe(409);
      expect(res.json.type).toMatch(/receipt-awaiting-approval$/);
    }
    const cancelled = await act(accountant, chq.json.id, "cancel", { note: "recorded in error" });
    expect(cancelled.json.status).toBe("cancelled");
  });

  it("a different person's approval makes cash-type money real: cleared, allocated, in the ledger", async () => {
    const c = await newClient();
    const inv = await owe(c, 10_000);
    const r = await record(accountant, c, 10_000);
    const before = await balance("1000");
    const ok = await act(supervisor, r.json.id, "approve", { note: "Matches the M-Pesa statement" });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json).toMatchObject({ status: "cleared", approvalStatus: "approved", replayed: false });
    expect(ok.json.approvedBy).toBeTruthy();
    expect(ok.json.approvalNote).toBe("Matches the M-Pesa statement");
    expect(ok.json.allocated.amountMinor).toBe(KES(10_000));
    expect((await position(c)).outstanding.amountMinor).toBe(0);
    expect(await balance("1000") - before).toBe(KES(10_000));
    expect(ok.json.events.map((e: any) => e.to)).toEqual(["received", "approved", "cleared"]);
    expect(inv.total.amountMinor).toBe(KES(10_000));
  });

  it("approving twice changes nothing", async () => {
    const c = await newClient();
    const r = await record(accountant, c, 2_000);
    await act(supervisor, r.json.id, "approve");
    const again = await act(admin, r.json.id, "approve");
    expect(again.status).toBe(200);
    expect(again.json.replayed).toBe(true);
    expect(await q(`SELECT 1 FROM finance.journal_entries WHERE source_type='receipt' AND source_id='${r.json.id}'`)).toHaveLength(1);
  });

  it("an approved cheque still has to be deposited and clear", async () => {
    const c = await newClient();
    await owe(c, 4_000);
    const chq = await record(accountant, c, 4_000, "cheque");
    const ok = await act(supervisor, chq.json.id, "approve");
    expect(ok.json).toMatchObject({ status: "received", approvalStatus: "approved" });
    expect(ok.json.allocated.amountMinor).toBe(0);
    expect((await act(accountant, chq.json.id, "deposit")).json.status).toBe("deposited");
    const cleared = await act(accountant, chq.json.id, "clear");
    expect(cleared.json.allocated.amountMinor).toBe(KES(4_000));
  });

  it("a rejection needs a reason, voids the receipt, and leaves no trace in the ledger", async () => {
    const c = await newClient();
    const r = await record(accountant, c, 3_000);
    expect((await act(supervisor, r.json.id, "reject", {})).status).toBe(422);
    const before = await balance("1000");
    const no = await act(supervisor, r.json.id, "reject", { reason: "No matching bank credit" });
    expect(no.status, no.text).toBe(200);
    expect(no.json).toMatchObject({ status: "cancelled", approvalStatus: "rejected", approvalNote: "No matching bank credit" });
    expect(await balance("1000")).toBe(before);
    expect((await act(supervisor, r.json.id, "reject", { reason: "again again" })).json.replayed).toBe(true);
    const late = await act(supervisor, r.json.id, "approve");
    expect(late.status).toBe(409);
    expect(late.json.type).toMatch(/receipt-not-pending$/);
  });

  it("decisions are written to the audit log with who made them", async () => {
    const rows = await q<{ action: string }>(`SELECT DISTINCT action FROM compliance.audit_log WHERE entity_type='receipt' AND action IN ('RECEIPT_APPROVED','RECEIPT_REJECTED')`);
    expect(rows.map((x) => x.action).sort()).toEqual(["RECEIPT_APPROVED", "RECEIPT_REJECTED"]);
  });

  it("only people with receipt.approve may decide", async () => {
    const c = await newClient();
    const r = await record(accountant, c, 500);
    expect((await act(sales, r.json.id, "approve")).status).toBe(403);
    expect((await act(sales, r.json.id, "reject", { reason: "not allowed" })).status).toBe(403);
  });

  it("a client never sees a receipt that has not been approved", async () => {
    const c = await newClient("Portal Pending Client");
    await owe(c, 6_000);
    const pending = await record(accountant, c, 6_000);
    const user = await api.call("POST", "/portal-users", { token: admin, body: { partyId: c, email: "pending.client@example.com" } });
    const first = await api.call("POST", "/portal/auth/login", { body: { email: "pending.client@example.com", password: user.json.temporaryPassword }, apiKey: null });
    await api.call("POST", "/portal/auth/change-password", { token: first.json.token, body: { currentPassword: user.json.temporaryPassword, newPassword: "Correct-Horse-42" }, apiKey: null });
    const token = (await api.call("POST", "/portal/auth/login", { body: { email: "pending.client@example.com", password: "Correct-Horse-42" }, apiKey: null })).json.token;

    const list = (t: string) => api.call("GET", "/portal/receipts", { token: t, apiKey: null });
    expect((await list(token)).json).toEqual([]);
    expect((await api.call("GET", `/portal/receipts/${pending.json.id}`, { token, apiKey: null })).status).toBe(404);

    await act(supervisor, pending.json.id, "approve");
    expect((await list(token)).json.map((x: any) => x.id)).toEqual([pending.json.id]);
  });
});

describe("older configuration snapshots", () => {
  it("are upgraded as they are read, with the value that matches how they behaved", () => {
    const old = { regional: {}, finance: { feesFirst: true }, security: undefined } as any;
    delete old.security;
    const up = upgradeSnapshot(old) as any;
    expect(up.finance.receiptApproval).toBe("none");
    expect(up.security).toEqual({ mfa: "optional" });
    expect(old.finance.receiptApproval).toBeUndefined(); // the stored value is never mutated
    expect((upgradeSnapshot({ finance: { receiptApproval: "required" }, security: { mfa: "required" } }) as any).finance.receiptApproval).toBe("required");
  });
});

describe("the printable receipt", () => {
  let clientId: string;
  let receiptId: string;

  beforeAll(async () => {
    await publish({ tax: { taxes: [] } }); // approval off again
    clientId = await newClient("Hazel <script>alert(1)</script> & Sons");
    await owe(clientId, 120_000);
    receiptId = (await record(accountant, clientId, 70_000)).json.id;
  });

  it("is an HTML document with the receipt number, the amount in figures and in words", async () => {
    const r = await print(accountant, receiptId);
    expect(r.status, r.text).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(r.text).toMatch(/^<!doctype html>/i);
    expect(r.text).toContain("<h1>Insurance Brokers</h1>"); // the tenant's brand name from its published configuration
    expect(r.text).toContain("Official receipt");
    expect(r.text).toMatch(/RCT-\d{4}-\d{6}/);
    expect(r.text).toContain("Kenya Shillings Seventy Thousand Only");
    expect(r.text).toMatch(/Ksh\s?70,000\.00/);
  });

  it("shows what the money paid and what is still owing", async () => {
    const r = await print(accountant, receiptId);
    expect(r.text).toMatch(/INV-\d{4}-\d{6}/);
    expect(r.text).toMatch(/still owing on your account: <strong>Ksh\s?50,000\.00/);
  });

  it("escapes everything: a hostile client name cannot inject markup or script", async () => {
    const r = await print(accountant, receiptId);
    expect(r.text).not.toMatch(/<script/i);
    expect(r.text).toContain("Hazel &lt;script&gt;alert(1)&lt;/script&gt; &amp; Sons");
  });

  it("is the ORIGINAL once, then every later print is a numbered DUPLICATE", async () => {
    const c = await newClient();
    const id = (await record(accountant, c, 1_000)).json.id;
    const first = await print(accountant, id);
    expect(first.text).toContain("ORIGINAL");
    expect(first.headers.get("x-receipt-copy")).toBe("1");
    const second = await print(supervisor, id);
    expect(second.text).toContain("DUPLICATE — COPY 2");
    expect(second.text).not.toContain(">ORIGINAL<");
    expect((await print(admin, id)).text).toContain("DUPLICATE — COPY 3");
    expect(await q(`SELECT 1 FROM compliance.audit_log WHERE action='RECEIPT_PRINTED' AND entity_id='${id}'`)).toHaveLength(3);
  });

  it("says so across the page when the receipt is not real money", async () => {
    const c = await newClient();
    const chq = (await record(accountant, c, 8_000, "cheque")).json.id;
    expect((await print(accountant, chq)).text).toContain("PROVISIONAL — CHEQUE NOT YET CLEARED");
    await act(accountant, chq, "deposit");
    await act(accountant, chq, "clear");
    expect((await print(accountant, chq)).text).not.toMatch(/class="flag/);
    await act(accountant, chq, "bounce", { note: "refer to drawer" });
    const bounced = await print(accountant, chq);
    expect(bounced.text).toContain("CHEQUE RETURNED UNPAID — NOT VALID");
    expect(bounced.text).toContain("Not applied to any invoice");
  });

  it("marks a receipt awaiting approval as not valid, and names the approver once approved", async () => {
    await publish({ tax: { taxes: [] }, finance: { receiptApproval: "required" } });
    const c = await newClient();
    const id = (await record(accountant, c, 900)).json.id;
    expect((await print(supervisor, id)).text).toContain("NOT VALID — AWAITING APPROVAL");
    await act(supervisor, id, "approve");
    const done = await print(supervisor, id);
    expect(done.text).not.toContain("AWAITING APPROVAL");
    expect(done.text).toContain("Test Supervisor");
    expect(done.text).toContain("Test Accountant");
    await publish({ tax: { taxes: [] } });
  });

  it("needs finance.view, and an unknown receipt is a 404", async () => {
    expect((await print(sales, receiptId)).status).toBe(403);
    expect((await print(accountant, "rct-nope")).status).toBe(404);
  });
});
