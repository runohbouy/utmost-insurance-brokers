// ---------------------------------------------------------------------------
// Client portal — authentication and the client-scoped read model.
//
// Security model:
//   * A portal token is signed with a key DERIVED from the staff secret
//     (HMAC of "portal-v1"), so a portal token can never verify as a staff
//     token and vice versa, even though both are HS256 JWTs.
//   * Every request re-reads the portal user (active? same tenant?) so disabling
//     an account takes effect at once.
//   * Every read below takes the party id from the AUTHENTICATED principal, never
//     from the request, and puts it in the SQL WHERE clause. A record belonging
//     to someone else is indistinguishable from one that does not exist (404).
//   * Repeated failures lock the account for a while; the response is the same
//     generic 401 whether the email exists, the password is wrong, or it is locked.
// ---------------------------------------------------------------------------
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../../db/client";
import { requireModule } from "../../lib/config/service";
import { Money } from "../../lib/money";
import { localDate } from "../../lib/time";
import { conflict, notFound, Problem, unprocessable } from "../../lib/http/problem";
import { iso, newId, num, one, rows, sql, type Executor } from "../../lib/sql";
import * as mfa from "../mfa/service";
import { clientPosition, getInvoice, getReceipt, listInvoices, listReceipts, type Ctx, type Page } from "../receipts/service";

const ex = db as unknown as Executor;
const TOKEN_HOURS = 2;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-portal-password", 10);

export interface PortalPrincipal { userId: string; tenantId: string; partyId: string; email: string; mustChangePassword: boolean }

export const portalSecret = (staffSecret: string) => crypto.createHmac("sha256", staffSecret).update("portal-v1").digest("hex");

const invalid = () => new Problem(401, "invalid-credentials", "Invalid email or password");

interface UserRow { id: string; tenant_id: string; party_id: string; email: string; password_hash: string; must_change_password: boolean; active: boolean; failed_attempts: number; locked_until: unknown; mfa_enabled: boolean }

// ---------- passwords ----------

export function checkNewPassword(password: string, email: string) {
  const problems: string[] = [];
  if (password.length < 12) problems.push("must be at least 12 characters");
  if (password.length > 128) problems.push("must be at most 128 characters");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) problems.push("must contain letters and digits");
  if (password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) problems.push("must not contain your email name");
  if (problems.length) throw unprocessable("weak-password", "Password is too weak", undefined, problems.map((m) => ({ field: "newPassword", message: m })));
}

const temporaryPassword = () => crypto.randomBytes(12).toString("base64url"); // 16 url-safe characters

// ---------- authentication ----------

export async function login(tenantId: string, email: string, password: string, secret: string, code?: string) {
  await requireModule(tenantId, "portal");
  const normalized = email.trim().toLowerCase();
  const user = await one<UserRow>(ex, sql`SELECT * FROM access.portal_users WHERE tenant_id = ${tenantId} AND email = ${normalized}`);
  const locked = user?.locked_until && new Date(user.locked_until as string).getTime() > Date.now();
  const usable = Boolean(user && user.active && !locked);
  const ok = await bcrypt.compare(password, usable ? user!.password_hash : DUMMY_HASH);

  if (!user || !usable || !ok) {
    if (user && user.active && !locked) {
      const failures = user.failed_attempts + 1;
      await ex.execute(failures >= MAX_FAILURES
        ? sql`UPDATE access.portal_users SET failed_attempts = 0, locked_until = now() + (${LOCK_MINUTES} * interval '1 minute') WHERE id = ${user.id}`
        : sql`UPDATE access.portal_users SET failed_attempts = ${failures} WHERE id = ${user.id}`);
    }
    throw invalid();
  }

  // the password is right; an account with two-step verification also needs a current authenticator code
  if (user.mfa_enabled) {
    if (!code) throw new Problem(401, "mfa-required", "Enter your authenticator code", "Open your authenticator app and type the 6-digit code", undefined, { mfaRequired: true });
    const result = await mfa.verifyForLogin({ table: "access.portal_users", id: user.id, account: user.email }, code, secret);
    if (result === "locked") throw new Problem(429, "mfa-locked", "Too many wrong codes", "Try again in 5 minutes", undefined, { mfaRequired: true });
    if (result === "bad") throw new Problem(401, "mfa-code-invalid", "That code is not right", "Check your authenticator app. Codes change every 30 seconds and can be used once.", undefined, { mfaRequired: true });
  }

  await ex.execute(sql`UPDATE access.portal_users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = ${user.id}`);
  const token = jwt.sign({ sub: user.id, typ: "portal" }, portalSecret(secret), { algorithm: "HS256", expiresIn: `${TOKEN_HOURS}h` });
  return { token, expiresAt: Date.now() + TOKEN_HOURS * 3600 * 1000, mustChangePassword: user.must_change_password };
}

