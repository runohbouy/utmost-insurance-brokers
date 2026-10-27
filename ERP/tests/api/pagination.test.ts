import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, startApp, type TestApp } from "../helpers";

let app: TestApp;
let client: ReturnType<typeof makeClient>;
let admin: string;

beforeAll(async () => {
  app = await startApp();
  client = makeClient(app.baseUrl);
  admin = await client.login(SEEDED.admin);

  // 30 searchable parties, plus two awkward names for the LIKE-escaping test.
  await Promise.all([
    ...Array.from({ length: 30 }, (_, i) =>
      client.call("POST", "/parties", { token: admin, body: { fullName: `Pager Person ${String(i).padStart(2, "0")}`, partyType: "individual", phoneNumber: `07000000${String(i).padStart(2, "0")}` } }),
    ),
    client.call("POST", "/parties", { token: admin, body: { fullName: "Fifty% Discount Ltd", partyType: "corporate" } }),
    client.call("POST", "/parties", { token: admin, body: { fullName: "Under_score Ltd", partyType: "corporate" } }),
  ]);
});
afterAll(() => app.close());

describe("GET /parties (server-side paging and search)", () => {
  it("still returns the whole list as a plain array when no limit is given", async () => {
    const res = await client.call("GET", "/parties", { token: admin });
    expect(Array.isArray(res.json)).toBe(true);
    expect(res.json.length).toBeGreaterThanOrEqual(32);
    expect(res.headers.get("x-total-count")).toBeNull();
  });

  it("returns one page and the total match count", async () => {
    const res = await client.call("GET", "/parties?limit=10&offset=0&q=Pager", { token: admin });
    expect(res.json).toHaveLength(10);
    expect(res.headers.get("x-total-count")).toBe("30");
  });

  it("pages without overlap or gaps", async () => {
    const ids = new Set<string>();
    for (const offset of [0, 10, 20]) {
      const res = await client.call("GET", `/parties?limit=10&offset=${offset}&q=Pager`, { token: admin });
      res.json.forEach((p: any) => ids.add(p.id));
    }
    expect(ids.size).toBe(30);
  });

  it("returns a short last page and an empty page past the end", async () => {
    const last = await client.call("GET", "/parties?limit=25&offset=25&q=Pager", { token: admin });
    expect(last.json).toHaveLength(5);
    const beyond = await client.call("GET", "/parties?limit=25&offset=500&q=Pager", { token: admin });
    expect(beyond.json).toEqual([]);
    expect(beyond.headers.get("x-total-count")).toBe("30");
  });

  it("searches case-insensitively across name and phone", async () => {
    expect((await client.call("GET", "/parties?limit=50&q=pager%20person%2007", { token: admin })).json).toHaveLength(1);
    const byPhone = await client.call("GET", "/parties?limit=50&q=0700000015", { token: admin });
    expect(byPhone.json.map((p: any) => p.fullName)).toEqual(["Pager Person 15"]);
  });

  it("treats % and _ in the search as literal characters", async () => {
    const percent = await client.call("GET", "/parties?limit=50&q=%25", { token: admin });
    expect(percent.json.map((p: any) => p.fullName)).toEqual(["Fifty% Discount Ltd"]);
    const underscore = await client.call("GET", "/parties?limit=50&q=_", { token: admin });
    expect(underscore.json.map((p: any) => p.fullName)).toEqual(["Under_score Ltd"]);
  });

  it("is safe against SQL-looking input", async () => {
    const res = await client.call("GET", `/parties?limit=10&q=${encodeURIComponent("'; DROP TABLE crm.parties; --")}`, { token: admin });
    expect(res.status).toBe(200);
    expect(res.json).toEqual([]);
    expect((await client.call("GET", "/parties?limit=1", { token: admin })).status).toBe(200);
  });

  it("clamps absurd or invalid paging values", async () => {
    const big = await client.call("GET", "/parties?limit=100000", { token: admin });
    expect(big.json.length).toBeLessThanOrEqual(200);
    const junk = await client.call("GET", "/parties?limit=abc&offset=-5", { token: admin });
    expect(junk.status).toBe(200);
    expect(junk.json.length).toBeLessThanOrEqual(25);
  });

  it("works for the key-only quote-generator caller too", async () => {
    const res = await client.call("GET", "/parties?limit=5");
    expect(res.status).toBe(200);
    expect(res.json).toHaveLength(5);
  });
});

