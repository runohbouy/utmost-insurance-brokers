import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";
import { hotp, stepAt } from "../../lib/totp";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;

// The server shares this process, so controlling Date.now() controls which 30-second step it is. That lets a
// test use codes from successive steps (a code can only be used once, and only inside a one-step window).
let clock = Date.now();
const realNow = Date.now.bind(Date);
const advance = (ms: number) => { clock += ms; };
const codeAt = (secret: string, stepOffset = 0) => hotp(secret, stepAt(clock) + stepOffset);
/** A code the server has not seen yet: step the clock on, then read the authenticator. */
const freshCode = (secret: string) => { advance(31_000); return codeAt(secret); };

const login = (email: string, password = "ChangeMe123!", code?: string) => api.call("POST", "/auth/login", { body: { email, password, ...(code ? { code } : {}) }, token: null });
const siteLogin = (email: string, code?: string) => api.call("POST", "/site/staff/login", { body: { username: email, password: "ChangeMe123!", ...(code ? { code } : {}) }, apiKey: null });
const email = "accountant@test.local";

async function q<T = any>(text: string): Promise<T[]> {
  const { db } = await import("../../db/client");
  const { sql } = await import("drizzle-orm");
  return ((await db.execute(sql.raw(text))) as unknown as { rows: T[] }).rows;
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

describe("enrolling", () => {
  let token: string;
  let secret: string;

  it("starts with two-step verification off", async () => {
    token = await api.login(email);
    const me = await api.call("GET", "/auth/me", { token });
    expect(me.json.mfaEnabled).toBe(false);
    expect(me.json.mfaEnrollmentRequired).toBe(false);
  });

  it("needs a signed-in session to start", async () => {
    expect((await api.call("POST", "/auth/mfa/setup", { token: null })).status).toBe(401);
  });

  it("shows the seed once: as text, an otpauth link and a QR code", async () => {
    const r = await api.call("POST", "/auth/mfa/setup", { token });
    expect(r.status).toBe(200);
    secret = r.json.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(r.json.otpauthUrl).toContain(`secret=${secret}`);
    expect(r.json.otpauthUrl).toContain(encodeURIComponent("Utmost Insurance Brokers"));
    expect(r.json.otpauthUrl).toContain(encodeURIComponent(email));
    expect(r.json.qrSvg).toMatch(/^<svg|^<\?xml/);
  });

  it("is not on until a correct code proves the app works", async () => {
    expect((await api.call("GET", "/auth/me", { token })).json.mfaEnabled).toBe(false);
    const wrong = await api.call("POST", "/auth/mfa/enable", { token, body: { code: "000000" } });
    expect(wrong.status).toBe(422);
    expect(wrong.json.type).toMatch(/mfa-code-invalid$/);
    expect((await api.call("POST", "/auth/mfa/enable", { token, body: { code: "12345" } })).status).toBe(422); // malformed
    const ok = await api.call("POST", "/auth/mfa/enable", { token, body: { code: codeAt(secret) } });
    expect(ok.status, ok.text).toBe(200);
    expect((await api.call("GET", "/auth/me", { token })).json.mfaEnabled).toBe(true);
  });

  it("keeps the seed encrypted in the database and out of every API response", async () => {
    const [row] = await q<{ mfa_secret_enc: string }>(`SELECT mfa_secret_enc FROM access.staff WHERE email = '${email}'`);
    expect(row.mfa_secret_enc).toMatch(/^v1\./);
    expect(row.mfa_secret_enc).not.toContain(secret);
    const staff = await api.call("GET", "/staff", { token: admin });
    expect(staff.text).not.toContain(secret);
    expect(staff.text).not.toContain("mfa_secret");
    expect(staff.text).not.toContain("mfaSecret");
  });

  it("cannot be started again while on", async () => {
    const r = await api.call("POST", "/auth/mfa/setup", { token });
    expect(r.status).toBe(409);
    expect(r.json.type).toMatch(/mfa-already-enabled$/);
  });
});

describe("signing in with a second factor", () => {
  let secret: string;

  beforeAll(async () => {
    // a fresh account of its own so the checks above do not interfere
    const t = await api.login("supervisor@test.local");
    secret = (await api.call("POST", "/auth/mfa/setup", { token: t })).json.secret;
    expect((await api.call("POST", "/auth/mfa/enable", { token: t, body: { code: codeAt(secret) } })).status).toBe(200);
  });

  it("a right password alone is no longer enough", async () => {
    const r = await login("supervisor@test.local");
    expect(r.status).toBe(401);
    expect(r.json.mfaRequired).toBe(true);
    expect(r.json.token).toBeUndefined();
  });

  it("does not reveal whether an account has it on until the password is right", async () => {
    const wrongPassword = await login("supervisor@test.local", "not-the-password");
    expect(wrongPassword.json.mfaRequired).toBeUndefined();
    expect(wrongPassword.json.error).toBe("Invalid email or password");
  });

  it("a wrong code is refused, a right one signs in", async () => {
    const bad = await login("supervisor@test.local", "ChangeMe123!", "000000");
    expect(bad.status).toBe(401);
    expect(bad.json.mfaRequired).toBe(true);
    const ok = await login("supervisor@test.local", "ChangeMe123!", freshCode(secret));
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.token).toBeTruthy();
  });

  it("a code can only be used once — replaying it fails", async () => {
    const code = freshCode(secret);
    expect((await login("supervisor@test.local", "ChangeMe123!", code)).status).toBe(200);
    expect((await login("supervisor@test.local", "ChangeMe123!", code)).status).toBe(401);
  });

  it("codes from a previous step are refused once a later one has been used", async () => {
    const older = codeAt(secret, -1);
    const current = freshCode(secret);
    expect((await login("supervisor@test.local", "ChangeMe123!", current)).status).toBe(200);
    expect((await login("supervisor@test.local", "ChangeMe123!", older)).status).toBe(401);
  });

  it("the website staff workspace asks for the code too — it is not a way round it", async () => {
    const missing = await siteLogin("supervisor@test.local");
    expect(missing.status).toBe(401);
    expect(missing.json.mfaRequired).toBe(true);
    const ok = await siteLogin("supervisor@test.local", freshCode(secret));
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.token).toBeTruthy();
  });

  it("five wrong codes lock code checking for five minutes, even for the right code", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await siteLogin("supervisor@test.local", String(100000 + i));
      expect([401, 429]).toContain(r.status);
    }
    const locked = await siteLogin("supervisor@test.local", freshCode(secret));
    expect(locked.status).toBe(429);
    expect(locked.json.error).toMatch(/5 minutes/);
    advance(6 * 60_000);
    const back = await siteLogin("supervisor@test.local", codeAt(secret));
    expect(back.status, back.text).toBe(200);
  });
});

