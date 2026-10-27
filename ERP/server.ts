import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import crypto from "crypto";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import { createSiteRouter, type StaffIdentity } from "./site/router";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, desc, and, or, isNull, lte, gte, inArray, ilike, count } from "drizzle-orm";
import { db } from "./db/client";
import {
  parties, clientAccounts, relationships, interactions, opportunities, policies, policyChecks, discrepancies, endorsements, renewals, cases, caseTransitions, tasks, obligations, auditLog,
  claims, claimTimelineSteps, claimChecklistItems, claimDiaryEntries, claimReserveLines, claimPaymentLines, complaints, insurers, insurerRateVersions, statutoryLevies, commissionGuide,
  premiumConfirmations, financialTransactions, commissionStatements, commissionLines, documents,
  glAccounts, accountingPeriods, journalEntries, journalLines,
  risks, submissions, quotations, recommendations, correspondenceTemplates, notifications, insurerAppetite, marketStrategies, riskClearances, products,
  staff, roles, permissions, rolePermissions,
  payments, pettyCashFloats, pettyCashTransactions, officeExpenses,
  underwritingQueries, underwritingApprovals, coverageVerificationItems,
  kycChecklistItems,
  employees, leaveTypes, leaveBalances, leaveRequests, performanceReviews,
  producers, producerCommissionSplits,
} from "./db/schema";

dotenv.config();

const app = express();
// Behind a reverse proxy (Render, nginx, ...) the client IP — which the rate limits
// key on — is in X-Forwarded-For. Set TRUST_PROXY to the number of proxy hops.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
const PORT = 3100;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Placeholder values shipped in .env.example — fine for local dev, never
// acceptable once the service is reachable by anyone else.
const PLACEHOLDER_SECRETS = new Set(["dev-only-change-me", "dev-only-change-me-too"]);

// In production a missing, placeholder, or short secret stops the boot
// rather than silently running with a guessable one. In dev a missing
// JWT_SECRET falls back to the placeholder with a warning.
function loadSecret(name: string, devFallback?: string): string | undefined {
  const value = process.env[name];
  if (IS_PRODUCTION) {
    if (!value || PLACEHOLDER_SECRETS.has(value) || value.length < 32) {
      throw new Error(`${name} must be set to a random value of at least 32 characters in production`);
    }
    return value;
  }
  if (!value && devFallback) console.warn(`[security] ${name} is not set — using an insecure development default`);
  return value || devFallback;
}

const JWT_SECRET = loadSecret("JWT_SECRET", "dev-only-change-me-too")!;
const INTERNAL_API_KEY = loadSecret("INTERNAL_API_KEY");

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
if (IS_PRODUCTION && ALLOWED_ORIGINS.length === 0) {
  throw new Error("ALLOWED_ORIGIN must be set in production (comma-separated list of permitted origins)");
}

// The two paths an unauthenticated caller may reach: the login itself
// and the health probe.
const PUBLIC_PATHS = new Set(["/health", "/auth/login"]);

// The public quote-generator (../studio) calls this service with only the
// x-api-key — no staff session — and only ever touches parties and
// policies. Anything outside this list needs a real staff login, so the
// API key (which is bundled into the dashboard's client JS) can no longer
// be used on its own to reach finance, HR, GL or any other route.
const SERVICE_CALLER_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/(parties|policies)$/ },
  { method: "POST", pattern: /^\/(parties|policies)$/ },
  { method: "PATCH", pattern: /^\/(parties|policies)\/[^/]+$/ },
];

// Unique, roughly time-ordered id suffix. Plain Date.now() collides when two
// requests land in the same millisecond, which surfaces as a primary-key error.
function uid(): string {
  return `${Date.now()}${crypto.randomBytes(3).toString("hex")}`;
}

// Drizzle wraps driver errors ("Failed query: ..."); the Postgres SQLSTATE
// lives on the original error, one level down in `cause`.
function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Document storage — local disk for dev; swap for S3/MinIO in
// production by changing only writeDocumentFile/readDocumentFile below.
const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");
fs.mkdirSync(STORAGE_DIR, { recursive: true });

// CSP is left off in dev because Vite's HMR injects inline scripts; the
// production build has no external resources, so helmet's default policy applies.
app.use(helmet({ contentSecurityPolicy: IS_PRODUCTION ? undefined : false }));
app.disable("x-powered-by");

// Dashboard calls are same-origin, and studio calls server-to-server, so
// CORS only matters for browsers on another origin. Production allows
// exactly ALLOWED_ORIGIN; dev additionally allows any localhost port.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (!IS_PRODUCTION && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
    callback(null, false);
  },
}));
// ----------------------------------------------------
// Website API (the public quote site + its staff workspace): /api/site/*.
// Mounted before the global JSON parser because it accepts larger bodies
// (base64 photos) and brings its own parser. Public endpoints get their own
// rate limits — the AI and email ones cost real money — and staff endpoints
// use the same JWT as the dashboard.
// ----------------------------------------------------
const siteLimit = (windowMs: number, limit: number, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false, message: { error: message } });

app.use("/api/site", siteLimit(60 * 1000, 120, "Too many requests — slow down"));
app.use(["/api/site/analyze-room", "/api/site/insurance-advisor-chat", "/api/site/claims-assistant", "/api/site/claims-photo-review"],
  siteLimit(10 * 60 * 1000, 20, "Too many AI requests — try again in a few minutes"));
app.use("/api/site/auth/send-otp", siteLimit(10 * 60 * 1000, 5, "Too many code requests — try again in a few minutes"));
app.use("/api/site/auth/verify-otp", siteLimit(10 * 60 * 1000, 15, "Too many attempts — try again in a few minutes"));
app.use(["/api/site/quotes", "/api/site/quote-selected", "/api/site/cover-notes", "/api/site/other-line-quotes"],
  siteLimit(10 * 60 * 1000, 30, "Too many submissions — try again in a few minutes"));
app.use("/api/site/submit-claim", siteLimit(60 * 60 * 1000, 10, "Too many claim submissions — try again later"));
app.use("/api/site/staff/login", rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many login attempts — try again in 15 minutes" },
}));

async function staffIdentity(id: string): Promise<StaffIdentity | null> {
  const [member] = await db.select().from(staff).where(eq(staff.id, id));
  if (!member || !member.active) return null;
  const [role] = member.roleId ? await db.select().from(roles).where(eq(roles.id, member.roleId)) : [];
  const grants = member.roleId ? await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, member.roleId)) : [];
  return { staffId: member.id, fullName: member.fullName, role: role?.name ?? "Staff", permissions: grants.map((g) => g.permissionId) };
}

app.use("/api/site", createSiteRouter({
  login: async (email, password) => {
    const member = await checkCredentials(email, password);
    if (!member) return null;
    const identity = await staffIdentity(member.id);
    if (!identity) return null;
    return { ...identity, token: issueToken(member.id), expiresAt: Date.now() + SESSION_HOURS * 3600 * 1000 };
  },
  authenticate: async (token) => {
    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as { id: string };
      return await staffIdentity(payload.id);
    } catch {
      return null;
    }
  },
  listStaff: async () => {
    const [members, allRoles] = await Promise.all([db.select().from(staff), db.select().from(roles)]);
    return members.map((m) => ({ id: m.id, fullName: m.fullName, role: allRoles.find((r) => r.id === m.roleId)?.name ?? "Staff", active: m.active }));
  },
}));

// Anything under /api/site that the router didn't answer is simply not there.
app.use("/api/site", (_req, res) => res.status(404).json({ error: "Not found" }));

app.use(express.json({ limit: "20mb" }));

// One structured JSON line per API request (method, path, status, duration,
// caller) so logs can be searched and alerted on. Skipped under test to keep
// output readable. Query strings are dropped: they can carry search terms
// or ids that don't belong in logs.
app.use("/api", (req, res, next) => {
  if (process.env.VITEST) return next();
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? "error" : "info",
      msg: "request",
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      staffId: req.staff?.id ?? null,
    }));
  });
  next();
});

// Brute-force protection: a tight cap on login attempts per IP, and a
// generous cap across the rest of the API to blunt scraping and floods.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Only failed attempts count, so staff sharing an office IP aren't locked
  // out by each other's successful logins.
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts — try again in 15 minutes" },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — slow down" },
});
app.use("/api/auth/login", loginLimiter);
app.use("/api", apiLimiter);

// Session-less callers (the quote-generator app) must carry the shared
// secret. A staff session proves identity with its own signed token, so the
// dashboard sends no key at all — which keeps this secret out of the
// client-side JS bundle. The login and health probes are public.
app.use("/api", (req, res, next) => {
  if (PUBLIC_PATHS.has(req.path) || req.header("authorization")?.startsWith("Bearer ")) return next();
  const key = req.header("x-api-key");
  if (!INTERNAL_API_KEY || !key || !timingSafeEqual(key, INTERNAL_API_KEY)) {
    return res.status(401).json({ error: "Missing or invalid x-api-key" });
  }
  next();
});

// Staff identity layer (JWT + RBAC via access.roles). Optional at the
// request level: the public quote-generator app never sends this
// header and keeps working exactly as before (attributed to the
// fallback 'staff-1' actor, same as pre-auth behavior) — this only
// identifies the human behind a *dashboard* request, for audit-trail
// attribution and the requirePermission() gate on sensitive actions
// below. A header that IS present but invalid/expired is rejected
// rather than silently ignored, so a stale token can't masquerade as
// "no session."
interface AuthedStaff { id: string; fullName: string; roleId: string | null }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { staff?: AuthedStaff }
  }
}

app.use("/api", async (req, res, next) => {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    // No staff session: only the login/health probes and the narrow set of
    // routes the quote-generator uses are reachable with the API key alone.
    const allowed = PUBLIC_PATHS.has(req.path) || SERVICE_CALLER_ROUTES.some((r) => r.method === req.method && r.pattern.test(req.path));
    if (allowed) return next();
    return res.status(401).json({ error: "Sign in required" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ["HS256"] }) as { id: string };
    // Re-read the staff record on every request rather than trusting the
    // token's snapshot: a terminated or deactivated employee loses access
    // immediately instead of when their 8h token expires, and a role change
    // takes effect on the next call.
    const [member] = await db.select().from(staff).where(eq(staff.id, payload.id));
    if (!member || !member.active) return res.status(401).json({ error: "Invalid or expired session" });
    req.staff = { id: member.id, fullName: member.fullName, roleId: member.roleId };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
});

// Resolves the actor for an audit-log entry / a "who did this" field:
// the logged-in staff member if the request carried a valid session,
// otherwise whatever the request body explicitly passed, otherwise the
// 'staff-1' fallback used throughout before real auth existed.
function actorId(req: express.Request, bodyOverride?: string): string {
  return req.staff?.id || bodyOverride || "staff-1";
}

// Gates a handful of genuinely sensitive actions behind RBAC — not
// exhaustive coverage of every route (most CRM work is left open to
// any authenticated dashboard user, matching how narrowly-scoped the
// access.permissions seed data is). A request with no session at all
// (the quote-generator app) is let through unchanged, preserving its
// existing service-to-service trust boundary; a session that IS
// present but lacks the permission is rejected.
// A session with no role, or a role missing the permission, fails the
// check; no session at all (the quote-generator app's calls) passes —
// that request never claimed to be a specific staff member in the
// first place, so there's nothing to deny it based on.
async function hasPermission(req: express.Request, permissionId: string): Promise<boolean> {
  // No session means a service caller (the quote-generator), which is
  // confined to parties/policies by the middleware above and never holds
  // a permission — so it fails every RBAC check rather than passing them.
  if (!req.staff || !req.staff.roleId) return false;
  const [grant] = await db.select().from(rolePermissions)
    .where(and(eq(rolePermissions.roleId, req.staff.roleId), eq(rolePermissions.permissionId, permissionId)));
  return Boolean(grant);
}

function requirePermission(permissionId: string) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (await hasPermission(req, permissionId)) return next();
    res.status(403).json({ error: `Missing permission: ${permissionId}` });
  };
}

// ----------------------------------------------------
// Auth — staff login issuing a JWT, and the current-session profile.
// ----------------------------------------------------
// Compared against when the email is unknown/inactive so a failed login
// takes the same time whether or not the account exists.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Shared by the dashboard login below and the website workspace login
// (/api/site/staff/login): one set of accounts, one JWT.
async function checkCredentials(email: string, password: string) {
  const [member] = await db.select().from(staff).where(eq(staff.email, email));
  const usable = member && member.active && member.passwordHash;
  const valid = await bcrypt.compare(password, usable ? member.passwordHash! : DUMMY_PASSWORD_HASH);
  if (!usable || !valid) return null;
  await db.update(staff).set({ lastLoginAt: new Date() }).where(eq(staff.id, member.id));
  return member;
}

const SESSION_HOURS = 8;
function issueToken(staffId: string): string {
  return jwt.sign({ id: staffId }, JWT_SECRET, { algorithm: "HS256", expiresIn: `${SESSION_HOURS}h` });
}

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password || password.length > 200) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const member = await checkCredentials(email, password);
  if (!member) return res.status(401).json({ error: "Invalid email or password" });

  const token = issueToken(member.id);
  res.json({ token, staff: { id: member.id, fullName: member.fullName, email: member.email, roleId: member.roleId } });
}));

app.get("/api/auth/me", asyncRoute(async (req, res) => {
  if (!req.staff) return res.status(401).json({ error: "Not signed in" });
  const grants = req.staff.roleId
    ? await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, req.staff.roleId))
    : [];
  res.json({ ...req.staff, permissions: grants.map((g) => g.permissionId) });
}));

function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<unknown>) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((err) => {
      // Bad input that only the database notices (a missing required field,
      // an id that doesn't exist, a malformed value) is the caller's mistake,
      // not a server fault — answer 4xx without leaking schema detail.
      const clientErrors: Record<string, [number, string]> = {
        "23502": [400, "A required field is missing"],
        "23503": [400, "A referenced record does not exist"],
        "23505": [409, "That record already exists"],
        "23514": [400, "A value is not allowed for this field"],
        "22P02": [400, "A value has the wrong format"],
        "22007": [400, "A date or time value has the wrong format"],
        "22003": [400, "A number is out of range"],
      };
      // An update request that names no recognised field has nothing to apply.
      if (String(err?.message).includes("No values to set")) return res.status(400).json({ error: "No updatable fields were supplied" });
      const code = pgErrorCode(err);
      const mapped = code ? clientErrors[code] : undefined;
      if (mapped) {
        if (!process.env.VITEST) console.warn(JSON.stringify({ level: "warn", msg: "rejected by database constraint", code, path: req.path }));
        return res.status(mapped[0]).json({ error: mapped[1] });
      }
      console.error(JSON.stringify({ level: "error", msg: "unhandled route error", method: req.method, path: req.path, error: String(err?.stack || err) }));
      res.status(500).json({ error: "Internal server error" });
    });
  };
}

// A failure to log an audit event must never block the business
// operation it's describing (e.g. an unrecognized actor id shouldn't
// stop a party from being created) — log and move on.
async function addAuditLog(entry: { action: string; entityType: string; entityId: string; actorStaffId?: string; beforeState?: unknown; afterState?: unknown; reason?: string }) {
  try {
    await db.insert(auditLog).values({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actorStaffId: entry.actorStaffId,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
      reason: entry.reason,
    });
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}

// Auto-posts a balanced double-entry journal entry for a business
// event that's already happened (premium confirmed, expense paid,
// petty cash moved) — a derived accounting record of that event, the
// same relationship the audit log has to every other write. Finds or
// opens the calendar-month accounting period covering entryDate so
// posting never depends on someone having set up periods in advance;
// manual entries (POST /api/journal-entries below) require an
// explicit *open* period instead, since a human is deliberately
// booking those. Never throws — a posting failure must never block
// the operation it's describing, matching addAuditLog above.
async function postJournalEntry(opts: {
  entryDate: string; description: string; sourceType: string; sourceId?: string;
  lines: { accountCode: string; debitKes?: number; creditKes?: number; description?: string; policyId?: string; partyId?: string }[];
}) {
  try {
    const totalDebit = Math.round(opts.lines.reduce((sum, l) => sum + (l.debitKes || 0), 0) * 100) / 100;
    const totalCredit = Math.round(opts.lines.reduce((sum, l) => sum + (l.creditKes || 0), 0) * 100) / 100;
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      console.error(`journal entry not balanced (debit ${totalDebit} vs credit ${totalCredit}), skipping post for ${opts.sourceType}/${opts.sourceId}`);
      return null;
    }

    const periodId = opts.entryDate.slice(0, 7); // 'YYYY-MM'
    let [period] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, periodId));
    if (!period) {
      const [year, month] = periodId.split("-").map(Number);
      [period] = await db.insert(accountingPeriods).values({
        id: periodId,
        startDate: `${periodId}-01`,
        endDate: new Date(year, month, 0).toISOString().slice(0, 10),
      }).returning();
    }
    if (period.status !== "open") {
      console.error(`accounting period ${periodId} is closed, skipping auto-post for ${opts.sourceType}/${opts.sourceId}`);
      return null;
    }

    const [entry] = await db.insert(journalEntries).values({
      id: `je-${uid()}-${Math.floor(Math.random() * 1000)}`,
      periodId: period.id,
      entryDate: opts.entryDate,
      description: opts.description,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      postedBy: "staff-1",
    }).returning();

    await db.insert(journalLines).values(opts.lines.map((l) => ({
      entryId: entry.id,
      accountCode: l.accountCode,
      debitKes: l.debitKes || 0,
      creditKes: l.creditKes || 0,
      description: l.description,
      policyId: l.policyId,
      partyId: l.partyId,
    })));

    return entry;
  } catch (err) {
    console.error("journal entry posting failed:", err);
    return null;
  }
}

// Liveness + readiness in one: confirms the process is up AND the database
// answers, so a load balancer or uptime monitor sees a dead DB as unhealthy.
app.get("/api/health", async (_req, res) => {
  try {
    await db.select({ id: roles.id }).from(roles).limit(1);
    res.json({ status: "ok", service: "erp", uptimeSeconds: Math.round(process.uptime()) });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "health check failed", error: String(err) }));
    res.status(503).json({ status: "unavailable", service: "erp" });
  }
});

// ----------------------------------------------------
// Parties (SOP §8 Party) — the client/prospect master record
// ----------------------------------------------------
const PARTY_UPDATABLE_FIELDS = [
  "fullName", "email", "phoneNumber", "partyType", "nationalId", "kraPin",
  "companyRegNo", "county", "physicalAddress", "status", "riskRating",
  "leadSource", "consentGiven", "consentTimestamp",
] as const;

// ----------------------------------------------------
// Server-side paging for the big list screens.
//
// A plain GET returns every row (the quote-generator and the dashboard's
// lookup dropdowns rely on that). With ?limit=N the list is paged and searched
// in SQL instead — ?offset=, ?q= — and the total match count comes back in the
// X-Total-Count header, so the browser never downloads thousands of rows to
// show 25. Used by /parties, /policies and /opportunities.
// ----------------------------------------------------
interface Paging { limit: number; offset: number; q: string }

function readPaging(req: express.Request): Paging | null {
  if (req.query.limit === undefined) return null;
  return {
    limit: Math.min(Math.max(parseInt(String(req.query.limit), 10) || 25, 1), 200),
    offset: Math.max(parseInt(String(req.query.offset), 10) || 0, 0),
    q: String(req.query.q ?? "").trim().slice(0, 100),
  };
}

// Case-insensitive "contains" across several columns. LIKE wildcards in the
// search text are escaped, so searching "50%" matches the text, not everything.
function searchAny(q: string, columns: Parameters<typeof ilike>[0][]) {
  if (!q) return undefined;
  const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
}

function sendPage(res: express.Response, rows: unknown[], total: number) {
  res.setHeader("X-Total-Count", String(total));
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count");
  res.json(rows);
}

app.get("/api/parties", asyncRoute(async (req, res) => {
  const paging = readPaging(req);
  if (!paging) return res.json(await db.select().from(parties).orderBy(desc(parties.createdAt)));

  const where = searchAny(paging.q, [parties.fullName, parties.phoneNumber, parties.email, parties.county, parties.nationalId, parties.kraPin, parties.companyRegNo]);
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(parties).where(where).orderBy(desc(parties.createdAt), parties.id).limit(paging.limit).offset(paging.offset),
    db.select({ total: count() }).from(parties).where(where),
  ]);
  sendPage(res, rows, total);
}));

// Onboarding KYC document checklist — what's requisite differs by
// party type. Auto-seeded the moment a party is created so onboarding
// starts with the checklist already in front of the broker, not as an
// afterthought once a policy is already being placed.
const KYC_CHECKLIST_INDIVIDUAL = ["national_id_or_passport", "kra_pin"];
const KYC_CHECKLIST_CORPORATE = ["certificate_of_incorporation", "kra_pin", "cr12", "directors_ids", "tax_compliance_certificate"];

