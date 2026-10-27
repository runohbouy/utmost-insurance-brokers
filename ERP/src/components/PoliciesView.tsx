import { Fragment, useEffect, useState } from "react";
import { Plus, Banknote } from "lucide-react";
import { api } from "../api";
import type { Policy, Party, Insurer } from "../types";
import StatusPill from "./StatusPill";
import SearchInput from "./SearchInput";
import Pagination from "./Pagination";
import { usePagedList } from "../usePagedList";

const EMPTY_POLICY_FORM = { clientId: "", insurerId: "", category: "motor", premiumAmount: "", endDate: "" };
const EMPTY_PREMIUM_FORM = { confirmedAmountKes: "", paymentReference: "", method: "mpesa" };

export default function PoliciesView({ onSelect, canRecordPremium }: { onSelect: (id: string) => void; canRecordPremium: boolean }) {
  const { rows: policies, total, loading, error, setError, query, setQuery, debouncedQuery, page, setPage, totalPages, reload: load } =
    usePagedList<Policy>((request) => api.policies.page(request));
  const [parties, setParties] = useState<Party[]>([]);
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_POLICY_FORM);
  const [saving, setSaving] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [premiumForm, setPremiumForm] = useState(EMPTY_PREMIUM_FORM);

  // The client and insurer dropdowns are only needed by the issue-policy
  // form, so they're fetched the first time it opens — not on every visit.
  useEffect(() => {
    if (!showForm || parties.length > 0) return;
    Promise.all([api.parties.list(), api.insurers.list()])
      .then(([pa, ins]) => { setParties(pa); setInsurers(ins); })
      .catch((err) => setError(err.message));
  }, [showForm]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.policies.create({
        clientId: form.clientId || undefined,
        insurerId: form.insurerId || undefined,
        category: form.category,
        premiumAmount: Number(form.premiumAmount),
        endDate: form.endDate,
      });
      setForm(EMPTY_POLICY_FORM);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPremium(policyId: string) {
    if (!premiumForm.confirmedAmountKes) return;
    setSaving(true);
    try {
      await api.premiumConfirmations.create({
        policyId,
        confirmedAmountKes: Number(premiumForm.confirmedAmountKes),
        paymentReference: premiumForm.paymentReference || undefined,
        method: premiumForm.method,
      });
      setRecordingId(null);
      setPremiumForm(EMPTY_PREMIUM_FORM);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Policies</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> Issue policy
        </button>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by policy #, client, category, insurer, status…" />

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">-- Client --</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.insurerId} onChange={(e) => setForm({ ...form, insurerId: e.target.value })}>
            <option value="">-- Insurer --</option>
            {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input required placeholder="Category (motor, medical, …)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input required placeholder="Premium (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.premiumAmount} onChange={(e) => setForm({ ...form, premiumAmount: e.target.value })} />
          <input required placeholder="Cover end date" type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Issuing…" : "Issue policy"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Insurer</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Premium</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Cover period</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">{debouncedQuery ? `No policies match "${debouncedQuery}".` : "No policies yet."}</td></tr>
            ) : (
              policies.map((p) => (
                <Fragment key={p.id}>
                  <tr onClick={() => onSelect(p.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{p.id}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.clientName || "—"}</td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{p.category}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.insurerName || p.insurerId || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {Number(p.premiumAmount).toLocaleString()}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{p.startDate} → {p.endDate}</td>
                    <td className="px-4 py-2.5"><StatusPill status={p.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {canRecordPremium && recordingId !== p.id && (
                        <button onClick={(e) => { e.stopPropagation(); setRecordingId(p.id); setPremiumForm({ ...EMPTY_PREMIUM_FORM, confirmedAmountKes: String(p.premiumAmount) }); }} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          <Banknote size={13} /> Record premium
                        </button>
                      )}
                    </td>
                  </tr>
                  {recordingId === p.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input placeholder="Amount confirmed (KES)" type="number" value={premiumForm.confirmedAmountKes} onChange={(e) => setPremiumForm({ ...premiumForm, confirmedAmountKes: e.target.value })} className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                          <select value={premiumForm.method} onChange={(e) => setPremiumForm({ ...premiumForm, method: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                            <option value="mpesa">M-Pesa</option>
                            <option value="bank">Bank</option>
                            <option value="card">Card</option>
                            <option value="cheque">Cheque</option>
                          </select>
                          <input placeholder="Payment reference" value={premiumForm.paymentReference} onChange={(e) => setPremiumForm({ ...premiumForm, paymentReference: e.target.value })} className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                          <button onClick={() => handleRecordPremium(p.id)} disabled={saving || !premiumForm.confirmedAmountKes} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40">
                            Confirm
                          </button>
                          <button onClick={() => setRecordingId(null)} className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} totalItems={total} onChange={setPage} />
      </div>
    </div>
  );
}
