import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { describeChanges, diffOverrides, mergeOverrides } from "../../src/configForm";
import { REGION_PACKS } from "../../lib/config/packs";
import { resolveConfig } from "../../lib/config/resolve";

describe("settings editor: merge and diff", () => {
  const pack = REGION_PACKS.KE;

  it("merges overrides onto a pack the same way the server does", () => {
    const overrides = { brand: { displayName: "Acme Brokers" }, finance: { feesFirst: false }, tax: { taxes: [] } };
    const mine = mergeOverrides(pack, overrides);
    const server = resolveConfig("KE", overrides);
    expect("issues" in server).toBe(false);
    expect(mine).toEqual((server as { slices: unknown }).slices);
  });

  it("an untouched form produces no overrides at all", () => {
    expect(diffOverrides(pack, structuredClone(pack))).toEqual({});
  });

  it("stores only what the person changed", () => {
    const edited = structuredClone(pack);
    edited.brand.displayName = "Acme";
    edited.finance.returnedChequeFeeMinor = 150000;
    expect(diffOverrides(pack, edited)).toEqual({ brand: { displayName: "Acme" }, finance: { returnedChequeFeeMinor: 150000 } });
  });

  it("replaces a changed list wholesale rather than patching it", () => {
    const edited = structuredClone(pack);
    edited.tax.taxes = edited.tax.taxes.slice(0, 1);
    expect(diffOverrides(pack, edited)).toEqual({ tax: { taxes: edited.tax.taxes } });
  });

  it("round-trips: merge(pack, diff(pack, x)) == x", () => {
    fc.assert(fc.property(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        fee: fc.integer({ min: 0, max: 5_000_000 }),
        fees: fc.boolean(),
        mods: fc.subarray(["finance", "claims", "portal", "analytics", "commissions"], { minLength: 1 }),
        taxes: fc.option(fc.constant([]), { nil: undefined }),
      }),
      (v) => {
        const edited = structuredClone(pack);
        edited.brand.displayName = v.name;
        edited.finance.returnedChequeFeeMinor = v.fee;
        edited.finance.feesFirst = v.fees;
        edited.entitlements.modules = v.mods as typeof edited.entitlements.modules;
        if (v.taxes) edited.tax.taxes = v.taxes;
        expect(mergeOverrides(pack, diffOverrides(pack, edited))).toEqual(edited);
      },
    ));
  });

  it("describes changes for review before publishing", () => {
    const edited = structuredClone(pack);
    edited.brand.primaryColor = "#123456";
    edited.finance.feesFirst = false;
    expect(describeChanges(pack, edited)).toEqual([
      { path: "brand.primaryColor", before: pack.brand.primaryColor, after: "#123456" },
      { path: "finance.feesFirst", before: "true", after: "false" },
    ]);
    expect(describeChanges(pack, pack)).toEqual([]);
  });
});