app.post("/api/parties", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(parties).values({
    id: `party-${uid()}`,
    fullName: req.body.fullName || req.body.name || "Default Name",
    phoneNumber: req.body.phoneNumber || req.body.phone || "",
    partyType: req.body.partyType || req.body.clientType || req.body.type || "individual",
    nationalId: req.body.nationalId || req.body.nationalIdOrRegNo || "",
    kraPin: req.body.kraPin || "",
    companyRegNo: req.body.companyRegNo || "",
    leadSource: req.body.leadSource || req.body.collectedAtStage || "registration",
    consentGiven: req.body.consentGiven !== undefined ? req.body.consentGiven : true,
    consentTimestamp: req.body.consentTimestamp ? new Date(req.body.consentTimestamp) : new Date(),
  }).returning();

  const requiredDocs = newItem.partyType === "corporate" ? KYC_CHECKLIST_CORPORATE : KYC_CHECKLIST_INDIVIDUAL;
  await db.insert(kycChecklistItems).values(
    requiredDocs.map((documentType, i) => ({
      id: `kyc-${uid()}-${i}`,
      partyId: newItem.id,
      documentType,
    })),
  );

  await addAuditLog({
    action: "PARTY_CREATED",
    entityType: "party",
    entityId: newItem.id,
    actorStaffId: actorId(req, req.body.updatedByStaffId),
    afterState: newItem,
  });
  res.json(newItem);
}));

app.patch("/api/parties/:id", asyncRoute(async (req, res) => {
  const incoming: Record<string, unknown> = { ...req.body };
  if (incoming.name) { incoming.fullName = incoming.name; delete incoming.name; }
  if (incoming.phone) { incoming.phoneNumber = incoming.phone; delete incoming.phone; }
  if (incoming.clientType) { incoming.partyType = incoming.clientType; delete incoming.clientType; }
  if (incoming.type) { incoming.partyType = incoming.type; delete incoming.type; }
  if (incoming.nationalIdOrRegNo) { incoming.nationalId = incoming.nationalIdOrRegNo; delete incoming.nationalIdOrRegNo; }
  if (incoming.consentTimestamp) { incoming.consentTimestamp = new Date(incoming.consentTimestamp as string); }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of PARTY_UPDATABLE_FIELDS) {
    if (incoming[field] !== undefined) values[field] = incoming[field];
  }

  const [before] = await db.select().from(parties).where(eq(parties.id, req.params.id));
  const [updated] = await db.update(parties).set(values).where(eq(parties.id, req.params.id)).returning();
  if (updated) {
    await addAuditLog({
      action: "PARTY_UPDATED",
      entityType: "party",
      entityId: req.params.id,
      actorStaffId: actorId(req, req.body.updatedByStaffId),
      beforeState: before,
      afterState: updated,
    });
    res.json(updated);
  } else {
    res.status(404).json({ error: "Party not found" });
  }
}));

// ----------------------------------------------------
// Client accounts (SOP §8) — segment, branch, service tier, owning
// staff member and its own KYC status; distinct from Party's own
// status field. One account per party, several related parties.
// ----------------------------------------------------
app.get("/api/client-accounts", asyncRoute(async (req, res) => {
  const rows = req.query.partyId
    ? await db.select().from(clientAccounts).where(eq(clientAccounts.partyId, String(req.query.partyId)))
    : await db.select().from(clientAccounts);
  res.json(rows);
}));

// Shared by both POST /api/client-accounts and PATCH .../:id — a KYC
// status of 'approved' means "this client's onboarding documents have
// actually been checked," not reachable just by picking it from a
// dropdown while the underlying checklist still has outstanding items.
async function outstandingKycItems(partyId: string) {
  const items = await db.select().from(kycChecklistItems).where(eq(kycChecklistItems.partyId, partyId));
  return { items, outstanding: items.filter((i) => !["verified", "waived"].includes(i.status)) };
}

