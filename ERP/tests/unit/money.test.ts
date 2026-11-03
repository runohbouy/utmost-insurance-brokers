import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CurrencyMismatchError, Money, minorExponent, roundDiv, sumMoney } from "../../lib/money";

const kes = (n: number) => Money.of(n, "KES");

describe("Money construction", () => {
  it("rejects fractional and unsafe amounts", () => {
    expect(() => Money.of(1.5, "KES")).toThrow(RangeError);
    expect(() => Money.of(Number.MAX_SAFE_INTEGER + 2, "KES")).toThrow(RangeError);
    expect(() => Money.of(NaN, "KES")).toThrow(RangeError);
  });

  it("rejects malformed currency codes", () => {
    expect(() => Money.of(1, "kes")).toThrow(RangeError);
    expect(() => Money.of(1, "KESS")).toThrow(RangeError);
  });

  it("normalises negative zero", () => {
    expect(Object.is(Money.of(-0, "KES").minor, 0)).toBe(true);
  });

  it("reads minor-unit exponents per currency", () => {
    expect(minorExponent("KES")).toBe(2);
    expect(minorExponent("JPY")).toBe(0);
    expect(minorExponent("KWD")).toBe(3);
  });

  it("parses major-unit text exactly", () => {
    expect(Money.fromMajor("1234.5", "KES").minor).toBe(123450);
    expect(Money.fromMajor("0.07", "USD").minor).toBe(7);
    expect(Money.fromMajor("-12.30", "EUR").minor).toBe(-1230);
    expect(Money.fromMajor("500", "JPY").minor).toBe(500);
  });

  it("refuses precision the currency cannot hold", () => {
    expect(() => Money.fromMajor("1.005", "KES")).toThrow(RangeError);
    expect(() => Money.fromMajor("1.5", "JPY")).toThrow(RangeError);
    expect(Money.fromMajor("1.500", "KES").minor).toBe(150); // trailing zeros are fine
  });

  it("round-trips through major text", () => {
    expect(kes(123450).toMajorString()).toBe("1234.50");
    expect(kes(-5).toMajorString()).toBe("-0.05");
    expect(Money.of(500, "JPY").toMajorString()).toBe("500");
  });
});

describe("Money arithmetic", () => {
  it("adds, subtracts and compares same-currency amounts", () => {
    expect(kes(7000000).sub(kes(2000000)).minor).toBe(5000000);
    expect(kes(5).compare(kes(9))).toBe(-1);
    expect(kes(5).max(kes(9)).minor).toBe(9);
  });

  it("refuses to mix currencies", () => {
    expect(() => kes(1).add(Money.of(1, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => kes(1).compare(Money.of(1, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("rounds ratios as asked", () => {
    expect(kes(5).mulRatio(1, 2, "half_up").minor).toBe(3);
    expect(kes(5).mulRatio(1, 2, "half_even").minor).toBe(2);
    expect(kes(7).mulRatio(1, 2, "half_even").minor).toBe(4);
    expect(kes(5).mulRatio(1, 2, "down").minor).toBe(2);
    expect(kes(-5).mulRatio(1, 2, "half_up").minor).toBe(-3);
  });

  it("computes 16% of an amount without float drift", () => {
    // 0.16 as a float is inexact; as 16/100 it is exact
    expect(kes(1000000).mulRatio(16, 100, "half_up").minor).toBe(160000);
    expect(kes(33).mulRatio(16, 100, "half_up").minor).toBe(5);
  });

  it("sums an empty list to zero in the stated currency", () => {
    expect(sumMoney([], "EUR").equals(Money.zero("EUR"))).toBe(true);
  });

  it("roundDiv rejects a non-positive divisor", () => {
    expect(() => roundDiv(1n, 0n, "down")).toThrow(RangeError);
  });
});

describe("Money.allocate", () => {
  it("splits proportionally and conserves the total", () => {
    const parts = kes(10000).allocate([1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([3334, 3333, 3333]);
  });

  it("gives the remainder to the largest fractional part, earliest on ties", () => {
    expect(kes(5).allocate([1, 1]).map((p) => p.minor)).toEqual([3, 2]);
    expect(kes(100).allocate([70, 30]).map((p) => p.minor)).toEqual([70, 30]);
  });

  it("handles zero weights and negative amounts", () => {
    expect(kes(10).allocate([0, 1]).map((p) => p.minor)).toEqual([0, 10]);
    expect(kes(-5).allocate([1, 1]).map((p) => p.minor)).toEqual([-3, -2]);
  });

  it("rejects bad weights", () => {
    expect(() => kes(1).allocate([])).toThrow(RangeError);
    expect(() => kes(1).allocate([0, 0])).toThrow(RangeError);
    expect(() => kes(1).allocate([-1, 2])).toThrow(RangeError);
    expect(() => kes(1).allocate([1.5])).toThrow(RangeError);
  });
});

describe("Money properties", () => {
  const amount = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
  const weights = fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 12 }).filter((w) => w.some((x) => x > 0));

  it("allocation always conserves the total", () => {
    fc.assert(
      fc.property(amount, weights, (a, w) => {
        const parts = kes(a).allocate(w);
        expect(parts).toHaveLength(w.length);
        expect(sumMoney(parts, "KES").minor).toBe(a);
      }),
    );
  });

  it("allocation never gives a part more than one minor unit away from its exact share", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), weights, (a, w) => {
        const total = w.reduce((s, x) => s + x, 0);
        kes(a).allocate(w).forEach((p, i) => {
          const exact = (a * w[i]) / total;
          expect(Math.abs(p.minor - exact)).toBeLessThan(1);
        });
      }),
    );
  });

  it("allocation is deterministic and zero weights get nothing", () => {
    fc.assert(
      fc.property(amount, weights, (a, w) => {
        const x = kes(a).allocate(w).map((p) => p.minor);
        const y = kes(a).allocate(w).map((p) => p.minor);
        expect(x).toEqual(y);
        w.forEach((wt, i) => { if (wt === 0) expect(x[i]).toBe(0); });
      }),
    );
  });

  it("addition is commutative and associative; subtraction inverts it", () => {
    fc.assert(
      fc.property(amount, amount, amount, (a, b, c) => {
        expect(kes(a).add(kes(b)).equals(kes(b).add(kes(a)))).toBe(true);
        expect(kes(a).add(kes(b)).add(kes(c)).equals(kes(a).add(kes(b).add(kes(c))))).toBe(true);
        expect(kes(a).add(kes(b)).sub(kes(b)).equals(kes(a))).toBe(true);
      }),
    );
  });

  it("major-unit text round-trips for every currency exponent", () => {
    fc.assert(
      fc.property(amount, fc.constantFrom("KES", "USD", "EUR", "JPY", "KWD"), (a, cur) => {
        const m = Money.of(a, cur);
        expect(Money.fromMajor(m.toMajorString(), cur).equals(m)).toBe(true);
      }),
    );
  });

  it("rounded ratios stay within half a unit of the exact value", () => {
    fc.assert(
      fc.property(amount, fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 1, max: 1000 }), (a, n, d) => {
        const r = kes(a).mulRatio(n, d, "half_up").minor;
        expect(Math.abs(r - (a * n) / d)).toBeLessThanOrEqual(0.5 + 1e-9);
      }),
    );
  });
});
