import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { base32Decode, base32Encode, generateSecret, hotp, otpauthUrl, stepAt, totp, verifyTotp } from "../../lib/totp";
import { open, seal } from "../../lib/secretbox";

// RFC 6238 appendix B: secret "12345678901234567890" (ASCII), SHA-1, 8-digit codes. We use 6 digits
// like every authenticator app, which is the last six digits of the published values.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const RFC_VECTORS: [number, string][] = [
  [59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"],
];

describe("TOTP", () => {
  it.each(RFC_VECTORS)("matches the RFC 6238 test vector at t=%d", (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it("matches the RFC 4226 HOTP vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });

  it("accepts the current code and one step either side, but not two", () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), { nowMs: now })).toBe(step);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), { nowMs: now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), { nowMs: now })).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), { nowMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 2), { nowMs: now })).toBeNull();
  });

  it("refuses a code that has already been used, and anything older", () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    const code = hotp(RFC_SECRET, step);
    const used = verifyTotp(RFC_SECRET, code, { nowMs: now });
    expect(used).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, { nowMs: now, afterStep: used })).toBeNull(); // replay
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), { nowMs: now, afterStep: used })).toBeNull(); // older than the last one used
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), { nowMs: now, afterStep: used })).toBe(step + 1);
  });

  it("tolerates spaces and rejects malformed input", () => {
    const now = 1_700_000_000_000;
    const code = hotp(RFC_SECRET, stepAt(now));
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { nowMs: now })).not.toBeNull();
    for (const bad of ["", "12345", "1234567", "abcdef", "12345a", "０１２３４５"]) expect(verifyTotp(RFC_SECRET, bad, { nowMs: now })).toBeNull();
  });

  it("rejects a wrong code", () => {
    expect(verifyTotp(RFC_SECRET, "000000", { nowMs: 1_700_000_000_000 })).toBeNull();
  });

  it("generates 160-bit base32 secrets that differ every time", () => {
    const a = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(generateSecret()).not.toBe(a);
  });

  it("round-trips base32 for arbitrary bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
      expect([...base32Decode(base32Encode(Buffer.from(bytes)))]).toEqual([...bytes]);
    }));
  });

  it("builds an otpauth URI an authenticator can import", () => {
    const url = otpauthUrl({ issuer: "Utmost Insurance Brokers", account: "amina@utmostbrokers.co.ke", secret: "JBSWY3DPEHPK3PXP" });
    expect(url).toBe("otpauth://totp/Utmost%20Insurance%20Brokers:amina%40utmostbrokers.co.ke?secret=JBSWY3DPEHPK3PXP&issuer=Utmost%20Insurance%20Brokers&algorithm=SHA1&digits=6&period=30");
  });
});

describe("secretbox", () => {
  const secret = "a-long-enough-server-secret-for-tests-0000";

  it("round-trips a value", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP", secret);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(open(sealed, secret)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses a fresh nonce each time", () => {
    expect(seal("x", secret)).not.toBe(seal("x", secret));
  });

  it("refuses a different secret, a tampered value and garbage", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP", secret);
    expect(open(sealed, "another-secret-another-secret-0000000")).toBeNull();
    const parts = sealed.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(open(parts.join("."), secret)).toBeNull();
    expect(open("garbage", secret)).toBeNull();
    expect(open("", secret)).toBeNull();
  });
});