app.post("/api/client-accounts", asyncRoute(async (req, res) => {
  if (req.body.kycStatus === "approved") {
    const { items, outstanding } = await outstandingKycItems(req.body.partyId);
    if (items.length === 0 || outstanding.length > 0) {
      return res.status(400).json({
        error: "Cannot approve KYC: every checklist item must be verified or waived first",
        outstanding: outstanding.map((i) => i.documentType),
      });
    }
  }

  const [newItem] = await db.insert(clientAccounts).values({
    id: `acct-${uid()}`,
    partyId: req.body.partyId,
    segment: req.body.segment || null,
    branch: req.body.branch || null,
    serviceTier: req.body.serviceTier || null,
    ownerStaffId: req.body.ownerStaffId || null,
    kycStatus: req.body.kycStatus || "pending",
    preferences: req.body.preferences ?? null,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/client-accounts/:id", asyncRoute(async (req, res) => {
  if (req.body.kycStatus === "approved") {
    const [account] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, req.params.id));
    if (!account) return res.status(404).json({ error: "Client account not found" });
    const { items, outstanding } = await outstandingKycItems(account.partyId);
    if (items.length === 0 || outstanding.length > 0) {
      return res.status(400).json({
        error: "Cannot approve KYC: every checklist item must be verified or waived first",
        outstanding: outstanding.map((i) => i.documentType),
      });
    }
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of ["segment", "branch", "serviceTier", "ownerStaffId", "kycStatus", "preferences"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(clientAccounts).set(values).where(eq(clientAccounts.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Client account not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Onboarding KYC document checklist — see POST /api/parties above for
// how it's auto-seeded; PATCH /api/client-accounts/:id above for the
// gate it enforces.
// ----------------------------------------------------
app.get("/api/kyc-checklist-items", asyncRoute(async (req, res) => {
  const rows = req.query.partyId
    ? await db.select().from(kycChecklistItems).where(eq(kycChecklistItems.partyId, String(req.query.partyId)))
    : await db.select().from(kycChecklistItems);
  res.json(rows);
}));

app.post("/api/kyc-checklist-items", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(kycChecklistItems).values({
    id: `kyc-${uid()}`,
    partyId: req.body.partyId,
    documentType: req.body.documentType,
    notes: req.body.notes || null,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/kyc-checklist-items/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["notes", "documentId"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (req.body.status !== undefined) {
    values.status = req.body.status;
    if (req.body.status === "verified") {
      values.verifiedBy = actorId(req, req.body.verifiedBy);
      values.verifiedAt = new Date();
    }
  }
  const [updated] = await db.update(kycChecklistItems).set(values).where(eq(kycChecklistItems.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Checklist item not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Relationships (SOP §8) — one edge in the party graph: beneficial
// owner, director, dependant, authorized person, producer, referrer,
// insurer/provider contact. Backs the Client Profile's Contacts tab.
// ----------------------------------------------------
app.get("/api/relationships", asyncRoute(async (req, res) => {
  const rows = req.query.partyId
    ? await db.select().from(relationships).where(eq(relationships.partyId, String(req.query.partyId))).orderBy(desc(relationships.createdAt))
    : await db.select().from(relationships).orderBy(desc(relationships.createdAt));
  res.json(rows);
}));

app.post("/api/relationships", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(relationships).values({
    id: `rel-${uid()}`,
    partyId: req.body.partyId,
    relatedPartyId: req.body.relatedPartyId || null,
    relationshipType: req.body.relationshipType,
    ownershipPct: req.body.ownershipPct ?? null,
    pepStatus: req.body.pepStatus ?? false,
    designation: req.body.designation || null,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/relationships/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["relationshipType", "ownershipPct", "pepStatus", "designation"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(relationships).set(values).where(eq(relationships.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Relationship not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Interactions (SOP §8) — a logged client contact (call/email/sms/
// whatsapp/visit/portal), manually recorded by staff. Backs the
// Client Profile's Communications tab. Distinct from
// comms.notifications, which is system-sent messages via a template —
// not wired to a route yet, since it needs actual send infrastructure
// behind it, not just a log.
// ----------------------------------------------------
app.get("/api/interactions", asyncRoute(async (req, res) => {
  const rows = req.query.partyId
    ? await db.select().from(interactions).where(eq(interactions.partyId, String(req.query.partyId))).orderBy(desc(interactions.occurredAt))
    : await db.select().from(interactions).orderBy(desc(interactions.occurredAt));
  res.json(rows);
}));

app.post("/api/interactions", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(interactions).values({
    id: `int-${uid()}`,
    partyId: req.body.partyId,
    staffId: actorId(req, req.body.staffId),
    channel: req.body.channel,
    direction: req.body.direction,
    subject: req.body.subject || null,
    notes: req.body.notes || null,
    occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : new Date(),
  }).returning();
  res.json(newItem);
}));

// ----------------------------------------------------
// Correspondence templates — the wording behind a system notification,
// versioned per code+channel. Editing the body bumps the version so a
// past notification's rendered copy stays traceable to what it was
// actually sent with.
// ----------------------------------------------------
app.get("/api/correspondence-templates", asyncRoute(async (req, res) => {
  const rows = await db.select().from(correspondenceTemplates);
  res.json(rows);
}));

app.post("/api/correspondence-templates", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(correspondenceTemplates).values({
    id: `tmpl-${uid()}`,
    code: req.body.code,
    area: req.body.area || null,
    channel: req.body.channel,
    subject: req.body.subject || null,
    bodyTemplate: req.body.bodyTemplate,
    version: 1,
    effectiveFrom: req.body.effectiveFrom || new Date().toISOString().slice(0, 10),
    active: true,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/correspondence-templates/:id", asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(correspondenceTemplates).where(eq(correspondenceTemplates.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Template not found" });

  const values: Record<string, unknown> = {};
  for (const field of ["area", "subject", "active"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (req.body.bodyTemplate !== undefined && req.body.bodyTemplate !== existing.bodyTemplate) {
    values.bodyTemplate = req.body.bodyTemplate;
    values.version = existing.version + 1;
  }
  const [updated] = await db.update(correspondenceTemplates).set(values).where(eq(correspondenceTemplates.id, req.params.id)).returning();
  res.json(updated);
}));

// ----------------------------------------------------
// Notifications — a queued/sent system message rendered from a
// correspondence template. No real email/SMS/WhatsApp gateway is
// wired up in this dev build (see README): "sent" here means a staff
// member marked it dispatched, not that a provider actually delivered
// it — the data model and workflow are real, the transport isn't.
// ----------------------------------------------------
app.get("/api/notifications", asyncRoute(async (req, res) => {
  const rows = req.query.partyId
    ? await db.select().from(notifications).where(eq(notifications.partyId, String(req.query.partyId))).orderBy(desc(notifications.createdAt))
    : await db.select().from(notifications).orderBy(desc(notifications.createdAt));
  res.json(rows);
}));

app.post("/api/notifications", asyncRoute(async (req, res) => {
  const [template] = await db.select().from(correspondenceTemplates).where(eq(correspondenceTemplates.code, req.body.templateCode));
  if (!template) return res.status(404).json({ error: "Template not found" });

  const [newItem] = await db.insert(notifications).values({
    id: `notif-${uid()}`,
    partyId: req.body.partyId || null,
    staffId: actorId(req, req.body.staffId),
    channel: template.channel,
    templateCode: template.code,
    payload: req.body.payload ?? null,
    status: "queued",
  }).returning();
  res.json(newItem);
}));

app.patch("/api/notifications/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  if (req.body.status !== undefined) {
    values.status = req.body.status;
    if (req.body.status === "sent") values.sentAt = new Date();
  }
  const [updated] = await db.update(notifications).set(values).where(eq(notifications.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Notification not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Opportunities (SOP §8/§9) — New → Contacted → Qualified → Discovery
// → Data Collection → Marketed → Quoted → Presented → Decision →
// Won/Lost/Deferred
// ----------------------------------------------------
const OPPORTUNITY_STAGES = [
  "New", "Contacted", "Qualified", "Discovery", "Data Collection",
  "Marketed", "Quoted", "Presented", "Decision", "Won", "Lost", "Deferred",
];

// Paged rows also carry the party and producer names (joined here).
app.get("/api/opportunities", asyncRoute(async (req, res) => {
  const paging = readPaging(req);
  if (!paging) return res.json(await db.select().from(opportunities).orderBy(desc(opportunities.createdAt)));

  const where = searchAny(paging.q, [parties.fullName, opportunities.class, opportunities.source, producers.name, opportunities.stage]);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ opportunity: opportunities, partyName: parties.fullName, producerName: producers.name })
      .from(opportunities)
      .leftJoin(parties, eq(opportunities.partyId, parties.id))
      .leftJoin(producers, eq(opportunities.producerId, producers.id))
      .where(where).orderBy(desc(opportunities.createdAt), opportunities.id).limit(paging.limit).offset(paging.offset),
    db.select({ total: count() })
      .from(opportunities)
      .leftJoin(parties, eq(opportunities.partyId, parties.id))
      .leftJoin(producers, eq(opportunities.producerId, producers.id))
      .where(where),
  ]);
  sendPage(res, rows.map(({ opportunity, partyName, producerName }) => ({ ...opportunity, partyName, producerName })), total);
}));

app.post("/api/opportunities", asyncRoute(async (req, res) => {
  const stage = req.body.stage && OPPORTUNITY_STAGES.includes(req.body.stage) ? req.body.stage : "New";
  const [newItem] = await db.insert(opportunities).values({
    id: `opp-${uid()}`,
    partyId: req.body.partyId,
    producerId: req.body.producerId,
    source: req.body.source,
    class: req.body.class,
    renewalDate: req.body.renewalDate,
    expectedPremiumKes: req.body.expectedPremiumKes,
    expectedCommissionKes: req.body.expectedCommissionKes,
    stage,
    ownerStaffId: req.body.ownerStaffId,
  }).returning();

  // Every opportunity opens a workflow case (SOP §9: every workflow is a case).
  await db.insert(cases).values({
    id: `case-${uid()}`,
    workflowType: "opportunity",
    entityType: "opportunity",
    entityId: newItem.id,
    currentState: stage,
    ownerStaffId: req.body.ownerStaffId,
  });

  await addAuditLog({ action: "OPPORTUNITY_CREATED", entityType: "opportunity", entityId: newItem.id, actorStaffId: actorId(req, req.body.ownerStaffId), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/opportunities/:id", asyncRoute(async (req, res) => {
  if (req.body.stage && !OPPORTUNITY_STAGES.includes(req.body.stage)) {
    return res.status(400).json({ error: `stage must be one of: ${OPPORTUNITY_STAGES.join(", ")}` });
  }
  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of ["partyId", "producerId", "source", "class", "renewalDate", "expectedPremiumKes", "expectedCommissionKes", "stage", "ownerStaffId", "outcomeReason"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(opportunities).set(values).where(eq(opportunities.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Opportunity not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Insurer catalogue & rate/tax settings (SOP-02: "Use only approved,
// licensed and suitable insurers") — panel status, KYC/licensing, and
// per insurer+class commission rate + statutory levy configuration
// (PCF, Insurance Training Levy, stamp duty) that quotes and premium
// confirmations are computed against.
// ----------------------------------------------------
const INSURER_UPDATABLE_FIELDS = [
  "name", "insurerType", "authorizedClasses", "rating", "panelStatus", "licenseNumber",
  "licenseExpiryDate", "aibkMember", "kycStatus", "contactEmail", "contactPhone", "active",
] as const;

app.get("/api/insurers", asyncRoute(async (req, res) => {
  const rows = await db.select().from(insurers).orderBy(insurers.name);
  res.json(rows);
}));

app.post("/api/insurers", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(insurers).values({
    id: req.body.id || `insurer-${uid()}`,
    name: req.body.name,
    insurerType: req.body.insurerType || "general",
    authorizedClasses: req.body.authorizedClasses || [],
    rating: req.body.rating,
    panelStatus: req.body.panelStatus || "under_review",
    licenseNumber: req.body.licenseNumber,
    licenseExpiryDate: req.body.licenseExpiryDate || undefined,
    aibkMember: req.body.aibkMember ?? false,
    kycStatus: req.body.kycStatus || "pending",
    contactEmail: req.body.contactEmail,
    contactPhone: req.body.contactPhone,
  }).returning();
  await addAuditLog({ action: "INSURER_ADDED", entityType: "insurer", entityId: newItem.id, actorStaffId: actorId(req, req.body.createdByStaffId), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/insurers/:id", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of INSURER_UPDATABLE_FIELDS) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(insurers).set(values).where(eq(insurers.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Insurer not found" });
  res.json(updated);
}));

// Deleting an insurer that already has policies/quotations/rate
// settings against it would orphan real business records — reject
// with a clear message rather than a raw FK-violation 500. Suspend the
// panel status instead if the intent is just "stop using this one."
app.delete("/api/insurers/:id", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  try {
    const [deleted] = await db.delete(insurers).where(eq(insurers.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: "Insurer not found" });
    res.json({ deleted: true, id: deleted.id });
  } catch (err: any) {
    if (err?.code === "23503") {
      return res.status(409).json({ error: "This insurer has policies, quotations or rate settings referencing it — reassign or remove those first, or set panelStatus to 'suspended' instead of deleting." });
    }
    throw err;
  }
}));

app.get("/api/insurer-rates", asyncRoute(async (req, res) => {
  const rows = req.query.insurerId
    ? await db.select().from(insurerRateVersions).where(eq(insurerRateVersions.insurerId, String(req.query.insurerId)))
    : await db.select().from(insurerRateVersions);
  res.json(rows);
}));

// The Commission Guide's ceiling for a class is the highest max
// permitted rate among the guide's policy lines mapped to that class
// (a class can bundle several products at different caps, e.g. Theft
// covers both Money at 10% and Burglary at 20%) — since a negotiated
// commission rate is recorded per class, not per product line, this
// is the least surprising cap to enforce against.
async function maxPermittedCommissionPct(classCode: string): Promise<number | null> {
  const rows = await db.select().from(commissionGuide).where(eq(commissionGuide.classCode, classCode));
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => Number(r.maxPermittedCommissionPct)));
}

app.post("/api/insurer-rates", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const cap = await maxPermittedCommissionPct(req.body.category);
  if (cap != null && req.body.commissionRatePct != null && Number(req.body.commissionRatePct) > cap) {
    return res.status(400).json({ error: `Commission rate exceeds the Commission Guide's maximum permitted rate of ${cap}% for this class` });
  }
  const [newItem] = await db.insert(insurerRateVersions).values({
    id: `rate-${uid()}`,
    insurerId: req.body.insurerId,
    category: req.body.category,
    effectiveFrom: req.body.effectiveFrom || new Date().toISOString().slice(0, 10),
    commissionRatePct: req.body.commissionRatePct,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/insurer-rates/:id", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["category", "effectiveFrom", "effectiveTo", "isProvisional", "commissionRatePct"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.commissionRatePct != null) {
    const [existing] = await db.select().from(insurerRateVersions).where(eq(insurerRateVersions.id, req.params.id));
    const category = (values.category as string) || existing?.category;
    const cap = category ? await maxPermittedCommissionPct(category) : null;
    if (cap != null && Number(values.commissionRatePct) > cap) {
      return res.status(400).json({ error: `Commission rate exceeds the Commission Guide's maximum permitted rate of ${cap}% for this class` });
    }
  }
  const [updated] = await db.update(insurerRateVersions).set(values).where(eq(insurerRateVersions.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Rate setting not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Insurer appetite (SOP-07) — business risk appetite per insurer+class,
// distinct from the licence-based authorizedClasses check: a general
// insurer may be licensed for a class but the brokerage may still not
// want to place there. Enforced in POST /api/submissions above —
// 'excluded' blocks selection, 'restricted' warns.
// ----------------------------------------------------
app.get("/api/insurer-appetite", asyncRoute(async (req, res) => {
  const rows = req.query.insurerId
    ? await db.select().from(insurerAppetite).where(eq(insurerAppetite.insurerId, String(req.query.insurerId)))
    : await db.select().from(insurerAppetite);
  res.json(rows);
}));

app.post("/api/insurer-appetite", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(insurerAppetite).values({
    id: `appetite-${uid()}`,
    insurerId: req.body.insurerId,
    classCode: req.body.classCode,
    appetiteLevel: req.body.appetiteLevel || "accepted",
    maxCapacityKes: req.body.maxCapacityKes ?? null,
    notes: req.body.notes || null,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/insurer-appetite/:id", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["appetiteLevel", "maxCapacityKes", "notes"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(insurerAppetite).set(values).where(eq(insurerAppetite.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Appetite setting not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Product catalog (Underwriting-Framework-inspired) — a named product
// an insurer actually sells, separate from the raw category/class used
// for pricing, so a new product can be published/retired without a
// code change.
// ----------------------------------------------------
app.get("/api/products", asyncRoute(async (req, res) => {
  const rows = req.query.insurerId
    ? await db.select().from(products).where(eq(products.insurerId, String(req.query.insurerId)))
    : await db.select().from(products);
  res.json(rows);
}));

app.post("/api/products", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(products).values({
    id: `product-${uid()}`,
    insurerId: req.body.insurerId,
    category: req.body.category,
    name: req.body.name,
    description: req.body.description || null,
    wordingDocumentId: req.body.wordingDocumentId || null,
    active: req.body.active ?? true,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/products/:id", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["category", "name", "description", "wordingDocumentId", "active"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(products).set(values).where(eq(products.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Product not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Commission Guide — the market's own maximum permitted commission
// rate per line of business (Commission Guide Insurance.xlsx),
// reference data enforced above, not broker-editable in the UI.
// ----------------------------------------------------
app.get("/api/commission-guide", asyncRoute(async (req, res) => {
  const rows = req.query.classCode
    ? await db.select().from(commissionGuide).where(eq(commissionGuide.classCode, String(req.query.classCode)))
    : await db.select().from(commissionGuide);
  res.json(rows);
}));

// ----------------------------------------------------
// Statutory levies (PCF, Insurance Training Levy, stamp duty) — Kenya
// Insurance Act / IRA-mandated charges that apply market-wide, not
// negotiated per insurer. A NULL category means "applies to every
// class." Kept separate from insurer_rate_versions, which only ever
// holds the negotiated commission rate.
// ----------------------------------------------------
app.get("/api/statutory-levies", asyncRoute(async (req, res) => {
  const rows = req.query.category
    ? await db.select().from(statutoryLevies).where(eq(statutoryLevies.category, String(req.query.category)))
    : await db.select().from(statutoryLevies);
  res.json(rows);
}));

app.post("/api/statutory-levies", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(statutoryLevies).values({
    id: `levy-${uid()}`,
    levyType: req.body.levyType,
    category: req.body.category ?? null,
    calculationMethod: req.body.calculationMethod,
    ratePct: req.body.ratePct ?? null,
    flatAmountKes: req.body.flatAmountKes ?? null,
    effectiveFrom: req.body.effectiveFrom || new Date().toISOString().slice(0, 10),
    effectiveTo: req.body.effectiveTo ?? null,
    source: req.body.source ?? null,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/statutory-levies/:id", requirePermission("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["levyType", "category", "calculationMethod", "ratePct", "flatAmountKes", "effectiveFrom", "effectiveTo", "source"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(statutoryLevies).set(values).where(eq(statutoryLevies.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Statutory levy not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Risk, Submission, Quotation, Recommendation (SOP §8) — the market
// placement chain: what's being insured (Risk), who it went to
// (Submission), what came back (Quotation, priced from the insurer's
// rate/tax settings), and why the client picked one (Recommendation).
// This is what stands behind "client instruction" later — not just a
// quote number.
// ----------------------------------------------------
// Class-specific risk data collection — what's mandatory before a
// risk can go to market differs by class (a motor risk needs a
// logbook/registration; a medical risk needs a date of birth and a
// pre-existing-conditions declaration; property needs construction
// type). Stored in the risk's own exposure_attributes JSONB rather
// than a rigid per-class schema, since the classes needing structured
// capture vary and new ones can be added without a migration. Kept in
// sync by hand with RISK_CLASS_FIELDS in src/data/riskClassFields.ts,
// which drives the frontend's dynamic form for the same classes.
const RISK_CLASS_REQUIRED_FIELDS: Record<string, string[]> = {
  "07": ["registrationNumber", "makeModel", "yearOfManufacture", "usage"],
  "08": ["registrationNumber", "makeModel", "yearOfManufacture", "usage"],
  "12": ["dateOfBirth", "preExistingConditions"],
  "03": ["constructionType", "occupancy"],
  "04": ["constructionType", "occupancy"],
  "05": ["businessActivity", "turnoverKes"],
  "09": ["occupation"],
};

app.get("/api/risks", asyncRoute(async (req, res) => {
  const rows = req.query.opportunityId
    ? await db.select().from(risks).where(eq(risks.opportunityId, String(req.query.opportunityId))).orderBy(desc(risks.createdAt))
    : await db.select().from(risks).orderBy(desc(risks.createdAt));
  res.json(rows);
}));

app.post("/api/risks", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(risks).values({
    id: `risk-${uid()}`,
    partyId: req.body.partyId,
    opportunityId: req.body.opportunityId,
    class: req.body.class,
    subjectMatter: req.body.subjectMatter,
    valuationKes: req.body.valuationKes,
    exposureAttributes: req.body.exposureAttributes ?? null,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/risks/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["subjectMatter", "valuationKes", "exposureAttributes"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(risks).set(values).where(eq(risks.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Risk not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Market strategy (SOP-07) — the approved placement approach for a
// risk, recorded before the market submission goes out. A submission
// can't be created without one (enforced in POST /api/submissions
// below), and single-market placement requires a documented
// justification.
// ----------------------------------------------------
app.get("/api/market-strategies", asyncRoute(async (req, res) => {
  const rows = req.query.riskId
    ? await db.select().from(marketStrategies).where(eq(marketStrategies.riskId, String(req.query.riskId))).orderBy(desc(marketStrategies.createdAt))
    : await db.select().from(marketStrategies).orderBy(desc(marketStrategies.createdAt));
  res.json(rows);
}));

app.post("/api/market-strategies", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(marketStrategies).values({
    id: `strat-${uid()}`,
    riskId: req.body.riskId,
    strategyType: req.body.strategyType,
    rationale: req.body.rationale,
    singleSourceJustification: req.body.singleSourceJustification || null,
    approvedBy: actorId(req, req.body.approvedBy),
    approvedAt: new Date(),
  }).returning();
  res.json(newItem);
}));

// ----------------------------------------------------
// Underwriting approval chain — internal sign-off for risks outside
// normal appetite (high value, high-risk industry, large discount,
// unusual terms, high commission, adverse claims history). One
// "request approval" action opens all three stages at once, decided in
// order: team_leader before senior_manager before final. Advisory: it
// does not itself block presenting or accepting a recommendation — see
// the SOP-23 risk-clearance gate for the one approval that does.
// ----------------------------------------------------
const APPROVAL_STAGES = ["team_leader", "senior_manager", "final"] as const;

app.get("/api/underwriting-approvals", asyncRoute(async (req, res) => {
  const rows = req.query.riskId
    ? await db.select().from(underwritingApprovals).where(eq(underwritingApprovals.riskId, String(req.query.riskId))).orderBy(underwritingApprovals.createdAt)
    : await db.select().from(underwritingApprovals).orderBy(desc(underwritingApprovals.createdAt));
  res.json(rows);
}));

app.post("/api/underwriting-approvals", asyncRoute(async (req, res) => {
  const batchId = `appr-batch-${uid()}`;
  const requestedBy = actorId(req, req.body.requestedBy);
  const rows = await db.insert(underwritingApprovals).values(
    APPROVAL_STAGES.map((stage, i) => ({
      id: `appr-${uid()}-${i}`,
      batchId,
      riskId: req.body.riskId,
      reason: req.body.reason,
      stage,
      requestedBy,
    })),
  ).returning();
  res.json(rows);
}));

app.patch("/api/underwriting-approvals/:id", requirePermission("underwriting.approve"), asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(underwritingApprovals).where(eq(underwritingApprovals.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Approval not found" });
  if (existing.decision !== "pending") return res.status(400).json({ error: "This stage has already been decided" });
  // Segregation of duties: whoever asked for the approval can't grant it.
  if (existing.requestedBy === actorId(req)) {
    return res.status(403).json({ error: "You can't decide an approval you requested yourself" });
  }

  // Enforce sequential order within the batch — can't decide a later
  // stage before every earlier stage in this same batch is approved.
  const stageIndex = APPROVAL_STAGES.indexOf(existing.stage as typeof APPROVAL_STAGES[number]);
  if (stageIndex > 0) {
    const priorStages = APPROVAL_STAGES.slice(0, stageIndex);
    const batchRows = await db.select().from(underwritingApprovals).where(eq(underwritingApprovals.batchId, existing.batchId));
    const unapprovedPrior = batchRows.filter((r) => priorStages.includes(r.stage as typeof APPROVAL_STAGES[number]) && r.decision !== "approved");
    if (unapprovedPrior.length > 0) {
      return res.status(400).json({ error: `Prior stage(s) must be approved first: ${unapprovedPrior.map((r) => r.stage).join(", ")}` });
    }
  }

  if (!["approved", "rejected"].includes(req.body.decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }

  const [updated] = await db.update(underwritingApprovals).set({
    decision: req.body.decision,
    approverId: actorId(req, req.body.approverId),
    decidedAt: new Date(),
    comments: req.body.comments,
    conditions: req.body.conditions,
  }).where(eq(underwritingApprovals.id, req.params.id)).returning();
  res.json(updated);
}));

app.get("/api/submissions", asyncRoute(async (req, res) => {
  const rows = req.query.riskId
    ? await db.select().from(submissions).where(eq(submissions.riskId, String(req.query.riskId))).orderBy(desc(submissions.createdAt))
    : await db.select().from(submissions).orderBy(desc(submissions.createdAt));
  res.json(rows);
}));

const SUBMISSION_STAGES = ["Draft", "Approved", "Sent", "Acknowledged", "Clarification", "Quote", "Decline", "Comparison Ready", "Closed"];

app.post("/api/submissions", asyncRoute(async (req, res) => {
  const markets: string[] = req.body.markets || [];

  // SOP-07: the strategy behind a submission is captured before it
  // goes out, not reconstructed after — a submission can't exist
  // without one.
  const [risk] = await db.select().from(risks).where(eq(risks.id, req.body.riskId));
  if (!risk) return res.status(404).json({ error: "Risk not found" });

  // Class-specific risk data collection: the system should identify
  // missing mandatory information before the risk can proceed to
  // market, not leave it for the insurer to discover.
  const requiredFields = RISK_CLASS_REQUIRED_FIELDS[risk.class];
  if (requiredFields) {
    const attrs = (risk.exposureAttributes as Record<string, unknown>) || {};
    const missing = requiredFields.filter((f) => attrs[f] === undefined || attrs[f] === null || attrs[f] === "");
    if (missing.length > 0) {
      return res.status(400).json({ error: `This risk is missing required information for its class: ${missing.join(", ")}`, missingFields: missing });
    }
  }

  const [strategy] = await db.select().from(marketStrategies).where(eq(marketStrategies.riskId, req.body.riskId)).orderBy(desc(marketStrategies.createdAt));
  if (!strategy) return res.status(400).json({ error: "A market strategy must be recorded for this risk before submitting to market (SOP-07)" });

  // All validation happens before any write — a request that ends up
  // rejected (e.g. on the appetite check below) must not leave a
  // partial side effect like a backfilled justification behind.
  let singleSourceJustification: string | null = null;
  if (markets.length === 1) {
    singleSourceJustification = strategy.singleSourceJustification || req.body.singleSourceJustification || null;
    if (!singleSourceJustification) {
      return res.status(400).json({ error: "Single-market placement requires a documented justification" });
    }
  }

  // Business risk appetite — distinct from the licence-based
  // authorizedClasses check the insurer picker already enforces.
  // 'excluded' blocks selection outright; 'restricted' is allowed but
  // surfaced as a warning, not silently accepted.
  const appetiteRows = markets.length
    ? await db.select().from(insurerAppetite).where(and(eq(insurerAppetite.classCode, risk.class), inArray(insurerAppetite.insurerId, markets)))
    : [];
  const excluded = appetiteRows.filter((a) => a.appetiteLevel === "excluded");
  if (excluded.length > 0) {
    return res.status(400).json({ error: `These insurers are excluded from this class's appetite and cannot be selected as a market: ${excluded.map((a) => a.insurerId).join(", ")}` });
  }
  const restricted = appetiteRows.filter((a) => a.appetiteLevel === "restricted").map((a) => a.insurerId);

  if (singleSourceJustification && !strategy.singleSourceJustification) {
    await db.update(marketStrategies).set({ singleSourceJustification }).where(eq(marketStrategies.id, strategy.id));
  }

  const [newItem] = await db.insert(submissions).values({
    id: `sub-${uid()}`,
    riskId: req.body.riskId,
    markets,
    deadlineAt: req.body.deadlineAt ? new Date(req.body.deadlineAt) : undefined,
    status: "Draft",
  }).returning();

  await db.insert(cases).values({
    id: `case-${uid()}`,
    workflowType: "submission",
    entityType: "submission",
    entityId: newItem.id,
    currentState: newItem.status,
  });

  res.json({ ...newItem, restrictedInsurerWarnings: restricted });
}));

app.patch("/api/submissions/:id", asyncRoute(async (req, res) => {
  if (req.body.status && !SUBMISSION_STAGES.includes(req.body.status)) {
    return res.status(400).json({ error: `status must be one of: ${SUBMISSION_STAGES.join(", ")}` });
  }
  const values: Record<string, unknown> = {};
  for (const field of ["markets", "status"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.status === "Sent" && !req.body.dispatchedAt) values.dispatchedAt = new Date();
  const [updated] = await db.update(submissions).set(values).where(eq(submissions.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Submission not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Underwriter queries — an insurer's mid-submission information
// request, tracked as its own record instead of living only in an
// email chain: question -> broker reviews -> client info required ->
// client responds -> broker validates -> response sent -> underwriter
// decision.
// ----------------------------------------------------
app.get("/api/underwriting-queries", asyncRoute(async (req, res) => {
  const rows = req.query.submissionId
    ? await db.select().from(underwritingQueries).where(eq(underwritingQueries.submissionId, String(req.query.submissionId))).orderBy(desc(underwritingQueries.receivedAt))
    : await db.select().from(underwritingQueries).orderBy(desc(underwritingQueries.receivedAt));
  res.json(rows);
}));

app.post("/api/underwriting-queries", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(underwritingQueries).values({
    id: `uq-${uid()}`,
    submissionId: req.body.submissionId,
    question: req.body.question,
    requiredResponseDate: req.body.requiredResponseDate,
    responsibleStaffId: actorId(req, req.body.responsibleStaffId),
    clientInfoRequired: req.body.clientInfoRequired,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/underwriting-queries/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["clientInfoRequired", "response", "responseDocumentId", "status"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  // Recording a response without an explicit status move naturally
  // advances the query — a broker shouldn't have to remember two
  // separate updates for the one action.
  if (req.body.response !== undefined && req.body.status === undefined) values.status = "responded";
  const [updated] = await db.update(underwritingQueries).set(values).where(eq(underwritingQueries.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Query not found" });
  res.json(updated);
}));

app.get("/api/quotations", asyncRoute(async (req, res) => {
  const rows = req.query.submissionId
    ? await db.select().from(quotations).where(eq(quotations.submissionId, String(req.query.submissionId))).orderBy(desc(quotations.createdAt))
    : await db.select().from(quotations).orderBy(desc(quotations.createdAt));
  res.json(rows);
}));

// Priced from the insurer's active rate/tax setting for this class —
// the same settings the Insurer panel manages — so every quotation is
// consistent with what Finance will later project as commission.
// Statutory levies are government-mandated and market-wide, not
// negotiated per insurer: a NULL category means "applies to every
// class." Where both a class-specific and a general levy of the same
// type are in force, the class-specific one wins.
async function findStatutoryLevy(levyType: string, category: string, asOf: string) {
  const candidates = await db.select().from(statutoryLevies).where(
    and(
      eq(statutoryLevies.levyType, levyType),
      or(eq(statutoryLevies.category, category), isNull(statutoryLevies.category)),
      lte(statutoryLevies.effectiveFrom, asOf),
      or(isNull(statutoryLevies.effectiveTo), gte(statutoryLevies.effectiveTo, asOf)),
    ),
  );
  candidates.sort((a, b) => {
    if (Boolean(a.category) !== Boolean(b.category)) return a.category ? -1 : 1;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  });
  return candidates[0];
}

function leviedAmount(levy: { calculationMethod: string; ratePct: number | null; flatAmountKes: number | null } | undefined, basePremiumKes: number) {
  if (!levy) return 0;
  if (levy.calculationMethod === "flat") return levy.flatAmountKes || 0;
  return levy.ratePct ? Math.round(basePremiumKes * (levy.ratePct / 100) * 100) / 100 : 0;
}

app.post("/api/quotations", asyncRoute(async (req, res) => {
  const { submissionId, clientId, category, insurerId, sumInsuredKes, basePremiumKes } = req.body;
  const [insurer] = await db.select().from(insurers).where(eq(insurers.id, insurerId));
  if (!insurer) return res.status(404).json({ error: "Insurer not found" });

  const [rate] = await db.select().from(insurerRateVersions)
    .where(and(eq(insurerRateVersions.insurerId, insurerId), eq(insurerRateVersions.category, category)))
    .orderBy(desc(insurerRateVersions.effectiveFrom))
    .limit(1);

  const asOf = new Date().toISOString().slice(0, 10);
  const [pcfLevy, itlLevy, stampDutyLevy] = await Promise.all([
    findStatutoryLevy("pcf", category, asOf),
    findStatutoryLevy("itl", category, asOf),
    findStatutoryLevy("stamp_duty", category, asOf),
  ]);
  const pcfLevyKes = leviedAmount(pcfLevy, basePremiumKes);
  const itlLevyKes = leviedAmount(itlLevy, basePremiumKes);
  const stampDutyKes = leviedAmount(stampDutyLevy, basePremiumKes);
  const totalPremiumKes = Math.round((basePremiumKes + pcfLevyKes + itlLevyKes + stampDutyKes) * 100) / 100;

  const [newItem] = await db.insert(quotations).values({
    id: `quote-${uid()}`,
    submissionId,
    clientId,
    category,
    insurerId,
    insurerName: insurer.name,
    rateVersionRef: rate?.id,
    sumInsuredKes,
    basePremiumKes,
    pcfLevyKes,
    itlLevyKes,
    stampDutyKes,
    totalPremiumKes,
    commissionRatePct: rate?.commissionRatePct,
    limits: req.body.limits,
    deductibles: req.body.deductibles,
    exclusions: req.body.exclusions,
    warranties: req.body.warranties,
    extensions: req.body.extensions,
    conditions: req.body.conditions,
    paymentTerms: req.body.paymentTerms,
    specialTerms: req.body.specialTerms,
    validUntil: req.body.validUntil,
    assignedStaffId: actorId(req, req.body.assignedStaffId),
  }).returning();
  res.json(newItem);
}));

app.patch("/api/quotations/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["status", "validUntil", "limits", "deductibles", "exclusions", "warranties", "extensions", "conditions", "paymentTerms", "specialTerms"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(quotations).set(values).where(eq(quotations.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Quotation not found" });
  res.json(updated);
}));

app.get("/api/recommendations", asyncRoute(async (req, res) => {
  const rows = req.query.submissionId
    ? await db.select().from(recommendations).where(eq(recommendations.submissionId, String(req.query.submissionId))).orderBy(desc(recommendations.createdAt))
    : await db.select().from(recommendations).orderBy(desc(recommendations.createdAt));
  res.json(rows);
}));

app.post("/api/recommendations", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(recommendations).values({
    id: `rec-${uid()}`,
    submissionId: req.body.submissionId,
    comparedQuotationIds: req.body.comparedQuotationIds || [],
    recommendedQuotationId: req.body.recommendedQuotationId,
    reasons: req.body.reasons,
    disclosures: req.body.disclosures,
    limitations: req.body.limitations,
    presentedBy: actorId(req, req.body.presentedBy),
    presentedAt: new Date(),
    clientDecision: "pending",
  }).returning();

  await db.update(submissions).set({ status: "Comparison Ready" }).where(eq(submissions.id, req.body.submissionId));

  res.json(newItem);
}));

app.patch("/api/recommendations/:id", asyncRoute(async (req, res) => {
  if (req.body.clientDecision !== undefined && !(await hasPermission(req, "recommendation.decide"))) {
    return res.status(403).json({ error: "Missing permission: recommendation.decide" });
  }

  // SOP-23: a recommendation can't be accepted until the risk behind
  // it has cleared sanctions/PEP screening and a conflict-of-interest
  // check — "high-risk onboarding, screening alert... unusual
  // activity" is exactly what this gate exists to catch before
  // instruction, not after.
  if (req.body.clientDecision === "accepted") {
    const [existingRec] = await db.select().from(recommendations).where(eq(recommendations.id, req.params.id));
    if (!existingRec) return res.status(404).json({ error: "Recommendation not found" });
    const [submission] = await db.select().from(submissions).where(eq(submissions.id, existingRec.submissionId));
    const [clearance] = submission
      ? await db.select().from(riskClearances).where(eq(riskClearances.riskId, submission.riskId)).orderBy(desc(riskClearances.createdAt)).limit(1)
      : [];
    const cleared = clearance && ["clear", "override"].includes(clearance.sanctionsScreeningResult) && clearance.conflictOfInterestChecked;
    if (!cleared) {
      return res.status(400).json({ error: "This risk has not cleared sanctions/PEP screening and conflict-of-interest checks (SOP-23) — record a clearance before accepting the client's decision" });
    }
  }

  const values: Record<string, unknown> = {};
  for (const field of ["clientDecision", "deviationNotes"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.clientDecision && values.clientDecision !== "pending") values.decidedAt = new Date();

  const [updated] = await db.update(recommendations).set(values).where(eq(recommendations.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Recommendation not found" });

  if (req.body.clientDecision === "accepted") {
    await addAuditLog({ action: "RECOMMENDATION_ACCEPTED", entityType: "recommendation", entityId: updated.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: updated });
  }
  res.json(updated);
}));

// ----------------------------------------------------
// Risk clearance (SOP-23) — sanctions/PEP screening and
// conflict-of-interest check for a risk, gating whether a client's
// recommendation decision can be accepted (see PATCH
// /api/recommendations/:id above).
// ----------------------------------------------------
app.get("/api/risk-clearances", asyncRoute(async (req, res) => {
  const rows = req.query.riskId
    ? await db.select().from(riskClearances).where(eq(riskClearances.riskId, String(req.query.riskId))).orderBy(desc(riskClearances.createdAt))
    : await db.select().from(riskClearances).orderBy(desc(riskClearances.createdAt));
  res.json(rows);
}));

app.post("/api/risk-clearances", requirePermission("recommendation.decide"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(riskClearances).values({
    id: `clr-${uid()}`,
    riskId: req.body.riskId,
    sanctionsScreeningResult: req.body.sanctionsScreeningResult || "pending",
    pepStatus: req.body.pepStatus ?? false,
    conflictOfInterestChecked: req.body.conflictOfInterestChecked ?? false,
    conflictOfInterestNotes: req.body.conflictOfInterestNotes || null,
    clearedBy: req.body.sanctionsScreeningResult && req.body.sanctionsScreeningResult !== "pending" ? actorId(req, req.body.clearedBy) : null,
    clearedAt: req.body.sanctionsScreeningResult && req.body.sanctionsScreeningResult !== "pending" ? new Date() : null,
  }).returning();
  res.json(newItem);
}));

// ----------------------------------------------------
// Policies (SOP §8 Policy) — Pending → Received → Under Check →
// Discrepancy → Corrected → Delivered → Active → Expired/Cancelled/Lapsed
// ----------------------------------------------------
const POLICY_UPDATABLE_FIELDS = [
  "quotationId", "clientId", "insurerId", "producerId", "category", "premiumAmount",
  "status", "startDate", "endDate", "policyDocumentId",
  "deliveryMethod", "clientAcknowledgedAt", "premiumDueDate",
] as const;

// SOP-11: the fixed set of items compared against the placement
// instruction before a policy can be marked fully issued.
const STANDARD_POLICY_CHECKLIST = [
  "Policy number and dates match placement",
  "Class and subject matter match",
  "Premium matches quotation/placement instruction",
  "Sum insured and limits match",
  "Names and interests correct",
  "Deductibles, warranties and exclusions match",
  "Wording, clauses and certificates match",
];

// Paged rows also carry the client and insurer names (joined here), so the
// list screen doesn't have to download every party and insurer to show them.
app.get("/api/policies", asyncRoute(async (req, res) => {
  const paging = readPaging(req);
  if (!paging) return res.json(await db.select().from(policies).orderBy(desc(policies.createdAt)));

  const where = searchAny(paging.q, [policies.id, parties.fullName, policies.category, insurers.name, policies.status]);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ policy: policies, clientName: parties.fullName, insurerName: insurers.name })
      .from(policies)
      .leftJoin(parties, eq(policies.clientId, parties.id))
      .leftJoin(insurers, eq(policies.insurerId, insurers.id))
      .where(where).orderBy(desc(policies.createdAt), policies.id).limit(paging.limit).offset(paging.offset),
    db.select({ total: count() })
      .from(policies)
      .leftJoin(parties, eq(policies.clientId, parties.id))
      .leftJoin(insurers, eq(policies.insurerId, insurers.id))
      .where(where),
  ]);
  sendPage(res, rows.map(({ policy, clientName, insurerName }) => ({ ...policy, clientName, insurerName })), total);
}));

app.post("/api/policies", asyncRoute(async (req, res) => {
  const quotationId = req.body.quotationId || req.body.quoteId;
  // A policy's sum insured starts from the winning quotation, but is
  // tracked on the policy itself (not re-read from the quotation)
  // since it can drift via endorsements after bind.
  const [sourceQuote] = quotationId ? await db.select().from(quotations).where(eq(quotations.id, quotationId)) : [];

  // A policy bound from a placement chain inherits the producer
  // attached to the opportunity that started it (quotation ->
  // submission -> risk -> opportunity) — there's no separate UI step
  // to re-pick a producer at bind time, so this is the only point
  // that carries it forward. Explicit producerId in the body wins.
  let producerId = req.body.producerId;
  if (!producerId && sourceQuote?.submissionId) {
    const [submission] = await db.select().from(submissions).where(eq(submissions.id, sourceQuote.submissionId));
    if (submission) {
      const [risk] = await db.select().from(risks).where(eq(risks.id, submission.riskId));
      if (risk?.opportunityId) {
        const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, risk.opportunityId));
        producerId = opportunity?.producerId ?? undefined;
      }
    }
  }

  // Six random digits collide often enough to matter (~14% odds of at least one
  // clash across 500 policies), so retry on a duplicate-key error instead of 500ing.
  let newItem!: typeof policies.$inferSelect;
  for (let attempt = 0; ; attempt++) {
    try {
      const [inserted] = await db.insert(policies).values({
        id: `UTM-POL-${Math.floor(100000 + Math.random() * 900000)}`,
        startDate: req.body.startDate || new Date().toISOString().slice(0, 10),
        quotationId,
        clientId: req.body.clientId,
        insurerId: req.body.insurerId,
        producerId,
        category: req.body.category,
        premiumAmount: req.body.premiumAmount,
        status: req.body.status || "Pending",
        endDate: req.body.endDate,
        policyDocumentId: req.body.policyDocumentId,
        sumInsuredKes: req.body.sumInsuredKes ?? sourceQuote?.sumInsuredKes ?? null,
      }).returning();
      newItem = inserted;
      break;
    } catch (err: any) {
      if (pgErrorCode(err) === "23505" && attempt < 5) continue;
      throw err;
    }
  }

  // Placement case — a policy cannot reach "Active" without the case
  // passing through the premium-evidence gate (SOP §1.1, §15.1).
  await db.insert(cases).values({
    id: `case-${uid()}`,
    workflowType: "policy",
    entityType: "policy",
    entityId: newItem.id,
    currentState: newItem.status,
  });

  await addAuditLog({ action: "POLICY_CREATED", entityType: "policy", entityId: newItem.id, actorStaffId: actorId(req, req.body.createdByStaffId), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/policies/:id", asyncRoute(async (req, res) => {
  // SOP-11: "cannot mark fully issued before check and critical
  // discrepancy resolution" — every checklist item must pass and
  // every discrepancy must be resolved before Delivered.
  if (req.body.status === "Delivered") {
    const checks = await db.select().from(policyChecks).where(eq(policyChecks.policyId, req.params.id));
    const openDiscrepancies = await db.select().from(discrepancies).where(and(eq(discrepancies.policyId, req.params.id), eq(discrepancies.status, "open")));
    const unfinishedChecks = checks.filter((c) => c.status !== "pass");
    if (checks.length === 0 || unfinishedChecks.length > 0 || openDiscrepancies.length > 0) {
      return res.status(400).json({
        error: "Cannot mark Delivered: all checklist items must pass and all discrepancies must be resolved first",
        unfinishedChecks: unfinishedChecks.length,
        openDiscrepancies: openDiscrepancies.length,
      });
    }
    if (req.body.deliveredAt === undefined) req.body.deliveredAt = new Date().toISOString();
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of POLICY_UPDATABLE_FIELDS) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (req.body.deliveredAt !== undefined) values.deliveredAt = new Date(req.body.deliveredAt);
  if (req.body.clientAcknowledgedAt !== undefined) values.clientAcknowledgedAt = new Date(req.body.clientAcknowledgedAt);

  const [updated] = await db.update(policies).set(values).where(eq(policies.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Policy not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Policy issuance checking (SOP-11) — a fixed checklist compared
// against the placement instruction, plus discrepancy tracking. A
// policy can't be marked Delivered until every checklist item passes
// and every discrepancy is resolved (enforced in the PATCH above).
// ----------------------------------------------------
app.post("/api/policies/:id/start-check", asyncRoute(async (req, res) => {
  const [policy] = await db.select().from(policies).where(eq(policies.id, req.params.id));
  if (!policy) return res.status(404).json({ error: "Policy not found" });

  const existing = await db.select().from(policyChecks).where(eq(policyChecks.policyId, req.params.id));
  if (existing.length === 0) {
    await db.insert(policyChecks).values(
      STANDARD_POLICY_CHECKLIST.map((item, i) => ({
        id: `check-${uid()}-${i}`,
        policyId: req.params.id,
        checkItem: item,
      })),
    );
  }
  if (policy.status === "Pending" || policy.status === "Received") {
    await db.update(policies).set({ status: "Under Check", updatedAt: new Date() }).where(eq(policies.id, req.params.id));
  }

  const checks = await db.select().from(policyChecks).where(eq(policyChecks.policyId, req.params.id));
  res.json(checks);
}));

app.get("/api/policy-checks", asyncRoute(async (req, res) => {
  const rows = req.query.policyId
    ? await db.select().from(policyChecks).where(eq(policyChecks.policyId, String(req.query.policyId)))
    : await db.select().from(policyChecks);
  res.json(rows);
}));

app.patch("/api/policy-checks/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["notes"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (req.body.status !== undefined) {
    values.status = req.body.status;
    values.checkedBy = actorId(req, req.body.checkedBy);
    values.checkedAt = new Date();
  }
  const [updated] = await db.update(policyChecks).set(values).where(eq(policyChecks.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Check item not found" });

  // A failed check moves the policy into Discrepancy so its status
  // reflects reality, not just the checklist's own state.
  if (req.body.status === "fail") {
    const [policy] = await db.select().from(policies).where(eq(policies.id, updated.policyId));
    if (policy && !["Discrepancy", "Delivered", "Active"].includes(policy.status)) {
      await db.update(policies).set({ status: "Discrepancy", updatedAt: new Date() }).where(eq(policies.id, updated.policyId));
    }
  }
  res.json(updated);
}));

app.get("/api/discrepancies", asyncRoute(async (req, res) => {
  const rows = req.query.policyId
    ? await db.select().from(discrepancies).where(eq(discrepancies.policyId, String(req.query.policyId))).orderBy(desc(discrepancies.createdAt))
    : await db.select().from(discrepancies).orderBy(desc(discrepancies.createdAt));
  res.json(rows);
}));

app.post("/api/discrepancies", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(discrepancies).values({
    id: `disc-${uid()}`,
    policyId: req.body.policyId,
    policyCheckId: req.body.policyCheckId || null,
    description: req.body.description,
    raisedBy: actorId(req, req.body.raisedBy),
  }).returning();

  const [policy] = await db.select().from(policies).where(eq(policies.id, req.body.policyId));
  if (policy && !["Delivered", "Active"].includes(policy.status)) {
    await db.update(policies).set({ status: "Discrepancy", updatedAt: new Date() }).where(eq(policies.id, req.body.policyId));
  }
  res.json(newItem);
}));

app.patch("/api/discrepancies/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  if (req.body.status !== undefined) {
    values.status = req.body.status;
    if (req.body.status !== "open") {
      values.resolvedBy = actorId(req, req.body.resolvedBy);
      values.resolvedAt = new Date();
    }
  }
  const [updated] = await db.update(discrepancies).set(values).where(eq(discrepancies.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Discrepancy not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Endorsements (SOP §8/§9) — mid-term policy changes: Requested →
// Information → Terms → Client Approval → Instructed → Issued →
// Checked → Completed, or Declined at any point before Instructed.
// ----------------------------------------------------
// Endorsement taxonomy — five categories, each with its own fixed set
// of types. Reaching status 'Completed' is what actually applies the
// endorsement's effect (see applyEndorsementEffect below) rather than
// just recording history — types with no normalized destination field
// (scheduled assets, named perils, sub-limits, riders, policy wording)
// still get their structured afterValue captured for the audit trail,
// they just don't mutate anything else.
const ENDORSEMENT_TYPES_BY_CATEGORY: Record<string, string[]> = {
  financial_valuation: ["adjust_sum_insured", "alter_deductible", "switch_valuation_method", "lock_agreed_value", "modify_premium_rate", "apply_premium_credit"],
  coverage_expansion: ["schedule_new_asset", "include_excluded_peril", "extend_geographic_boundary", "add_insured_party", "increase_sub_limit", "attach_rider"],
  coverage_restriction: ["delete_removed_asset", "exclude_peril", "remove_insured_party", "decrease_sub_limit"],
  contractual_legal: ["amend_policy_language", "extend_policy_lifespan", "cancel_policy_midterm", "reinstate_lapsed_coverage"],
  administrative: ["correct_legal_name", "update_physical_address", "modify_payment_schedule"],
};
const ALL_ENDORSEMENT_TYPES = Object.values(ENDORSEMENT_TYPES_BY_CATEGORY).flat();

// Applies a completed endorsement's effect to the policy it belongs
// to (or, for the two identity-correction types, to the client party
// instead) — this is what makes an endorsement a real mid-term policy
// change rather than a historical note. afterValue's shape is
// type-specific; a type with no case here (e.g. schedule_new_asset)
// simply has no normalized field to write to and stays audit-only.
async function applyEndorsementEffect(endorsement: typeof endorsements.$inferSelect) {
  const after = (endorsement.afterValue as Record<string, unknown>) || {};
  const [policy] = await db.select().from(policies).where(eq(policies.id, endorsement.policyId));
  if (!policy) return;

  switch (endorsement.endorsementType) {
    case "adjust_sum_insured":
      if (after.sumInsuredKes !== undefined) await db.update(policies).set({ sumInsuredKes: after.sumInsuredKes as number, updatedAt: new Date() }).where(eq(policies.id, policy.id));
      break;
    case "alter_deductible":
      if (after.deductibleKes !== undefined) await db.update(policies).set({ deductibleKes: after.deductibleKes as number, updatedAt: new Date() }).where(eq(policies.id, policy.id));
      break;
    case "switch_valuation_method":
      if (after.valuationMethod !== undefined) await db.update(policies).set({ valuationMethod: after.valuationMethod as string, updatedAt: new Date() }).where(eq(policies.id, policy.id));
      break;
    case "lock_agreed_value":
      if (after.agreedValueKes !== undefined) await db.update(policies).set({ valuationMethod: "agreed_value", agreedValueKes: after.agreedValueKes as number, updatedAt: new Date() }).where(eq(policies.id, policy.id));
      break;
    case "modify_premium_rate":
    case "apply_premium_credit":
      if (endorsement.premiumAdjustmentKes) {
        await db.update(policies).set({ premiumAmount: Number(policy.premiumAmount) + Number(endorsement.premiumAdjustmentKes), updatedAt: new Date() }).where(eq(policies.id, policy.id));
      }
      break;
    case "extend_policy_lifespan":
      if (after.newEndDate) await db.update(policies).set({ endDate: after.newEndDate as string, updatedAt: new Date() }).where(eq(policies.id, policy.id));
      break;
    case "cancel_policy_midterm":
      await db.update(policies).set({ status: "Cancelled", updatedAt: new Date() }).where(eq(policies.id, policy.id));
      break;
    case "reinstate_lapsed_coverage":
      if (["Cancelled", "Lapsed", "Expired"].includes(policy.status)) {
        await db.update(policies).set({ status: "Active", updatedAt: new Date() }).where(eq(policies.id, policy.id));
      }
      break;
    case "correct_legal_name":
      if (after.correctedName && policy.clientId) await db.update(parties).set({ fullName: after.correctedName as string, updatedAt: new Date() }).where(eq(parties.id, policy.clientId));
      break;
    case "update_physical_address":
      if (after.newAddress && policy.clientId) await db.update(parties).set({ physicalAddress: after.newAddress as string, updatedAt: new Date() }).where(eq(parties.id, policy.clientId));
      break;
    default:
      break; // schedule_new_asset, perils, sub-limits, riders, policy wording, payment schedule — audit-only, no normalized field to update
  }
}

app.get("/api/endorsements", asyncRoute(async (req, res) => {
  const rows = req.query.policyId
    ? await db.select().from(endorsements).where(eq(endorsements.policyId, String(req.query.policyId))).orderBy(desc(endorsements.createdAt))
    : await db.select().from(endorsements).orderBy(desc(endorsements.createdAt));
  res.json(rows);
}));

app.post("/api/endorsements", asyncRoute(async (req, res) => {
  if (!ALL_ENDORSEMENT_TYPES.includes(req.body.endorsementType)) {
    return res.status(400).json({ error: `endorsementType must be one of: ${ALL_ENDORSEMENT_TYPES.join(", ")}` });
  }
  if (!ENDORSEMENT_TYPES_BY_CATEGORY[req.body.endorsementCategory]?.includes(req.body.endorsementType)) {
    return res.status(400).json({ error: `${req.body.endorsementType} does not belong to category ${req.body.endorsementCategory}` });
  }

  const [newItem] = await db.insert(endorsements).values({
    id: `UTM-END-${Math.floor(1000 + Math.random() * 9000)}`,
    policyId: req.body.policyId,
    endorsementCategory: req.body.endorsementCategory,
    endorsementType: req.body.endorsementType,
    description: req.body.description,
    beforeValue: req.body.beforeValue,
    afterValue: req.body.afterValue,
    premiumAdjustmentKes: req.body.premiumAdjustmentKes ?? 0,
    effectiveDate: req.body.effectiveDate,
    status: "Requested",
    requestedBy: actorId(req, req.body.requestedBy),
  }).returning();
  await addAuditLog({ action: "ENDORSEMENT_REQUESTED", entityType: "endorsement", entityId: newItem.id, actorStaffId: actorId(req, req.body.requestedBy), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/endorsements/:id", asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(endorsements).where(eq(endorsements.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Endorsement not found" });

  const values: Record<string, unknown> = {};
  for (const field of ["description", "afterValue", "premiumAdjustmentKes", "effectiveDate", "status", "approvedBy"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }

  const [updated] = await db.update(endorsements).set(values).where(eq(endorsements.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Endorsement not found" });

  // Reaching Completed for the first time is what actually applies
  // the effect — re-saving an already-completed endorsement (e.g. a
  // later description edit) must never re-apply it.
  if (values.status === "Completed" && existing.status !== "Completed") {
    await applyEndorsementEffect(updated);
    await db.update(endorsements).set({ appliedAt: new Date() }).where(eq(endorsements.id, updated.id));
    updated.appliedAt = new Date();
  }

  await addAuditLog({ action: "ENDORSEMENT_UPDATED", entityType: "endorsement", entityId: updated.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: updated });
  res.json(updated);
}));

// ----------------------------------------------------
// Renewals (SOP §12.2 / wireframe §12.2) — the 90-120 day renewal
// pipeline: one row per policy's upcoming expiry, tracked separately
// from the policy so reminder cadence and outcome survive across
// multiple renewal cycles of the same policy.
// ----------------------------------------------------
app.get("/api/renewals", asyncRoute(async (req, res) => {
  const rows = req.query.policyId
    ? await db.select().from(renewals).where(eq(renewals.policyId, String(req.query.policyId))).orderBy(desc(renewals.dueDate))
    : await db.select().from(renewals).orderBy(desc(renewals.dueDate));
  res.json(rows);
}));

app.post("/api/renewals", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(renewals).values({
    id: `renewal-${uid()}`,
    policyId: req.body.policyId,
    renewalStatus: req.body.renewalStatus || "upcoming",
    dueDate: req.body.dueDate,
    caseOpenedAt: new Date(),
  }).returning();
  res.json(newItem);
}));

app.patch("/api/renewals/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["renewalStatus", "dueDate", "reminderCount", "renewedPolicyId"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (req.body.lastReminderAt !== undefined) values.lastReminderAt = new Date(req.body.lastReminderAt);
  const [updated] = await db.update(renewals).set(values).where(eq(renewals.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Renewal not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Claims (SOP §8/§9) — FNOL through settlement: Notified →
// Acknowledged → Documents → Assessment → Decision → Offer/Repudiated
// → Payment → Closed.
// ----------------------------------------------------
const CLAIM_STAGES = [
  "Notified", "Acknowledged", "Documents", "Assessment", "Decision",
  "Offer", "Repudiated", "Payment", "Closed",
];
const CLAIM_DECISION_STAGES = ["Decision", "Offer", "Repudiated", "Payment"];

app.get("/api/claims", asyncRoute(async (req, res) => {
  const rows = await db.select().from(claims).orderBy(desc(claims.reportedDate));
  res.json(rows);
}));

// Claims escalation dashboard — days outstanding, last action, a next-
// action hint keyed off the claim's own stage, and an escalation level
// derived from how long it's been open (plus fraud/priority/manager-
// review flags, which escalate regardless of age). Entirely computed
// from data that already exists — no new state to keep in sync.
const NEXT_ACTION_HINT: Record<string, string> = {
  Notified: "Verify coverage and open documentation checklist",
  Acknowledged: "Request outstanding documents",
  Documents: "Chase outstanding documents; submit to insurer once complete",
  Assessment: "Awaiting adjuster/assessment outcome",
  Decision: "Awaiting insurer decision",
  Offer: "Awaiting client acceptance of offer",
  Repudiated: "Manager review required before closure",
  Payment: "Confirm payment reference and obtain client confirmation",
  Closed: "None",
};

app.get("/api/claims-escalation", asyncRoute(async (req, res) => {
  const allClaims = await db.select().from(claims);
  const openClaims = allClaims.filter((c) => c.status !== "Closed");
  const today = new Date();

  const rows = await Promise.all(openClaims.map(async (claim) => {
    const timeline = await db.select().from(claimTimelineSteps).where(eq(claimTimelineSteps.claimId, claim.id)).orderBy(desc(claimTimelineSteps.sortOrder));
    const lastStep = timeline[0];
    const daysOutstanding = Math.floor((today.getTime() - new Date(claim.reportedDate).getTime()) / 86_400_000);

    let escalationLevel: "normal" | "watch" | "escalate" | "critical" = "normal";
    if (daysOutstanding > 30) escalationLevel = "critical";
    else if (daysOutstanding > 14) escalationLevel = "escalate";
    else if (daysOutstanding > 7) escalationLevel = "watch";
    if (claim.requiresManagerReview && escalationLevel === "normal") escalationLevel = "watch";
    if (claim.priority === "red" && escalationLevel !== "critical") escalationLevel = "escalate";

    return {
      claimId: claim.id,
      policyId: claim.policyId,
      status: claim.status,
      priority: claim.priority,
      assignedOfficerId: claim.assignedOfficerId,
      requiresManagerReview: claim.requiresManagerReview,
      fraudFlag: claim.fraudFlag,
      daysOutstanding,
      lastActionDate: lastStep?.eventDate ?? claim.reportedDate,
      lastActionDetail: lastStep?.detail ?? "Claim registered",
      nextActionHint: NEXT_ACTION_HINT[claim.status] || "Review claim",
      escalationLevel,
    };
  }));

  rows.sort((a, b) => b.daysOutstanding - a.daysOutstanding);
  const summary = { normal: 0, watch: 0, escalate: 0, critical: 0 } as Record<string, number>;
  for (const r of rows) summary[r.escalationLevel]++;
  res.json({ rows, summary });
}));

app.get("/api/claims/:id", asyncRoute(async (req, res) => {
  const [claim] = await db.select().from(claims).where(eq(claims.id, req.params.id));
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  const timeline = await db.select().from(claimTimelineSteps)
    .where(eq(claimTimelineSteps.claimId, req.params.id))
    .orderBy(claimTimelineSteps.sortOrder);
  res.json({ ...claim, timeline });
}));

app.post("/api/claims", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(claims).values({
    id: `UTM-CLM-${Math.floor(100000 + Math.random() * 900000)}`,
    policyId: req.body.policyId,
    policyNumber: req.body.policyNumber || req.body.policyId,
    claimType: req.body.claimType,
    phoneNumber: req.body.phoneNumber,
    description: req.body.description,
    lossDate: req.body.lossDate || undefined,
  }).returning();

  // FNOL always opens the timeline (SOP: "Claim registration — Immediate").
  await db.insert(claimTimelineSteps).values({
    claimId: newItem.id,
    status: "Notified",
    eventDate: new Date(),
    completed: true,
    detail: "Claim registered (First Notification of Loss).",
    sortOrder: 0,
  });

  await db.insert(cases).values({
    id: `case-${uid()}`,
    workflowType: "claim",
    entityType: "claim",
    entityId: newItem.id,
    currentState: newItem.status,
  });

  await addAuditLog({ action: "CLAIM_REGISTERED", entityType: "claim", entityId: newItem.id, actorStaffId: actorId(req, req.body.createdByStaffId), afterState: newItem });
  res.json(newItem);
}));

// ----------------------------------------------------
// Pre-submission coverage verification — the policy itself (active?
// loss within period? asset covered? premium paid? within limit?),
// distinct from the documents checklist further below. A fixed set of
// items seeded once per claim.
// ----------------------------------------------------
const STANDARD_COVERAGE_CHECKLIST = [
  "Policy active at date of loss",
  "Loss occurred within the policy period",
  "Insured person or asset is listed on the policy",
  "Premium was paid up to date of loss",
  "Claim falls within the policy limit",
  "Applicable excess identified",
  "No relevant exclusion applies",
];

app.post("/api/claims/:id/start-coverage-check", asyncRoute(async (req, res) => {
  const [claim] = await db.select().from(claims).where(eq(claims.id, req.params.id));
  if (!claim) return res.status(404).json({ error: "Claim not found" });

  const existing = await db.select().from(coverageVerificationItems).where(eq(coverageVerificationItems.claimId, req.params.id));
  if (existing.length === 0) {
    await db.insert(coverageVerificationItems).values(
      STANDARD_COVERAGE_CHECKLIST.map((item, i) => ({
        id: `cvi-${uid()}-${i}`,
        claimId: req.params.id,
        checkItem: item,
      })),
    );
  }
  const items = await db.select().from(coverageVerificationItems).where(eq(coverageVerificationItems.claimId, req.params.id));
  res.json(items);
}));

app.get("/api/coverage-verification-items", asyncRoute(async (req, res) => {
  const rows = req.query.claimId
    ? await db.select().from(coverageVerificationItems).where(eq(coverageVerificationItems.claimId, String(req.query.claimId)))
    : await db.select().from(coverageVerificationItems);
  res.json(rows);
}));

app.patch("/api/coverage-verification-items/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["notes"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (req.body.status !== undefined) {
    values.status = req.body.status;
    values.checkedBy = actorId(req, req.body.checkedBy);
    values.checkedAt = new Date();
  }
  const [updated] = await db.update(coverageVerificationItems).set(values).where(eq(coverageVerificationItems.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Coverage verification item not found" });
  res.json(updated);
}));

// SOP-16: a partial settlement is "material" when what's actually
// being paid falls well short of what was reserved — the threshold
// that decides whether manager review is required, not just whether
// the claim was repudiated outright.
const MATERIAL_PARTIAL_THRESHOLD = 0.8;

app.patch("/api/claims/:id", asyncRoute(async (req, res) => {
  if (req.body.status && !CLAIM_STAGES.includes(req.body.status)) {
    return res.status(400).json({ error: `status must be one of: ${CLAIM_STAGES.join(", ")}` });
  }
  if (CLAIM_DECISION_STAGES.includes(req.body.status) && !(await hasPermission(req, "claim.decide"))) {
    return res.status(403).json({ error: "Missing permission: claim.decide" });
  }
  const [existing] = await db.select().from(claims).where(eq(claims.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Claim not found" });

  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of [
    "assignedOfficerId", "reserveAmountKes", "paidAmountKes", "status", "fraudFlag", "fraudScore", "description",
    "excessKes", "salvageKes", "priorPaymentsKes", "settlementReason", "priority",
  ] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }

  // SOP-16: "material partial/repudiated claims require manager
  // review" — computed from the effective reserve/paid amounts (new
  // value if provided, else the existing one), and only ever escalated
  // here, never cleared — clearing it is what POST .../manager-review
  // is for.
  const effectiveReserve = Number(values.reserveAmountKes ?? existing.reserveAmountKes ?? 0);
  const effectivePaid = Number(values.paidAmountKes ?? existing.paidAmountKes ?? 0);
  const isMaterialPartial = effectiveReserve > 0 && effectivePaid > 0 && effectivePaid < effectiveReserve * MATERIAL_PARTIAL_THRESHOLD;
  if (values.status === "Repudiated" || isMaterialPartial) values.requiresManagerReview = true;

  if (values.status === "Closed") {
    const effectiveRequiresReview = Boolean(values.requiresManagerReview ?? existing.requiresManagerReview);
    const effectiveSettlementReason = (values.settlementReason ?? existing.settlementReason) as string | null;
    if (effectiveRequiresReview && !existing.managerReviewedAt) {
      return res.status(400).json({ error: "This claim requires manager review (material partial settlement or repudiation) before it can be closed" });
    }
    if (!effectiveSettlementReason) {
      return res.status(400).json({ error: "A settlement reason is required before closing a claim" });
    }
    values.closedDate = new Date();
  }

  const [updated] = await db.update(claims).set(values).where(eq(claims.id, req.params.id)).returning();

  // Every status transition logs a timeline entry — the claim's public
  // progress trail, not just an internal audit record.
  if (req.body.status && req.body.status !== existing.status) {
    await db.insert(claimTimelineSteps).values({
      claimId: req.params.id,
      status: req.body.status,
      eventDate: new Date(),
      completed: true,
      detail: req.body.timelineDetail || `Status changed to ${req.body.status}.`,
      sortOrder: CLAIM_STAGES.indexOf(req.body.status),
    });
    // B-SAFE-inspired automated correspondence: if an active template
    // exists for this status (naming convention 'claim_<status>'), queue
    // a notification to the policyholder. Best-effort — a missing
    // template or unresolvable policyholder never blocks the status
    // update itself, same as the audit log's own failure handling.
    try {
      const templateCode = `claim_${req.body.status.toLowerCase().replace(/\s+/g, "_")}`;
      const [template] = await db.select().from(correspondenceTemplates)
        .where(and(eq(correspondenceTemplates.code, templateCode), eq(correspondenceTemplates.area, "claims"), eq(correspondenceTemplates.active, true)));
      if (template) {
        const [policy] = updated.policyId ? await db.select().from(policies).where(eq(policies.id, updated.policyId)) : [];
        if (policy?.clientId) {
          await db.insert(notifications).values({
            id: `notif-${uid()}`,
            partyId: policy.clientId,
            staffId: actorId(req),
            channel: template.channel,
            templateCode: template.code,
            status: "queued",
          });
        }
      }
    } catch (err) {
      console.error("automated claim correspondence failed:", err);
    }
  }
  res.json(updated);
}));

// Records manager sign-off on a material partial/repudiated claim —
// the only way requiresManagerReview's gate on Closed above can be
// satisfied; the PATCH handler itself never clears the flag.
app.post("/api/claims/:id/manager-review", requirePermission("claim.decide"), asyncRoute(async (req, res) => {
  const [updated] = await db.update(claims).set({
    managerReviewedBy: actorId(req, req.body.managerReviewedBy),
    managerReviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(claims.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Claim not found" });
  res.json(updated);
}));

// Controlled reopening (SOP-16) — only from Closed, always with a
// reason logged to the timeline, and reopenedCount tracks how often
// it's happened so a repeatedly-reopened claim is itself a signal.
app.post("/api/claims/:id/reopen", requirePermission("claim.decide"), asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(claims).where(eq(claims.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Claim not found" });
  if (existing.status !== "Closed") return res.status(400).json({ error: "Only a Closed claim can be reopened" });
  if (!req.body.reason) return res.status(400).json({ error: "A reason is required to reopen a claim" });

  const [updated] = await db.update(claims).set({
    status: "Assessment",
    closedDate: null,
    reopenedCount: existing.reopenedCount + 1,
    updatedAt: new Date(),
  }).where(eq(claims.id, req.params.id)).returning();

  await db.insert(claimTimelineSteps).values({
    claimId: req.params.id,
    status: "Assessment",
    eventDate: new Date(),
    completed: true,
    detail: `Reopened: ${req.body.reason}`,
    sortOrder: CLAIM_STAGES.indexOf("Assessment"),
  });
  res.json(updated);
}));

// ----------------------------------------------------
// Claim reserve/payment breakdown by cost code — what a claim's single
// reserveAmountKes/paidAmountKes total is actually FOR (indemnity,
// legal fees, loss adjuster fees, medical expenses, etc.), not just
// one lump figure. Supplements those totals rather than replacing
// them; the totals stay what the SOP-16 settlement gate checks
// against.
// ----------------------------------------------------
const RESERVE_PAYMENT_CODES = ["indemnity", "legal_fees", "loss_adjuster_fees", "medical_expenses", "investigation_fees", "salvage_recovery_cost", "other"];

app.get("/api/claim-reserve-lines", asyncRoute(async (req, res) => {
  const rows = req.query.claimId
    ? await db.select().from(claimReserveLines).where(eq(claimReserveLines.claimId, String(req.query.claimId)))
    : await db.select().from(claimReserveLines);
  res.json(rows);
}));

app.post("/api/claim-reserve-lines", requirePermission("claim.decide"), asyncRoute(async (req, res) => {
  if (!RESERVE_PAYMENT_CODES.includes(req.body.reserveCode)) {
    return res.status(400).json({ error: `reserveCode must be one of: ${RESERVE_PAYMENT_CODES.join(", ")}` });
  }
  const [newItem] = await db.insert(claimReserveLines).values({
    id: `crl-${uid()}`,
    claimId: req.body.claimId,
    reserveCode: req.body.reserveCode,
    amountKes: req.body.amountKes,
    notes: req.body.notes || null,
  }).returning();
  res.json(newItem);
}));

app.get("/api/claim-payment-lines", asyncRoute(async (req, res) => {
  const rows = req.query.claimId
    ? await db.select().from(claimPaymentLines).where(eq(claimPaymentLines.claimId, String(req.query.claimId)))
    : await db.select().from(claimPaymentLines);
  res.json(rows);
}));

app.post("/api/claim-payment-lines", requirePermission("claim.decide"), asyncRoute(async (req, res) => {
  if (!RESERVE_PAYMENT_CODES.includes(req.body.paymentCode)) {
    return res.status(400).json({ error: `paymentCode must be one of: ${RESERVE_PAYMENT_CODES.join(", ")}` });
  }
  const [newItem] = await db.insert(claimPaymentLines).values({
    id: `cpl-${uid()}`,
    claimId: req.body.claimId,
    paymentCode: req.body.paymentCode,
    amountKes: req.body.amountKes,
    paymentReference: req.body.paymentReference || null,
    notes: req.body.notes || null,
  }).returning();
  res.json(newItem);
}));

// ----------------------------------------------------
// Claim document checklist (SOP-15) — each document requested from a
// claimant/insurer/provider, tracked through its own status so a
// stalled request is visible before it becomes a cycle-time problem.
// ----------------------------------------------------
app.get("/api/claim-checklist-items", asyncRoute(async (req, res) => {
  const rows = req.query.claimId
    ? await db.select().from(claimChecklistItems).where(eq(claimChecklistItems.claimId, String(req.query.claimId)))
    : await db.select().from(claimChecklistItems);
  res.json(rows);
}));

app.post("/api/claim-checklist-items", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(claimChecklistItems).values({
    id: `cci-${uid()}`,
    claimId: req.body.claimId,
    documentType: req.body.documentType,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/claim-checklist-items/:id", asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["notes"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (req.body.status !== undefined) {
    values.status = req.body.status;
    if (req.body.status === "received") values.receivedAt = new Date();
    if (req.body.status === "reviewed") { values.reviewedAt = new Date(); values.reviewedBy = actorId(req, req.body.reviewedBy); }
  }
  const [updated] = await db.update(claimChecklistItems).set(values).where(eq(claimChecklistItems.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Checklist item not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Claim diary (SOP-15) — chronological notes and commitments,
// distinct from claim_timeline_steps' status-change history.
// ----------------------------------------------------
app.get("/api/claim-diary", asyncRoute(async (req, res) => {
  const rows = req.query.claimId
    ? await db.select().from(claimDiaryEntries).where(eq(claimDiaryEntries.claimId, String(req.query.claimId))).orderBy(desc(claimDiaryEntries.createdAt))
    : await db.select().from(claimDiaryEntries).orderBy(desc(claimDiaryEntries.createdAt));
  res.json(rows);
}));

app.post("/api/claim-diary", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(claimDiaryEntries).values({
    claimId: req.body.claimId,
    staffId: actorId(req, req.body.staffId),
    note: req.body.note,
    commitmentDueAt: req.body.commitmentDueAt ? new Date(req.body.commitmentDueAt) : null,
  }).returning();
  res.json(newItem);
}));

// ----------------------------------------------------
// Complaints (SOP §8/§9) — Received → Acknowledged → Investigation →
// Decision → Remedy → Verification → Closed/Escalated.
// ----------------------------------------------------
const COMPLAINT_STAGES = ["Received", "Acknowledged", "Investigation", "Decision", "Remedy", "Verification", "Closed", "Escalated"];

app.get("/api/complaints", asyncRoute(async (req, res) => {
  const rows = await db.select().from(complaints).orderBy(desc(complaints.receivedDate));
  res.json(rows);
}));

app.post("/api/complaints", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(complaints).values({
    id: `UTM-COMP-${Math.floor(1000 + Math.random() * 9000)}`,
    partyId: req.body.partyId,
    policyId: req.body.policyId,
    claimId: req.body.claimId,
    category: req.body.category,
    severity: req.body.severity,
    subject: req.body.subject,
    description: req.body.description,
    channel: req.body.channel,
  }).returning();

  await db.insert(cases).values({
    id: `case-${uid()}`,
    workflowType: "complaint",
    entityType: "complaint",
    entityId: newItem.id,
    currentState: newItem.status,
  });

  await addAuditLog({ action: "COMPLAINT_REGISTERED", entityType: "complaint", entityId: newItem.id, actorStaffId: actorId(req, req.body.createdByStaffId), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/complaints/:id", asyncRoute(async (req, res) => {
  if (req.body.status && !COMPLAINT_STAGES.includes(req.body.status)) {
    return res.status(400).json({ error: `status must be one of: ${COMPLAINT_STAGES.join(", ")}` });
  }
  const values: Record<string, unknown> = {};
  for (const field of ["assignedStaffId", "status", "remedy", "correctiveAction", "resolvedDate"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.resolvedDate) values.resolvedDate = new Date(values.resolvedDate as string);
  if (values.status === "Closed" && !values.resolvedDate) values.resolvedDate = new Date();

  const [updated] = await db.update(complaints).set(values).where(eq(complaints.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Complaint not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Premium confirmations & financial transactions (SOP §1.1/§8) — the
// evidence gate that unlocks a policy's Active status, and the ledger
// commission projections are computed from. Premiums move through
// approved insurer channels, never broker custody.
// ----------------------------------------------------
app.get("/api/premium-confirmations", asyncRoute(async (req, res) => {
  const rows = req.query.policyId
    ? await db.select().from(premiumConfirmations).where(eq(premiumConfirmations.policyId, String(req.query.policyId))).orderBy(desc(premiumConfirmations.confirmedAt))
    : await db.select().from(premiumConfirmations).orderBy(desc(premiumConfirmations.confirmedAt));
  res.json(rows);
}));

// Shared by both POST /api/premium-confirmations (single policy) and
// POST /api/payments/:id/allocations (one payment split across several
// policies) — same evidence-gate, ledger and commission-projection
// effects either way; only how the money arrived differs.
async function confirmPremiumForPolicy(policyId: string, confirmedAmountKes: number, opts: {
  insurerChannel?: string; paymentReference?: string; method?: string; paymentId?: string; verifiedBy: string | null; auditActorId: string | null;
}) {
  const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));
  if (!policy) return { error: "Policy not found" as const };

  const [confirmation] = await db.insert(premiumConfirmations).values({
    id: `pcf-${uid()}`,
    policyId: policy.id,
    insurerChannel: opts.insurerChannel,
    confirmedAmountKes,
    paymentReference: opts.paymentReference,
    paymentId: opts.paymentId,
    verifiedBy: opts.verifiedBy,
  }).returning();

  // Premium evidence gate (SOP §1.1/§15.1): a confirmed premium moves
  // the policy from Pending/Received/Under Check toward Active — cover
  // is never active on instruction alone.
  if (["Pending", "Received", "Under Check"].includes(policy.status)) {
    await db.update(policies).set({ status: "Active", updatedAt: new Date() }).where(eq(policies.id, policy.id));
  }

  await db.insert(financialTransactions).values({
    id: `txn-${uid()}-premium`,
    policyId: policy.id,
    partyId: policy.clientId,
    transactionType: "premium",
    direction: "credit",
    amountKes: confirmedAmountKes,
    method: opts.method || "mpesa",
    providerReference: opts.paymentReference,
    status: "matched",
  });

  // Commission projection — computed from the insurer's active rate
  // setting for this policy's category. This is an estimate of what
  // the brokerage should earn, not yet an insurer-confirmed commission
  // statement line (that's a later reconciliation step).
  let projectedCommissionKes = 0;
  if (policy.insurerId) {
    const [rate] = await db.select().from(insurerRateVersions)
      .where(and(eq(insurerRateVersions.insurerId, policy.insurerId), eq(insurerRateVersions.category, policy.category)))
      .orderBy(desc(insurerRateVersions.effectiveFrom))
      .limit(1);
    if (rate?.commissionRatePct) {
      projectedCommissionKes = Math.round(confirmedAmountKes * (rate.commissionRatePct / 100) * 100) / 100;
      await db.insert(financialTransactions).values({
        id: `txn-${uid()}-commission`,
        policyId: policy.id,
        transactionType: "commission",
        direction: "credit",
        amountKes: projectedCommissionKes,
        status: "pending",
      });
    }
  }

  // Producer/sub-broker commission split — if this policy traces back
  // to a producer (see POST /api/policies), they're owed a negotiated
  // share of what was just earned. Recorded as its own payable, not by
  // editing the commission financialTransactions row above, which
  // insurer-side reconciliation still needs to see in full.
  let producerSplitKes = 0;
  if (policy.producerId && projectedCommissionKes > 0) {
    const [producer] = await db.select().from(producers).where(eq(producers.id, policy.producerId));
    if (producer && Number(producer.commissionSplitPct) > 0) {
      producerSplitKes = Math.round(projectedCommissionKes * (Number(producer.commissionSplitPct) / 100) * 100) / 100;
      await db.insert(producerCommissionSplits).values({
        id: `pcs-${uid()}`,
        producerId: producer.id,
        policyId: policy.id,
        premiumConfirmationId: confirmation.id,
        commissionAmountKes: projectedCommissionKes,
        splitPct: producer.commissionSplitPct,
        splitAmountKes: producerSplitKes,
      });
    }
  }

  // GL posting: the brokerage retains its commission at source and
  // remits the balance to the insurer, so the full amount received
  // splits between what's still owed to the insurer and commission
  // income earned. Whatever's owed to a producer is carved out of our
  // own Commission Income and credited to a payable instead, so
  // recognized income already reflects our real net share.
  const brokerageNetCommissionKes = Math.round((projectedCommissionKes - producerSplitKes) * 100) / 100;
  await postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    description: `Premium confirmed for ${policy.id}`,
    sourceType: "premium_confirmation",
    sourceId: confirmation.id,
    lines: [
      { accountCode: "1000", debitKes: confirmedAmountKes, policyId: policy.id, partyId: policy.clientId ?? undefined },
      { accountCode: "2000", creditKes: Math.round((confirmedAmountKes - projectedCommissionKes) * 100) / 100, policyId: policy.id },
      ...(brokerageNetCommissionKes > 0 ? [{ accountCode: "4000", creditKes: brokerageNetCommissionKes, policyId: policy.id }] : []),
      ...(producerSplitKes > 0 ? [{ accountCode: "2010", creditKes: producerSplitKes, policyId: policy.id }] : []),
    ],
  });

  await addAuditLog({ action: "PREMIUM_CONFIRMED", entityType: "policy", entityId: policy.id, actorStaffId: opts.auditActorId, afterState: confirmation });
  return { confirmation };
}

app.post("/api/premium-confirmations", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const result = await confirmPremiumForPolicy(req.body.policyId, req.body.confirmedAmountKes, {
    insurerChannel: req.body.insurerChannel,
    paymentReference: req.body.paymentReference,
    method: req.body.method,
    verifiedBy: actorId(req, req.body.verifiedBy),
    auditActorId: actorId(req, req.body.verifiedBy),
  });
  if ("error" in result) return res.status(404).json({ error: result.error });
  res.json(result.confirmation);
}));

// ----------------------------------------------------
// Payments (multi-policy allocation) — a single cheque/transfer/
// M-Pesa transaction from a client that may fund more than one
// policy's premium at once. Recording the payment itself doesn't
// confirm any premium; each POST .../allocations call applies part of
// it to one policy via the same logic as POST /premium-confirmations
// above, so "client paid one cheque, split across 3 policies" is just
// 3 allocations against 1 payment.
// ----------------------------------------------------
app.get("/api/payments", asyncRoute(async (req, res) => {
  const rows = req.query.partyId
    ? await db.select().from(payments).where(eq(payments.partyId, String(req.query.partyId))).orderBy(desc(payments.receivedAt))
    : await db.select().from(payments).orderBy(desc(payments.receivedAt));
  const allConfirmations = await db.select().from(premiumConfirmations);
  const withBalances = rows.map((p) => {
    const allocatedKes = allConfirmations.filter((c) => c.paymentId === p.id).reduce((sum, c) => sum + Number(c.confirmedAmountKes), 0);
    return { ...p, allocatedKes, unallocatedKes: Math.round((Number(p.totalAmountKes) - allocatedKes) * 100) / 100 };
  });
  res.json(withBalances);
}));

app.get("/api/payments/:id", asyncRoute(async (req, res) => {
  const [payment] = await db.select().from(payments).where(eq(payments.id, req.params.id));
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const allocations = await db.select().from(premiumConfirmations).where(eq(premiumConfirmations.paymentId, payment.id));
  const allocatedKes = allocations.reduce((sum, c) => sum + Number(c.confirmedAmountKes), 0);
  res.json({ ...payment, allocations, allocatedKes, unallocatedKes: Math.round((Number(payment.totalAmountKes) - allocatedKes) * 100) / 100 });
}));

app.post("/api/payments", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(payments).values({
    id: `pay-${uid()}`,
    partyId: req.body.partyId,
    totalAmountKes: req.body.totalAmountKes,
    method: req.body.method,
    paymentReference: req.body.paymentReference,
    recordedBy: actorId(req, req.body.recordedBy),
  }).returning();
  await addAuditLog({ action: "PAYMENT_RECORDED", entityType: "payment", entityId: newItem.id, actorStaffId: actorId(req, req.body.recordedBy), afterState: newItem });
  res.json(newItem);
}));

app.post("/api/payments/:id/allocations", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const [payment] = await db.select().from(payments).where(eq(payments.id, req.params.id));
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const existingAllocations = await db.select().from(premiumConfirmations).where(eq(premiumConfirmations.paymentId, payment.id));
  const alreadyAllocated = existingAllocations.reduce((sum, c) => sum + Number(c.confirmedAmountKes), 0);
  const unallocatedKes = Number(payment.totalAmountKes) - alreadyAllocated;
  const amountKes = Number(req.body.confirmedAmountKes);
  if (!(amountKes > 0)) return res.status(400).json({ error: "confirmedAmountKes must be greater than zero" });
  if (amountKes > unallocatedKes + 0.01) {
    return res.status(400).json({ error: `Allocation of KES ${amountKes} exceeds this payment's unallocated balance of KES ${unallocatedKes}` });
  }

  const result = await confirmPremiumForPolicy(req.body.policyId, amountKes, {
    paymentReference: payment.paymentReference,
    method: payment.method,
    paymentId: payment.id,
    verifiedBy: actorId(req, req.body.verifiedBy),
    auditActorId: actorId(req, req.body.verifiedBy),
  });
  if ("error" in result) return res.status(404).json({ error: result.error });
  res.json(result.confirmation);
}));

app.get("/api/financial-transactions", asyncRoute(async (req, res) => {
  const rows = await db.select().from(financialTransactions).orderBy(desc(financialTransactions.occurredAt));
  res.json(rows);
}));

// A commission clawback/reversal — the insurer takes back previously-
// paid commission (e.g. the underlying policy was cancelled or
// short-rated). Recorded as its own debit 'commission' transaction
// rather than editing the original credit, so the history of what was
// earned vs. later reversed stays visible.
app.post("/api/commission-clawbacks", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const [policy] = await db.select().from(policies).where(eq(policies.id, req.body.policyId));
  if (!policy) return res.status(404).json({ error: "Policy not found" });
  const [newItem] = await db.insert(financialTransactions).values({
    id: `txn-${uid()}-clawback`,
    policyId: policy.id,
    partyId: policy.clientId,
    transactionType: "commission",
    direction: "debit",
    amountKes: req.body.amountKes,
    status: "posted",
    notes: req.body.reason,
  }).returning();
  await addAuditLog({ action: "COMMISSION_CLAWBACK", entityType: "policy", entityId: policy.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: newItem });
  res.json(newItem);
}));

// ----------------------------------------------------
// Premium ageing (SOP §3.6) — how overdue each policy's outstanding
// premium is, bucketed off premium_due_date (falling back to
// start_date). Crossing into the two more severe buckets auto-creates
// a collection task against the policy's own case, idempotently — a
// re-run of this endpoint never creates a second open task for the
// same policy.
// ----------------------------------------------------
const AGEING_BUCKETS = [
  { key: "current", label: "Not yet due", max: 0 },
  { key: "early", label: "1-30 days", max: 30 },
  { key: "follow_up", label: "31-60 days", max: 60 },
  { key: "escalation", label: "61-90 days", max: 90 },
  { key: "critical", label: "90+ days", max: Infinity },
] as const;

app.get("/api/premium-ageing", asyncRoute(async (req, res) => {
  const allPolicies = await db.select().from(policies);
  const allConfirmations = await db.select().from(premiumConfirmations);
  const today = new Date();

  const rows: Array<{ policyId: string; clientId: string | null; outstandingKes: number; dueDate: string; daysPastDue: number; bucket: string; bucketLabel: string }> = [];

  for (const policy of allPolicies) {
    if (["Cancelled", "Lapsed"].includes(policy.status)) continue;
    const confirmed = allConfirmations.filter((c) => c.policyId === policy.id).reduce((sum, c) => sum + Number(c.confirmedAmountKes), 0);
    const outstandingKes = Math.round((Number(policy.premiumAmount) - confirmed) * 100) / 100;
    if (outstandingKes <= 0) continue;

    const dueDate = policy.premiumDueDate || policy.startDate;
    const daysPastDue = Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86_400_000);
    const bucket = AGEING_BUCKETS.find((b) => daysPastDue <= b.max) || AGEING_BUCKETS[AGEING_BUCKETS.length - 1];
    rows.push({ policyId: policy.id, clientId: policy.clientId, outstandingKes, dueDate, daysPastDue, bucket: bucket.key, bucketLabel: bucket.label });

    if (["follow_up", "escalation", "critical"].includes(bucket.key)) {
      const [policyCase] = await db.select().from(cases).where(and(eq(cases.entityType, "policy"), eq(cases.entityId, policy.id)));
      if (policyCase) {
        const openTasks = await db.select().from(tasks).where(and(eq(tasks.caseId, policyCase.id), eq(tasks.taskType, "collect_outstanding_premium"), inArray(tasks.status, ["open", "in_progress"])));
        if (openTasks.length === 0) {
          const priority = bucket.key === "critical" ? "urgent" : bucket.key === "escalation" ? "high" : "normal";
          await db.insert(tasks).values({
            id: `task-${uid()}-${policy.id}`,
            caseId: policyCase.id,
            taskType: "collect_outstanding_premium",
            queue: "finance",
            priority,
            dueAt: new Date(),
          });
        }
      }
    }
  }

  const summary = AGEING_BUCKETS.reduce((acc, b) => ({ ...acc, [b.key]: rows.filter((r) => r.bucket === b.key).length }), {} as Record<string, number>);
  res.json({ rows, summary });
}));

// ----------------------------------------------------
// Internal operating finance — the brokerage's own petty cash and
// office expenses, distinct from client premium/insurer commission
// money above, which the firm never treats as its own.
// ----------------------------------------------------
app.get("/api/petty-cash-floats", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const rows = await db.select().from(pettyCashFloats).orderBy(desc(pettyCashFloats.openedAt));
  res.json(rows);
}));

app.post("/api/petty-cash-floats", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const openingBalanceKes = Number(req.body.openingBalanceKes) || 0;
  const [newItem] = await db.insert(pettyCashFloats).values({
    id: `float-${uid()}`,
    custodianStaffId: req.body.custodianStaffId,
    openingBalanceKes,
    currentBalanceKes: openingBalanceKes,
  }).returning();

  if (openingBalanceKes > 0) {
    await postJournalEntry({
      entryDate: new Date().toISOString().slice(0, 10),
      description: `Open petty cash float ${newItem.id}`,
      sourceType: "petty_cash_transaction",
      sourceId: newItem.id,
      lines: [{ accountCode: "1010", debitKes: openingBalanceKes }, { accountCode: "1000", creditKes: openingBalanceKes }],
    });
  }

  res.json(newItem);
}));

app.patch("/api/petty-cash-floats/:id", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["status"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.status === "closed") values.closedAt = new Date();
  const [updated] = await db.update(pettyCashFloats).set(values).where(eq(pettyCashFloats.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Float not found" });
  res.json(updated);
}));

app.get("/api/petty-cash-transactions", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const rows = req.query.floatId
    ? await db.select().from(pettyCashTransactions).where(eq(pettyCashTransactions.floatId, String(req.query.floatId))).orderBy(desc(pettyCashTransactions.occurredAt))
    : await db.select().from(pettyCashTransactions).orderBy(desc(pettyCashTransactions.occurredAt));
  res.json(rows);
}));

app.post("/api/petty-cash-transactions", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const [float] = await db.select().from(pettyCashFloats).where(eq(pettyCashFloats.id, req.body.floatId));
  if (!float) return res.status(404).json({ error: "Float not found" });
  if (float.status !== "active") return res.status(400).json({ error: "This float is closed" });

  const amountKes = Number(req.body.amountKes);
  if (!(amountKes > 0)) return res.status(400).json({ error: "amountKes must be greater than zero" });

  if (req.body.transactionType === "disbursement" && amountKes > Number(float.currentBalanceKes)) {
    return res.status(400).json({ error: `Disbursement of KES ${amountKes} exceeds the float's current balance of KES ${float.currentBalanceKes}` });
  }

  const [newItem] = await db.insert(pettyCashTransactions).values({
    id: `pct-${uid()}`,
    floatId: float.id,
    transactionType: req.body.transactionType,
    amountKes,
    purpose: req.body.purpose,
    receiptDocumentId: req.body.receiptDocumentId,
    recordedBy: actorId(req, req.body.recordedBy),
  }).returning();

  const delta = req.body.transactionType === "replenishment" ? amountKes : -amountKes;
  await db.update(pettyCashFloats).set({ currentBalanceKes: Number(float.currentBalanceKes) + delta }).where(eq(pettyCashFloats.id, float.id));

  await postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    description: `${req.body.transactionType === "replenishment" ? "Replenish" : "Disburse"} petty cash: ${req.body.purpose}`,
    sourceType: "petty_cash_transaction",
    sourceId: newItem.id,
    lines: req.body.transactionType === "replenishment"
      ? [{ accountCode: "1010", debitKes: amountKes }, { accountCode: "1000", creditKes: amountKes }]
      : [{ accountCode: "5009", debitKes: amountKes }, { accountCode: "1010", creditKes: amountKes }],
  });

  res.json(newItem);
}));

app.get("/api/office-expenses", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const rows = await db.select().from(officeExpenses).orderBy(desc(officeExpenses.incurredAt));
  res.json(rows);
}));

app.post("/api/office-expenses", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(officeExpenses).values({
    id: `exp-${uid()}`,
    category: req.body.category,
    description: req.body.description,
    amountKes: req.body.amountKes,
    vendor: req.body.vendor,
    paymentMethod: req.body.paymentMethod,
    incurredAt: req.body.incurredAt || new Date().toISOString().slice(0, 10),
    receiptDocumentId: req.body.receiptDocumentId,
    recordedBy: actorId(req, req.body.recordedBy),
  }).returning();
  res.json(newItem);
}));

// Maps each office_expenses.category to its GL expense account,
// seeded 1:1 in migrate-017-general-ledger.ts.
const OFFICE_EXPENSE_GL_ACCOUNT: Record<string, string> = {
  rent: "5001", utilities: "5002", salaries: "5003", supplies: "5004",
  marketing: "5005", professional_fees: "5006", insurance: "5007", other: "5008",
};

app.patch("/api/office-expenses/:id", requirePermission("finance.record"), asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(officeExpenses).where(eq(officeExpenses.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Expense not found" });

  const values: Record<string, unknown> = {};
  for (const field of ["status", "approvedBy"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.status === "paid") values.paidAt = new Date();
  const [updated] = await db.update(officeExpenses).set(values).where(eq(officeExpenses.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Expense not found" });

  if (values.status === "paid" && existing.status !== "paid") {
    await postJournalEntry({
      entryDate: new Date().toISOString().slice(0, 10),
      description: `${updated.description} (${updated.vendor || "no vendor"})`,
      sourceType: "office_expense",
      sourceId: updated.id,
      lines: [
        { accountCode: OFFICE_EXPENSE_GL_ACCOUNT[updated.category] || "5008", debitKes: Number(updated.amountKes) },
        { accountCode: "1000", creditKes: Number(updated.amountKes) },
      ],
    });
  }

  res.json(updated);
}));

// ----------------------------------------------------
// General ledger — chart of accounts, accounting periods, and
// double-entry journal entries. Premium confirmations, office expense
// payments and petty cash transactions above auto-post through
// postJournalEntry(); these routes are for the chart of accounts,
// period administration, manual entries a human deliberately books
// (e.g. a bank charge, a year-end adjustment), and the trial balance/
// income statement/balance sheet reports computed from posted lines.
// Posted entries are immutable — fixing a mistake means reversing it
// (POST .../reverse), the same "never edit history" pattern used for
// commission clawbacks and claim reopening elsewhere in this file.
// ----------------------------------------------------
app.get("/api/gl-accounts", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const rows = await db.select().from(glAccounts).orderBy(glAccounts.code);
  res.json(rows);
}));

app.post("/api/gl-accounts", requirePermission("gl.manage"), asyncRoute(async (req, res) => {
  if (!["asset", "liability", "equity", "income", "expense"].includes(req.body.accountType)) {
    return res.status(400).json({ error: "accountType must be one of: asset, liability, equity, income, expense" });
  }
  if (!["debit", "credit"].includes(req.body.normalBalance)) {
    return res.status(400).json({ error: "normalBalance must be 'debit' or 'credit'" });
  }
  if (req.body.parentAccountCode) {
    const [parent] = await db.select().from(glAccounts).where(eq(glAccounts.code, req.body.parentAccountCode));
    if (!parent) return res.status(400).json({ error: `Parent account ${req.body.parentAccountCode} does not exist` });
  }
  const [newItem] = await db.insert(glAccounts).values({
    code: req.body.code,
    name: req.body.name,
    accountType: req.body.accountType,
    normalBalance: req.body.normalBalance,
    parentAccountCode: req.body.parentAccountCode || null,
  }).returning();
  await addAuditLog({ action: "GL_ACCOUNT_CREATED", entityType: "gl_account", entityId: newItem.code, actorStaffId: actorId(req, req.body.actorStaffId), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/gl-accounts/:code", requirePermission("gl.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["name", "active"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(glAccounts).set(values).where(eq(glAccounts.code, req.params.code)).returning();
  if (!updated) return res.status(404).json({ error: "Account not found" });
  res.json(updated);
}));

app.get("/api/accounting-periods", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const rows = await db.select().from(accountingPeriods).orderBy(desc(accountingPeriods.id));
  res.json(rows);
}));

app.post("/api/accounting-periods", requirePermission("gl.manage"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(accountingPeriods).values({
    id: req.body.id,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/accounting-periods/:id", requirePermission("gl.period_close"), asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Period not found" });
  if (req.body.status === "closed") {
    if (existing.status === "closed") return res.status(400).json({ error: "Period is already closed" });
    const [updated] = await db.update(accountingPeriods).set({
      status: "closed", closedAt: new Date(), closedBy: actorId(req, req.body.actorStaffId),
    }).where(eq(accountingPeriods.id, req.params.id)).returning();
    await addAuditLog({ action: "PERIOD_CLOSED", entityType: "accounting_period", entityId: updated.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: updated });
    return res.json(updated);
  }
  res.status(400).json({ error: "Only status: 'closed' is supported here" });
}));

app.get("/api/journal-entries", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const entries = req.query.periodId
    ? await db.select().from(journalEntries).where(eq(journalEntries.periodId, String(req.query.periodId))).orderBy(desc(journalEntries.entryDate), desc(journalEntries.id))
    : await db.select().from(journalEntries).orderBy(desc(journalEntries.entryDate), desc(journalEntries.id));
  // Only the lines belonging to the entries being returned, not the whole table.
  const lines = entries.length > 0 ? await db.select().from(journalLines).where(inArray(journalLines.entryId, entries.map((e) => e.id))) : [];
  res.json(entries.map((e) => ({ ...e, lines: lines.filter((l) => l.entryId === e.id) })));
}));

app.get("/api/journal-entries/:id", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, req.params.id));
  if (!entry) return res.status(404).json({ error: "Journal entry not found" });
  const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, entry.id));
  res.json({ ...entry, lines });
}));

app.post("/api/journal-entries", requirePermission("gl.manage"), asyncRoute(async (req, res) => {
  const lines: { accountCode: string; debitKes?: number; creditKes?: number; description?: string; policyId?: string; partyId?: string }[] = req.body.lines || [];
  if (lines.length < 2) return res.status(400).json({ error: "A journal entry needs at least two lines" });

  for (const line of lines) {
    const debit = Number(line.debitKes) || 0;
    const credit = Number(line.creditKes) || 0;
    if ((debit > 0) === (credit > 0)) {
      return res.status(400).json({ error: `Line for ${line.accountCode} must have exactly one of debitKes/creditKes greater than zero` });
    }
  }

  const accountCodes = [...new Set(lines.map((l) => l.accountCode))];
  const accounts = await db.select().from(glAccounts).where(inArray(glAccounts.code, accountCodes));
  const missing = accountCodes.filter((code) => !accounts.some((a) => a.code === code));
  if (missing.length > 0) return res.status(400).json({ error: `Unknown account code(s): ${missing.join(", ")}` });

  const totalDebit = Math.round(lines.reduce((sum, l) => sum + (Number(l.debitKes) || 0), 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((sum, l) => sum + (Number(l.creditKes) || 0), 0) * 100) / 100;
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(400).json({ error: `Entry does not balance: total debit ${totalDebit} vs total credit ${totalCredit}` });
  }

  const [period] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, req.body.periodId));
  if (!period) return res.status(400).json({ error: "Accounting period not found" });
  if (period.status !== "open") return res.status(400).json({ error: `Period ${period.id} is closed` });

  const [entry] = await db.insert(journalEntries).values({
    id: `je-${uid()}`,
    periodId: period.id,
    entryDate: req.body.entryDate,
    reference: req.body.reference,
    description: req.body.description,
    sourceType: "manual",
    postedBy: actorId(req, req.body.postedBy),
  }).returning();

  await db.insert(journalLines).values(lines.map((l) => ({
    entryId: entry.id,
    accountCode: l.accountCode,
    debitKes: Number(l.debitKes) || 0,
    creditKes: Number(l.creditKes) || 0,
    description: l.description,
    policyId: l.policyId,
    partyId: l.partyId,
  })));

  await addAuditLog({ action: "JOURNAL_ENTRY_POSTED", entityType: "journal_entry", entityId: entry.id, actorStaffId: actorId(req, req.body.postedBy), afterState: entry });
  res.json({ ...entry, lines });
}));

app.post("/api/journal-entries/:id/reverse", requirePermission("gl.manage"), asyncRoute(async (req, res) => {
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, req.params.id));
  if (!entry) return res.status(404).json({ error: "Journal entry not found" });
  if (entry.status === "reversed") return res.status(400).json({ error: "This entry has already been reversed" });

  const originalLines = await db.select().from(journalLines).where(eq(journalLines.entryId, entry.id));
  const today = new Date().toISOString().slice(0, 10);

  let period;
  if (req.body.periodId) {
    [period] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, req.body.periodId));
    if (!period) return res.status(400).json({ error: "Accounting period not found" });
    if (period.status !== "open") return res.status(400).json({ error: `Period ${period.id} is closed` });
  } else {
    [period] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, today.slice(0, 7)));
    if (!period || period.status !== "open") {
      return res.status(400).json({ error: "No open period covers today — specify periodId to reverse into" });
    }
  }

  const [reversal] = await db.insert(journalEntries).values({
    id: `je-${uid()}-rev`,
    periodId: period.id,
    entryDate: today,
    description: `Reversal of ${entry.id}: ${entry.description || ""}`,
    sourceType: "reversal",
    reversalOfEntryId: entry.id,
    postedBy: actorId(req, req.body.actorStaffId),
  }).returning();

  await db.insert(journalLines).values(originalLines.map((l) => ({
    entryId: reversal.id,
    accountCode: l.accountCode,
    debitKes: Number(l.creditKes),
    creditKes: Number(l.debitKes),
    description: l.description,
    policyId: l.policyId,
    partyId: l.partyId,
  })));

  await db.update(journalEntries).set({ status: "reversed" }).where(eq(journalEntries.id, entry.id));
  await addAuditLog({ action: "JOURNAL_ENTRY_REVERSED", entityType: "journal_entry", entityId: entry.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: reversal });
  res.json(reversal);
}));

// Trial balance: every account's total debit/credit activity within a
// period, and its resulting balance (signed per the account's own
// normal side) — the standard check that total debits still equal
// total credits across the whole ledger for that period.
app.get("/api/gl/trial-balance", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  if (!req.query.periodId) return res.status(400).json({ error: "periodId is required" });
  const entries = await db.select().from(journalEntries).where(eq(journalEntries.periodId, String(req.query.periodId)));
  const entryIds = entries.map((e) => e.id);
  const lines = entryIds.length > 0 ? await db.select().from(journalLines).where(inArray(journalLines.entryId, entryIds)) : [];
  const accounts = await db.select().from(glAccounts).orderBy(glAccounts.code);

  const rows = accounts.map((a) => {
    const accountLines = lines.filter((l) => l.accountCode === a.code);
    const totalDebitKes = Math.round(accountLines.reduce((s, l) => s + Number(l.debitKes), 0) * 100) / 100;
    const totalCreditKes = Math.round(accountLines.reduce((s, l) => s + Number(l.creditKes), 0) * 100) / 100;
    const balanceKes = a.normalBalance === "debit" ? totalDebitKes - totalCreditKes : totalCreditKes - totalDebitKes;
    return { accountCode: a.code, name: a.name, accountType: a.accountType, normalBalance: a.normalBalance, totalDebitKes, totalCreditKes, balanceKes };
  }).filter((r) => r.totalDebitKes !== 0 || r.totalCreditKes !== 0);

  const totalDebitKes = Math.round(rows.reduce((s, r) => s + r.totalDebitKes, 0) * 100) / 100;
  const totalCreditKes = Math.round(rows.reduce((s, r) => s + r.totalCreditKes, 0) * 100) / 100;
  res.json({ periodId: req.query.periodId, rows, totalDebitKes, totalCreditKes, balanced: Math.abs(totalDebitKes - totalCreditKes) < 0.01 });
}));

// Income statement: income-account and expense-account activity
// within a single period (not cumulative — see balance sheet below
// for the cumulative asset/liability/equity view).
app.get("/api/gl/income-statement", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  if (!req.query.periodId) return res.status(400).json({ error: "periodId is required" });
  const entries = await db.select().from(journalEntries).where(eq(journalEntries.periodId, String(req.query.periodId)));
  const entryIds = entries.map((e) => e.id);
  const lines = entryIds.length > 0 ? await db.select().from(journalLines).where(inArray(journalLines.entryId, entryIds)) : [];
  const accounts = await db.select().from(glAccounts).where(inArray(glAccounts.accountType, ["income", "expense"]));

  const rows = accounts.map((a) => {
    const accountLines = lines.filter((l) => l.accountCode === a.code);
    const totalDebitKes = accountLines.reduce((s, l) => s + Number(l.debitKes), 0);
    const totalCreditKes = accountLines.reduce((s, l) => s + Number(l.creditKes), 0);
    const amountKes = Math.round((a.accountType === "income" ? totalCreditKes - totalDebitKes : totalDebitKes - totalCreditKes) * 100) / 100;
    return { accountCode: a.code, name: a.name, accountType: a.accountType, amountKes };
  }).filter((r) => r.amountKes !== 0);

  const totalIncomeKes = Math.round(rows.filter((r) => r.accountType === "income").reduce((s, r) => s + r.amountKes, 0) * 100) / 100;
  const totalExpenseKes = Math.round(rows.filter((r) => r.accountType === "expense").reduce((s, r) => s + r.amountKes, 0) * 100) / 100;
  res.json({ periodId: req.query.periodId, rows, totalIncomeKes, totalExpenseKes, netIncomeKes: Math.round((totalIncomeKes - totalExpenseKes) * 100) / 100 });
}));

// Balance sheet: cumulative asset/liability/equity balances as of a
// date, across every posted period to date — a point-in-time
// snapshot, not a single period's flow. Scope boundary: period close
// does not sweep income/expense into retained earnings, so "current
// earnings to date" is computed here (all income minus all expense up
// to asOfDate) and shown as its own equity-side line rather than
// folded into Retained Earnings, so the sheet still balances.
app.get("/api/gl/balance-sheet", requirePermission("finance.view"), asyncRoute(async (req, res) => {
  const asOfDate = String(req.query.asOfDate || new Date().toISOString().slice(0, 10));
  const entries = await db.select().from(journalEntries).where(lte(journalEntries.entryDate, asOfDate));
  const entryIds = entries.map((e) => e.id);
  const lines = entryIds.length > 0 ? await db.select().from(journalLines).where(inArray(journalLines.entryId, entryIds)) : [];
  const accounts = await db.select().from(glAccounts);

  function balanceFor(a: typeof accounts[number]) {
    const accountLines = lines.filter((l) => l.accountCode === a.code);
    const totalDebitKes = accountLines.reduce((s, l) => s + Number(l.debitKes), 0);
    const totalCreditKes = accountLines.reduce((s, l) => s + Number(l.creditKes), 0);
    return a.normalBalance === "debit" ? totalDebitKes - totalCreditKes : totalCreditKes - totalDebitKes;
  }

  const rows = accounts
    .filter((a) => ["asset", "liability", "equity"].includes(a.accountType))
    .map((a) => ({ accountCode: a.code, name: a.name, accountType: a.accountType, balanceKes: Math.round(balanceFor(a) * 100) / 100 }))
    .filter((r) => r.balanceKes !== 0);

  const currentEarningsKes = Math.round(accounts
    .filter((a) => a.accountType === "income" || a.accountType === "expense")
    .reduce((s, a) => s + (a.accountType === "income" ? balanceFor(a) : -balanceFor(a)), 0) * 100) / 100;

  const totalAssetsKes = Math.round(rows.filter((r) => r.accountType === "asset").reduce((s, r) => s + r.balanceKes, 0) * 100) / 100;
  const totalLiabilitiesKes = Math.round(rows.filter((r) => r.accountType === "liability").reduce((s, r) => s + r.balanceKes, 0) * 100) / 100;
  const totalEquityKes = Math.round(rows.filter((r) => r.accountType === "equity").reduce((s, r) => s + r.balanceKes, 0) * 100) / 100;
  const totalLiabilitiesAndEquityKes = Math.round((totalLiabilitiesKes + totalEquityKes + currentEarningsKes) * 100) / 100;

  res.json({
    asOfDate, rows, currentEarningsKes, totalAssetsKes, totalLiabilitiesKes, totalEquityKes, totalLiabilitiesAndEquityKes,
    balanced: Math.abs(totalAssetsKes - totalLiabilitiesAndEquityKes) < 0.01,
  });
}));

// ----------------------------------------------------
// Commission statement reconciliation — an insurer's own account of
// commission paid/owed for a period, checked against our projected
// 'commission' financial_transactions rows (created when a premium is
// confirmed, see POST /api/premium-confirmations above). Reconciling
// updates the projected transaction from 'pending' to 'matched' (or
// 'disputed' if the amounts disagree) rather than overwriting it.
// ----------------------------------------------------
app.get("/api/commission-statements", asyncRoute(async (req, res) => {
  const rows = req.query.insurerId
    ? await db.select().from(commissionStatements).where(eq(commissionStatements.insurerId, String(req.query.insurerId))).orderBy(desc(commissionStatements.periodStart))
    : await db.select().from(commissionStatements).orderBy(desc(commissionStatements.periodStart));
  res.json(rows);
}));

app.post("/api/commission-statements", requirePermission("commission_statement.reconcile"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(commissionStatements).values({
    id: `stmt-${uid()}`,
    insurerId: req.body.insurerId,
    periodStart: req.body.periodStart,
    periodEnd: req.body.periodEnd,
    totalCommissionKes: req.body.totalCommissionKes ?? null,
    status: "Imported",
    receivedAt: new Date(),
  }).returning();
  res.json(newItem);
}));

app.patch("/api/commission-statements/:id", requirePermission("commission_statement.reconcile"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["status", "totalCommissionKes"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(commissionStatements).set(values).where(eq(commissionStatements.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Commission statement not found" });
  res.json(updated);
}));

app.get("/api/commission-lines", asyncRoute(async (req, res) => {
  const rows = req.query.statementId
    ? await db.select().from(commissionLines).where(eq(commissionLines.statementId, String(req.query.statementId)))
    : await db.select().from(commissionLines);
  res.json(rows);
}));

app.post("/api/commission-lines", requirePermission("commission_statement.reconcile"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(commissionLines).values({
    statementId: req.body.statementId,
    policyId: req.body.policyId ?? null,
    commissionRatePct: req.body.commissionRatePct ?? null,
    commissionAmountKes: req.body.commissionAmountKes ?? null,
  }).returning();
  res.json(newItem);
}));

// Matches every not-yet-matched line on a statement against the
// policy's own pending commission projection: an amount that agrees
// (within KES 1, to absorb rounding) is auto-matched; a policy with no
// pending projection, or one whose amount disagrees, is left for
// manual review — never silently accepted or overwritten.
app.post("/api/commission-statements/:id/reconcile", requirePermission("commission_statement.reconcile"), asyncRoute(async (req, res) => {
  const [statement] = await db.select().from(commissionStatements).where(eq(commissionStatements.id, req.params.id));
  if (!statement) return res.status(404).json({ error: "Commission statement not found" });

  const lines = await db.select().from(commissionLines).where(eq(commissionLines.statementId, statement.id));
  let matchedCount = 0;
  let discrepancyCount = 0;
  let unresolvedCount = 0;

  for (const line of lines) {
    if (line.matchedTransactionId) { matchedCount++; continue; }
    if (!line.policyId) { unresolvedCount++; continue; }

    const [candidate] = await db.select().from(financialTransactions)
      .where(and(eq(financialTransactions.policyId, line.policyId), eq(financialTransactions.transactionType, "commission"), eq(financialTransactions.status, "pending")))
      .orderBy(desc(financialTransactions.occurredAt))
      .limit(1);

    if (!candidate) { unresolvedCount++; continue; }

    const amountsAgree = line.commissionAmountKes != null && Math.abs(Number(candidate.amountKes) - Number(line.commissionAmountKes)) < 1;
    await db.update(financialTransactions).set({ status: amountsAgree ? "matched" : "disputed", matched: amountsAgree }).where(eq(financialTransactions.id, candidate.id));
    await db.update(commissionLines).set({ matchedTransactionId: candidate.id }).where(eq(commissionLines.id, line.id));

    if (amountsAgree) matchedCount++;
    else discrepancyCount++;
  }

  const status = unresolvedCount > 0 ? "Manual Review" : discrepancyCount > 0 ? "Discrepancy" : "Auto-Matched";
  const [updated] = await db.update(commissionStatements).set({ status }).where(eq(commissionStatements.id, statement.id)).returning();
  res.json({ statement: updated, matchedCount, discrepancyCount, unresolvedCount });
}));

// ----------------------------------------------------
// Documents (SOP §8/§11) — policy wordings, KYC evidence, claim
// evidence, correspondence. Local disk in dev (STORAGE_DIR above);
// swap for S3/MinIO in production without changing the API shape.
// ----------------------------------------------------
app.get("/api/documents", asyncRoute(async (req, res) => {
  const conditions = [];
  if (req.query.ownerEntityType) conditions.push(eq(documents.ownerEntityType, String(req.query.ownerEntityType)));
  if (req.query.ownerEntityId) conditions.push(eq(documents.ownerEntityId, String(req.query.ownerEntityId)));
  const rows = conditions.length > 0
    ? await db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt))
    : await db.select().from(documents).orderBy(desc(documents.createdAt));
  // Documents marked 'restricted' are hidden from the list unless the
  // caller holds document.restricted.
  if (await hasPermission(req, "document.restricted")) return res.json(rows);
  res.json(rows.filter((d) => d.sensitivity !== "restricted"));
}));

app.post("/api/documents", asyncRoute(async (req, res) => {
  const { fileName, mimeType, fileBase64, ownerEntityType, ownerEntityId, documentType, sensitivity } = req.body;
  if (!fileBase64) return res.status(400).json({ error: "fileBase64 is required" });
  if (!ownerEntityType || !ownerEntityId) return res.status(400).json({ error: "ownerEntityType and ownerEntityId are required" });

  if (typeof fileBase64 !== "string") return res.status(400).json({ error: "fileBase64 must be a base64 string" });

  // Random id so a stored file's name can't be guessed or collide with
  // another upload landing in the same millisecond.
  const id = `doc-${crypto.randomUUID()}`;
  const rawExt = path.extname(fileName || "").toLowerCase();
  const ext = /^\.[a-z0-9]{1,6}$/.test(rawExt) ? rawExt : "";
  const storageKey = `${id}${ext}`;
  fs.writeFileSync(path.join(STORAGE_DIR, storageKey), Buffer.from(fileBase64, "base64"));

  const [newItem] = await db.insert(documents).values({
    id,
    ownerEntityType,
    ownerEntityId,
    fileName: fileName || storageKey,
    mimeType,
    storageKey,
    documentType,
    sensitivity: sensitivity || "internal",
    uploadedBy: actorId(req, req.body.uploadedBy),
  }).returning();

  await addAuditLog({ action: "DOCUMENT_UPLOADED", entityType: "document", entityId: newItem.id, actorStaffId: actorId(req, req.body.uploadedBy), afterState: { ...newItem } });
  res.json(newItem);
}));

app.get("/api/documents/:id/download", asyncRoute(async (req, res) => {
  const [doc] = await db.select().from(documents).where(eq(documents.id, req.params.id));
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.sensitivity === "restricted" && !(await hasPermission(req, "document.restricted"))) {
    return res.status(404).json({ error: "Document not found" });
  }
  // basename() so a tampered storageKey can never point outside STORAGE_DIR.
  const filePath = path.join(STORAGE_DIR, path.basename(doc.storageKey));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing from storage" });
  // Served as a download, never rendered: an uploaded HTML/SVG file must
  // not execute in the dashboard's origin, so only inert types keep their
  // declared Content-Type and everything else is sent as raw bytes.
  const SAFE_MIME = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain|application\/vnd\.openxmlformats-officedocument\.[a-z.]+|application\/msword|application\/vnd\.ms-excel)$/;
  res.setHeader("Content-Type", doc.mimeType && SAFE_MIME.test(doc.mimeType) ? doc.mimeType : "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName.replace(/["\r\n\\]/g, "")}"`);
  res.sendFile(filePath);
}));

// ----------------------------------------------------
// Workflow cases & tasks (SOP §9) — the generic engine every other
// workflow (onboarding, submission, placement, endorsement, claim,
// complaint, reconciliation, finding) plugs into.
// ----------------------------------------------------
app.get("/api/cases", asyncRoute(async (req, res) => {
  const rows = await db.select().from(cases).orderBy(desc(cases.openedAt));
  res.json(rows);
}));

app.post("/api/cases", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(cases).values({
    id: `case-${uid()}`,
    workflowType: req.body.workflowType,
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    currentState: req.body.currentState,
    slaDueAt: req.body.slaDueAt ? new Date(req.body.slaDueAt) : undefined,
    ownerStaffId: req.body.ownerStaffId,
  }).returning();
  res.json(newItem);
}));

// Transition a case's state — every transition is logged, matching the
// SOP rule that state changes drive (not just record) work.
app.patch("/api/cases/:id", asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(cases).where(eq(cases.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Case not found" });

  const values: Record<string, unknown> = {};
  if (req.body.currentState !== undefined) values.currentState = req.body.currentState;
  if (req.body.ownerStaffId !== undefined) values.ownerStaffId = req.body.ownerStaffId;
  if (req.body.slaDueAt !== undefined) values.slaDueAt = new Date(req.body.slaDueAt);
  if (req.body.closedAt !== undefined || req.body.closureReason !== undefined) {
    values.closedAt = req.body.closedAt ? new Date(req.body.closedAt) : new Date();
    values.closureReason = req.body.closureReason;
  }

  const [updated] = await db.update(cases).set(values).where(eq(cases.id, req.params.id)).returning();

  if (req.body.currentState && req.body.currentState !== existing.currentState) {
    await db.insert(caseTransitions).values({
      caseId: req.params.id,
      fromState: existing.currentState,
      toState: req.body.currentState,
      actorStaffId: actorId(req, req.body.actorStaffId),
      reason: req.body.reason,
    });
  }
  res.json(updated);
}));

app.get("/api/tasks", asyncRoute(async (req, res) => {
  const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  res.json(rows);
}));

app.post("/api/tasks", asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(tasks).values({
    id: `task-${uid()}`,
    caseId: req.body.caseId,
    taskType: req.body.taskType,
    queue: req.body.queue,
    ownerStaffId: req.body.ownerStaffId,
    priority: req.body.priority || "normal",
    dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
  }).returning();
  res.json(newItem);
}));

// A task cannot close without an outcome (SOP §9) — enforced here with
// a clear 400 before it ever reaches the DB's CHECK constraint.
app.patch("/api/tasks/:id", asyncRoute(async (req, res) => {
  if (req.body.status === "done" && !req.body.outcome) {
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
    if (!existing?.outcome) {
      return res.status(400).json({ error: "A task cannot be closed without an outcome." });
    }
  }
  const values: Record<string, unknown> = {};
  for (const field of ["ownerStaffId", "priority", "dueAt", "status", "outcome", "evidenceDocumentId", "escalated"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.dueAt) values.dueAt = new Date(values.dueAt as string);
  if (values.escalated === true) values.escalatedAt = new Date();
  if (values.status === "done" || values.status === "cancelled") values.closedAt = new Date();

  const [updated] = await db.update(tasks).set(values).where(eq(tasks.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Task not found" });
  res.json(updated);
}));

// ----------------------------------------------------
// Compliance obligations (SOP §8 / SOP-01) — recurring regulatory
// calendar: licences, filings, credential renewals.
// ----------------------------------------------------
app.get("/api/obligations", asyncRoute(async (req, res) => {
  const rows = await db.select().from(obligations).orderBy(obligations.dueDate);
  res.json(rows);
}));

app.post("/api/obligations", requirePermission("obligation.manage"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(obligations).values({
    id: `obl-${uid()}`,
    obligationType: req.body.obligationType,
    source: req.body.source,
    requirement: req.body.requirement,
    ownerStaffId: req.body.ownerStaffId,
    dueDate: req.body.dueDate,
    recurrence: req.body.recurrence,
  }).returning();
  res.json(newItem);
}));

app.patch("/api/obligations/:id", requirePermission("obligation.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["ownerStaffId", "dueDate", "status", "submittedAt", "outcome", "nextDueDate", "evidenceDocumentId"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  if (values.submittedAt) values.submittedAt = new Date(values.submittedAt as string);
  const [updated] = await db.update(obligations).set(values).where(eq(obligations.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Obligation not found" });
  res.json(updated);
}));

app.get("/api/audit-log", requirePermission("audit.view"), asyncRoute(async (req, res) => {
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.occurredAt)).limit(500);
  res.json(rows);
}));

// ----------------------------------------------------
// HR — employee profiles, leave management, performance reviews. An
// employee profile (hr.employees) is a 1:1 HR extension of an
// access.staff row (the login identity), not a replacement for it —
// the blueprint calls this out explicitly ("employee record" vs "user
// account"). There is no staff CRUD anywhere else in this file, so
// creating an employee here also creates the staff row that backs it.
// Recruitment/payroll/attendance/training are deliberately out of
// scope — see README.
// ----------------------------------------------------
app.get("/api/roles", asyncRoute(async (req, res) => {
  const rows = await db.select().from(roles);
  res.json(rows);
}));

app.get("/api/staff", asyncRoute(async (req, res) => {
  const rows = await db.select().from(staff);
  res.json(rows.map(({ passwordHash, ...rest }) => rest));
}));

app.post("/api/staff", requirePermission("employee.manage"), asyncRoute(async (req, res) => {
  if (req.body.password !== undefined && req.body.password !== "" && (typeof req.body.password !== "string" || req.body.password.length < 10)) {
    return res.status(400).json({ error: "Password must be at least 10 characters" });
  }
  const [newStaff] = await db.insert(staff).values({
    id: `staff-${uid()}`,
    fullName: req.body.fullName,
    email: req.body.email || null,
    phoneNumber: req.body.phoneNumber || null,
    roleId: req.body.roleId || null,
    supervisorId: req.body.supervisorId || null,
    approvalLimitKes: req.body.approvalLimitKes || null,
    passwordHash: req.body.password ? await bcrypt.hash(req.body.password, 10) : null,
  }).returning();

  const [newEmployee] = await db.insert(employees).values({
    staffId: newStaff.id,
    jobTitle: req.body.jobTitle,
    department: req.body.department,
    branch: req.body.branch,
    employmentType: req.body.employmentType || "full_time",
    hireDate: req.body.hireDate || new Date().toISOString().slice(0, 10),
    nationalId: req.body.nationalId,
    kraPin: req.body.kraPin,
    emergencyContactName: req.body.emergencyContactName,
    emergencyContactPhone: req.body.emergencyContactPhone,
    baseSalaryKes: req.body.baseSalaryKes || null,
  }).returning();

  await addAuditLog({ action: "EMPLOYEE_CREATED", entityType: "employee", entityId: newStaff.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: { staff: newStaff, employee: newEmployee } });
  const { passwordHash, ...staffSafe } = newStaff;
  res.json({ ...staffSafe, ...newEmployee });
}));

app.patch("/api/staff/:id", requirePermission("employee.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = {};
  for (const field of ["fullName", "email", "phoneNumber", "roleId", "supervisorId", "approvalLimitKes", "active"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  values.updatedAt = new Date();
  const [updated] = await db.update(staff).set(values).where(eq(staff.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Staff member not found" });
  const { passwordHash, ...staffSafe } = updated;
  res.json(staffSafe);
}));

app.get("/api/employees", asyncRoute(async (req, res) => {
  const rows = await db.select().from(employees);
  // Salary, national ID, KRA PIN, emergency contact and termination detail
  // are visible only to HR managers and to the employee themself; everyone
  // else gets the org-chart fields (title, department, status...).
  if (await hasPermission(req, "employee.manage")) return res.json(rows);
  res.json(rows.map((row) => {
    if (row.staffId === req.staff?.id) return row;
    return { ...row, baseSalaryKes: null, nationalId: null, kraPin: null, emergencyContactName: null, emergencyContactPhone: null, terminationReason: null };
  }));
}));

app.patch("/api/employees/:staffId", requirePermission("employee.manage"), asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(employees).where(eq(employees.staffId, req.params.staffId));
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  const values: Record<string, unknown> = {};
  for (const field of [
    "jobTitle", "department", "branch", "employmentType", "employmentStatus", "hireDate",
    "terminationDate", "terminationReason", "nationalId", "kraPin",
    "emergencyContactName", "emergencyContactPhone", "baseSalaryKes",
  ] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  values.updatedAt = new Date();
  const [updated] = await db.update(employees).set(values).where(eq(employees.staffId, req.params.staffId)).returning();
  if (!updated) return res.status(404).json({ error: "Employee not found" });

  // Terminating an employee revokes system access; reinstating gives
  // it back — mirrors the "reinstate lapsed coverage" endorsement's
  // reverse-effect pattern.
  if (values.employmentStatus === "terminated" && existing.employmentStatus !== "terminated") {
    await db.update(staff).set({ active: false, updatedAt: new Date() }).where(eq(staff.id, req.params.staffId));
  } else if (values.employmentStatus === "active" && existing.employmentStatus === "terminated") {
    await db.update(staff).set({ active: true, updatedAt: new Date() }).where(eq(staff.id, req.params.staffId));
  }

  await addAuditLog({ action: "EMPLOYEE_UPDATED", entityType: "employee", entityId: updated.staffId, actorStaffId: actorId(req, req.body.actorStaffId), afterState: updated });
  res.json(updated);
}));

app.get("/api/leave-types", asyncRoute(async (req, res) => {
  const rows = await db.select().from(leaveTypes);
  res.json(rows);
}));

app.get("/api/leave-balances", asyncRoute(async (req, res) => {
  const rows = req.query.staffId
    ? await db.select().from(leaveBalances).where(eq(leaveBalances.staffId, String(req.query.staffId)))
    : await db.select().from(leaveBalances);
  res.json(rows);
}));

app.get("/api/leave-requests", asyncRoute(async (req, res) => {
  const rows = req.query.staffId
    ? await db.select().from(leaveRequests).where(eq(leaveRequests.staffId, String(req.query.staffId))).orderBy(desc(leaveRequests.requestedAt))
    : await db.select().from(leaveRequests).orderBy(desc(leaveRequests.requestedAt));
  res.json(rows);
}));

app.post("/api/leave-requests", asyncRoute(async (req, res) => {
  // Staff request leave for themselves; filing on someone else's behalf
  // needs the leave-approver permission.
  if (req.body.staffId !== req.staff?.id && !(await hasPermission(req, "leave.decide"))) {
    return res.status(403).json({ error: "You can only request leave for yourself" });
  }
  const [leaveType] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, req.body.leaveTypeId));
  if (!leaveType) return res.status(400).json({ error: "Unknown leave type" });

  const startDate = new Date(req.body.startDate);
  const endDate = new Date(req.body.endDate);
  if (!(endDate >= startDate)) return res.status(400).json({ error: "endDate must be on or after startDate" });
  const daysRequested = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

  const [newItem] = await db.insert(leaveRequests).values({
    id: `lr-${uid()}`,
    staffId: req.body.staffId,
    leaveTypeId: req.body.leaveTypeId,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    daysRequested,
    reason: req.body.reason,
  }).returning();

  await addAuditLog({ action: "LEAVE_REQUESTED", entityType: "leave_request", entityId: newItem.id, actorStaffId: actorId(req, req.body.staffId), afterState: newItem });
  res.json(newItem);
}));

const LEAVE_TRANSITIONS: Record<string, string[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
};

app.patch("/api/leave-requests/:id", asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Leave request not found" });

  const nextStatus = req.body.status;
  if (nextStatus === undefined) return res.status(400).json({ error: "status is required" });
  if (!(LEAVE_TRANSITIONS[existing.status] || []).includes(nextStatus)) {
    return res.status(400).json({ error: `Cannot move a ${existing.status} leave request to ${nextStatus}` });
  }
  if (["approved", "rejected"].includes(nextStatus) && !(await hasPermission(req, "leave.decide"))) {
    return res.status(403).json({ error: "Missing permission: leave.decide" });
  }
  // Nobody approves or rejects their own leave, and only the requester
  // (or someone who can decide leave) may cancel a request.
  if (["approved", "rejected"].includes(nextStatus) && existing.staffId === req.staff?.id) {
    return res.status(403).json({ error: "You can't decide your own leave request" });
  }
  if (nextStatus === "cancelled" && existing.staffId !== req.staff?.id && !(await hasPermission(req, "leave.decide"))) {
    return res.status(403).json({ error: "Only the requester or a leave approver can cancel this request" });
  }

  const year = new Date(existing.startDate).getFullYear();
  if (nextStatus === "approved") {
    let [balance] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.staffId, existing.staffId), eq(leaveBalances.leaveTypeId, existing.leaveTypeId), eq(leaveBalances.year, year)));
    if (!balance) {
      const [leaveType] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, existing.leaveTypeId));
      [balance] = await db.insert(leaveBalances).values({
        id: `lb-${existing.staffId}-${existing.leaveTypeId}-${year}`,
        staffId: existing.staffId, leaveTypeId: existing.leaveTypeId, year,
        allocatedDays: leaveType?.defaultDaysPerYear || 0,
      }).returning();
    }
    const remaining = Number(balance.allocatedDays) + Number(balance.carriedOverDays) - Number(balance.usedDays);
    if (remaining < Number(existing.daysRequested)) {
      return res.status(400).json({ error: `Insufficient leave balance: ${remaining} day(s) remaining, ${existing.daysRequested} requested` });
    }
    await db.update(leaveBalances).set({ usedDays: Number(balance.usedDays) + Number(existing.daysRequested) }).where(eq(leaveBalances.id, balance.id));
  } else if (nextStatus === "cancelled" && existing.status === "approved") {
    const [balance] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.staffId, existing.staffId), eq(leaveBalances.leaveTypeId, existing.leaveTypeId), eq(leaveBalances.year, year)));
    if (balance) {
      await db.update(leaveBalances).set({ usedDays: Math.max(0, Number(balance.usedDays) - Number(existing.daysRequested)) }).where(eq(leaveBalances.id, balance.id));
    }
  }

  const [updated] = await db.update(leaveRequests).set({
    status: nextStatus,
    decidedBy: ["approved", "rejected"].includes(nextStatus) ? actorId(req, req.body.actorStaffId) : existing.decidedBy,
    decidedAt: new Date(),
    decisionNotes: req.body.decisionNotes ?? existing.decisionNotes,
  }).where(eq(leaveRequests.id, req.params.id)).returning();

  await addAuditLog({ action: "LEAVE_REQUEST_UPDATED", entityType: "leave_request", entityId: updated.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: updated });
  res.json(updated);
}));

