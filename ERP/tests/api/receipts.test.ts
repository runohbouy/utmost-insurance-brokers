import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;
let accountant: string;
let supervisor: string;
let sales: string;
let insurerId: string;
let producerId: string;

const KES = (major: number) => Math.round(major * 100);
let counter = 0;
const day = (offset: number) => new Date(Date.UTC(2027, 0, 1 + offset)).toISOString().slice(0, 10);

/** Raw SQL against the test database, for ledger assertions the API deliberately does not expose. */
async function q<T = any>(text: string): Promise<T[]> {
  const { db } = await import("../../db/client");
  const { sql } = await import("drizzle-orm");
  return ((await db.execute(sql.raw(text))) as unknown as { rows: T[] }).rows;
}
const balance = async (account: string) => {
  const [r] = await q<{ d: string; c: string }>(`SELECT COALESCE(SUM(debit_kes),0)::text d, COALESCE(SUM(credit_kes),0)::text c FROM finance.journal_lines WHERE account_code='${account}'`);
  return Math.round((Number(r.d) - Number(r.c)) * 100); // debit-positive, in minor units
};

async function newClient(name = `Client ${++counter}`) {
  const r = await api.call("POST", "/parties", { body: { fullName: name, partyType: "individual" } });
  expect(r.status).toBe(200);
  return r.json.id as string;
}

async function newPolicy(clientId: string, premiumKes: number, opts: { producer?: boolean } = {}) {
  const r = await api.call("POST", "/policies", {
    body: { clientId, insurerId, category: "07", premiumAmount: premiumKes, endDate: "2027-12-31", ...(opts.producer ? { producerId } : {}) },
  });
  expect(r.status).toBe(200);
  return r.json.id as string;
}

async function invoiceFor(policyId: string, netKes: number, dueOffset = 30) {
  const r = await api.call("POST", "/invoices", { token: accountant, body: { kind: "premium", policyId, amountMinor: KES(netKes), dueDate: day(dueOffset) } });
  expect(r.status, r.text).toBe(201);
  return r.json;
}

const position = async (clientId: string) => (await api.call("GET", `/clients/${clientId}/position`, { token: accountant })).json;
const receipt = async (id: string) => (await api.call("GET", `/receipts/${id}`, { token: accountant })).json;

async function record(clientId: string, amountKes: number, method = "mpesa", extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return api.call("POST", "/receipts", {
    token: accountant, headers,
    body: { clientId, amountMinor: KES(amountKes), method, ...(method === "cheque" ? { instrumentNo: `CHQ${++counter}` } : {}), ...extra },
  });
}

async function publishConfig(overrides: unknown, note = "test") {
  const put = await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides, note } });
  expect(put.status, put.text).toBe(200);
  const pub = await api.call("POST", "/config/draft/publish", { token: admin });
  expect(pub.status, pub.text).toBe(201);
  return pub.json;
}

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
  accountant = await api.login("accountant@test.local");
  supervisor = await api.login("supervisor@test.local");
  sales = await api.login("sales@test.local");

  const insurer = await api.call("POST", "/insurers", { token: admin, body: { name: "Allocation Test Insurer", authorizedClasses: ["07"] } });
  insurerId = insurer.json.id;
  // 10% commission on motor private
  expect((await api.call("POST", "/insurer-rates", { token: admin, body: { insurerId, category: "07", commissionRatePct: 10 } })).status).toBe(200);
  const producer = await api.call("POST", "/producers", { token: admin, body: { producerType: "agent", name: "Alloc Agent", commissionSplitPct: 30 } });
  producerId = producer.json.id;

  // The acceptance scenario is stated net of levies, so start from a tenant that itemises none.
  await publishConfig({ tax: { taxes: [] } }, "no levies for the acceptance scenario");
});
afterAll(() => app.close());