export async function principalFromToken(token: string, secret: string): Promise<PortalPrincipal | null> {
  try {
    const payload = jwt.verify(token, portalSecret(secret), { algorithms: ["HS256"] }) as { sub?: string; typ?: string };
    if (payload.typ !== "portal" || !payload.sub) return null;
    const user = await one<UserRow>(ex, sql`SELECT * FROM access.portal_users WHERE id = ${payload.sub}`);
    if (!user || !user.active) return null;
    return { userId: user.id, tenantId: user.tenant_id, partyId: user.party_id, email: user.email, mustChangePassword: user.must_change_password };
  } catch {
    return null;
  }
}

export async function changePassword(p: PortalPrincipal, current: string, next: string) {
  const user = await one<UserRow>(ex, sql`SELECT * FROM access.portal_users WHERE id = ${p.userId}`);
  if (!user || !(await bcrypt.compare(current, user.password_hash))) throw new Problem(403, "wrong-current-password", "Current password is incorrect");
  checkNewPassword(next, p.email);
  if (await bcrypt.compare(next, user.password_hash)) throw unprocessable("weak-password", "Password is too weak", "Choose a password you have not used before");
  await ex.execute(sql`UPDATE access.portal_users SET password_hash = ${await bcrypt.hash(next, 10)}, must_change_password = FALSE, password_changed_at = now() WHERE id = ${p.userId}`);
}

// ---------- account administration (staff side) ----------

const userDto = (r: { id: string; party_id: string; party_name?: string | null; email: string; active: boolean; must_change_password: boolean; mfa_enabled?: boolean; last_login_at: unknown; created_at: unknown }) => ({
  id: r.id, partyId: r.party_id, partyName: r.party_name ?? null, email: r.email, active: r.active,
  mustChangePassword: r.must_change_password, mfaEnabled: Boolean(r.mfa_enabled), lastLoginAt: iso(r.last_login_at), createdAt: iso(r.created_at),
});

export async function createPortalUser(ctx: Ctx, input: { partyId: string; email: string }) {
  const config = await requireModule(ctx.tenantId, "portal");
  const email = input.email.trim().toLowerCase();
  const party = await one<{ id: string }>(ex, sql`SELECT id FROM crm.parties WHERE id = ${input.partyId}`);
  if (!party) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "partyId", message: "no such client" }]);

  const count = await one<{ n: unknown }>(ex, sql`SELECT COUNT(*) AS n FROM access.portal_users WHERE tenant_id = ${ctx.tenantId} AND active`);
  if (num(count?.n) >= config.entitlements.limits.portalUsers) throw conflict("portal-user-limit", "Portal user limit reached", `The plan allows ${config.entitlements.limits.portalUsers} portal users`);

  const password = temporaryPassword();
  const id = newId("pu");
  await ex.execute(sql`INSERT INTO access.portal_users (id, tenant_id, party_id, email, password_hash, created_by)
    VALUES (${id}, ${ctx.tenantId}, ${input.partyId}, ${email}, ${await bcrypt.hash(password, 10)}, ${ctx.staffId})`);
  await ex.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, after_state) VALUES (${ctx.staffId}, 'PORTAL_USER_CREATED', 'portal_user', ${id}, ${JSON.stringify({ partyId: input.partyId, email })}::jsonb)`);
  return { ...(await getPortalUser(ctx, id)), temporaryPassword: password };
}

export async function getPortalUser(ctx: Ctx, id: string) {
  const r = await one<Parameters<typeof userDto>[0]>(ex, sql`SELECT u.*, p.full_name AS party_name FROM access.portal_users u LEFT JOIN crm.parties p ON p.id = u.party_id WHERE u.id = ${id} AND u.tenant_id = ${ctx.tenantId}`);
  if (!r) throw notFound(`Portal user ${id}`);
  return userDto(r);
}

export async function listPortalUsers(ctx: Ctx, page: Page) {
  const p = `%${page.q.replace(/[!%_]/g, (c) => "!" + c)}%`;
  const cond = page.q ? sql`AND (u.email ILIKE ${p} ESCAPE '!' OR pa.full_name ILIKE ${p} ESCAPE '!')` : sql``;
  const [list, total] = await Promise.all([
    rows<Parameters<typeof userDto>[0]>(ex, sql`SELECT u.*, pa.full_name AS party_name FROM access.portal_users u LEFT JOIN crm.parties pa ON pa.id = u.party_id WHERE u.tenant_id = ${ctx.tenantId} ${cond} ORDER BY u.created_at DESC, u.id LIMIT ${page.limit} OFFSET ${page.offset}`),
    one<{ n: unknown }>(ex, sql`SELECT COUNT(*) AS n FROM access.portal_users u LEFT JOIN crm.parties pa ON pa.id = u.party_id WHERE u.tenant_id = ${ctx.tenantId} ${cond}`),
  ]);
  return { rows: list.map(userDto), total: num(total?.n) };
}

export async function setPortalUserActive(ctx: Ctx, id: string, active: boolean) {
  const r = await rows(ex, sql`UPDATE access.portal_users SET active = ${active}, failed_attempts = 0, locked_until = NULL WHERE id = ${id} AND tenant_id = ${ctx.tenantId} RETURNING id`);
  if (r.length === 0) throw notFound(`Portal user ${id}`);
  await ex.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, after_state) VALUES (${ctx.staffId}, ${active ? "PORTAL_USER_ENABLED" : "PORTAL_USER_DISABLED"}, 'portal_user', ${id}, ${JSON.stringify({ active })}::jsonb)`);
  return getPortalUser(ctx, id);
}