app.get("/api/performance-reviews", asyncRoute(async (req, res) => {
  const rows = req.query.staffId
    ? await db.select().from(performanceReviews).where(eq(performanceReviews.staffId, String(req.query.staffId))).orderBy(desc(performanceReviews.periodEnd))
    : await db.select().from(performanceReviews).orderBy(desc(performanceReviews.periodEnd));
  // Reviews are confidential: review managers see all of them, everyone
  // else only reviews where they are the reviewee or the reviewer.
  if (await hasPermission(req, "performance_review.manage")) return res.json(rows);
  res.json(rows.filter((r) => r.staffId === req.staff?.id || r.reviewerId === req.staff?.id));
}));

app.post("/api/performance-reviews", requirePermission("performance_review.manage"), asyncRoute(async (req, res) => {
  const [newItem] = await db.insert(performanceReviews).values({
    id: `pr-${uid()}`,
    staffId: req.body.staffId,
    reviewerId: actorId(req, req.body.reviewerId),
    periodStart: req.body.periodStart,
    periodEnd: req.body.periodEnd,
    rating: req.body.rating,
    strengths: req.body.strengths,
    areasForImprovement: req.body.areasForImprovement,
    goals: req.body.goals,
  }).returning();
  await addAuditLog({ action: "PERFORMANCE_REVIEW_CREATED", entityType: "performance_review", entityId: newItem.id, actorStaffId: actorId(req, req.body.reviewerId), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/performance-reviews/:id", asyncRoute(async (req, res) => {
  const [existing] = await db.select().from(performanceReviews).where(eq(performanceReviews.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Performance review not found" });

  const values: Record<string, unknown> = {};
  for (const field of ["rating", "strengths", "areasForImprovement", "goals", "status"] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }

  if (values.status === "acknowledged") {
    // The reviewee acknowledging their own review needs no special
    // permission — but it does have to be them (or a review manager).
    if (existing.staffId !== req.staff?.id && !(await hasPermission(req, "performance_review.manage"))) {
      return res.status(403).json({ error: "Only the person being reviewed can acknowledge this review" });
    }
    if (existing.status !== "submitted") return res.status(400).json({ error: "Only a submitted review can be acknowledged" });
    values.acknowledgedAt = new Date();
  } else {
    if (!(await hasPermission(req, "performance_review.manage"))) return res.status(403).json({ error: "Missing permission: performance_review.manage" });
    if (values.status === "submitted") {
      if (existing.status !== "draft") return res.status(400).json({ error: "Only a draft review can be submitted" });
      values.submittedAt = new Date();
    } else if (values.status !== undefined) {
      return res.status(400).json({ error: `Cannot move a ${existing.status} review to ${values.status}` });
    }
  }

  const [updated] = await db.update(performanceReviews).set(values).where(eq(performanceReviews.id, req.params.id)).returning();
  await addAuditLog({ action: "PERFORMANCE_REVIEW_UPDATED", entityType: "performance_review", entityId: updated.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: updated });
  res.json(updated);
}));

// ----------------------------------------------------
// Producers/sub-brokers — external parties who introduce business
// (opportunities.producerId / policies.producerId) and earn a
// negotiated split of the commission the brokerage earns on it,
// tracked via finance.producer_commission_splits (created in
// confirmPremiumForPolicy above) and paid out below. "Target vs
// actual" is computed here from policies.premium_amount rather than
// stored, since it's just a read against data that already exists.
// ----------------------------------------------------
app.get("/api/producers", asyncRoute(async (req, res) => {
  const rows = await db.select().from(producers).orderBy(desc(producers.createdAt));
  const allPolicies = await db.select().from(policies);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const withYtd = rows.map((p) => {
    const premiumYtdKes = allPolicies
      .filter((pol) => pol.producerId === p.id && pol.startDate >= yearStart)
      .reduce((sum, pol) => sum + Number(pol.premiumAmount), 0);
    return { ...p, premiumYtdKes };
  });
  res.json(withYtd);
}));

app.post("/api/producers", requirePermission("producer.manage"), asyncRoute(async (req, res) => {
  if (!["agent", "sub_broker"].includes(req.body.producerType)) {
    return res.status(400).json({ error: "producerType must be 'agent' or 'sub_broker'" });
  }
  const [newItem] = await db.insert(producers).values({
    id: `prod-${uid()}`,
    producerType: req.body.producerType,
    name: req.body.name,
    contactPerson: req.body.contactPerson,
    phoneNumber: req.body.phoneNumber,
    email: req.body.email,
    kraPin: req.body.kraPin,
    licenceNumber: req.body.licenceNumber,
    commissionSplitPct: req.body.commissionSplitPct ?? 0,
    contractStartDate: req.body.contractStartDate,
    contractEndDate: req.body.contractEndDate,
    targetPremiumKes: req.body.targetPremiumKes,
    notes: req.body.notes,
  }).returning();
  await addAuditLog({ action: "PRODUCER_CREATED", entityType: "producer", entityId: newItem.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: newItem });
  res.json(newItem);
}));

app.patch("/api/producers/:id", requirePermission("producer.manage"), asyncRoute(async (req, res) => {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of [
    "name", "contactPerson", "phoneNumber", "email", "kraPin", "licenceNumber",
    "commissionSplitPct", "status", "contractStartDate", "contractEndDate", "targetPremiumKes", "notes",
  ] as const) {
    if (req.body[field] !== undefined) values[field] = req.body[field];
  }
  const [updated] = await db.update(producers).set(values).where(eq(producers.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Producer not found" });
  res.json(updated);
}));

app.get("/api/producer-commission-splits", asyncRoute(async (req, res) => {
  const rows = req.query.producerId
    ? await db.select().from(producerCommissionSplits).where(eq(producerCommissionSplits.producerId, String(req.query.producerId))).orderBy(desc(producerCommissionSplits.createdAt))
    : await db.select().from(producerCommissionSplits).orderBy(desc(producerCommissionSplits.createdAt));
  res.json(rows);
}));

app.post("/api/producer-commission-splits/:id/pay", requirePermission("producer.manage"), asyncRoute(async (req, res) => {
  const [split] = await db.select().from(producerCommissionSplits).where(eq(producerCommissionSplits.id, req.params.id));
  if (!split) return res.status(404).json({ error: "Commission split not found" });
  if (split.status === "paid") return res.status(400).json({ error: "This split has already been paid" });

  const [updated] = await db.update(producerCommissionSplits).set({
    status: "paid", paidAt: new Date(), paymentReference: req.body.paymentReference,
  }).where(eq(producerCommissionSplits.id, req.params.id)).returning();

  await postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    description: `Producer commission paid for ${split.policyId}`,
    sourceType: "producer_commission_split",
    sourceId: split.id,
    lines: [
      { accountCode: "2010", debitKes: Number(split.splitAmountKes), policyId: split.policyId },
      { accountCode: "1000", creditKes: Number(split.splitAmountKes), policyId: split.policyId },
    ],
  });

  await addAuditLog({ action: "PRODUCER_COMMISSION_PAID", entityType: "producer_commission_split", entityId: updated.id, actorStaffId: actorId(req, req.body.actorStaffId), afterState: updated });
  res.json(updated);
}));

// ----------------------------------------------------
// Dashboard front-end — Vite dev middleware, or the static build in
// production. Mirrors ../studio/server.ts so both services boot the
// same way.
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`erp platform listening on http://0.0.0.0:${PORT}`);
  });
}

// Tests import `app` and drive it directly; only a real run should bind a port.
export { app };
if (!process.env.VITEST) startServer();