describe("acceptance scenario: 3 policies, KES 120,000, one cheque", () => {
  let clientId: string;
  let invoices: any[];
  let chequeId: string;
  let policyIds: string[];

  it("starts with 120,000 outstanding across three invoices", async () => {
    clientId = await newClient("Acceptance Client");
    policyIds = [await newPolicy(clientId, 50_000, { producer: true }), await newPolicy(clientId, 40_000), await newPolicy(clientId, 30_000)];
    invoices = [await invoiceFor(policyIds[0], 50_000, 10), await invoiceFor(policyIds[1], 40_000, 20), await invoiceFor(policyIds[2], 30_000, 30)];
    const pos = await position(clientId);
    expect(pos.outstanding.amountMinor).toBe(KES(120_000));
    expect(pos.invoices).toHaveLength(3);
  });

  it("a cheque is only received: nothing is allocated and nothing is owed less", async () => {
    const r = await record(clientId, 70_000, "cheque");
    expect(r.status).toBe(201);
    expect(r.json.status).toBe("received");
    chequeId = r.json.id;
    expect(r.json.unallocated.amountMinor).toBe(0);
    expect((await position(clientId)).outstanding.amountMinor).toBe(KES(120_000));
    expect(await q(`SELECT 1 FROM finance.journal_entries WHERE source_id='${chequeId}'`)).toHaveLength(0);
  });

  it("deposited is still not cleared money", async () => {
    const r = await api.call("POST", `/receipts/${chequeId}/deposit`, { token: accountant, body: {} });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("deposited");
    expect((await position(clientId)).outstanding.amountMinor).toBe(KES(120_000));
  });

  it("clearing allocates FIFO: first paid, second part-paid, 50,000 left", async () => {
    const r = await api.call("POST", `/receipts/${chequeId}/clear`, { token: accountant, body: {} });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("cleared");
    expect(r.json.allocated.amountMinor).toBe(KES(70_000));
    expect(r.json.unallocated.amountMinor).toBe(0);

    const pos = await position(clientId);
    expect(pos.outstanding.amountMinor).toBe(KES(50_000));
    const byId = Object.fromEntries(((await api.call("GET", `/invoices?clientId=${clientId}`, { token: accountant })).json as any[]).map((i) => [i.id, i]));
    expect(byId[invoices[0].id].status).toBe("paid");
    expect(byId[invoices[1].id].status).toBe("part_paid");
    expect(byId[invoices[1].id].outstanding.amountMinor).toBe(KES(20_000));
    expect(byId[invoices[2].id].status).toBe("open");
  });

  it("fully paying the first invoice activates its policy; the part-paid one stays pending", async () => {
    const policies = (await api.call("GET", "/policies")).json as any[];
    expect(policies.find((p) => p.id === policyIds[0]).status).toBe("Active");
    expect(policies.find((p) => p.id === policyIds[1]).status).toBe("Pending");
  });

  it("books the money to the ledger and earns commission on the cleared net premium", async () => {
    expect(await balance("1000")).toBe(KES(70_000));
    expect(await balance("2100")).toBe(0); // everything cleared was applied
    expect(-(await balance("4000")) + -(await balance("2010"))).toBe(KES(7_000)); // 10% of 70,000 (brokerage share + producer share)
    const accruals = await q<{ s: string }>(`SELECT SUM(amount_minor)::text s FROM finance.commission_accruals`);
    expect(Number(accruals[0].s)).toBe(KES(7_000));
  });

  it("a bounced cheque puts everything back: 120,000 outstanding, commission and ledger reversed", async () => {
    const r = await api.call("POST", `/receipts/${chequeId}/bounce`, { token: accountant, body: { note: "Refer to drawer" } });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("bounced");
    expect(r.json.bounce.reversedMinor).toBe(KES(70_000));

    const pos = await position(clientId);
    expect(pos.outstanding.amountMinor).toBe(KES(120_000));
    expect(pos.suspense.amountMinor + pos.clientCredit.amountMinor).toBe(0);

    expect(await balance("1000")).toBe(0);
    expect(await balance("2100")).toBe(0);
    expect(await balance("2000")).toBe(0);
    expect(await balance("4000")).toBe(0);
    expect(await balance("2010")).toBe(0);
    const accruals = await q<{ s: string }>(`SELECT SUM(amount_minor)::text s FROM finance.commission_accruals`);
    expect(Number(accruals[0].s)).toBe(0);
    const splits = await q<{ s: string }>(`SELECT SUM(split_amount_kes)::text s FROM finance.producer_commission_splits WHERE policy_id='${policyIds[0]}'`);
    expect(Number(splits[0].s)).toBe(0);
  });

  it("bouncing again changes nothing (idempotent)", async () => {
    const before = await q(`SELECT 1 FROM finance.allocations`);
    const r = await api.call("POST", `/receipts/${chequeId}/bounce`, { token: accountant, body: {} });
    expect(r.status).toBe(200);
    expect(r.json.replayed).toBe(true);
    expect(await q(`SELECT 1 FROM finance.allocations`)).toHaveLength(before.length);
    expect((await position(clientId)).outstanding.amountMinor).toBe(KES(120_000));
  });

  it("keeps the history: applies and reversals are both on the receipt", async () => {
    const r = await receipt(chequeId);
    const kinds = r.allocations.map((a: any) => a.kind).sort();
    expect(kinds).toEqual(["apply", "apply", "reversal", "reversal"]);
    expect(r.events.map((e: any) => e.to)).toEqual(["received", "deposited", "cleared", "bounced"]);
  });

  it("a bounced receipt cannot be revived", async () => {
    const r = await api.call("POST", `/receipts/${chequeId}/clear`, { token: accountant, body: {} });
    expect(r.status).toBe(409);
    expect(r.headers.get("content-type")).toMatch(/application\/problem\+json/);
    expect(r.json.type).toMatch(/receipt-invalid-transition$/);
    expect(r.json.allowed).toEqual([]);
  });
});