/** An administrator removes a client's two-step verification (lost phone) so they can enrol again. */
export async function resetPortalMfa(ctx: Ctx, id: string) {
  const exists = await one(ex, sql`SELECT 1 AS ok FROM access.portal_users WHERE id = ${id} AND tenant_id = ${ctx.tenantId}`);
  if (!exists) throw notFound(`Portal user ${id}`);
  await mfa.clear({ table: "access.portal_users", id });
  await ex.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, after_state) VALUES (${ctx.staffId}, 'MFA_RESET', 'portal_user', ${id}, '{}'::jsonb)`);
  return getPortalUser(ctx, id);
}

export async function resetPortalPassword(ctx: Ctx, id: string) {
  const password = temporaryPassword();
  const r = await rows(ex, sql`UPDATE access.portal_users SET password_hash = ${await bcrypt.hash(password, 10)}, must_change_password = TRUE, failed_attempts = 0, locked_until = NULL WHERE id = ${id} AND tenant_id = ${ctx.tenantId} RETURNING id`);
  if (r.length === 0) throw notFound(`Portal user ${id}`);
  await ex.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, after_state) VALUES (${ctx.staffId}, 'PORTAL_PASSWORD_RESET', 'portal_user', ${id}, '{}'::jsonb)`);
  return { ...(await getPortalUser(ctx, id)), temporaryPassword: password };
}

// ---------- the client's own records ----------

const ctxOf = (p: PortalPrincipal): Ctx => ({ tenantId: p.tenantId, staffId: null });

export async function me(p: PortalPrincipal) {
  const party = await one<{ full_name: string; email: string | null; phone_number: string | null }>(ex, sql`SELECT full_name, email, phone_number FROM crm.parties WHERE id = ${p.partyId}`);
  return {
    userId: p.userId, partyId: p.partyId, name: party?.full_name ?? null, email: p.email, phone: party?.phone_number ?? null,
    mustChangePassword: p.mustChangePassword, mfaEnabled: await mfa.isEnabled({ table: "access.portal_users", id: p.userId, account: p.email }),
  };
}

/** Turning two-step verification off needs the account password as well as a current code. */
export async function checkPassword(p: PortalPrincipal, password: string): Promise<boolean> {
  const user = await one<{ password_hash: string }>(ex, sql`SELECT password_hash FROM access.portal_users WHERE id = ${p.userId}`);
  return Boolean(user && (await bcrypt.compare(password, user.password_hash)));
}

export async function myPolicies(p: PortalPrincipal, page: Page) {
  const [list, total] = await Promise.all([
    rows<{ id: string; category: string; status: string; start_date: string; end_date: string; premium_amount: string; insurer: string | null }>(ex, sql`
      SELECT po.id, po.category, po.status, to_char(po.start_date, 'YYYY-MM-DD') AS start_date, to_char(po.end_date, 'YYYY-MM-DD') AS end_date, po.premium_amount::text, i.name AS insurer
      FROM policy.policies po LEFT JOIN product.insurers i ON i.id = po.insurer_id
      WHERE po.client_id = ${p.partyId} ORDER BY po.end_date DESC, po.id LIMIT ${page.limit} OFFSET ${page.offset}`),
    one<{ n: unknown }>(ex, sql`SELECT COUNT(*) AS n FROM policy.policies WHERE client_id = ${p.partyId}`),
  ]);
  const config = await requireModule(p.tenantId, "portal");
  return {
    rows: list.map((r) => ({
      id: r.id, category: r.category, status: r.status, startDate: r.start_date, endDate: r.end_date, insurer: r.insurer,
      premium: { amountMinor: Money.fromMajor(r.premium_amount, config.regional.currency).minor, currency: config.regional.currency, display: Money.fromMajor(r.premium_amount, config.regional.currency).format(config.localization.locale) },
    })),
    total: num(total?.n),
  };
}

