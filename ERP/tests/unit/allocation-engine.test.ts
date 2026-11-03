import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Money, sumMoney } from "../../lib/money";
import { allocate, AllocationError, ALLOCATION_STRATEGIES, type AllocationStrategy, type OpenInvoice } from "../../lib/finance/allocation-engine";

const kes = (major: number) => Money.of(major * 100, "KES");

function invoice(id: string, net: number, opts: Partial<OpenInvoice> & { tax?: number; fee?: number } = {}): OpenInvoice {
  const lines: OpenInvoice["lines"] = [{ id: `${id}-net`, kind: "net", outstanding: kes(net) }];
  if (opts.tax) lines.push({ id: `${id}-tax`, kind: "tax", outstanding: kes(opts.tax) });
  if (opts.fee) lines.push({ id: `${id}-fee`, kind: "fee", outstanding: kes(opts.fee) });
  return { id, kind: "premium", policyId: `pol-${id}`, productType: "motor", issueDate: "2026-01-01", dueDate: "2026-02-01", ...opts, lines };
}

const paidOn = (r: ReturnType<typeof allocate>, id: string) => r.allocations.find((a) => a.invoiceId === id)?.amount.minor ?? 0;

describe("allocation engine — the acceptance scenario", () => {
  // Three policies totalling KES 120,000 and a KES 70,000 cheque.
  const invoices = [
    invoice("a", 50_000, { dueDate: "2026-02-01" }),
    invoice("b", 40_000, { dueDate: "2026-02-10" }),
    invoice("c", 30_000, { dueDate: "2026-02-20" }),
  ];

  it("FIFO pays the oldest in full, part-pays the next, and leaves 50,000 outstanding", () => {
    const r = allocate({ available: kes(70_000), invoices, strategy: "fifo" });
    expect(paidOn(r, "a")).toBe(kes(50_000).minor);
    expect(paidOn(r, "b")).toBe(kes(20_000).minor);
    expect(paidOn(r, "c")).toBe(0);
    expect(r.remainder.isZero()).toBe(true);
    expect(r.stillOutstanding.minor).toBe(kes(50_000).minor);
  });

  it("once the money is taken back, everything owed is 120,000 again", () => {
    const r = allocate({ available: kes(0), invoices, strategy: "fifo" });
    expect(r.allocations).toHaveLength(0);
    expect(r.stillOutstanding.minor).toBe(kes(120_000).minor);
  });
});

