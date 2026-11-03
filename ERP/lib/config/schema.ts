// ---------------------------------------------------------------------------
// EffectiveTenantConfig — everything the platform needs to know about HOW a
// tenant operates, in six slices. A slice is a plain, fully-specified object:
// there are no optional fields with hidden fallbacks. If a value is not in the
// resolved snapshot the platform does not guess it; publishing fails instead.
// ---------------------------------------------------------------------------
import { z } from "zod";
import { isValidTimeZone } from "../time";
import { minorExponent } from "../money";
import { contrastRatio } from "./contrast";

export const MODULES = ["finance", "claims", "portal", "analytics", "strategy", "commissions"] as const;
export const ALLOCATION_DEFAULTS = ["fifo", "policy_priority", "product_type_priority", "pro_rata"] as const;
export const DATE_FORMATS = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd.MM.yyyy"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex colour such as #0b5c3b");
const code = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/, "lower-case letters, digits and underscores");
const nonNegInt = z.number().int().nonnegative();

// Each slice is declared as a plain object ("Base") so overrides can make it
// partial, and then refined into the slice that gets validated after merging.

const regionalBase = z.strictObject({
  countryCode: z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2"),
  currency: z.string().regex(/^[A-Z]{3}$/, "ISO 4217").refine((c) => {
    try { minorExponent(c); return true; } catch { return false; }
  }, "unknown currency"),
  timeZone: z.string().refine(isValidTimeZone, "not an IANA time zone"),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
});
export const regionalSlice = regionalBase;

const taxRule = z.discriminatedUnion("kind", [
  z.strictObject({ code, name: z.string().min(1).max(60), kind: z.literal("percent"), rateBps: z.number().int().min(0).max(10_000) }),
  z.strictObject({ code, name: z.string().min(1).max(60), kind: z.literal("flat"), flatMinor: nonNegInt }),
]);
export type TaxRule = z.infer<typeof taxRule>;

const taxBase = z.strictObject({
  /** Are quoted/charged premiums net of tax (tax added on top) or gross (tax carved out)? */
  pricing: z.enum(["exclusive", "inclusive"]),
  rounding: z.enum(["half_up", "half_even", "down"]),
  taxes: z.array(taxRule).max(12),
});
export const taxSlice = taxBase.superRefine((tax, ctx) => {
  const seen = new Set<string>();
  tax.taxes.forEach((t, i) => {
    if (seen.has(t.code)) ctx.addIssue({ code: "custom", path: ["taxes", i, "code"], message: `duplicate tax code ${t.code}` });
    seen.add(t.code);
  });
  if (tax.pricing === "inclusive" && tax.taxes.some((t) => t.kind === "flat")) {
    ctx.addIssue({ code: "custom", path: ["pricing"], message: "flat taxes cannot be combined with tax-inclusive pricing" });
  }
});

const localizationBase = z.strictObject({
  locale: z.string().refine((l) => {
    try { return Intl.getCanonicalLocales(l).length === 1; } catch { return false; }
  }, "not a valid BCP 47 locale"),
  dateFormat: z.enum(DATE_FORMATS),
});
export const localizationSlice = localizationBase;

const brandBase = z.strictObject({
  displayName: z.string().min(1).max(80),
  primaryColor: hex,
  onPrimaryColor: hex,
  accentColor: hex,
  surfaceColor: hex,
  textColor: hex,
  fontFamily: z.string().regex(/^[A-Za-z0-9 ,'-]{1,80}$/, "letters, digits, spaces, commas, hyphens"),
});
export const brandSlice = brandBase.superRefine((b, ctx) => {
  // WCAG 2.1 AA: 4.5:1 for normal text on the colours we pair it with.
  const pairs: [keyof typeof b, keyof typeof b][] = [
    ["onPrimaryColor", "primaryColor"],
    ["textColor", "surfaceColor"],
    ["primaryColor", "surfaceColor"],
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrastRatio(b[fg], b[bg]);
    if (ratio < 4.5) ctx.addIssue({ code: "custom", path: [fg], message: `contrast with ${bg} is ${ratio.toFixed(2)}:1; WCAG 2.1 AA needs 4.5:1` });
  }
});

const limitsBase = z.strictObject({ staffSeats: z.number().int().min(1), portalUsers: nonNegInt });
const entitlementsBase = z.strictObject({
  modules: z.array(z.enum(MODULES)).min(1),
  limits: limitsBase,
});
export const entitlementsSlice = entitlementsBase.superRefine((e, ctx) => {
  if (new Set(e.modules).size !== e.modules.length) ctx.addIssue({ code: "custom", path: ["modules"], message: "duplicate module" });
  if (e.modules.includes("portal") && !e.modules.includes("finance")) ctx.addIssue({ code: "custom", path: ["modules"], message: "the client portal needs the finance module" });
  if (e.modules.includes("commissions") && !e.modules.includes("finance")) ctx.addIssue({ code: "custom", path: ["modules"], message: "commissions need the finance module" });
});

const financeBase = z.strictObject({
  allocationStrategy: z.enum(ALLOCATION_DEFAULTS),
  feesFirst: z.boolean(),
  /** Money received beyond everything owed: held in suspense for staff to resolve, or kept as client credit. */
  overpaymentTreatment: z.enum(["suspense", "client_credit"]),
  returnedChequeFeeMinor: nonNegInt,
  /** none: a receipt counts as soon as it is recorded. required: a DIFFERENT person must approve it first (maker-checker). */
  receiptApproval: z.enum(["none", "required"]),
  policyPriority: z.array(z.string().min(1)).max(100),
  productTypePriority: z.array(z.string().min(1)).max(20),
});
export const financeSlice = financeBase;

/** What a tenant may set on top of its region pack: any subset of any slice. */
const securityBase = z.strictObject({
  /** optional: anyone may turn two-step verification on. required: staff cannot use the system until they have. */
  mfa: z.enum(["optional", "required"]),
});
export const securitySlice = securityBase;

export const overridesSchema = z.strictObject({
  regional: regionalBase.partial().optional(),
  tax: taxBase.partial().optional(),
  localization: localizationBase.partial().optional(),
  brand: brandBase.partial().optional(),
  entitlements: z.strictObject({ modules: entitlementsBase.shape.modules, limits: limitsBase.partial() }).partial().optional(),
  finance: financeBase.partial().optional(),
  security: securityBase.partial().optional(),
});
export type ConfigOverrides = z.infer<typeof overridesSchema>;

export const resolvedSlices = z.strictObject({
  regional: regionalSlice,
  tax: taxSlice,
  localization: localizationSlice,
  brand: brandSlice,
  entitlements: entitlementsSlice,
  finance: financeSlice,
  security: securitySlice,
});
export type ResolvedSlices = z.infer<typeof resolvedSlices>;

export interface EffectiveTenantConfig extends ResolvedSlices {
  readonly tenantId: string;
  readonly versionId: string;
  readonly version: number;
  readonly regionPack: string;
  /** Instant (UTC, ISO 8601) from which this version applies. */
  readonly effectiveFrom: string;
  /** Content hash of the resolved slices: equal hash == identical behaviour. */
  readonly hash: string;
}
