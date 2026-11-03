// ---------------------------------------------------------------------------
// Time-based one-time passwords (RFC 6238, built on RFC 4226 HOTP) — the codes
// shown by Google Authenticator, Microsoft Authenticator, 1Password, Authy…
//
// Pure and dependency-free (Node's crypto only). Parameters are the ones every
// authenticator app assumes: HMAC-SHA1, 6 digits, 30-second steps.
//
// A code is accepted within ±1 step of the server clock (clock drift) and each
// step can be used ONCE per account: verifyTotp returns the step that matched so
// the caller can store it and refuse the same code a second time (replay).
// ---------------------------------------------------------------------------
import crypto from "crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new RangeError("not a base32 string");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 160 bits of randomness, base32 encoded — the size RFC 4226 recommends. */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** The code for one time step. */
export function hotp(secret: string, counter: number, digits = DIGITS): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS);
export const totp = (secret: string, nowMs = Date.now()) => hotp(secret, stepAt(nowMs));

/**
 * Checks a submitted code. Returns the matching step (store it, and pass it back as `afterStep`
 * next time so the same code cannot be used twice) or null if the code is wrong or already used.
 */
export function verifyTotp(secret: string, code: string, opts: { nowMs?: number; afterStep?: number | null; window?: number } = {}): number | null {
  const submitted = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(submitted)) return null;
  const now = stepAt(opts.nowMs ?? Date.now());
  const window = opts.window ?? 1;
  let matched: number | null = null;
  // check every step in the window (no early exit) so timing does not reveal which one matched
  for (let step = now - window; step <= now + window; step++) {
    const expected = Buffer.from(hotp(secret, step));
    const given = Buffer.from(submitted);
    if (crypto.timingSafeEqual(expected, given) && matched === null) matched = step;
  }
  if (matched === null) return null;
  if (opts.afterStep != null && matched <= opts.afterStep) return null; // already used (or older than one that was)
  return matched;
}

/** otpauth:// URI that authenticator apps import (usually by scanning it as a QR code). */
export function otpauthUrl(opts: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${encodeURIComponent(opts.issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
