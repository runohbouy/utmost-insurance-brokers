import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";
import { rebucket } from "../../modules/analytics/buckets";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;
let accountant: string;
let underwriter: string;
let sales: string;
let insurerId: string;

const KES = (major: number) => Math.round(major * 100);
let counter = 0;

async function newClient() {
  const r = await api.call("POST", "/parties", { body: { fullName: `KPI Client ${++counter}`, partyType: "individual" } });
  return r.json.id as string;
}
async function newInvoice(clientId: string, netKes: number) {
  const p = await api.call("POST", "/policies", { body: { clientId, insurerId, category: "07", premiumAmount: netKes, endDate: "2027-12-31" } });
  const inv = await api.call("POST", "/invoices", { token: accountant, body: { kind: "premium", policyId: p.json.id, amountMinor: KES(netKes), dueDate: "2020-01-01", issueDate: "2020-01-01" } });
  expect(inv.status, inv.text).toBe(201);
  return inv.json;
}
const record = (clientId: string, amountKes: number, extra: Record<string, unknown> = {}) =>
  api.call("POST", "/receipts", { token: accountant, body: { clientId, amountMinor: KES(amountKes), method: "cash", ...extra } });
const kpi = async (key: string, query = "", token = accountant) => (await api.call("GET", `/kpis/${key}${query}`, { token }));

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
  accountant = await api.login("accountant@test.local");
  underwriter = await api.login(SEEDED.underwriter);
  sales = await api.login("sales@test.local");
  const ins = await api.call("POST", "/insurers", { token: admin, body: { name: "KPI Insurer", authorizedClasses: ["07"] } });
  insurerId = ins.json.id;
  await api.call("POST", "/insurer-rates", { token: admin, body: { insurerId, category: "07", commissionRatePct: 10 } });
  // no levies, so invoice totals equal the premium
  await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { tax: { taxes: [] } } } });
  const pub = await api.call("POST", "/config/draft/publish", { token: admin });
  expect(pub.status, pub.text).toBe(201);
});
afterAll(() => app.close());

describe("who sees which KPI", () => {
  it("accountants see money and operational KPIs", async () => {
    const r = await api.call("GET", "/kpis", { token: accountant });
    const keys = r.json.map((k: any) => k.key);
    expect(keys).toContain("cash_cleared");
    expect(keys).toContain("receipts_recorded");
  });

  it("underwriters see operational KPIs only", async () => {
    const r = await api.call("GET", "/kpis", { token: underwriter });
    expect(r.json.every((k: any) => k.permission === "analytics.view")).toBe(true);
    expect(r.json.length).toBeGreaterThan(0);
    const forbidden = await kpi("cash_cleared", "", underwriter);
    expect(forbidden.status).toBe(403);
    expect(forbidden.json.type).toMatch(/kpi-forbidden$/);
    expect((await kpi("receipts_recorded", "", underwriter)).status).toBe(200);
  });

  it("sales agents see none, and the summary leaves out what they may not read", async () => {
    expect((await api.call("GET", "/kpis", { token: sales })).json).toEqual([]);
    expect((await api.call("GET", "/kpis/summary", { token: sales })).json.kpis).toEqual([]);
    const summary = await api.call("GET", "/kpis/summary", { token: underwriter });
    expect(summary.json.kpis.map((k: any) => k.key)).not.toContain("outstanding_premium");
  });

  it("needs a session, and unknown KPIs are 404", async () => {
    expect((await api.call("GET", "/kpis")).status).toBe(401);
    expect((await kpi("nope")).status).toBe(404);
  });
});

