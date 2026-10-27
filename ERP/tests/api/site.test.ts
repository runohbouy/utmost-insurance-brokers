import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";
import { CASES } from "../fixtures/site-golden-cases";

// The website API (/api/site) was moved here from the studio app's own server.
// Part of this file proves the move changed nothing: the quote engine's output
// is compared with output captured from the old studio server (the fixture).
// The rest covers what changed on purpose: real staff auth instead of shared
// passwords, permissions on the admin routes, and no open data leaks.

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/site-golden.json"), "utf8"));

// Quote ids are random per call; everything else must match exactly.
const normalize = (v: any): any =>
  Array.isArray(v) ? v.map(normalize)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" && typeof x === "string" && /^quote-\d+-\d+-\d+$/.test(x) ? "quote-ID" : normalize(x)]))
  : v;

let app: TestApp;
let client: ReturnType<typeof makeClient>;
const site = (p: string) => `/site${p}`;
const origin = () => app.baseUrl.replace(/\/api$/, "");
let admin: string, underwriter: string, claims: string, sales: string;

beforeAll(async () => {
  app = await startApp();
  client = makeClient(app.baseUrl);
  await seedExtraStaff();
  [admin, underwriter, claims, sales] = await Promise.all([
    client.login(SEEDED.admin), client.login(SEEDED.underwriter), client.login(SEEDED.claims), client.login("sales@test.local"),
  ]);
});
afterAll(() => app.close());

describe("quote engine matches the old studio server", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await client.call("POST", site(`/${c.path}`), { apiKey: null, body: c.body });
      expect(res.status).toBe(golden[c.name].status);
      expect(normalize(res.json)).toEqual(golden[c.name].body);
    });
  }

  it("serves the public logo map with no login", async () => {
    const logos = await client.call("GET", site("/insurer-logos"), { apiKey: null });
    expect(logos.status).toBe(200);
    expect(logos.json).toEqual(golden["GET insurer-logos"].body);
  });
});

describe("staff sign-in uses the ERP accounts", () => {
  it("signs in with an ERP staff email and password", async () => {
    const res = await client.call("POST", site("/staff/login"), { apiKey: null, body: { username: SEEDED.admin, password: "ChangeMe123!" } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ staffId: "staff-admin", fullName: "Amina Hassan", role: "Admin" });
    expect(res.json.token).toBeTruthy();
    expect(res.json.expiresAt).toBeGreaterThan(Date.now());
  });

  it("the token it issues also works on the ERP dashboard API", async () => {
    const res = await client.call("POST", site("/staff/login"), { apiKey: null, body: { username: SEEDED.admin, password: "ChangeMe123!" } });
    expect((await client.call("GET", "/auth/me", { token: res.json.token, apiKey: null })).status).toBe(200);
  });

  it.each([
    ["the old shared-password accounts", { username: "underwriter", password: "Utmost@2026" }],
    ["a wrong password", { username: SEEDED.admin, password: "nope" }],
    ["an unknown email", { username: "nobody@test.local", password: "ChangeMe123!" }],
  ])("rejects %s", async (_label, body) => {
    const res = await client.call("POST", site("/staff/login"), { apiKey: null, body });
    expect(res.status).toBe(401);
  });

  it("rejects missing or non-string credentials", async () => {
    expect((await client.call("POST", site("/staff/login"), { apiKey: null, body: {} })).status).toBe(400);
    expect((await client.call("POST", site("/staff/login"), { apiKey: null, body: { username: { $ne: 1 }, password: 5 } })).status).toBe(400);
  });
});

describe("staff-only routes", () => {
  type Who = "none" | "admin" | "underwriter" | "claims" | "sales";
  const tokens = () => ({ none: null, admin, underwriter, claims, sales } as Record<Who, string | null>);

  // [method, path, who may pass the gate]. "Pass" = anything but 401/403.
  const ROUTES: [string, string, Who[]][] = [
    ["GET", "/admin/rates", ["admin", "underwriter"]],
    ["POST", "/admin/rates", ["admin", "underwriter"]],
    ["POST", "/insurers", ["admin", "underwriter"]],
    ["DELETE", "/insurers/x", ["admin", "underwriter"]],
    ["POST", "/insurer-logos", ["admin", "underwriter"]],
    ["DELETE", "/insurer-logos/x", ["admin", "underwriter"]],
    ["GET", "/compliance-logs", ["admin"]],
    ["GET", "/claims", ["admin", "underwriter", "claims", "sales"]],
    ["GET", "/room-scans", ["admin", "underwriter", "claims", "sales"]],
    ["GET", "/staff", ["admin", "underwriter", "claims", "sales"]],
    ["POST", "/compliance-logs", ["admin", "underwriter", "claims", "sales"]],
  ];

  for (const [method, p, allowed] of ROUTES) {
    for (const who of ["none", "admin", "underwriter", "claims", "sales"] as Who[]) {
      const ok = allowed.includes(who);
      it(`${method} ${p}: ${who} ${ok ? "gets through" : who === "none" ? "is rejected (401)" : "is denied (403)"}`, async () => {
        const res = await client.call(method, site(p), { apiKey: null, token: tokens()[who], body: {} });
        if (ok) expect([401, 403]).not.toContain(res.status);
        else expect(res.status).toBe(who === "none" ? 401 : 403);
      });
    }
  }

  it("the staff directory lists ERP staff without secrets", async () => {
    const res = await client.call("GET", site("/staff"), { apiKey: null, token: admin });
    expect(res.json.find((s: any) => s.id === "staff-admin")).toMatchObject({ fullName: "Amina Hassan", role: "Admin" });
    expect(res.text).not.toMatch(/password/i);
  });
});

