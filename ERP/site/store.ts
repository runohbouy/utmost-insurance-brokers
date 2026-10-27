// ---------------------------------------------------------------------------
// Data access for the website API. Everything lives in the ERP's one database:
// insurers in product.insurers, premium rate tables in product.premium_rate_versions,
// levies in product.statutory_levies, claims in claims.claims, the audit trail in
// compliance.audit_log, and the few things only the public site captures in site.*.
//
// Functions return the same shapes the old JSON files held, so the quote engine
// and the staff workspace behave exactly as before — only where the data comes
// from changed.
// ---------------------------------------------------------------------------
import crypto from "crypto";
import { and, asc, desc, eq, isNotNull, isNull, lte, gte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  auditLog, cases, claims, claimTimelineSteps, coverNotes, customerQuotes, insurerLogos, insurers, otherLineRequests,
  otpCodes, parties, policies, premiumRateVersions, roomScans, staff, statutoryLevies,
} from "../db/schema";

const uid = () => `${Date.now()}${crypto.randomBytes(3).toString("hex")}`;

// Drizzle wraps driver errors; the Postgres SQLSTATE is on `cause`.
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

// ---------------------------------------------------------------------------
// Insurers
// ---------------------------------------------------------------------------
type InsurerRow = typeof insurers.$inferSelect;

/** The website's short id ("icea") for a database insurer id ("icea-lion-general"), and back. */
async function slugToInsurerId(slug: string): Promise<string | null> {
  const [row] = await db.select({ id: insurers.id }).from(insurers).where(eq(insurers.siteSlug, slug));
  return row?.id ?? null;
}

export interface QuotePoolInsurer { name: string; id: string; rating: string }

/**
 * Insurers the quote engine prices, in display order: the built-in pool first (fixed order),
 * then carriers staff added through the rates desk — those only once they have live rates.
 */
export async function getQuotePool(): Promise<QuotePoolInsurer[]> {
  const builtIn = await db.select().from(insurers).where(isNotNull(insurers.quotePoolOrder)).orderBy(asc(insurers.quotePoolOrder));

  const withRates = await db.select({ insurerId: premiumRateVersions.insurerId }).from(premiumRateVersions).where(eq(premiumRateVersions.status, "active"));
  const liveIds = new Set(withRates.map((r) => r.insurerId));
  const custom = (await db.select().from(insurers).where(and(eq(insurers.siteOrigin, "admin"), isNull(insurers.quotePoolOrder))).orderBy(asc(insurers.createdAt)))
    .filter((i) => liveIds.has(i.id));

  return [...builtIn, ...custom].map((i) => ({
    name: i.displayName || i.name,
    id: i.siteSlug!,
    rating: i.ratingLabel || "Unrated (New Carrier)",
  }));
}

/** Public insurer profiles (what the site shows on its insurer pages), one object per insurer. */
export async function listInsurerProfiles(): Promise<Record<string, unknown>[]> {
  const rows = await db.select().from(insurers).where(and(isNotNull(insurers.siteSlug), isNotNull(insurers.profile))).orderBy(asc(insurers.createdAt), asc(insurers.name));
  return rows.map(profileOf);
}

function profileOf(row: InsurerRow): Record<string, unknown> {
  return { ...(row.profile as Record<string, unknown>), id: row.siteSlug, isCustom: row.siteOrigin === "admin" };
}

/** IRA class codes each insurer is licensed for, from the register — used to shortlist carriers per class. */
export async function licensedInsurerNames(classCode: string): Promise<string[]> {
  const rows = await db.select().from(insurers).where(and(eq(insurers.active, true), sql`${insurers.authorizedClasses} @> ${JSON.stringify([classCode])}::jsonb`)).orderBy(asc(insurers.name));
  return rows.map((r) => r.displayName || r.name);
}

export interface AdminInsurerInput {
  id: string; name: string; tradingName: string; logoEmoji: string; established: number; licenseYear: number;
  licenseStatus: string; iraLicenseMotor: string; iraLicenseMedical: string; odpcRegistered: boolean; memberOfAibk: boolean;
  rating: string; strengthReason: string; availableProducts: string[]; claimTurnaroundDays: number; emergencyPhone: string;
}

