// ---------------------------------------------------------------------------
// Turns a premium into invoice lines using a tenant's tax slice.
//
//   exclusive  the amount given is the NET premium; taxes are added on top.
//   inclusive  the amount given is the GROSS the customer pays; taxes are carved
//              out of it, so  net + taxes == gross  always holds exactly.
// ---------------------------------------------------------------------------
import { Money, roundDiv } from "../money";
import type { ResolvedSlices } from "../config/schema";

export interface TaxLine { code: string; name: string; amount: Money }
export interface PremiumBreakdown { net: Money; taxes: TaxLine[]; gross: Money }

export function priceInvoice(amount: Money, tax: ResolvedSlices["tax"]): PremiumBreakdown {
  if (amount.isNegative()) throw new RangeError("premium cannot be negative");
  const currency = amount.currency;

  if (tax.pricing === "exclusive") {
    const taxes = tax.taxes.map<TaxLine>((t) => ({
      code: t.code,
      name: t.name,
      amount: t.kind === "percent" ? amount.mulRatio(t.rateBps, 10_000, tax.rounding) : Money.of(t.flatMinor, currency),
    }));
    const totalTax = taxes.reduce((s, t) => s.add(t.amount), Money.zero(currency));
    return { net: amount, taxes, gross: amount.add(totalTax) };
  }

  // inclusive: only percentage taxes are permitted by the schema
  const percent = tax.taxes.flatMap((t) => (t.kind === "percent" ? [t] : []));
  const combinedBps = percent.reduce((s, t) => s + t.rateBps, 0);
  if (combinedBps === 0) return { net: amount, taxes: percent.map((t) => ({ code: t.code, name: t.name, amount: Money.zero(currency) })), gross: amount };

  const net = Money.of(Number(roundDiv(BigInt(amount.minor) * 10_000n, BigInt(10_000 + combinedBps), tax.rounding)), currency);
  const totalTax = amount.sub(net);
  const shares = totalTax.allocate(percent.map((t) => t.rateBps));
  return { net, taxes: percent.map((t, i) => ({ code: t.code, name: t.name, amount: shares[i] })), gross: amount };
}
