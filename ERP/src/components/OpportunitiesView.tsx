import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import { OPPORTUNITY_STAGES, type Opportunity, type Party, type Producer } from "../types";
import SearchInput from "./SearchInput";
import Pagination from "./Pagination";
import { usePagedList } from "../usePagedList";

const EMPTY_FORM = { partyId: "", class: "", source: "", expectedPremiumKes: "", producerId: "" };

export default function OpportunitiesView() {
  const { rows: opportunities, setRows: setOpportunities, total, loading, error, setError, query, setQuery, debouncedQuery, page, setPage, totalPages, reload: load } =
    usePagedList<Opportunity>((request) => api.opportunities.page(request));
  const [parties, setParties] = useState<Party[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // The party and producer dropdowns are only needed by the new-opportunity
  // form, so they're fetched the first time it opens — not on every visit.
  useEffect(() => {
    if (!showForm || parties.length > 0) return;
    Promise.all([api.parties.list(), api.producers.list()])
      .then(([p, prod]) => { setParties(p); setProducers(prod); })
      .catch((err) => setError(err.message));
  }, [showForm]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.opportunities.create({
        partyId: form.partyId || undefined,
        class: form.class || undefined,
        source: form.source || undefined,
        expectedPremiumKes: form.expectedPremiumKes ? Number(form.expectedPremiumKes) : undefined,
        producerId: form.producerId || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(id: string, stage: string) {
    setOpportunities((prev) => prev.map((o) => (o.id === id ? { ...o, stage } : o)));
    try {
      await api.opportunities.update(id, { stage });
    } catch (err: any) {
      setError(err.message);
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Opportunities</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> New opportunity
        </button>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by party, class, source, producer, stage…" />

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
            <option value="">-- Party --</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
          <input placeholder="Class (motor, medical, …)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} />
          <input placeholder="Source" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <input placeholder="Expected premium (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.expectedPremiumKes} onChange={(e) => setForm({ ...form, expectedPremiumKes: e.target.value })} />
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.producerId} onChange={(e) => setForm({ ...form, producerId: e.target.value })}>
            <option value="">-- Producer (optional) --</option>
            {producers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving…" : "Create opportunity"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Party</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Class</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Expected premium</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Producer</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Stage</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : opportunities.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{debouncedQuery ? `No opportunities match "${debouncedQuery}".` : "No opportunities yet."}</td></tr>
            ) : (
              opportunities.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{o.partyName || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.class || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{o.expectedPremiumKes ? `KES ${o.expectedPremiumKes.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.source || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.producerName || "—"}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={o.stage}
                      onChange={(e) => handleStageChange(o.id, e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} totalItems={total} onChange={setPage} />
      </div>
    </div>
  );
}
