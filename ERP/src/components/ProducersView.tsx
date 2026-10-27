import { Fragment, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import type { Producer, ProducerCommissionSplit } from "../types";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_FORM = {
  producerType: "agent", name: "", contactPerson: "", phoneNumber: "", email: "",
  kraPin: "", licenceNumber: "", commissionSplitPct: "", contractStartDate: new Date().toISOString().slice(0, 10),
  contractEndDate: "", targetPremiumKes: "", notes: "",
};
const EMPTY_EDIT = {
  commissionSplitPct: "", status: "active", contractStartDate: "", contractEndDate: "", targetPremiumKes: "", notes: "",
};

const TABS = [
  { id: "producers", label: "Producers" },
  { id: "splits", label: "Commission splits" },
] as const;

export default function ProducersView() {
  const [producers, setProducers] = useState<Producer[]>([]);
  const [splits, setSplits] = useState<ProducerCommissionSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("producers");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edit, setEdit] = useState(EMPTY_EDIT);
  const [query, setQuery] = useState("");
  const [producersPage, setProducersPage] = useState(0);
  const [splitsPage, setSplitsPage] = useState(0);

  function load() {
    setLoading(true);
    setInitialLoadFailed(false);
    Promise.all([api.producers.list(), api.producerCommissionSplits.list()])
      .then(([p, s]) => { setProducers(p); setSplits(s); })
      .catch((err) => { setError(err.message); setInitialLoadFailed(true); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const producerName = (id: string) => producers.find((p) => p.id === id)?.name || id;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.producers.create({
        producerType: form.producerType as Producer["producerType"],
        name: form.name,
        contactPerson: form.contactPerson || undefined,
        phoneNumber: form.phoneNumber || undefined,
        email: form.email || undefined,
        kraPin: form.kraPin || undefined,
        licenceNumber: form.licenceNumber || undefined,
        commissionSplitPct: form.commissionSplitPct ? Number(form.commissionSplitPct) : 0,
        contractStartDate: form.contractStartDate || undefined,
        contractEndDate: form.contractEndDate || undefined,
        targetPremiumKes: form.targetPremiumKes ? Number(form.targetPremiumKes) : undefined,
        notes: form.notes || undefined,
      });
      setProducers((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleExpand(producer: Producer) {
    if (expandedId === producer.id) {
      setExpandedId(null);
      return;
    }
    setEdit({
      commissionSplitPct: String(producer.commissionSplitPct),
      status: producer.status,
      contractStartDate: producer.contractStartDate || "",
      contractEndDate: producer.contractEndDate || "",
      targetPremiumKes: producer.targetPremiumKes != null ? String(producer.targetPremiumKes) : "",
      notes: producer.notes || "",
    });
    setExpandedId(producer.id);
  }

  async function handleUpdate(e: React.FormEvent, id: string) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.producers.update(id, {
        commissionSplitPct: edit.commissionSplitPct ? Number(edit.commissionSplitPct) : 0,
        status: edit.status as Producer["status"],
        contractStartDate: edit.contractStartDate || undefined,
        contractEndDate: edit.contractEndDate || undefined,
        targetPremiumKes: edit.targetPremiumKes ? Number(edit.targetPremiumKes) : undefined,
        notes: edit.notes || undefined,
      });
      setProducers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePay(split: ProducerCommissionSplit) {
    const paymentReference = prompt(`Payment reference for KES ${split.splitAmountKes.toLocaleString()} to ${producerName(split.producerId)} (optional):`) || undefined;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.producerCommissionSplits.pay(split.id, paymentReference);
      setSplits((prev) => prev.map((s) => (s.id === split.id ? updated : s)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (initialLoadFailed) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;

  const producersFiltered = producers.filter((p) => matchesQuery(query, p.name, p.producerType, p.status, p.licenceNumber));
  const splitsFiltered = splits.filter((s) => matchesQuery(query, producerName(s.producerId), s.policyId, s.status));
  const { pageItems: producersPageItems, totalPages: producersTotalPages, clampedPage: producersClampedPage } = usePagedSlice(producersFiltered, producersPage);
  const { pageItems: splitsPageItems, totalPages: splitsTotalPages, clampedPage: splitsClampedPage } = usePagedSlice(splitsFiltered, splitsPage);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Producers</h2>
      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder={tab === "producers" ? "Search by name, type, status, licence…" : "Search by producer, policy, status…"} />

      {tab === "producers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Agents and sub-brokers who introduce business, and the negotiated share of our commission they earn on it. Set a producer on an opportunity (Opportunities) or a policy to trace business back to them — the split is computed automatically once premium is confirmed.</p>
            <button onClick={() => setShowForm((v) => !v)} className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus size={15} /> New producer
            </button>
          </div>
          {showForm && (
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.producerType} onChange={(e) => setForm({ ...form, producerType: e.target.value })}>
                <option value="agent">Agent</option>
                <option value="sub_broker">Sub-broker</option>
              </select>
              <input required placeholder="Name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input placeholder="Contact person" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
              <input placeholder="Phone number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
              <input placeholder="Email" type="email" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input placeholder="KRA PIN" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.kraPin} onChange={(e) => setForm({ ...form, kraPin: e.target.value })} />
              <input placeholder="IRA licence number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.licenceNumber} onChange={(e) => setForm({ ...form, licenceNumber: e.target.value })} />
              <input required placeholder="Commission split %" type="number" step="0.01" min="0" max="100" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.commissionSplitPct} onChange={(e) => setForm({ ...form, commissionSplitPct: e.target.value })} />
              <input placeholder="Annual target premium (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.targetPremiumKes} onChange={(e) => setForm({ ...form, targetPremiumKes: e.target.value })} />
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Contract start
                <input type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900" value={form.contractStartDate} onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Contract end (optional)
                <input type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900" value={form.contractEndDate} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} />
              </label>
              <input placeholder="Notes" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Create producer"}
              </button>
            </form>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Split</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Premium YTD vs target</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {producersFiltered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{producers.length === 0 ? "No producers yet." : `No producers match "${query}".`}</td></tr>
                ) : (
                  producersPageItems.map((p) => {
                    const expanded = expandedId === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr onClick={() => toggleExpand(p)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                          <td className="px-4 py-2.5 capitalize text-slate-600">{p.producerType.replace("_", " ")}</td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-600">{p.commissionSplitPct}%</td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-600">
                            KES {p.premiumYtdKes.toLocaleString()}{p.targetPremiumKes ? ` / ${p.targetPremiumKes.toLocaleString()}` : ""}
                          </td>
                          <td className="px-4 py-2.5"><StatusPill status={p.status} tone={p.status === "active" ? "good" : "neutral"} /></td>
                          <td className="px-4 py-2.5 text-right text-xs text-indigo-600">{expanded ? "Hide" : "View"}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
                                <div>Contact: <span className="text-slate-700">{p.contactPerson || "—"}</span></div>
                                <div>Phone: <span className="text-slate-700">{p.phoneNumber || "—"}</span></div>
                                <div>Email: <span className="text-slate-700">{p.email || "—"}</span></div>
                                <div>Licence: <span className="text-slate-700">{p.licenceNumber || "—"}</span></div>
                              </div>
                              <form onSubmit={(e) => handleUpdate(e, p.id)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <input placeholder="Commission split %" type="number" step="0.01" min="0" max="100" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={edit.commissionSplitPct} onChange={(ev) => setEdit({ ...edit, commissionSplitPct: ev.target.value })} />
                                <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={edit.status} onChange={(ev) => setEdit({ ...edit, status: ev.target.value })}>
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                                <input type="date" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={edit.contractStartDate} onChange={(ev) => setEdit({ ...edit, contractStartDate: ev.target.value })} />
                                <input type="date" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={edit.contractEndDate} onChange={(ev) => setEdit({ ...edit, contractEndDate: ev.target.value })} />
                                <input placeholder="Annual target premium (KES)" type="number" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={edit.targetPremiumKes} onChange={(ev) => setEdit({ ...edit, targetPremiumKes: ev.target.value })} />
                                <input placeholder="Notes" className="rounded-md border border-slate-300 px-2 py-1 text-xs sm:col-span-2" value={edit.notes} onChange={(ev) => setEdit({ ...edit, notes: ev.target.value })} />
                                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                                  {saving ? "Saving…" : "Save changes"}
                                </button>
                              </form>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
            <Pagination page={producersClampedPage} totalPages={producersTotalPages} totalItems={producersFiltered.length} onChange={setProducersPage} />
          </div>
        </div>
      )}

      {tab === "splits" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Created automatically when premium is confirmed for a policy with a producer attached. Paying one posts a journal entry clearing Producer Commissions Payable against Bank &amp; Cash (Finance → General ledger).</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Producer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Commission</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Split</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Owed</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {splitsFiltered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">{splits.length === 0 ? "No commission splits yet." : `No splits match "${query}".`}</td></tr>
                ) : (
                  splitsPageItems.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{producerName(s.producerId)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{s.policyId}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {s.commissionAmountKes.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">{s.splitPct}%</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium text-slate-900">KES {s.splitAmountKes.toLocaleString()}</td>
                      <td className="px-4 py-2.5"><StatusPill status={s.status} tone={s.status === "paid" ? "good" : "warning"} /></td>
                      <td className="px-4 py-2.5 text-right">
                        {s.status === "pending" && (
                          <button onClick={() => handlePay(s)} className="text-xs font-medium text-indigo-600 hover:underline">Mark paid</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination page={splitsClampedPage} totalPages={splitsTotalPages} totalItems={splitsFiltered.length} onChange={setSplitsPage} />
          </div>
        </div>
      )}
    </div>
  );
}