export async function myInvoices(p: PortalPrincipal, page: Page, state?: string) {
  await requireModule(p.tenantId, "portal");
  return listInvoices(ctxOf(p), page, { clientId: p.partyId, state });
}

export async function myInvoice(p: PortalPrincipal, id: string) {
  await requireModule(p.tenantId, "portal");
  return getInvoice(ctxOf(p), id, p.partyId);
}

/** A payment as the client sees it: no internal ids, staff, configuration or workflow detail. */
const portalReceipt = (r: Awaited<ReturnType<typeof getReceipt>>) => ({
  id: r.id, receiptNo: r.receiptNo, amount: r.amount, method: r.method, reference: r.reference, instrumentNo: r.instrumentNo,
  status: r.status, receivedAt: r.receivedAt, clearedAt: r.clearedAt, bouncedAt: r.bouncedAt,
  applied: r.allocated, notYetApplied: r.unallocated,
});

export async function myReceipts(p: PortalPrincipal, page: Page) {
  await requireModule(p.tenantId, "portal");
  const { rows: list, total } = await listReceipts(ctxOf(p), page, { clientId: p.partyId, approvedOnly: true });
  return { rows: list.map((r) => portalReceipt(r as never)), total };
}

export async function myReceipt(p: PortalPrincipal, id: string) {
  await requireModule(p.tenantId, "portal");
  const r = await getReceipt(ctxOf(p), id, p.partyId);
  return {
    ...portalReceipt(r),
    applications: r.allocations.map((a) => ({ invoiceNo: a.invoiceNo, kind: a.kind === "apply" ? "applied" : "reversed", amount: a.amount, at: a.at })),
  };
}

export async function myPosition(p: PortalPrincipal) {
  await requireModule(p.tenantId, "portal");
  const pos = await clientPosition(ctxOf(p), p.partyId, { forClient: true });
  const unapplied = pos.suspense.amountMinor + pos.clientCredit.amountMinor;
  return {
    outstanding: pos.outstanding,
    unappliedPayments: { amountMinor: unapplied, currency: pos.outstanding.currency, display: Money.of(unapplied, pos.outstanding.currency).format((await requireModule(p.tenantId, "portal")).localization.locale) },
    openInvoices: pos.invoices.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, dueDate: i.dueDate, outstanding: i.outstanding, overdue: i.overdue })),
    chequesInClearing: pos.pendingReceipts.map((r) => ({ id: r.id, receiptNo: r.receiptNo, amount: r.amount, status: r.status, instrumentNo: r.instrumentNo })),
  };
}

/** Chronological statement: invoices raise the balance, applied payments (and reversals) move it. */
export async function myStatement(p: PortalPrincipal, from?: string, to?: string) {
  const config = await requireModule(p.tenantId, "portal");
  const zone = config.regional.timeZone;
  const cur = config.regional.currency;
  const raw = await rows<{ at: unknown; kind: string; ref: string; detail: string; amount: unknown }>(ex, sql`
    SELECT i.created_at AS at, 'invoice' AS kind, i.invoice_no AS ref, 'Invoice' AS detail, i.total_minor AS amount, 0 AS ord
      FROM finance.invoices i WHERE i.tenant_id = ${p.tenantId} AND i.client_id = ${p.partyId} AND i.status = 'open'
    UNION ALL
    SELECT a.created_at, CASE WHEN a.kind = 'apply' THEN 'payment' ELSE 'reversal' END, r.receipt_no,
           CASE WHEN a.kind = 'apply' THEN 'Payment applied to ' ELSE 'Payment reversed from ' END || i.invoice_no, -a.amount_minor, 1
      FROM finance.allocations a JOIN finance.receipts r ON r.id = a.receipt_id JOIN finance.invoices i ON i.id = a.invoice_id
      WHERE a.tenant_id = ${p.tenantId} AND r.client_id = ${p.partyId} AND i.status = 'open'
    ORDER BY 1, 6, 3 LIMIT 2000`);
  let running = 0;
  const all = raw.map((r) => {
    running += num(r.amount);
    return { date: localDate(new Date(r.at as string), zone), type: r.kind, reference: r.ref, description: r.detail, amount: num(r.amount), balance: running };
  });
  const inRange = all.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  const opening = from ? [...all].reverse().find((e) => e.date < from)?.balance ?? 0 : 0;
  const money = (m: number) => ({ amountMinor: m, currency: cur, display: Money.of(m, cur).format(config.localization.locale) });
  return {
    currency: cur, timeZone: zone, from: from ?? null, to: to ?? null,
    openingBalance: money(opening),
    entries: inRange.map((e) => ({ ...e, amount: money(e.amount), balance: money(e.balance) })),
    closingBalance: money(inRange.length ? inRange[inRange.length - 1].balance : opening),
  };
}