describe("cheque lifecycle", () => {
  it("cannot jump from received to cleared", async () => {
    const c = await newClient();
    const r = await record(c, 1_000, "cheque");
    const clear = await api.call("POST", `/receipts/${r.json.id}/clear`, { token: accountant, body: {} });
    expect(clear.status).toBe(409);
    expect(clear.json.allowed).toEqual(["deposited", "cancelled"]);
  });

  it("a cancelled cheque is final and never touches the ledger", async () => {
    const c = await newClient();
    const r = await record(c, 1_000, "cheque");
    const cancel = await api.call("POST", `/receipts/${r.json.id}/cancel`, { token: accountant, body: { note: "Wrong payee" } });
    expect(cancel.json.status).toBe("cancelled");
    expect(await q(`SELECT 1 FROM finance.journal_entries WHERE source_id='${r.json.id}'`)).toHaveLength(0);
    expect((await api.call("POST", `/receipts/${r.json.id}/deposit`, { token: accountant, body: {} })).status).toBe(409);
  });

  it("a cheque that bounces at the bank before clearing reverses nothing", async () => {
    const c = await newClient();
    const p = await newPolicy(c, 10_000);
    await invoiceFor(p, 10_000);
    const r = await record(c, 10_000, "cheque");
    await api.call("POST", `/receipts/${r.json.id}/deposit`, { token: accountant, body: {} });
    const bounce = await api.call("POST", `/receipts/${r.json.id}/bounce`, { token: accountant, body: {} });
    expect(bounce.json.bounce.reversedMinor).toBe(0);
    expect((await position(c)).outstanding.amountMinor).toBe(KES(10_000));
  });

  it("non-cheque receipts are cleared on receipt and allocate immediately", async () => {
    const c = await newClient();
    const p = await newPolicy(c, 20_000);
    await invoiceFor(p, 20_000);
    const r = await record(c, 20_000, "mpesa", { reference: "QWE123" });
    expect(r.json.status).toBe("cleared");
    expect(r.json.allocated.amountMinor).toBe(KES(20_000));
    expect((await position(c)).outstanding.amountMinor).toBe(0);
  });
});

