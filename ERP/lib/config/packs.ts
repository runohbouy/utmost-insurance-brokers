// ---------------------------------------------------------------------------
// Region packs: complete, ready-to-publish baselines for a jurisdiction. A
// tenant picks one and overrides only what differs (its brand, its fee, its
// module list). Packs hold statutory facts, not business choices — so when a
// levy rate changes, it changes here once and tenants pick it up on their next
// publish rather than each carrying a stale copy.
// ---------------------------------------------------------------------------
import type { ResolvedSlices } from "./schema";

const brandBase = {
  displayName: "Insurance Brokers",
  primaryColor: "#0b5c3b",
  onPrimaryColor: "#ffffff",
  accentColor: "#8a5a00",
  surfaceColor: "#ffffff",
  textColor: "#1a1a1a",
  fontFamily: "Inter, Arial, sans-serif",
} as const;

const financeBase = {
  allocationStrategy: "fifo",
  feesFirst: true,
  overpaymentTreatment: "suspense",
  returnedChequeFeeMinor: 0,
  receiptApproval: "none",
  policyPriority: [],
  productTypePriority: [],
} as const;

const entitlementsBase = {
  modules: ["finance", "claims", "portal", "analytics", "commissions"],
  limits: { staffSeats: 50, portalUsers: 5000 },
} as const;

const securityBase = { mfa: "optional" } as const;

export const REGION_PACKS: Record<string, ResolvedSlices> = {
  // Kenya — IRA-regulated brokerage. Levies are charged on top of the premium.
  KE: {
    regional: { countryCode: "KE", currency: "KES", timeZone: "Africa/Nairobi", fiscalYearStartMonth: 1, weekStartsOn: 1 },
    tax: {
      pricing: "exclusive",
      rounding: "half_up",
      taxes: [
        { code: "pcf", name: "Policyholders Compensation Fund levy", kind: "percent", rateBps: 25 },
        { code: "itl", name: "Insurance Training Levy", kind: "percent", rateBps: 20 },
        { code: "stamp_duty", name: "Stamp duty", kind: "flat", flatMinor: 4000 },
      ],
    },
    localization: { locale: "en-KE", dateFormat: "dd/MM/yyyy" },
    brand: { ...brandBase },
    entitlements: { modules: [...entitlementsBase.modules], limits: { ...entitlementsBase.limits } },
    finance: { ...financeBase, policyPriority: [], productTypePriority: [] },
    security: { ...securityBase },
  },
  // Germany (EU) — insurance premium tax is part of the price the customer sees.
  DE: {
    regional: { countryCode: "DE", currency: "EUR", timeZone: "Europe/Berlin", fiscalYearStartMonth: 1, weekStartsOn: 1 },
    tax: {
      pricing: "inclusive",
      rounding: "half_even",
      taxes: [{ code: "insurance_tax", name: "Versicherungsteuer", kind: "percent", rateBps: 1900 }],
    },
    localization: { locale: "de-DE", dateFormat: "dd.MM.yyyy" },
    brand: { ...brandBase },
    entitlements: { modules: [...entitlementsBase.modules], limits: { ...entitlementsBase.limits } },
    finance: { ...financeBase, policyPriority: [], productTypePriority: [] },
    security: { ...securityBase },
  },
  // United States — premium taxes are borne by the carrier, so none are itemised.
  US: {
    regional: { countryCode: "US", currency: "USD", timeZone: "UTC", fiscalYearStartMonth: 1, weekStartsOn: 0 },
    tax: { pricing: "exclusive", rounding: "half_up", taxes: [] },
    localization: { locale: "en-US", dateFormat: "MM/dd/yyyy" },
    brand: { ...brandBase },
    entitlements: { modules: [...entitlementsBase.modules], limits: { ...entitlementsBase.limits } },
    finance: { ...financeBase, policyPriority: [], productTypePriority: [] },
    security: { ...securityBase },
  },
};

export const REGION_PACK_CODES = Object.keys(REGION_PACKS);
