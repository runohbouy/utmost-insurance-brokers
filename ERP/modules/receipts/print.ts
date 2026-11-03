// ---------------------------------------------------------------------------
// The printable receipt. Server-rendered HTML so the document is the same whoever
// prints it and could just as well be emailed later: no scripts, every value
// escaped, brand colours and fonts from the tenant's configuration, dates in the
// tenant's own time zone.
//
// Receipts are controlled documents:
//   * the amount appears in words as well as figures
//   * the first print is the ORIGINAL; every later print says DUPLICATE and its
//     copy number (counted from the audit log, so it cannot be reset)
//   * a receipt that is not (yet) real money says so across the page — awaiting
//     approval, cheque not cleared, returned unpaid, cancelled, rejected
// ---------------------------------------------------------------------------
import { db } from "../../db/client";
import { amountInWords } from "../../lib/amountInWords";
import { getEffectiveConfig } from "../../lib/config/service";
import { Money } from "../../lib/money";
import { one, rows, sql, type Executor } from "../../lib/sql";
import { clientPosition, getReceipt, type Ctx } from "./service";

const ex = db as unknown as Executor;

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const METHOD_LABEL: Record<string, string> = { cash: "Cash", mpesa: "M-Pesa", bank: "Bank transfer", card: "Card", cheque: "Cheque" };

/** What, if anything, makes this receipt not yet (or no longer) valid. */
function validity(r: Awaited<ReturnType<typeof getReceipt>>): { text: string; tone: "warn" | "bad" } | null {
  if (r.approvalStatus === "pending") return { text: "NOT VALID — AWAITING APPROVAL", tone: "warn" };
  if (r.approvalStatus === "rejected") return { text: "REJECTED — NOT VALID", tone: "bad" };
  if (r.status === "cancelled") return { text: "CANCELLED", tone: "bad" };
  if (r.status === "bounced") return { text: "CHEQUE RETURNED UNPAID — NOT VALID", tone: "bad" };
  if (r.status === "received" || r.status === "deposited") return { text: "PROVISIONAL — CHEQUE NOT YET CLEARED", tone: "warn" };
  return null;
}

