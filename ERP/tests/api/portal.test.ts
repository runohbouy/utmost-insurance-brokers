import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;
let accountant: string;
let sales: string;
let insurerId: string;

const KES = (major: number) => Math.round(major * 100);
let counter = 0;

async function newClient(name: string) {
  const r = await api.call("POST", "/parties", { body: { fullName: name, partyType: "individual" } });
  return r.json.id as string;
}
async function owe(clientId: string, netKes: number) {
  const p = await api.call("POST", "/policies", { body: { clientId, insurerId, category: "07", premiumAmount: netKes, endDate: "2027-12-31" } });
  const inv = await api.call("POST", "/invoices", { token: accountant, body: { kind: "premium", policyId: p.json.id, amountMinor: KES(netKes), dueDate: "2027-03-01", issueDate: "2027-01-01" } });
  expect(inv.status, inv.text).toBe(201);
  return { policyId: p.json.id as string, invoice: inv.json };
}
const pay = (clientId: string, kes: number, method = "mpesa") =>
  api.call("POST", "/receipts", { token: accountant, body: { clientId, amountMinor: KES(kes), method, ...(method === "cheque" ? { instrumentNo: `P${++counter}` } : {}) } });

async function portalUser(partyId: string, email: string) {
  const r = await api.call("POST", "/portal-users", { token: admin, body: { partyId, email } });
  expect(r.status, r.text).toBe(201);
  return r.json as { id: string; temporaryPassword: string; email: string };
}
const portalCall = (method: string, path: string, token?: string, body?: unknown) =>
  api.call(method, `/portal${path}`, { token, body, apiKey: null });

/** Create, sign in, and clear the forced password change. */
async function readyClient(partyId: string, email: string) {
  const u = await portalUser(partyId, email);
  const first = await portalCall("POST", "/auth/login", undefined, { email, password: u.temporaryPassword });
  expect(first.status, first.text).toBe(200);
  const change = await portalCall("POST", "/auth/change-password", first.json.token, { currentPassword: u.temporaryPassword, newPassword: "Correct-Horse-42" });
  expect(change.status, change.text).toBe(204);
  const again = await portalCall("POST", "/auth/login", undefined, { email, password: "Correct-Horse-42" });
  expect(again.json.mustChangePassword).toBe(false);
  return { id: u.id, token: again.json.token as string };
}

let alice: { partyId: string; id: string; token: string; invoiceId: string; receiptId: string; policyId: string };
let bob: { partyId: string; id: string; token: string; invoiceId: string; receiptId: string; policyId: string };

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
  accountant = await api.login("accountant@test.local");
  sales = await api.login("sales@test.local");
  const ins = await api.call("POST", "/insurers", { token: admin, body: { name: "Portal Insurer", authorizedClasses: ["07"] } });
  insurerId = ins.json.id;
  await api.call("POST", "/insurer-rates", { token: admin, body: { insurerId, category: "07", commissionRatePct: 10 } });
  await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { brand: { displayName: "Utmost Insurance Brokers" }, tax: { taxes: [] } } } });
  expect((await api.call("POST", "/config/draft/publish", { token: admin })).status).toBe(201);

  for (const [name, email, who] of [["Alice Wanjiru", "alice@example.com", "alice"], ["Bob Otieno", "bob@example.com", "bob"]] as const) {
    const partyId = await newClient(name);
    const { policyId, invoice } = await owe(partyId, 10_000);
    const receipt = await pay(partyId, 4_000);
    const user = await readyClient(partyId, email);
    const rec = { partyId, id: user.id, token: user.token, invoiceId: invoice.id as string, receiptId: receipt.json.id as string, policyId };
    if (who === "alice") alice = rec; else bob = rec;
  }
});
afterAll(() => app.close());

