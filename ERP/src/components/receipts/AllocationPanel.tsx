import { useEffect, useRef, useState } from "react";
import { api, newIdempotencyKey } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { AllocationOutcome, AllocationStrategy, ClientPosition, ReceiptDetail } from "../../financeTypes";
import { ErrorNotice, Field, inputClass, primaryButton, secondaryButton } from "../ui";

const STRATEGIES: { id: AllocationStrategy; label: string; help: string }[] = [
  { id: "fifo", label: "Oldest first (FIFO)", help: "Pays invoices in due-date order." },
  { id: "policy_priority", label: "Policy priority", help: "Pays the policies the tenant ranked first, then the rest oldest first." },
  { id: "product_type_priority", label: "Product-type priority", help: "Pays the lines of business the tenant ranked first." },
  { id: "pro_rata", label: "Pro-rata", help: "Shares the money across all open invoices in proportion to what each owes." },
  { id: "manual", label: "Manual", help: "You choose exactly how much goes to each invoice; the rest stays unallocated." },
  { id: "hybrid", label: "Manual, then automatic", help: "Your amounts first, then the remainder is spread by the tenant's default rule." },
];

/**
 * Apply a cleared receipt's unallocated money to the client's open invoices. Always shows a preview of exactly
 * what will be written before anything is committed.
 */
export default function AllocationPanel({ receipt, onApplied }: { receipt: ReceiptDetail; onApplied: (receipt: ReceiptDetail, message: string) => void }) {
  const tenant = useTenant();
  const [strategy, setStrategy] = useState<AllocationStrategy>("fifo");
  const [position, setPosition] = useState<ClientPosition | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<AllocationOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());
  const needsManual = strategy === "manual" || strategy === "hybrid";

  useEffect(() => { api.clients.position(receipt.clientId).then(setPosition).catch((e) => setError(e.message)); }, [receipt.clientId, receipt.id, receipt.allocated.amountMinor]);
  // Any change to the plan invalidates the preview: what you applied must be what you saw.
  useEffect(() => { setPreview(null); idempotencyKey.current = newIdempotencyKey(); }, [strategy, manual, receipt.allocated.amountMinor]);

  function manualRequest() {
    const entries = Object.entries(manual).flatMap(([invoiceId, text]) => {
      if (!text.trim()) return [];
      const minor = tenant.parseMoney(text);
      return [{ invoiceId, amountMinor: minor ?? NaN }];
    });
    if (entries.some((e) => !Number.isFinite(e.amountMinor) || e.amountMinor <= 0)) throw new Error("Every manual amount must be a positive number.");
    return { strategy, manual: needsManual ? entries : undefined };
  }

  async function run(kind: "preview" | "apply") {
    setError(null);
    setBusy(true);
    try {
      const request = manualRequest();
      if (strategy === "manual" && !request.manual?.length) throw new Error("Enter at least one amount to allocate.");
      if (kind === "preview") setPreview(await api.receipts.previewAllocation(receipt.id, request));
      else {
        const outcome = await api.receipts.allocate(receipt.id, request, idempotencyKey.current);
        const applied = outcome.allocations.reduce((s, a) => s + a.amount.amountMinor, 0);
        onApplied(outcome.receipt, `Allocated ${tenant.money(applied)} across ${outcome.allocations.length} invoice${outcome.allocations.length === 1 ? "" : "s"}.`);
        setManual({});
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const current = STRATEGIES.find((s) => s.id === strategy)!;
  return (
    <section aria-label="Allocate this receipt" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Allocate unallocated money</h3>
          <p className="text-xs text-slate-500">{tenant.money(receipt.unallocated)} is held{receipt.holdingKind ? ` as ${receipt.holdingKind === "suspense" ? "suspense" : "client credit"}` : ""}.</p>
        </div>
        <Field label="Strategy">
          <select className={inputClass} value={strategy} onChange={(e) => setStrategy(e.target.value as AllocationStrategy)}>
            {STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-xs text-slate-500">{current.help}</p>
      <ErrorNotice message={error} onDismiss={() => setError(null)} />

      {needsManual && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-3 py-2 font-medium">Invoice</th><th scope="col" className="px-3 py-2 font-medium">Due</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Outstanding</th><th scope="col" className="px-3 py-2 font-medium">Allocate</th>
            </tr></thead>
            <tbody>
              {!position ? <tr><td colSpan={4} className="px-3 py-3 text-slate-400">Loading invoices…</td></tr>
                : position.invoices.length === 0 ? <tr><td colSpan={4} className="px-3 py-3 text-slate-400">This client has no open invoices.</td></tr>
                : position.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-800">{inv.invoiceNo}<span className="ml-2 text-xs text-slate-400">{inv.policyId ?? "fee"}</span></td>
                    <td className="px-3 py-2 text-slate-600">{tenant.day(inv.dueDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tenant.money(inv.outstanding)}</td>
                    <td className="px-3 py-2">
                      <input aria-label={`Amount for ${inv.invoiceNo}`} inputMode="decimal" className={`${inputClass} max-w-32`} placeholder="0.00"
                        value={manual[inv.id] ?? ""} onChange={(e) => setManual({ ...manual, [inv.id]: e.target.value })} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3" role="region" aria-label="Allocation preview">
          <p className="text-sm font-medium text-indigo-900">Preview — nothing has been saved yet</p>
          {preview.allocations.length === 0 ? <p className="text-sm text-slate-600">No invoice would be paid.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th scope="col" className="py-1 font-medium">Invoice</th><th scope="col" className="py-1 font-medium">Split</th><th scope="col" className="py-1 text-right font-medium">Amount</th></tr></thead>
              <tbody>
                {preview.allocations.map((a) => (
                  <tr key={a.invoiceId} className="border-t border-indigo-100">
                    <td className="py-1.5 font-medium text-slate-800">{a.invoiceNo ?? a.invoiceId}</td>
                    <td className="py-1.5 text-xs text-slate-500">{a.lines.map((l) => `${l.kind} ${tenant.money(l.amount)}`).join(" · ")}</td>
                    <td className="py-1.5 text-right tabular-nums">{tenant.money(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-slate-600">
            Left over: <span className="font-medium tabular-nums">{tenant.money(preview.remainder)}</span>
            {preview.remainder.amountMinor > 0 && ` — will be held as ${preview.holdingKind === "client_credit" ? "client credit (applied to the next invoice automatically)" : "suspense (staff must resolve it)"}`}
            . Still owed afterwards: <span className="font-medium tabular-nums">{tenant.money(preview.stillOutstanding)}</span>.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => run("preview")} className={secondaryButton}>Preview</button>
        <button type="button" disabled={busy || !preview || preview.allocations.length === 0} onClick={() => run("apply")} className={primaryButton}>
          {busy ? "Working…" : "Apply allocation"}
        </button>
      </div>
    </section>
  );
}
