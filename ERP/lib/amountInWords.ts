// ---------------------------------------------------------------------------
// "Kenya Shillings One Hundred and Twenty Thousand and Fifty Cents Only" — the
// words line printed on a receipt so the figure cannot be quietly altered.
//
// Works from integer minor units (never a float) and the currency's own number of
// decimal places, so a yen amount has no "cents" and a dinar amount has fils.
// British style: "and" before the last two digits of a group and before a final
// group that is under a hundred.
// ---------------------------------------------------------------------------
import { minorExponent } from "./money";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion", "Quadrillion"];

interface Names { major: [string, string]; minor: [string, string] }
const NAMES: Record<string, Names> = {
  KES: { major: ["Kenya Shilling", "Kenya Shillings"], minor: ["Cent", "Cents"] },
  USD: { major: ["US Dollar", "US Dollars"], minor: ["Cent", "Cents"] },
  EUR: { major: ["Euro", "Euros"], minor: ["Cent", "Cents"] },
  GBP: { major: ["Pound Sterling", "Pounds Sterling"], minor: ["Penny", "Pence"] },
  UGX: { major: ["Uganda Shilling", "Uganda Shillings"], minor: ["Cent", "Cents"] },
  TZS: { major: ["Tanzania Shilling", "Tanzania Shillings"], minor: ["Cent", "Cents"] },
};

function belowThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    const words = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
    parts.push(hundreds ? `and ${words}` : words);
  }
  return parts.join(" ");
}

/** A whole number in words ("One Thousand and Fifty"). */
export function integerInWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("a non-negative whole number is needed");
  if (n === 0) return "Zero";
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const words = belowThousand(groups[i]);
    // a last group under a hundred, after bigger groups, is joined with "and": "One Thousand and Fifty"
    const joiner = i === 0 && out.length > 0 && groups[i] < 100 ? "and " : "";
    out.push(`${joiner}${words}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return out.join(" ");
}

export function amountInWords(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError("amount must be a whole number of minor units");
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const exp = minorExponent(currency);
  const unit = 10 ** exp;
  const major = Math.floor(abs / unit);
  const fraction = abs % unit;
  const names = NAMES[currency] ?? { major: [currency, currency], minor: ["minor unit", "minor units"] };
  const label = (n: number, pair: [string, string]) => (n === 1 ? pair[0] : pair[1]);

  const parts: string[] = [];
  if (major > 0 || fraction === 0) parts.push(`${label(major, names.major)} ${integerInWords(major)}`);
  if (fraction > 0) parts.push(`${major > 0 ? "and " : ""}${integerInWords(fraction)} ${label(fraction, names.minor)}`);
  return `${negative ? "Minus " : ""}${parts.join(" ")} Only`;
}
