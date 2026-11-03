// ---------------------------------------------------------------------------
// Receipts, invoices and premium allocation — the application service.
//
// Every public function is one business transaction: it either completes with
// the receipt, allocations, commission, general ledger and audit trail all
// written, or leaves nothing behind. The pure decision of WHO gets WHAT lives in
// lib/finance/allocation-engine; this file loads the facts, calls it, and writes
// the consequences. Tenant rules come only from the published configuration.
//
// Invariants (each covered by tests/api/receipts.test.ts):
//   * only cleared money is allocated
//   * allocations and commission accruals are append-only; undoing one writes a
//     reversal that points at it, and a second undo is a no-op
//   * receipt unallocated balance == amount - SUM(allocations) (computed, never stored)
//   * invoice outstanding == lines - SUM(allocation lines) (computed, never stored)
//   * a bounced cheque returns every invoice to its pre-cheque balance, reverses
//     commission and ledger, and (if the tenant charges one) raises the fee
// ---------------------------------------------------------------------------
import crypto from "crypto";
import { db } from "../../db/client";
import { Money, sumMoney } from "../../lib/money";
import { localDate } from "../../lib/time";
import { getConfigVersion, getEffectiveConfig } from "../../lib/config/service";
import { canonicalJson } from "../../lib/config/resolve";
import type { EffectiveTenantConfig } from "../../lib/config/schema";
import { allocate, AllocationError, type AllocationStrategy, type InvoiceAllocation, type ManualInstruction, type OpenInvoice } from "../../lib/finance/allocation-engine";
import { priceInvoice } from "../../lib/finance/tax";
import { entriesFor, entryFor, postEntries, postEntry, reverseEntries, reverseEntry, type PostInput } from "../../lib/finance/gl";
import { conflict, notFound, Problem, unprocessable } from "../../lib/http/problem";
import { iso, newId, num, one, rows, sql, type Executor, type SQL, type Tx } from "../../lib/sql";

export interface Ctx { tenantId: string; staffId: string | null }

export const RECEIPT_METHODS = ["cash", "mpesa", "bank", "card", "cheque"] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];
export type ReceiptStatus = "received" | "deposited" | "cleared" | "bounced" | "cancelled";

/** The cheque lifecycle. Everything not listed is refused. */
const TRANSITIONS: Record<ReceiptStatus, ReceiptStatus[]> = {
  received: ["deposited", "cancelled"],
  deposited: ["cleared", "bounced", "cancelled"],
  cleared: ["bounced"],
  bounced: [],
  cancelled: [],
};

// ---------- row types and mapping ----------

interface ReceiptRow {
  id: string; tenant_id: string; receipt_no: string; client_id: string; amount_minor: unknown; currency: string; method: ReceiptMethod;
  reference: string | null; instrument_no: string | null; drawer_bank: string | null; status: ReceiptStatus;
  received_at: unknown; deposited_at: unknown; cleared_at: unknown; bounced_at: unknown; cancelled_at: unknown;
  holding_kind: "suspense" | "client_credit" | null; config_version_id: string; idempotency_key: string | null; request_hash: string | null;
  recorded_by: string | null; created_at: unknown; client_name?: string | null; allocated_minor?: unknown;
  approval_status: "not_required" | "pending" | "approved" | "rejected"; approved_by: string | null; approved_at: unknown; approval_note: string | null;
}

const fmt = (m: Money, c: EffectiveTenantConfig) => m.format(c.localization.locale);
const moneyDto = (m: Money, c: EffectiveTenantConfig) => ({ amountMinor: m.minor, currency: m.currency, display: fmt(m, c) });
const hashOf = (value: unknown) => crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
const today = (c: EffectiveTenantConfig) => localDate(new Date(), c.regional.timeZone);

function receiptDto(r: ReceiptRow, c: EffectiveTenantConfig) {
  const amount = Money.of(num(r.amount_minor), r.currency);
  const allocated = Money.of(num(r.allocated_minor), r.currency);
  const unallocated = r.status === "cleared" ? amount.sub(allocated) : Money.zero(r.currency);
  return {
    id: r.id, receiptNo: r.receipt_no, clientId: r.client_id, clientName: r.client_name ?? null,
    amount: moneyDto(amount, c), allocated: moneyDto(allocated, c), unallocated: moneyDto(unallocated, c),
    method: r.method, reference: r.reference, instrumentNo: r.instrument_no, drawerBank: r.drawer_bank,
    status: r.status, holdingKind: unallocated.isPositive() ? r.holding_kind : null,
    approvalStatus: r.approval_status, approvedBy: r.approved_by, approvedAt: iso(r.approved_at), approvalNote: r.approval_note,
    receivedAt: iso(r.received_at), depositedAt: iso(r.deposited_at), clearedAt: iso(r.cleared_at),
    bouncedAt: iso(r.bounced_at), cancelledAt: iso(r.cancelled_at),
    configVersionId: r.config_version_id, recordedBy: r.recorded_by, createdAt: iso(r.created_at),
  };
}

const RECEIPT_SELECT = sql`
  SELECT r.*, p.full_name AS client_name
  FROM finance.receipts r LEFT JOIN crm.parties p ON p.id = r.client_id`;

/** `scopeClientId` confines the lookup to one client's records — the client portal always passes it. */
async function loadReceipt(ex: Executor, ctx: Ctx, id: string, lock = false, scopeClientId?: string): Promise<ReceiptRow> {
  // a client only ever sees receipts that are real money: not ones still waiting for, or refused by, an approver
  const scope = scopeClientId ? sql`AND r.client_id = ${scopeClientId} AND r.approval_status IN ('not_required','approved')` : sql``;
  const r = await one<ReceiptRow>(ex, lock
    ? sql`SELECT r.*, NULL AS client_name FROM finance.receipts r WHERE r.id = ${id} AND r.tenant_id = ${ctx.tenantId} ${scope} FOR UPDATE`
    : sql`${RECEIPT_SELECT} WHERE r.id = ${id} AND r.tenant_id = ${ctx.tenantId} ${scope}`);
  if (!r) throw notFound(`Receipt ${id}`);
  return r;
}

async function netAllocated(ex: Executor, receiptId: string): Promise<number> {
  const r = await one<{ allocated_minor: unknown }>(ex, sql`SELECT allocated_minor FROM finance.receipts WHERE id = ${receiptId}`);
  return num(r?.allocated_minor);
}