describe("turning it off and recovering", () => {
  let secret: string;
  let token: string;

  beforeAll(async () => {
    token = await api.login("sales@test.local");
    secret = (await api.call("POST", "/auth/mfa/setup", { token })).json.secret;
    expect((await api.call("POST", "/auth/mfa/enable", { token, body: { code: codeAt(secret) } })).status).toBe(200);
  });

  it("needs the password and a current code, so a stolen session cannot quietly remove it", async () => {
    const noPassword = await api.call("POST", "/auth/mfa/disable", { token, body: { password: "wrong-password", code: freshCode(secret) } });
    expect(noPassword.status).toBe(403);
    const noCode = await api.call("POST", "/auth/mfa/disable", { token, body: { password: "ChangeMe123!", code: "000000" } });
    expect(noCode.status).toBe(422);
    const ok = await api.call("POST", "/auth/mfa/disable", { token, body: { password: "ChangeMe123!", code: freshCode(secret) } });
    expect(ok.status, ok.text).toBe(200);
    expect((await api.call("GET", "/auth/me", { token })).json.mfaEnabled).toBe(false);
    expect((await login("sales@test.local")).status).toBe(200); // no code needed again
  });

  it("an administrator can reset a colleague who lost their phone; nobody else can", async () => {
    const t = await api.login("accountant@test.local").catch(() => null); // accountant has it on (first describe)
    expect(t).toBeNull(); // proves the first describe's account really does need a code now
    const staff = (await api.call("GET", "/staff", { token: admin })).json as { id: string; email: string }[];
    const target = staff.find((s) => s.email === "accountant@test.local")!;

    const sales = await api.login("sales@test.local");
    expect((await api.call("POST", `/staff/${target.id}/mfa/reset`, { token: sales })).status).toBe(403);
    const reset = await api.call("POST", `/staff/${target.id}/mfa/reset`, { token: admin });
    expect(reset.status, reset.text).toBe(200);
    expect((await login("accountant@test.local")).status).toBe(200); // password alone works again, and they can re-enrol
    expect((await q(`SELECT 1 FROM compliance.audit_log WHERE action = 'MFA_RESET'`)).length).toBe(1);
    expect((await api.call("POST", "/staff/nobody/mfa/reset", { token: admin })).status).toBe(404);
  });
});