describe("recording receipts", () => {
  it("is idempotent on the Idempotency-Key header", async () => {
    const c = await newClient();
    const headers = { "Idempotency-Key": "idem-key-0001" };
    const first = await record(c, 500, "cash", {}, headers);
    const second = await record(c, 500, "cash", {}, headers);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.replayed).toBe(true);
    expect(second.json.id).toBe(first.json.id);
    expect(await q(`SELECT 1 FROM finance.receipts WHERE client_id='${c}'`)).toHaveLength(1);
  });

  it("refuses to reuse a key for a different request", async () => {
    const c = await newClient();
    const headers = { "Idempotency-Key": "idem-key-0002" };
    await record(c, 500, "cash", {}, headers);
    const clash = await record(c, 600, "cash", {}, headers);
    expect(clash.status).toBe(422);
    expect(clash.json.type).toMatch(/idempotency-key-reused$/);
  });

  it("a concurrent duplicate becomes a replay, not a second receipt", async () => {
    const c = await newClient();
    const headers = { "Idempotency-Key": "idem-key-race-1" };
    const [a, b] = await Promise.all([record(c, 700, "cash", {}, headers), record(c, 700, "cash", {}, headers)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await q(`SELECT 1 FROM finance.receipts WHERE client_id='${c}'`)).toHaveLength(1);
  });

  it("validates the request and reports every field problem", async () => {
    const r = await api.call("POST", "/receipts", { token: accountant, body: { clientId: "nobody", amountMinor: -5, method: "barter" } });
    expect(r.status).toBe(422);
    expect(r.json.type).toMatch(/validation-failed$/);
    expect(r.json.errors.map((e: any) => e.field).sort()).toEqual(["amountMinor", "method"]);

    const noCheque = await api.call("POST", "/receipts", { token: accountant, body: { clientId: await newClient(), amountMinor: 100, method: "cheque" } });
    expect(noCheque.status).toBe(422);
    const unknown = await api.call("POST", "/receipts", { token: accountant, body: { clientId: "ghost", amountMinor: 100, method: "cash" } });
    expect(unknown.status).toBe(422);
    expect(unknown.json.errors[0].field).toBe("clientId");
  });

  it("rejects fractional amounts: money is whole minor units", async () => {
    const r = await api.call("POST", "/receipts", { token: accountant, body: { clientId: await newClient(), amountMinor: 10.5, method: "cash" } });
    expect(r.status).toBe(422);
  });

  it("pages and searches receipts", async () => {
    const c = await newClient("Searchable Sally");
    await record(c, 300, "cash", { reference: "FINDME-77" });
    const list = await api.call("GET", "/receipts?limit=5&q=FINDME-77", { token: accountant });
    expect(list.status).toBe(200);
    expect(list.json).toHaveLength(1);
    expect(list.headers.get("x-total-count")).toBe("1");
    const byName = await api.call("GET", "/receipts?limit=5&q=Searchable", { token: accountant });
    expect(byName.json).toHaveLength(1);
    const wildcard = await api.call("GET", "/receipts?limit=5&q=%25", { token: accountant });
    expect(wildcard.json).toHaveLength(0);
  });
});

