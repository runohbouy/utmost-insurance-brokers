import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY, PASSWORD, SEEDED, makeClient, seedExtraStaff, setStaffActive, startApp, type TestApp } from "../helpers";

let app: TestApp;
let client: ReturnType<typeof makeClient>;

beforeAll(async () => {
  app = await startApp();
  client = makeClient(app.baseUrl);
  await seedExtraStaff();
});
afterAll(() => app.close());

describe("API key and session-less callers", () => {
  it("serves the health probe with no credentials, and checks the database", async () => {
    const res = await client.call("GET", "/health", { apiKey: null });
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("ok");
  });

  it("rejects a request with no API key and no session", async () => {
    expect((await client.call("GET", "/parties", { apiKey: null })).status).toBe(401);
  });

  it("rejects a wrong API key", async () => {
    expect((await client.call("GET", "/parties", { apiKey: "nope" })).status).toBe(401);
  });

  it("lets the quote-generator (key only) reach parties and policies", async () => {
    expect((await client.call("GET", "/parties")).status).toBe(200);
    expect((await client.call("GET", "/policies")).status).toBe(200);
  });

  it.each([
    ["GET", "/staff"],
    ["GET", "/employees"],
    ["GET", "/journal-entries"],
    ["GET", "/audit-log"],
    ["GET", "/documents"],
    ["GET", "/payments"],
    ["POST", "/staff"],
    ["POST", "/payments"],
    ["POST", "/journal-entries"],
    ["DELETE", "/insurers/x"],
  ])("blocks the key-only caller from %s %s", async (method, path) => {
    const res = await client.call(method, path, { body: {} });
    expect(res.status).toBe(401);
  });

  it("does not need the API key once a staff session is present", async () => {
    const token = await client.login(SEEDED.admin);
    const res = await client.call("GET", "/parties", { token, apiKey: null });
    expect(res.status).toBe(200);
  });
});

describe("login", () => {
  it("rejects a missing body", async () => {
    expect((await client.call("POST", "/auth/login", { body: {} })).status).toBe(400);
  });

  it("rejects non-string credentials", async () => {
    expect((await client.call("POST", "/auth/login", { body: { email: { $ne: "" }, password: 123 } })).status).toBe(400);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrongPassword = await client.call("POST", "/auth/login", { body: { email: SEEDED.admin, password: "wrong" } });
    const unknownEmail = await client.call("POST", "/auth/login", { body: { email: "nobody@test.local", password: "wrong" } });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.json).toEqual(unknownEmail.json);
  });

  it("issues a token carrying only the staff id and resolves it via /auth/me", async () => {
    const token = await client.login(SEEDED.admin);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "id"]);

    const me = await client.call("GET", "/auth/me", { token });
    expect(me.status).toBe(200);
    expect(me.json.permissions).toContain("finance.record");
  });
});

describe("session tokens", () => {
  it("rejects a tampered token", async () => {
    const token = await client.login(SEEDED.admin);
    const res = await client.call("GET", "/auth/me", { token: token.slice(0, -2) + "xx" });
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with another secret", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const forged = jwt.sign({ id: "staff-admin" }, "some-other-secret", { algorithm: "HS256" });
    expect((await client.call("GET", "/auth/me", { token: forged })).status).toBe(401);
  });

  it("rejects an unsigned (alg=none) token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ id: "staff-admin" })).toString("base64url");
    expect((await client.call("GET", "/auth/me", { token: `${header}.${body}.` })).status).toBe(401);
  });

  it("revokes access immediately when the staff member is deactivated", async () => {
    const token = await client.login("sales@test.local");
    expect((await client.call("GET", "/auth/me", { token })).status).toBe(200);

    await setStaffActive("staff-test-sales", false);
    expect((await client.call("GET", "/auth/me", { token })).status).toBe(401);
    expect((await client.call("POST", "/auth/login", { body: { email: "sales@test.local", password: PASSWORD } })).status).toBe(401);

    await setStaffActive("staff-test-sales", true);
    expect((await client.call("GET", "/auth/me", { token })).status).toBe(200);
  });
});

describe("security headers", () => {
  it("sets nosniff and hides the framework", async () => {
    const res = await client.call("GET", "/health", { apiKey: null });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

// Kept last: it burns through the per-IP failed-login budget for this file.
describe("login rate limiting", () => {
  it("blocks further attempts after 10 failures", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await client.call("POST", "/auth/login", { body: { email: SEEDED.admin, password: "wrong" } })).status);
    }
    expect(statuses.slice(0, 3).every((s) => s === 401 || s === 429)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

void API_KEY;
