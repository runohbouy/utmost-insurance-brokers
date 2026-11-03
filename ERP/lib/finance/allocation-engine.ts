// ---------------------------------------------------------------------------
// Premium allocation engine — PURE. Given the money available and the invoices
// open for a client, decide how much of it goes to which invoice and, inside an
// invoice, to which line (net premium / tax / fee). It reads no clock, no
// database and no configuration: the caller supplies everything, so the same
// inputs always give the same answer and every rule can be tested exhaustively.
//
// Guarantees (asserted by property tests):
//   * conservation   sum(allocations) + remainder == available, to the minor unit
//   * no over-pay    no line, invoice or request is ever given more than it owes
//   * determinism    ties break on (due date, issue date, id) — never on input order
//   * remainder      > 0 only when everything open has been paid in full
// ---------------------------------------------------------------------------
import { Money } from "../money";

export type AllocationStrategy = "fifo" | "policy_priority" | "product_type_priority" | "pro_rata" | "manual" | "hybrid";
export const ALLOCATION_STRATEGIES: readonly AllocationStrategy[] = ["fifo", "policy_priority", "product_type_priority", "pro_rata", "manual", "hybrid"];

export interface OpenLine {
  id: string;
  kind: "net" | "tax" | "fee";
  outstanding: Money;
}

export interface OpenInvoice {
  id: string;
  /** "premium" invoices belong to a policy; "fee" invoices are brokerage charges (e.g. returned-cheque fee). */
  kind: "premium" | "fee";
  policyId: string | null;
  productType: string | null;
  issueDate: string; // YYYY-MM-DD in the tenant's zone
  dueDate: string;
  lines: OpenLine[];
}

export interface ManualInstruction {
  invoiceId: string;
  amount: Money;
}

export interface AllocationRequest {
  available: Money;
  invoices: OpenInvoice[];
  strategy: AllocationStrategy;
  /** Charges are settled before premium when true (the usual brokerage rule). */
  feesFirst?: boolean;
  /** policy_priority: policy ids, most important first. Policies not listed follow in FIFO order. */
  policyPriority?: string[];
  /** product_type_priority: product types, most important first. Others follow in FIFO order. */
  productTypePriority?: string[];
  /** manual (and the first step of hybrid): exact amounts per invoice. */
  manual?: ManualInstruction[];
  /** hybrid: how whatever is left after the manual instructions is spread. */
  hybridRemainder?: Exclude<AllocationStrategy, "manual" | "hybrid">;
}

export interface LineAllocation { lineId: string; kind: OpenLine["kind"]; amount: Money }
export interface InvoiceAllocation { invoiceId: string; amount: Money; lines: LineAllocation[] }
export interface AllocationResult {
  allocations: InvoiceAllocation[];
  remainder: Money;
  /** Total still owed on the open invoices after this allocation. */
  stillOutstanding: Money;
}

export class AllocationError extends Error {
  constructor(readonly code: "invalid_manual" | "currency_mismatch" | "invalid_request", message: string) {
    super(message);
    this.name = "AllocationError";
  }
}

const invoiceOutstanding = (inv: OpenInvoice, currency: string) =>
  inv.lines.reduce((s, l) => s.add(l.outstanding), Money.zero(currency));

const fifoCompare = (a: OpenInvoice, b: OpenInvoice) =>
  a.dueDate.localeCompare(b.dueDate) || a.issueDate.localeCompare(b.issueDate) || a.id.localeCompare(b.id);

/** Splits `amount` across an invoice's lines in proportion to what each line still owes. */
function splitAcrossLines(inv: OpenInvoice, amount: Money): LineAllocation[] {
  const owing = inv.lines.filter((l) => l.outstanding.isPositive());
  if (owing.length === 0) return [];
  const parts = amount.allocate(owing.map((l) => l.outstanding.minor));
  return owing.map((l, i) => ({ lineId: l.id, kind: l.kind, amount: parts[i] })).filter((p) => p.amount.isPositive());
}

