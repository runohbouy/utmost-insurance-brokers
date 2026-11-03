import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { InvoiceDetail, InvoiceRow } from "../../financeTypes";
import { usePagedList } from "../../usePagedList";
import { ClientPicker, PolicyPicker, type PickedClient } from "../Picker";
import Pagination from "../Pagination";
import SearchInput from "../SearchInput";
import StatusPill from "../StatusPill";
import { Dialog, ErrorNotice, Field, ReasonDialog, SuccessNotice, inputClass, primaryButton, secondaryButton, dangerButton } from "../ui";
import { INVOICE_LABEL, INVOICE_TONE } from "./statusTone";

const STATES = [{ id: "", label: "All invoices" }, { id: "open", label: "Still owing" }, { id: "paid", label: "Paid" }] as const;

export default function InvoiceList({ canManage }: { canManage: boolean }) {
  const tenant = useTenant();
  const [state, setState] = useState<(typeof STATES)[number]["id"]>("");
  const list = usePagedList<InvoiceRow>((request) => api.invoices.page({ ...request, state }));
  const [showForm, setShowForm] = useState(false);
  const [open, setOpen] = useState<InvoiceDetail | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { list.setPage(0); list.reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [state]);

  async function show(id: string) {
    try { setOpen(await api.invoices.get(id)); } catch (err: any) { setError(err.message); }
  }
  async function doVoid(reason: string) {
    try {
      setOpen(await api.invoices.void(open!.id, reason));
      setVoiding(false);
      setNotice("Invoice voided.");
      list.reload();
    } catch (err: any) { setVoiding(false); setError(err.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={list.query} onChange={list.setQuery} placeholder="Search invoice no, policy, client…" />
          <select aria-label="Filter invoices" className={`${inputClass} w-auto`} value={state} onChange={(e) => setState(e.target.value as typeof state)}>
            {STATES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        {canManage && <button onClick={() => setShowForm((v) => !v)} className={`${primaryButton} flex items-center gap-1.5`}><Plus size={15} /> New invoice</button>}
      </div>

      <ErrorNotice message={error ?? list.error} onDismiss={() => { setError(null); list.setError(null); }} />
      <SuccessNotice message={notice} />
      {showForm && <NewInvoiceForm onCreated={(inv) => { setShowForm(false); setNotice(`${inv.invoiceNo} raised for ${tenant.money(inv.total)}.`); list.reload(); }} onCancel={() => setShowForm(false)} />}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th><th scope="col" className="px-4 py-2.5 font-medium">Client</th><th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Due</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Outstanding</th><th scope="col" className="px-4 py-2.5 font-medium">Status</th>
          </tr></thead>
          <tbody>
            {list.loading ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              : list.rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">{list.debouncedQuery ? `No invoices match "${list.debouncedQuery}".` : "No invoices yet."}</td></tr>
              : list.rows.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5"><button type="button" onClick={() => show(i.id)} className="font-medium text-indigo-700 hover:underline">{i.invoiceNo}</button></td>
                  <td className="px-4 py-2.5 text-slate-700">{i.clientName ?? i.clientId}</td>
                  <td className="px-4 py-2.5 text-slate-600">{i.policyId ?? <span className="text-slate-400">fee</span>}</td>
                  <td className="px-4 py-2.5 text-slate-600">{tenant.day(i.dueDate)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{tenant.money(i.total)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{tenant.money(i.outstanding)}</td>
                  <td className="px-4 py-2.5"><StatusPill status={INVOICE_LABEL[i.status]} tone={INVOICE_TONE[i.status]} /></td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={list.page} totalPages={list.totalPages} totalItems={list.total} onChange={list.setPage} />
      </div>

      {open && !voiding && (
        <Dialog title={`Invoice ${open.invoiceNo}`} onClose={() => setOpen(null)} footer={<>
          {canManage && open.status !== "void" && open.paid.amountMinor === 0 && <button type="button" className={dangerButton} onClick={() => setVoiding(true)}>Void invoice</button>}
          <button type="button" className={secondaryButton} onClick={() => setOpen(null)}>Close</button>
        </>}>
          <p className="text-slate-600">{open.clientName} · {open.policyId ?? "fee"} · issued {tenant.day(open.issueDate)}, due {tenant.day(open.dueDate)} <StatusPill status={INVOICE_LABEL[open.status]} tone={INVOICE_TONE[open.status]} /></p>
          <table className="w-full">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th scope="col" className="py-1 font-medium">Line</th><th scope="col" className="py-1 text-right font-medium">Amount</th><th scope="col" className="py-1 text-right font-medium">Paid</th><th scope="col" className="py-1 text-right font-medium">Owing</th></tr></thead>
            <tbody>
              {open.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100"><td className="py-1.5">{l.description}</td>
                  <td className="py-1.5 text-right tabular-nums">{tenant.money(l.amount)}</td><td className="py-1.5 text-right tabular-nums">{tenant.money(l.paid)}</td><td className="py-1.5 text-right tabular-nums">{tenant.money(l.outstanding)}</td></tr>
              ))}
              <tr className="font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right tabular-nums">{tenant.money(open.total)}</td><td className="py-1.5 text-right tabular-nums">{tenant.money(open.paid)}</td><td className="py-1.5 text-right tabular-nums">{tenant.money(open.outstanding)}</td></tr>
            </tbody>
          </table>
        </Dialog>
      )}
      {open && voiding && <ReasonDialog title={`Void ${open.invoiceNo}`} confirmLabel="Void invoice" requireReason danger intro="A voided invoice no longer counts as owed. Invoices with payments applied must have those reversed first." onClose={() => setVoiding(false)} onConfirm={doVoid} />}
    </div>
  );
}

function NewInvoiceForm({ onCreated, onCancel }: { onCreated: (i: InvoiceDetail) => void; onCancel: () => void }) {
  const tenant = useTenant();
  const [kind, setKind] = useState<"premium" | "fee">("premium");
  const [policy, setPolicy] = useState<PickedClient | null>(null);
  const [client, setClient] = useState<PickedClient | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inclusive = tenant.config?.tax.pricing === "inclusive";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const minor = amount.trim() ? tenant.parseMoney(amount) : undefined;
    if (minor === null) return setError("Enter the amount as a number, for example 1,250.50.");
    setSaving(true);
    try {
      onCreated(await api.invoices.create({
        kind, amountMinor: minor, dueDate: dueDate || undefined,
        ...(kind === "premium" ? { policyId: policy?.id } : { clientId: client?.id, description: description.trim() || undefined }),
      }));
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Raise an invoice">
      <h3 className="text-sm font-semibold text-slate-900">Raise an invoice</h3>
      <ErrorNotice message={error} onDismiss={() => setError(null)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "premium" | "fee")}>
            <option value="premium">Premium for a policy</option><option value="fee">Brokerage fee</option>
          </select>
        </Field>
        {kind === "premium" ? <PolicyPicker value={policy} onChange={setPolicy} required /> : <ClientPicker value={client} onChange={setClient} required />}
        <Field label={`Amount${tenant.currency ? ` (${tenant.currency})` : ""}`} hint={kind === "premium" ? `${inclusive ? "Gross, tax included" : "Net of tax; levies are added"}. Leave blank to use the policy's premium.` : undefined}>
          <input inputMode="decimal" required={kind === "fee"} className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Due date" hint={kind === "premium" ? "Blank uses the policy's premium due date" : "Blank means due today"}>
          <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        {kind === "fee" && <Field label="Description"><input className={inputClass} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></Field>}
      </div>
      <p className="text-xs text-slate-500">If the client already holds credit, it is applied to this invoice automatically.</p>
      <div className="flex gap-2"><button type="submit" disabled={saving} className={primaryButton}>{saving ? "Raising…" : "Raise invoice"}</button><button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button></div>
    </form>
  );
}
