// ---------------------------------------------------------------------------
// Money: an integer count of a currency's minor units (cents, shillings-cents…)
// plus its ISO 4217 code. Never a float, never a bare number.
//
//  * Arithmetic is exact. Only same-currency amounts combine; mixing throws.
//  * Anything that divides (ratios, splitting) says HOW it rounds, and splitting
//    (allocate) always sums back to the original to the last minor unit.
//  * Text formatting (format) is for the edge — UI, documents, API display fields.
//    Nothing in the domain ever parses or computes from formatted text.
// ---------------------------------------------------------------------------

export type RoundingMode = "half_up" | "half_even" | "down";

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} with ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

const CURRENCY = /^[A-Z]{3}$/;

// Minor-unit exponent per ISO 4217 (KES 2, JPY 0, KWD 3 …) from the platform's own CLDR data.
const exponentCache = new Map<string, number>();
export function minorExponent(currency: string): number {
  let e = exponentCache.get(currency);
  if (e === undefined) {
    e = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    exponentCache.set(currency, e);
  }
  return e;
}

/** Integer division of bigints with explicit rounding (n / d, d > 0). */
export function roundDiv(n: bigint, d: bigint, mode: RoundingMode): bigint {
  if (d <= 0n) throw new RangeError("divisor must be positive");
  const neg = n < 0n;
  const abs = neg ? -n : n;
  let q = abs / d;
  const r = abs % d;
  if (mode !== "down" && r !== 0n) {
    const twice = r * 2n;
    if (twice > d) q += 1n;
    else if (twice === d) {
      // exact tie: half_up rounds away from zero, half_even to the even neighbour
      if (mode === "half_up" || q % 2n === 1n) q += 1n;
    }
  }
  return neg ? -q : q;
}

export class Money {
  private constructor(readonly minor: number, readonly currency: string) {}

  static of(minor: number, currency: string): Money {
    if (!Number.isSafeInteger(minor)) throw new RangeError(`Money minor units must be a safe integer, got ${minor}`);
    if (!CURRENCY.test(currency)) throw new RangeError(`Invalid ISO 4217 currency code: ${currency}`);
    return new Money(minor === 0 ? 0 : minor, currency); // normalises -0
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  /** From a decimal amount in major units, parsed exactly from text ("1234.5" → 123450 KES-minor). */
  static fromMajor(major: string | number, currency: string): Money {
    const exp = minorExponent(currency);
    const text = typeof major === "number" ? major.toFixed(exp + 2) : major.trim();
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!m) throw new RangeError(`Not a decimal amount: ${major}`);
    const [, sign, whole, frac = ""] = m;
    if (frac.length > exp && /[1-9]/.test(frac.slice(exp))) {
      throw new RangeError(`${major} has more than ${exp} decimal places for ${currency}`);
    }
    const minor = BigInt(whole + frac.slice(0, exp).padEnd(exp, "0"));
    return Money.of(Number(sign ? -minor : minor), currency);
  }

  add(o: Money): Money { this.same(o); return Money.of(this.minor + o.minor, this.currency); }
  sub(o: Money): Money { this.same(o); return Money.of(this.minor - o.minor, this.currency); }
  neg(): Money { return Money.of(-this.minor, this.currency); }
  abs(): Money { return Money.of(Math.abs(this.minor), this.currency); }
  isZero(): boolean { return this.minor === 0; }
  isPositive(): boolean { return this.minor > 0; }
  isNegative(): boolean { return this.minor < 0; }
  equals(o: Money): boolean { return this.currency === o.currency && this.minor === o.minor; }
  compare(o: Money): number { this.same(o); return Math.sign(this.minor - o.minor); }
  min(o: Money): Money { return this.compare(o) <= 0 ? this : o; }
  max(o: Money): Money { return this.compare(o) >= 0 ? this : o; }

  /** this × numerator ÷ denominator, rounded as requested. */
  mulRatio(numerator: number, denominator: number, mode: RoundingMode): Money {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
      throw new RangeError("ratio parts must be integers with a positive denominator");
    }
    const q = roundDiv(BigInt(this.minor) * BigInt(numerator), BigInt(denominator), mode);
    return Money.of(Number(q), this.currency);
  }

  /**
   * Splits this amount in proportion to integer weights using the largest-remainder method:
   * the parts always sum to exactly this amount, ties break toward the earlier weight, and
   * the same inputs always give the same output.
   */
  allocate(weights: number[]): Money[] {
    if (weights.length === 0) throw new RangeError("need at least one weight");
    if (weights.some((w) => !Number.isInteger(w) || w < 0)) throw new RangeError("weights must be non-negative integers");
    const total = weights.reduce((s, w) => s + BigInt(w), 0n);
    if (total === 0n) throw new RangeError("weights sum to zero");

    const amount = BigInt(Math.abs(this.minor));
    const sign = this.minor < 0 ? -1 : 1;
    const shares = weights.map((w) => (amount * BigInt(w)) / total);
    let left = Number(amount - shares.reduce((s, x) => s + x, 0n));

    const order = weights
      .map((w, i) => ({ i, rem: (amount * BigInt(w)) % total }))
      .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
    for (let k = 0; left > 0 && k < order.length; k++, left--) shares[order[k].i] += 1n;

    return shares.map((s) => Money.of(sign * Number(s), this.currency));
  }

  /** Decimal text in major units ("1234.50"). For storage interchange and display only. */
  toMajorString(): string {
    const exp = minorExponent(this.currency);
    const abs = BigInt(Math.abs(this.minor));
    const unit = 10n ** BigInt(exp);
    const whole = abs / unit;
    const frac = exp === 0 ? "" : "." + (abs % unit).toString().padStart(exp, "0");
    return `${this.minor < 0 ? "-" : ""}${whole}${frac}`;
  }

  /** Locale formatting — call at the boundary (API display fields, documents, UI), nowhere else. */
  format(locale: string): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency: this.currency }).format(Number(this.toMajorString()));
  }

  toJSON(): { amountMinor: number; currency: string } {
    return { amountMinor: this.minor, currency: this.currency };
  }

  private same(o: Money) {
    if (o.currency !== this.currency) throw new CurrencyMismatchError(this.currency, o.currency);
  }
}

/** Sum a list of same-currency amounts (an empty list needs the currency stated). */
export function sumMoney(values: Money[], currency: string): Money {
  return values.reduce((acc, v) => acc.add(v), Money.zero(currency));
}