describe("GET /policies (paged, with joined names)", () => {
  let acmeId: string;

  beforeAll(async () => {
    const insurer = await client.call("POST", "/insurers", { token: admin, body: { name: "Zebra Assurance" } });
    const other = await client.call("POST", "/insurers", { token: admin, body: { name: "Lion Cover" } });
    const clientA = await client.call("POST", "/parties", { token: admin, body: { fullName: "Mwende Wanjiku", partyType: "individual" } });
    const clientB = await client.call("POST", "/parties", { token: admin, body: { fullName: "Otieno Kamau", partyType: "individual" } });
    acmeId = insurer.json.id;
    const make = (clientId: string, insurerId: string, category: string) =>
      client.call("POST", "/policies", { body: { clientId, insurerId, category, premiumAmount: 5000, endDate: "2027-12-31" } });
    const created = await Promise.all([
      ...Array.from({ length: 12 }, () => make(clientA.json.id, insurer.json.id, "zz-motor")),
      ...Array.from({ length: 3 }, () => make(clientB.json.id, other.json.id, "zz-fire")),
    ]);
    expect(created.every((r) => r.status === 200)).toBe(true);
  });

  it("returns the plain list unchanged (no joined names) when no limit is given", async () => {
    const res = await client.call("GET", "/policies");
    expect(Array.isArray(res.json)).toBe(true);
    expect(res.json[0]).not.toHaveProperty("clientName");
  });

  it("pages and adds client and insurer names to each row", async () => {
    const res = await client.call("GET", "/policies?limit=5&offset=0&q=Mwende", { token: admin });
    expect(res.json).toHaveLength(5);
    expect(res.headers.get("x-total-count")).toBe("12");
    expect(res.json[0].clientName).toBe("Mwende Wanjiku");
    expect(res.json[0].insurerName).toBe("Zebra Assurance");
  });

  it("searches by client name, insurer name, category, policy number and status", async () => {
    const total = async (q: string) => (await client.call("GET", `/policies?limit=1&q=${encodeURIComponent(q)}`, { token: admin })).headers.get("x-total-count");
    expect(await total("otieno")).toBe("3"); // client name, case-insensitive
    expect(await total("lion")).toBe("3"); // insurer name
    expect(await total("zebra")).toBe("12");
    expect(await total("zz-fire")).toBe("3"); // category (also matches policy numbers, so use a distinctive value)
    expect(await total("Pending")).toBe("15"); // status
    const one = await client.call("GET", "/policies?limit=1&q=Otieno", { token: admin });
    expect(await total(one.json[0].id)).toBe("1"); // policy number
    expect(await total("no-such-thing")).toBe("0");
  });

  it("keeps policies whose client or insurer is missing (left join)", async () => {
    const orphan = await client.call("POST", "/policies", { body: { category: "07", premiumAmount: 1, endDate: "2027-12-31" } });
    const res = await client.call("GET", `/policies?limit=5&q=${orphan.json.id}`, { token: admin });
    expect(res.json).toHaveLength(1);
    expect(res.json[0].clientName).toBeNull();
    void acmeId;
  });

  it("pages without overlap", async () => {
    const seen = new Set<string>();
    for (const offset of [0, 5, 10]) {
      (await client.call("GET", `/policies?limit=5&offset=${offset}&q=Pending`, { token: admin })).json.forEach((p: any) => seen.add(p.id));
    }
    expect(seen.size).toBe(15);
  });
});

describe("GET /opportunities (paged, with joined names)", () => {
  beforeAll(async () => {
    const party = await client.call("POST", "/parties", { token: admin, body: { fullName: "Opportunity Owner", partyType: "individual" } });
    const producer = await client.call("POST", "/producers", { token: admin, body: { producerType: "agent", name: "Broker Bob", commissionSplitPct: 10 } });
    const created = await Promise.all([
      ...Array.from({ length: 8 }, () => client.call("POST", "/opportunities", { token: admin, body: { partyId: party.json.id, class: "motor", source: "referral", producerId: producer.json.id } })),
      ...Array.from({ length: 4 }, () => client.call("POST", "/opportunities", { token: admin, body: { partyId: party.json.id, class: "medical", source: "walk-in" } })),
    ]);
    expect(created.every((r) => r.status === 200)).toBe(true);
  });

  it("returns the plain list unchanged when no limit is given", async () => {
    const res = await client.call("GET", "/opportunities", { token: admin });
    expect(Array.isArray(res.json)).toBe(true);
    expect(res.json[0]).not.toHaveProperty("partyName");
  });

  it("pages and adds party and producer names", async () => {
    const res = await client.call("GET", "/opportunities?limit=5&q=Broker%20Bob", { token: admin });
    expect(res.json).toHaveLength(5);
    expect(res.headers.get("x-total-count")).toBe("8");
    expect(res.json[0].partyName).toBe("Opportunity Owner");
    expect(res.json[0].producerName).toBe("Broker Bob");
  });

  it("searches by party, class, source, producer and stage", async () => {
    const total = async (q: string) => (await client.call("GET", `/opportunities?limit=1&q=${encodeURIComponent(q)}`, { token: admin })).headers.get("x-total-count");
    expect(await total("opportunity owner")).toBe("12");
    expect(await total("medical")).toBe("4");
    expect(await total("walk-in")).toBe("4");
    expect(await total("referral")).toBe("8");
    expect(await total("New")).toBe("12");
  });

  it("returns opportunities that have no producer", async () => {
    const res = await client.call("GET", "/opportunities?limit=10&q=medical", { token: admin });
    expect(res.json).toHaveLength(4);
    expect(res.json.every((o: any) => o.producerName === null)).toBe(true);
  });
});
