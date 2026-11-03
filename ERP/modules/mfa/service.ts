// ---------------------------------------------------------------------------
// Two-step verification, shared by staff and portal accounts.
//
// Both account tables carry the same columns (see migrate-028-mfa.ts), so one service
// handles either. Properties worth knowing:
//   * the authenticator seed is stored encrypted and never leaves the server after the
//     one response that shows it during enrolment
//   * a code can be used once (the last accepted 30-second step is recorded, and that
//     update is conditional, so two simultaneous requests cannot both succeed with it)
//   * five wrong codes in a row lock code checking for five minutes
//   * enrolment replaces any half-finished earlier attempt; an already-enabled account
//     must be disabled (needs a current code) or reset by an administrator first
// ---------------------------------------------------------------------------
import QRCode from "qrcode";
import { db } from "../../db/client";
import { conflict, Problem, unprocessable } from "../../lib/http/problem";
import { one, sql, type Executor } from "../../lib/sql";
import { open, seal } from "../../lib/secretbox";
import { generateSecret, otpauthUrl, verifyTotp } from "../../lib/totp";

const ex = db as unknown as Executor;

export type MfaTable = "access.staff" | "access.portal_users";
export interface MfaSubject { table: MfaTable; id: string; /** what the authenticator app shows, e.g. the email address */ account: string }

const MAX_FAILURES = 5;
const LOCK_MINUTES = 5;
// the table name is chosen from this closed set, never from input
const table = (t: MfaTable) => sql.raw(t === "access.staff" ? "access.staff" : "access.portal_users");

interface Row { mfa_enabled: boolean; mfa_secret_enc: string | null; mfa_last_step: unknown; mfa_failed_attempts: number; mfa_locked_until: unknown }
const load = (s: MfaSubject) => one<Row>(ex, sql`SELECT mfa_enabled, mfa_secret_enc, mfa_last_step, mfa_failed_attempts, mfa_locked_until FROM ${table(s.table)} WHERE id = ${s.id}`);

export async function isEnabled(s: MfaSubject): Promise<boolean> {
  return Boolean((await load(s))?.mfa_enabled);
}

/** Step 1 of enrolment: make a seed and show it (as text, an otpauth link and a QR code). Not active until confirmed. */
export async function beginEnrolment(s: MfaSubject, issuer: string, serverSecret: string) {
  const row = await load(s);
  if (!row) throw new Problem(404, "not-found", "Not found");
  if (row.mfa_enabled) throw conflict("mfa-already-enabled", "Two-step verification is already on", "Turn it off first (you will need a current code), or ask an administrator to reset it");
  const secret = generateSecret();
  await ex.execute(sql`UPDATE ${table(s.table)} SET mfa_secret_enc = ${seal(secret, serverSecret)}, mfa_enabled = FALSE, mfa_last_step = NULL, mfa_failed_attempts = 0, mfa_locked_until = NULL WHERE id = ${s.id}`);
  const url = otpauthUrl({ issuer, account: s.account, secret });
  return { secret, otpauthUrl: url, qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, width: 192 }) };
}

/** Marks a code as used and tracks failures. Returns whether the code was good. */
async function check(s: MfaSubject, code: string, serverSecret: string): Promise<{ ok: boolean; locked: boolean }> {
  const row = await load(s);
  if (!row?.mfa_secret_enc) return { ok: false, locked: false };
  if (row.mfa_locked_until && new Date(row.mfa_locked_until as string).getTime() > Date.now()) return { ok: false, locked: true };

  const seed = open(row.mfa_secret_enc, serverSecret);
  const last = row.mfa_last_step == null ? null : Number(row.mfa_last_step);
  const step = seed ? verifyTotp(seed, code, { afterStep: last }) : null;

  if (step !== null) {
    // conditional update: only one of two racing requests with the same code wins
    const won = await ex.execute(sql`UPDATE ${table(s.table)} SET mfa_last_step = ${step}, mfa_failed_attempts = 0, mfa_locked_until = NULL
      WHERE id = ${s.id} AND (mfa_last_step IS NULL OR mfa_last_step < ${step}) RETURNING id`) as unknown as { rows: unknown[] };
    if (won.rows.length > 0) return { ok: true, locked: false };
  }

  const failures = row.mfa_failed_attempts + 1;
  await ex.execute(failures >= MAX_FAILURES
    ? sql`UPDATE ${table(s.table)} SET mfa_failed_attempts = 0, mfa_locked_until = now() + (${LOCK_MINUTES} * interval '1 minute') WHERE id = ${s.id}`
    : sql`UPDATE ${table(s.table)} SET mfa_failed_attempts = ${failures} WHERE id = ${s.id}`);
  return { ok: false, locked: failures >= MAX_FAILURES };
}

const codeProblem = (locked: boolean) => locked
  ? new Problem(429, "mfa-locked", "Too many wrong codes", `Try again in ${LOCK_MINUTES} minutes`)
  : unprocessable("mfa-code-invalid", "That code is not right", "Check the 6-digit code in your authenticator app. Codes change every 30 seconds and can be used once.");

/** Step 2 of enrolment: prove the app is set up by entering a current code. */
export async function confirmEnrolment(s: MfaSubject, code: string, serverSecret: string) {
  const row = await load(s);
  if (row?.mfa_enabled) throw conflict("mfa-already-enabled", "Two-step verification is already on");
  if (!row?.mfa_secret_enc) throw conflict("mfa-not-started", "Start setup first", "Ask for a new setup code, then add it to your authenticator app");
  const r = await check(s, code, serverSecret);
  if (!r.ok) throw codeProblem(r.locked);
  await ex.execute(sql`UPDATE ${table(s.table)} SET mfa_enabled = TRUE, mfa_enrolled_at = now() WHERE id = ${s.id}`);
}

/** Used at sign-in, after the password is already known to be right. */
export async function verifyForLogin(s: MfaSubject, code: string, serverSecret: string): Promise<"ok" | "bad" | "locked"> {
  const r = await check(s, code, serverSecret);
  return r.ok ? "ok" : r.locked ? "locked" : "bad";
}

/** Turn it off. Needs a current code (the password is checked by the caller), so a stolen session cannot quietly remove it. */
export async function disable(s: MfaSubject, code: string, serverSecret: string) {
  if (!(await isEnabled(s))) throw conflict("mfa-not-enabled", "Two-step verification is not on");
  const r = await check(s, code, serverSecret);
  if (!r.ok) throw codeProblem(r.locked);
  await clear(s);
}

/** Administrator recovery for a lost phone: forget the seed so the person can enrol again. */
export async function clear(s: Pick<MfaSubject, "table" | "id">) {
  await ex.execute(sql`UPDATE ${table(s.table)} SET mfa_enabled = FALSE, mfa_secret_enc = NULL, mfa_last_step = NULL, mfa_enrolled_at = NULL, mfa_failed_attempts = 0, mfa_locked_until = NULL WHERE id = ${s.id}`);
}
