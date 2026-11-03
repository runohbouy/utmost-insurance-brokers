// ---------------------------------------------------------------------------
// Encrypts small secrets (an authenticator seed) before they are stored, so a
// copy of the database alone does not hand anyone a working second factor.
//
// AES-256-GCM with a fresh random nonce per value; the key is derived from the
// server's JWT_SECRET (HKDF), so rotating that secret invalidates stored seeds —
// users re-enrol. Format:  v1.<nonce>.<ciphertext>.<tag>   (base64url parts)
// ---------------------------------------------------------------------------
import crypto from "crypto";

const key = (secret: string) => Buffer.from(crypto.hkdfSync("sha256", secret, "utmost-secretbox", "mfa-seed-v1", 32));

export function seal(plain: string, secret: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), nonce);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), ct.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

/** Returns the plaintext, or null if the value was tampered with or sealed under a different secret. */
export function open(sealed: string, secret: string): string | null {
  const [version, nonce, ct, tag] = sealed.split(".");
  if (version !== "v1" || !nonce || !ct || !tag) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(secret), Buffer.from(nonce, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