export class StoreError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Adds (or edits) a carrier through the rates desk. Built-in carriers can't be replaced. */
export async function upsertAdminInsurer(input: AdminInsurerInput): Promise<{ created: boolean; profile: Record<string, unknown> }> {
  const [existing] = await db.select().from(insurers).where(eq(insurers.siteSlug, input.id));
  if (existing && existing.siteOrigin === "builtin") {
    throw new StoreError(409, `An insurer with ID '${input.id}' already exists as a built-in carrier.`);
  }
  const profile = { ...input, isCustom: true, createdAt: (existing?.profile as any)?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };

  if (existing) {
    const [row] = await db.update(insurers).set({
      name: input.name, displayName: input.tradingName, ratingLabel: input.rating, profile,
    }).where(eq(insurers.id, existing.id)).returning();
    return { created: false, profile: profileOf(row) };
  }

  // New carriers enter the ERP's panel "under review" — they are quoted on the website once
  // they have live rates, but compliance still has to approve them before business is placed.
  const [row] = await db.insert(insurers).values({
    id: `site-${input.id}`,
    name: input.name,
    insurerType: "general",
    authorizedClasses: [],
    panelStatus: "under_review",
    kycStatus: "pending",
    siteSlug: input.id,
    displayName: input.tradingName,
    ratingLabel: input.rating,
    siteOrigin: "admin",
    profile,
  }).returning();
  return { created: true, profile: profileOf(row) };
}