describe("signing in", () => {
  it("shows the tenant's brand on the sign-in page without a session", async () => {
    const r = await portalCall("GET", "/config");
    expect(r.status).toBe(200);
    expect(r.json.name).toBe("Utmost Insurance Brokers");
    expect(r.json.brand.primaryColor).toMatch(/^#/);
    expect(r.json.portalEnabled).toBe(true);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    const unknown = await portalCall("POST", "/auth/login", undefined, { email: "nobody@example.com", password: "whatever-123456" });
    const wrong = await portalCall("POST", "/auth/login", undefined, { email: "alice@example.com", password: "wrong-password-1" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.json).toEqual({ ...wrong.json, instance: unknown.json.instance });
    expect(unknown.json.type).toMatch(/invalid-credentials$/);
  });

  it("makes a first-time user change the temporary password before anything else", async () => {
    const partyId = await newClient("Carol Njeri");
    const u = await portalUser(partyId, "carol@example.com");
    const login = await portalCall("POST", "/auth/login", undefined, { email: "carol@example.com", password: u.temporaryPassword });
    expect(login.json.mustChangePassword).toBe(true);
    expect((await portalCall("GET", "/me", login.json.token)).status).toBe(200);
    const blocked = await portalCall("GET", "/invoices", login.json.token);
    expect(blocked.status).toBe(403);
    expect(blocked.json.type).toMatch(/password-change-required$/);

    const weak = await portalCall("POST", "/auth/change-password", login.json.token, { currentPassword: u.temporaryPassword, newPassword: "short1" });
    expect(weak.status).toBe(422);
    expect(weak.json.type).toMatch(/weak-password$/);
    const wrongCurrent = await portalCall("POST", "/auth/change-password", login.json.token, { currentPassword: "not-the-password", newPassword: "Correct-Horse-42" });
    expect(wrongCurrent.status).toBe(403);
    const same = await portalCall("POST", "/auth/change-password", login.json.token, { currentPassword: u.temporaryPassword, newPassword: u.temporaryPassword + "1" });
    expect([204, 422]).toContain(same.status);
  });

  it("locks the account after repeated failures, then lets the right password back in once it expires", async () => {
    const partyId = await newClient("Dan Kamau");
    const u = await portalUser(partyId, "dan@example.com");
    for (let i = 0; i < 5; i++) {
      expect((await portalCall("POST", "/auth/login", undefined, { email: "dan@example.com", password: `wrong-password-${i}` })).status).toBe(401);
    }
    // even the right password is refused while locked — with the same generic answer
    const locked = await portalCall("POST", "/auth/login", undefined, { email: "dan@example.com", password: u.temporaryPassword });
    expect(locked.status).toBe(401);
    expect(locked.json.type).toMatch(/invalid-credentials$/);

    const { db } = await import("../../db/client");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`UPDATE access.portal_users SET locked_until = now() - interval '1 minute' WHERE id = ${u.id}`);
    expect((await portalCall("POST", "/auth/login", undefined, { email: "dan@example.com", password: u.temporaryPassword })).status).toBe(200);
  });

  it("stops working the moment staff disable the account", async () => {
    expect((await portalCall("GET", "/me", bob.token)).status).toBe(200);
    expect((await api.call("PATCH", `/portal-users/${bob.id}`, { token: admin, body: { active: false } })).status).toBe(200);
    expect((await portalCall("GET", "/me", bob.token)).status).toBe(401);
    const login = await portalCall("POST", "/auth/login", undefined, { email: "bob@example.com", password: "Correct-Horse-42" });
    expect(login.status).toBe(401);
    await api.call("PATCH", `/portal-users/${bob.id}`, { token: admin, body: { active: true } });
    const back = await portalCall("POST", "/auth/login", undefined, { email: "bob@example.com", password: "Correct-Horse-42" });
    expect(back.status).toBe(200);
    bob.token = back.json.token;
  });
});

describe("a client sees only their own records", () => {
  it("lists only my invoices, receipts and policies", async () => {
    const inv = await portalCall("GET", "/invoices", alice.token);
    expect(inv.json.map((i: any) => i.id)).toEqual([alice.invoiceId]);
    expect(inv.json[0].clientId).toBe(alice.partyId);

    const rec = await portalCall("GET", "/receipts", alice.token);
    expect(rec.json.map((r: any) => r.id)).toEqual([alice.receiptId]);

    const pol = await portalCall("GET", "/policies", alice.token);
    expect(pol.json.map((p: any) => p.id)).toEqual([alice.policyId]);
    expect(pol.headers.get("x-total-count")).toBe("1");
  });

  it("answers 404 — not 403 — for another client's invoice or receipt", async () => {
    const inv = await portalCall("GET", `/invoices/${bob.invoiceId}`, alice.token);
    const rec = await portalCall("GET", `/receipts/${bob.receiptId}`, alice.token);
    const nothing = await portalCall("GET", "/invoices/inv-does-not-exist", alice.token);
    expect(inv.status).toBe(404);
    expect(rec.status).toBe(404);
    expect(nothing.status).toBe(404);
    expect(inv.json.detail).toBe(nothing.json.detail.replace("inv-does-not-exist", bob.invoiceId)); // indistinguishable from a missing record
  });

  it("cannot widen the query with a clientId parameter", async () => {
    const inv = await portalCall("GET", `/invoices?clientId=${bob.partyId}&limit=50`, alice.token);
    expect(inv.json.map((i: any) => i.id)).toEqual([alice.invoiceId]);
    const rec = await portalCall("GET", `/receipts?clientId=${bob.partyId}&q=`, alice.token);
    expect(rec.json.map((r: any) => r.id)).toEqual([alice.receiptId]);
  });

  it("searches within my own receipts only", async () => {
    const r = await portalCall("GET", `/receipts?q=${encodeURIComponent("Bob")}`, alice.token);
    expect(r.json).toEqual([]);
  });

  it("shows my position, not anyone else's", async () => {
    const pos = await portalCall("GET", "/position", alice.token);
    expect(pos.json.outstanding.amountMinor).toBe(KES(6_000));
    expect(pos.json.openInvoices.map((i: any) => i.id)).toEqual([alice.invoiceId]);
  });

  it("exposes no staff-side or internal detail on a receipt", async () => {
    const r = await portalCall("GET", `/receipts/${alice.receiptId}`, alice.token);
    expect(r.status).toBe(200);
    for (const internal of ["recordedBy", "configVersionId", "events", "holdingKind", "clientId", "idempotencyKey"]) {
      expect(r.json[internal], internal).toBeUndefined();
    }
    expect(r.json.applied.amountMinor).toBe(KES(4_000));
    expect(r.json.applications[0]).toMatchObject({ kind: "applied" });
  });

  it("produces a statement whose running balance ends at what is owed", async () => {
    const s = await portalCall("GET", "/statement", alice.token);
    expect(s.status).toBe(200);
    expect(s.json.entries.map((e: any) => e.type)).toEqual(["invoice", "payment"]);
    expect(s.json.entries[0].amount.amountMinor).toBe(KES(10_000));
    expect(s.json.entries[1].amount.amountMinor).toBe(-KES(4_000));
    expect(s.json.closingBalance.amountMinor).toBe(KES(6_000));
    expect(s.json.timeZone).toBe("Africa/Nairobi");
    const none = await portalCall("GET", "/statement?from=2099-01-01", alice.token);
    expect(none.json.entries).toEqual([]);
    expect(none.json.closingBalance.amountMinor).toBe(KES(6_000));
  });

  it("a bounced cheque shows up honestly on the client's statement", async () => {
    const c = await newClient("Eve Achieng");
    await owe(c, 5_000);
    const { token } = await readyClient(c, "eve@example.com");
    const chq = await pay(c, 5_000, "cheque");
    await api.call("POST", `/receipts/${chq.json.id}/deposit`, { token: accountant, body: {} });
    expect((await portalCall("GET", "/position", token)).json.chequesInClearing).toHaveLength(1);
    await api.call("POST", `/receipts/${chq.json.id}/clear`, { token: accountant, body: {} });
    expect((await portalCall("GET", "/position", token)).json.outstanding.amountMinor).toBe(0);
    await api.call("POST", `/receipts/${chq.json.id}/bounce`, { token: accountant, body: {} });
    const pos = await portalCall("GET", "/position", token);
    expect(pos.json.outstanding.amountMinor).toBe(KES(5_000));
    const s = await portalCall("GET", "/statement", token);
    expect(s.json.entries.map((e: any) => e.type)).toEqual(["invoice", "payment", "reversal"]);
    expect(s.json.closingBalance.amountMinor).toBe(KES(5_000));
  });
});

describe("portal and staff sessions are separate worlds", () => {
  it("a portal token is useless on the staff API", async () => {
    for (const path of ["/parties", "/auth/me", "/receipts", "/kpis", "/config/effective"]) {
      const r = await api.call("GET", path, { token: alice.token });
      expect([401, 403], path).toContain(r.status);
      expect(r.status, path).not.toBe(200);
    }
  });

  it("a staff token is useless on the portal", async () => {
    expect((await portalCall("GET", "/me", admin)).status).toBe(401);
    expect((await portalCall("GET", "/invoices", accountant)).status).toBe(401);
  });

  it("the portal needs a token and offers no other route", async () => {
    expect((await portalCall("GET", "/me")).status).toBe(401);
    expect((await portalCall("GET", "/invoices")).status).toBe(401);
    expect((await portalCall("GET", "/receipts/", "garbage")).status).toBe(401);
    expect((await portalCall("GET", "/staff", alice.token)).status).toBe(404);
    expect((await portalCall("POST", "/receipts", alice.token, { clientId: alice.partyId, amountMinor: 1, method: "cash" })).status).toBe(404);
  });
});

describe("managing portal accounts", () => {
  it("is for staff with portal.manage only", async () => {
    expect((await api.call("GET", "/portal-users", { token: sales })).status).toBe(403);
    expect((await api.call("POST", "/portal-users", { token: accountant, body: { partyId: alice.partyId, email: "x@example.com" } })).status).toBe(403);
    expect((await api.call("GET", "/portal-users", { token: admin })).status).toBe(200);
  });

  it("lists and searches accounts, and never returns a password hash", async () => {
    const r = await api.call("GET", "/portal-users?limit=10&q=alice", { token: admin });
    expect(r.json).toHaveLength(1);
    expect(r.json[0]).toMatchObject({ email: "alice@example.com", partyName: "Alice Wanjiru", active: true });
    expect(JSON.stringify(r.json)).not.toMatch(/hash|temporaryPassword|"password"/i);
  });

  it("rejects a duplicate email and an unknown client", async () => {
    expect((await api.call("POST", "/portal-users", { token: admin, body: { partyId: alice.partyId, email: "ALICE@example.com" } })).status).toBe(409);
    const ghost = await api.call("POST", "/portal-users", { token: admin, body: { partyId: "ghost", email: "ghost@example.com" } });
    expect(ghost.status).toBe(422);
  });

  it("resets a password to a new one-time value that must be changed", async () => {
    const reset = await api.call("POST", `/portal-users/${alice.id}/reset-password`, { token: admin });
    expect(reset.status).toBe(200);
    expect(reset.json.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const old = await portalCall("POST", "/auth/login", undefined, { email: "alice@example.com", password: "Correct-Horse-42" });
    expect(old.status).toBe(401);
    const fresh = await portalCall("POST", "/auth/login", undefined, { email: "alice@example.com", password: reset.json.temporaryPassword });
    expect(fresh.json.mustChangePassword).toBe(true);
    alice.token = fresh.json.token;
    const change = await portalCall("POST", "/auth/change-password", alice.token, { currentPassword: reset.json.temporaryPassword, newPassword: "Correct-Horse-42" });
    expect(change.status).toBe(204);
    alice.token = (await portalCall("POST", "/auth/login", undefined, { email: "alice@example.com", password: "Correct-Horse-42" })).json.token;
  });

  it("records who created and reset accounts in the audit log", async () => {
    const { db } = await import("../../db/client");
    const { sql } = await import("drizzle-orm");
    const r = (await db.execute(sql`SELECT DISTINCT action FROM compliance.audit_log WHERE entity_type = 'portal_user'`)) as unknown as { rows: { action: string }[] };
    expect(r.rows.map((x) => x.action)).toEqual(expect.arrayContaining(["PORTAL_USER_CREATED", "PORTAL_PASSWORD_RESET", "PORTAL_USER_DISABLED"]));
  });
});

describe("tenant plan", () => {
  it("enforces the portal user limit", async () => {
    const { db } = await import("../../db/client");
    const { sql } = await import("drizzle-orm");
    const count = ((await db.execute(sql`SELECT COUNT(*)::int AS n FROM access.portal_users WHERE active`)) as unknown as { rows: { n: number }[] }).rows[0].n;
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { tax: { taxes: [] }, entitlements: { limits: { portalUsers: count } } } } });
    expect((await api.call("POST", "/config/draft/publish", { token: admin })).status).toBe(201);
    const over = await api.call("POST", "/portal-users", { token: admin, body: { partyId: alice.partyId, email: "overflow@example.com" } });
    expect(over.status).toBe(409);
    expect(over.json.type).toMatch(/portal-user-limit$/);
  });

  it("closes the portal entirely when the module is not in the plan", async () => {
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { tax: { taxes: [] }, entitlements: { modules: ["finance", "claims", "analytics", "commissions"] } } } });
    expect((await api.call("POST", "/config/draft/publish", { token: admin })).status).toBe(201);
    const login = await portalCall("POST", "/auth/login", undefined, { email: "alice@example.com", password: "Correct-Horse-42" });
    expect(login.status).toBe(403);
    expect(login.json.type).toMatch(/module-not-enabled$/);
    expect((await portalCall("GET", "/invoices", alice.token)).status).toBe(403);
  });
});