describe("overpayment and suspense", () => {
  it("money beyond everything owed waits in suspense by default", async () => {
    const c = await newClient();
    const p = await newPolicy(c, 10_000);
    await invoiceFor(p, 10_000);
    const r = await record(c, 15_000, "bank");
    expect(r.json.allocated.amountMinor).toBe(KES(10_000));
    expect(r.json.unallocated.amountMinor).toBe(KES(5_000));
    expect(r.json.holdingKind).toBe("suspense");
    const pos = await position(c);
    expect(pos.suspense.amountMinor).toBe(KES(5_000));
    expect(pos.clientCredit.amountMinor).toBe(0);
    expect(await q(`SELECT 1 FROM finance.receipts WHERE id='${r.json.id}' AND holding_kind='suspense'`)).toHaveLength(1);
  });

  it("suspense is never applied silently to a new invoice, but staff can resolve it", async () => {
    const c = await newClient();
    const r = await record(c, 4_000, "bank"); // nothing owed yet
    expect(r.json.holdingKind).toBe("suspense");
    const p = await newPolicy(c, 4_000);
    const inv = await invoiceFor(p, 4_000);
    expect(inv.outstanding.amountMinor).toBe(KES(4_000));

    const preview = await api.call("POST", `/receipts/${r.json.id}/allocations/preview`, { token: accountant, body: { strategy: "fifo" } });
    expect(preview.status).toBe(200);
    expect(preview.json.preview).toBe(true);
    expect(preview.json.allocations[0].amount.amountMinor).toBe(KES(4_000));
    expect((await receipt(r.json.id)).allocations).toHaveLength(0); // previewing wrote nothing

    const applied = await api.call("POST", `/receipts/${r.json.id}/allocations`, { token: accountant, body: { strategy: "fifo" } });
    expect(applied.status).toBe(201);
    expect((await position(c)).outstanding.amountMinor).toBe(0);
    expect((await position(c)).suspense.amountMinor).toBe(0);
  });

  it("reconciles the unallocated-receipts account with what is actually held", async () => {
    const [held] = await q<{ s: string }>(`
      SELECT COALESCE(SUM(r.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM finance.allocations a WHERE a.receipt_id = r.id),0)),0)::text s
      FROM finance.receipts r WHERE r.status = 'cleared'`);
    expect(-(await balance("2100"))).toBe(Number(held.s));
  });
});

describe("manual allocation, preview and reversal", () => {
  it("manual allocation honours exact instructions and rejects impossible ones", async () => {
    const c = await newClient();
    const [p1, p2] = [await newPolicy(c, 10_000), await newPolicy(c, 10_000)];
    const [i1, i2] = [await invoiceFor(p1, 10_000, 5), await invoiceFor(p2, 10_000, 50)];
    // a cheque so nothing auto-allocates before the manual instruction
    const chq = await record(c, 6_000, "cheque");
    await api.call("POST", `/receipts/${chq.json.id}/deposit`, { token: accountant, body: {} });

    // block FIFO by creating the receipt in suspense: clear it, then reverse and re-allocate manually
    const cleared = await api.call("POST", `/receipts/${chq.json.id}/clear`, { token: accountant, body: {} });
    expect(cleared.json.allocations.find((a: any) => a.invoiceNo === i1.invoiceNo).amount.amountMinor).toBe(KES(6_000));
    const first = cleared.json.allocations[0];
    const rev = await api.call("POST", `/allocations/${first.id}/reverse`, { token: accountant, body: { reason: "Client asked for the other policy" } });
    expect(rev.status).toBe(200);
    expect(rev.json.receipt.unallocated.amountMinor).toBe(KES(6_000));
    expect(rev.json.receipt.holdingKind).toBe("suspense");

    const tooMuch = await api.call("POST", `/receipts/${chq.json.id}/allocations`, { token: accountant, body: { strategy: "manual", manual: [{ invoiceId: i2.id, amountMinor: KES(7_000) }] } });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.json.type).toMatch(/allocation-invalid-manual$/);

    const ok = await api.call("POST", `/receipts/${chq.json.id}/allocations`, { token: accountant, headers: { "Idempotency-Key": "manual-alloc-01" }, body: { strategy: "manual", manual: [{ invoiceId: i2.id, amountMinor: KES(6_000) }] } });
    expect(ok.status).toBe(201);
    const replay = await api.call("POST", `/receipts/${chq.json.id}/allocations`, { token: accountant, headers: { "Idempotency-Key": "manual-alloc-01" }, body: { strategy: "manual", manual: [{ invoiceId: i2.id, amountMinor: KES(6_000) }] } });
    expect(replay.status).toBe(200);
    expect(replay.json.replayed).toBe(true);
    expect((await receipt(chq.json.id)).allocated.amountMinor).toBe(KES(6_000)); // applied once

    const pos = await position(c);
    expect(pos.invoices.find((i: any) => i.id === i1.id).outstanding.amountMinor).toBe(KES(10_000));
    expect(pos.invoices.find((i: any) => i.id === i2.id).outstanding.amountMinor).toBe(KES(4_000));
  });

  it("reversing an allocation twice is a no-op", async () => {
    const c = await newClient();
    const p = await newPolicy(c, 3_000, { producer: true });
    await invoiceFor(p, 3_000);
    const r = await record(c, 3_000, "cash");
    const alloc = r.json.allocations[0];
    const first = await api.call("POST", `/allocations/${alloc.id}/reverse`, { token: accountant, body: { reason: "Posted to wrong client" } });
    const second = await api.call("POST", `/allocations/${alloc.id}/reverse`, { token: accountant, body: { reason: "Posted to wrong client" } });
    expect(first.json.replayed).toBe(false);
    expect(second.json.replayed).toBe(true);
    expect(second.json.reversalId).toBe(first.json.reversalId);
    expect((await position(c)).outstanding.amountMinor).toBe(KES(3_000));
    const [acc] = await q<{ s: string }>(`SELECT SUM(amount_minor)::text s FROM finance.commission_accruals WHERE policy_id='${p}'`);
    expect(Number(acc.s)).toBe(0);
  });

  it("requires a reason for a reversal", async () => {
    const r = await api.call("POST", "/allocations/whatever/reverse", { token: accountant, body: {} });
    expect(r.status).toBe(422);
  });
});