describe("allocation strategies", () => {
  const invoices = [
    invoice("a", 100, { dueDate: "2026-03-01", policyId: "p-a", productType: "motor" }),
    invoice("b", 100, { dueDate: "2026-01-01", policyId: "p-b", productType: "medical" }),
    invoice("c", 100, { dueDate: "2026-02-01", policyId: "p-c", productType: "fire" }),
  ];

  it("fifo orders by due date, then issue date, then id — never input order", () => {
    const r = allocate({ available: kes(150), invoices, strategy: "fifo" });
    expect(paidOn(r, "b")).toBe(kes(100).minor);
    expect(paidOn(r, "c")).toBe(kes(50).minor);
    expect(paidOn(r, "a")).toBe(0);
    const shuffled = allocate({ available: kes(150), invoices: [...invoices].reverse(), strategy: "fifo" });
    expect(shuffled.allocations.map((x) => [x.invoiceId, x.amount.minor])).toEqual(r.allocations.map((x) => [x.invoiceId, x.amount.minor]));
  });

  it("policy priority serves the listed policies first, the rest in fifo order", () => {
    const r = allocate({ available: kes(150), invoices, strategy: "policy_priority", policyPriority: ["p-a"] });
    expect(paidOn(r, "a")).toBe(kes(100).minor);
    expect(paidOn(r, "b")).toBe(kes(50).minor);
  });

  it("product-type priority serves the listed lines of business first", () => {
    const r = allocate({ available: kes(120), invoices, strategy: "product_type_priority", productTypePriority: ["fire", "motor"] });
    expect(paidOn(r, "c")).toBe(kes(100).minor);
    expect(paidOn(r, "a")).toBe(kes(20).minor);
  });

  it("pro-rata shares in proportion to what is owed and conserves every cent", () => {
    const uneven = [invoice("x", 10), invoice("y", 20), invoice("z", 30)];
    const r = allocate({ available: kes(30), invoices: uneven, strategy: "pro_rata" });
    expect(paidOn(r, "x")).toBe(kes(5).minor);
    expect(paidOn(r, "y")).toBe(kes(10).minor);
    expect(paidOn(r, "z")).toBe(kes(15).minor);
    const odd = allocate({ available: Money.of(100, "KES"), invoices: [invoice("p", 1), invoice("q", 1), invoice("r", 1)], strategy: "pro_rata" });
    expect(sumMoney(odd.allocations.map((a) => a.amount), "KES").minor).toBe(100);
  });

  it("manual allocates exactly what was asked and holds back the rest", () => {
    const r = allocate({ available: kes(200), invoices, strategy: "manual", manual: [{ invoiceId: "c", amount: kes(60) }] });
    expect(paidOn(r, "c")).toBe(kes(60).minor);
    expect(r.remainder.minor).toBe(kes(140).minor);
  });

  it("hybrid applies manual pins first, then spreads the rest", () => {
    const r = allocate({ available: kes(150), invoices, strategy: "hybrid", manual: [{ invoiceId: "a", amount: kes(100) }], hybridRemainder: "fifo" });
    expect(paidOn(r, "a")).toBe(kes(100).minor);
    expect(paidOn(r, "b")).toBe(kes(50).minor);
  });

  it("rejects manual requests that cannot be honoured", () => {
    const over = () => allocate({ available: kes(500), invoices, strategy: "manual", manual: [{ invoiceId: "a", amount: kes(101) }] });
    expect(over).toThrow(AllocationError);
    expect(() => allocate({ available: kes(50), invoices, strategy: "manual", manual: [{ invoiceId: "a", amount: kes(60) }] })).toThrow(/exceed the money/);
    expect(() => allocate({ available: kes(50), invoices, strategy: "manual", manual: [{ invoiceId: "ghost", amount: kes(1) }] })).toThrow(/not open/);
    expect(() => allocate({ available: kes(50), invoices, strategy: "fifo", manual: [{ invoiceId: "a", amount: kes(1) }] })).toThrow(AllocationError);
  });

  it("settles fees before premium by default, and after when told", () => {
    const fee = { ...invoice("fee", 15), kind: "fee" as const, policyId: null, dueDate: "2026-04-01" };
    const first = allocate({ available: kes(50), invoices: [invoices[1], fee], strategy: "fifo" });
    expect(paidOn(first, "fee")).toBe(kes(15).minor);
    expect(paidOn(first, "b")).toBe(kes(35).minor);
    const last = allocate({ available: kes(50), invoices: [invoices[1], fee], strategy: "fifo", feesFirst: false });
    expect(paidOn(last, "fee")).toBe(0);
    expect(paidOn(last, "b")).toBe(kes(50).minor);
  });

  it("returns the surplus as remainder when everything is paid", () => {
    const r = allocate({ available: kes(1000), invoices, strategy: "fifo" });
    expect(r.remainder.minor).toBe(kes(700).minor);
    expect(r.stillOutstanding.isZero()).toBe(true);
  });

  it("splits a payment across net, tax and fee lines in proportion", () => {
    const inv = invoice("m", 100, { tax: 16, fee: 4 }); // 120 owed
    const r = allocate({ available: kes(60), invoices: [inv], strategy: "fifo" });
    const lines = Object.fromEntries(r.allocations[0].lines.map((l) => [l.kind, l.amount.minor]));
    expect(lines).toEqual({ net: kes(50).minor, tax: kes(8).minor, fee: kes(2).minor });
  });

  it("ignores invoices that owe nothing and rejects currency mixups", () => {
    const paid = { ...invoice("done", 0), lines: [{ id: "x", kind: "net" as const, outstanding: kes(0) }] };
    expect(allocate({ available: kes(10), invoices: [paid], strategy: "fifo" }).allocations).toHaveLength(0);
    const usd = { ...invoice("usd", 1), lines: [{ id: "u", kind: "net" as const, outstanding: Money.of(100, "USD") }] };
    expect(() => allocate({ available: kes(10), invoices: [usd], strategy: "fifo" })).toThrow(/USD/);
  });

  it("rejects a negative amount", () => {
    expect(() => allocate({ available: Money.of(-1, "KES"), invoices, strategy: "fifo" })).toThrow(AllocationError);
  });
});