/** Order invoices for the sequential strategies. */
function orderFor(req: Pick<AllocationRequest, "feesFirst" | "policyPriority" | "productTypePriority">, strategy: AllocationStrategy, invoices: OpenInvoice[]): OpenInvoice[] {
  const rank = (list: string[] | undefined, key: string | null) => {
    if (!list || key === null) return Number.MAX_SAFE_INTEGER;
    const i = list.indexOf(key);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const feeRank = (inv: OpenInvoice) => (req.feesFirst === false ? (inv.kind === "fee" ? 1 : 0) : (inv.kind === "fee" ? 0 : 1));
  return [...invoices].sort((a, b) => {
    const f = feeRank(a) - feeRank(b);
    if (f) return f;
    if (strategy === "policy_priority") {
      const r = rank(req.policyPriority, a.policyId) - rank(req.policyPriority, b.policyId);
      if (r) return r;
    } else if (strategy === "product_type_priority") {
      const r = rank(req.productTypePriority, a.productType) - rank(req.productTypePriority, b.productType);
      if (r) return r;
    }
    return fifoCompare(a, b);
  });
}

export function allocate(req: AllocationRequest): AllocationResult {
  const currency = req.available.currency;
  if (req.available.isNegative()) throw new AllocationError("invalid_request", "available amount cannot be negative");

  const invoices = req.invoices.filter((inv) => {
    for (const l of inv.lines) {
      if (l.outstanding.currency !== currency) throw new AllocationError("currency_mismatch", `invoice ${inv.id} is in ${l.outstanding.currency}, receipt is in ${currency}`);
      if (l.outstanding.isNegative()) throw new AllocationError("invalid_request", `invoice ${inv.id} has a negative balance`);
    }
    return invoiceOutstanding(inv, currency).isPositive();
  });
  const totalOutstanding = invoices.reduce((s, inv) => s.add(invoiceOutstanding(inv, currency)), Money.zero(currency));

  const given = new Map<string, Money>();
  let left = req.available;
  const give = (inv: OpenInvoice, amount: Money) => {
    if (!amount.isPositive()) return;
    given.set(inv.id, (given.get(inv.id) ?? Money.zero(currency)).add(amount));
    left = left.sub(amount);
  };
  const room = (inv: OpenInvoice) => invoiceOutstanding(inv, currency).sub(given.get(inv.id) ?? Money.zero(currency));

  const sequential = (strategy: AllocationStrategy, pool: OpenInvoice[]) => {
    for (const inv of orderFor(req, strategy, pool)) {
      if (!left.isPositive()) break;
      give(inv, left.min(room(inv)));
    }
  };

  const proRata = (pool: OpenInvoice[]) => {
    const open = pool.filter((inv) => room(inv).isPositive());
    if (open.length === 0 || !left.isPositive()) return;
    const poolTotal = open.reduce((s, inv) => s.add(room(inv)), Money.zero(currency));
    if (left.compare(poolTotal) >= 0) return open.forEach((inv) => give(inv, room(inv)));
    // `open` is sorted so remainder minor units land deterministically
    const sorted = [...open].sort(fifoCompare);
    const shares = left.allocate(sorted.map((inv) => room(inv).minor));
    sorted.forEach((inv, i) => give(inv, shares[i]));
  };

  const manual = (instructions: ManualInstruction[]) => {
    const byInvoice = new Map<string, Money>();
    for (const m of instructions) {
      if (m.amount.currency !== currency) throw new AllocationError("currency_mismatch", "manual amount currency differs from the receipt");
      if (!m.amount.isPositive()) throw new AllocationError("invalid_manual", `manual amount for ${m.invoiceId} must be positive`);
      byInvoice.set(m.invoiceId, (byInvoice.get(m.invoiceId) ?? Money.zero(currency)).add(m.amount));
    }
    const known = new Map(invoices.map((i) => [i.id, i]));
    let asked = Money.zero(currency);
    for (const [id, amount] of byInvoice) {
      const inv = known.get(id);
      if (!inv) throw new AllocationError("invalid_manual", `invoice ${id} is not open for this client`);
      if (amount.compare(room(inv)) > 0) throw new AllocationError("invalid_manual", `invoice ${id} owes less than the amount requested`);
      asked = asked.add(amount);
    }
    if (asked.compare(left) > 0) throw new AllocationError("invalid_manual", "manual allocations exceed the money available");
    for (const [id, amount] of [...byInvoice].sort(([a], [b]) => a.localeCompare(b))) give(known.get(id)!, amount);
  };

  const auto = (strategy: Exclude<AllocationStrategy, "manual" | "hybrid">) => {
    if (strategy === "pro_rata") {
      // fees are still settled in full before premium is shared, unless told otherwise
      const fees = invoices.filter((i) => i.kind === "fee");
      const premium = invoices.filter((i) => i.kind === "premium");
      if (req.feesFirst === false) { proRata(premium); proRata(fees); } else { proRata(fees); proRata(premium); }
    } else {
      sequential(strategy, invoices);
    }
  };

  switch (req.strategy) {
    case "manual":
      manual(req.manual ?? []);
      break;
    case "hybrid":
      manual(req.manual ?? []);
      auto(req.hybridRemainder ?? "fifo");
      break;
    default:
      if (req.manual?.length) throw new AllocationError("invalid_request", `manual instructions are only valid for the manual and hybrid strategies`);
      auto(req.strategy);
  }

  const allocations: InvoiceAllocation[] = invoices
    .filter((inv) => given.has(inv.id))
    .sort(fifoCompare)
    .map((inv) => {
      const amount = given.get(inv.id)!;
      return { invoiceId: inv.id, amount, lines: splitAcrossLines(inv, amount) };
    });

  return { allocations, remainder: left, stillOutstanding: totalOutstanding.sub(req.available.sub(left)) };
}