export async function printReceipt(ctx: Ctx, receiptId: string): Promise<{ html: string; copy: number }> {
  const config = await getEffectiveConfig(ctx.tenantId);
  const r = await getReceipt(ctx, receiptId);
  const [client, people, prior, position] = await Promise.all([
    one<{ full_name: string; physical_address: string | null; county: string | null; phone_number: string | null; email: string | null; kra_pin: string | null }>(
      ex, sql`SELECT full_name, physical_address, county, phone_number, email, kra_pin FROM crm.parties WHERE id = ${r.clientId}`),
    rows<{ id: string; full_name: string }>(ex, sql`SELECT id, full_name FROM access.staff WHERE id IN (${r.recordedBy}, ${r.approvedBy})`),
    one<{ n: unknown }>(ex, sql`SELECT COUNT(*) AS n FROM compliance.audit_log WHERE action = 'RECEIPT_PRINTED' AND entity_type = 'receipt' AND entity_id = ${receiptId}`),
    clientPosition(ctx, r.clientId),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const copy = Number(prior?.n ?? 0);
  await ex.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, after_state)
    VALUES (${ctx.staffId}, 'RECEIPT_PRINTED', 'receipt', ${receiptId}, ${JSON.stringify({ copy: copy + 1 })}::jsonb)`);

  const { locale } = config.localization;
  const zone = config.regional.timeZone;
  const stamp = (at: string | null) => (at ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: zone }).format(new Date(at)) : "");
  const dateOnly = (at: string | null) => (at ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: zone }).format(new Date(at)) : "");

  // what this receipt paid, per invoice, net of anything reversed
  const paid = new Map<string, { invoiceNo: string; minor: number }>();
  for (const a of r.allocations) {
    const cur = paid.get(a.invoiceId) ?? { invoiceNo: a.invoiceNo, minor: 0 };
    cur.minor += a.amount.amountMinor;
    paid.set(a.invoiceId, cur);
  }
  const applied = [...paid.values()].filter((p) => p.minor > 0);
  const money = (minor: number) => esc(Money.of(minor, r.amount.currency).format(locale));

  const b = config.brand;
  const flag = validity(r);
  const copyLabel = copy === 0 ? "ORIGINAL" : `DUPLICATE — COPY ${copy + 1}`;
  const owing = position.outstanding.amountMinor;

  const html = `<!doctype html>
<html lang="${esc(locale.split("-")[0])}">
<head>
<meta charset="utf-8">
<title>Receipt ${esc(r.receiptNo)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${esc(b.fontFamily)}; color: ${esc(b.textColor)}; background: ${esc(b.surfaceColor)}; font-size: 13px; line-height: 1.45; }
  .sheet { max-width: 760px; margin: 0 auto; padding: 24px; position: relative; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid ${esc(b.primaryColor)}; padding-bottom: 12px; }
  h1 { margin: 0; font-size: 22px; color: ${esc(b.primaryColor)}; letter-spacing: .02em; }
  .doc { text-align: right; }
  .doc .no { font-size: 18px; font-weight: 700; }
  .copy { display: inline-block; margin-top: 4px; padding: 2px 8px; border: 1px solid ${esc(b.textColor)}; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
  .flag { margin: 14px 0 0; padding: 8px 12px; font-weight: 700; text-align: center; letter-spacing: .06em; border: 2px solid; }
  .flag.warn { color: #8a5a00; border-color: #8a5a00; background: #fff6e0; }
  .flag.bad { color: #a11d1d; border-color: #a11d1d; background: #fdeaea; }
  dl { display: grid; grid-template-columns: 170px 1fr; gap: 6px 14px; margin: 16px 0; }
  dt { color: #5c5c5c; }
  dd { margin: 0; font-weight: 600; word-break: break-word; }
  .amount { display: flex; justify-content: space-between; align-items: center; gap: 16px; border: 2px solid ${esc(b.primaryColor)}; padding: 12px 16px; margin: 8px 0; }
  .amount .fig { font-size: 24px; font-weight: 800; color: ${esc(b.primaryColor)}; white-space: nowrap; }
  .words { font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #d6d6d6; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5c5c5c; }
  td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: ${esc(b.primaryColor)}; margin: 18px 0 2px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 38px; }
  .sign div { border-top: 1px solid ${esc(b.textColor)}; padding-top: 4px; font-size: 12px; }
  .sign small { display: block; color: #5c5c5c; }
  footer { margin-top: 26px; border-top: 1px solid #d6d6d6; padding-top: 8px; font-size: 11px; color: #5c5c5c; display: flex; justify-content: space-between; gap: 12px; }
  @media print { body { background: #fff; } .sheet { padding: 0; max-width: none; } }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <div><h1>${esc(b.displayName)}</h1><div>Official receipt</div></div>
    <div class="doc"><div class="no">${esc(r.receiptNo)}</div><div>${esc(dateOnly(r.receivedAt))}</div><span class="copy">${esc(copyLabel)}</span></div>
  </header>
  ${flag ? `<div class="flag ${flag.tone}" role="status">${esc(flag.text)}</div>` : ""}

  <dl>
    <dt>Received from</dt><dd>${esc(client?.full_name ?? r.clientName ?? r.clientId)}</dd>
    ${client?.physical_address || client?.county ? `<dt>Address</dt><dd>${esc([client?.physical_address, client?.county].filter(Boolean).join(", "))}</dd>` : ""}
    ${client?.kra_pin ? `<dt>PIN</dt><dd>${esc(client.kra_pin)}</dd>` : ""}
    <dt>Payment method</dt><dd>${esc(METHOD_LABEL[r.method] ?? r.method)}${r.instrumentNo ? ` — cheque no. ${esc(r.instrumentNo)}` : ""}${r.drawerBank ? ` (${esc(r.drawerBank)})` : ""}</dd>
    ${r.reference ? `<dt>Reference</dt><dd>${esc(r.reference)}</dd>` : ""}
    <dt>Received on</dt><dd>${esc(stamp(r.receivedAt))}</dd>
    ${r.clearedAt && r.method === "cheque" ? `<dt>Cheque cleared</dt><dd>${esc(stamp(r.clearedAt))}</dd>` : ""}
  </dl>

  <div class="amount"><span>Amount received</span><span class="fig">${esc(r.amount.display)}</span></div>
  <p class="words">${esc(amountInWords(r.amount.amountMinor, r.amount.currency))}</p>

  <h2>Applied to</h2>
  ${applied.length === 0
    ? `<p>${r.status === "cleared" ? "Held on account; not yet applied to an invoice." : "Not applied to any invoice."}</p>`
    : `<table><thead><tr><th>Invoice</th><th class="r">Amount</th></tr></thead><tbody>${applied.map((p) => `<tr><td>${esc(p.invoiceNo)}</td><td class="r">${money(p.minor)}</td></tr>`).join("")}</tbody></table>`}
  ${r.unallocated.amountMinor > 0 ? `<p>Held on account: <strong>${esc(r.unallocated.display)}</strong></p>` : ""}
  <p>Balance still owing on your account: <strong>${money(owing)}</strong></p>

  <div class="sign">
    <div>${esc(names.get(r.recordedBy ?? "") ?? "")}<small>Received by</small></div>
    <div>${esc(r.approvedBy ? names.get(r.approvedBy) ?? "" : "")}<small>${r.approvalStatus === "not_required" ? "Authorised signature" : "Approved by"}${r.approvedAt ? ` — ${esc(stamp(r.approvedAt))}` : ""}</small></div>
  </div>

  <footer>
    <span>${esc(b.displayName)} · receipt ${esc(r.receiptNo)} · printed ${esc(stamp(new Date().toISOString()))}</span>
    <span>${esc(copyLabel)}</span>
  </footer>
</div>
</body>
</html>`;
  return { html, copy: copy + 1 };
}

