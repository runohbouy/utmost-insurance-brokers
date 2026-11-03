import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;

const DESK_VIEWS = ["analytics", "claims", "correspondence", "dashboard", "documents", "insurers", "obligations", "opportunities", "parties", "placement", "policies", "renewals", "tasks"];
const viewsOf = (permissions: string[]) => permissions.filter((p) => p.startsWith("view.")).map((p) => p.slice(5)).sort();

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
});
afterAll(() => app.close());

describe("menu views per role", () => {
  it("every role that existed before keeps every screen", async () => {
    for (const email of [SEEDED.admin, SEEDED.underwriter, SEEDED.claims, "accountant@test.local", "supervisor@test.local", "sales@test.local"]) {
      const me = await api.call("GET", "/auth/me", { token: await api.login(email) });
      expect(viewsOf(me.json.permissions), email).toHaveLength(19);
    }
  });

  describe("the desk underwriter", () => {
    let token: string;
    let perms: string[];

    beforeAll(async () => {
      const created = await api.call("POST", "/staff", { token: admin, body: {
        fullName: "Desk Underwriter", email: "desk.underwriter@test.local", roleId: "underwriter_desk", password: "Desk-Passw0rd-1!",
        jobTitle: "Underwriter", department: "Underwriting", branch: "Nairobi HQ", employmentType: "full_time", hireDate: "2026-11-03",
      } });
      expect(created.status, created.text).toBe(200);
      token = await api.login("desk.underwriter@test.local", "Desk-Passw0rd-1!");
      perms = (await api.call("GET", "/auth/me", { token })).json.permissions;
    });

    it("sees only the screens an underwriter works in", () => {
      expect(viewsOf(perms)).toEqual(DESK_VIEWS);
      for (const hidden of ["finance", "receipts", "producers", "hr", "complaints", "settings"]) expect(perms).not.toContain(`view.${hidden}`);
    });

    it("can do exactly what the Underwriter role can do", async () => {
      const underwriter = (await api.call("GET", "/auth/me", { token: await api.login(SEEDED.underwriter) })).json.permissions as string[];
      const abilities = (list: string[]) => list.filter((p) => !p.startsWith("view.")).sort();
      expect(abilities(perms)).toEqual(abilities(underwriter));
      expect(perms).toEqual(expect.arrayContaining(["insurer_rate.manage", "underwriting.approve", "analytics.view"]));
    });

    it("is still held back by the server on anything outside those abilities", async () => {
      expect((await api.call("GET", "/receipts", { token })).status).toBe(403);
      expect((await api.call("POST", "/payments", { token, body: {} })).status).toBe(403);
      expect((await api.call("GET", "/config/current", { token })).status).toBe(403);
      expect((await api.call("POST", "/insurer-rates", { token, body: {} })).status).not.toBe(403);
    });
  });
});