export async function deleteAdminInsurer(slug: string): Promise<boolean> {
  const [row] = await db.select().from(insurers).where(and(eq(insurers.siteSlug, slug), eq(insurers.siteOrigin, "admin")));
  if (!row) return false;
  try {
    await db.transaction(async (tx) => {
      await tx.delete(premiumRateVersions).where(eq(premiumRateVersions.insurerId, row.id));
      await tx.delete(insurerLogos).where(eq(insurerLogos.insurerKey, slug));
      await tx.delete(insurers).where(eq(insurers.id, row.id));
    });
  } catch (err) {
    if (pgCode(err) === "23503") throw new StoreError(409, "This insurer is already used by policies or quotes and cannot be deleted.");
    throw err;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Premium rate tables + levies  (the old insurerRatesDb.json)
// ---------------------------------------------------------------------------
export interface LegacyRateVersion {
  id: string; versionNumber: number; insurerId: string; category: string; status: "active" | "inactive";
  timestamp: string; updatedByStaffId: string | null; rates: Record<string, any>;
}
export interface Levies { pcfRate: number; itlRate: number; stampDuty: number }
export interface RatesDb { versions: LegacyRateVersion[]; levies: Levies }

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The general (all-class) statutory levies in force today, as fractions (0.0025 = 0.25%). */
export async function currentLevies(): Promise<Levies> {
  const today = todayIso();
  const rows = await db.select().from(statutoryLevies).where(and(
    isNull(statutoryLevies.category),
    lte(statutoryLevies.effectiveFrom, today),
    or(isNull(statutoryLevies.effectiveTo), gte(statutoryLevies.effectiveTo, today)),
  )).orderBy(desc(statutoryLevies.effectiveFrom));
  const latest = (type: string) => rows.find((r) => r.levyType === type);
  return {
    pcfRate: (latest("pcf")?.ratePct ?? 0) / 100,
    itlRate: (latest("itl")?.ratePct ?? 0) / 100,
    stampDuty: latest("stamp_duty")?.flatAmountKes ?? 0,
  };
}

/** Records a levy change as a new effective-dated row; the superseded row is closed, never edited. */
export async function saveLevies(change: Partial<Levies>, actorStaffId: string): Promise<void> {
  const today = todayIso();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const plan: { type: "pcf" | "itl" | "stamp_duty"; value: number; method: "percentage" | "flat" }[] = [];
  if (change.pcfRate !== undefined) plan.push({ type: "pcf", value: change.pcfRate * 100, method: "percentage" });
  if (change.itlRate !== undefined) plan.push({ type: "itl", value: change.itlRate * 100, method: "percentage" });
  if (change.stampDuty !== undefined) plan.push({ type: "stamp_duty", value: change.stampDuty, method: "flat" });

  await db.transaction(async (tx) => {
    for (const p of plan) {
      const [current] = await tx.select().from(statutoryLevies).where(and(
        eq(statutoryLevies.levyType, p.type), isNull(statutoryLevies.category), isNull(statutoryLevies.effectiveTo), lte(statutoryLevies.effectiveFrom, today),
      )).orderBy(desc(statutoryLevies.effectiveFrom)).limit(1);

      const same = current && (p.method === "flat" ? current.flatAmountKes === p.value : Math.abs((current.ratePct ?? 0) - p.value) < 1e-9);
      if (same) continue;

      const values = p.method === "flat" ? { ratePct: null, flatAmountKes: p.value } : { ratePct: p.value, flatAmountKes: null };
      if (current && current.effectiveFrom === today) {
        // Corrected within the same day: amend that row rather than stacking two for one date.
        await tx.update(statutoryLevies).set(values).where(eq(statutoryLevies.id, current.id));
        continue;
      }
      if (current) await tx.update(statutoryLevies).set({ effectiveTo: yesterday }).where(eq(statutoryLevies.id, current.id));
      await tx.insert(statutoryLevies).values({
        id: `levy-${uid()}`, levyType: p.type, category: null, calculationMethod: p.method, effectiveFrom: today,
        source: `Rates desk (${actorStaffId})`, ...values,
      });
    }
  });
}

async function versionRows(activeOnly: boolean): Promise<LegacyRateVersion[]> {
  const rows = await db
    .select({ v: premiumRateVersions, slug: insurers.siteSlug })
    .from(premiumRateVersions)
    .innerJoin(insurers, eq(insurers.id, premiumRateVersions.insurerId))
    .where(activeOnly ? eq(premiumRateVersions.status, "active") : undefined)
    .orderBy(asc(premiumRateVersions.createdAt), asc(premiumRateVersions.versionNumber));
  return rows.map(({ v, slug }) => ({
    id: v.id, versionNumber: v.versionNumber, insurerId: slug ?? v.insurerId, category: v.category, status: v.status,
    timestamp: v.createdAt.toISOString(), updatedByStaffId: v.updatedByStaffId, rates: v.rates,
  }));
}

/** Everything the rates desk shows: every version ever published, plus the levies in force. */
export async function loadRatesDb(): Promise<RatesDb> {
  const [versions, levies] = await Promise.all([versionRows(false), currentLevies()]);
  return { versions, levies };
}

/** What the quote engine needs on every request: only the live versions, plus the levies. */
export async function loadActiveRatesDb(): Promise<RatesDb> {
  const [versions, levies] = await Promise.all([versionRows(true), currentLevies()]);
  return { versions, levies };
}

/**
 * Publishes a new pricing table for an insurer: the live version is retired (kept for history)
 * and the new one goes live. Returns the ids so the change can be audited.
 */
export async function publishRateVersion(
  slug: string,
  build: (current: Record<string, any> | null, insurerName: string) => Record<string, any>,
  actorStaffId: string,
): Promise<{ newVersionId: string; oldVersionId: string }> {
  const [insurer] = await db.select().from(insurers).where(eq(insurers.siteSlug, slug));
  if (!insurer) throw new StoreError(404, `Unknown insurer '${slug}'.`);

  return db.transaction(async (tx) => {
    const [active] = await tx.select().from(premiumRateVersions).where(and(eq(premiumRateVersions.insurerId, insurer.id), eq(premiumRateVersions.status, "active")));
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${premiumRateVersions.versionNumber}), 0)` }).from(premiumRateVersions).where(eq(premiumRateVersions.insurerId, insurer.id));
    const next = Number(max) + 1;
    const rates = build(active ? JSON.parse(JSON.stringify(active.rates)) : null, insurer.displayName || insurer.name);

    if (active) await tx.update(premiumRateVersions).set({ status: "inactive" }).where(eq(premiumRateVersions.id, active.id));
    const newVersionId = `rate-ver-${slug}-${next}`;
    await tx.insert(premiumRateVersions).values({
      id: newVersionId, insurerId: insurer.id, versionNumber: next, category: "all", status: "active", rates, updatedByStaffId: actorStaffId,
    });
    return { newVersionId, oldVersionId: active?.id ?? "none" };
  });
}

// ---------------------------------------------------------------------------
// Insurer logos (bytes live in the database)
// ---------------------------------------------------------------------------
export interface LogoEntry { src: string; uploadedAt: string; uploadedByStaffId: string | null }

export async function listLogos(): Promise<Record<string, LogoEntry>> {
  const rows = await db.select({ key: insurerLogos.insurerKey, at: insurerLogos.uploadedAt, by: insurerLogos.uploadedByStaffId }).from(insurerLogos);
  return Object.fromEntries(rows.map((r) => [r.key, { src: `/api/site/files/logos/${r.key}?v=${r.at.getTime()}`, uploadedAt: r.at.toISOString(), uploadedByStaffId: r.by }]));
}

export async function getLogo(key: string) {
  const [row] = await db.select().from(insurerLogos).where(eq(insurerLogos.insurerKey, key));
  return row ?? null;
}

export async function saveLogo(key: string, mimeType: string, data: Buffer, actorStaffId: string): Promise<LogoEntry> {
  const now = new Date();
  await db.insert(insurerLogos).values({ insurerKey: key, mimeType, data, uploadedAt: now, uploadedByStaffId: actorStaffId })
    .onConflictDoUpdate({ target: insurerLogos.insurerKey, set: { mimeType, data, uploadedAt: now, uploadedByStaffId: actorStaffId } });
  return { src: `/api/site/files/logos/${key}?v=${now.getTime()}`, uploadedAt: now.toISOString(), uploadedByStaffId: actorStaffId };
}

export async function deleteLogo(key: string): Promise<boolean> {
  const removed = await db.delete(insurerLogos).where(eq(insurerLogos.insurerKey, key)).returning();
  return removed.length > 0;
}

// ---------------------------------------------------------------------------
// Audit trail — the ERP's compliance.audit_log, so there is one trail, not two.
// ---------------------------------------------------------------------------
export interface SiteAuditEntry {
  action: string; entityType: string; entityId: string;
  actorId: string; actorType: "staff" | "customer" | "system"; details: unknown;
}

/** Never throws: failing to log must not fail the request being logged. */
export async function recordAudit(entry: SiteAuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorStaffId: entry.actorType === "staff" ? entry.actorId : null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      afterState: { actorType: entry.actorType, actorId: entry.actorId, details: entry.details },
    });
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}

/** Newest audit entries in the shape the staff workspace renders. */
export async function listAuditLog(limit = 500) {
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.occurredAt), desc(auditLog.id)).limit(limit);
  return rows.map((r) => {
    const state = (r.afterState ?? {}) as { actorType?: string; actorId?: string; details?: unknown };
    const fromSite = state.actorType !== undefined;
    return {
      id: String(r.id),
      timestamp: r.occurredAt.toISOString(),
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorId: state.actorId ?? r.actorStaffId ?? "system",
      actorType: state.actorType ?? (r.actorStaffId ? "staff" : "system"),
      details: fromSite ? state.details : r.afterState,
    };
  });
}

// ---------------------------------------------------------------------------
// What the public site captures
// ---------------------------------------------------------------------------
export async function defaultUnderwriterId(): Promise<string | null> {
  const [row] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.roleId, "underwriter"), eq(staff.active, true))).orderBy(asc(staff.createdAt)).limit(1);
  return row?.id ?? null;
}

export async function insertCustomerQuote(record: Record<string, any>): Promise<void> {
  await db.insert(customerQuotes).values({
    id: record.id,
    createdAt: new Date(record.timestamp),
    category: record.category ?? null,
    insurerId: record.insurerId ?? null,
    totalPremiumKes: Number.isFinite(Number(record.totalPremiumKES)) ? Number(record.totalPremiumKES) : null,
    assignedStaffId: record.assignedStaffId ?? null,
    payload: record,
  });
}

export async function insertCoverNote(note: typeof coverNotes.$inferInsert): Promise<void> {
  await db.insert(coverNotes).values(note);
}

export async function insertOtherLineRequest(row: typeof otherLineRequests.$inferInsert): Promise<void> {
  await db.insert(otherLineRequests).values(row);
}

export async function listRoomScans(limit = 100) {
  const rows = await db.select().from(roomScans).orderBy(desc(roomScans.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, timestamp: r.createdAt.toISOString(), ...r.payload }));
}

export async function recordRoomScan(analysis: Record<string, any>): Promise<void> {
  await db.insert(roomScans).values({ id: `scan-${uid()}`, payload: { analysis } });
}

// ---------------------------------------------------------------------------
// One-time email codes: stored hashed, expire after 10 minutes, five wrong guesses burn the code.
// ---------------------------------------------------------------------------
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const hashCode = (email: string, code: string) => crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");

export function newOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export async function issueOtp(email: string, code: string): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db.insert(otpCodes).values({ email, codeHash: hashCode(email, code), expiresAt, attempts: 0 })
    .onConflictDoUpdate({ target: otpCodes.email, set: { codeHash: hashCode(email, code), expiresAt, attempts: 0 } });
}

export type OtpResult = "ok" | "none" | "expired" | "wrong" | "locked";

export async function checkOtp(email: string, code: string): Promise<OtpResult> {
  const [row] = await db.select().from(otpCodes).where(eq(otpCodes.email, email));
  if (!row) return "none";
  if (row.expiresAt.getTime() < Date.now()) { await db.delete(otpCodes).where(eq(otpCodes.email, email)); return "expired"; }
  if (row.attempts >= OTP_MAX_ATTEMPTS) { await db.delete(otpCodes).where(eq(otpCodes.email, email)); return "locked"; }

  const a = Buffer.from(row.codeHash);
  const b = Buffer.from(hashCode(email, code));
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    await db.delete(otpCodes).where(eq(otpCodes.email, email));
    return "ok";
  }
  await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.email, email));
  return row.attempts + 1 >= OTP_MAX_ATTEMPTS ? "locked" : "wrong";
}

// ---------------------------------------------------------------------------
// Claims — a customer's notification is a real ERP claim (FNOL), not a copy in a side file.
// ---------------------------------------------------------------------------
export async function registerCustomerClaim(input: { policyNumber: string; claimType: string; phoneNumber: string; description: string }) {
  const [policy] = await db.select({ id: policies.id }).from(policies).where(eq(policies.id, input.policyNumber));

  for (let attempt = 0; ; attempt++) {
    const id = `UTM-CLM-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      const claim = await db.transaction(async (tx) => {
        const [row] = await tx.insert(claims).values({
          id, policyId: policy?.id ?? null, policyNumber: input.policyNumber, claimType: input.claimType,
          phoneNumber: input.phoneNumber, description: input.description,
        }).returning();
        await tx.insert(claimTimelineSteps).values({
          claimId: row.id, status: "Notified", eventDate: new Date(), completed: true,
          detail: "Claim registered (First Notification of Loss) from the public website.", sortOrder: 0,
        });
        await tx.insert(cases).values({ id: `case-${uid()}`, workflowType: "claim", entityType: "claim", entityId: row.id, currentState: row.status });
        return row;
      });
      return { claim, policyFound: Boolean(policy) };
    } catch (err) {
      if (pgCode(err) === "23505" && attempt < 5) continue; // six-digit id collided; draw another
      throw err;
    }
  }
}

/** Claims in the shape the staff workspace's registration desk renders. */
export async function listClaimsForDesk(limit = 200) {
  const rows = await db
    .select({ claim: claims, clientName: parties.fullName, insurerName: insurers.name })
    .from(claims)
    .leftJoin(policies, eq(policies.id, claims.policyId))
    .leftJoin(parties, eq(parties.id, policies.clientId))
    .leftJoin(insurers, eq(insurers.id, policies.insurerId))
    .orderBy(desc(claims.createdAt))
    .limit(limit);
  return rows.map(({ claim, clientName, insurerName }) => ({
    id: claim.id, claimId: claim.id, clmId: claim.id,
    client: clientName ?? "Unmatched policy",
    type: claim.claimType, claimType: claim.claimType,
    policyNumber: claim.policyNumber,
    insurer: insurerName ?? "Processing Placement Panel",
    status: claim.status,
    timestamp: claim.createdAt.toISOString(),
    phoneNumber: claim.phoneNumber,
    description: claim.description ?? "",
  }));
}

