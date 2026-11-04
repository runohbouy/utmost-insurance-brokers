import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, startApp, type TestApp } from "../helpers";
import { visibleViews } from "../../src/navAccess";
import { TEST_PASSWORD, TEST_USERS } from "../../scripts/test-users-roster";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;
const menus = new Map<string, string[]>();
const abilities = new Map<string, string[]>();

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  admin = await api.login(SEEDED.admin);
  for (const u of TEST_USERS) {
    const created = await api.call("POST", "/staff", { token: admin, body: {
      fullName: u.fullName, email: u.email, roleId: u.roleId, password: TEST_PASSWORD, jobTitle: u.jobTitle, department: u.department,
      branch: "Nairobi HQ", employmentType: "full_time", hireDate: "2026-11-04",
    } });
    expect(created.status, `${u.email}: ${created.text}`).toBe(200);
    const token = await api.login(u.email, TEST_PASSWORD);
    const me = (await api.call("GET", "/auth/me", { token })).json;
    menus.set(u.roleId, visibleViews(me.permissions));
    abilities.set(u.roleId, (me.permissions as string[]).filter((p) => !p.startsWith("view.")));
  }
});
afterAll(() => app.close());

describe("the test roster", () => {
  it("has one working account for each kind of job", () => {
    expect(TEST_USERS.map((u) => u.roleId).sort()).toEqual(["accountant", "admin", "claims_officer", "hr_officer", "operations", "sales_agent", "supervisor", "underwriter", "underwriter_desk"]);
    expect(new Set(TEST_USERS.map((u) => u.email)).size).toBe(TEST_USERS.length);
    for (const u of TEST_USERS) expect(u.email.endsWith(".test"), "reserved TLD: can never reach a real mailbox").toBe(true);
  });

  it("the administrator sees every screen", () => {
    expect(menus.get("admin")).toHaveLength(19);
  });

  it("operations is a servicing and back-office role", () => {
    expect(menus.get("operations")).toEqual(["dashboard", "analytics", "parties", "correspondence", "policies", "renewals", "claims", "complaints", "documents", "tasks", "obligations"]);
    expect(abilities.get("operations")!.sort()).toEqual(["analytics.view", "obligation.manage"]);
    for (const hidden of ["finance", "receipts", "hr", "settings", "producers", "placement", "insurers"]) expect(menus.get("operations")).not.toContain(hidden);
  });

  it("the HR officer sees people screens and little else", () => {
    expect(menus.get("hr_officer")).toEqual(["dashboard", "tasks", "hr"]);
    expect(abilities.get("hr_officer")!.sort()).toEqual(["employee.manage", "leave.decide", "performance_review.manage"]);
  });

  it("the desk underwriter has the underwriter's abilities with a focused menu", () => {
    expect(abilities.get("underwriter_desk")!.sort()).toEqual(abilities.get("underwriter")!.sort());
    for (const hidden of ["finance", "receipts", "hr", "settings", "producers", "complaints"]) expect(menus.get("underwriter_desk")).not.toContain(hidden);
  });

  it("only money roles see the money screens", () => {
    for (const role of ["accountant", "supervisor", "admin"]) expect(menus.get(role), role).toEqual(expect.arrayContaining(["finance", "receipts"]));
    for (const role of ["underwriter", "claims_officer", "sales_agent", "operations", "hr_officer", "underwriter_desk"]) {
      expect(menus.get(role), role).not.toContain("finance");
      expect(menus.get(role), role).not.toContain("receipts");
    }
  });

  it("only the administrator and finance supervisor reach settings", () => {
    const withSettings = [...menus].filter(([, m]) => m.includes("settings")).map(([role]) => role).sort();
    expect(withSettings).toEqual(["admin", "supervisor"]);
  });

  it("the roles do what their titles say on the server, not just in the menu", async () => {
    const as = async (email: string) => api.login(email, TEST_PASSWORD);
    const accountant = await as("test.accountant@utmostbrokers.test");
    const operations = await as("test.operations@utmostbrokers.test");
    const hr = await as("test.hr@utmostbrokers.test");
    expect((await api.call("GET", "/receipts", { token: accountant })).status).toBe(200);
    expect((await api.call("GET", "/receipts", { token: operations })).status).toBe(403);
    expect((await api.call("GET", "/receipts", { token: hr })).status).toBe(403);
    expect((await api.call("POST", "/staff", { token: hr, body: {} })).status).not.toBe(403); // HR manages employees
    expect((await api.call("POST", "/staff", { token: operations, body: {} })).status).toBe(403);
    expect((await api.call("POST", "/obligations", { token: operations, body: {} })).status).not.toBe(403); // operations manages compliance obligations
    expect((await api.call("POST", "/obligations", { token: accountant, body: {} })).status).toBe(403);
  });
});