async function audit(tx: Tx, ctx: Ctx, action: string, entityType: string, entityId: string, after: unknown, before?: unknown, reason?: string) {
  await tx.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, before_state, after_state, reason)
    VALUES (${ctx.staffId}, ${action}, ${entityType}, ${entityId}, ${before === undefined ? null : JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb, ${reason ?? null})`);
}

const pgCode = (err: unknown): string | undefined => {
  let e = err as { code?: string; cause?: unknown } | undefined;
  for (let i = 0; i < 4 && e && !e.code && e.cause; i++) e = e.cause as typeof e;
  return e?.code;
};

// ---------- invoices ----------

interface OpenInvoiceRow { id: string; kind: "premium" | "fee"; policy_id: string | null; product_type: string | null; issue_date: string; due_date: string; line_id: string; line_kind: "net" | "tax" | "fee"; outstanding: unknown }

/** Locks the client's open invoices (in a fixed order, so two receipts cannot deadlock) and returns them with live balances. */
async function loadOpenInvoices(tx: Tx, ctx: Ctx, clientId: string, currency: string): Promise<OpenInvoice[]> {
  await tx.execute(sql`SELECT id FROM finance.invoices WHERE tenant_id = ${ctx.tenantId} AND client_id = ${clientId} AND status = 'open' ORDER BY id FOR UPDATE`);
  const list = await rows<OpenInvoiceRow>(tx, sql`
    SELECT i.id, i.kind, i.policy_id, i.product_type, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
           l.id AS line_id, l.kind AS line_kind,
           l.amount_minor - COALESCE((SELECT SUM(al.amount_minor) FROM finance.allocation_lines al WHERE al.invoice_line_id = l.id), 0) AS outstanding
    FROM finance.invoices i JOIN finance.invoice_lines l ON l.invoice_id = i.id
    WHERE i.tenant_id = ${ctx.tenantId} AND i.client_id = ${clientId} AND i.status = 'open' AND i.currency = ${currency}
    ORDER BY i.id, l.sort_order, l.id`);
  const byId = new Map<string, OpenInvoice>();
  for (const r of list) {
    let inv = byId.get(r.id);
    if (!inv) {
      inv = { id: r.id, kind: r.kind, policyId: r.policy_id, productType: r.product_type, issueDate: r.issue_date, dueDate: r.due_date, lines: [] };
      byId.set(r.id, inv);
    }
    inv.lines.push({ id: r.line_id, kind: r.line_kind, outstanding: Money.of(num(r.outstanding), currency) });
  }
  return [...byId.values()];
}

export interface NewInvoice {
  kind: "premium" | "fee";
  policyId?: string;
  clientId?: string;
  /** Premium: net premium when pricing is tax-exclusive, gross when inclusive. Defaults to the policy's premium. Fee: the fee. */
  amountMinor?: number;
  description?: string;
  issueDate?: string;
  dueDate?: string;
}

async function insertInvoice(tx: Tx, ctx: Ctx, config: EffectiveTenantConfig, spec: {
  kind: "premium" | "fee"; clientId: string; policyId: string | null; insurerId: string | null; productType: string | null;
  issueDate: string; dueDate: string; lines: { kind: "net" | "tax" | "fee"; code: string; description: string; amount: Money }[];
}): Promise<string> {
  const currency = config.regional.currency;
  const total = sumMoney(spec.lines.map((l) => l.amount), currency);
  const id = newId("inv");
  const seq = await one<{ n: unknown }>(tx, sql`SELECT nextval('finance.invoice_no_seq') AS n`);
  const invoiceNo = `INV-${spec.issueDate.slice(0, 4)}-${String(num(seq!.n)).padStart(6, "0")}`;
  await tx.execute(sql`INSERT INTO finance.invoices (id, tenant_id, invoice_no, kind, policy_id, client_id, insurer_id, product_type, currency, issue_date, due_date, total_minor, config_version_id, created_by)
    VALUES (${id}, ${ctx.tenantId}, ${invoiceNo}, ${spec.kind}, ${spec.policyId}, ${spec.clientId}, ${spec.insurerId}, ${spec.productType}, ${currency}, ${spec.issueDate}, ${spec.dueDate}, ${total.minor}, ${config.versionId}, ${ctx.staffId})`);
  let order = 0;
  for (const l of spec.lines) {
    await tx.execute(sql`INSERT INTO finance.invoice_lines (id, invoice_id, kind, code, description, amount_minor, sort_order)
      VALUES (${newId("il")}, ${id}, ${l.kind}, ${l.code}, ${l.description}, ${l.amount.minor}, ${order++})`);
  }
  return id;
}

export async function createInvoice(ctx: Ctx, input: NewInvoice) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const currency = config.regional.currency;

  const created = await db.transaction(async (tx) => {
    const issueDate = input.issueDate ?? today(config);
    let id: string;
    let clientId: string;

    if (input.kind === "premium") {
      if (!input.policyId) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "policyId", message: "required for a premium invoice" }]);
      const policy = await one<{ id: string; client_id: string | null; insurer_id: string | null; category: string; premium_amount: string; premium_due_date: string | null; status: string }>(
        tx, sql`SELECT id, client_id, insurer_id, category, premium_amount::text, to_char(premium_due_date, 'YYYY-MM-DD') AS premium_due_date, status FROM policy.policies WHERE id = ${input.policyId}`);
      if (!policy) throw notFound(`Policy ${input.policyId}`);
      if (!policy.client_id) throw unprocessable("policy-has-no-client", "Policy has no client", "Link the policy to a client before invoicing it");
      if (["Cancelled", "Expired"].includes(policy.status)) throw conflict("policy-not-invoiceable", "Policy cannot be invoiced", `Policy is ${policy.status}`);
      const dueDate = input.dueDate ?? policy.premium_due_date;
      if (!dueDate) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "dueDate", message: "required: the policy has no premium due date" }]);
      if (dueDate < issueDate) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "dueDate", message: "cannot be before the issue date" }]);

      const amount = input.amountMinor !== undefined ? Money.of(input.amountMinor, currency) : Money.fromMajor(policy.premium_amount, currency);
      if (!amount.isPositive()) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "amountMinor", message: "must be greater than zero" }]);
      const priced = priceInvoice(amount, config.tax);
      clientId = policy.client_id;
      id = await insertInvoice(tx, ctx, config, {
        kind: "premium", clientId, policyId: policy.id, insurerId: policy.insurer_id, productType: policy.category, issueDate, dueDate,
        lines: [
          { kind: "net", code: "premium", description: `Premium ${policy.id}`, amount: priced.net },
          ...priced.taxes.filter((t) => t.amount.isPositive()).map((t) => ({ kind: "tax" as const, code: t.code, description: t.name, amount: t.amount })),
        ],
      });
    } else {
      if (!input.clientId) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "clientId", message: "required for a fee invoice" }]);
      if (!input.amountMinor || input.amountMinor <= 0) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "amountMinor", message: "must be greater than zero" }]);
      clientId = input.clientId;
      id = await insertInvoice(tx, ctx, config, {
        kind: "fee", clientId, policyId: null, insurerId: null, productType: null, issueDate, dueDate: input.dueDate ?? issueDate,
        lines: [{ kind: "fee", code: "fee", description: input.description ?? "Brokerage fee", amount: Money.of(input.amountMinor, currency) }],
      });
    }

    await audit(tx, ctx, "INVOICE_CREATED", "invoice", id, { kind: input.kind, clientId });
    // Credit the client already holds goes to the new invoice straight away.
    await applyClientCredit(tx, ctx, config, clientId);
    return id;
  });
  return getInvoice(ctx, created);
}

export async function voidInvoice(ctx: Ctx, invoiceId: string, reason: string) {
  await db.transaction(async (tx) => {
    const inv = await one<{ id: string; status: string }>(tx, sql`SELECT id, status FROM finance.invoices WHERE id = ${invoiceId} AND tenant_id = ${ctx.tenantId} FOR UPDATE`);
    if (!inv) throw notFound(`Invoice ${invoiceId}`);
    if (inv.status === "void") return; // idempotent
    const paid = await one<{ paid_minor: unknown }>(tx, sql`SELECT paid_minor FROM finance.invoices WHERE id = ${invoiceId}`);
    if (num(paid!.paid_minor) !== 0) throw conflict("invoice-has-allocations", "Invoice has payments applied", "Reverse the allocations before voiding the invoice");
    await tx.execute(sql`UPDATE finance.invoices SET status = 'void' WHERE id = ${invoiceId}`);
    await audit(tx, ctx, "INVOICE_VOIDED", "invoice", invoiceId, { status: "void" }, { status: "open" }, reason);
  });
  return getInvoice(ctx, invoiceId);
}

// ---------- commission ----------

interface CommissionTerms { insurerId: string | null; rateBps: number; producerId: string | null; splitBps: number }

/** Commission rate (latest negotiated for the policy's insurer and class) and producer split for many policies in one query. */
async function commissionTermsFor(tx: Tx, policyIds: string[]): Promise<Map<string, CommissionTerms>> {
  const out = new Map<string, CommissionTerms>();
  if (policyIds.length === 0) return out;
  const found = await rows<{ id: string; insurer_id: string | null; producer_id: string | null; rate_pct: string | null; split_pct: string | null }>(tx, sql`
    SELECT p.id, p.insurer_id, p.producer_id,
      (SELECT v.commission_rate_pct::text FROM product.insurer_rate_versions v WHERE v.insurer_id = p.insurer_id AND v.category = p.category ORDER BY v.effective_from DESC LIMIT 1) AS rate_pct,
      (SELECT pr.commission_split_pct::text FROM sales.producers pr WHERE pr.id = p.producer_id) AS split_pct
    FROM policy.policies p WHERE p.id IN (${sql.join(policyIds.map((i) => sql`${i}`), sql`, `)})`);
  for (const f of found) {
    out.set(f.id, {
      insurerId: f.insurer_id, producerId: f.producer_id,
      rateBps: f.rate_pct ? Math.round(Number(f.rate_pct) * 100) : 0,
      splitBps: f.split_pct ? Math.round(Number(f.split_pct) * 100) : 0,
    });
  }
  return out;
}

// ---------- allocation ----------

interface AllocationOutcome {
  batchId: string | null;
  strategy: AllocationStrategy;
  allocations: { allocationId: string | null; invoiceId: string; invoiceNo?: string; amount: Money; lines: { lineId: string; kind: string; amount: Money }[] }[];
  remainder: Money;
  stillOutstanding: Money;
  holdingKind: "suspense" | "client_credit" | null;
  replayed: boolean;
  policiesActivated: string[];
}

interface RunOptions {
  strategy: AllocationStrategy;
  manual?: ManualInstruction[];
  trigger: "on_clearing" | "manual" | "credit_applied" | "correction";
  idempotencyKey?: string;
  dryRun?: boolean;
}

function mapEngineError(err: unknown): never {
  if (err instanceof AllocationError) throw unprocessable(`allocation-${err.code.replace(/_/g, "-")}`, "Allocation cannot be applied", err.message);
  throw err;
}

async function runAllocation(tx: Tx, ctx: Ctx, config: EffectiveTenantConfig, receipt: ReceiptRow, opts: RunOptions): Promise<AllocationOutcome> {
  if (receipt.status !== "cleared") throw conflict("receipt-not-cleared", "Receipt is not cleared", `Only cleared money can be allocated; this receipt is ${receipt.status}`);
  const currency = receipt.currency;
  const requestHash = hashOf({ receiptId: receipt.id, strategy: opts.strategy, manual: (opts.manual ?? []).map((m) => [m.invoiceId, m.amount.minor]), trigger: opts.trigger });

  if (opts.idempotencyKey && !opts.dryRun) {
    const prior = await one<{ id: string; request_hash: string | null; receipt_id: string }>(tx, sql`SELECT id, request_hash, receipt_id FROM finance.allocation_batches WHERE tenant_id = ${ctx.tenantId} AND idempotency_key = ${opts.idempotencyKey}`);
    if (prior) {
      if (prior.request_hash !== requestHash || prior.receipt_id !== receipt.id) {
        throw new Problem(422, "idempotency-key-reused", "Idempotency key already used", "This key was used for a different request");
      }
      return replayedOutcome(tx, ctx, prior.id, opts.strategy, currency, receipt);
    }
  }

  const invoices = await loadOpenInvoices(tx, ctx, receipt.client_id, currency);
  const available = Money.of(num(receipt.amount_minor) - (await netAllocated(tx, receipt.id)), currency);
  if (available.isNegative()) throw new Error(`receipt ${receipt.id} is over-allocated`);

  let result;
  try {
    result = allocate({
      available, invoices, strategy: opts.strategy, feesFirst: config.finance.feesFirst,
      policyPriority: config.finance.policyPriority, productTypePriority: config.finance.productTypePriority,
      manual: opts.manual, hybridRemainder: config.finance.allocationStrategy,
    });
  } catch (err) {
    mapEngineError(err);
  }

  const invoiceNos = new Map<string, string>();
  if (result.allocations.length > 0) {
    const ids = sql.join(result.allocations.map((a) => sql`${a.invoiceId}`), sql`, `);
    for (const f of await rows<{ id: string; invoice_no: string }>(tx, sql`SELECT id, invoice_no FROM finance.invoices WHERE id IN (${ids})`)) invoiceNos.set(f.id, f.invoice_no);
  }

  // Where does whatever is left sit? Beyond everything owed it is an overpayment
  // (suspense or client credit per tenant rule); while invoices remain open it is
  // simply unallocated, and staff must resolve it, so it is suspense.
  const wasCredit = receipt.holding_kind === "client_credit";
  const holdingKind: AllocationOutcome["holdingKind"] = !result.remainder.isPositive()
    ? null
    : wasCredit || (result.stillOutstanding.isZero() && config.finance.overpaymentTreatment === "client_credit") ? "client_credit" : "suspense";

  if (opts.dryRun) {
    return {
      batchId: null, strategy: opts.strategy, replayed: false, policiesActivated: [], holdingKind,
      allocations: result.allocations.map((a) => ({ allocationId: null, invoiceId: a.invoiceId, invoiceNo: invoiceNos.get(a.invoiceId), amount: a.amount, lines: a.lines })),
      remainder: result.remainder, stillOutstanding: result.stillOutstanding,
    };
  }

  const batchId = newId("batch");
  await tx.execute(sql`INSERT INTO finance.allocation_batches (id, tenant_id, receipt_id, trigger, strategy, idempotency_key, request_hash, config_version_id, created_by)
    VALUES (${batchId}, ${ctx.tenantId}, ${receipt.id}, ${opts.trigger}, ${opts.strategy}, ${opts.idempotencyKey ?? null}, ${requestHash}, ${config.versionId}, ${ctx.staffId})`);

  const allocationIds = await applyAllocations(tx, ctx, config, receipt, batchId, result.allocations, invoices);
  const outcomes: AllocationOutcome["allocations"] = result.allocations.map((a, i) => (
    { allocationId: allocationIds[i], invoiceId: a.invoiceId, invoiceNo: invoiceNos.get(a.invoiceId), amount: a.amount, lines: a.lines }
  ));

  // Invoices this allocation just paid in full activate their policies (premium evidence gate).
  const paidInFull = result.allocations.flatMap((a) => {
    const inv = invoices.find((i) => i.id === a.invoiceId)!;
    return inv.kind === "premium" && inv.policyId && sumMoney(inv.lines.map((l) => l.outstanding), currency).equals(a.amount) ? [inv.policyId] : [];
  });
  const activated = paidInFull.length === 0 ? [] : (await rows<{ id: string }>(tx, sql`
    UPDATE policy.policies SET status = 'Active', updated_at = now()
    WHERE id IN (${inList(paidInFull)}) AND status IN ('Pending','Received','Under Check') RETURNING id`)).map((c) => c.id);

  await tx.execute(sql`UPDATE finance.receipts SET holding_kind = ${holdingKind}, updated_at = now() WHERE id = ${receipt.id}`);
  await audit(tx, ctx, "RECEIPT_ALLOCATED", "receipt", receipt.id, {
    batchId, trigger: opts.trigger, strategy: opts.strategy,
    allocations: outcomes.map((o) => ({ invoiceId: o.invoiceId, amountMinor: o.amount.minor })),
    remainderMinor: result.remainder.minor, holdingKind,
  });

  return { batchId, strategy: opts.strategy, allocations: outcomes, remainder: result.remainder, stillOutstanding: result.stillOutstanding, holdingKind, replayed: false, policiesActivated: activated };
}

async function replayedOutcome(tx: Tx, ctx: Ctx, batchId: string, strategy: AllocationStrategy, currency: string, receipt: ReceiptRow): Promise<AllocationOutcome> {
  const list = await rows<{ id: string; invoice_id: string; amount_minor: unknown; invoice_no: string }>(tx, sql`
    SELECT a.id, a.invoice_id, a.amount_minor, i.invoice_no FROM finance.allocations a JOIN finance.invoices i ON i.id = a.invoice_id WHERE a.batch_id = ${batchId} ORDER BY a.id`);
  const remainder = Money.of(num(receipt.amount_minor) - (await netAllocated(tx, receipt.id)), currency);
  const owed = (await loadOpenInvoices(tx, ctx, receipt.client_id, currency))
    .reduce((sum, inv) => sum.add(sumMoney(inv.lines.map((l) => l.outstanding), currency)), Money.zero(currency));
  return {
    batchId, strategy, replayed: true, policiesActivated: [], holdingKind: receipt.holding_kind, remainder, stillOutstanding: owed,
    allocations: list.map((a) => ({ allocationId: a.id, invoiceId: a.invoice_id, invoiceNo: a.invoice_no, amount: Money.of(num(a.amount_minor), currency), lines: [] })),
  };
}

/** Rows -> "(a, b, c), (d, e, f)" for a multi-row INSERT: one statement however many rows. */
const tuples = (rowsOfValues: SQL[][]) => sql.join(rowsOfValues.map((r) => sql`(${sql.join(r, sql`, `)})`), sql`, `);
const inList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

/**
 * Writes the allocations and everything that follows from them — lines, commission, producer splits and
 * ledger entries — in a fixed handful of statements, however many invoices are being paid.
 * Returns the new allocation ids in the same order as `list`.
 */
async function applyAllocations(tx: Tx, ctx: Ctx, config: EffectiveTenantConfig, receipt: ReceiptRow, batchId: string, list: InvoiceAllocation[], invoices: OpenInvoice[]): Promise<string[]> {
  if (list.length === 0) return [];
  const currency = receipt.currency;
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const ids = list.map(() => newId("alc"));

  const parts = list.map((a, i) => {
    const sumKind = (k: string) => sumMoney(a.lines.filter((l) => l.kind === k).map((l) => l.amount), currency);
    const inv = invoiceById.get(a.invoiceId)!;
    return { a, id: ids[i], policyId: inv.policyId, net: sumKind("net"), tax: sumKind("tax"), fee: sumKind("fee") };
  });
  const terms = await commissionTermsFor(tx, [...new Set(parts.filter((p) => p.policyId && p.net.isPositive()).map((p) => p.policyId!))]);

  await tx.execute(sql`INSERT INTO finance.allocations (id, tenant_id, batch_id, receipt_id, invoice_id, kind, amount_minor, currency)
    VALUES ${tuples(parts.map((p) => [sql`${p.id}`, sql`${ctx.tenantId}`, sql`${batchId}`, sql`${receipt.id}`, sql`${p.a.invoiceId}`, sql`'apply'`, sql`${p.a.amount.minor}`, sql`${currency}`]))}`);
  const lineRows = parts.flatMap((p) => p.a.lines.map((l) => [sql`${p.id}`, sql`${l.lineId}`, sql`${l.amount.minor}`]));
  if (lineRows.length) await tx.execute(sql`INSERT INTO finance.allocation_lines (allocation_id, invoice_line_id, amount_minor) VALUES ${tuples(lineRows)}`);

  const accruals: SQL[][] = [];
  const splits: SQL[][] = [];
  const glEntries = parts.map((p): PostInput => {
    let commission = Money.zero(currency);
    let split = Money.zero(currency);
    const t = p.policyId ? terms.get(p.policyId) : undefined;
    if (t && p.net.isPositive()) {
      commission = p.net.mulRatio(t.rateBps, 10_000, "half_up");
      if (commission.isPositive()) {
        if (t.producerId && t.splitBps > 0) split = commission.mulRatio(t.splitBps, 10_000, "half_up");
        accruals.push([sql`${newId("cma")}`, sql`${ctx.tenantId}`, sql`${p.id}`, sql`${p.policyId}`, sql`${t.insurerId}`, sql`'accrual'`, sql`${p.net.minor}`, sql`${t.rateBps}`, sql`${commission.minor}`, sql`${currency}`, sql`${split.minor}`]);
        if (split.isPositive()) {
          splits.push([sql`${newId("pcs")}`, sql`${t.producerId}`, sql`${p.policyId}`, sql`${commission.toMajorString()}::numeric`, sql`${(t.splitBps / 100).toFixed(2)}::numeric`, sql`${split.toMajorString()}::numeric`, sql`'pending'`, sql`${"accrual:" + p.id}`]);
        }
      }
    }
    const dims = { policyId: p.policyId, partyId: receipt.client_id };
    return {
      entryDate: today(config), description: `Receipt ${receipt.receipt_no} applied to invoice ${p.a.invoiceId}`, sourceType: "allocation", sourceId: p.id, postedBy: ctx.staffId,
      lines: [
        { account: "2100", side: "debit", amount: p.a.amount, ...dims },
        { account: "2000", side: "credit", amount: p.net.sub(commission), ...dims },
        { account: "4000", side: "credit", amount: commission.sub(split), ...dims },
        { account: "2010", side: "credit", amount: split, ...dims },
        { account: "2200", side: "credit", amount: p.tax, ...dims },
        { account: "4100", side: "credit", amount: p.fee, ...dims },
      ],
    };
  });

  if (accruals.length) await tx.execute(sql`INSERT INTO finance.commission_accruals (id, tenant_id, allocation_id, policy_id, insurer_id, kind, basis_minor, rate_bps, amount_minor, currency, producer_split_minor) VALUES ${tuples(accruals)}`);
  if (splits.length) await tx.execute(sql`INSERT INTO finance.producer_commission_splits (id, producer_id, policy_id, commission_amount_kes, split_pct, split_amount_kes, status, payment_reference) VALUES ${tuples(splits)}`);
  await postEntries(tx, glEntries);
  return ids;
}

interface ReversalResult { allocationId: string; reversalId: string; amount: Money; invoiceId: string; policyId: string | null; created: boolean }

/**
 * Undoes allocations: a reversal row (and lines) for each, the ledger entries, commission accruals and
 * producer splits. Anything already reversed is left alone and reported as `created: false`, so doing this
 * twice changes nothing. A fixed number of statements however many allocations are named.
 */
async function reverseAllocations(tx: Tx, ctx: Ctx, config: EffectiveTenantConfig, allocationIds: string[], batchId: string, reason: string): Promise<ReversalResult[]> {
  if (allocationIds.length === 0) return [];
  const idList = inList(allocationIds);
  const origs = await rows<{ id: string; receipt_id: string; invoice_id: string; amount_minor: unknown; currency: string; kind: string; policy_id: string | null }>(tx, sql`
    SELECT a.id, a.receipt_id, a.invoice_id, a.amount_minor, a.currency, a.kind, i.policy_id
    FROM finance.allocations a JOIN finance.invoices i ON i.id = a.invoice_id
    WHERE a.id IN (${idList}) AND a.tenant_id = ${ctx.tenantId} ORDER BY a.id FOR UPDATE OF a`);
  const byId = new Map(origs.map((o) => [o.id, o]));
  for (const id of allocationIds) {
    const o = byId.get(id);
    if (!o) throw notFound(`Allocation ${id}`);
    if (o.kind !== "apply") throw conflict("allocation-not-reversible", "Only an applied allocation can be reversed");
  }

  const done = await rows<{ id: string; reverses_allocation_id: string }>(tx, sql`SELECT id, reverses_allocation_id FROM finance.allocations WHERE reverses_allocation_id IN (${idList})`);
  const reversedBy = new Map(done.map((d) => [d.reverses_allocation_id, d.id]));
  const results: ReversalResult[] = allocationIds.map((id) => {
    const o = byId.get(id)!;
    const existing = reversedBy.get(id);
    return { allocationId: id, reversalId: existing ?? newId("alr"), amount: Money.of(num(o.amount_minor), o.currency), invoiceId: o.invoice_id, policyId: o.policy_id, created: !existing };
  });
  const fresh = results.filter((r) => r.created);
  if (fresh.length === 0) return results;

  await tx.execute(sql`INSERT INTO finance.allocations (id, tenant_id, batch_id, receipt_id, invoice_id, kind, amount_minor, currency, reverses_allocation_id, reason)
    VALUES ${tuples(fresh.map((r) => { const o = byId.get(r.allocationId)!; return [sql`${r.reversalId}`, sql`${ctx.tenantId}`, sql`${batchId}`, sql`${o.receipt_id}`, sql`${o.invoice_id}`, sql`'reversal'`, sql`${-r.amount.minor}`, sql`${o.currency}`, sql`${r.allocationId}`, sql`${reason}`]; }))}`);
  await tx.execute(sql`INSERT INTO finance.allocation_lines (allocation_id, invoice_line_id, amount_minor)
    SELECT m.rid, al.invoice_line_id, -al.amount_minor
    FROM (VALUES ${tuples(fresh.map((r) => [sql`${r.allocationId}::text`, sql`${r.reversalId}::text`]))}) AS m(oid, rid)
    JOIN finance.allocation_lines al ON al.allocation_id = m.oid`);

  const freshIds = fresh.map((r) => r.allocationId);
  const currency = byId.get(freshIds[0])!.currency;
  const entries = await entriesFor(tx, "allocation", freshIds);
  await reverseEntries(tx, [...entries.values()], today(config), reason, ctx.staffId, currency);

  const accruals = await rows<{ id: string; allocation_id: string; policy_id: string; insurer_id: string | null; basis_minor: unknown; rate_bps: number; amount_minor: unknown; producer_split_minor: unknown }>(
    tx, sql`SELECT id, allocation_id, policy_id, insurer_id, basis_minor, rate_bps, amount_minor, producer_split_minor FROM finance.commission_accruals WHERE allocation_id IN (${inList(freshIds)}) AND kind = 'accrual'`);
  if (accruals.length) {
    const reversalOf = new Map(fresh.map((r) => [r.allocationId, r.reversalId]));
    await tx.execute(sql`INSERT INTO finance.commission_accruals (id, tenant_id, allocation_id, policy_id, insurer_id, kind, basis_minor, rate_bps, amount_minor, currency, producer_split_minor, reverses_accrual_id)
      VALUES ${tuples(accruals.map((a) => [sql`${newId("cma")}`, sql`${ctx.tenantId}`, sql`${reversalOf.get(a.allocation_id)}`, sql`${a.policy_id}`, sql`${a.insurer_id}`, sql`'reversal'`, sql`${-num(a.basis_minor)}`, sql`${a.rate_bps}`, sql`${-num(a.amount_minor)}`, sql`${currency}`, sql`${-num(a.producer_split_minor)}`, sql`${a.id}`]))}`);

    const withSplit = accruals.filter((a) => num(a.producer_split_minor) > 0);
    if (withSplit.length) {
      const originals = await rows<{ producer_id: string; split_pct: string; payment_reference: string }>(tx, sql`
        SELECT producer_id, split_pct::text AS split_pct, payment_reference FROM finance.producer_commission_splits WHERE payment_reference IN (${inList(withSplit.map((a) => "accrual:" + a.allocation_id))})`);
      const origByRef = new Map(originals.map((o) => [o.payment_reference, o]));
      const negatives = withSplit.flatMap((a) => {
        const o = origByRef.get("accrual:" + a.allocation_id);
        return o ? [[sql`${newId("pcs")}`, sql`${o.producer_id}`, sql`${a.policy_id}`, sql`${Money.of(-num(a.amount_minor), currency).toMajorString()}::numeric`, sql`${o.split_pct}::numeric`, sql`${Money.of(-num(a.producer_split_minor), currency).toMajorString()}::numeric`, sql`'pending'`, sql`${"reversal:" + a.allocation_id}`]] : [];
      });
      if (negatives.length) await tx.execute(sql`INSERT INTO finance.producer_commission_splits (id, producer_id, policy_id, commission_amount_kes, split_pct, split_amount_kes, status, payment_reference) VALUES ${tuples(negatives)}`);
    }
  }
  return results;
}

/** Cleared money a client holds as credit goes to their newly raised invoices, oldest receipt first. */
async function applyClientCredit(tx: Tx, ctx: Ctx, config: EffectiveTenantConfig, clientId: string) {
  const credits = await rows<{ id: string }>(tx, sql`SELECT id FROM finance.receipts WHERE tenant_id = ${ctx.tenantId} AND client_id = ${clientId} AND status = 'cleared' AND holding_kind IS NOT NULL ORDER BY cleared_at, id`);
  for (const c of credits) {
    const receipt = await loadReceipt(tx, ctx, c.id, true);
    if (receipt.holding_kind !== "client_credit") continue; // suspense is never applied silently
    const available = num(receipt.amount_minor) - (await netAllocated(tx, receipt.id));
    if (available <= 0) continue;
    await runAllocation(tx, ctx, config, receipt, { strategy: config.finance.allocationStrategy, trigger: "credit_applied" });
  }
}

// ---------- receipts ----------

export interface NewReceipt {
  clientId: string;
  amountMinor: number;
  method: ReceiptMethod;
  reference?: string;
  instrumentNo?: string;
  drawerBank?: string;
  receivedAt?: string;
  idempotencyKey?: string;
}

export async function recordReceipt(ctx: Ctx, input: NewReceipt) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const currency = config.regional.currency;
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "amountMinor", message: "must be a positive whole number of minor units" }]);
  if (input.method === "cheque" && !input.instrumentNo) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "instrumentNo", message: "the cheque number is required for a cheque" }]);
  if (input.method !== "cheque" && input.instrumentNo) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "instrumentNo", message: "only cheques carry an instrument number" }]);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 24 * 3600 * 1000) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "receivedAt", message: "must be a valid time, not in the future" }]);

  const requestHash = hashOf({ ...input, idempotencyKey: undefined, receivedAt: input.receivedAt ?? null });
  const lookup = async (ex: Executor) => {
    if (!input.idempotencyKey) return null;
    const prior = await one<{ id: string; request_hash: string | null }>(ex, sql`SELECT id, request_hash FROM finance.receipts WHERE tenant_id = ${ctx.tenantId} AND idempotency_key = ${input.idempotencyKey}`);
    if (!prior) return null;
    if (prior.request_hash !== requestHash) throw new Problem(422, "idempotency-key-reused", "Idempotency key already used", "This key was used for a different request");
    return prior.id;
  };

  const attempt = () => db.transaction(async (tx) => {
    const replay = await lookup(tx);
    if (replay) return { id: replay, replayed: true };

    const client = await one(tx, sql`SELECT 1 AS ok FROM crm.parties WHERE id = ${input.clientId}`);
    if (!client) throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "clientId", message: "no such client" }]);

    const isCheque = input.method === "cheque";
    const id = newId("rct");
    const seq = await one<{ n: unknown }>(tx, sql`SELECT nextval('finance.receipt_no_seq') AS n`);
    const receiptNo = `RCT-${today(config).slice(0, 4)}-${String(num(seq!.n)).padStart(6, "0")}`;
    // With maker-checker on, nothing is treated as money until someone else approves: even cash or M-Pesa waits as 'received'.
    const approval = config.finance.receiptApproval === "required" ? "pending" : "not_required";
    const status: ReceiptStatus = isCheque || approval === "pending" ? "received" : "cleared";
    await tx.execute(sql`INSERT INTO finance.receipts (id, tenant_id, receipt_no, client_id, amount_minor, currency, method, reference, instrument_no, drawer_bank, status, received_at, cleared_at, config_version_id, idempotency_key, request_hash, recorded_by, approval_status)
      VALUES (${id}, ${ctx.tenantId}, ${receiptNo}, ${input.clientId}, ${input.amountMinor}, ${currency}, ${input.method}, ${input.reference ?? null}, ${input.instrumentNo ?? null}, ${input.drawerBank ?? null}, ${status}, ${receivedAt.toISOString()},
              ${status === "cleared" ? receivedAt.toISOString() : null}, ${config.versionId}, ${input.idempotencyKey ?? null}, ${requestHash}, ${ctx.staffId}, ${approval})`);
    await tx.execute(sql`INSERT INTO finance.receipt_events (receipt_id, from_status, to_status, actor_id, note) VALUES (${id}, NULL, ${status}, ${ctx.staffId}, 'recorded')`);
    await audit(tx, ctx, "RECEIPT_RECORDED", "receipt", id, { receiptNo, clientId: input.clientId, amountMinor: input.amountMinor, method: input.method, status, approval });
    if (status === "cleared") await onCleared(tx, ctx, config, await loadReceipt(tx, ctx, id, true));
    return { id, replayed: false };
  });

  let outcome: { id: string; replayed: boolean };
  try {
    outcome = await attempt();
  } catch (err) {
    // Two requests with the same key racing: the loser hits the unique index and simply replays the winner.
    if (pgCode(err) === "23505" && input.idempotencyKey) {
      const winner = await lookup(db as unknown as Executor);
      if (!winner) throw err;
      outcome = { id: winner, replayed: true };
    } else throw err;
  }
  return { ...(await getReceipt(ctx, outcome.id)), replayed: outcome.replayed };
}

/** Cleared money enters the ledger as a liability to the client, then is allocated by the tenant's default strategy. */
async function onCleared(tx: Tx, ctx: Ctx, config: EffectiveTenantConfig, receipt: ReceiptRow) {
  const amount = Money.of(num(receipt.amount_minor), receipt.currency);
  await postEntry(tx, {
    entryDate: today(config), description: `Receipt ${receipt.receipt_no} cleared`, sourceType: "receipt", sourceId: receipt.id, postedBy: ctx.staffId,
    lines: [
      { account: "1000", side: "debit", amount, partyId: receipt.client_id },
      { account: "2100", side: "credit", amount, partyId: receipt.client_id },
    ],
  });
  await runAllocation(tx, ctx, config, receipt, { strategy: config.finance.allocationStrategy, trigger: "on_clearing", idempotencyKey: `clear:${receipt.id}` });
}

export async function transitionReceipt(ctx: Ctx, receiptId: string, to: ReceiptStatus, note?: string) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const summary = await db.transaction(async (tx) => {
    const receipt = await loadReceipt(tx, ctx, receiptId, true);
    if (receipt.status === to) return { replayed: true as const };
    if (receipt.approval_status === "pending" && to !== "cancelled") {
      throw conflict("receipt-awaiting-approval", "Receipt is awaiting approval", "A different person must approve this receipt before it can be deposited, cleared or bounced");
    }
    if (!TRANSITIONS[receipt.status].includes(to)) {
      throw conflict("receipt-invalid-transition", "Receipt cannot make that change", `A ${receipt.status} receipt cannot become ${to}`, { allowed: TRANSITIONS[receipt.status] });
    }

    const stamp = { deposited: "deposited_at", cleared: "cleared_at", bounced: "bounced_at", cancelled: "cancelled_at" } as const;
    const column = stamp[to as keyof typeof stamp];
    let bounce: Awaited<ReturnType<typeof bounceReceipt>> | undefined;

    if (to === "bounced") bounce = await bounceReceipt(tx, ctx, config, receipt, note);
    await tx.execute(sql`UPDATE finance.receipts SET status = ${to}, ${sql.raw(column)} = now(), holding_kind = ${to === "bounced" || to === "cancelled" ? null : receipt.holding_kind}, updated_at = now() WHERE id = ${receipt.id}`);
    await tx.execute(sql`INSERT INTO finance.receipt_events (receipt_id, from_status, to_status, actor_id, note) VALUES (${receipt.id}, ${receipt.status}, ${to}, ${ctx.staffId}, ${note ?? null})`);
    await audit(tx, ctx, `RECEIPT_${to.toUpperCase()}`, "receipt", receipt.id, { status: to, ...(bounce ? { reversedAllocations: bounce.reversed } : {}) }, { status: receipt.status }, note);

    if (to === "cleared") await onCleared(tx, ctx, config, await loadReceipt(tx, ctx, receipt.id, true));
    return { replayed: false as const, bounce };
  });
  return { ...(await getReceipt(ctx, receiptId)), replayed: summary.replayed, ...("bounce" in summary && summary.bounce ? { bounce: summary.bounce } : {}) };
}

/** A returned cheque: take back everything it paid, claw back commission, reverse the ledger, charge the fee. */
async function bounceReceipt(tx: Tx, ctx: Ctx, config: EffectiveTenantConfig, receipt: ReceiptRow, note?: string) {
  const currency = receipt.currency;
  const reason = note?.trim() || `Receipt ${receipt.receipt_no} returned unpaid`;
  const reversed: { allocationId: string; invoiceId: string; amountMinor: number }[] = [];
  const touchedPolicies = new Set<string>();

  if (receipt.status === "cleared") {
    // Lock the invoices first, in the same order allocation uses, so a bounce cannot deadlock a concurrent receipt.
    await loadOpenInvoices(tx, ctx, receipt.client_id, currency);
    const batchId = newId("batch");
    await tx.execute(sql`INSERT INTO finance.allocation_batches (id, tenant_id, receipt_id, trigger, strategy, idempotency_key, request_hash, config_version_id, created_by)
      VALUES (${batchId}, ${ctx.tenantId}, ${receipt.id}, 'bounce_reversal', NULL, ${"bounce:" + receipt.id}, NULL, ${config.versionId}, ${ctx.staffId})`);
    const live = await rows<{ id: string }>(tx, sql`
      SELECT a.id FROM finance.allocations a
      WHERE a.receipt_id = ${receipt.id} AND a.kind = 'apply'
        AND NOT EXISTS (SELECT 1 FROM finance.allocations r WHERE r.reverses_allocation_id = a.id)
      ORDER BY a.id`);
    for (const r of await reverseAllocations(tx, ctx, config, live.map((a) => a.id), batchId, reason)) {
      reversed.push({ allocationId: r.allocationId, invoiceId: r.invoiceId, amountMinor: r.amount.minor });
      if (r.policyId) touchedPolicies.add(r.policyId);
    }
    const clearing = await entryFor(tx, "receipt", receipt.id);
    if (clearing) await reverseEntry(tx, clearing, today(config), reason, ctx.staffId, currency);
  }

  let feeInvoiceId: string | null = null;
  if (config.finance.returnedChequeFeeMinor > 0) {
    feeInvoiceId = await insertInvoice(tx, ctx, config, {
      kind: "fee", clientId: receipt.client_id, policyId: null, insurerId: null, productType: null, issueDate: today(config), dueDate: today(config),
      lines: [{ kind: "fee", code: "returned_cheque_fee", description: `Returned cheque fee for ${receipt.receipt_no}`, amount: Money.of(config.finance.returnedChequeFeeMinor, currency) }],
    });
  }
  return { reversed, reversedMinor: reversed.reduce((s, r) => s + r.amountMinor, 0), policiesNeedingReview: [...touchedPolicies], feeInvoiceId };
}

// ---------- manual allocation, preview and reversal ----------

export interface AllocationRequest {
  strategy: AllocationStrategy;
  manual?: { invoiceId: string; amountMinor: number }[];
}

const outcomeDto = (o: AllocationOutcome, config: EffectiveTenantConfig) => ({
  batchId: o.batchId, strategy: o.strategy, replayed: o.replayed, holdingKind: o.holdingKind, policiesActivated: o.policiesActivated,
  allocations: o.allocations.map((a) => ({
    allocationId: a.allocationId, invoiceId: a.invoiceId, invoiceNo: a.invoiceNo ?? null, amount: moneyDto(a.amount, config),
    lines: a.lines.map((l) => ({ lineId: l.lineId, kind: l.kind, amount: moneyDto(l.amount, config) })),
  })),
  remainder: moneyDto(o.remainder, config),
  stillOutstanding: moneyDto(o.stillOutstanding, config),
});

export async function allocateReceipt(ctx: Ctx, receiptId: string, req: AllocationRequest, opts: { dryRun?: boolean; idempotencyKey?: string }) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const currency = config.regional.currency;
  const manual = req.manual?.map((m) => ({ invoiceId: m.invoiceId, amount: Money.of(m.amountMinor, currency) }));
  const outcome = await db.transaction(async (tx) => {
    const receipt = await loadReceipt(tx, ctx, receiptId, true);
    return runAllocation(tx, ctx, config, receipt, {
      strategy: req.strategy, manual, trigger: "manual", idempotencyKey: opts.idempotencyKey, dryRun: opts.dryRun,
    });
  });
  return { ...outcomeDto(outcome, config), preview: Boolean(opts.dryRun), receipt: await getReceipt(ctx, receiptId) };
}

export async function reverseAllocation(ctx: Ctx, allocationId: string, reason: string) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const result = await db.transaction(async (tx) => {
    const orig = await one<{ receipt_id: string }>(tx, sql`SELECT receipt_id FROM finance.allocations WHERE id = ${allocationId} AND tenant_id = ${ctx.tenantId}`);
    if (!orig) throw notFound(`Allocation ${allocationId}`);
    const receipt = await loadReceipt(tx, ctx, orig.receipt_id, true);
    await loadOpenInvoices(tx, ctx, receipt.client_id, receipt.currency); // take the invoice locks in the standard order
    const batchId = newId("batch");
    await tx.execute(sql`INSERT INTO finance.allocation_batches (id, tenant_id, receipt_id, trigger, strategy, idempotency_key, request_hash, config_version_id, created_by)
      VALUES (${batchId}, ${ctx.tenantId}, ${receipt.id}, 'correction', NULL, NULL, NULL, ${config.versionId}, ${ctx.staffId})`);
    const [r] = await reverseAllocations(tx, ctx, config, [allocationId], batchId, reason);
    if (r.created) {
      const left = num(receipt.amount_minor) - (await netAllocated(tx, receipt.id));
      await tx.execute(sql`UPDATE finance.receipts SET holding_kind = ${left > 0 ? "suspense" : null}, updated_at = now() WHERE id = ${receipt.id}`);
      await audit(tx, ctx, "ALLOCATION_REVERSED", "allocation", allocationId, { reversalId: r.reversalId, amountMinor: r.amount.minor }, undefined, reason);
    }
    return { receiptId: receipt.id, reversalId: r.reversalId, amountMinor: r.amount.minor, replayed: !r.created };
  });
  return { ...result, receipt: await getReceipt(ctx, result.receiptId) };
}

// ---------- approval (maker-checker) ----------

/** Both decisions need someone other than the person who recorded the receipt — that is the whole point. */
function assertDifferentPerson(ctx: Ctx, receipt: ReceiptRow) {
  if (receipt.recorded_by && receipt.recorded_by === ctx.staffId) {
    throw new Problem(403, "approval-same-person", "You cannot decide your own receipt", "A different person must approve or reject a receipt you recorded. You can cancel it instead.");
  }
}

export async function approveReceipt(ctx: Ctx, receiptId: string, note?: string) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const replayed = await db.transaction(async (tx) => {
    const receipt = await loadReceipt(tx, ctx, receiptId, true);
    if (receipt.approval_status === "approved") return true; // idempotent: approving twice changes nothing
    if (receipt.approval_status !== "pending") throw conflict("receipt-not-pending", "Receipt is not awaiting approval", `This receipt is ${receipt.approval_status.replace("_", " ")}`);
    assertDifferentPerson(ctx, receipt);

    await tx.execute(sql`UPDATE finance.receipts SET approval_status = 'approved', approved_by = ${ctx.staffId}, approved_at = now(), approval_note = ${note ?? null}, updated_at = now() WHERE id = ${receipt.id}`);
    await tx.execute(sql`INSERT INTO finance.receipt_events (receipt_id, from_status, to_status, actor_id, note) VALUES (${receipt.id}, ${receipt.status}, 'approved', ${ctx.staffId}, ${note ?? null})`);
    await audit(tx, ctx, "RECEIPT_APPROVED", "receipt", receipt.id, { approvedBy: ctx.staffId, recordedBy: receipt.recorded_by }, { approval: "pending" }, note);

    // Cash, M-Pesa, bank and card money is cleared the moment it is approved. A cheque still has to be banked and clear.
    if (receipt.method !== "cheque") {
      await tx.execute(sql`UPDATE finance.receipts SET status = 'cleared', cleared_at = now(), updated_at = now() WHERE id = ${receipt.id}`);
      await tx.execute(sql`INSERT INTO finance.receipt_events (receipt_id, from_status, to_status, actor_id, note) VALUES (${receipt.id}, 'received', 'cleared', ${ctx.staffId}, 'cleared on approval')`);
      await onCleared(tx, ctx, config, await loadReceipt(tx, ctx, receipt.id, true));
    }
    return false;
  });
  return { ...(await getReceipt(ctx, receiptId)), replayed };
}

export async function rejectReceipt(ctx: Ctx, receiptId: string, reason: string) {
  const replayed = await db.transaction(async (tx) => {
    const receipt = await loadReceipt(tx, ctx, receiptId, true);
    if (receipt.approval_status === "rejected") return true;
    if (receipt.approval_status !== "pending") throw conflict("receipt-not-pending", "Receipt is not awaiting approval", `This receipt is ${receipt.approval_status.replace("_", " ")}`);
    assertDifferentPerson(ctx, receipt);

    // refused: no money ever moved, so the receipt is simply voided
    await tx.execute(sql`UPDATE finance.receipts SET approval_status = 'rejected', approved_by = ${ctx.staffId}, approved_at = now(), approval_note = ${reason}, status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = ${receipt.id}`);
    await tx.execute(sql`INSERT INTO finance.receipt_events (receipt_id, from_status, to_status, actor_id, note) VALUES (${receipt.id}, ${receipt.status}, 'rejected', ${ctx.staffId}, ${reason}), (${receipt.id}, 'received', 'cancelled', ${ctx.staffId}, 'rejected at approval')`);
    await audit(tx, ctx, "RECEIPT_REJECTED", "receipt", receipt.id, { rejectedBy: ctx.staffId, recordedBy: receipt.recorded_by }, { approval: "pending" }, reason);
    return false;
  });
  return { ...(await getReceipt(ctx, receiptId)), replayed };
}

// ---------- reads ----------

export interface Page { limit: number; offset: number; q: string }
const likePattern = (q: string) => `%${q.replace(/[!%_]/g, (c) => "!" + c)}%`;

export async function listReceipts(ctx: Ctx, page: Page, filter: { status?: string; clientId?: string; method?: string; holding?: string; from?: string; to?: string; approval?: string; approvedOnly?: boolean }) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const where = [sql`r.tenant_id = ${ctx.tenantId}`];
  if (filter.status) where.push(sql`r.status = ${filter.status}`);
  if (filter.clientId) where.push(sql`r.client_id = ${filter.clientId}`);
  if (filter.method) where.push(sql`r.method = ${filter.method}`);
  if (filter.approval) where.push(sql`r.approval_status = ${filter.approval}`);
  if (filter.approvedOnly) where.push(sql`r.approval_status IN ('not_required','approved')`);
  if (filter.holding === "any") where.push(sql`r.status = 'cleared' AND r.holding_kind IS NOT NULL`);
  else if (filter.holding) where.push(sql`r.status = 'cleared' AND r.holding_kind = ${filter.holding}`);
  if (filter.from) where.push(sql`r.received_at >= ${filter.from}::timestamptz`);
  if (filter.to) where.push(sql`r.received_at < ${filter.to}::timestamptz`);
  if (page.q) {
    const p = likePattern(page.q);
    where.push(sql`(r.receipt_no ILIKE ${p} ESCAPE '!' OR r.reference ILIKE ${p} ESCAPE '!' OR r.instrument_no ILIKE ${p} ESCAPE '!' OR p.full_name ILIKE ${p} ESCAPE '!')`);
  }
  const cond = sql.join(where, sql` AND `);
  const [list, total] = await Promise.all([
    rows<ReceiptRow>(db as unknown as Executor, sql`${RECEIPT_SELECT} WHERE ${cond} ORDER BY r.received_at DESC, r.id LIMIT ${page.limit} OFFSET ${page.offset}`),
    one<{ n: unknown }>(db as unknown as Executor, sql`SELECT COUNT(*) AS n FROM finance.receipts r LEFT JOIN crm.parties p ON p.id = r.client_id WHERE ${cond}`),
  ]);
  return { rows: list.map((r) => receiptDto(r, config)), total: num(total?.n) };
}

export async function getReceipt(ctx: Ctx, id: string, scopeClientId?: string) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const r = await loadReceipt(db as unknown as Executor, ctx, id, false, scopeClientId);
  const [events, allocations] = await Promise.all([
    rows<{ from_status: string | null; to_status: string; occurred_at: unknown; actor_id: string | null; note: string | null }>(db as unknown as Executor, sql`SELECT from_status, to_status, occurred_at, actor_id, note FROM finance.receipt_events WHERE receipt_id = ${id} ORDER BY id`),
    rows<{ id: string; invoice_id: string; invoice_no: string; kind: string; amount_minor: unknown; currency: string; reverses_allocation_id: string | null; reason: string | null; created_at: unknown }>(
      db as unknown as Executor, sql`SELECT a.id, a.invoice_id, i.invoice_no, a.kind, a.amount_minor, a.currency, a.reverses_allocation_id, a.reason, a.created_at
        FROM finance.allocations a JOIN finance.invoices i ON i.id = a.invoice_id WHERE a.receipt_id = ${id} ORDER BY a.created_at, a.id`),
  ]);
  return {
    ...receiptDto(r, config),
    events: events.map((e) => ({ from: e.from_status, to: e.to_status, at: iso(e.occurred_at), actorId: e.actor_id, note: e.note })),
    allocations: allocations.map((a) => ({
      id: a.id, invoiceId: a.invoice_id, invoiceNo: a.invoice_no, kind: a.kind, amount: moneyDto(Money.of(num(a.amount_minor), a.currency), config),
      reversesAllocationId: a.reverses_allocation_id, reason: a.reason, at: iso(a.created_at),
    })),
  };
}

interface InvoiceRow { id: string; invoice_no: string; kind: string; policy_id: string | null; client_id: string; client_name: string | null; product_type: string | null; currency: string; issue_date: string; due_date: string; total_minor: unknown; status: string; paid_minor: unknown; config_version_id: string }
const INVOICE_SELECT = sql`
  SELECT i.id, i.invoice_no, i.kind, i.policy_id, i.client_id, p.full_name AS client_name, i.product_type, i.currency,
         to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.total_minor, i.status, i.config_version_id, i.paid_minor
  FROM finance.invoices i LEFT JOIN crm.parties p ON p.id = i.client_id`;

function invoiceDto(r: InvoiceRow, c: EffectiveTenantConfig) {
  const total = Money.of(num(r.total_minor), r.currency);
  const paid = Money.of(num(r.paid_minor), r.currency);
  const outstanding = r.status === "void" ? Money.zero(r.currency) : total.sub(paid);
  const overdue = r.status === "open" && outstanding.isPositive() && r.due_date < today(c);
  return {
    id: r.id, invoiceNo: r.invoice_no, kind: r.kind, policyId: r.policy_id, clientId: r.client_id, clientName: r.client_name, productType: r.product_type,
    issueDate: r.issue_date, dueDate: r.due_date, status: r.status === "void" ? "void" : outstanding.isZero() ? "paid" : paid.isPositive() ? "part_paid" : overdue ? "overdue" : "open",
    total: moneyDto(total, c), paid: moneyDto(paid, c), outstanding: moneyDto(outstanding, c), overdue, configVersionId: r.config_version_id,
  };
}

export async function listInvoices(ctx: Ctx, page: Page, filter: { clientId?: string; policyId?: string; state?: string }) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const where = [sql`i.tenant_id = ${ctx.tenantId}`];
  if (filter.clientId) where.push(sql`i.client_id = ${filter.clientId}`);
  if (filter.policyId) where.push(sql`i.policy_id = ${filter.policyId}`);
  if (filter.state === "open") where.push(sql`i.status = 'open' AND i.paid_minor < i.total_minor`);
  if (filter.state === "paid") where.push(sql`i.status = 'open' AND i.paid_minor = i.total_minor`);
  if (page.q) {
    const p = likePattern(page.q);
    where.push(sql`(i.invoice_no ILIKE ${p} ESCAPE '!' OR i.policy_id ILIKE ${p} ESCAPE '!' OR p.full_name ILIKE ${p} ESCAPE '!')`);
  }
  const cond = sql.join(where, sql` AND `);
  const [list, total] = await Promise.all([
    rows<InvoiceRow>(db as unknown as Executor, sql`${INVOICE_SELECT} WHERE ${cond} ORDER BY i.due_date, i.id LIMIT ${page.limit} OFFSET ${page.offset}`),
    one<{ n: unknown }>(db as unknown as Executor, sql`SELECT COUNT(*) AS n FROM finance.invoices i LEFT JOIN crm.parties p ON p.id = i.client_id WHERE ${cond}`),
  ]);
  return { rows: list.map((r) => invoiceDto(r, config)), total: num(total?.n) };
}

export async function getInvoice(ctx: Ctx, id: string, scopeClientId?: string) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const scope = scopeClientId ? sql`AND i.client_id = ${scopeClientId}` : sql``;
  const r = await one<InvoiceRow>(db as unknown as Executor, sql`${INVOICE_SELECT} WHERE i.id = ${id} AND i.tenant_id = ${ctx.tenantId} ${scope}`);
  if (!r) throw notFound(`Invoice ${id}`);
  const lines = await rows<{ id: string; kind: string; code: string; description: string; amount_minor: unknown; paid_minor: unknown }>(db as unknown as Executor, sql`
    SELECT l.id, l.kind, l.code, l.description, l.amount_minor, COALESCE((SELECT SUM(al.amount_minor) FROM finance.allocation_lines al WHERE al.invoice_line_id = l.id), 0) AS paid_minor
    FROM finance.invoice_lines l WHERE l.invoice_id = ${id} ORDER BY l.sort_order, l.id`);
  return {
    ...invoiceDto(r, config),
    lines: lines.map((l) => {
      const amount = Money.of(num(l.amount_minor), r.currency);
      const paid = Money.of(num(l.paid_minor), r.currency);
      return { id: l.id, kind: l.kind, code: l.code, description: l.description, amount: moneyDto(amount, config), paid: moneyDto(paid, config), outstanding: moneyDto(amount.sub(paid), config) };
    }),
  };
}

/** A client's whole position at a glance: what they owe, what we hold for them, and what is in flight. */
export async function clientPosition(ctx: Ctx, clientId: string, opts: { forClient?: boolean } = {}) {
  const config = await getEffectiveConfig(ctx.tenantId);
  const currency = config.regional.currency;
  const client = await one<{ id: string; full_name: string }>(db as unknown as Executor, sql`SELECT id, full_name FROM crm.parties WHERE id = ${clientId}`);
  if (!client) throw notFound(`Client ${clientId}`);
  const [invoices, held, pending] = await Promise.all([
    rows<InvoiceRow>(db as unknown as Executor, sql`${INVOICE_SELECT} WHERE i.tenant_id = ${ctx.tenantId} AND i.client_id = ${clientId} AND i.status = 'open' ORDER BY i.due_date, i.id`),
    rows<ReceiptRow>(db as unknown as Executor, sql`${RECEIPT_SELECT} WHERE r.tenant_id = ${ctx.tenantId} AND r.client_id = ${clientId} AND r.status = 'cleared' AND r.holding_kind IS NOT NULL ORDER BY r.cleared_at`),
    rows<ReceiptRow>(db as unknown as Executor, sql`${RECEIPT_SELECT} WHERE r.tenant_id = ${ctx.tenantId} AND r.client_id = ${clientId} AND r.status IN ('received','deposited') ${opts.forClient ? sql`AND r.approval_status IN ('not_required','approved')` : sql``} ORDER BY r.received_at`),
  ]);
  const inv = invoices.map((r) => invoiceDto(r, config));
  const open = inv.filter((i) => i.outstanding.amountMinor > 0);
  const owed = open.reduce((s, i) => s + i.outstanding.amountMinor, 0);
  const heldDtos = held.map((r) => receiptDto(r, config)).filter((r) => r.unallocated.amountMinor > 0);
  const sumHeld = (kind: string) => heldDtos.filter((r) => r.holdingKind === kind).reduce((s, r) => s + r.unallocated.amountMinor, 0);
  return {
    clientId, clientName: client.full_name,
    outstanding: moneyDto(Money.of(owed, currency), config),
    suspense: moneyDto(Money.of(sumHeld("suspense"), currency), config),
    clientCredit: moneyDto(Money.of(sumHeld("client_credit"), currency), config),
    invoices: open, heldReceipts: heldDtos, pendingReceipts: pending.map((r) => receiptDto(r, config)),
  };
}

export { getConfigVersion };
