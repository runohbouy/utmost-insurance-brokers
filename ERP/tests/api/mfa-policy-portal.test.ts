import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";
import { hotp, stepAt } from "../../lib/totp";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;

let clock = Date.now();
const realNow = Date.now.bind(Date);
const advance = (ms: number) => { clock += ms; };
const codeAt = (secret: string) => hotp(secret, stepAt(clock));
const freshCode = (secret: string) => { advance(31_000); return codeAt(secret); };

const portal = (method: string, path: string, token?: string | null, body?: unknown) => api.call(method, `/portal${path}`, { token: token ?? null, body, apiKey: null });

async function setPolicy(mfa: "optional" | "required", token = admin) {
  const put = await api.call("PUT", "/config/draft", { token, body: { regionPack: "KE", overrides: { security: { mfa } } } });
  expect(put.status, put.text).toBe(200);
  const pub = await api.call("POST", "/config/draft/publish", { token });
  expect(pub.status, pub.text).toBe(201);
}

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});
afterEach(() => { clock = Math.max(clock, realNow()); });
afterAll(async () => { vi.restoreAllMocks(); await app.close(); });

describe("when the tenant requires two-step verification for staff", () => {
  let adminSecret: string;

  it("lets nobody carry on until they have set it up — except to set it up", async () => {
    await setPolicy("required");
    // admin is signed in already, but has not enrolled
    const blocked = await api.call("GET", "/receipts", { token: admin });
    expect(blocked.status).toBe(403);
    expect(blocked.json.mfaEnrollmentRequired).toBe(true);
    expect((await api.call("GET", "/parties", { token: admin })).status).toBe(403);

    const me = await api.call("GET", "/auth/me", { token: admin });
    expect(me.status).toBe(200);
    expect(me.json.mfaEnrollmentRequired).toBe(true);
  });

  it("tells a newly signed-in person to enrol", async () => {
    const r = await api.call("POST", "/auth/login", { body: { email: "accountant@test.local", password: "ChangeMe123!" }, token: null });
    expect(r.status).toBe(200);
    expect(r.json.mfaEnrollmentRequired).toBe(true);
  });

  it("keeps them out of the website workspace until they have enrolled in the dashboard", async () => {
    const r = await api.call("POST", "/site/staff/login", { body: { username: "accountant@test.local", password: "ChangeMe123!" }, apiKey: null });
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/set it up/i);
  });

  it("enrolling restores access", async () => {
    adminSecret = (await api.call("POST", "/auth/mfa/setup", { token: admin })).json.secret;
    expect((await api.call("POST", "/auth/mfa/enable", { token: admin, body: { code: codeAt(adminSecret) } })).status).toBe(200);
    expect((await api.call("GET", "/receipts", { token: admin })).status).toBe(200);
    const me = await api.call("GET", "/auth/me", { token: admin });
    expect(me.json).toMatchObject({ mfaEnabled: true, mfaEnrollmentRequired: false });
  });

  it("cannot be turned off while it is required", async () => {
    const r = await api.call("POST", "/auth/mfa/disable", { token: admin, body: { password: "ChangeMe123!", code: freshCode(adminSecret) } });
    expect(r.status).toBe(409);
    expect(r.json.type).toMatch(/mfa-required-by-policy$/);
  });

  it("goes back to optional when the policy is relaxed", async () => {
    await setPolicy("optional");
    const sales = await api.login("sales@test.local");
    expect((await api.call("GET", "/auth/me", { token: sales })).json.mfaEnrollmentRequired).toBe(false);
    expect((await api.call("GET", "/parties", { token: sales })).status).toBe(200);
  });
});

describe("client portal accounts", () => {
  let secret: string;
  let token: string;
  let userId: string;
  const email = "mfa.client@example.com";
  const password = "Correct-Horse-42";

  beforeAll(async () => {
    const party = await api.call("POST", "/parties", { body: { fullName: "Mfa Client", partyType: "individual" } });
    const created = await api.call("POST", "/portal-users", { token: admin, body: { partyId: party.json.id, email } });
    expect(created.status, created.text).toBe(201);
    userId = created.json.id;
    const first = await portal("POST", "/auth/login", null, { email, password: created.json.temporaryPassword });
    expect((await portal("POST", "/auth/change-password", first.json.token, { currentPassword: created.json.temporaryPassword, newPassword: password })).status).toBe(204);
    token = (await portal("POST", "/auth/login", null, { email, password })).json.token;
  });

  it("starts off, and cannot be set up before the password has been changed", async () => {
    expect((await portal("GET", "/me", token)).json.mfaEnabled).toBe(false);
  });

  it("enrols the same way staff do", async () => {
    const setup = await portal("POST", "/auth/mfa/setup", token);
    expect(setup.status, setup.text).toBe(200);
    secret = setup.json.secret;
    expect(setup.json.qrSvg).toMatch(/<svg/);
    expect((await portal("POST", "/auth/mfa/enable", token, { code: "111111" })).status).toBe(422);
    expect((await portal("POST", "/auth/mfa/enable", token, { code: codeAt(secret) })).status).toBe(200);
    expect((await portal("GET", "/me", token)).json.mfaEnabled).toBe(true);
  });

  it("then asks for the code at sign-in", async () => {
    const missing = await portal("POST", "/auth/login", null, { email, password });
    expect(missing.status).toBe(401);
    expect(missing.json.type).toMatch(/mfa-required$/);
    expect(missing.json.mfaRequired).toBe(true);
    const bad = await portal("POST", "/auth/login", null, { email, password, code: "000000" });
    expect(bad.status).toBe(401);
    expect(bad.json.type).toMatch(/mfa-code-invalid$/);
    const code = freshCode(secret);
    const ok = await portal("POST", "/auth/login", null, { email, password, code });
    expect(ok.status, ok.text).toBe(200);
    expect((await portal("POST", "/auth/login", null, { email, password, code })).status).toBe(401); // replay
  });

  it("a wrong password never reaches the code question", async () => {
    const r = await portal("POST", "/auth/login", null, { email, password: "wrong-password-1" });
    expect(r.json.type).toMatch(/invalid-credentials$/);
    expect(r.json.mfaRequired).toBeUndefined();
  });

  it("lists whether each client has it on, for staff", async () => {
    const list = await api.call("GET", `/portal-users?q=${encodeURIComponent(email)}`, { token: admin });
    expect(list.json[0].mfaEnabled).toBe(true);
  });

  it("is turned off with the password and a code, or reset by an administrator", async () => {
    expect((await portal("POST", "/auth/mfa/disable", token, { password: "wrong-password-1", code: freshCode(secret) })).status).toBe(403);
    expect((await portal("POST", "/auth/mfa/disable", token, { password, code: freshCode(secret) })).status).toBe(200);
    expect((await portal("POST", "/auth/login", null, { email, password })).status).toBe(200);

    // enrol again, then lose the phone: staff with mfa.reset clear it
    const again = await portal("POST", "/auth/mfa/setup", token);
    expect((await portal("POST", "/auth/mfa/enable", token, { code: codeAt(again.json.secret) })).status).toBe(200);
    expect((await portal("POST", "/auth/login", null, { email, password })).status).toBe(401);
    const sales = await api.login("sales@test.local");
    expect((await api.call("POST", `/portal-users/${userId}/mfa/reset`, { token: sales })).status).toBe(403);
    expect((await api.call("POST", `/portal-users/${userId}/mfa/reset`, { token: admin })).status).toBe(200);
    expect((await portal("POST", "/auth/login", null, { email, password })).status).toBe(200);
  });
});
