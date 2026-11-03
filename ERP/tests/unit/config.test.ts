import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Money } from "../../lib/money";
import { localDate } from "../../lib/time";
import { REGION_PACKS, REGION_PACK_CODES } from "../../lib/config/packs";
import { canonicalJson, deepFreeze, hashSlices, resolveConfig } from "../../lib/config/resolve";
import { contrastRatio } from "../../lib/config/contrast";
import { priceInvoice } from "../../lib/finance/tax";

const resolved = (pack: string, overrides: unknown = {}) => {
  const r = resolveConfig(pack, overrides);
  if ("issues" in r) throw new Error(JSON.stringify(r.issues));
  return r.slices;
};

describe("layered resolution", () => {
  it("every shipped region pack is complete and valid on its own", () => {
    for (const code of REGION_PACK_CODES) expect(resolveConfig(code, {}).ok, code).toBe(true);
  });

  it("applies tenant overrides over the pack, slice by slice and key by key", () => {
    const c = resolved("KE", { brand: { displayName: "Utmost Insurance Brokers" }, finance: { returnedChequeFeeMinor: 150_000 } });
    expect(c.brand.displayName).toBe("Utmost Insurance Brokers");
    expect(c.brand.primaryColor).toBe(REGION_PACKS.KE.brand.primaryColor); // untouched keys keep the pack's value
    expect(c.finance.returnedChequeFeeMinor).toBe(150_000);
    expect(c.regional.currency).toBe("KES");
  });

  it("replaces arrays wholesale instead of merging them", () => {
    const c = resolved("KE", { tax: { taxes: [{ code: "pcf", name: "PCF", kind: "percent", rateBps: 30 }] } });
    expect(c.tax.taxes).toHaveLength(1);
    expect(c.tax.taxes[0]).toMatchObject({ code: "pcf", rateBps: 30 });
  });

  it("does not mutate the pack", () => {
    const before = canonicalJson(REGION_PACKS.KE);
    resolved("KE", { brand: { displayName: "X" }, tax: { taxes: [] } });
    expect(canonicalJson(REGION_PACKS.KE)).toBe(before);
  });

  it("hashes identical content identically, whatever the key order", () => {
    const a = resolved("KE", { finance: { feesFirst: false } });
    const reordered = JSON.parse(JSON.stringify(a), (_k, v) => v);
    expect(hashSlices(reordered)).toBe(hashSlices(a));
    expect(hashSlices(resolved("KE", { finance: { feesFirst: true } }))).not.toBe(hashSlices(a));
  });

  it("freezes a published snapshot deeply", () => {
    const snap = deepFreeze(structuredClone(resolved("KE")));
    expect(() => { (snap.brand as { displayName: string }).displayName = "Hacked"; }).toThrow(TypeError);
    expect(() => { snap.tax.taxes.push({ code: "x", name: "x", kind: "flat", flatMinor: 1 }); }).toThrow(TypeError);
  });
});

describe("validation: nothing half-configured becomes effective", () => {
  const issuesFor = (pack: string, overrides: unknown) => {
    const r = resolveConfig(pack, overrides);
    if (!("issues" in r)) throw new Error("expected resolution to fail");
    return r.issues;
  };

  it("rejects an unknown region pack", () => {
    expect(issuesFor("ZZ", {})[0].message).toMatch(/unknown region pack/);
  });

  it("rejects unknown keys instead of ignoring them", () => {
    expect(issuesFor("KE", { brand: { colour: "#000000" } }).length).toBeGreaterThan(0);
    expect(issuesFor("KE", { extras: {} }).length).toBeGreaterThan(0);
  });

  it("rejects an invalid time zone, currency or locale", () => {
    expect(issuesFor("KE", { regional: { timeZone: "Mars/Base" } })[0].path).toBe("regional.timeZone");
    expect(issuesFor("KE", { regional: { currency: "XXQ1" } })[0].path).toBe("regional.currency");
    expect(issuesFor("KE", { localization: { locale: "not a locale" } })[0].path).toBe("localization.locale");
  });

  it("rejects brand colours that fail WCAG 2.1 AA contrast", () => {
    const issues = issuesFor("KE", { brand: { primaryColor: "#f5f5f5", onPrimaryColor: "#ffffff" } });
    expect(issues.some((i) => i.path === "brand.onPrimaryColor" && /4\.5:1/.test(i.message))).toBe(true);
  });

  it("reports every problem at once", () => {
    const issues = issuesFor("KE", { regional: { timeZone: "Nope" }, brand: { primaryColor: "red" }, finance: { returnedChequeFeeMinor: -5 } });
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects contradictory tax setups", () => {
    expect(issuesFor("KE", { tax: { taxes: [{ code: "a1", name: "A", kind: "percent", rateBps: 1 }, { code: "a1", name: "B", kind: "percent", rateBps: 2 }] } })
      .some((i) => /duplicate tax code/.test(i.message))).toBe(true);
    expect(issuesFor("KE", { tax: { pricing: "inclusive" } }).some((i) => /flat taxes/.test(i.message))).toBe(true);
  });

  it("rejects entitlements that depend on a module the tenant lacks", () => {
    expect(issuesFor("KE", { entitlements: { modules: ["portal"] } }).some((i) => /needs the finance module/.test(i.message))).toBe(true);
    expect(issuesFor("KE", { entitlements: { modules: ["finance", "finance"] } }).length).toBeGreaterThan(0);
  });
});

