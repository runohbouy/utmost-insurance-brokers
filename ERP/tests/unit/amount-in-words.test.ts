import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { amountInWords, integerInWords } from "../../lib/amountInWords";

describe("whole numbers", () => {
  it.each([
    [0, "Zero"], [7, "Seven"], [13, "Thirteen"], [20, "Twenty"], [21, "Twenty-One"], [99, "Ninety-Nine"],
    [100, "One Hundred"], [101, "One Hundred and One"], [110, "One Hundred and Ten"], [999, "Nine Hundred and Ninety-Nine"],
    [1000, "One Thousand"], [1050, "One Thousand and Fifty"], [1100, "One Thousand One Hundred"], [1101, "One Thousand One Hundred and One"],
    [120_000, "One Hundred and Twenty Thousand"], [100_500, "One Hundred Thousand Five Hundred"],
    [1_000_000, "One Million"], [2_000_015, "Two Million and Fifteen"], [3_456_789, "Three Million Four Hundred and Fifty-Six Thousand Seven Hundred and Eighty-Nine"],
    [1_000_000_000, "One Billion"],
  ])("%d is %s", (n, words) => expect(integerInWords(n)).toBe(words));

  it("refuses negatives and fractions", () => {
    expect(() => integerInWords(-1)).toThrow(RangeError);
    expect(() => integerInWords(1.5)).toThrow(RangeError);
  });

  it("property: always words only, single-spaced, no leading or trailing space", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (n) => {
      const w = integerInWords(n);
      expect(w).toMatch(/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/);
      expect(w).not.toMatch(/ {2}|^ | $/);
    }));
  });
});

describe("money", () => {
  it("writes a Kenya shilling amount with cents", () => {
    expect(amountInWords(12_000_050, "KES")).toBe("Kenya Shillings One Hundred and Twenty Thousand and Fifty Cents Only");
  });
  it("writes whole amounts without a cents clause", () => {
    expect(amountInWords(7_000_000, "KES")).toBe("Kenya Shillings Seventy Thousand Only");
  });
  it("uses the singular for one", () => {
    expect(amountInWords(100, "KES")).toBe("Kenya Shilling One Only");
    expect(amountInWords(101, "KES")).toBe("Kenya Shilling One and One Cent Only");
  });
  it("handles amounts under one unit and zero", () => {
    expect(amountInWords(45, "KES")).toBe("Forty-Five Cents Only");
    expect(amountInWords(0, "KES")).toBe("Kenya Shillings Zero Only");
  });
  it("respects each currency's decimal places", () => {
    expect(amountInWords(500, "JPY")).toBe("JPY Five Hundred Only"); // no minor unit at all
    expect(amountInWords(11_900, "EUR")).toBe("Euros One Hundred and Nineteen Only");
    expect(amountInWords(1, "USD")).toBe("One Cent Only");
  });
  it("marks a negative amount", () => {
    expect(amountInWords(-5_000, "KES")).toBe("Minus Kenya Shillings Fifty Only");
  });
  it("rejects fractional minor units", () => {
    expect(() => amountInWords(1.5, "KES")).toThrow(RangeError);
  });
});
