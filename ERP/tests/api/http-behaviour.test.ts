import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;
let accountant: string;

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
  accountant = await api.login("accountant@test.local");
});
afterAll(() => app.close());

describe("response headers", () => {
  it("compresses large JSON for clients that accept gzip", async () => {
    const res = await fetch(`${app.baseUrl}/insurers`, { headers: { authorization: `Bearer ${admin}`, "accept-encoding": "gzip" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect((await res.json()).length).toBeGreaterThan(10);
  });

  it("does not compress small responses", async () => {
    const res = await fetch(`${app.baseUrl}/health`, { headers: { "accept-encoding": "gzip" } });
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  it("never lets per-user API data be cached", async () => {
    for (const path of ["/parties", "/auth/me", "/receipts", "/kpis"]) {
      const r = await api.call("GET", path, { token: accountant });
      expect(r.headers.get("cache-control"), path).toBe("no-store");
    }
    const portal = await api.call("GET", "/portal/config", { apiKey: null });
    expect(portal.headers.get("cache-control")).toBe("no-store");
  });
});

describe("signed-in staff identity", () => {
  it("reports the role's permissions once, sorted, and nothing else about the session", async () => {
    const me = await api.call("GET", "/auth/me", { token: accountant });
    expect(me.status).toBe(200);
    expect(Object.keys(me.json).sort()).toEqual(["fullName", "id", "mfaEnabled", "mfaEnrollmentRequired", "permissions", "roleId"]);
    expect(me.json.permissions).toEqual([...me.json.permissions].sort());
    expect(me.json.permissions).toContain("receipt.record");
    expect(me.json.permissions).not.toContain("tenant_config.manage");
  });

  it("takes a role change into effect on the very next request", async () => {
    const { db } = await import("../../db/client");
    const { sql } = await import("drizzle-orm");
    expect((await api.call("GET", "/receipts", { token: accountant })).status).toBe(200);
    await db.execute(sql`UPDATE access.staff SET role_id = 'sales_agent' WHERE email = 'accountant@test.local'`);
    expect((await api.call("GET", "/receipts", { token: accountant })).status).toBe(403);
    await db.execute(sql`UPDATE access.staff SET role_id = 'accountant' WHERE email = 'accountant@test.local'`);
    expect((await api.call("GET", "/receipts", { token: accountant })).status).toBe(200);
  });

  it("locks out a deactivated account immediately", async () => {
    const { db } = await import("../../db/client");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`UPDATE access.staff SET active = false WHERE email = 'accountant@test.local'`);
    expect((await api.call("GET", "/auth/me", { token: accountant })).status).toBe(401);
    await db.execute(sql`UPDATE access.staff SET active = true WHERE email = 'accountant@test.local'`);
  });
});

describe("journal entries", () => {
  it("can be paged and searched, with the total in X-Total-Count", async () => {
    const period = new Date().toISOString().slice(0, 7);
    const [y, m] = period.split("-").map(Number);
    await api.call("POST", "/accounting-periods", { token: accountant, body: { id: period, startDate: `${period}-01`, endDate: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) } });
    for (let i = 0; i < 3; i++) {
      const r = await api.call("POST", "/journal-entries", { token: accountant, body: {
        periodId: new Date().toISOString().slice(0, 7), entryDate: new Date().toISOString().slice(0, 10), description: `Paging check ${i}`,
        lines: [{ accountCode: "5001", debitKes: 10 + i }, { accountCode: "1000", creditKes: 10 + i }],
      } });
      expect(r.status, r.text).toBe(200);
    }
    const page = await api.call("GET", "/journal-entries?limit=2&offset=0&q=Paging%20check", { token: accountant });
    expect(page.status).toBe(200);
    expect(page.json).toHaveLength(2);
    expect(page.headers.get("x-total-count")).toBe("3");
    expect(page.json[0].lines.length).toBe(2);
    const rest = await api.call("GET", "/journal-entries?limit=2&offset=2&q=Paging%20check", { token: accountant });
    expect(rest.json).toHaveLength(1);
    // without ?limit the original unpaged array is returned
    const all = await api.call("GET", "/journal-entries", { token: accountant });
    expect(Array.isArray(all.json)).toBe(true);
    expect(all.headers.get("x-total-count")).toBeNull();
  });
});

describe("payments", () => {
  it("shows allocated and unallocated balances per payment", async () => {
    const party = await api.call("POST", "/parties", { body: { fullName: "Legacy Payer", partyType: "individual" } });
    const pay = await api.call("POST", "/payments", { token: accountant, body: { partyId: party.json.id, totalAmountKes: 1000, method: "bank" } });
    expect(pay.status, pay.text).toBe(200);
    const list = await api.call("GET", `/payments?partyId=${party.json.id}`, { token: accountant });
    expect(list.json[0]).toMatchObject({ allocatedKes: 0, unallocatedKes: 1000 });
  });
});