describe("allocation engine — properties", () => {
  const invoiceArb = fc
    .record({
      n: fc.integer({ min: 0, max: 5_000_000 }),
      t: fc.integer({ min: 0, max: 800_000 }),
      f: fc.integer({ min: 0, max: 100_000 }),
      due: fc.integer({ min: 1, max: 28 }),
      kind: fc.constantFrom("premium" as const, "fee" as const),
      product: fc.constantFrom("motor", "medical", "fire"),
    })
    .map(({ n, t, f, due, kind, product }, ) => ({ n, t, f, due, kind, product }));

  const scenario = fc.record({
    available: fc.integer({ min: 0, max: 20_000_000 }),
    rows: fc.array(invoiceArb, { minLength: 0, maxLength: 8 }),
    strategy: fc.constantFrom<AllocationStrategy>("fifo", "policy_priority", "product_type_priority", "pro_rata"),
    feesFirst: fc.boolean(),
  });

  const build = (rows: { n: number; t: number; f: number; due: number; kind: "premium" | "fee"; product: string }[]): OpenInvoice[] =>
    rows.map((r, i) => ({
      id: `inv-${String(i).padStart(2, "0")}`,
      kind: r.kind,
      policyId: r.kind === "premium" ? `pol-${i}` : null,
      productType: r.product,
      issueDate: "2026-01-01",
      dueDate: `2026-02-${String(r.due).padStart(2, "0")}`,
      lines: [
        { id: `l-${i}-n`, kind: "net" as const, outstanding: Money.of(r.n, "KES") },
        { id: `l-${i}-t`, kind: "tax" as const, outstanding: Money.of(r.t, "KES") },
        { id: `l-${i}-f`, kind: "fee" as const, outstanding: Money.of(r.f, "KES") },
      ],
    }));

  const run = (s: { available: number; rows: Parameters<typeof build>[0]; strategy: AllocationStrategy; feesFirst: boolean }) => {
    const invoices = build(s.rows);
    const result = allocate({
      available: Money.of(s.available, "KES"), invoices, strategy: s.strategy, feesFirst: s.feesFirst,
      policyPriority: ["pol-2", "pol-0"], productTypePriority: ["fire", "medical"],
    });
    return { invoices, result };
  };

  it("conserves money: allocations + remainder == available", () => {
    fc.assert(fc.property(scenario, (s) => {
      const { result } = run(s);
      const allocated = sumMoney(result.allocations.map((a) => a.amount), "KES");
      expect(allocated.add(result.remainder).minor).toBe(s.available);
    }));
  });

  it("never pays an invoice or a line more than it owes", () => {
    fc.assert(fc.property(scenario, (s) => {
      const { invoices, result } = run(s);
      for (const a of result.allocations) {
        const inv = invoices.find((i) => i.id === a.invoiceId)!;
        const owed = sumMoney(inv.lines.map((l) => l.outstanding), "KES");
        expect(a.amount.minor).toBeGreaterThan(0);
        expect(a.amount.compare(owed)).toBeLessThanOrEqual(0);
        expect(sumMoney(a.lines.map((l) => l.amount), "KES").minor).toBe(a.amount.minor);
        for (const l of a.lines) {
          expect(l.amount.compare(inv.lines.find((x) => x.id === l.lineId)!.outstanding)).toBeLessThanOrEqual(0);
        }
      }
    }));
  });

  it("leaves a remainder only when everything open is fully paid", () => {
    fc.assert(fc.property(scenario, (s) => {
      const { result } = run(s);
      if (result.remainder.isPositive()) expect(result.stillOutstanding.isZero()).toBe(true);
      if (result.stillOutstanding.isPositive()) expect(result.remainder.isZero()).toBe(true);
    }));
  });

  it("is independent of the order invoices are supplied in", () => {
    fc.assert(fc.property(scenario, (s) => {
      const { invoices } = run(s);
      const args = { available: Money.of(s.available, "KES"), strategy: s.strategy, feesFirst: s.feesFirst, policyPriority: ["pol-2", "pol-0"], productTypePriority: ["fire", "medical"] };
      const a = allocate({ ...args, invoices });
      const b = allocate({ ...args, invoices: [...invoices].reverse() });
      expect(b.allocations.map((x) => [x.invoiceId, x.amount.minor])).toEqual(a.allocations.map((x) => [x.invoiceId, x.amount.minor]));
      expect(b.remainder.minor).toBe(a.remainder.minor);
    }));
  });

  it("every strategy is covered by the property suite or its own tests", () => {
    expect([...ALLOCATION_STRATEGIES].sort()).toEqual(["fifo", "hybrid", "manual", "policy_priority", "pro_rata", "product_type_priority"]);
  });
});