describe("KPI values follow the ledger", () => {
  let clientId: string;

  it("billed, outstanding and collection rate move as money arrives", async () => {
    clientId = await newClient();
    const inv = await newInvoice(clientId, 10_000);
    expect(inv.total.amountMinor).toBe(KES(10_000));

    const range = "?from=2020-01-01&to=2020-01-31";
    expect((await kpi("invoices_billed", range)).json.value).toBe(KES(10_000));
    expect((await kpi("collection_rate", range)).json.value).toBe(0);
    const outstandingBefore = (await kpi("outstanding_premium")).json.value;
    const overdueBefore = (await kpi("overdue_premium")).json.value;
    expect(overdueBefore).toBeGreaterThanOrEqual(KES(10_000)); // due in 2020

    await record(clientId, 4_000);
    expect((await kpi("collection_rate", range)).json.value).toBe(4000); // 40.00%
    expect((await kpi("collection_rate", range)).json.display).toBe("40.0%");
    expect((await kpi("outstanding_premium")).json.value).toBe(outstandingBefore - KES(4_000));

    await record(clientId, 6_000);
    expect((await kpi("collection_rate", range)).json.value).toBe(10000);
  });

  it("commission earned and cleared receipts count this period, and a bounced cheque takes its share back", async () => {
    const before = (await kpi("cash_cleared")).json.value;
    const commissionBefore = (await kpi("commission_earned")).json.value;
    const c = await newClient();
    await newInvoice(c, 5_000);
    const chq = await record(c, 5_000, { method: "cheque", instrumentNo: `K${++counter}` });
    await api.call("POST", `/receipts/${chq.json.id}/deposit`, { token: accountant, body: {} });
    await api.call("POST", `/receipts/${chq.json.id}/clear`, { token: accountant, body: {} });
    expect((await kpi("cash_cleared")).json.value).toBe(before + KES(5_000));
    expect((await kpi("commission_earned")).json.value).toBe(commissionBefore + KES(500));
    expect((await kpi("cheques_bounced")).json.value).toBe(0);

    await api.call("POST", `/receipts/${chq.json.id}/bounce`, { token: accountant, body: {} });
    expect((await kpi("cash_cleared")).json.value).toBe(before);
    expect((await kpi("commission_earned")).json.value).toBe(commissionBefore);
    expect((await kpi("cheques_bounced")).json.value).toBe(1);
  });

  it("reports suspense separately from client credit", async () => {
    const c = await newClient();
    const s0 = (await kpi("suspense_balance")).json.value;
    await record(c, 700); // nothing owed → suspense under the default rule
    expect((await kpi("suspense_balance")).json.value).toBe(s0 + KES(700));
  });

  it("formats money in the tenant's locale and currency", async () => {
    const r = await kpi("outstanding_premium");
    expect(r.json.currency).toBe("KES");
    expect(r.json.display).toMatch(/KES|Ksh/);
    expect(r.json.asOf.timeZone).toBe("Africa/Nairobi");
  });

  it("checks the range", async () => {
    expect((await kpi("cash_cleared", "?from=2026-02-30")).status).toBe(422);
    expect((await kpi("cash_cleared", "?from=2026-03-02&to=2026-03-01")).status).toBe(422);
    expect((await kpi("cash_cleared", "?from=2020-01-01&to=2026-01-01")).status).toBe(422);
    expect((await kpi("cash_cleared", "?granularity=hourly")).status).toBe(422);
  });
});

describe("a day belongs to the tenant's time zone", () => {
  // 22:30 UTC on 30 June is already 1 July in Nairobi (UTC+3).
  const lateEvening = "2026-06-30T22:30:00Z";

  it("buckets by Nairobi days by default", async () => {
    const c = await newClient();
    await record(c, 100, { receivedAt: lateEvening });
    const r = await kpi("receipts_recorded", "?from=2026-06-30&to=2026-07-01");
    expect(r.json.series).toEqual([{ bucket: "2026-07-01", value: 1 }]);
    expect(r.json.period.timeZone).toBe("Africa/Nairobi");
  });

  it("buckets the same receipt on 30 June once the tenant operates in UTC", async () => {
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { tax: { taxes: [] }, regional: { timeZone: "UTC" } } } });
    expect((await api.call("POST", "/config/draft/publish", { token: admin })).status).toBe(201);
    const r = await kpi("receipts_recorded", "?from=2026-06-30&to=2026-07-01");
    expect(r.json.series).toEqual([{ bucket: "2026-06-30", value: 1 }]);
  });

  it("rolls days up into weeks and months", () => {
    const days = [
      { date: "2026-06-28", value: 1 }, // Sunday
      { date: "2026-06-29", value: 2 }, // Monday
      { date: "2026-07-05", value: 4 }, // Sunday
      { date: "2026-07-06", value: 8 }, // Monday
    ];
    expect(rebucket(days, "week", 1)).toEqual([
      { bucket: "2026-06-22", value: 1 }, { bucket: "2026-06-29", value: 6 }, { bucket: "2026-07-06", value: 8 },
    ]);
    expect(rebucket(days, "month", 1)).toEqual([{ bucket: "2026-06", value: 3 }, { bucket: "2026-07", value: 12 }]);
    expect(rebucket(days, "week", 0)[0]).toEqual({ bucket: "2026-06-28", value: 3 }); // weeks that start on Sunday
  });
});

describe("tenant entitlements", () => {
  it("a currency cannot change once the tenant has money documents", async () => {
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "US", overrides: {} } });
    const r = await api.call("POST", "/config/draft/publish", { token: admin });
    expect(r.status).toBe(409);
    expect(r.json.type).toMatch(/currency-change-blocked$/);
    await api.call("DELETE", "/config/draft", { token: admin });
  });

  it("hides analytics when the plan does not include it", async () => {
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { entitlements: { modules: ["finance", "claims", "portal", "commissions"] } } } });
    expect((await api.call("POST", "/config/draft/publish", { token: admin })).status).toBe(201);
    const r = await api.call("GET", "/kpis", { token: accountant });
    expect(r.status).toBe(403);
    expect(r.json.type).toMatch(/module-not-enabled$/);
  });
});