describe("WCAG contrast", () => {
  it("matches the published reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThan(4.5); // the classic AA-passing grey
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.6);
  });

  it("is symmetric", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffff }), fc.integer({ min: 0, max: 0xffffff }), (a, b) => {
      const hx = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
      expect(contrastRatio(hx(a), hx(b))).toBeCloseTo(contrastRatio(hx(b), hx(a)), 10);
    }));
  });
});

// The configuration matrix: the same engine, three jurisdictions, no code changes.
describe("configuration matrix", () => {
  const matrix = [
    { pack: "KE", currency: "KES", zone: "Africa/Nairobi", pricing: "exclusive" },
    { pack: "DE", currency: "EUR", zone: "Europe/Berlin", pricing: "inclusive" },
    { pack: "US", currency: "USD", zone: "UTC", pricing: "exclusive" },
  ] as const;

  it.each(matrix)("$pack resolves to $currency / $zone / tax-$pricing", ({ pack, currency, zone, pricing }) => {
    const c = resolved(pack);
    expect([c.regional.currency, c.regional.timeZone, c.tax.pricing]).toEqual([currency, zone, pricing]);
  });

  it("KE adds levies on top of the net premium", () => {
    const b = priceInvoice(Money.of(10_000_000, "KES"), resolved("KE").tax); // KES 100,000.00
    expect(Object.fromEntries(b.taxes.map((t) => [t.code, t.amount.minor]))).toEqual({ pcf: 25_000, itl: 20_000, stamp_duty: 4_000 });
    expect(b.net.minor).toBe(10_000_000);
    expect(b.gross.minor).toBe(10_049_000);
  });

  it("DE carves 19% insurance tax out of the gross price", () => {
    const b = priceInvoice(Money.of(11_900, "EUR"), resolved("DE").tax); // EUR 119.00 all-in
    expect(b.gross.minor).toBe(11_900);
    expect(b.net.minor).toBe(10_000);
    expect(b.taxes[0].amount.minor).toBe(1_900);
  });

  it("US itemises no tax", () => {
    const b = priceInvoice(Money.of(250_000, "USD"), resolved("US").tax);
    expect(b.taxes).toEqual([]);
    expect(b.gross.minor).toBe(250_000);
  });

  it("the same instant is a different business day per tenant zone", () => {
    const instant = new Date("2026-06-30T22:30:00Z");
    expect(matrix.map((m) => localDate(instant, m.zone))).toEqual(["2026-07-01", "2026-07-01", "2026-06-30"]);
  });

  it("property: net + taxes == gross for any premium in every pack", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), fc.constantFrom(...matrix), (minor, m) => {
      const b = priceInvoice(Money.of(minor, m.currency), resolved(m.pack).tax);
      const taxTotal = b.taxes.reduce((s, t) => s + t.amount.minor, 0);
      expect(b.net.minor + taxTotal).toBe(b.gross.minor);
      expect(b.taxes.every((t) => t.amount.minor >= 0)).toBe(true);
      if (m.pricing === "inclusive") expect(b.gross.minor).toBe(minor); else expect(b.net.minor).toBe(minor);
    }));
  });
});