describe("routes that used to leak data no longer exist", () => {
  it.each(["/parties", "/policies", "/complaints", "/endorsements", "/premium-confirmations", "/pending-approvals", "/authorized-persons", "/beneficial-owners", "/premium-adjustments", "/staff/staff-1", "/quotes"])(
    "GET %s is gone", async (p) => {
      const res = await client.call("GET", site(p), { apiKey: null });
      expect(res.status).toBe(404);
    });

  it("claims can no longer be listed anonymously", async () => {
    expect((await client.call("GET", site("/claims"), { apiKey: null })).status).toBe(401);
  });
});

describe("public quote capture", () => {
  it("ignores an id, timestamp or assignee supplied by the caller", async () => {
    const res = await client.call("POST", site("/quotes"), {
      apiKey: null,
      body: { id: "hijacked", timestamp: "1999-01-01", assignedStaffId: "staff-admin", createdByStaffId: "staff-admin", category: "motor", totalPremium: 1234, insurerId: "icea" },
    });
    expect(res.status).toBe(200);
    expect(res.json.id).toMatch(/^quote-pers-/);
    expect(res.json.id).not.toBe("hijacked");
    expect(res.json.timestamp).not.toBe("1999-01-01");
    expect(res.json.assignedStaffId).toBe("staff-underwriter"); // first active underwriter in the ERP
    expect(res.json.totalPremiumKES).toBe(1234);
  });

  it("creates unique quote ids under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => client.call("POST", site("/quotes"), { apiKey: null, body: { category: "motor" } })));
    expect(new Set(results.map((r) => r.json.id)).size).toBe(15);
  });
});

describe("insurer logos", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("lets an underwriter upload, serves the file safely, and deletes it", async () => {
    const up = await client.call("POST", site("/insurer-logos"), { apiKey: null, token: underwriter, body: { insurerId: "testco", imageBase64: PNG, mimeType: "image/png" } });
    expect(up.status).toBe(200);
    expect(up.json.src).toMatch(/^\/api\/site\/files\/logos\/testco\?v=\d+/);

    const file = await fetch(`${origin()}${up.json.src}`);
    expect(file.status).toBe(200);
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(file.headers.get("cross-origin-resource-policy")).toBe("cross-origin");

    expect((await client.call("GET", site("/insurer-logos"), { apiKey: null })).json.testco).toBeTruthy();
    expect((await client.call("DELETE", site("/insurer-logos/testco"), { apiKey: null, token: underwriter })).status).toBe(200);
    expect((await fetch(`${origin()}${up.json.src}`)).status).toBe(404);
  });

  it("cannot be uploaded by staff without insurer_rate.manage", async () => {
    const res = await client.call("POST", site("/insurer-logos"), { apiKey: null, token: claims, body: { insurerId: "x", imageBase64: PNG } });
    expect(res.status).toBe(403);
  });

  it("sanitises the insurer id so a path cannot escape the upload folder", async () => {
    const res = await client.call("POST", site("/insurer-logos"), { apiKey: null, token: admin, body: { insurerId: "../../evil", imageBase64: PNG, mimeType: "image/png" } });
    expect(res.status).toBe(200);
    expect(res.json.insurerId).toBe("evil");
    await client.call("DELETE", site("/insurer-logos/evil"), { apiKey: null, token: admin });
  });
});

describe("error handling", () => {
  it("never leaks internal error text from a failing public route", async () => {
    const res = await client.call("POST", site("/generate-quotes"), { apiKey: null, body: { category: "motor", params: null } });
    expect(res.status).toBeLessThan(600);
    expect(res.text).not.toMatch(/at .*\.(ts|js):\d+/);
  });
});