describe("the ledger is append-only", () => {
  it("refuses to edit or delete an allocation, an accrual or a receipt event", async () => {
    await expect(q(`UPDATE finance.allocations SET amount_minor = amount_minor + 1`)).rejects.toThrow();
    await expect(q(`DELETE FROM finance.allocations`)).rejects.toThrow();
    await expect(q(`UPDATE finance.commission_accruals SET amount_minor = 0`)).rejects.toThrow();
    await expect(q(`DELETE FROM finance.receipt_events`)).rejects.toThrow();
  });

  it("every journal entry the module posted balances", async () => {
    const bad = await q(`
      SELECT e.id FROM finance.journal_entries e JOIN finance.journal_lines l ON l.entry_id = e.id
      WHERE e.source_type IN ('receipt','allocation','reversal')
      GROUP BY e.id HAVING SUM(l.debit_kes) <> SUM(l.credit_kes)`);
    expect(bad).toHaveLength(0);
  });
});

describe("tax lines and returned-cheque fee (KE pack levies, fee configured)", () => {
  let clientId: string;
  let policyId: string;
  let invoice: any;

  beforeAll(async () => {
    // Back to the pack's own levies, and charge KES 1,500 when a cheque comes back.
    await publishConfig({ finance: { returnedChequeFeeMinor: KES(1_500) } }, "levies restored, returned-cheque fee");
    clientId = await newClient("Levy Client");
    policyId = await newPolicy(clientId, 100_000);
    invoice = await invoiceFor(policyId, 100_000);
  });

  it("adds the statutory levies on top of the net premium", async () => {
    // 100,000 net + PCF 0.25% (250) + ITL 0.20% (200) + stamp duty (40)
    expect(invoice.total.amountMinor).toBe(KES(100_490));
    const lines = Object.fromEntries(invoice.lines.map((l: any) => [l.code, l.amount.amountMinor]));
    expect(lines).toEqual({ premium: KES(100_000), pcf: KES(250), itl: KES(200), stamp_duty: KES(40) });
  });

  it("a payment is split across net and levy lines, and the levies go to the payable account", async () => {
    const levyBefore = await balance("2200");
    const r = await record(clientId, 100_490, "bank");
    expect(r.json.allocated.amountMinor).toBe(KES(100_490));
    expect(-(await balance("2200")) + levyBefore).toBe(KES(490));
    expect((await position(clientId)).outstanding.amountMinor).toBe(0);
    const paid = (await api.call("GET", `/invoices/${invoice.id}`, { token: accountant })).json;
    expect(paid.status).toBe("paid");
    expect(paid.lines.every((l: any) => l.outstanding.amountMinor === 0)).toBe(true);
  });

  it("a bounced cheque raises the configured fee as its own invoice", async () => {
    const c = await newClient("Fee Client");
    const p = await newPolicy(c, 10_000);
    await invoiceFor(p, 10_000);
    const chq = await record(c, 5_000, "cheque");
    await api.call("POST", `/receipts/${chq.json.id}/deposit`, { token: accountant, body: {} });
    await api.call("POST", `/receipts/${chq.json.id}/clear`, { token: accountant, body: {} });
    const bounce = await api.call("POST", `/receipts/${chq.json.id}/bounce`, { token: accountant, body: {} });
    expect(bounce.json.bounce.feeInvoiceId).toBeTruthy();

    const pos = await position(c);
    const fee = pos.invoices.find((i: any) => i.kind === "fee");
    expect(fee.outstanding.amountMinor).toBe(KES(1_500));
    expect(pos.outstanding.amountMinor).toBe(KES(10_085 + 1_500));

    // The next payment settles the fee first, as the tenant's rules say.
    const next = await record(c, 1_500, "cash");
    expect(next.json.allocations[0].invoiceId).toBe(fee.id);
    expect(await balance("4100")).toBe(-KES(1_500));
  });

  it("client credit is applied to the next invoice automatically", async () => {
    await publishConfig({ finance: { returnedChequeFeeMinor: KES(1_500), overpaymentTreatment: "client_credit" } }, "overpayments become credit");
    const c = await newClient("Credit Client");
    const p1 = await newPolicy(c, 1_000);
    await invoiceFor(p1, 1_000);
    const r = await record(c, 3_490, "bank"); // owes 1,044.50 incl. levies; the rest is overpaid
    expect(r.json.holdingKind).toBe("client_credit");
    const held = (await position(c)).clientCredit.amountMinor;
    expect(held).toBeGreaterThan(0);

    const p2 = await newPolicy(c, 1_000);
    const inv2 = await invoiceFor(p2, 1_000);
    expect(inv2.paid.amountMinor).toBeGreaterThan(0); // credit went straight onto it
    const pos = await position(c);
    expect(pos.clientCredit.amountMinor).toBeLessThan(held);
  });
});

