import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { ClientPosition, ReceiptDetail, ReceiptStatus } from "../../financeTypes";
import StatusPill from "../StatusPill";
import { ErrorNotice, ReasonDialog, Stat, SuccessNotice, secondaryButton, dangerButton, primaryButton } from "../ui";
import { printHtml } from "../../printHtml";
import AllocationPanel from "./AllocationPanel";
import { EVENT_LABEL, HOLDING_LABEL, RECEIPT_LABEL, RECEIPT_TONE } from "./statusTone";

type Action = "deposit" | "clear" | "bounce" | "cancel";

const ACTIONS: Record<ReceiptStatus, { action: Action; label: string; tone: "primary" | "danger" | "secondary" }[]> = {
  received: [{ action: "deposit", label: "Mark deposited", tone: "primary" }, { action: "cancel", label: "Cancel receipt", tone: "secondary" }],
  deposited: [{ action: "clear", label: "Mark cleared", tone: "primary" }, { action: "bounce", label: "Cheque bounced", tone: "danger" }, { action: "cancel", label: "Cancel receipt", tone: "secondary" }],
  cleared: [{ action: "bounce", label: "Mark as bounced", tone: "danger" }],
  bounced: [], cancelled: [],
};

const DIALOG: Record<Action, { title: string; confirm: string; intro: (r: ReceiptDetail, money: (n: number) => string) => string; reason: boolean; danger: boolean }> = {
  deposit: { title: "Mark as deposited", confirm: "Mark deposited", intro: () => "The cheque has been banked. Nothing is allocated until it clears.", reason: false, danger: false },
  clear: { title: "Mark as cleared", confirm: "Mark cleared", intro: (r, m) => `${m(r.amount.amountMinor)} will be treated as cleared money and allocated to the client's open invoices using the tenant's default strategy.`, reason: false, danger: false },
  bounce: {
    title: "Mark as bounced", confirm: "Mark bounced",
    intro: (r, m) => r.status === "cleared"
      ? `Everything this receipt paid (${m(r.allocated.amountMinor)}) will be taken back: invoices return to their earlier balances, commission and ledger entries are reversed, and the tenant's returned-cheque fee (if any) is invoiced. This cannot be undone.`
      : "The cheque was returned before it cleared, so nothing was allocated and there is nothing to reverse.",
    reason: true, danger: true,
  },
  cancel: { title: "Cancel receipt", confirm: "Cancel receipt", intro: () => "The receipt is voided. No money has been allocated, so nothing needs to be reversed.", reason: true, danger: true },
};

const awaitingPill = (r: ReceiptDetail) => r.approvalStatus === "pending"
  ? <StatusPill status="Awaiting approval" tone="warning" />
  : <StatusPill status={RECEIPT_LABEL[r.status]} tone={RECEIPT_TONE[r.status]} />;