describe("concurrency", () => {
  it("two receipts racing for the same invoice never pay it twice", async () => {
    const c = await newClient("Race Client");
    const p = await newPolicy(c, 10_000);
    const inv = await invoiceFor(p, 10_000);
    const owed = inv.total.amountMinor;
    const [a, b] = await Promise.all([
      api.call("POST", "/receipts", { token: accountant, body: { clientId: c, amountMinor: owed, method: "cash" } }),
      api.call("POST", "/receipts", { token: accountant, body: { clientId: c, amountMinor: owed, method: "bank" } }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const [paid] = await q<{ s: string }>(`SELECT COALESCE(SUM(amount_minor),0)::text s FROM finance.allocations WHERE invoice_id='${inv.id}'`);
    expect(Number(paid.s)).toBe(owed); // exactly once
    expect((await position(c)).outstanding.amountMinor).toBe(0);
  });
});

describe("who may do what", () => {
  it("recording and allocating are accountant/admin; reading is finance.view", async () => {
    const c = await newClient();
    const body = { clientId: c, amountMinor: 100, method: "cash" };
    expect((await api.call("POST", "/receipts", { token: sales, body })).status).toBe(403);
    expect((await api.call("POST", "/receipts", { token: supervisor, body })).status).toBe(403);
    expect((await api.call("GET", "/receipts", { token: sales })).status).toBe(403);
    expect((await api.call("GET", "/receipts", { token: supervisor })).status).toBe(200);
    expect((await api.call("POST", "/invoices", { token: supervisor, body: { kind: "fee", clientId: c, amountMinor: 100 } })).status).toBe(403);
    expect((await api.call("POST", "/allocations/x/reverse", { token: supervisor, body: { reason: "nope nope" } })).status).toBe(403);
    expect((await api.call("GET", "/receipts")).status).toBe(401); // API key alone is not enough
  });
});