export default function ReceiptDetailView({ receiptId, onBack, canRecord, canAllocate, canApprove, staffId, onChanged }: {
  receiptId: string; onBack: () => void; canRecord: boolean; canAllocate: boolean; canApprove: boolean; staffId: string; onChanged: () => void;
}) {
  const tenant = useTenant();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [position, setPosition] = useState<ClientPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.receipts.get(receiptId);
      setReceipt(r);
      setPosition(await api.clients.position(r.clientId));
    } catch (err: any) { setError(err.message); }
  }, [receiptId]);
  useEffect(() => { load(); }, [load]);

  if (!receipt) return <div className="space-y-3"><button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Back to receipts</button>{error ? <ErrorNotice message={error} /> : <p className="text-slate-400">Loading…</p>}</div>;

  const reversed = new Set(receipt.allocations.filter((a) => a.kind === "reversal").map((a) => a.reversesAllocationId));
  const awaiting = receipt.approvalStatus === "pending";
  // while a receipt waits for approval the only thing its maker can do is withdraw it
  const actions = canRecord ? (awaiting ? ACTIONS[receipt.status].filter((a) => a.action === "cancel") : ACTIONS[receipt.status]) : [];
  const isMaker = receipt.recordedBy === staffId;
  const canAllocateNow = canAllocate && receipt.status === "cleared" && receipt.unallocated.amountMinor > 0;

  async function doAction(action: Action, note: string) {
    setError(null);
    try {
      const updated = await api.receipts.transition(receipt!.id, action, note);
      setPending(null);
      setReceipt(updated);
      setPosition(await api.clients.position(updated.clientId));
      const bounce = updated.bounce;
      setMessage(
        action === "bounce" && bounce
          ? `Receipt bounced. ${bounce.reversed.length} allocation${bounce.reversed.length === 1 ? "" : "s"} reversed (${tenant.money(bounce.reversedMinor)})${bounce.feeInvoiceId ? " and a returned-cheque fee was invoiced" : ""}.`
          : `Receipt is now ${RECEIPT_LABEL[updated.status].toLowerCase()}.`,
      );
      onChanged();
    } catch (err: any) { setPending(null); setError(err.message); }
  }

  async function decide(kind: "approve" | "reject", note: string) {
    try {
      const updated = kind === "approve" ? await api.receipts.approve(receipt!.id, note) : await api.receipts.reject(receipt!.id, note);
      setDeciding(null);
      setReceipt(updated);
      setPosition(await api.clients.position(updated.clientId));
      setMessage(kind === "approve"
        ? (updated.status === "cleared" ? `Approved. ${tenant.money(updated.allocated)} was allocated to the client's invoices.` : "Approved. The cheque can now be deposited.")
        : "Rejected. The receipt is cancelled and no money moved.");
      onChanged();
    } catch (err: any) { setDeciding(null); setError(err.message); }
  }

  async function printIt() {
    setPrinting(true); setError(null);
    try {
      const { html, copy } = await api.receipts.print(receipt!.id);
      await printHtml(html);
      setMessage(copy === 1 ? "Sent to the printer as the original." : `Sent to the printer as duplicate copy ${copy}.`);
    } catch (err: any) { setError(err.message); } finally { setPrinting(false); }
  }

  async function doReverse(allocationId: string, reason: string) {
    try {
      const r = await api.allocations.reverse(allocationId, reason);
      setReversing(null);
      setReceipt(r.receipt);
      setPosition(await api.clients.position(r.receipt.clientId));
      setMessage("Allocation reversed. The money is unallocated again and the invoice owes it once more.");
      onChanged();
    } catch (err: any) { setReversing(null); setError(err.message); }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Back to receipts</button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">{receipt.receiptNo} {awaitingPill(receipt)}</h2>
          <p className="text-sm text-slate-500">{receipt.clientName ?? receipt.clientId} · {receipt.method}{receipt.instrumentNo ? ` · cheque ${receipt.instrumentNo}` : ""}{receipt.reference ? ` · ${receipt.reference}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={printIt} disabled={printing} className={secondaryButton}>{printing ? "Preparing…" : "Print receipt"}</button>
          {actions.map((a) => (
            <button key={a.action} type="button" onClick={() => setPending(a.action)} className={a.tone === "primary" ? primaryButton : a.tone === "danger" ? dangerButton : secondaryButton}>{a.label}</button>
          ))}
        </div>
      </div>

      <ErrorNotice message={error} onDismiss={() => setError(null)} />
      <SuccessNotice message={message} />

      {awaiting && (
        <div role="region" aria-label="Approval needed" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="max-w-xl">
            <span className="font-semibold">Awaiting approval.</span> This receipt is not treated as money yet: it is not cleared, not allocated and not in the ledger.
            {isMaker ? " You recorded it, so someone else must approve it (you can still cancel it)." : canApprove ? " Check it against the bank or M-Pesa record, then approve or reject it." : " A person with approval rights must decide."}
          </p>
          {canApprove && !isMaker && (
            <div className="flex gap-2">
              <button type="button" className={primaryButton} onClick={() => setDeciding("approve")}>Approve</button>
              <button type="button" className={dangerButton} onClick={() => setDeciding("reject")}>Reject</button>
            </div>
          )}
        </div>
      )}
      {receipt.approvalStatus === "approved" && receipt.approvedBy && <p className="text-xs text-slate-500">Approved {tenant.dateTime(receipt.approvedAt)}{receipt.approvalNote ? ` — ${receipt.approvalNote}` : ""}.</p>}
      {receipt.approvalStatus === "rejected" && <p className="text-xs text-rose-700">Rejected {tenant.dateTime(receipt.approvedAt)}{receipt.approvalNote ? ` — ${receipt.approvalNote}` : ""}.</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Amount" value={tenant.money(receipt.amount)} />
        <Stat label="Allocated" value={tenant.money(receipt.allocated)} tone={receipt.allocated.amountMinor > 0 ? "good" : "neutral"} />
        <Stat label="Unallocated" value={tenant.money(receipt.unallocated)} tone={receipt.unallocated.amountMinor > 0 ? "warning" : "neutral"} hint={receipt.holdingKind ? HOLDING_LABEL[receipt.holdingKind] : undefined} />
        <Stat label="Client owes" value={position ? tenant.money(position.outstanding) : "…"} tone={position && position.outstanding.amountMinor > 0 ? "critical" : "neutral"} hint="across all open invoices" />
      </div>

      {canAllocateNow && <AllocationPanel receipt={receipt} onApplied={(r, msg) => { setReceipt(r); setMessage(msg); onChanged(); }} />}

      <section aria-label="Allocations" className="rounded-lg border border-slate-200 bg-white">
        <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">Allocations</h3>
        {receipt.allocations.length === 0 ? <p className="px-4 py-4 text-sm text-slate-400">{receipt.status === "cleared" ? "Nothing has been allocated yet." : "Money is allocated only once the receipt has cleared."}</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2 font-medium">When</th><th scope="col" className="px-4 py-2 font-medium">Invoice</th><th scope="col" className="px-4 py-2 font-medium">Type</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th><th scope="col" className="px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {receipt.allocations.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-600">{tenant.dateTime(a.at)}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{a.invoiceNo}</td>
                  <td className="px-4 py-2">{a.kind === "apply" ? (reversed.has(a.id) ? <span className="text-slate-400 line-through">Applied</span> : "Applied") : <span className="text-rose-700">Reversal{a.reason ? ` — ${a.reason}` : ""}</span>}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${a.kind === "reversal" ? "text-rose-700" : ""}`}>{tenant.money(a.amount)}</td>
                  <td className="px-4 py-2 text-right">
                    {canAllocate && a.kind === "apply" && !reversed.has(a.id) && receipt.status === "cleared" && (
                      <button type="button" onClick={() => setReversing(a.id)} className="text-xs font-medium text-rose-700 hover:underline">Reverse</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="History" className="rounded-lg border border-slate-200 bg-white">
        <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">History</h3>
        <ol className="divide-y divide-slate-100 text-sm">
          {receipt.events.map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2">
              <span><span className="font-medium text-slate-800">{e.from && !EVENT_LABEL[e.to] ? `${RECEIPT_LABEL[e.from as ReceiptStatus] ?? e.from} → ` : ""}{EVENT_LABEL[e.to] ?? RECEIPT_LABEL[e.to as ReceiptStatus] ?? e.to}</span>{e.note && <span className="ml-2 text-slate-500">{e.note}</span>}</span>
              <span className="shrink-0 text-xs text-slate-400">{tenant.dateTime(e.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {pending && (
        <ReasonDialog
          title={DIALOG[pending].title} confirmLabel={DIALOG[pending].confirm} requireReason={DIALOG[pending].reason && receipt.status === "cleared"} danger={DIALOG[pending].danger}
          intro={DIALOG[pending].intro(receipt, (n) => tenant.money(n))} onClose={() => setPending(null)} onConfirm={(note) => doAction(pending, note)}
        />
      )}
      {deciding && (
        <ReasonDialog
          title={deciding === "approve" ? "Approve receipt" : "Reject receipt"} confirmLabel={deciding === "approve" ? "Approve" : "Reject receipt"} requireReason={deciding === "reject"} danger={deciding === "reject"}
          intro={deciding === "approve"
            ? (receipt.method === "cheque" ? "The cheque is approved but is still not money until it has been deposited and has cleared." : `${tenant.money(receipt.amount)} will be treated as cleared money and allocated to the client's open invoices.`)
            : "The receipt will be cancelled. No money has moved, so there is nothing to reverse."}
          onClose={() => setDeciding(null)} onConfirm={(note) => decide(deciding, note)}
        />
      )}
      {reversing && (
        <ReasonDialog
          title="Reverse allocation" confirmLabel="Reverse allocation" requireReason danger onClose={() => setReversing(null)}
          intro="The invoice will owe this amount again, commission and ledger entries are reversed, and the money returns to this receipt as unallocated. The original is kept in the history."
          onConfirm={(reason) => doReverse(reversing, reason)}
        />
      )}
    </div>
  );
}
